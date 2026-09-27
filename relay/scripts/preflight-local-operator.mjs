import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(here, "../../src/client/operator-client.js");
const {
  BrowsallaxOperatorClient,
  discoverEndpoint
} = require(clientPath);

try {
  const endpoint = await discoverEndpoint();
  const client = new BrowsallaxOperatorClient({ endpoint });
  const health = await client.health();
  const status = await client.status();

  console.log(JSON.stringify({
    ok: true,
    clientVersion: "PV-BOP-CLIENT-0.1",
    operatorVersion: endpoint.version,
    host: endpoint.host,
    port: endpoint.port,
    endpointFile: endpoint.sourcePath,
    health: health?.ok !== false,
    tabs: Array.isArray(status?.tabs) ? status.tabs.length : null
  }, null, 2));
} catch (error) {
  const code = String(error?.code || error?.message || "LOCAL_OPERATOR_PREFLIGHT_FAILED");
  if (code.includes("BROWSALLAX_ENDPOINT_NOT_FOUND")) {
    console.error("[Phi Relay Bootstrap] Browsallax Desktop / Browser Operator is not running.");
    console.error("[Phi Relay Bootstrap] Start it in another terminal:");
    console.error("  cd C:\\Browsallax");
    console.error("  npm start");
    console.error("[Phi Relay Bootstrap] Leave Browsallax Desktop running, then rerun:");
    console.error("  cd C:\\Browsallax\\relay");
    console.error("  npm run agent:bootstrap");
    process.exitCode = 3;
  } else {
    console.error("[Phi Relay Bootstrap] Local Browser Operator preflight failed:", code);
    process.exitCode = 4;
  }
}
