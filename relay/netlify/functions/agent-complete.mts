import { getStore } from "@netlify/blobs";
import {
  STORE_NAME,
  authorized,
  completeJob,
  json,
  readJson,
  requestKey
} from "../../src/relay-core.mjs";

export default async (request: Request) => {
  try {
    const secret = Netlify.env.get("PHI_AGENT_TOKEN");
    if (!authorized(request, secret)) return json(401, { ok: false, error: "UNAUTHORIZED" });
    if (request.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });

    const body: any = await readJson(request);
    const id = String(body.id || "").trim();
    const claimToken = String(body.claimToken || "").trim();
    if (!id || !claimToken) return json(400, { ok: false, error: "CLAIM_REQUIRED" });

    const store = getStore(STORE_NAME, { consistency: "strong" });
    const job = await store.get(requestKey(id), { type: "json" });
    if (!job) return json(404, { ok: false, error: "REQUEST_NOT_FOUND" });

    const completed = completeJob(job, claimToken, {
      result: body.error ? null : body.result,
      error: body.error ? String(body.error) : null
    });
    await store.setJSON(requestKey(id), completed);

    return json(200, {
      ok: true,
      request: {
        id: completed.id,
        operation: completed.operation,
        state: completed.state,
        completedAt: completed.completedAt
      }
    });
  } catch (error: any) {
    const status = error?.message === "CLAIM_TOKEN_MISMATCH" ? 403 : Number(error?.statusCode || 500);
    return json(status, {
      ok: false,
      error: String(error?.message || "INTERNAL_ERROR").slice(0, 300)
    });
  }
};

export const config = {
  path: "/v1/agent/complete"
};
