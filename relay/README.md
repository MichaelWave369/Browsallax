# Phi ChatGPT ↔ Browsallax Relay

**Contract:** `PV-CBR-RELAY-0.1`  
**Production project:** `https://phi-browsallax-relay.netlify.app`

This relay is owned by the Browsallax project and transports only the bounded semantic ChatGPT ↔ Vessie operations exposed by `PV-CBR-0.1`.

```text
ChatGPT connector
      ↓ HTTPS
Netlify relay + short-lived Blob queue
      ↑ outbound polling
PV-CBR-AGENT-0.1 on the user's machine
      ↓
PV-CBR-0.1
      ↓
Browsallax
      ↓
Vessie
```

The user's PC opens no inbound port.

## Environment variables

The dedicated Netlify project uses two independent secrets:

- `PHI_CONNECTOR_TOKEN` — used only by the ChatGPT connector.
- `PHI_AGENT_TOKEN` — used only by the local outbound relay agent.

Neither token is the local Browsallax Operator token.

## Queue behavior

- Four allowed semantic operations only: `bridge.status`, `vessie.observe`, `vessie.ask`, `vessie.resume`.
- Requests expire after 10 minutes.
- Agent claims expire after four minutes and may be reclaimed.
- Connector status never exposes request payloads or agent claim tokens.
- Results are stored only long enough for the connector to retrieve them; an hourly cleanup removes stale records.
- v0.1 assumes one local agent for one relay project. Multi-agent atomic claiming is intentionally not claimed because Netlify Blobs has no compare-and-swap primitive.

## Local development

```bash
cd relay
npm install
npm test
npx netlify dev
```

## Deployment

Deploy this `relay/` directory to the dedicated Netlify project `phi-browsallax-relay`.

The relay grants no Browsallax authority and cannot activate the five-minute human interactive grant.
