# Browsallax Live Acceptance 005A — Brain Registry Routed Planner Success

**Date:** 2026-09-26  
**Status:** PASS  
**Scope:** Success half of Live Acceptance 005. The adversarial half is preserved separately as 005B.

## Purpose

Verify that a Super Φ.Vessel-style Brain Registry planner hint can be handed to Browsallax, independently checked against live Ollama inventory, selected under the registry contract, and used to complete bounded read-only research without expanding browser authority.

## Runtime command

```powershell
npm run accept:nasa-registry
```

## Observed route

```text
Brain Registry hint
  registryVersion = diag-live-1
  routerVersion   = diag-live-1
  routingMode     = AUTO
  role            = utility
  approvedModels  = [qwen3:4b]
  recommended     = qwen3:4b
        ↓
Browsallax local Ollama inventory
        ↓
REGISTRY_RECOMMENDED
        ↓
qwen3:4b
        ↓
PV-BOP-PLAN-0.5
        ↓
NASA News
        ↓
COMPLETE · step 1
```

## Acceptance result

| Check | Result |
|---|---|
| Task completed | PASS |
| Brain Registry hint present on task | PASS |
| Brain Registry route used | PASS |
| Selection basis | `REGISTRY_RECOMMENDED` |
| Selected model | `qwen3:4b` |
| Selected model matched recommended model | PASS |
| Planner provider | `OLLAMA_LOCAL` |
| Planner schema constrained | PASS |
| Planner attempts | 1 |
| Browser Operator router | `PV-BOP-BRR-0.1` |
| Browser planner | `PV-BOP-PLAN-0.5` |
| Read-only completion contract | `PV-BOP-RRC-0.1` |
| Browser bridge | `PV-BRIDGE-0.2` |
| Mutation authority expanded | NO |
| Navigation authority basis | `BASELINE_LOCAL_OPERATOR` |
| Failure diagnostics | none |

## Observed research result

The task reported the newest observable NASA News article title as:

> NASA, Boeing to Provide Update on Starliner Development

The source URL preserved by the task was:

```text
https://www.nasa.gov/news/
```

The purpose of this acceptance is the governed execution path and routing provenance. It is not a claim that this article title remains the newest NASA article after the observation time.

## Authority result

The route demonstrates:

```text
BRAIN REGISTRY != authority
PLANNER HINT != authority
MODEL SELECTION != browser mutation authority

BROWSALLAX POLICY = enforcement
LOCAL OLLAMA INVENTORY = execution reality
BASELINE_LOCAL_OPERATOR = read-only/navigation authority
```

No interactive mutation grant was required or promoted by this task.

## What this acceptance closes

005A closes the success-path questions:

- Can a registry hint reach the Browser Operator task? **Yes.**
- Can Browsallax independently verify the recommended model is installed locally? **Yes.**
- Can the registry recommendation become the selected planner without giving the page executor authority? **Yes.**
- Is route provenance preserved in the final task receipt? **Yes.**
- Does bounded NASA read-only research still complete? **Yes.**

## Companion acceptance

The adversarial half is now complete:

- [005B — Registry/local inventory disagreement fails closed](Browsallax-Live-Acceptance-005B-2026-09-26.md)
- [Combined Live Acceptance 005](Browsallax-Live-Acceptance-005-2026-09-26.md)

005A remains the positive-path evidence record; 005B preserves the fail-closed disagreement path.
