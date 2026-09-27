const test = require('node:test');
const assert = require('node:assert/strict');
const { BrowserTaskEngine } = require('../src/operator/task-engine');

function ledger() {
  const receipts = [];
  return {
    receipts,
    append: async (kind, data) => {
      receipts.push({ kind, data });
      return { kind, data, receipt_hash: String(receipts.length).padStart(64, '0') };
    }
  };
}

async function waitFor(engine, id, predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = engine.get(id);
    if (task && predicate(task)) return task;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('task state timeout');
}

test('task engine performs observe-plan-act-verify until complete', async () => {
  const plans = [
    { thoughtSummary: 'Navigate.', action: { type: 'navigate', url: 'https://example.test/app' }, successEvidence: '', planner: { model: 'test' } },
    { thoughtSummary: 'Verify.', action: { type: 'assert', assertion: { kind: 'text_contains', value: 'READY' } }, successEvidence: 'READY', planner: { model: 'test' } },
    { thoughtSummary: 'Done.', action: { type: 'finish', status: 'complete', summary: 'Acceptance passed.' }, successEvidence: 'READY', planner: { model: 'test' } }
  ];
  const log = ledger();
  const engine = new BrowserTaskEngine({
    planner: { plan: async () => plans.shift() },
    ledger: log,
    observe: async () => ({ url: 'https://example.test/', title: 'Example', text: 'READY', elements: [] }),
    navigate: async () => ({ ok: true, actionClass: 'NAVIGATION', authority: { basis: 'BASELINE_LOCAL_OPERATOR' } }),
    executeAction: async () => ({ ok: true }),
    assert: async () => ({ ok: true, pass: true }),
    getGrant: () => null
  });

  const created = await engine.create({
    tabId: 1,
    goal: 'Run acceptance',
    successCriteria: ['READY is present'],
    maxSteps: 6
  });
  const complete = await waitFor(engine, created.id, (task) => task.status === 'COMPLETE');

  assert.equal(complete.result.summary, 'Acceptance passed.');
  assert.equal(complete.stepCount, 3);
  assert.ok(log.receipts.some((receipt) => receipt.kind === 'TASK_COMPLETE'));
});

test('task pauses on authority hold and resumes only after human grant', async () => {
  let grant = null;
  let allowed = false;
  const plans = [
    { thoughtSummary: 'Open panel.', action: { type: 'click', selector: '#open' }, successEvidence: '', planner: { model: 'test' } },
    { thoughtSummary: 'Open panel.', action: { type: 'click', selector: '#open' }, successEvidence: '', planner: { model: 'test' } },
    { thoughtSummary: 'Done.', action: { type: 'finish', status: 'complete', summary: 'Panel opened.' }, successEvidence: '', planner: { model: 'test' } }
  ];
  const log = ledger();
  const engine = new BrowserTaskEngine({
    planner: { plan: async () => plans.shift() },
    ledger: log,
    observe: async () => ({ url: 'https://example.test/', title: 'Example', text: '', elements: [] }),
    navigate: async () => ({ ok: true }),
    executeAction: async () => {
      if (!allowed) {
        return {
          ok: false,
          status: 'HELD',
          actionClass: 'REMOTE_MUTATION',
          authority: { basis: 'CAPABILITY_WITHOUT_AUTHORITY', reason: 'human grant required' }
        };
      }
      return { ok: true, actionClass: 'REMOTE_MUTATION', authority: { basis: 'HUMAN_INTERACTIVE_GRANT' } };
    },
    assert: async () => ({ ok: true, pass: true }),
    getGrant: () => grant
  });

  const created = await engine.create({ tabId: 2, goal: 'Open the panel', maxSteps: 6 });
  const held = await waitFor(engine, created.id, (task) => task.status === 'HELD');
  assert.equal(held.held.actionClass, 'REMOTE_MUTATION');

  await assert.rejects(() => engine.resume(created.id), /HUMAN_INTERACTIVE_GRANT_REQUIRED/);

  grant = { enabled: true, id: 'g1', expiresAt: Date.now() + 60_000 };
  allowed = true;
  await engine.resume(created.id);
  const complete = await waitFor(engine, created.id, (task) => task.status === 'COMPLETE');

  assert.equal(complete.result.summary, 'Panel opened.');
  assert.ok(log.receipts.some((receipt) => receipt.kind === 'TASK_HELD'));
  assert.ok(log.receipts.some((receipt) => receipt.kind === 'TASK_RESUMED'));
});

test('held task retains exclusive ownership of its tab', async () => {
  const engine = new BrowserTaskEngine({
    planner: {
      plan: async () => ({
        thoughtSummary: 'Need mutation.',
        action: { type: 'click', selector: '#open' },
        successEvidence: '',
        planner: { model: 'test' }
      })
    },
    ledger: ledger(),
    observe: async () => ({ url: 'https://example.test/', title: 'Example', text: '', elements: [] }),
    navigate: async () => ({ ok: true }),
    executeAction: async () => ({
      ok: false,
      status: 'HELD',
      actionClass: 'REMOTE_MUTATION',
      authority: { reason: 'grant required' }
    }),
    assert: async () => ({ ok: true }),
    getGrant: () => null
  });

  const first = await engine.create({ tabId: 3, goal: 'First task' });
  await waitFor(engine, first.id, (task) => task.status === 'HELD');

  await assert.rejects(
    () => engine.create({ tabId: 3, goal: 'Second task' }),
    /TASK_ALREADY_RUNNING_ON_TAB/
  );
});

test('planner cannot self-certify completion when deterministic acceptance fails', async () => {
  let checks = 0;
  const log = ledger();
  const engine = new BrowserTaskEngine({
    planner: {
      plan: async () => ({
        thoughtSummary: 'I think the task is complete.',
        action: { type: 'finish', status: 'complete', summary: 'Done.' },
        successEvidence: 'planner claim',
        planner: { model: 'test' }
      })
    },
    ledger: log,
    observe: async () => ({ url: 'https://example.test/', title: 'Example', text: '', elements: [] }),
    navigate: async () => ({ ok: true }),
    executeAction: async () => ({ ok: true }),
    assert: async () => {
      checks += 1;
      return checks === 1
        ? { ok: false, pass: false, actual: 'NOT_READY' }
        : { ok: true, pass: true, actual: 'READY' };
    },
    getGrant: () => null
  });

  const created = await engine.create({
    tabId: 4,
    goal: 'Wait until READY',
    acceptance: [{ kind: 'text_contains', value: 'READY' }],
    maxSteps: 4
  });
  const complete = await waitFor(engine, created.id, (task) => task.status === 'COMPLETE');

  assert.equal(complete.stepCount, 2);
  assert.equal(complete.result.verification.mode, 'DETERMINISTIC_ASSERTIONS');
  assert.equal(complete.result.verification.pass, true);
  assert.ok(log.receipts.some((receipt) => receipt.kind === 'TASK_ACCEPTANCE_FAILED'));
  assert.ok(log.receipts.some((receipt) => receipt.kind === 'TASK_COMPLETE'));
});


test('task engine preserves bounded planner failure diagnostics without exposing raw response data', async () => {
  const log = ledger();
  const plannerError = Object.assign(new Error('PLANNER_STRUCTURED_OUTPUT_FAILED'), {
    code: 'PLANNER_STRUCTURED_OUTPUT_FAILED',
    diagnostics: {
      plannerVersion: 'PV-BOP-PLAN-0.5',
      provider: 'OLLAMA_LOCAL',
      model: 'gemma3:12b',
      attempts: 2,
      rawResponseChars: 321,
      rawResponseSha256: 'a'.repeat(64),
      validationError: 'PLANNER_INVALID_JSON',
      rawResponse: 'SECRET_MUST_NOT_ESCAPE',
      brainRegistryRoute: {
        version: 'PV-BOP-BRR-0.1',
        schema: 'superphivessel.brain_registry.planner_hints.v1',
        registryUsed: true,
        selectionBasis: 'REGISTRY_RECOMMENDED',
        selectedModel: 'gemma3:12b',
        registryVersion: '1.1',
        routerVersion: '1.2.0',
        routingMode: 'AUTO',
        role: 'utility',
        approvedPoolCount: 1,
        candidateCount: 1
      },
      readOnlyResearch: {
        version: 'PV-BOP-RRC-0.1',
        mode: 'NORMAL',
        stepCount: 0
      }
    }
  });

  const engine = new BrowserTaskEngine({
    planner: { plan: async () => { throw plannerError; } },
    ledger: log,
    observe: async () => ({ url: 'https://www.nasa.gov/news/', title: 'NASA', text: '', elements: [] }),
    navigate: async () => ({ ok: true }),
    executeAction: async () => ({ ok: true }),
    assert: async () => ({ ok: true }),
    getGrant: () => null
  });

  const created = await engine.create({
    tabId: 5,
    goal: 'Read NASA news',
    plannerRegistry: {
      schema: 'superphivessel.brain_registry.planner_hints.v1',
      registryVersion: '1.1',
      routerVersion: '1.2.0',
      routingMode: 'AUTO',
      role: 'utility',
      approvedModels: ['gemma3:12b'],
      recommendedModel: 'gemma3:12b',
      candidates: [{ model: 'gemma3:12b', score: 0.91 }]
    }
  });

  const failed = await waitFor(engine, created.id, (task) => task.status === 'FAILED');
  assert.equal(failed.stepCount, 0);
  assert.equal(failed.error, 'PLANNER_STRUCTURED_OUTPUT_FAILED');
  assert.equal(failed.failureDiagnostics.provider, 'OLLAMA_LOCAL');
  assert.equal(failed.failureDiagnostics.model, 'gemma3:12b');
  assert.equal(failed.failureDiagnostics.validationError, 'PLANNER_INVALID_JSON');
  assert.equal(failed.failureDiagnostics.brainRegistryRoute.registryUsed, true);
  assert.equal(failed.failureDiagnostics.brainRegistryRoute.selectionBasis, 'REGISTRY_RECOMMENDED');
  assert.equal(failed.plannerRegistry.registryVersion, '1.1');
  assert.doesNotMatch(JSON.stringify(failed), /SECRET_MUST_NOT_ESCAPE/);

  const failureReceipt = log.receipts.find((receipt) => receipt.kind === 'TASK_FAILED');
  assert.equal(failureReceipt.data.failureDiagnostics.model, 'gemma3:12b');
  assert.doesNotMatch(JSON.stringify(failureReceipt), /SECRET_MUST_NOT_ESCAPE/);
});


test('initial deterministic acceptance can complete before planner dispatch when explicitly enabled', async () => {
  let plannerCalls = 0;
  const log = ledger();
  const engine = new BrowserTaskEngine({
    planner: {
      plan: async () => {
        plannerCalls += 1;
        throw new Error('PLANNER_SHOULD_NOT_RUN');
      }
    },
    ledger: log,
    observe: async () => ({ url: 'https://example.test/', title: 'Example', text: 'READY', elements: [] }),
    navigate: async () => ({ ok: true }),
    executeAction: async () => ({ ok: true }),
    assert: async (_tabId, assertion) => ({
      ok: true,
      pass: assertion.kind === 'text_contains' && assertion.value === 'READY',
      actual: 'READY'
    }),
    getGrant: () => null
  });

  const created = await engine.create({
    tabId: 6,
    goal: 'Verify the already-loaded page identifies itself',
    acceptance: [{ kind: 'text_contains', value: 'READY' }],
    completeOnInitialAcceptance: true,
    maxSteps: 12
  });
  const complete = await waitFor(engine, created.id, (task) => task.status === 'COMPLETE');

  assert.equal(complete.stepCount, 0);
  assert.equal(complete.planner, null);
  assert.equal(plannerCalls, 0);
  assert.equal(complete.completeOnInitialAcceptance, true);
  assert.equal(complete.result.verification.mode, 'DETERMINISTIC_ASSERTIONS');
  assert.equal(complete.result.verification.pass, true);
  assert.ok(log.receipts.some((receipt) => receipt.kind === 'TASK_INITIAL_ACCEPTANCE_CHECK'));
  assert.ok(log.receipts.some((receipt) => receipt.kind === 'TASK_COMPLETE'));
});

test('initial deterministic acceptance short-circuit is opt-in', async () => {
  let plannerCalls = 0;
  const engine = new BrowserTaskEngine({
    planner: {
      plan: async () => {
        plannerCalls += 1;
        return {
          thoughtSummary: 'Finish normally.',
          action: { type: 'finish', status: 'complete', summary: 'Planner completed.' },
          successEvidence: 'READY',
          planner: { model: 'test' }
        };
      }
    },
    ledger: ledger(),
    observe: async () => ({ url: 'https://example.test/', title: 'Example', text: 'READY', elements: [] }),
    navigate: async () => ({ ok: true }),
    executeAction: async () => ({ ok: true }),
    assert: async () => ({ ok: true, pass: true, actual: 'READY' }),
    getGrant: () => null
  });

  const created = await engine.create({
    tabId: 7,
    goal: 'Use the normal planner path',
    acceptance: [{ kind: 'text_contains', value: 'READY' }],
    maxSteps: 4
  });
  const complete = await waitFor(engine, created.id, (task) => task.status === 'COMPLETE');

  assert.equal(complete.stepCount, 1);
  assert.equal(plannerCalls, 1);
  assert.equal(complete.completeOnInitialAcceptance, false);
});


test('initial deterministic acceptance waits briefly for SPA hydration before planner dispatch', async () => {
  let plannerCalls = 0;
  let assertionCalls = 0;
  const log = ledger();
  const engine = new BrowserTaskEngine({
    planner: {
      plan: async () => {
        plannerCalls += 1;
        throw new Error('PLANNER_SHOULD_NOT_RUN');
      }
    },
    ledger: log,
    observe: async () => ({ url: 'https://example.test/', title: 'Example', text: 'READY', elements: [] }),
    navigate: async () => ({ ok: true }),
    executeAction: async () => ({ ok: true }),
    assert: async () => {
      assertionCalls += 1;
      return assertionCalls < 3
        ? { ok: true, pass: false, actual: '' }
        : { ok: true, pass: true, actual: 'READY' };
    },
    getGrant: () => null,
    initialAcceptanceWindowMs: 100,
    initialAcceptancePollMs: 5
  });

  const created = await engine.create({
    tabId: 8,
    goal: 'Verify hydrated SPA identity',
    acceptance: [{ kind: 'text_contains', value: 'READY' }],
    completeOnInitialAcceptance: true,
    maxSteps: 12
  });
  const complete = await waitFor(engine, created.id, (task) => task.status === 'COMPLETE');

  assert.equal(complete.stepCount, 0);
  assert.equal(complete.planner, null);
  assert.equal(plannerCalls, 0);
  assert.equal(assertionCalls, 3);

  const receipt = log.receipts.find((item) => item.kind === 'TASK_INITIAL_ACCEPTANCE_CHECK');
  assert.equal(receipt.data.attempts, 3);
  assert.equal(receipt.data.verification.pass, true);
});

test('initial acceptance hydration window falls through to planner after bounded timeout', async () => {
  let plannerCalls = 0;
  let assertionCalls = 0;
  const log = ledger();
  const engine = new BrowserTaskEngine({
    planner: {
      plan: async () => {
        plannerCalls += 1;
        return {
          thoughtSummary: 'Proceed after deterministic preflight timeout.',
          action: { type: 'finish', status: 'complete', summary: 'Planner completed.' },
          successEvidence: 'READY',
          planner: { model: 'test' }
        };
      }
    },
    ledger: log,
    observe: async () => ({ url: 'https://example.test/', title: 'Example', text: 'READY', elements: [] }),
    navigate: async () => ({ ok: true }),
    executeAction: async () => ({ ok: true }),
    assert: async () => {
      assertionCalls += 1;
      return plannerCalls > 0
        ? { ok: true, pass: true, actual: 'READY' }
        : { ok: true, pass: false, actual: '' };
    },
    getGrant: () => null,
    initialAcceptanceWindowMs: 20,
    initialAcceptancePollMs: 5
  });

  const created = await engine.create({
    tabId: 9,
    goal: 'Fall through after bounded hydration wait',
    acceptance: [{ kind: 'text_contains', value: 'READY' }],
    completeOnInitialAcceptance: true,
    maxSteps: 4
  });
  const complete = await waitFor(engine, created.id, (task) => task.status === 'COMPLETE');

  assert.equal(complete.stepCount, 1);
  assert.equal(plannerCalls, 1);
  assert.ok(assertionCalls >= 2);

  const receipt = log.receipts.find((item) => item.kind === 'TASK_INITIAL_ACCEPTANCE_CHECK');
  assert.equal(receipt.data.verification.pass, false);
  assert.equal(receipt.data.windowMs, 20);
});
