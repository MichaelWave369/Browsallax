import { getStore } from "@netlify/blobs";
import {
  STORE_NAME,
  RELAY_VERSION,
  authorized,
  createQueuedRequest,
  json,
  normalizePayload,
  operationForPath,
  readJson,
  requestKey
} from "../../src/relay-core.mjs";

export default async (request: Request) => {
  try {
    const secret = Netlify.env.get("PHI_CONNECTOR_TOKEN");
    if (!authorized(request, secret)) return json(401, { ok: false, error: "UNAUTHORIZED" });
    if (request.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });

    const operation = operationForPath(new URL(request.url).pathname);
    if (!operation) return json(404, { ok: false, error: "OPERATION_NOT_ALLOWED" });

    const payload = normalizePayload(operation, await readJson(request));
    const job = createQueuedRequest(operation, payload);
    const store = getStore(STORE_NAME, { consistency: "strong" });
    await store.setJSON(requestKey(job.id), job);

    return json(202, {
      ok: true,
      relayVersion: RELAY_VERSION,
      request: {
        id: job.id,
        operation: job.operation,
        state: job.state,
        expiresAt: job.expiresAt
      }
    });
  } catch (error: any) {
    return json(Number(error?.statusCode || 500), {
      ok: false,
      error: String(error?.message || "INTERNAL_ERROR").slice(0, 300)
    });
  }
};

export const config = {
  path: [
    "/v1/bridge/status",
    "/v1/vessie/observe",
    "/v1/vessie/ask",
    "/v1/vessie/resume",
    "/v1/domistika/status",
    "/v1/domistika/observe",
    "/v1/domistika/capabilities",
    "/v1/domistika/capture",
    "/v1/domistika/draw"
  ]
};
