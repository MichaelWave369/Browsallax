const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PhiBrowserBridge,
  bridgeManifest,
  mapTaskDisposition
} = require('../src/bridge/phios-vessie');

function completeTask() {
  return {
    id: 'task-1',
    tabId: 1,
    status: 'COMPLETE',
    stepCount: 3,
    held: null,
    result: {
      summary: 'Acceptance passed.',
      verification: {
        pass: true,
        mode: 'DETERMINISTIC_ASSERTIONS',
        checks: [{ assertion: { kind: 'text_contains', value: 'READY' }, pass: true }]
      }
    },
    error: null,
    planner: { provider: 'OLLAMA_LOCAL', model: 'qwen3:4b' },
    updatedAt: '2026-09-25T00:00:00.000Z',
    finishedAt: '2026-09-25T00:00:01.000Z'
  };
}

test('bridge manifest cannot grant authority', () => {
  const manifest = bridgeManifest();
  assert.equal(manifest.authority.invariant, 'CAPABILITY != AUTHORITY');
  assert.equal(manifest.authority.bridgeCanGrantAuthority, false);
  assert.deepEqual(manifest.authority.hardHeld, ['SENSITIVE_ACTION']);
});

test('bridge performs governed starting navigation before task submission', async () => {
  const calls = [];
  const fakeClient = {
    navigate: async (tabId, url) => {
      calls.push(['navigate', tabId, url]);
      return { ok: true, receipt: { receipt_hash: 'nav' } };
    },
    createTask: async (spec) => {
      calls.push(['createTask', spec]);
      return { task: { ...completeTask(), status: 'QUEUED', result: null, stepCount: 0 } };
    }
  };

  const bridge = new PhiBrowserBridge(fakeClient);
  const envelope = await bridge.submitTask({
    tabId: 1,
    url: 'https://superphivessel.netlify.app/',
    goal: 'Run acceptance',
    acceptance: [{ kind: 'text_contains', value: 'Super Φ.Vessel' }]
  });

  assert.deepEqual(calls[0], ['navigate', 1, 'https://superphivessel.netlify.app/']);
  assert.equal(calls[1][0], 'createTask');
  assert.equal(Object.prototype.hasOwnProperty.call(calls[1][1], 'url'), false);
  assert.equal(envelope.payload.navigation.receipt.receipt_hash, 'nav');
  assert.equal(envelope.authority, 'BRIDGE_ONLY_NO_AUTHORITY_ESCALATION');
});

test('runTask returns deterministic verification and navigation provenance', async () => {
  const fakeClient = {
    navigate: async () => ({ ok: true, receipt: { receipt_hash: 'nav-run' } }),
    runTask: async (spec) => {
      assert.equal(Object.prototype.hasOwnProperty.call(spec, 'url'), false);
      return completeTask();
    }
  };

  const bridge = new PhiBrowserBridge(fakeClient);
  const envelope = await bridge.runTask({
    tabId: 1,
    url: 'https://superphivessel.netlify.app/',
    goal: 'Verify READY'
  });

  assert.equal(envelope.payload.disposition, 'COMPLETE');
  assert.equal(envelope.payload.navigation.receipt.receipt_hash, 'nav-run');
  assert.equal(envelope.payload.task.result.verificationMode, 'DETERMINISTIC_ASSERTIONS');
  assert.equal(envelope.payload.task.result.verified, true);
});

test('waitTask does not invent navigation provenance', async () => {
  const bridge = new PhiBrowserBridge({
    waitForTask: async () => completeTask()
  });

  const envelope = await bridge.waitTask('task-1');
  assert.equal(envelope.payload.disposition, 'COMPLETE');
  assert.equal(Object.prototype.hasOwnProperty.call(envelope.payload, 'navigation'), false);
});

test('task status maps to bridge disposition without upgrading failed verification', () => {
  assert.equal(mapTaskDisposition(completeTask()), 'COMPLETE');
  const failedVerification = completeTask();
  failedVerification.result.verification.pass = false;
  assert.equal(mapTaskDisposition(failedVerification), 'FAILED');
  assert.equal(mapTaskDisposition({ status: 'HELD' }), 'HELD');
  assert.equal(mapTaskDisposition({ status: 'RUNNING' }), 'IN_PROGRESS');
});


test('bridge preserves and normalizes Brain Registry planner hints across task submission', async () => {
  const calls = [];
  const fakeClient = {
    createTask: async (spec) => {
      calls.push(spec);
      return {
        task: {
          ...completeTask(),
          status: 'QUEUED',
          result: null,
          stepCount: 0,
          plannerRegistry: {
            schema: spec.plannerRegistry.schema,
            bridgeVersion: spec.plannerRegistry.bridgeVersion,
            registryVersion: spec.plannerRegistry.registryVersion,
            routerVersion: spec.plannerRegistry.routerVersion,
            routingMode: spec.plannerRegistry.routingMode,
            role: spec.plannerRegistry.role,
            recommendedModel: spec.plannerRegistry.recommendedModel,
            approvedPoolCount: spec.plannerRegistry.approvedModels.length,
            candidateCount: spec.plannerRegistry.candidates.length
          }
        }
      };
    }
  };

  const bridge = new PhiBrowserBridge(fakeClient);
  const envelope = await bridge.submitTask({
    tabId: 1,
    goal: 'Read NASA news',
    plannerRegistry: {
      schema: 'superphivessel.brain_registry.planner_hints.v1',
      registryVersion: '1.1',
      routerVersion: '1.2.0',
      routingMode: 'auto',
      role: 'utility',
      approvedModels: ['gemma3:12b'],
      recommendedModel: 'gemma3:12b',
      candidates: [{ model: 'gemma3:12b', score: 0.91 }]
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].plannerRegistry.bridgeVersion, 'PV-BOP-BRR-0.1');
  assert.equal(calls[0].plannerRegistry.routingMode, 'AUTO');
  assert.equal(calls[0].plannerRegistry.recommendedModel, 'gemma3:12b');
  assert.equal(envelope.payload.task.plannerRegistry.registryVersion, '1.1');
});

test('bridge exposes bounded planner failure provenance instead of replacing it with NONE', async () => {
  const failedTask = {
    ...completeTask(),
    status: 'FAILED',
    stepCount: 0,
    result: null,
    error: 'PLANNER_STRUCTURED_OUTPUT_FAILED',
    planner: null,
    plannerRegistry: {
      schema: 'superphivessel.brain_registry.planner_hints.v1',
      bridgeVersion: 'PV-BOP-BRR-0.1',
      registryVersion: '1.1',
      routerVersion: '1.2.0',
      routingMode: 'AUTO',
      role: 'utility',
      recommendedModel: 'gemma3:12b',
      approvedPoolCount: 1,
      candidateCount: 1
    },
    failureDiagnostics: {
      plannerVersion: 'PV-BOP-PLAN-0.5',
      provider: 'OLLAMA_LOCAL',
      model: 'gemma3:12b',
      attempts: 2,
      rawResponseChars: 321,
      rawResponseSha256: 'a'.repeat(64),
      validationError: 'PLANNER_INVALID_JSON',
      brainRegistryRoute: {
        version: 'PV-BOP-BRR-0.1',
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
  };

  const bridge = new PhiBrowserBridge({
    waitForTask: async () => failedTask
  });

  const envelope = await bridge.waitTask('task-1');
  assert.equal(envelope.payload.disposition, 'FAILED');
  assert.equal(envelope.payload.task.failureDiagnostics.provider, 'OLLAMA_LOCAL');
  assert.equal(envelope.payload.task.failureDiagnostics.model, 'gemma3:12b');
  assert.equal(
    envelope.payload.task.failureDiagnostics.brainRegistryRoute.selectionBasis,
    'REGISTRY_RECOMMENDED'
  );
});

test('bridge rejects an unrecognized planner registry schema instead of passing it through', async () => {
  const bridge = new PhiBrowserBridge({
    createTask: async () => {
      throw new Error('createTask should not be reached');
    }
  });

  await assert.rejects(
    () => bridge.submitTask({
      tabId: 1,
      goal: 'Read NASA news',
      plannerRegistry: { schema: 'evil.registry.v9' }
    }),
    /PLANNER_REGISTRY_HINT_SCHEMA_INVALID/
  );
});
