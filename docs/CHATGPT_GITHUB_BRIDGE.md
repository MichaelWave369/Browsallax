# ChatGPT ↔ Browsallax GitHub Compatibility Bridge

**Contract:** `PV-CBR-GH-0.3`

This is a compatibility transport for ChatGPT surfaces that can access GitHub but cannot directly register the Browsallax HTTPS relay as a private custom connector.

It does **not** replace `PV-CBR-RELAY-0.1`. The Netlify relay remains the preferred direct transport. GitHub is only a private mailbox.

```text
ChatGPT
   ↓ GitHub connector
private mailbox repository
   ↑ git polling + response commits
PV-CBR-GH-0.3 local agent
   ↓
PV-CBR-0.2
   ↓
Browsallax Browser Operator
   ↓
Vessie
```

## Authority

GitHub is transport only.

```text
GITHUB != authority
MAILBOX REQUEST != authority
CHATGPT != authority

LOCAL OPERATOR = authority source
BROWSALLAX POLICY = enforcement
HUMAN GRANT = bounded mutation authority
```

The GitHub adapter cannot create a grant, approve a sensitive action, expose raw browser selectors, navigate arbitrary URLs, run shell commands from mailbox requests, or access arbitrary local files. Domistika requests are path-locked by the local semantic bridge, not by GitHub transport.

## Private repository

The default mailbox repository is:

```text
MichaelWave369/browsallax-chat-bridge
```

It should be **private** and initialized with a `main` branch.

The local agent uses the machine's existing Git credential flow. No GitHub token is placed in Browsallax configuration or mailbox files.

## Request contract

ChatGPT creates one immutable file:

```text
requests/<id>.json
```

Example:

```json
{
  "schema": "browsallax.github-bridge.request.v1",
  "id": "cg-20260927-status-001",
  "operation": "bridge.status",
  "payload": {},
  "createdAt": "2026-09-27T05:40:00.000Z",
  "expiresAt": "2026-09-27T05:50:00.000Z"
}
```

Allowed operations are exactly:

- `bridge.status`
- `vessie.observe`
- `vessie.ask`
- `vessie.resume`
- `domistika.status`
- `domistika.observe`
- `domistika.capabilities`
- `domistika.capture`
- `domistika.draw`

`domistika.draw` accepts only a strict bounded recipe. Unknown recipe fields fail closed; drawing points are capped at 512. It may request a bounded inline PNG return with session/pass metadata. `domistika.capture` is read-only and path-locked to the resolved Domistika tab.

Payloads are strict. Unknown fields fail closed. Requests expire, and TTL may not exceed 15 minutes.

## Claim-before-execute

Before touching the local bridge, the agent commits:

```text
claims/<id>.json
```

The claim includes a SHA-256 digest of the request and a per-process run ID.

If Browsallax crashes after the claim but before a response is committed, a restarted agent does **not** replay that request. It writes a failed response with:

```text
INDETERMINATE_PREVIOUS_CLAIM_NO_REPLAY
```

This prevents a `vessie.ask` request from being submitted twice after an ambiguous crash.

## Responses

The agent writes:

```text
responses/<id>.json
```

Example:

```json
{
  "schema": "browsallax.github-bridge.response.v1",
  "bridgeVersion": "PV-CBR-GH-0.3",
  "requestId": "cg-20260927-status-001",
  "operation": "bridge.status",
  "state": "COMPLETE",
  "authority": "TRANSPORT_ONLY_NO_AUTHORITY",
  "result": {},
  "error": null
}
```

No Browser Operator bearer token is written to GitHub.

## Windows startup

Browsallax Desktop must already be running.

After the private mailbox repository exists:

```powershell
cd C:\Browsallax
git pull --ff-only origin main
npm run bridge:github-bootstrap
```

The bootstrap:

1. verifies the local Browser Operator;
2. clones the private mailbox to the current user's application-data directory if needed;
3. validates the GitHub origin;
4. starts `PV-CBR-GH-0.1`;
5. polls for bounded request files.

The default local mailbox is outside the Browsallax source checkout:

```text
%APPDATA%\browsallax\github-bridge\mailbox
```

## First live acceptance

Use `bridge.status` first. It is read-only and needs no human interactive grant.

Then test `vessie.observe`.

Only after both are proven should mutation operations be tested. `vessie.ask` and `domistika.draw` still require the normal five-minute Browsallax interactive grant. For Domistika live acceptance, open the Domistika app in Browsallax first and use `domistika.status` before sending a drawing recipe.
