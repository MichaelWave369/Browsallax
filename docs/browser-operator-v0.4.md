# Browsallax Browser Operator v0.4

`PV-PAGE-0.1` adds a trusted in-browser task lane for Super PhiVessel when the hosted application is running inside Browsallax Desktop.

The existing localhost transport remains `PV-BOP-0.2`. The portable client remains `PV-BOP-CLIENT-0.1`. The PhiOS / Vessie local-process adapter remains `PV-BRIDGE-0.1`.

v0.4 adds a separate page-facing contract because an HTTPS web application should not receive the Browser Operator bearer token or make mixed-content localhost requests.

## Why this bridge exists

A hosted page at:

```text
https://superphivessel.netlify.app
```

cannot safely or portably call:

```text
http://127.0.0.1:3697
```

directly. Browser mixed-content, CORS, and private-network controls make that the wrong boundary.

Instead:

```text
Super PhiVessel page
        ↓
Electron isolated preload
        ↓
origin-validated IPC
        ↓
Browsallax main process
        ↓
PV-BOP-0.2 task engine
```

No Browser Operator bearer token crosses into the page.

## Trusted origin

The default trusted origin is exactly:

```text
https://superphivessel.netlify.app
```

Lookalike hosts are rejected.

Additional development origins require an explicit local environment variable:

```text
BROWSALLAX_TRUSTED_PAGE_ORIGINS=http://localhost:4173
```

Wildcards are not supported.

## Page capability

A trusted page receives:

```js
window.browsallaxOperator
```

with only:

- `manifest()`
- `status()`
- `startTask(spec)`
- `getTask(taskId)`
- `resumeTask(taskId)`
- `cancelTask(taskId, reason)`

The page does not receive:

- bearer token
- endpoint descriptor
- Node.js
- raw Electron IPC
- arbitrary tab enumeration
- arbitrary tab IDs
- authority-grant methods

## Dedicated task tabs

A trusted page may not operate an arbitrary user tab.

When Super PhiVessel calls `startTask`:

1. Browsallax validates the caller origin
2. Browsallax creates a dedicated background task tab
3. that tab loads the requested HTTP/HTTPS target
4. the standard `PV-BOP-0.2` task engine receives the task
5. the task is bound to the exact trusted-page WebContents that created it
6. another Vessie tab cannot claim the task
7. terminal tasks close their dedicated tab by default

A trusted page is limited to three active dedicated tasks at once.

When the trusted Vessie WebContents closes, its non-terminal tasks are cancelled and their task tabs are closed.

## Nested task prevention

A dedicated task tab may itself navigate to Super PhiVessel.

That task-owned tab is marked internally and cannot call `startTask` again.

This prevents recursive Browser Operator task spawning.

## Authority

The page bridge cannot grant authority.

```text
READ_ONLY / NAVIGATION
→ governed by existing Browser Operator baseline

FORM_INPUT / REMOTE_MUTATION
→ existing human interactive grant required

SENSITIVE_ACTION
→ hard HELD
```

A HELD task can be resumed only after the human grants normal interaction from the Browsallax chrome.

The trusted page has no grant method.

## Super PhiVessel behavior

Super PhiVessel `.51.2` detects `window.browsallaxOperator`.

Inside Browsallax it exposes a Browser Operator instrument that can:

- display connection status
- show selected local planner
- show Operator version
- show whether the human interactive grant is active
- start a target task
- run a self acceptance check
- poll task state
- resume HELD work
- cancel work

Outside Browsallax, the same page displays the Browser Operator capability as offline and makes no localhost request.

## Security boundary

The page preload may exist in every Browsallax tab, but the main process authorizes every page-bridge call using the exact sender-frame origin.

Exposure of a JavaScript property is not authority.

> CAPABILITY != AUTHORITY

## Tests

The v0.4 contract adds deterministic checks for:

- exact canonical Super PhiVessel origin
- lookalike-host rejection
- explicit-only development origins
- HTTP/HTTPS-only page tasks
- no page authority grant
- no arbitrary-tab access
- no bearer-token exposure
- dedicated-task-only manifest
- task ownership scoped to origin + WebContents identity

## Current boundary

Still deferred:

- per-action sensitive approval UI
- screenshot vision interpretation
- task persistence across Browser restarts
- cross-tab autonomous planning
- file upload/download orchestration
- direct PhiOS desktop registration
- Crane Fly planner ensembles
