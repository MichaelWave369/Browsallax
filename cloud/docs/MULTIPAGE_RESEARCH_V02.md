# Browsallax Cloud 0.2: bounded multi-page research

Browsallax can run **without a local PC, Ollama, Desktop, or Windows agent**.
The existing private GitHub mailbox is the tested route. Each request launches
a fresh ephemeral Playwright Chromium context on GitHub Actions, visits allowed
public HTTPS pages, captures their content and source provenance, then closes
the context. A remote MCP `browser_research` tool is included for a future
persistently hosted service, but no always-on MCP endpoint is deployed.

## Request contract (backward compatible)

`browser.research` retains the existing schema and one-page `payload.url`
behavior. For multi-page mode, send optional bounded fields:

```json
{
  "schema": "browsallax.github-cloud.request.v1",
  "id": "cloud-example-20261122-002",
  "operation": "browser.research",
  "payload": {
    "url": "https://www.nasa.gov/",
    "additionalUrls": [
      "https://www.nasa.gov/humans-in-space/artemis/"
    ],
    "maxPages": 2,
    "maxDepth": 0
  },
  "createdAt": "2026-11-22T22:00:00.000Z",
  "expiresAt": "2026-11-22T22:10:00.000Z"
}
```

Times above are illustrative. Use current UTC timestamps when issuing requests.

For topic-focused discovery, omit `additionalUrls` and set `maxDepth` to
1 or 2 with a focus phrase:

```json
{
  "url": "https://www.nasa.gov/",
  "maxPages": 3,
  "maxDepth": 1,
  "focus": "Artemis Moon exploration"
}
```

The browser ranks only **observed links** whose displayed text or path matches
the focus terms. No arbitrary AI-generated clicks or invented selectors.

## Fixed safety limits

| Boundary | Limit |
|---|---|
| Pages per request | 1–5, including explicit URLs |
| Automatic link depth | 0–2, focus required |
| Additional explicit URLs | Up to 4, each checked against server allowlist |
| URL scope | Exact locally configured public HTTPS hostnames |
| Visible text per page | 16,000 characters |
| Returned link references | Up to 40 per page |
| Requests / response files | Private mailbox only |
| Cookies/sessions | Fresh ephemeral context per job, discarded after completion |
| Page mutations | No typing, submitting, buttons, login, checkout, purchases |
| Network | HTTPS allowed-host requests; block POST, PUT, PATCH, DELETE and WebSockets |

Document navigation also rejects common account, logout, checkout, download,
or sensitive query destinations **before following a redirect**. Cross-host
requests are blocked unless that exact hostname is in the server policy.
Page-supplied instructions are **untrusted source content**; they never change
allowed hosts, scope, request schema or authority.

The private runner currently fixes `BROWSALLAX_CLOUD_ALLOWED_HOSTS` to
`example.com,www.nasa.gov,nasa.gov`. Expanding the allowlist requires an
explicit repository policy change; the user request cannot override it.
This is not an unrestricted internet browser or a replacement for all TinyFish
workflows yet.

## Evidence and failure behavior

The response result is `browsallax.cloud.research.v2`, containing:

- `pages[]`: `P1`–`P5`, requested and final source URLs, title, visible
  text, per-page SHA-256 text hash, observation time, depth, and parent link
  ID/label for auto-followed pages
- `httpStatus` and bounded `redirectChain` when provided by Chromium
- `indexSha256`: SHA-256 digest over ordered page index metadata
- `disposition`: `COMPLETE` or `PARTIAL`; `failures[]` records page
  errors rather than pretending to have evidence
- Explicit `authority` and `source` provenance

One failed seed may produce `PARTIAL` with the successfully observed pages.
If **no page** succeeds, the request fails and does not manufacture sources.
The containing mailbox response uses `state: COMPLETE` for a successfully
returned structured report; inspect `result.disposition` for partial coverage.

The transport preserves existing immutable request, claim-before-execute,
no-replay, and bounded-expiry behavior. Results committed into private Git
history are durable: **do not request private pages or credentials**.

## Live acceptance requirements

1. Run cloud policy/contract tests and two-page Chromium CI.
2. Pin the reviewed merge SHA in the private runner (never auto-track unreviewed
   code).
3. Create a new current-time private request covering at least two NASA pages
   and verify cloud claim, response, two distinct source URLs, timestamps,
   digests, and zero-local execution.
4. Test focused discovery and failure boundaries.
5. Acceptance evidence is recorded in
   [Cloud Acceptance 002](acceptance/Cloud-Acceptance-002-2026-11-22.md):
   both the explicit two-page and focused-link discovery runs passed in a
   private test branch. Production rollout awaits review and a pinned merge SHA.
   Write-capable site controls remain out of scope pending an explicit human
   authority framework.
