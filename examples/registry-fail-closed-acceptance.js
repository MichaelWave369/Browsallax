const { PhiBrowserBridge } = require('../src/bridge');

async function main() {
  const bridge = await PhiBrowserBridge.connect();
  const status = await bridge.status({ refresh: true });
  const operator = status.payload?.operator || {};
  const tabs = operator.tabs || [];
  const tab = tabs.find((item) => item.active) || tabs[0];
  if (!tab) throw new Error('NO_BROWSALLAX_TAB_AVAILABLE');

  const planner = status.payload?.planner?.planner || status.payload?.planner || {};
  const installed = new Set(
    Array.isArray(planner.models)
      ? planner.models.map((row) => String(row?.name || '').trim()).filter(Boolean)
      : []
  );

  let missingModel = 'registry-missing-model:latest';
  while (installed.has(missingModel)) missingModel = 'registry-missing-model-x:' + missingModel;

  const plannerRegistry = {
    schema: 'superphivessel.brain_registry.planner_hints.v1',
    registryVersion: 'diag-fail-closed-1',
    routerVersion: 'diag-fail-closed-1',
    routingMode: 'AUTO',
    role: 'utility',
    approvedModels: [missingModel],
    configuredModel: null,
    recommendedModel: missingModel,
    candidates: [{ model: missingModel, score: 1 }]
  };

  process.stderr.write('[Registry fail-closed acceptance] expected missing model\n');
  process.stderr.write(JSON.stringify({ missingModel, installedCount: installed.size }, null, 2) + '\n');

  const result = await bridge.runTask({
    tabId: tab.id,
    url: 'https://www.nasa.gov/news/',
    goal: 'Read the NASA News page. This task is expected to fail closed before planning because the registry-approved model is intentionally not installed.',
    constraints: [
      'READ-ONLY information gathering only.',
      'Do not submit forms or alter any remote state.'
    ],
    plannerRegistry,
    maxSteps: 3,
    maxDurationMs: 60000
  }, {
    pollMs: 250,
    timeoutMs: 90000,
    stopOnHeld: true,
    onUpdate: (task) => {
      const route = task.failureDiagnostics?.brainRegistryRoute || task.planner?.brainRegistryRoute || {};
      const suffix = [
        route.registryUsed == null ? null : `registry ${route.registryUsed ? 'YES' : 'NO'}`,
        route.selectionBasis ? `basis ${route.selectionBasis}` : null,
        route.selectedModel ? `model ${route.selectedModel}` : null
      ].filter(Boolean).join(' · ');
      process.stderr.write(
        `[Registry fail-closed acceptance] ${task.status} · step ${task.stepCount}${suffix ? ' · ' + suffix : ''}\n`
      );
    }
  });

  const task = result.payload?.task || {};
  const diagnostics = task.failureDiagnostics || {};
  const route = diagnostics.brainRegistryRoute || task.planner?.brainRegistryRoute || null;

  const acceptance = {
    dispositionFailed: result.payload?.disposition === 'FAILED',
    stepCountZero: task.stepCount === 0,
    expectedError: task.error === 'NO_LOCAL_REGISTRY_APPROVED_PLANNER_MODEL',
    registryPresent: Boolean(task.plannerRegistry),
    registryUsed: route?.registryUsed === true,
    selectionBasis: route?.selectionBasis || null,
    selectedModel: route?.selectedModel || null,
    selectedModelIsNull: route?.selectedModel == null,
    noLegacyFallback: ![
      'LOCAL_FALLBACK_PREFERENCE',
      'LOCAL_SMALLEST_FALLBACK'
    ].includes(route?.selectionBasis || '')
  };

  process.stdout.write(JSON.stringify({
    schema: 'browsallax.registry-fail-closed-acceptance.v1',
    plannerRegistry,
    acceptance,
    result
  }, null, 2) + '\n');

  const pass = Object.entries(acceptance)
    .filter(([key]) => key !== 'selectionBasis' && key !== 'selectedModel')
    .every(([, value]) => value === true)
    && acceptance.selectionBasis === 'NO_LOCAL_REGISTRY_APPROVED_PLANNER_MODEL';

  if (!pass) process.exitCode = 3;
}

main().catch((error) => {
  process.stderr.write(JSON.stringify({
    ok: false,
    error: error?.code || error?.message || 'REGISTRY_FAIL_CLOSED_ACCEPTANCE_ERROR',
    message: error?.message || null,
    body: error?.body || null
  }, null, 2) + '\n');
  process.exitCode = 1;
});
