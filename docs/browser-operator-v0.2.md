# Browsallax Browser Operator v0.2

`PV-BOP-0.2` adds a local, resumable task engine on top of the governed Browser Operator transport introduced in v0.1.

The design goal is a local-first browser operator that can carry out multi-step web tasks without a hosted browser-agent subscription while preserving the rule:

> CAPABILITY != AUTHORITY

## Task loop

Each task executes the bounded loop:

```text
GOAL
  ↓
OBSERVE
  ↓
PLAN
  ↓
ACT
  ↓
VERIFY
  ↓
REPLAN
  ↓
COMPLETE / HELD / FAILED
```

The planner selects one action at a time. The transport independently classifies and authorizes that action before execution.

The planner cannot grant itself authority.

## Local planner

The default planner uses Ollama at:

```text
http://127.0.0.1:11434
```

Override the endpoint with:

```text
BROWSALLAX_OLLAMA_URL
```

Pin a planner model with:

```text
BROWSALLAX_OPERATOR_MODEL
```

Without an explicit model, the current preference order is:

1. `qwen3:4b`
2. `gemma4:e4b`
3. `glm-4.7-flash:latest`
4. `gemma3:12b`
5. `qwen3.6:latest`
6. smallest available local model as fallback

Planner discovery is lazy. Browsallax does not contact Ollama simply because the browser launched.

## Prompt-injection boundary

Page content is treated as untrusted input to the planner.

The planner system contract explicitly states that instructions found in webpage text, DOM content, links, forms, or scripts are data and cannot override:

- the human-authored task goal
- task constraints
- task acceptance contract
- the Browser Operator authority policy

The transport remains authoritative even if the planner proposes an unsafe action.

## Task API

### Create

```http
POST /v1/tasks
```

Example:

```json
{
  "tabId": 1,
  "goal": "Verify the deployed application is healthy",
  "constraints": [
    "Do not alter provider settings",
    "Do not delete any data"
  ],
  "successCriteria": [
    "The application reports READY"
  ],
  "acceptance": [
    {
      "kind": "text_contains",
      "value": "READY"
    }
  ],
  "maxSteps": 20,
  "maxDurationMs": 180000
}
```

Creation returns immediately with a task ID.

### Inspect

```http
GET /v1/tasks
GET /v1/tasks/:id
```

Task states include:

- `QUEUED`
- `RUNNING`
- `HELD`
- `COMPLETE`
- `FAILED`
- `CANCELLED`

### Resume

```http
POST /v1/tasks/:id/resume
```

A HELD task can resume only while a current human interactive grant exists in Browsallax chrome.

A HELD task continues to own its browser tab. Another task cannot start on that tab underneath it.

### Cancel

```http
POST /v1/tasks/:id/cancel
```

Optional body:

```json
{
  "reason": "Operator cancelled acceptance run"
}
```

## Planner status

```http
GET /v1/planner/status
GET /v1/planner/status?refresh=1
```

Returns local Ollama availability, selected model, and discovered model metadata.

## Deterministic acceptance

A planner may believe a task is complete. That is not automatically sufficient.

Tasks can include an `acceptance` array using the same deterministic assertion types as the Operator:

- `url_contains`
- `text_contains`
- `visible`

If the planner returns `finish: complete`, Browsallax runs every acceptance assertion before promoting the task to `COMPLETE`.

If an assertion fails:

```text
planner says COMPLETE
        ↓
acceptance assertion FAIL
        ↓
TASK_ACCEPTANCE_FAILED receipt
        ↓
REPLAN
```

If no deterministic acceptance contract is supplied, the result is explicitly marked:

```text
verification.mode = PLANNER_DECLARED
```

When deterministic acceptance passes:

```text
verification.mode = DETERMINISTIC_ASSERTIONS
```

## Authority holds

The v0.1 authority classes still govern every proposed action:

| Class | Behavior |
| --- | --- |
| READ_ONLY | token-authorized |
| NAVIGATION | token-authorized |
| FORM_INPUT | human interactive grant required |
| REMOTE_MUTATION | human interactive grant required |
| SENSITIVE_ACTION | hard HELD |

A normal mutation without a grant pauses the task in `HELD`.

The human can grant five minutes of interactive authority from Browsallax chrome and explicitly resume the task.

Sensitive actions remain HELD even while that general grant exists.

Credential-, OTP-, payment-, banking-, secret-, token-, and other sensitive input targets are classified as `SENSITIVE_ACTION`.

## Receipts

v0.2 extends the hash-chained Reality Ledger with:

- `TASK_CREATED`
- `TASK_STARTED`
- `TASK_PLAN`
- `TASK_STEP`
- `TASK_HELD`
- `TASK_RESUMED`
- `TASK_ACCEPTANCE_FAILED`
- `TASK_COMPLETE`
- `TASK_FAILED`
- `TASK_CANCELLED`

Typed values are redacted from task/action receipts.

## Current boundary

v0.2 is autonomous for DOM-first tasks that fit the current action grammar.

Still intentionally deferred:

- local vision-model interpretation of screenshots
- task persistence across application restarts
- file upload/download orchestration
- cross-tab planning
- per-action human approval UI for sensitive actions
- planner ensembles / Crane Fly routing
- PhiOS and Super PhiVessel packaged client adapters

Those can now be layered on top of the governed task engine rather than rebuilding the browser-control foundation.
