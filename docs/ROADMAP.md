# Browsallax Roadmap

Browsallax is intentionally developed in small, reviewable rungs. Completed work stays visible for provenance, but the first section is the current focus.

## Next three milestones

### 1. Repair the Super Φ.Vessel browser-intent handoff

- explicit browser work should route directly to the trusted Browsallax task lane;
- Brain Registry routing may propose a planner;
- Browsallax remains responsible for local inventory verification and browser authority;
- normal provider completion should not be a prerequisite for starting an explicit governed browser task;
- preserve terminal diagnostics when provider/orchestration fails before browser task creation.

### 2. Finish trust and presentation hardening

- add real screenshots from live Browsallax Desktop and Web builds;
- add a short demo recording;
- keep the README synchronized with actual runtime versions;
- maintain the threat model and security-test matrix;
- add a private security-reporting path and supported-version policy;
- document the release process and Electron security-update cadence.

### 3. Verify security lifecycles

- test endpoint token freshness across restarts;
- test endpoint file cleanup on shutdown;
- add popup-to-tab and permission-denial Electron smoke tests;
- test trusted-sender-close cancellation;
- add receipt-chain verification and tamper detection;
- define mutation idempotency / replay semantics.

## Desktop foundation

- [x] secure Electron shell
- [x] tabs and omnibox
- [x] navigation history
- [x] persistent browsing session
- [x] popup-to-tab routing
- [x] deny-by-default sensitive permissions
- [x] selected-text Reality Ledger capture
- [ ] downloads UI
- [ ] history UI
- [ ] bookmarks
- [ ] private windows
- [ ] site information panel

## Web / PWA

- [x] React/PWA companion
- [x] local workspaces
- [x] browser-local Reality Ledger + JSON export
- [x] GitHub Pages deployment
- [x] Research Mode
- [x] persistent Free Tools Dock
- [x] separate paid-products link to Field Supply
- [ ] IndexedDB-backed durable data store
- [ ] schema-versioned migrations
- [ ] import/restore flow
- [ ] larger research-session storage
- [ ] cross-session search

## Governed Browser Operator

- [x] localhost-only Operator API (`PV-BOP-0.2`)
- [x] DOM-first bounded page observation
- [x] screenshot fallback with SHA-256 receipt
- [x] navigation, click/type/select/scroll/wait actions
- [x] URL/text/visibility assertions
- [x] per-start random bearer token
- [x] five-minute human mutation grant from browser chrome only
- [x] sensitive actions HELD
- [x] hash-chained Browser Operator receipts
- [x] local Ollama task planner
- [x] schema-constrained planner + one bounded repair attempt (`PV-BOP-PLAN-0.5`)
- [x] Brain Registry planner routing with local inventory verification (`PV-BOP-BRR-0.1`)
- [x] bounded read-only research completion (`PV-BOP-RRC-0.1`)
- [x] observe → plan → act → verify → replan task loop
- [x] resumable HELD tasks
- [x] deterministic task acceptance assertions
- [x] one non-terminal task owns a tab at a time
- [x] portable local Operator client (`PV-BOP-CLIENT-0.1`)
- [x] PhiOS / Super Φ.Vessel bridge (`PV-BRIDGE-0.2`)
- [x] loopback-only endpoint discovery
- [x] trusted Super Φ.Vessel page bridge (`PV-PAGE-0.1`)
- [x] exact-origin validation
- [x] dedicated Browser Operator task tabs
- [x] trusted-page task ownership by origin + WebContents identity
- [x] trusted-page concurrency bound
- [x] nested-task prevention
- [x] bounded planner failure diagnostics
- [x] direct NASA acceptance harness
- [x] registry-routed NASA acceptance harness
- [x] registry missing-local-model fail-closed harness
- [x] live freeze of missing-local-model fail-closed acceptance
- [x] combined Live Acceptance 005 success + fail-closed record
- [ ] per-action approval for sensitive mutations
- [ ] local vision interpretation and replay

## Security hardening

- [x] exact trusted-origin tests
- [x] grant-expiration tests
- [x] sensitive-action hard-hold tests
- [x] credential/payment-field hard-hold tests
- [x] endpoint loopback validation tests
- [x] bearer-token redaction test
- [x] receipt append-chain test
- [x] malformed planner-output tests
- [x] registry fail-closed unit tests
- [ ] endpoint token freshness lifecycle test
- [ ] endpoint cleanup lifecycle test
- [ ] popup-to-tab Electron smoke test
- [ ] browser permission-denial Electron smoke test
- [ ] trusted-sender-close cancellation test
- [ ] receipt-chain verifier and tamper test
- [ ] malformed authenticated-request corpus
- [ ] explicit mutation idempotency / replay semantics
- [ ] release signing or verifiable checksum policy
- [ ] documented Electron security-update cadence

See [SECURITY_TEST_MATRIX.md](SECURITY_TEST_MATRIX.md) and [THREAT_MODEL.md](THREAT_MODEL.md).

## Local intelligence

- [x] Ollama discovery for Browser Operator planning
- [x] deterministic local planner selection
- [x] advisory Brain Registry model routing
- [ ] user-facing general model picker
- [ ] Ask This Page
- [ ] Summarize This Page
- [ ] selected-text AI actions
- [ ] page extraction with explicit source boundaries
- [ ] local vision interpretation

## Research evolution

- [x] Research Mode
- [x] source/note handoff to Reality Ledger
- [ ] source annotations and tags
- [ ] contradiction / unresolved-question views
- [ ] research session import
- [ ] cross-session search
- [ ] desktop tab workspaces
- [ ] optional local-model analysis that never overwrites source evidence

## Free tools ecosystem

- [x] Free Tools Dock
- [x] PhiOffice369 launcher
- [x] Enter the Field launcher
- [ ] extensible tool manifest
- [ ] optional user-added tool links
- [ ] tighter integrations with stable public free tools

## Field products

- [x] Field Supply discovery link
- [x] RackMap remains outside the Free Tools classification
- [ ] optional richer product cards without mixing free and paid categories

## Documentation and contributor experience

- [x] threat model
- [x] security-test matrix
- [x] repository map in README
- [x] quick-start path near README top
- [x] current status table
- [ ] real desktop screenshots
- [ ] web screenshots
- [ ] short demo recording
- [ ] `SECURITY.md` with private reporting path
- [ ] contributor development guide
- [ ] release process documentation
