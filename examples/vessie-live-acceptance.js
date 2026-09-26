const { PhiBrowserBridge } = require('../src/bridge');

async function main() {
  const bridge = await PhiBrowserBridge.connect();

  const status = await bridge.status();
  const tabs = status.payload.operator.tabs || [];
  const tab = tabs.find((item) => item.active) || tabs[0];

  if (!tab) throw new Error('NO_BROWSALLAX_TAB_AVAILABLE');

  const result = await bridge.runTask({
    tabId: tab.id,
    url: 'https://superphivessel.netlify.app/',
    goal: [
      'Inspect the live Super PhiVessel deployment.',
      'Confirm the application loads successfully.',
      'Do not alter provider settings, memory, ledger state, or other persistent configuration.',
      'Do not submit destructive or sensitive actions.'
    ].join(' '),
    constraints: [
      'Read-only inspection unless a normal interaction is genuinely required.',
      'Do not delete or clear anything.',
      'Do not change provider, model, memory, or governance settings.',
      'Do not enter credentials or sensitive data.'
    ],
    successCriteria: [
      'The live page identifies itself as Super Φ.Vessel.'
    ],
    acceptance: [
      {
        kind: 'text_contains',
        value: 'Super Φ.Vessel'
      }
    ],
    maxSteps: 12,
    maxDurationMs: 120000
  }, {
    pollMs: 500,
    timeoutMs: 150000,
    stopOnHeld: true,
    onUpdate: (task) => {
      process.stderr.write(
        `[Vessie acceptance] ${task.status} · step ${task.stepCount}\n`
      );
    }
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result.payload.disposition !== 'COMPLETE') {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: error?.code || error?.message || 'VESSIE_ACCEPTANCE_ERROR'
  }, null, 2)}\n`);
  process.exitCode = 1;
});
