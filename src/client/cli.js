const { BrowsallaxOperatorClient } = require('./operator-client');
const { PhiBrowserBridge, bridgeManifest } = require('../bridge/phios-vessie');

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || 'help';
  const positionals = [];
  const flags = {};

  while (args.length) {
    const token = args.shift();
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const raw = token.slice(2);
    const eq = raw.indexOf('=');
    let key;
    let value;
    if (eq >= 0) {
      key = raw.slice(0, eq);
      value = raw.slice(eq + 1);
    } else {
      key = raw;
      if (args[0] && !args[0].startsWith('--')) value = args.shift();
      else value = true;
    }

    if (Object.prototype.hasOwnProperty.call(flags, key)) {
      flags[key] = Array.isArray(flags[key]) ? [...flags[key], value] : [flags[key], value];
    } else {
      flags[key] = value;
    }
  }

  return { command, positionals, flags };
}

function values(flags, key) {
  if (!Object.prototype.hasOwnProperty.call(flags, key)) return [];
  return Array.isArray(flags[key]) ? flags[key] : [flags[key]];
}

function numberFlag(flags, key, fallback = undefined) {
  if (!Object.prototype.hasOwnProperty.call(flags, key)) return fallback;
  const value = Number(flags[key]);
  if (!Number.isFinite(value)) throw new Error(`INVALID_NUMBER_FLAG_--${key}`);
  return value;
}

function requiredFlag(flags, key) {
  const value = flags[key];
  if (value === undefined || value === true || String(value).trim() === '') {
    throw new Error(`MISSING_REQUIRED_FLAG_--${key}`);
  }
  return String(value);
}

function acceptanceFromFlags(flags) {
  return [
    ...values(flags, 'accept-text').map((value) => ({ kind: 'text_contains', value: String(value) })),
    ...values(flags, 'accept-url').map((value) => ({ kind: 'url_contains', value: String(value) })),
    ...values(flags, 'accept-visible').map((selector) => ({ kind: 'visible', selector: String(selector) }))
  ];
}

function print(value, io = console) {
  io.log(JSON.stringify(value, null, 2));
}

function helpText() {
  return `Browsallax local Browser Operator

Commands:
  browsallax operator-status
  browsallax planner-status [--refresh]
  browsallax tabs
  browsallax observe --tab <id>
  browsallax screenshot --tab <id>
  browsallax bridge-manifest

  browsallax task --tab <id> --goal <text>
      [--url <https://...>]
      [--constraint <text>]...
      [--success <text>]...
      [--accept-text <text>]...
      [--accept-url <text>]...
      [--accept-visible <selector>]...
      [--max-steps <n>]
      [--max-duration-ms <n>]
      [--poll-ms <n>]
      [--wait-timeout-ms <n>]
      [--no-wait]

  browsallax task-status <task-id>
  browsallax task-wait <task-id> [--poll-ms <n>] [--wait-timeout-ms <n>]
  browsallax task-resume <task-id> [--wait]
  browsallax task-cancel <task-id> [--reason <text>]

Endpoint discovery:
  BROWSALLAX_ENDPOINT_FILE=<path>
  BROWSALLAX_USER_DATA=<path>

The CLI uses the same local-only token, authority rules, task engine,
and Reality Ledger receipts as PhiOS and Super PhiVessel.
`;
}

async function connect(options = {}) {
  const client = await BrowsallaxOperatorClient.connect(options);
  return { client, bridge: new PhiBrowserBridge(client) };
}

async function run(argv = process.argv.slice(2), { io = console, connectOptions = {} } = {}) {
  const { command, positionals, flags } = parseArgs(argv);

  if (command === 'help' || flags.help) {
    io.log(helpText());
    return { exitCode: 0 };
  }

  if (command === 'bridge-manifest') {
    print(bridgeManifest(), io);
    return { exitCode: 0 };
  }

  const { client, bridge } = await connect(connectOptions);

  if (command === 'operator-status') {
    print(await bridge.status(), io);
    return { exitCode: 0 };
  }

  if (command === 'planner-status') {
    print(await bridge.plannerStatus({ refresh: Boolean(flags.refresh) }), io);
    return { exitCode: 0 };
  }

  if (command === 'tabs') {
    const status = await client.status();
    print({ tabs: status.tabs || [], operator: client.descriptor() }, io);
    return { exitCode: 0 };
  }

  if (command === 'observe') {
    const tabId = numberFlag(flags, 'tab');
    if (!Number.isFinite(tabId)) throw new Error('MISSING_REQUIRED_FLAG_--tab');
    print(await bridge.observe(tabId), io);
    return { exitCode: 0 };
  }

  if (command === 'screenshot') {
    const tabId = numberFlag(flags, 'tab');
    if (!Number.isFinite(tabId)) throw new Error('MISSING_REQUIRED_FLAG_--tab');
    print(await bridge.screenshot(tabId), io);
    return { exitCode: 0 };
  }

  if (command === 'task') {
    const tabId = numberFlag(flags, 'tab');
    if (!Number.isFinite(tabId)) throw new Error('MISSING_REQUIRED_FLAG_--tab');
    const goal = requiredFlag(flags, 'goal');
    const spec = {
      tabId,
      url: flags.url === undefined || flags.url === true ? undefined : String(flags.url),
      goal,
      constraints: values(flags, 'constraint').map(String),
      successCriteria: values(flags, 'success').map(String),
      acceptance: acceptanceFromFlags(flags),
      maxSteps: numberFlag(flags, 'max-steps'),
      maxDurationMs: numberFlag(flags, 'max-duration-ms')
    };
    Object.keys(spec).forEach((key) => spec[key] === undefined && delete spec[key]);

    if (flags['no-wait']) {
      print(await bridge.submitTask(spec), io);
      return { exitCode: 0 };
    }

    print(await bridge.runTask(spec, {
      pollMs: numberFlag(flags, 'poll-ms', 500),
      timeoutMs: numberFlag(flags, 'wait-timeout-ms', 5 * 60 * 1000),
      stopOnHeld: true
    }), io);
    return { exitCode: 0 };
  }

  if (command === 'task-status') {
    const id = positionals[0];
    if (!id) throw new Error('TASK_ID_REQUIRED');
    const response = await client.getTask(id);
    print(response, io);
    return { exitCode: 0 };
  }

  if (command === 'task-wait') {
    const id = positionals[0];
    if (!id) throw new Error('TASK_ID_REQUIRED');
    print(await bridge.waitTask(id, {
      pollMs: numberFlag(flags, 'poll-ms', 500),
      timeoutMs: numberFlag(flags, 'wait-timeout-ms', 5 * 60 * 1000),
      stopOnHeld: true
    }), io);
    return { exitCode: 0 };
  }

  if (command === 'task-resume') {
    const id = positionals[0];
    if (!id) throw new Error('TASK_ID_REQUIRED');
    const resumed = await bridge.resumeTask(id);
    if (!flags.wait) {
      print(resumed, io);
      return { exitCode: 0 };
    }
    print(await bridge.waitTask(id, {
      pollMs: numberFlag(flags, 'poll-ms', 500),
      timeoutMs: numberFlag(flags, 'wait-timeout-ms', 5 * 60 * 1000),
      stopOnHeld: true
    }), io);
    return { exitCode: 0 };
  }

  if (command === 'task-cancel') {
    const id = positionals[0];
    if (!id) throw new Error('TASK_ID_REQUIRED');
    const reason = flags.reason === true || flags.reason === undefined
      ? 'CLI_CANCELLED'
      : String(flags.reason);
    print(await bridge.cancelTask(id, reason), io);
    return { exitCode: 0 };
  }

  throw new Error(`UNKNOWN_COMMAND_${command}`);
}

async function main() {
  try {
    const result = await run();
    process.exitCode = result?.exitCode ?? 0;
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error?.code || error?.message || 'CLI_ERROR',
      status: error?.status || null
    }, null, 2));
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  values,
  numberFlag,
  requiredFlag,
  acceptanceFromFlags,
  helpText,
  run,
  main
};
