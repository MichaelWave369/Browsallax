# Outbound ChatGPT Relay Agent

**Contract:** `PV-CBR-AGENT-0.4`

This process connects the user's local `PV-CBR-0.6` bridge to the transport-only public relay without exposing an inbound port.

```text
ChatGPT connector
      ↓
HTTPS relay
      ↑ outbound polling only
PV-CBR-AGENT-0.4
      ↓
PV-CBR-0.6
      ↓
Browsallax
      ↓
Vessie
```

## Allowed operations

The agent has a hardcoded allowlist:

- `bridge.status`
- `vessie.observe`
- `vessie.ask`
- `vessie.resume`
- `domistika.status`
- `domistika.observe`
- `domistika.capabilities`
- `domistika.capture`
- `domistika.draw`

Unknown relay operations are returned as errors and are never dispatched to the local bridge.

## Start

After Browsallax Desktop is running and Super Φ.Vessel is open:

```powershell
$env:PHI_CHATGPT_RELAY_URL="https://YOUR-RELAY.netlify.app"
$env:PHI_CHATGPT_RELAY_AGENT_TOKEN="<agent-token>"
npm run bridge:relay-agent
```

The agent requires HTTPS except for loopback development URLs.

## Authority

The relay agent cannot:

- activate a Browsallax human grant;
- approve a sensitive action;
- access arbitrary files;
- execute shell commands;
- call arbitrary Browser Operator endpoints.

`vessie.ask` and `domistika.draw` still require the normal active Browsallax interactive grant. If the grant is absent, the result returned through the relay is `HELD`.

## Secrets

The relay agent token is distinct from:

- the ChatGPT connector token;
- the Browsallax Operator token.

The local operator token remains discoverable only through the local protected Browsallax endpoint descriptor and is never sent to the relay.
