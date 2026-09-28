# Phi ChatGPT ↔ Browsallax Relay

**Contract:** `PV-CBR-RELAY-0.3`  
**Production project:** `https://phi-browsallax-relay.netlify.app`

This relay is owned by the Browsallax project and transports only the bounded semantic ChatGPT ↔ Vessie operations exposed by `PV-CBR-0.4`.

```text
ChatGPT connector
      ↓ HTTPS
Netlify relay + short-lived Blob queue
      ↑ outbound polling
PV-CBR-AGENT-0.3 on the user's machine
      ↓
PV-CBR-0.4
      ↓
Browsallax
      ├── Vessie
      └── Domistika
```

The user's PC opens no inbound port.

## Environment variables

The dedicated Netlify project uses two independent secrets:

- `PHI_CONNECTOR_TOKEN` — used only by the ChatGPT connector.
- `PHI_AGENT_TOKEN` — used only by the local outbound relay agent.

Neither token is the local Browsallax Operator token.

## Queue behavior

- Nine allowed semantic operations only: `bridge.status`, `vessie.observe`, `vessie.ask`, `vessie.resume`, `domistika.status`, `domistika.observe`, `domistika.capabilities`, `domistika.capture`, `domistika.draw`.
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

The production Netlify project already exists as `phi-browsallax-relay` with project ID:

```text
62bc29ba-1d54-4fa8-bc40-139e51ce61b4
```

From the Browsallax checkout:

```powershell
cd C:\Browsallax\relay
npm install
npm run check
npm test
npx netlify login
npm run link:prod
npm run deploy:prod
npm run health:prod
```

`netlify link` stores local site linkage under `.netlify/`, which is ignored by Git.

After production health passes, start Browsallax Desktop in a separate terminal and leave it running:\n\n```powershell\ncd C:\\Browsallax\nnpm start\n```\n\nThen start the local outbound agent with a fresh credential generated on the machine:

```powershell
npm run agent:bootstrap
```

The bootstrap first verifies that the local Browsallax Browser Operator endpoint is available. On first provisioning it generates a random 256-bit `PHI_AGENT_TOKEN`, updates the Netlify production secret, redeploys the relay so the Functions receive that exact credential, and only then stores the credential locally protected by Windows DPAPI for the current user. The credential is never printed.

Ordinary restarts reuse the Windows user-protected secure-string credential and do **not** mutate Netlify or redeploy:

```powershell
npm run agent:bootstrap
```

Credential rotation is explicit:

```powershell
npm run agent:rotate
```

Rotation updates the production secret, redeploys the relay, and persists the new credential only after the deploy succeeds.

The production health check must report:

```json
{
  "ok": true,
  "relayVersion": "PV-CBR-RELAY-0.3",
  "authority": "NONE",
  "role": "TRANSPORT_ONLY"
}
```

The relay grants no Browsallax authority and cannot activate the five-minute human interactive grant.
