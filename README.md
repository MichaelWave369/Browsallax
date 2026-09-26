# BROWSALLAX

**A free browser for humans, machines, and everything in between.**

Browsallax is an MIT-licensed, local-first browser project with two complementary editions:

- **Browsallax Desktop** is the Chromium/Electron browser shell with real tabs, browser permissions, page-level capture, and planned local AI.
- **Browsallax Web** is the zero-install React/PWA companion for GitHub Pages with search/launch, local workspaces, Research Mode, a persistent free-tools dock, and a browser-local Reality Ledger.

The goal is not to invent another rendering engine. The goal is to build transparent, useful browser tooling around the web with better privacy boundaries, local intelligence, evidence capture, and an open ecosystem of free tools.

> **Status:** Desktop `v0.5.0-alpha.2`; Web `v0.2.0-alpha.1`. Both editions are early software and should be treated as experimental.

## Browsallax Web

Live site: **https://michaelwave369.github.io/Browsallax/**

The React edition lives in [`web/`](web/) and is designed for instant use from GitHub Pages without installing the desktop app.

Current web features:

- React 19.3 + Vite 8.3
- responsive Browsallax interface
- URL/search omnibox that opens destinations in normal browser tabs
- quick-launch panel for useful public tools and Browsallax projects
- local workspaces and saved links
- **Research Mode** with named investigations, guiding questions, sources, notes, unresolved questions, session export, and Ledger handoff
- **persistent Free Tools Dock** with Research, Workspaces, Reality Ledger, PhiOffice369, Enter the Field, and Browsallax source
- a separate **Field Products · Paid** link to Field Supply for RackMap and other commercial products
- browser-local Reality Ledger receipts
- SHA-256 evidence digests using the Web Crypto API
- Reality Ledger JSON export
- installable PWA manifest
- offline application shell/service worker
- no account and no backend required

### Product boundary

Browsallax keeps free tools and paid products visibly separate. Free utilities live in the Free Tools Dock. Commercial products such as RackMap are discovered through **Field Supply** at `https://field-supply-369.netlify.app/`, under a clearly labeled paid-products section rather than being represented as free software.

### Research Mode authority boundary

Research Mode organizes user-supplied material. It does not claim that a saved source, note, or research conclusion is true. When a source or note is preserved into the Reality Ledger, the resulting receipt is explicitly stamped `SOURCE_ONLY` and keeps provenance separate from interpretation.

### Important web boundary

Browsallax Web does **not** pretend it can embed and control arbitrary websites. Modern browsers enforce same-origin security, and sites can block framing with CSP or `X-Frame-Options`. External destinations therefore open as normal browser tabs. Deep capabilities such as page inspection, permission control, selected-text capture from arbitrary sites, and local-model page analysis belong in Browsallax Desktop.

### Run the web edition locally

```bash
cd web
npm install
npm run dev
```

Production build:

```bash
cd web
npm run build
```

The GitHub Pages workflow in [`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds `web/` and deploys `web/dist` on pushes to `main`.

## Browsallax Desktop

Current desktop features:

- Chromium web rendering through Electron 44
- Multi-tab browsing
- Address + search omnibox
- DuckDuckGo default search/home
- Back, forward, reload, and home navigation
- `target=_blank` / popup links routed into Browsallax tabs
- Persistent browser session
- Sandboxed web content
- `nodeIntegration: false`
- `contextIsolation: true`
- Deny-by-default sensitive permissions
- Local Reality Ledger selected-text capture with source URL, title, UTC timestamp, and SHA-256 integrity digest
- **Browser Operator `PV-BOP-0.2`** on localhost for DOM-first observation, screenshots, governed actions, assertions, resumable local tasks, and hash-chained receipts
- **PhiOS / Super PhiVessel Bridge `PV-BRIDGE-0.1`** with automatic endpoint discovery, portable Node client, CLI, task handoff envelopes, and a live Vessie acceptance example
- **Trusted Super PhiVessel Page Bridge `PV-PAGE-0.1`** using origin-validated Electron IPC and dedicated task tabs without exposing the bearer token or arbitrary user tabs
- Rotating local bearer token plus a five-minute human interactive grant; sensitive actions remain HELD
- Keyboard shortcuts for address focus, tabs, closing tabs, and history navigation

## Reality Ledger capture

### Desktop

Select text on a webpage, right-click, and choose **Capture selection to Reality Ledger**.

Browsallax appends a JSON Lines receipt locally under the Electron user-data directory at:

```text
reality-ledger/web-captures.jsonl
```

### Web

Browsallax Web lets a user type or paste an observation, optionally attach a source URL, and create a local receipt in browser storage. Research Mode can also hand selected sources and notes into the same Ledger. Receipts can be exported as JSON.

In both editions, receipts are explicitly marked `SOURCE_ONLY` and `derived: false`. The capture records provenance and integrity; it does not claim the captured text is true.

## Security posture

Browsallax treats arbitrary web content as untrusted.

In Desktop, the application chrome and web pages are separate. Web pages do not receive Node.js access. The renderer bridge exposes only a small set of browser-navigation messages, while loaded sites run in sandboxed `WebContentsView` instances. A page preload may expose the bounded `window.browsallaxOperator` surface, but the main process accepts that surface only from explicitly trusted origins and never exposes the Browser Operator bearer token or arbitrary-tab access.

For the Desktop alpha, camera, microphone, geolocation, and notifications are denied by default. A human-readable permission ledger and per-site permission controls are planned rather than silently granting capabilities.

Browsallax Web has no privileged backend. Its workspaces, research sessions, and Reality Ledger are kept in local browser storage unless the user explicitly exports them.

## Architecture

```text
┌──────────────────────────────────────────────┐
│                 BROWSALLAX                   │
├──────────────────────┬───────────────────────┤
│ DESKTOP              │ WEB / PWA             │
│ Electron + Chromium  │ React + Vite          │
├──────────────────────┼───────────────────────┤
│ real browser tabs    │ launch/search         │
│ browser permissions  │ local workspaces      │
│ page capture         │ Research Mode         │
│ Browser Operator     │ Reality Ledger        │
│ PhiOS/Vessie Bridge  │ Free Tools Dock       │
│ planned Ollama AI    │ Field Products link   │
│                      │ offline app shell     │
├──────────────────────┴───────────────────────┤
│ Shared design rules                          │
│ local-first • evidence • explicit authority  │
└──────────────────────────────────────────────┘
```

## Roadmap

### Foundation

- [x] secure Electron shell
- [x] tabs and omnibox
- [x] navigation history
- [x] persistent browsing session
- [x] popup-to-tab routing
- [x] deny-by-default sensitive permissions
- [x] selected-text Reality Ledger capture
- [x] React/PWA web companion
- [x] local web workspaces
- [x] local web Reality Ledger + JSON export
- [x] GitHub Pages deployment workflow
- [x] Research Mode
- [x] persistent Free Tools Dock
- [x] separate paid-products link to Field Supply
- [ ] downloads UI
- [ ] history UI
- [ ] bookmarks
- [ ] private windows
- [ ] site information panel

### Governed Browser Operator

- [x] localhost-only Operator API (`PV-BOP-0.2`)
- [x] DOM-first bounded page observation
- [x] screenshot fallback with SHA-256 receipt
- [x] navigation, click/type/select/scroll/wait actions
- [x] URL/text/visibility assertions
- [x] rotating bearer token
- [x] five-minute human mutation grant from browser chrome only
- [x] sensitive actions HELD in v0.1
- [x] hash-chained operator Reality Ledger receipts
- [x] local Ollama task planner with deterministic model selection
- [x] observe → plan → act → verify → replan task loop
- [x] resumable HELD tasks across human authority grants
- [x] deterministic task acceptance assertions before COMPLETE
- [x] one non-terminal task owns a tab at a time
- [x] portable local Operator client (`PV-BOP-CLIENT-0.1`)
- [x] PhiOS / Super PhiVessel bridge (`PV-BRIDGE-0.1`)
- [x] loopback-only endpoint discovery with bearer-token redaction
- [x] `browsallax` local CLI for status, observation, screenshots, tasks, resume, and cancel
- [x] governed starting-URL handoff with preserved navigation provenance
- [x] Super PhiVessel live acceptance example
- [x] trusted Super PhiVessel page bridge (`PV-PAGE-0.1`)
- [x] exact-origin validation with explicit-only development origins
- [x] dedicated Browser Operator task tabs instead of arbitrary user-tab access
- [x] trusted-page task ownership bound to origin + WebContents identity
- [x] trusted-page concurrency bound and nested-task prevention
- [x] page never receives endpoint token or authority-grant methods
- [ ] per-action approval for sensitive mutations
- [ ] local vision interpretation and replay

See [`docs/browser-operator-v0.1.md`](docs/browser-operator-v0.1.md), [`docs/browser-operator-v0.2.md`](docs/browser-operator-v0.2.md), [`docs/browser-operator-v0.3.md`](docs/browser-operator-v0.3.md), and [`docs/browser-operator-v0.4.md`](docs/browser-operator-v0.4.md).

### Live evidence

- [Browsallax Live Acceptance 001 · 2026-09-26](docs/acceptance/Browsallax-Live-Acceptance-001-2026-09-26.md) — first observed live Super PhiVessel trusted-page task completion using local `qwen3:4b`, `PV-PAGE-0.1`, and `PV-BOP-0.2`, completed in one step with no interactive grant.
- [Browsallax Live Interaction 001 · 2026-09-26](docs/interaction/Browsallax-Live-Interaction-001-2026-09-26.md) — first documented successful live conversational exchange inside Browsallax: collaborator `Hello!` → Super PhiVessel `Hello! How can I help you today?`, with the response lane visibly labeled `BrainC Hosted`.
- [Browsallax Live Acceptance 002 · 2026-09-26](docs/acceptance/Browsallax-Live-Acceptance-002-2026-09-26.md) — live `.51.5` regression acceptance for capability distinction, current Browser Operator state grounding, runtime UI truth, and turn-local discipline inside Browsallax.


### Local intelligence

- [ ] optional Ollama discovery on localhost
- [ ] model picker
- [ ] Ask This Page
- [ ] Summarize This Page
- [ ] selected-text AI actions
- [ ] page extraction with explicit source boundaries
- [ ] no cloud dependency required

### Research evolution

- [ ] source annotations and tags
- [ ] contradiction / unresolved-question views
- [ ] research session import
- [ ] cross-session search
- [ ] desktop tab workspaces
- [ ] optional local-model analysis that never overwrites source evidence

### Free tools ecosystem

- [x] web tools dock
- [x] PhiOffice369 launcher
- [x] Enter the Field launcher
- [ ] extensible tool manifest
- [ ] optional user-added tool links
- [ ] tighter integrations with additional free products as stable public URLs are available

### Field products

- [x] Field Supply discovery link
- [x] RackMap remains outside the Free Tools classification
- [ ] optional richer product cards without mixing free and paid categories

## Design rules

1. **Capability is not authority.** AI output is assistance, not truth.
2. **Local first.** Features should work without an account whenever practical.
3. **No hidden behavioral profiling.** Telemetry must never be a surprise.
4. **Permissions are visible.** Powerful capabilities require explicit boundaries.
5. **Sources survive transformations.** Summaries and AI interpretations do not replace evidence.
6. **Free means free.** Core Browsallax functionality is MIT-licensed and does not require a subscription.
7. **Paid means paid.** Commercial products are labeled and routed separately rather than being presented as free ecosystem tools.

## Contributing

Early contributions are welcome. Keep changes small, reviewable, and explicit about any new privilege or data flow they introduce.

## License

MIT License. See [`LICENSE`](LICENSE).
