# Browsallax Live Acceptance 005 — Brain Registry Routed Planner

**Date:** 2026-09-26  
**Status:** COMPLETE / PASS  
**Scope:** Registry-routed success plus registry/local-inventory disagreement fail-closed behavior.

## Claim

Browsallax accepts bounded Super Φ.Vessel Brain Registry planner hints as advisory routing input, independently verifies those hints against live local Ollama inventory, successfully uses an approved installed recommendation, and fails closed without legacy fallback when no approved model exists locally.

## Acceptance A — Registry-routed success

Command:

```powershell
npm run accept:nasa-registry
```

Observed:

```text
registryPresent  = true
registryUsed     = true
selectionBasis   = REGISTRY_RECOMMENDED
selectedModel    = qwen3:4b
expectedModel    = qwen3:4b
selectedModelMatches = true
task             = COMPLETE
stepCount        = 1
provider         = OLLAMA_LOCAL
planner          = PV-BOP-PLAN-0.5
router           = PV-BOP-BRR-0.1
authority        = BASELINE_LOCAL_OPERATOR
```

The task completed bounded read-only NASA research while preserving routing provenance and without expanding mutation authority.

## Acceptance B — Registry/local disagreement

Command:

```powershell
npm run accept:registry-fail-closed
```

Observed:

```text
missingModel     = registry-missing-model:latest
installedCount   = 29
registryPresent  = true
registryUsed     = true
selectionBasis   = NO_LOCAL_REGISTRY_APPROVED_PLANNER_MODEL
selectedModel    = null
task             = FAILED
stepCount        = 0
error            = NO_LOCAL_REGISTRY_APPROVED_PLANNER_MODEL
planner          = null
provider         = null
model            = null
noLegacyFallback = true
```

The adversarial task failed before planner execution. No legacy/local fallback escaped the registry-approved pool.

## Combined result

| Property | 005A success path | 005B disagreement path |
|---|---|---|
| Valid registry hint recognized | PASS | PASS |
| Registry provenance preserved | PASS | PASS |
| Local inventory participates in selection | PASS | PASS |
| Approved installed recommendation selected | PASS | N/A |
| Missing approved model fails closed | N/A | PASS |
| Legacy fallback outside registry pool | NO | NO |
| Page chooses executor | NO | NO |
| Registry grants mutation authority | NO | NO |
| Planner dispatch occurs only with valid local selection | PASS | PASS |
| Terminal state truthful | COMPLETE | FAILED at step 0 |

## Architecture validated

```text
SUPER Φ.VESSEL / BRAIN REGISTRY
          │
          │ advisory planner hint
          ▼
BROWSALLAX
          │
          ├── normalize + validate hint
          │
          ├── intersect with local Ollama inventory
          │
          └── preserve route provenance
                   │
          ┌────────┴────────┐
          │                 │
 approved + installed   no approved local model
          │                 │
          ▼                 ▼
REGISTRY_RECOMMENDED   FAIL CLOSED
          │                 │
          ▼                 └── no legacy fallback
 local planner
          │
          ▼
governed browser task
```

## Authority result

Live Acceptance 005 supports these implementation laws:

```text
BRAIN REGISTRY != authority
PLANNER HINT != authority
PAGE != executor selector

LOCAL INVENTORY = execution reality
BROWSALLAX POLICY = browser enforcement
HUMAN GRANT = bounded mutation authority
```

## Files

- [005A — Registry-routed success](Browsallax-Live-Acceptance-005A-2026-09-26.md)
- [005B — Registry/local disagreement fail-closed](Browsallax-Live-Acceptance-005B-2026-09-26.md)

## Next boundary

Browsallax routing is no longer the primary suspect in the remaining Super Φ.Vessel browser failure.

The next investigation boundary is Super Φ.Vessel's browser-intent / provider orchestration path before or around trusted Browser Operator task creation. Explicit governed browser work should not require an unrelated provider completion to succeed before the Browsallax task can start.
