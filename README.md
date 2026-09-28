# BROWSALLAX

**A free browser for humans, machines, and everything in between.**

Browsallax is an MIT-licensed, local-first browser project with two complementary editions:

- **Browsallax Desktop** — Chromium/Electron with real tabs, browser permissions, Reality Ledger capture, a governed local Browser Operator, local Ollama planning, and a bounded Super Φ.Vessel / Brain Registry bridge.
- **Browsallax Web** — a zero-install React/PWA companion with search/launch, local workspaces, Research Mode, a persistent Free Tools Dock, and a browser-local Reality Ledger.

The goal is not to invent another rendering engine. The goal is to build transparent browser tooling around the web with stronger privacy boundaries, local intelligence, explicit authority, evidence capture, and an open ecosystem of useful tools.

> **Current status:** Desktop `0.5.0-alpha.7`; Web `0.2.0-alpha.1`. Both are alpha software.

## Try it

### Web / PWA

Live site:

**https://michaelwave369.github.io/Browsallax/**

Run locally:

```bash
git clone https://github.com/MichaelWave369/Browsallax.git
cd Browsallax/web
npm install
npm run dev
```

### Desktop

Requires Node.js 24+.

```bash
git clone https://github.com/MichaelWave369/Browsallax.git
cd Browsallax
npm install
npm start
```

Development checks:

```bash
npm run check
npm test
```

Live Browser Operator acceptance commands require Browsallax Desktop to be running:

```bash
npm run accept:nasa-direct
npm run accept:nasa-registry
npm run accept:registry-fail-closed
```

## Project status

| Area | Status |
|---|---|
| Web/PWA shell | **Available · alpha** |
| Research Mode | **Working** |
| Browser-local Reality Ledger | **Working** |
| Desktop Chromium browser | **Alpha** |
| Desktop selected-text Ledger capture | **Working** |
| Browser Operator | **Experimental · live-tested** |
| Local Ollama planner | **Working · experimental** |
| Brain Registry routed planner | **Working · live-tested success + fail-closed paths** |
| Governed read-only research | **Working · live-tested** |
| Mutation automation | **Restricted · experimental** |
| Governed pointer paths | **Working · alpha** |
| ChatGPT ↔ Domistika semantic lane | **Implemented · live acceptance pending** |
| Sensitive mutation | **HELD pending per-action approval design** |
| Local vision interpretation | **Planned** |
| Signed release/update chain | **Not implemented** |

## Design laws

1. **Capability is not authority.**
2. **A webpage is data, not an instruction source.**
3. **A model recommendation is not execution permission.**
4. **Brain Registry hints are advisory.**
5. **Browsallax policy enforces browser authority.**
6. **Local Ollama inventory is execution reality for local planner routing.**
7. **Sources survive transformations.**
8. **Receipts record events; receipts do not grant authority.**
9. **Local first does not mean every local process is trusted.**
10. **Missing evidence stays missing.**

In compact form:

```text
WEBPAGE != authority
MODEL != authority
BRAIN REGISTRY != authority
PLANNER HINT != authority
RECEIPT != authority

LOCAL OPERATOR = authority source
BROWSALLAX POLICY = enforcement
HUMAN GRANT = bounded mutation authority
OLLAMA INVENTORY = execution reality
```

## Browsallax Web

The React/PWA edition lives in [`web/`](web/) and is designed for instant use without installing the desktop app.

Current features include:

- React 19.3 + Vite 8.3;
- responsive Browsallax interface;
- URL/search omnibox that launches destinations in normal browser tabs;
- local workspaces and saved links;
- **Research Mode** with investigations, guiding questions, sources, notes, unresolved questions, export, and Reality Ledger handoff;
- persistent **Free Tools Dock**;
- browser-local Reality Ledger receipts;
- SHA-256 evidence digests using the Web Crypto API;
- JSON export;
- installable PWA manifest;
- offline application shell/service worker;
- no account or backend required for core use.

### Web authority boundary

Browsallax Web does **not** pretend it can embed and control arbitrary websites. Same-origin rules, CSP, and `X-Frame-Options` still apply. External destinations open as normal browser tabs.

Page inspection, permission control, arbitrary-site selected-text capture, local planner execution, and governed browser automation belong in Browsallax Desktop.

### Web data durability

Current workspaces, research sessions, and Ledger data are browser-local. JSON export exists today.

Planned hardening includes IndexedDB-backed storage, schema-versioned migrations, import/restore, and larger research-session support.

## Browsallax Desktop

Current desktop capabilities include:

- Chromium rendering through Electron `44.3.0`;
- multi-tab browsing;
- address/search omnibox;
- DuckDuckGo default search/home;
- back, forward, reload, and home navigation;
- popup / `target=_blank` routing into Browsallax tabs;
- persistent browser session;
- Electron sandbox enabled;
- `nodeIntegration: false`;
- `contextIsolation: true`;
- deny-by-default sensitive browser permissions;
- selected-text Reality Ledger capture;
- governed local Browser Operator;
- local Ollama planner;
- advisory Brain Registry planner routing;
- trusted Super Φ.Vessel task bridge;
- path-locked ChatGPT ↔ Domistika semantic drawing bridge with governed Sticky Draw / Polyline input.

Browsallax depends on Electron/Chromium security updates. The current pin should be kept current where compatibility allows; no signed automatic update chain is claimed yet.

## Browser Operator

The Browser Operator is a localhost-only governed automation layer.

Current runtime contracts:

| Contract | Version | Purpose |
|---|---|---|
| Browser Operator API | `PV-BOP-0.2` | localhost API and task execution |
| Planner | `PV-BOP-PLAN-0.9` | schema-constrained local planning + observed interactive target grounding + deterministic hard-ceiling termination |
| Task engine | `PV-BOP-TASK-0.4` | observe → plan → act → verify, with bounded SPA-hydration initial acceptance |
| Brain Registry router | `PV-BOP-BRR-0.1` | advisory registry routing + local inventory verification |
| Read-only research completion | `PV-BOP-RRC-0.6` | bounded read-only research + grant-gated query interaction with task-aware budget |
| Portable client | `PV-BOP-CLIENT-0.1` | local endpoint discovery/client |
| PhiOS / Super Φ.Vessel bridge | `PV-BRIDGE-0.2` | task handoff and bounded diagnostics |
| ChatGPT ↔ Browsallax bridge | `PV-CBR-0.3` | bounded semantic Vessie + Domistika connector surface |
| Domistika semantic bridge | `PV-CBR-DOM-0.1` | exact-path drawing recipes through observed controls and governed pointer input |
| Governed pointer path | `PV-BOP-POINTER-0.1` | bounded native drag / sticky / polyline input, always mutation-gated |
| ChatGPT outbound relay agent | `PV-CBR-AGENT-0.2` | outbound-only transport client for the public relay |
| ChatGPT transport relay | `PV-CBR-RELAY-0.2` | Netlify-hosted transport-only semantic queue owned by Browsallax |
| ChatGPT GitHub mailbox bridge | `PV-CBR-GH-0.2` | private-repo compatibility transport for Vessie + Domistika semantic operations |
| Trusted page bridge | `PV-PAGE-0.2` | exact-origin dedicated task lane + opt-in initial acceptance short-circuit |

### Task loop

```text
observe
   ↓
plan
   ↓
classify action
   ↓
authority check
   ↓
act / hold
   ↓
verify
   ↓
finish or replan
```

The planner does not receive browser authority merely because it produced valid JSON.

Planner click, type, and select targets are grounded against the current observation before policy or execution. An interactive action may identify an observed element by its exact transient `ref` or exact observed selector; Browsallax deterministically resolves the ref to the observed selector. Invented targets and contradictory ref/selector pairs fail validation before the action can reach browser policy.

For read-only research, recognized search-results pages are treated as intermediate evidence surfaces. During the normal exploration phase, a planner cannot declare failure merely because search snippets lack the final answer when ordinary navigation links are visibly available; it must use a bounded read-only navigation step first. The planner prompt marks that requirement explicitly, and a rejected premature failure receives one policy-specific repair instruction requiring an exact observed ref or selector. Ordinary read-only tasks with an explicit max-step budget may use that budget up to a hard termination point one step before the task ceiling, capped at step 9. Tasks explicitly requesting governed ephemeral query interaction receive a larger but still bounded cap of step 15 so necessary form/query actions do not consume the entire passive-research budget before results can be observed. At the hard ceiling, the planner gets one explicit finish-only repair turn; if it still refuses to terminate, Browsallax deterministically fails the task closed rather than converting a planner control error into a structured-output failure. Page content never gains authority.

Trusted-page self-checks may opt into **initial deterministic acceptance**. When explicitly enabled, Browsallax polls the existing deterministic acceptance assertions for a bounded 3-second SPA-hydration window before planner dispatch. If all assertions pass, the task completes at step 0 without dispatching a planner. If the window expires, the normal planner loop begins unchanged. This is deterministic verification only; it grants no mutation authority and is disabled by default.

### Human grants

Read-only actions and ordinary navigation are baseline local capabilities.

Form input and ordinary remote mutation require a current human interactive grant from Browsallax chrome. The current grant lasts five minutes and can be revoked. Read-only research tasks remain unable to request form interaction unless they carry the explicit `EPHEMERAL_QUERY_INTERACTION_REQUESTED` task marker. That marker is a capability request only, not authority: observed non-sensitive query fields/buttons still pass through normal policy and require the current human interactive grant.

Sensitive actions remain **HELD** even when a broad interactive grant exists. Per-action sensitive approval is not implemented yet.

### ChatGPT ↔ Browsallax semantic bridge

Browsallax includes an experimental local semantic connector intended to replace paid remote-browser transport for supported local workflows.

```text
ChatGPT
   ↓ bounded semantic request
PV-CBR-0.3
   ↓
Browsallax Browser Operator
   ├── Super Φ.Vessel / Vessie
   └── Domistika
```

The bridge still does **not** expose raw browser selectors, arbitrary navigation, shell access, filesystem access, grant creation, or sensitive-action approval.

Vessie keeps its deterministic observed composer/send path. Domistika adds `PV-CBR-DOM-0.1`, which is path-locked to `https://michaelwave369.github.io/Domistika/` and exposes only `domistika.status`, `domistika.observe`, and `domistika.draw`. Drawing recipes use observed Domistika controls and `PV-BOP-POINTER-0.1` for bounded Sticky Draw / Polyline motion. Pointer paths are classified as `REMOTE_MUTATION` and therefore require the normal five-minute human interactive grant.

Remote transport can use `PV-CBR-AGENT-0.2` + `PV-CBR-RELAY-0.2`, or the private GitHub mailbox `PV-CBR-GH-0.2`. The mailbox remains claim-before-execute with no replay after an ambiguous previous claim.

See [CHATGPT_BROWSALLAX_BRIDGE.md](docs/CHATGPT_BROWSALLAX_BRIDGE.md), [DOMISTIKA_CHATGPT_BRIDGE.md](docs/DOMISTIKA_CHATGPT_BRIDGE.md), [CHATGPT_RELAY_AGENT.md](docs/CHATGPT_RELAY_AGENT.md), [CHATGPT_GITHUB_BRIDGE.md](docs/CHATGPT_GITHUB_BRIDGE.md), and [chatgpt-browsallax.openapi.yaml](docs/chatgpt-browsallax.openapi.yaml).

### Brain Registry routing

A Super Φ.Vessel Brain Registry hint may contain:

- registry/router versions;
- routing mode;
- planner role;
- approved local model pool;
- configured role model;
- recommended model;
- ordered scored candidates.

Browsallax independently compares that hint with live Ollama inventory.

Selection order is bounded:

1. explicit local Browsallax operator override, when configured and installed;
2. installed + registry-approved recommended model;
3. installed + registry-approved candidate;
4. installed + registry-approved configured role model;
5. fail closed when a registry hint exists but no approved model exists locally;
6. local fallback preferences only when no registry hint was supplied.

A webpage cannot choose its executor directly.

## Reality Ledger

### Desktop selected-text capture

Select text on a webpage, right-click, and choose **Capture selection to Reality Ledger**.

Browsallax appends a JSON Lines receipt under the Electron user-data directory:

```text
reality-ledger/web-captures.jsonl
```

Receipts preserve source URL, title, UTC timestamp, content digest, and explicit `SOURCE_ONLY` semantics.

### Browser Operator receipts

Operator receipts are appended to:

```text
reality-ledger/browser-operator.jsonl
```

Each receipt includes a sequence number, timestamp, previous hash, canonicalized data, and SHA-256 receipt hash.

The chain is **tamper-evident by structure, not tamper-proof storage**. A process with local filesystem access can edit or delete the file. External anchoring/signing is not currently implemented.

## Security posture

Browsallax treats arbitrary web content and model output as untrusted.

Implemented boundaries include:

- sandboxed web content;
- exact trusted-origin checks;
- loopback-only Browser Operator endpoint discovery;
- per-start random bearer token;
- bearer token withheld from page bridges;
- dedicated trusted-page task tabs;
- task ownership bound to origin + Electron `WebContents`;
- bounded trusted-page concurrency;
- nested trusted-page task prevention;
- expiring human mutation grants;
- sensitive-action hard holds;
- schema-constrained planner output;
- bounded planner repair;
- raw malformed model output withheld from public diagnostics;
- Brain Registry/local inventory intersection;
- registry-present/no-approved-local-model fail-closed behavior in contract tests.

Read the full [Threat Model](docs/THREAT_MODEL.md) and [Security Test Matrix](docs/SECURITY_TEST_MATRIX.md).

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                         BROWSALLAX                           │
├────────────────────────────┬─────────────────────────────────┤
│ DESKTOP                    │ WEB / PWA                       │
│ Electron + Chromium        │ React + Vite                    │
├────────────────────────────┼─────────────────────────────────┤
│ real tabs                  │ launch/search                   │
│ browser permissions        │ local workspaces                │
│ selected-text capture      │ Research Mode                   │
│ Browser Operator           │ Reality Ledger                  │
│ Ollama planner             │ Free Tools Dock                 │
│ Brain Registry bridge      │ offline app shell               │
│ trusted page task lane     │ JSON export                     │
├────────────────────────────┴─────────────────────────────────┤
│ Shared laws                                                   │
│ local-first · source custody · explicit authority · receipts │
└──────────────────────────────────────────────────────────────┘
```

## Repository map

| Path | Purpose |
|---|---|
| [`src/`](src/) | Electron desktop runtime, Browser Operator, policy, planner, bridges, and renderer |
| [`src/operator/`](src/operator/) | Browser observation, policy, planner, task engine, trusted-page bridge, receipts |
| [`src/client/`](src/client/) | Portable Browser Operator client and endpoint discovery |
| [`src/bridge/`](src/bridge/) | PhiOS / Super Φ.Vessel bridge + bounded ChatGPT connector |
| [`relay/`](relay/) | Browsallax-owned transport-only ChatGPT ↔ Vessie relay |
| [`web/`](web/) | React/Vite PWA companion |
| [`bin/`](bin/) | local `browsallax` CLI entrypoint |
| [`examples/`](examples/) | live acceptance and bridge examples |
| [`test/`](test/) | Node contract/unit tests |
| [`docs/`](docs/) | architecture, threat model, roadmap, acceptance, and interaction records |
| [`.github/workflows/`](.github/workflows/) | CI and GitHub Pages workflows |

## Automated quality gates

Desktop/Operator CI currently runs:

- JavaScript syntax contract;
- Node unit/contract tests;
- React web production build in the repository CI suite.

Current tests cover trusted origins, local endpoint validation, authority grants, sensitive actions, Brain Registry routing, structured planner output, task acceptance, read-only research behavior, bridge semantics, and receipt chaining.

The remaining gaps are tracked explicitly rather than implied away in [SECURITY_TEST_MATRIX.md](docs/SECURITY_TEST_MATRIX.md).

## Live evidence

Browsallax keeps observed runtime acceptance separate from unit-test claims.

- [Live Acceptance 001](docs/acceptance/Browsallax-Live-Acceptance-001-2026-09-26.md) — first live trusted-page task completion.
- [Live Interaction 001](docs/interaction/Browsallax-Live-Interaction-001-2026-09-26.md) — first documented live conversational exchange inside Browsallax.
- [Live Acceptance 002](docs/acceptance/Browsallax-Live-Acceptance-002-2026-09-26.md) — capability/state truth regression.
- [Live Acceptance 003](docs/acceptance/Browsallax-Live-Acceptance-003-2026-09-26.md) — successful conversational read-only web observation.
- [Live Acceptance 004](docs/acceptance/Browsallax-Live-Acceptance-004-2026-09-26.md) — bounded NASA read-only research completion after `PV-BOP-RRC-0.1`.
- [Live Acceptance 005A](docs/acceptance/Browsallax-Live-Acceptance-005A-2026-09-26.md) — Brain Registry routed NASA success with `REGISTRY_RECOMMENDED`, local inventory verification, `qwen3:4b`, one-step completion, and read-only authority.
- [Live Acceptance 005B](docs/acceptance/Browsallax-Live-Acceptance-005B-2026-09-26.md) — adversarial registry/local-inventory disagreement fails closed at step 0 with no planner dispatch and no legacy fallback.
- [Live Acceptance 005](docs/acceptance/Browsallax-Live-Acceptance-005-2026-09-26.md) — combined success + fail-closed acceptance for `PV-BOP-BRR-0.1`.

## Roadmap

The active roadmap now lives in [`docs/ROADMAP.md`](docs/ROADMAP.md).

Current priorities:

1. repair Super Φ.Vessel browser-intent handoff so explicit browser tasks do not depend on an unrelated provider completion before reaching Browsallax;
2. continue trust/presentation hardening with real screenshots, a short demo, and release/security documentation;
3. add lifecycle/security verification for token rotation, endpoint cleanup, permission denial, popup routing, and receipt-chain tamper detection.

## Visual tour

Real screenshots and a short demo are intentionally **not fabricated from mockups**. They should be captured from live Browsallax Desktop/Web builds and added as a documentation milestone.

## Contributing

Early contributions are welcome.

Keep changes:

- small and reviewable;
- explicit about new privilege or data flow;
- accompanied by tests when they affect authority, routing, receipts, or trusted boundaries;
- honest about what was unit-tested versus live-tested.

Start with the [Repository Map](#repository-map), [Threat Model](docs/THREAT_MODEL.md), [Security Test Matrix](docs/SECURITY_TEST_MATRIX.md), and [Roadmap](docs/ROADMAP.md).

## License

MIT License. See [`LICENSE`](LICENSE).
