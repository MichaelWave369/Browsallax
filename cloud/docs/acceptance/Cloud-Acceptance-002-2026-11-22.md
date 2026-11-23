# Browsallax Cloud Acceptance 002: Multi-page research v0.2

**Date:** November 22, 2026 (Pacific); November 23 UTC  
**Outcome:** PASS for two explicit NASA pages and deterministic focused link discovery  
**Local user PC required:** NO  
**Source PR:** #51, `feat/cloud-multipage-research-v02`  
**Private isolated acceptance branch:** `MichaelWave369/browsallax-chat-bridge:test/cloud-v02-acceptance`

## 1. Two explicit public pages

- Request: `cloud-v02-nasa-seeds-20261122-001`
- Hosted private GitHub Actions: **run #7**, ID `45100320762`, conclusion **success**
- Private claim: `cloud-claims/cloud-v02-nasa-seeds-20261122-001.json`
- Private response: `cloud-responses/cloud-v02-nasa-seeds-20261122-001.json`
- Response `state: COMPLETE`, `result.schema: browsallax.cloud.research.v2`,
  `result.disposition: COMPLETE`, `pageCount: 2`, `failures: []`

| Page | Source URL | Characters | SHA-256 of visible text |
|---|---|---:|---|
| P1 | https://www.nasa.gov/ | 3,499 | `ea9bdd4d16ffe0b5ab8a79569f0c3d894fdc309aea45d5bc76268e790078d250` |
| P2 | https://www.nasa.gov/humans-in-space/artemis/ | 7,121 | `f4d9ba512b3b63b8ac62166dbfe961937b2ef8c561c690388cac0e2ba5872f25` |

Index SHA-256: `f53894ae9c8e09741bf7aa7c0a39da232b9f1c68bf3ad512620980fa607dfc53`.

Both pages had an observation timestamp and independent source digest, with zero
reported redirects.

## 2. Automatic focused discovery

- Request: `cloud-v02-nasa-focus-20261122-001`
- Input: one seed URL `https://www.nasa.gov/`, `focus: "Artemis Moon exploration"`,
  `maxPages: 3`, `maxDepth: 1`
- Hosted private GitHub Actions: **run #8**, ID `45100445100`, conclusion **success**
- Response: `COMPLETE`, research disposition `COMPLETE`, `pageCount: 3`, `failures: []`

| Page | Final URL | Why followed | Depth | Characters |
|---|---|---|---:|---:|
| P1 | https://www.nasa.gov/ | Explicit seed | 0 | 3,625 |
| P2 | https://www.nasa.gov/humans-in-space/artemis/ | P1 observed link `L11`, label `Artemis` | 1 | 7,219 |
| P3 | https://www.nasa.gov/moonbase/ | P1 observed link `L10`, label `Moon Base` | 1 | 6,852 |

Page SHA-256:
- P1: `520fc6e5016dcd859a6be3a6b14f3e897622cd8226db1abee40870a70f1714e0`
- P2: `22d09f4be10db9793bd2b0a3ec9e43d300faa4aacd70ee8788455814f401ca54`
- P3: `a0bab31e165f4238fb7d34c6e8e9f16335356d7255c3d8276835195340a8a6ea`

Index SHA-256:
`4681c5f01c92ea17a99ea9948837eda8adbf1c267547bdebbbaa3dadfc7797bd`.

The browser autonomously selected and visited **observed, focus-matching public
links**. No arbitrary click, credential, purchase or manual second-page URL
was used.

## 3. Contract and integration evidence

- Public Browsallax CI: run **#153**, ID `45100412138`, conclusion **success**
- Public Browsallax Cloud CI: run **#11**, ID `45100412125`, conclusion **success**
- Cloud CI includes real two-page Chromium smoke against `example.com`,
  normalization and deny tests, and simulated mailbox claim/execute/response
  integrity with browser reset.
- Private workflow claims before execution and writes the report to private Git
  history. Acceptance was run on a private **test branch** so production remains
  pinned to the previously reviewed v0.1 merge commit.

## Proven vs remaining

**Proven:** hosted multi-page Chromium, two explicit seeds, focus-based
observed-link discovery, per-page source and digest, source-link provenance,
fresh ephemeral browser contexts, no local user machine, and complete
private GitHub mailbox round trips.

**Verified by tests but not an adversarial live website test:** rejection of
disallowed destination hosts, account/logout/checkout/download URL patterns,
non-read HTTP methods and WebSockets, bounded depth/page limits, and safe
document redirect policy.

**Not yet available:** unrestricted-site browsing, multi-site approvals via
ChatGPT, persistent sessions, account logins, interactive site modifications,
directly hosted MCP access, and parity with every TinyFish workflow.
GitHub Actions on private repositories may incur usage limits and charges.
Public content is retained in private Git history.

**Rollout:** keep PR #51 in draft until reviewed. After merge, pin the exact
reviewed merge SHA in the private production workflow and run a post-merge
round-trip. Then update the Browsallax Bridge plugin instructions to advertise
v0.2 on `main`.
