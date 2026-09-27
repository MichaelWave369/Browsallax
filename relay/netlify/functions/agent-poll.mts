import { getStore } from "@netlify/blobs";
import {
  STORE_NAME,
  authorized,
  agentClaim,
  claimJob,
  claimable,
  isExpired,
  json,
  requestKey
} from "../../src/relay-core.mjs";

export default async (request: Request) => {
  try {
    const secret = Netlify.env.get("PHI_AGENT_TOKEN");
    if (!authorized(request, secret)) return json(401, { ok: false, error: "UNAUTHORIZED" });
    if (request.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });

    const store = getStore(STORE_NAME, { consistency: "strong" });
    const listed = await store.list({ prefix: "request/" });
    const candidates = [];

    for (const entry of listed.blobs.slice(0, 100)) {
      const job = await store.get(entry.key, { type: "json" });
      if (!job) continue;
      if (isExpired(job)) {
        await store.delete(entry.key);
        continue;
      }
      if (claimable(job)) candidates.push(job);
    }

    candidates.sort((a, b) =>
      Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0) ||
      String(a.id).localeCompare(String(b.id))
    );

    const job = candidates[0];
    if (!job) return json(200, { ok: true, request: null });

    const claimed = claimJob(job);
    await store.setJSON(requestKey(claimed.id), claimed);
    return json(200, { ok: true, request: agentClaim(claimed) });
  } catch (error: any) {
    return json(Number(error?.statusCode || 500), {
      ok: false,
      error: String(error?.message || "INTERNAL_ERROR").slice(0, 300)
    });
  }
};

export const config = {
  path: "/v1/agent/poll"
};
