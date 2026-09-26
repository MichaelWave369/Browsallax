# Browsallax Live Acceptance 004

**Date:** 2026-09-26  
**Evidence class:** Human-observed bounded multi-step read-only research acceptance  
**Verdict:** PASS

## Purpose

Preserve the first successful live multi-step research completion after introducing **PV-BOP-RRC-0.1 Read-Only Research Completion** and **PV-BOP-PLAN-0.4**.

This acceptance specifically closes the earlier regression where the same NASA research request reached `MAX_STEPS_REACHED`.

## Live request 1 — NASA bounded research

```text
Browse NASA's website and tell me the title of the newest news article you can currently observe. Tell me the source you used.
```

## Observed response

```text
The newest news article I can currently observe on NASA’s site is titled "NASA, Boeing to Provide Update on Starliner Development." Source: NASA News (https://www.nasa.gov/news/). I fetched this via the Vessel’s governed read-only browser operator; it’s an observed page context only.
```

## Acceptance result

- The request completed without `MAX_STEPS_REACHED`.
- A specific observed article title was returned.
- The source URL was preserved.
- The response explicitly framed the result as observed page context only.
- No mutation authority was required for the reported result.
- The research loop terminated once sufficient evidence was available.

## Live request 2 — known-good control

```text
Browse https://www.enterthefield.org and tell me what page title and main heading you can currently observe.
```

## Observed response

```text
Page title observed: "Arrival Field". Main heading observed: "◌ Enter the Field". Source: https://www.enterthefield.org — observed via the Vessel’s governed read-only browser operator (read-only browsing available now); the observation reports no uncertainty.
```

## Control result

- The previously successful direct read-only observation path remained functional.
- The title and main heading were both returned.
- The source URL was preserved.
- No regression was observed in the simpler direct-observation path.

## Contract context

```text
PV-BOP-RRC-0.1   Read-Only Research Completion
PV-BOP-PLAN-0.4  Schema-constrained planner + research completion integration
PV-BOP-0.2       Browser Operator
PV-PAGE-0.1      Trusted page bridge
```

## Regression closed

Before `PV-BOP-RRC-0.1`:

```text
NASA task
→ planner remained active
→ STEP_COUNT=10
→ ERROR=MAX_STEPS_REACHED
→ PAGE_EVIDENCE_AVAILABLE=NO
```

After `PV-BOP-RRC-0.1`:

```text
NASA task
→ sufficient observed evidence found
→ planner terminates
→ article title returned
→ source preserved
→ observed-page-only authority retained
```

## Acceptance assertions

```text
MULTI_STEP_RESEARCH_COMPLETED       PASS
MAX_STEPS_REGRESSION_REMOVED        PASS
SOURCE_PRESERVED                    PASS
OBSERVED_CONTEXT_BOUNDARY           PASS
READ_ONLY_AUTHORITY_PATH            PASS
KNOWN_GOOD_DIRECT_CONTROL           PASS
NO CONTROL_REGRESSION               PASS
```

## Evidence boundary

This record is based on the live response text supplied by the human operator.

No machine-local Browser Operator task receipt, Reality Ledger hash, raw page snapshot, screenshot, or task-history export was imported into this record.

The NASA headline and Enter the Field page fields are therefore preserved here as **human-observed live application output**, not independently re-verified external web claims.

```text
LIVE HUMAN OBSERVATION        PASS
APPLICATION OUTPUT PRESERVED  YES
EXTERNAL WEB REVERIFICATION   NOT PERFORMED
LOCAL TASK RECEIPT IMPORTED   NO
TRUTH PROMOTION               NONE
```

## Relationship to earlier records

- **Live Acceptance 001** — first successful governed Browser Operator task.
- **Live Interaction 001** — first successful live conversational exchange.
- **Live Acceptance 002** — runtime self-knowledge / Runtime UI Truth regression acceptance.
- **Live Acceptance 003** — first end-to-end conversational read-only live web observation without an active mutation grant.
- **Live Acceptance 004** — first bounded multi-step read-only research completion closing the `MAX_STEPS_REACHED` regression.
