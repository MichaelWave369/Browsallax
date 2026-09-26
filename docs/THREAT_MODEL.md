# Browsallax Threat Model

**Status:** Alpha threat model for Browsallax Desktop `0.5.0-alpha.6` and Browser Operator `PV-BOP-0.2`.

Browsallax is a local-first browser project with a governed automation layer. Its security model is intentionally conservative: **capability is not authority**. A model, webpage, registry, tool, or successful observation does not grant permission to mutate remote state.

This document describes the current implementation, not an aspirational security claim.

## Core trust rules

```text
WEBPAGE != authority
MODEL != authority
BRAIN REGISTRY != authority
PLANNER HINT != authority
RECEIPT != authority

LOCAL OPERATOR = authority source
BROWSALLAX POLICY = enforcement
HUMAN GRANT = bounded mutation authority
OLLAMA INVENTORY = execution reality
```

## Assets to protect

Browsallax currently treats the following as security-relevant assets:

- the user's browser session and tabs;
- the local Browser Operator bearer token;
- human interactive grants;
- local-model selection boundaries;
- task ownership and trusted-page origin identity;
- captured source material and provenance;
- Browser Operator and Reality Ledger receipts;
- local filesystem data written under the Electron user-data directory;
- secrets typed by the user into ordinary webpages.

## Threat actors and failure sources

The current design considers these classes of threat:

1. **Malicious or compromised webpages**
   - prompt injection;
   - deceptive controls or labels;
   - malicious links;
   - attempts to trigger privileged browser capabilities;
   - attempts to impersonate a trusted origin.

2. **Unreliable or manipulated model output**
   - malformed structured output;
   - invented selectors;
   - attempts to exceed the allowed action vocabulary;
   - planner wandering;
   - recommendation of unavailable or unapproved models.

3. **Compromised or over-privileged local tools**
   - local processes able to read the user's files;
   - processes able to discover the local Operator endpoint;
   - processes running with the same operating-system account.

4. **Accidental operator mistakes**
   - broad grants;
   - wrong target tabs or URLs;
   - misunderstood task scope;
   - stale assumptions about model availability.

5. **Local data tampering or deletion**
   - modification or deletion of JSONL receipts;
   - modification of captured screenshots;
   - removal of local endpoint or Ledger files.

## Security boundaries

### Web content boundary

Browsallax Desktop loads websites inside sandboxed Electron `WebContentsView` instances.

Current protections include:

- Electron sandbox enabled;
- `nodeIntegration: false`;
- `contextIsolation: true`;
- unsafe URL schemes rejected by browser navigation logic;
- popup requests routed through Browsallax tab creation instead of being granted arbitrary new privileged windows;
- sensitive browser permissions denied by default, with only fullscreen and sanitized clipboard write currently allowed by the session handler.

These controls reduce the privilege of loaded pages. They do **not** make arbitrary websites trustworthy.

### Trusted Super Φ.Vessel page bridge

The trusted-page bridge is a narrow Electron IPC surface intended for explicitly approved origins.

Current invariants:

- exact origin validation is required;
- the canonical trusted origin is `https://superphivessel.netlify.app`;
- development origins require explicit environment configuration;
- look-alike origins do not match;
- a trusted page cannot obtain the Browser Operator bearer token;
- a trusted page cannot grant itself mutation authority;
- a trusted page cannot select an executor directly;
- Brain Registry hints are advisory;
- task ownership is bound to both origin and Electron `WebContents` identity;
- trusted-page tasks run in dedicated task tabs;
- nested trusted-page task creation is blocked;
- active trusted-page task count is bounded per owner;
- closing the trusted sender cancels its non-terminal tasks.

Trusting an origin is therefore permission to request a bounded Browser Operator task, **not** permission to bypass Browser Operator policy.

### Local Browser Operator endpoint

The Browser Operator binds to loopback only.

At server startup:

- a fresh 32-byte random bearer token is generated;
- the endpoint descriptor is written under the Electron user-data directory as `operator/endpoint.json`;
- the file is requested with mode `0600` where the platform supports it;
- authenticated Operator requests require the bearer token;
- the endpoint file is deleted when the Operator service closes.

The client rejects non-loopback endpoint hosts and never exposes the bearer token in its public descriptor.

**Important limitation:** this is a same-user local boundary, not an OS security sandbox. A malicious process running with sufficient access under the same operating-system account may be able to read local files or interfere with the process.

### Human interactive grants

Read-only actions and ordinary navigation are baseline local capabilities.

Mutation behavior is different:

- form input and ordinary remote mutation require a current human interactive grant;
- the grant is created from Browsallax browser chrome;
- the current grant lifetime is five minutes;
- expiration is checked at use time;
- grants can be revoked from browser chrome;
- grants are cleared during application shutdown;
- sensitive actions remain HELD even when a broad interactive grant exists.

Sensitive classification currently includes destructive operations, payments, credentials, security changes, publishing/deployment actions, transfers, and similar high-impact terms or fields.

Per-action approval for sensitive mutation is **not implemented yet**.

### Model and Brain Registry boundary

The local planner uses a bounded action grammar and schema-constrained output.

Brain Registry routing follows these rules:

- a registry recommendation is advisory;
- Browsallax independently compares it with the live local Ollama inventory;
- an explicit local Browsallax operator override has priority when configured and installed;
- a registry-recommended model is usable only when both approved by the registry hint and installed locally;
- approved candidate/configured-role fallbacks remain inside the supplied registry-approved pool;
- if a registry hint exists and no approved model exists locally, routing fails closed;
- legacy local fallback preferences are used only when no registry hint is supplied;
- a webpage cannot turn a routing recommendation into execution authority.

The route receipt records the selection basis and model provenance.

### Planner-output boundary

Planner responses are treated as untrusted model output.

Current controls include:

- JSON Schema-constrained Ollama output;
- `think=false`;
- temperature zero;
- a fixed action vocabulary;
- local validation of required action fields;
- one bounded structured-output repair attempt;
- read-only research enforcement that can repair or reject planner actions;
- bounded failure diagnostics;
- raw malformed model output is hashed and counted but not promoted into task results.

### Reality Ledger and Browser Operator receipts

Browser Operator receipts are append-only during normal application execution and include:

- monotonically increasing sequence number;
- timestamp;
- previous receipt hash;
- canonicalized receipt data;
- SHA-256 receipt hash.

Selected-text capture receipts also preserve source URL/title, timestamp, content digest, and `SOURCE_ONLY` authority semantics.

**Important limitation:** the local JSONL files are **tamper-evident by structure, not tamper-proof storage**. A user or process with filesystem access can edit or delete them. Browsallax does not currently anchor receipt roots to an external transparency log, trusted hardware, remote witness, or signed release service.

A dedicated chain-verification command is also still pending.

## What Browsallax currently protects against

The current implementation is designed to resist or reduce:

- arbitrary webpages obtaining Node.js access;
- untrusted origins invoking the trusted-page bridge;
- trusted pages reading the Operator bearer token;
- webpages granting themselves mutation authority;
- webpages directly choosing the model executor;
- expired human grants authorizing mutation;
- sensitive actions executing under a broad interactive grant;
- Brain Registry recommendations silently selecting a model that is not installed locally;
- registry-routed tasks silently falling back to legacy local preferences when no approved local model exists;
- malformed planner output becoming a browser action without validation;
- raw malformed model responses leaking through bounded failure diagnostics;
- ordinary popup requests escaping the Browsallax tab model;
- browser permission prompts silently granting camera, microphone, geolocation, or notifications.

## What Browsallax does not currently protect against

Browsallax should **not** currently be treated as protection against:

- malware or a hostile process with the same or greater OS privileges as the user;
- a compromised operating system, Electron runtime, Node.js runtime, or Ollama installation;
- physical access to an unlocked machine;
- filesystem deletion or rewriting of local receipts;
- compromise of an explicitly trusted web origin;
- all semantic deception by malicious webpages;
- all possible prompt-injection strategies;
- all browser or Chromium zero-day vulnerabilities;
- credential theft by a malicious site after the human chooses to type credentials into that site;
- arbitrary replay of a valid local authenticated Operator request by an attacker that already possesses the bearer token;
- cryptographic identity of application updates;
- automatic verification of downloaded Browsallax releases;
- OS/container-grade isolation of Browser Operator execution.

## Update and dependency trust

Browsallax Desktop currently depends on Electron `44.3.0`.

The project should keep Electron/Chromium security updates current and document any deliberate version pin that delays an available security update.

The repository does not currently document a signed auto-update or release-verification chain. Until such a mechanism exists, users should treat source/release provenance and local installation integrity as an external trust responsibility.

## Data retention and deletion

Current local artifacts may include:

- browser session data;
- Browser Operator endpoint descriptor while the app is running;
- Browser Operator receipt JSONL;
- selected-text Reality Ledger JSONL;
- screenshots captured by Browser Operator;
- Browsallax Web local-storage data.

Browsallax does not currently claim secure deletion. Deleting an artifact through the filesystem may still leave recoverable data depending on the operating system and storage device.

## Security invariants that must survive future work

Future features should not weaken these rules:

1. A page cannot grant authority.
2. A model cannot grant authority.
3. A routing score cannot grant authority.
4. A receipt records what happened; it does not authorize what happens next.
5. Sensitive mutation requires narrower approval than ordinary browsing.
6. Registry/model recommendations must be checked against execution reality.
7. Missing or malformed evidence must remain missing or malformed, not be synthesized into success.
8. Source evidence and derived interpretation remain distinguishable.
9. Local-first does not mean local processes are automatically trusted.
10. New privileged surfaces require explicit tests and documentation.

## Reporting security issues

Until a dedicated private security-reporting channel is established, avoid publishing secrets, credentials, bearer tokens, or exploit payloads in public issues.

A future repository hardening step should add a `SECURITY.md` file with a private reporting path and supported-version policy.
