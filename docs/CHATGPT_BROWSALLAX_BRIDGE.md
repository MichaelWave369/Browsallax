# ChatGPT ↔ Browsallax ↔ Vessie Bridge

**Contract:** `PV-CBR-0.3`  
**Status:** experimental local bridge  
**Goal:** let a connected ChatGPT tool interact with bounded local semantic lanes through Browsallax without TinyFish or another paid remote-browser agent.

## Architecture

```text
ChatGPT connector
      |
      | HTTPS + bridge bearer token
      v
authenticated tunnel / relay
      |
      | outbound/local transport only
      v
PV-CBR-0.3 on the user's machine
      |
      | local protected operator token
      v
Browsallax Browser Operator
      |
      +--> Super Φ.Vessel / Vessie
      |
      +--> Domistika (path-locked semantic lane)
```

The bridge deliberately exposes semantic operations instead of raw browser controls. Vessie keeps its deterministic observed-control path. `PV-CBR-DOM-0.1` adds a Domistika lane locked to the exact `/Domistika/` application path and uses observed controls plus governed local pointer input.

## Exposed methods

- `bridge.status`
- `vessie.observe`
- `vessie.ask`
- `vessie.resume`
- `domistika.status`
- `domistika.observe`
- `domistika.draw`

Not exposed:

- shell execution
- arbitrary filesystem access
- arbitrary URL fetch
- raw selector/click/type APIs
- grant creation
- sensitive-action approval

## Authority

```text
CHATGPT != authority
CONNECTOR != authority
TUNNEL / RELAY != authority
BRIDGE TOKEN != Browsallax operator token

BROWSALLAX = local enforcement
HUMAN GRANT = bounded interactive authority
```

`vessie.ask` and `domistika.draw` require the normal Browsallax five-minute interactive grant because they mutate visible page state. The bridge cannot create that grant. If no grant is active, it returns `HELD`.

Sensitive actions remain governed by Browsallax and are not exposed by this bridge.

## Start locally

1. Start Browsallax Desktop normally.
2. Open Super Φ.Vessel in a Browsallax tab.
3. Generate a bridge token:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

4. Set it for the terminal session and start the bridge:

```powershell
$env:PHI_CHATGPT_BRIDGE_TOKEN="<paste-token>"
npm run bridge:chatgpt
```

Expected:

```text
[Phi ChatGPT Bridge] PV-CBR-0.2 listening at http://127.0.0.1:3698
```

The service binds to loopback only.

## Remote HTTPS transport

ChatGPT cannot reach the user's Windows loopback address directly. Put an authenticated HTTPS connector/tunnel in front of `127.0.0.1:3698`.

A tunnel is transport only. It must not receive or expose the Browsallax operator endpoint token.

For development, a free outbound tunnel such as Cloudflare Tunnel can forward public HTTPS to the loopback bridge without opening an inbound router port. The project also includes an outbound relay and a GitHub mailbox compatibility transport. Use a stable authenticated tunnel before treating the connector as persistent infrastructure.

## API

### Health

`GET /v1/health`

No authentication. Returns only bridge version and no runtime details.

### Manifest

`GET /v1/manifest`

No authentication. Returns the bounded capability manifest.

### Status

`GET /v1/status`

Bearer authentication required. Returns bounded Browsallax/planner/Vessie availability without the local operator token, grant ID, or ledger filesystem path.

### Observe Vessie

`GET /v1/vessie/observe`

Bearer authentication required. Returns a bounded visible-text observation plus SHA-256 digest.

### Ask Vessie

`POST /v1/vessie/ask`

```json
{
  "message": "What mode are you in?"
}
```

Bearer authentication required. Requires an already-active Browsallax human interactive grant. The bridge creates no grant. The bridge first observes the exact Vessie tab, identifies the visible Vessie composer and visible `Send` control from the observation, types only through that observed selector, verifies the exact composer value, clicks only the freshly observed Send selector, and waits for a new completed Vessie response. The type and click still pass through normal Browser Operator policy.

### Resume held Vessie task

`POST /v1/vessie/resume`

```json
{
  "taskId": "..."
}
```

The task must already be bound to the currently open Vessie tab.


### Domistika status

`GET /v1/domistika/status`

Returns exact-app readiness, grant state, and the observed Accessible Input Bridge contract.

### Observe Domistika

`GET /v1/domistika/observe`

Returns bounded visible Domistika state and supported observed controls.

### Draw in Domistika

`POST /v1/domistika/draw`

Accepts one bounded recipe under `{"recipe": {...}}`. Coordinates are normalized to the observed canvas. Supported modes are Sticky Draw and Polyline; up to 512 points are accepted. The recipe may optionally create a fresh canvas and save the result to the local Domistika Gallery.

The underlying pointer primitive remains local-only and is always classified as `REMOTE_MUTATION`. See [DOMISTIKA_CHATGPT_BRIDGE.md](DOMISTIKA_CHATGPT_BRIDGE.md).

## Connector surface

See `docs/chatgpt-browsallax.openapi.yaml` for the intentionally small OpenAPI surface. Replace the placeholder server URL with the stable HTTPS bridge/tunnel URL before registering it with a ChatGPT custom integration.

## TinyFish replacement boundary

`PV-CBR-0.3` replaces the transport path needed for ChatGPT to reach supported local semantic browser lanes. Browsallax still performs browser execution and local planning.

No claim is made that this bridge is production hardened. Persistent deployment should add stable tunnel identity, token rotation, request replay protection, rate limiting, and connector-specific authentication.
