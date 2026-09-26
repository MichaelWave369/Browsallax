# Browsallax Browser Operator v0.1

`PV-BOP-0.1` is the local, human-governed browser-control surface for Browsallax Desktop.

It lets PhiOS, Super PhiVessel, local models, and test harnesses inspect and operate the same Chromium tabs the human is using without a hosted browser-agent service.

## Local boundary

The Operator binds only to:

```text
127.0.0.1:3697
```

If 3697 is occupied, Browsallax selects another loopback port.

Each launch creates a fresh 256-bit bearer token and writes the connection descriptor under the Browsallax user-data directory:

```text
operator/endpoint.json
```

The token authorizes access to the local API. It does **not** authorize page mutation.

## Authority

Browsallax preserves:

> CAPABILITY != AUTHORITY

| Class | v0.1 |
| --- | --- |
| READ_ONLY | allowed with token |
| NAVIGATION | allowed with token |
| FORM_INPUT | requires current human grant |
| REMOTE_MUTATION | requires current human grant |
| SENSITIVE_ACTION | always HELD |

The human grant can only be created from Browsallax chrome by clicking **OPERATOR READ-ONLY**. It lasts five minutes and can be revoked immediately. There is no API endpoint that can grant authority to itself.

Obvious destructive, financial, credential, deployment, and account-control actions stay manual in v0.1.

## DOM first, vision second

`GET /v1/observe` returns a bounded DOM/accessibility-oriented snapshot containing visible text, links, buttons, form controls, selectors, labels, roles, and geometry.

Password, file, password-autocomplete, and one-time-code values are redacted.

`POST /v1/screenshot` is the visual fallback. It stores the PNG locally, computes SHA-256, and writes a Reality Ledger receipt.

## API

All endpoints except `GET /v1/health` require:

```http
Authorization: Bearer <token>
```

Available v0.1 endpoints:

- `GET /v1/health`
- `GET /v1/status`
- `GET /v1/observe?tabId=<id>`
- `POST /v1/screenshot`
- `POST /v1/navigate`
- `POST /v1/action`
- `POST /v1/assert`

Action types:

- `click`
- `type`
- `select`
- `scroll`
- `wait`

Assertion types:

- `url_contains`
- `text_contains`
- `visible`

Typed values are redacted from action receipts.

## Receipts

Operator activity is appended to:

```text
reality-ledger/browser-operator.jsonl
```

Receipts are SHA-256 hash-chained and include sequence, UTC timestamp, previous hash, receipt kind, and bounded action/result metadata.

Current receipt kinds include `SERVER_STARTED`, `OBSERVATION`, `SCREENSHOT`, `NAVIGATION`, `ACTION`, `ASSERTION`, `HELD`, and `ERROR`.

Receipts establish what the local operator observed or attempted. They do not establish that webpage content is true.

## v0.1 boundary

This release is the governed browser transport. It is not yet the autonomous planner.

Later rungs can add multi-step task planning, local-model reasoning, vision interpretation, downloads/uploads, task replay, and per-action approval for sensitive actions on top of this transport.
