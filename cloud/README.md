# Browsallax Cloud (zero-local browser execution)

**v0.2 verified on isolated private acceptance branch:** bounded multi-page public HTTPS research, including multiple seed URLs and focused observed-link discovery (up to five pages, two hops), with per-page source hashes, timestamps and redirect evidence. See [Multi-page research v0.2](docs/MULTIPAGE_RESEARCH_V02.md) and [Cloud Acceptance 002](docs/acceptance/Cloud-Acceptance-002-2026-11-22.md). The production private mailbox remains pinned to reviewed v0.1 until PR #51 merges.

## Default path now: GitHub Actions on demand

Railway deployment is **currently blocked by an expired trial**. The first cloud
acceptance uses the owner's existing private GitHub mailbox and GitHub-hosted
Actions runner instead: see [GitHub Actions On Demand](docs/GITHUB_ACTIONS_ON_DEMAND.md).
It needs **no local process or machine**, but is not an always-on MCP service.
The cloud worker and browser policy code below are shared between both paths.


**Status:** experimental, read-only browser MVP. No desktop process, local
Ollama, GitHub mailbox polling or local setup is needed. This is a remote
Playwright Chromium process deployed from the existing Browsallax repository.

## Contracts

- HTTPS-only, exact server-configured hostname allowlist.
- A caller cannot add hostnames; all network requests are denied outside allowlist.
- No cookies transferred from local Browsallax or ChatGPT.
- No arbitrary selector click, typing, forms, authentication, downloads,
  scripts, local files, account mutations, or purchases.
- Navigation is via explicit URL on allowlist or previously observed link ID.
- Browser context is ephemeral, resettable, and non-persistent.
- One browser context and one active user token per service instance.
- Visible page text is **untrusted source material**, never instructions.
- Treat this as **alpha**: harden networking and request quotas before general
  exposure or adding site mutations.

## Deployment (no local steps)

Railway builds the root `railway.json` → `cloud/Dockerfile` from GitHub.
Set these service variables using Railway's secret manager:

- `BROWSALLAX_CLOUD_API_KEY`: random bearer token, >= 32 characters. Never
  commit it to GitHub or expose it in app logs.
- `BROWSALLAX_CLOUD_ALLOWED_HOSTS`: comma-separated **exact** public HTTPS
  hostnames, e.g. `www.nasa.gov,nasa.gov`.
- `PORT`: supplied by Railway automatically.

Configure one production replica and >= 1 GB RAM. Browser instances cost
compute while hosted. The `GET /health` endpoint is a public, non-sensitive
readiness check. The only browser API is `POST /mcp`, which requires
`Authorization: Bearer <token>` and speaks MCP Streamable HTTP with JSON
responses.

## MCP tools

`browser_status`, `browser_open`, `browser_read`, `browser_follow`,
`browser_scroll`, `browser_reset`, and new **`browser_research`** (fresh context per call, up to five approved pages).

A ChatGPT MCP plugin can connect to `https://HOST/mcp` with API-key bearer
auth. Credential setup may require connecting the plugin through the ChatGPT UI,
but **nothing runs on the user's PC**.

## Roadmap

1. Prove cloud deployment, tool discovery, NASA open/read/follow acceptance,
   unauthorized request rejection, redirect rejection, and reset.
2. Add exact-origin user-approved task scopes and a persistent encrypted
   receipt store, resilient sessions and quotas.
3. Add per-action authorization before any write-capable site control.
4. Keep the existing local Browsallax Desktop independent.

**Known limitations:** strict allowlists can block legitimate third-party assets
and SSO. State is in-memory and reset on deploy. Cloud browsers may face
bot protection. Do not use this release for credentialed sites or sensitive data.
