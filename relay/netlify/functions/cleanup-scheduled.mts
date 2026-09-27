import { getStore } from "@netlify/blobs";
import { STORE_NAME, isExpired } from "../../src/relay-core.mjs";

export default async () => {
  const store = getStore(STORE_NAME, { consistency: "strong" });
  const listed = await store.list({ prefix: "request/" });
  for (const entry of listed.blobs) {
    const job = await store.get(entry.key, { type: "json" });
    if (!job || isExpired(job, Date.now() - 60 * 60 * 1000)) {
      await store.delete(entry.key);
    }
  }
};

export const config = {
  schedule: "@hourly"
};
