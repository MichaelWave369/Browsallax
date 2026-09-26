# Browsallax Live Acceptance 005B — Registry / Local Inventory Disagreement Fails Closed

**Date:** 2026-09-26  
**Status:** PASS  
**Scope:** Adversarial half of Live Acceptance 005.

## Purpose

Verify that a valid Brain Registry planner hint cannot cause Browsallax to silently fall back to a legacy/local planner preference when every registry-approved planner model is absent from the live local Ollama inventory.

## Runtime command

```powershell
npm run accept:registry-fail-closed
```

## Adversarial input

The harness intentionally supplied a registry-approved and recommended model that was not installed locally:

```text
missingModel     = registry-missing-model:latest
installedCount   = 29
registryVersion  = diag-fail-closed-1
routerVersion    = diag-fail-closed-1
routingMode      = AUTO
role             = utility
approvedPool     = [registry-missing-model:latest]
candidateCount   = 1
```

## Observed acceptance result

```text
RUNNING · step 0
FAILED  · step 0
registry YES
basis NO_LOCAL_REGISTRY_APPROVED_PLANNER_MODEL
```

The harness reported:

| Check | Result |
|---|---|
| Failed disposition | PASS |
| Step count zero | PASS |
| Expected error | PASS |
| Registry hint present | PASS |
| Registry used | PASS |
| Selection basis | `NO_LOCAL_REGISTRY_APPROVED_PLANNER_MODEL` |
| Selected model | `null` |
| Selected model is null | PASS |
| No legacy fallback | PASS |

## Task result

The final task receipt reported:

```text
status     = FAILED
stepCount  = 0
result     = null
error      = NO_LOCAL_REGISTRY_APPROVED_PLANNER_MODEL
planner    = null
```

Failure diagnostics preserved the Brain Registry route:

```text
version           = PV-BOP-BRR-0.1
registryUsed      = true
selectionBasis    = NO_LOCAL_REGISTRY_APPROVED_PLANNER_MODEL
selectedModel     = null
registryVersion   = diag-fail-closed-1
routerVersion     = diag-fail-closed-1
routingMode       = AUTO
role              = utility
approvedPoolCount = 1
candidateCount    = 1
```

Planner dispatch fields remained null:

```text
plannerVersion    = null
provider          = null
model             = null
attempts          = null
rawResponseChars  = null
rawResponseSha256 = null
validationError   = null
readOnlyResearch  = null
```

No planner/provider was dispatched after the registry/local inventory disagreement.

## Navigation and authority

The initial NASA navigation remained allowed under:

```text
BASELINE_LOCAL_OPERATOR
```

The bridge receipt preserved:

```text
authority = BRIDGE_ONLY_NO_AUTHORITY_ESCALATION
```

The failed planner selection did not create or expand browser mutation authority.

## Security result

The observed route establishes:

```text
VALID REGISTRY HINT
        ↓
NO APPROVED MODEL IN LOCAL INVENTORY
        ↓
NO_LOCAL_REGISTRY_APPROVED_PLANNER_MODEL
        ↓
selectedModel = null
        ↓
NO LEGACY LOCAL FALLBACK
        ↓
NO PLANNER DISPATCH
```

This validates the intended rule:

> A present Brain Registry hint constrains planner selection to the approved local pool. It does not authorize silent fallback outside that pool.

## What this acceptance closes

005B closes the disagreement case:

- Can a valid registry hint be recognized? **Yes.**
- Does Browsallax preserve registry provenance? **Yes.**
- Does an absent approved local model fail at step 0? **Yes.**
- Is the exact fail-closed error preserved? **Yes.**
- Is a legacy/local fallback selected anyway? **No.**
- Is a planner/provider dispatched anyway? **No.**

Together with 005A, Live Acceptance 005 is complete.
