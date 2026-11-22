# Browsallax Cloud Acceptance 001: ChatGPT → Hosted Chromium → Private Result

**Date:** November 22, 2026
**Status:** PASS for cloud-only, read-only, exact-allowlist observation.
**Local PC required:** No.
**Source branch:** `feat/browsallax-cloud-browser` (PR #50).

## Architecture under test

```
ChatGPT (connected GitHub writer)
  → private browsallax-chat-bridge/cloud-requests/<id>.json
  → GitHub Actions hosted Playwright Chromium container
  → private cloud-claims/<id>.json (committed before execution)
  → HTTPS website observation
  → private cloud-responses/<id>.json
  → ChatGPT (connected GitHub reader)
```

The hosted runner uses a GitHub Actions container with
`mcr.microsoft.com/playwright:v1.65.1-noble`, exact-host HTTPS allowlisting,
a fresh browser context, no imported cookies, and no mutation APIs.

## Evidence 1: Simple public page

- Private request: `cloud-acceptance-20261122-003`
- Private Actions run: **#4**, ID `45074262362`, conclusion **success**
- Claim: `cloud-claims/cloud-acceptance-20261122-003.json` committed
- Response: `cloud-responses/cloud-acceptance-20261122-003.json` committed
- Response state: `COMPLETE`
- Observed title: `Example Domain`
- Final URL: `https://example.com/`
- Observed visible-text digest (SHA-256):
  `aa8c4320fabb468930b605f5f365b1beaf2ac42b081eed50083e26d26cb3c159`
- Evidence: visible text returned in multiple languages; source marked
  `BROWSALLAX_CLOUD_PLAYWRIGHT`.
- No local Windows agent, Browsallax Desktop, or Ollama involved.

## Evidence 2: Content-heavy public site

- Private request: `cloud-nasa-20261122-001`
- Private Actions run: **#5**, ID `45074421187`, conclusion **success**
- Both claim and response committed in private mailbox
- Response state: `COMPLETE`
- Observed title: `NASA`
- Final URL: `https://www.nasa.gov/`
- Observed links: **43** bounded, observed navigation references, including
  an Artemis link `L8` to `https://www.nasa.gov/humans-in-space/artemis/`
- Observed visible-text digest (SHA-256):
  `b008223814b3ae357476f1f81d8a704c2660db5595793e813c3df395abdd0e2f`
- Source marked `BROWSALLAX_CLOUD_PLAYWRIGHT`.

The returned page data is evidence only. Its content is not instructions or
authority for any automation.

## Build/test evidence

- Public Browsallax CI: run **#149**, conclusion **success**
- Public Browsallax Cloud CI: run **#7**, conclusion **success**
- Cloud CI includes hosted Chromium opening `https://example.com/`, as well
  as security policy and request-schema tests.

## Known boundaries and remaining milestones

**Proven:** no-local operation, cloud Chromium launch, navigation, public page
observation, evidence return, claim-before-execute semantics, exact allowed HTTPS
hostnames, bounded links, content digest, and private GitHub transport.

**Not yet proven:** automated link-following across a second page, arbitrary
site access, authenticated accounts, interactive form handling, sensitive-action
approvals, encrypted durable session persistence, native hosted MCP integration,
or full TinyFish workflow parity.

GitHub Actions has startup latency, usage quotas and potential billing on
private repos. Public web content returned through the private mailbox is
retained in Git history, so this path is not appropriate for sensitive sites.
Railway persistent deployment was blocked by an expired trial. A cloud MCP
server implementation exists but was **not** deployed.

The private diagnostic PR #1 was closed after discovering and fixing the
runner checkout working-directory and `git safe.directory` issues.
