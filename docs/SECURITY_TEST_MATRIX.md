# Browsallax Security Test Matrix

This matrix separates **implemented coverage**, **live acceptance evidence**, and **remaining security work**. A green unit test is not treated as proof of production security, and a successful live task is not treated as proof that unrelated threat classes are covered.

## Automated coverage

| Boundary | Current evidence | Status | Next hardening step |
|---|---|---:|---|
| Exact trusted-origin validation | `test/trusted-page-bridge.test.js` accepts canonical Super Φ.Vessel origin and rejects look-alike / HTTP variants | Covered | Add more URL-normalization edge cases |
| Explicit development origins | trusted-origin environment override test | Covered | Add malformed origin-list fixtures |
| Unsafe task URL schemes | page task rejects non-http(s) URL | Covered | Add encoded / mixed-case scheme fixtures |
| Trusted page cannot grant authority | manifest assertions | Covered | Preserve as contract test |
| Trusted page cannot choose executor | manifest + Brain Registry advisory assertions | Covered | Preserve as contract test |
| Brain Registry schema validation | valid hint accepted; unknown schema rejected | Covered | Add oversized/candidate-boundary fuzz cases |
| Registry/local inventory intersection | planner/router tests | Covered | Preserve with live acceptance |
| Registry missing locally fails closed | router/planner tests + Live Acceptance 005B | Covered + live-tested | Preserve as contract invariant |
| Legacy planner fallback only without registry hint | router tests | Covered | Preserve as contract invariant |
| Local endpoint must be loopback | `test/operator-client.test.js` | Covered | Add IPv6/canonicalization cases |
| Public client descriptor hides bearer token | client test | Covered | Add serialization regression |
| Human grant expiry | `test/operator-policy.test.js` | Covered | Add boundary-at-expiry timing fixture |
| Sensitive actions hard-held | policy tests | Covered | Add broader semantic fixtures |
| Credential/payment fields hard-held | policy tests | Covered | Add account/security-control fields |
| Planner action vocabulary | planner schema + validation tests | Covered | Add property-based/fuzz generation |
| Malformed planner output | bounded repair and failure diagnostics tests | Covered | Add malformed JSON corpus |
| Thinking-only planner response | explicit diagnostic test | Covered | Preserve |
| Raw malformed model output not promoted | failure-diagnostic regression | Covered | Add nested secret fixture |
| Read-only research termination | `test/read-only-research.test.js` + planner tests | Covered | Preserve with live research acceptance |
| Task cannot self-certify failed deterministic acceptance | task-engine test | Covered | Add multi-check partial-failure fixtures |
| HELD task ownership | task-engine test | Covered | Add concurrent owner fixtures |
| Receipt append chaining | `test/operator-receipts.test.js` | Covered | Add verifier and tamper-detection tests |
| Browser popup routing | implemented in `src/main.js` | Not directly tested | Add Electron smoke test |
| Browser permission denial | implemented in session handlers | Not directly tested | Add Electron smoke test |
| Endpoint token freshness on restart | implementation generates fresh random token at server start | Not directly tested | Add lifecycle test |
| Endpoint file removal on shutdown | implementation removes endpoint descriptor | Not directly tested | Add lifecycle test |
| Trusted sender close cancels its active tasks | implemented in `src/main.js` | Not directly tested end-to-end | Add trusted-page lifecycle test |
| Replay of authenticated Operator request | no nonce/replay protocol exists | Open design item | Decide whether idempotency/replay protection is required per action class |
| Receipt file tampering | hash chain exists, but no verifier command | Open | Add `browsallax ledger verify` |
| Release/update authenticity | no signed update chain documented | Open | Add release signing / verification policy |

## Live acceptance evidence

Current repository evidence includes:

- **Live Acceptance 001** — trusted-page task completion using local planner.
- **Live Interaction 001** — conversational exchange inside Browsallax.
- **Live Acceptance 002** — runtime capability/state truth regression.
- **Live Acceptance 003** — successful conversational read-only web observation.
- **Live Acceptance 004** — bounded NASA research completion after the read-only completion contract.
- **Live Acceptance 005A** — registry-routed NASA research success using `REGISTRY_RECOMMENDED`, local inventory verification, `qwen3:4b`, one-step completion, and read-only authority.
- **Live Acceptance 005B** — adversarial missing-local-model run failed closed at step 0 with `NO_LOCAL_REGISTRY_APPROVED_PLANNER_MODEL`, `selectedModel=null`, no planner dispatch, and no legacy fallback.
- **Live Acceptance 005** — combined success + disagreement acceptance for Brain Registry routed planner selection.

## Priority security backlog

### P0 — preserve current authority boundary

- keep trusted-page exact-origin validation;
- keep bearer token off the page bridge;
- keep registry hints advisory;
- keep sensitive mutation HELD;
- keep registry-present/no-approved-local-model behavior fail closed.

### P1 — verify what is already implemented

- endpoint token freshness across restart;
- endpoint file cleanup on shutdown;
- trusted sender lifecycle cancellation;
- popup-to-tab routing;
- deny-by-default browser permissions;
- receipt-chain verification and tamper detection.

### P2 — harden interfaces

- malformed authenticated request corpus;
- task-id ownership/replay edge cases;
- URL canonicalization and redirect edge cases;
- bounded fuzzing of registry hints and planner packets;
- explicit request idempotency semantics for mutations.

### P3 — distribution trust

- `SECURITY.md` with private reporting path;
- supported-version policy;
- release signing or verifiable checksums;
- documented Electron update cadence;
- dependency audit policy.

## Interpretation rules

- **Covered** means a current automated test exercises the stated contract. It does not mean the implementation is vulnerability-free.
- **Live acceptance** proves one observed runtime path on one environment at one point in time.
- **Open** means the repository should not imply that protection exists.
- A future test must not convert an implementation assumption into a security claim without exercising the relevant boundary.
