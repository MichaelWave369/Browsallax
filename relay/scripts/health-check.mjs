const DEFAULT_RELAY_URL = 'https://phi-browsallax-relay.netlify.app';

const relayUrl = String(process.env.PHI_CHATGPT_RELAY_URL || DEFAULT_RELAY_URL).replace(/\/+$/, '');
const response = await fetch(`${relayUrl}/v1/health`, {
  headers: { accept: 'application/json' }
});

const text = await response.text();
let body;
try {
  body = text ? JSON.parse(text) : {};
} catch {
  throw new Error(`HEALTH_NON_JSON status=${response.status} body=${text.slice(0, 500)}`);
}

if (!response.ok) {
  throw new Error(`HEALTH_HTTP_${response.status}: ${body?.error || text.slice(0, 500)}`);
}

if (body?.relayVersion !== 'PV-CBR-RELAY-0.3') {
  throw new Error(`UNEXPECTED_RELAY_VERSION: ${body?.relayVersion || 'missing'}`);
}

if (body?.authority !== 'NONE' || body?.role !== 'TRANSPORT_ONLY') {
  throw new Error(`UNEXPECTED_RELAY_AUTHORITY: authority=${body?.authority || 'missing'} role=${body?.role || 'missing'}`);
}

console.log(JSON.stringify({
  ok: true,
  relayUrl,
  relayVersion: body.relayVersion,
  authority: body.authority,
  role: body.role
}, null, 2));
