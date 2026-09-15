# BROWSALLAX

**A free browser for humans, machines, and everything in between.**

Browsallax is an MIT-licensed, local-first desktop browser built on Chromium through Electron. The goal is not to invent another rendering engine. The goal is to build a transparent, useful browser shell around the web with better privacy boundaries, local intelligence, evidence capture, and an open ecosystem of free tools.

> **Status:** `v0.1.0-alpha.1` bootstrap. Browsallax is usable as an experimental browser shell, but it is not yet hardened for daily-driver use.

## What works now

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
- Keyboard shortcuts:
  - `Ctrl/Cmd + L` focus address bar
  - `Ctrl/Cmd + T` new tab
  - `Ctrl/Cmd + W` close tab
  - `Alt + Left/Right` history navigation

## Security posture

Browsallax treats arbitrary web content as untrusted.

The application chrome and web pages are separate. Web pages do not receive Node.js access. The renderer bridge exposes only a small set of browser-navigation messages, while loaded sites run in sandboxed `WebContentsView` instances.

For this alpha, camera, microphone, geolocation, and notifications are denied by default. A human-readable permission ledger and per-site permission controls are planned rather than silently granting capabilities.

## Run it

Requirements:

- Node.js 24+
- npm

```bash
npm install
npm start
```

For a quick JavaScript syntax check:

```bash
npm run check
```

## Architecture

```text
┌────────────────────────────────────────────┐
│               BROWSALLAX                   │
├────────────────────────────────────────────┤
│ Local browser chrome                       │
│ tabs • omnibox • navigation • status       │
├────────────────────────────────────────────┤
│ Sandboxed WebContentsView tabs             │
│ Chromium pages, isolated from Node.js      │
├────────────────────────────────────────────┤
│ Minimal IPC boundary                       │
│ explicit commands only                     │
├────────────────────────────────────────────┤
│ Planned local capability layer             │
│ Ollama • Reality Ledger • free tools       │
└────────────────────────────────────────────┘
```

## Roadmap

### v0.1 foundation

- [x] secure Electron shell
- [x] tabs
- [x] omnibox
- [x] navigation history
- [x] persistent browsing session
- [x] popup-to-tab routing
- [x] deny-by-default sensitive permissions
- [ ] downloads UI
- [ ] history UI
- [ ] bookmarks
- [ ] private windows
- [ ] site information panel

### v0.2 local intelligence

- [ ] optional Ollama discovery on localhost
- [ ] model picker
- [ ] Ask This Page
- [ ] Summarize This Page
- [ ] selected-text actions
- [ ] page extraction with explicit source boundaries
- [ ] no cloud dependency required

### v0.3 evidence + workspaces

- [ ] Reality Ledger capture
- [ ] source URL + timestamp + content hash
- [ ] research sessions
- [ ] annotations
- [ ] tab workspaces
- [ ] contradiction / unresolved-question tracking without claiming truth authority

### v0.4 free tools ecosystem

- [ ] tools dock
- [ ] RackMap launcher/integration
- [ ] Super PhiVessel launcher/integration
- [ ] Reality Ledger UI
- [ ] extensible manifest for additional free tools

## Design rules

1. **Capability is not authority.** AI output is assistance, not truth.
2. **Local first.** Features should work without an account whenever practical.
3. **No hidden behavioral profiling.** Telemetry must never be a surprise.
4. **Permissions are visible.** Powerful capabilities require explicit boundaries.
5. **Sources survive transformations.** Summaries and AI interpretations do not replace evidence.
6. **Free means free.** Core Browsallax functionality is MIT-licensed and does not require a subscription.

## Contributing

Early contributions are welcome. Keep changes small, reviewable, and explicit about any new privilege or data flow they introduce.

## License

MIT License. See [`LICENSE`](LICENSE).
