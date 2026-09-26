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
  process.stderr.write('[NASA direct acceptance] planner status\n');
  process.stderr.write(JSON.stringify(planner, null, 2) + '\n');

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
    maxSteps: 10,
    maxDurationMs: 120000
  }, {
    pollMs: 500,
    timeoutMs: 150000,
    stopOnHeld: true,
    onUpdate: (task) => {
      const diag = task.failureDiagnostics;
      const suffix = diag
        ? ` · provider ${diag.provider || 'NONE'} · model ${diag.model || 'NONE'} · validation ${diag.validationError || 'NONE'}`
        : '';
      process.stderr.write(
        `[NASA direct acceptance] ${task.status} · step ${task.stepCount}${suffix}\n`
      );
    }
  });

  process.stdout.write(JSON.stringify({
    schema: 'browsallax.direct-nasa-acceptance.v1',
    planner,
    result
  }, null, 2) + '\n');

  if (result.payload?.disposition !== 'COMPLETE') process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(JSON.stringify({
    ok: false,
    error: error?.code || error?.message || 'NASA_DIRECT_ACCEPTANCE_ERROR',
    message: error?.message || null,
    body: error?.body || null
  }, null, 2) + '\n');
  process.exitCode = 1;
});
