# Browsallax Cloud, zero-local GitHub Actions lane

This path works even if Railway cannot host an always-on worker.
A ChatGPT GitHub connector creates one **immutable** cloud request in the
private `MichaelWave369/browsallax-chat-bridge` repository. A GitHub Actions
runner opens a fresh sandboxed, read-only Chromium session with Playwright,
writes a claim BEFORE opening a page, and commits the bounded observation back
to the private mailbox. **No PC, no Windows agent, no local browser required.**

The runner uses only `browser.research`. Its original one-page contract
remains supported; v0.2 adds up to five allowlisted public HTTPS pages,
explicit seed URLs, or topic-focused observed-link discovery within two hops.
It returns source URLs, titles, visible text, per-page hashes, timestamps,
redirect provenance, and an overall index digest.
See [Multi-page research v0.2](MULTIPAGE_RESEARCH_V02.md). It cannot type, click buttons, execute arbitrary commands,
log into accounts, transfer cookies, install software, buy, or post.

## Request file

`cloud-requests/<unique-id>.json`

```json
{
  "schema": "browsallax.github-cloud.request.v1",
  "id": "cloud-acceptance-20261122-001",
  "operation": "browser.research",
  "payload": { "url": "https://example.com/" },
  "createdAt": "2026-11-22T21:00:00.000Z",
  "expiresAt": "2026-11-22T21:10:00.000Z"
}
```

Use current timestamps when sending real requests, with at most a 15-minute TTL.
A push to `cloud-requests/**` triggers the private mailbox workflow. The
workflow commits `cloud-claims/<id>.json` before browser execution, then
`cloud-responses/<id>.json`. Previously claimed requests never replay after
a crash. Results contain source text and may remain in **private Git history**;
never use this lane for logged-in, private, or sensitive pages.

## Production prerequisites and limits

- The workflow belongs to the **private** mailbox repository and needs Actions
  enabled with normal `GITHUB_TOKEN` contents:write permission.
- It checks out the browser worker source from Browsallax. Pin a reviewed SHA
  after the test phase, and update that pin when upgrading.
- The worker uses Playwright's official browser container. GitHub-hosted
  Actions minutes and quotas apply, especially on private repos. This is
  on-demand execution, NOT an always-on browser with persistent cookies.
- Approved destination hostnames are fixed by the workflow owner; callers
  cannot expand them.
- When a request is made from ChatGPT, inspect the response commit and state,
  not just the existence of a request. Missing claim/response means the runner
  did not complete or Actions was unavailable.
- Remote websites can block datacenter browsers. A response is not guaranteed.

## Next rungs

1. Verify example.com, then NASA, using the private mailbox.
2. Add job status and deterministic source hashes to the hosted workflow.
3. Connect the remote MCP service once cloud hosting is available.
4. Add explicit per-action approvals before any write-capable automation.
