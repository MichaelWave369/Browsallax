# Browsallax Browser Operator v0.3

`PV-BRIDGE-0.1` packages the merged Browser Operator v0.2 task engine for direct use by PhiOS, Super PhiVessel, local tooling, and humans.

The Browser Operator transport remains `PV-BOP-0.2`.

The bridge does not add authority. It adds a stable client surface around the local Operator API.

> CAPABILITY != AUTHORITY

## Architecture

```text
PhiOS / Super PhiVessel / CLI
             ↓
      PV-BRIDGE-0.1
             ↓
   PV-BOP-CLIENT-0.1
             ↓
 endpoint.json discovery
             ↓
      PV-BOP-0.2
             ↓
     Browsallax Desktop
             ↓
 local Ollama task planner
             ↓
 governed browser actions
             ↓
 Reality Ledger receipts
```

## Endpoint discovery

A running Browsallax Desktop instance writes:

```text
<user-data>/operator/endpoint.json
```

The bridge discovers this descriptor automatically.

Explicit overrides are available:

```text
BROWSALLAX_ENDPOINT_FILE=<path-to-endpoint.json>
BROWSALLAX_USER_DATA=<Browsallax-user-data-directory>
```

The client validates that the endpoint host is loopback-only. A descriptor that points to a remote host is rejected.

The descriptor bearer token is used internally for local API authentication and is never returned by the normal client descriptor, bridge status envelope, or CLI status surface.

## Package surfaces

The project exposes:

```js
const client = require('browsallax/client');
const bridge = require('browsallax/bridge');
```

The primary bridge class is:

```js
const { PhiBrowserBridge } = require('browsallax/bridge');

const browser = await PhiBrowserBridge.connect();
```

## Bridge manifest

```js
browser.manifest()
```

returns a machine-readable capability manifest containing:

- bridge version
- client version
- capability name
- authority invariant
- baseline action classes
- human-grant action classes
- hard-held action classes
- task states
- supported verification modes
- available bridge methods

The manifest explicitly declares:

```text
bridgeCanGrantAuthority = false
```

## Bridge receipts

Bridge calls return envelopes shaped like:

```json
{
  "schema": "browsallax.phios-vessie-bridge.receipt.v1",
  "bridgeVersion": "PV-BRIDGE-0.1",
  "bridgeReceiptId": "...",
  "kind": "TASK_RESULT",
  "timestamp": "...",
  "authority": "BRIDGE_ONLY_NO_AUTHORITY_ESCALATION",
  "taskId": "...",
  "tabId": 1,
  "payload": {}
}
```

The bridge receipt describes handoff state. Browser actions and task execution remain governed and receipted by the Browser Operator Reality Ledger.

## Starting URL

Bridge tasks can optionally include a starting URL:

```js
await browser.runTask({
  tabId: 1,
  url: 'https://superphivessel.netlify.app/',
  goal: 'Verify the live deployment is healthy.',
  constraints: [
    'Do not delete data.',
    'Do not alter provider settings.'
  ],
  acceptance: [
    {
      kind: 'text_contains',
      value: 'Super Φ.Vessel'
    }
  ]
});
```

The bridge performs the initial navigation through the existing Operator navigation endpoint, preserves that navigation receipt, removes the bridge-only `url` field, and then submits the normal v0.2 task.

No transport privilege is added.

## Task dispositions

The bridge normalizes task state into:

- `IN_PROGRESS`
- `HELD`
- `COMPLETE`
- `FAILED`
- `CANCELLED`
- `UNKNOWN`

A task with `status=COMPLETE` but an explicitly failed deterministic verification is surfaced as `FAILED`, not upgraded to success.

## CLI

The same bridge is available through the local CLI.

After installing dependencies:

```bash
npm run operator -- operator-status
npm run operator -- planner-status
npm run operator -- tabs
```

With an installed package or `npm link`:

```bash
browsallax operator-status
browsallax tabs
```

### Submit and wait for a task

```bash
browsallax task \
  --tab 1 \
  --url https://superphivessel.netlify.app/ \
  --goal "Verify the live Super PhiVessel deployment" \
  --constraint "Do not delete or clear anything" \
  --constraint "Do not alter provider settings" \
  --accept-text "Super Φ.Vessel"
```

The command waits until:

- `COMPLETE`
- `FAILED`
- `CANCELLED`
- or `HELD`

If a normal page mutation is needed and no human interactive grant exists, the task returns `HELD`.

After granting interaction in Browsallax chrome:

```bash
browsallax task-resume <task-id> --wait
```

Sensitive actions remain hard-held.

### Other commands

```text
browsallax bridge-manifest
browsallax observe --tab <id>
browsallax screenshot --tab <id>
browsallax task-status <task-id>
browsallax task-wait <task-id>
browsallax task-cancel <task-id>
```

## Super PhiVessel live acceptance

A repository example is included:

```bash
npm run accept:vessie
```

It:

1. connects to the running Browsallax Operator
2. reads the currently available tabs
3. uses the active tab if possible
4. navigates to the live Super PhiVessel deployment
5. submits a constrained local task
6. waits for completion or authority hold
7. requires a deterministic `text_contains: "Super Φ.Vessel"` acceptance assertion
8. prints the bridge result envelope

It does not grant itself interaction authority.

## Direct PhiOS / Vessie integration

A host process can keep one bridge object and treat it as a local capability:

```js
const { PhiBrowserBridge } = require('browsallax/bridge');

const browser = await PhiBrowserBridge.connect();

const status = await browser.status();

const result = await browser.runTask({
  tabId: 1,
  url: 'https://example.com/',
  goal: 'Verify the application loads.',
  acceptance: [
    { kind: 'text_contains', value: 'Example' }
  ]
});
```

Recommended host-side rule:

```text
bridge disposition HELD
        ↓
surface human approval requirement
        ↓
human grants in Browsallax chrome
        ↓
host calls resumeTask(taskId)
```

The host should never interpret `HELD` as an invitation to route around the Operator.

## Current boundary

v0.3 provides the packaged local bridge and CLI.

Still deferred:

- direct Super PhiVessel UI integration
- direct PhiOS app registration
- local screenshot vision interpretation
- persisted task restoration across browser restarts
- cross-tab task planning
- downloads/uploads
- per-action sensitive approval UI
- Crane Fly planner ensembles

Those now have a stable client and bridge contract to build against.
