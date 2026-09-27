import { getStore } from "@netlify/blobs";
import {
  STORE_NAME,
  authorized,
  isExpired,
  json,
  publicRequest,
  requestKey
} from "../../src/relay-core.mjs";

export default async (request: Request) => {
  try {
    const secret = Netlify.env.get("PHI_CONNECTOR_TOKEN");
    if (!authorized(request, secret)) return json(401, { ok: false, error: "UNAUTHORIZED" });
    if (request.method !== "GET") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });

    const pathname = new URL(request.url).pathname;
    const id = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) || "");
    if (!id || id.length > 100) return json(400, { ok: false, error: "REQUEST_ID_REQUIRED" });

    const store = getStore(STORE_NAME, { consistency: "strong" });
    const job = await store.get(requestKey(id), { type: "json" });
    if (!job) return json(404, { ok: false, error: "REQUEST_NOT_FOUND" });

    const visible = publicRequest(job);
    if (visible.state === "EXPIRED" && isExpired(job)) {
      await store.delete(requestKey(id));
    }

    return json(200, { ok: true, request: visible });
  } catch (error: any) {
    return json(Number(error?.statusCode || 500), {
      ok: false,
      error: String(error?.message || "INTERNAL_ERROR").slice(0, 300)
    });
  }
};

export const config = {
  path: "/v1/requests/:id"
};
