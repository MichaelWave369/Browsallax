const { PhiBrowserBridge } = require('../src/bridge');

function plannerSnapshot(statusEnvelope) {
  const planner = statusEnvelope?.payload?.planner?.planner || statusEnvelope?.payload?.planner || {};
  return {
    available: Boolean(planner.available),
    selectedModel: planner.selectedModel || null,
    configuredModel: planner.configuredModel || null,
    models: Array.isArray(planner.models) ? planner.models.map((row) => ({
      name: row.name || null,
      size: row.size || 0,
      parameterSize: row.parameterSize || null,
      family: row.family || null
    })) : [],
    error: planner.error || null
  };
}

async function main() {
  const bridge = await PhiBrowserBridge.connect();
  const status = await bridge.status({ refresh: true });
  const operator = status.payload?.operator || {};
  const tabs = operator.tabs || [];
  const tab = tabs.find((item) => item.active) || tabs[0];
  if (!tab) throw new Error('NO_BROWSALLAX_TAB_AVAILABLE');

  const planner = plannerSnapshot(status);
  if (!planner.available || !planner.selectedModel) {
    throw new Error('NO_LOCAL_PLANNER_AVAILABLE');
  }

  const recommendedModel = planner.selectedModel;
  const plannerRegistry = {
    schema: 'superphivessel.brain_registry.planner_hints.v1',
    registryVersion: 'diag-live-1',
    routerVersion: 'diag-live-1',
    routingMode: 'AUTO',
    role: 'utility',
    approvedModels: [recommendedModel],
    configuredModel: null,
    recommendedModel,
    candidates: [{ model: recommendedModel, score: 1 }]
  };

  process.stderr.write('[NASA registry acceptance] planner status\n');
  process.stderr.write(JSON.stringify({
    available: planner.available,
    recommendedModel,
    registryVersion: plannerRegistry.registryVersion,
    routerVersion: plannerRegistry.routerVersion
  }, null, 2) + '\n');

  const result = await bridge.runTask({
    tabId: tab.id,
    url: 'https://www.nasa.gov/news/',
    goal: [
      'Read the NASA News page and identify the title of the newest news article that is currently observable.',
      'Preserve the observed source URL.',
      'This is read-only information gathering.'
    ].join(' '),
    constraints: [
      'READ-ONLY information gathering only.',
      'Do not submit forms or alter any remote state.',
      'Use only currently observed page evidence.',
      'If the required evidence cannot be observed, finish failed and state what evidence is missing.'
    ],
    successCriteria: [
      'A newest observable NASA news article title is identified from page evidence.',
      'The observed NASA source URL is preserved.'
    ],
    plannerRegistry,
    maxSteps: 10,
    maxDurationMs: 120000
  }, {
    pollMs: 500,
    timeoutMs: 150000,
    stopOnHeld: true,
    onUpdate: (task) => {
      const diag = task.failureDiagnostics;
      const route = task.planner?.brainRegistryRoute || diag?.brainRegistryRoute || {};
      const suffix = [
        route.registryUsed == null ? null : `registry ${route.registryUsed ? 'YES' : 'NO'}`,
        route.selectionBasis ? `basis ${route.selectionBasis}` : null,
        route.selectedModel ? `model ${route.selectedModel}` : null,
        diag?.validationError ? `validation ${diag.validationError}` : null
      ].filter(Boolean).join(' · ');
      process.stderr.write(
        `[NASA registry acceptance] ${task.status} · step ${task.stepCount}${suffix ? ' · ' + suffix : ''}\n`
      );
    }
  });

  const task = result.payload?.task || {};
  const route = task.planner?.brainRegistryRoute || task.failureDiagnostics?.brainRegistryRoute || null;
  const acceptance = {
    complete: result.payload?.disposition === 'COMPLETE',
    registryPresent: Boolean(task.plannerRegistry),
    registryUsed: route?.registryUsed === true,
    selectionBasis: route?.selectionBasis || null,
    selectedModel: route?.selectedModel || null,
    expectedModel: recommendedModel,
    selectedModelMatches: route?.selectedModel === recommendedModel
  };

  process.stdout.write(JSON.stringify({
    schema: 'browsallax.direct-nasa-registry-acceptance.v1',
    planner,
    plannerRegistry,
    acceptance,
    result
  }, null, 2) + '\n');

  if (!acceptance.complete) process.exitCode = 2;
  else if (!acceptance.registryPresent || !acceptance.registryUsed || !acceptance.selectedModelMatches) process.exitCode = 3;
}

main().catch((error) => {
  process.stderr.write(JSON.stringify({
    ok: false,
    error: error?.code || error?.message || 'NASA_REGISTRY_ACCEPTANCE_ERROR',
    message: error?.message || null,
    body: error?.body || null
  }, null, 2) + '\n');
  process.exitCode = 1;
});
