import { RELAY_VERSION, json } from "../../src/relay-core.mjs";

export default async () => json(200, {
  ok: true,
  relayVersion: RELAY_VERSION,
  authority: "NONE",
  role: "TRANSPORT_ONLY"
});

export const config = {
  path: "/v1/health"
};
