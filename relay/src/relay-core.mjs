import crypto from "node:crypto";

export const RELAY_VERSION = "PV-CBR-RELAY-0.1";
export const STORE_NAME = "phi-chatgpt-relay";
export const REQUEST_TTL_MS = 10 * 60 * 1000;
export const CLAIM_LEASE_MS = 4 * 60 * 1000;
export const MAX_BODY_CHARS = 16000;
export const ALLOWED_OPERATIONS = new Set([
  "bridge.status",
  "vessie.observe",
  "vessie.ask",
  "vessie.resume"
]);

export function nowIso(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

export function requestKey(id) {
  return `request/${String(id || "").trim()}`;
}

export function parseBearer(request) {
  const raw = String(request.headers.get("authorization") || "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match ? match[1].trim() : "";
}

export function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ""), "utf8");
  const right = Buffer.from(String(rightValue || ""), "utf8");
  return left.length > 0 &&
    left.length === right.length &&
    crypto.timingSafeEqual(left, right);
}

export function authorized(request, expectedSecret) {
  const expected = String(expectedSecret || "").trim();
  return expected.length >= 32 && safeEqual(parseBearer(request), expected);
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) {
    const error = new Error("REQUEST_BODY_TOO_LARGE");
    error.statusCode = 413;
    throw error;
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("INVALID_JSON");
    error.statusCode = 400;
    throw error;
  }
}

export function operationForPath(pathname) {
  const map = {
    "/v1/bridge/status": "bridge.status",
    "/v1/vessie/observe": "vessie.observe",
    "/v1/vessie/ask": "vessie.ask",
    "/v1/vessie/resume": "vessie.resume"
  };
  return map[String(pathname || "")] || null;
}

export function normalizePayload(operation, body = {}) {
  if (!ALLOWED_OPERATIONS.has(operation)) {
    throw Object.assign(new Error("OPERATION_NOT_ALLOWED"), { statusCode: 400 });
  }

  if (operation === "vessie.ask") {
    const message = String(body.message || "").trim();
    if (!message) throw Object.assign(new Error("MESSAGE_REQUIRED"), { statusCode: 400 });
    if (message.length > 8000) throw Object.assign(new Error("MESSAGE_TOO_LONG"), { statusCode: 400 });
    return { message };
  }

  if (operation === "vessie.resume") {
    const taskId = String(body.taskId || "").trim();
    if (!taskId) throw Object.assign(new Error("TASK_ID_REQUIRED"), { statusCode: 400 });
    if (taskId.length > 300) throw Object.assign(new Error("TASK_ID_TOO_LONG"), { statusCode: 400 });
    return { taskId };
  }

  return {};
}

export function createQueuedRequest(operation, payload, nowMs = Date.now()) {
  if (!ALLOWED_OPERATIONS.has(operation)) throw new Error("OPERATION_NOT_ALLOWED");
  const id = crypto.randomUUID();
  return {
    schema: "phi.chatgpt-browsallax.relay.request.v1",
    relayVersion: RELAY_VERSION,
    id,
    operation,
    payload,
    state: "QUEUED",
    createdAt: nowIso(nowMs),
    createdAtMs: nowMs,
    expiresAt: nowIso(nowMs + REQUEST_TTL_MS),
    expiresAtMs: nowMs + REQUEST_TTL_MS,
    claimedAt: null,
    claimedAtMs: null,
    claimToken: null,
    completedAt: null,
    result: null,
    error: null
  };
}

export function isExpired(job, nowMs = Date.now()) {
  return !job || Number(job.expiresAtMs || 0) <= nowMs;
}

export function claimable(job, nowMs = Date.now()) {
  if (!job || isExpired(job, nowMs)) return false;
  if (job.state === "QUEUED") return true;
  if (job.state === "CLAIMED") {
    const claimedAtMs = Number(job.claimedAtMs || 0);
    return claimedAtMs > 0 && nowMs - claimedAtMs >= CLAIM_LEASE_MS;
  }
  return false;
}

export function claimJob(job, nowMs = Date.now()) {
  if (!claimable(job, nowMs)) throw new Error("REQUEST_NOT_CLAIMABLE");
  return {
    ...job,
    state: "CLAIMED",
    claimedAt: nowIso(nowMs),
    claimedAtMs: nowMs,
    claimToken: crypto.randomUUID()
  };
}

export function completeJob(job, claimToken, { result = null, error = null } = {}, nowMs = Date.now()) {
  if (!job || job.state !== "CLAIMED") throw new Error("REQUEST_NOT_CLAIMED");
  if (!safeEqual(job.claimToken, claimToken)) throw new Error("CLAIM_TOKEN_MISMATCH");
  return {
    ...job,
    state: error ? "FAILED" : "COMPLETE",
    completedAt: nowIso(nowMs),
    result: error ? null : result,
    error: error ? String(error).slice(0, 1000) : null,
    claimToken: null
  };
}

export function publicRequest(job, nowMs = Date.now()) {
  if (!job) return null;
  if (isExpired(job, nowMs) && !["COMPLETE","FAILED"].includes(job.state)) {
    return {
      id: job.id,
      operation: job.operation,
      state: "EXPIRED",
      createdAt: job.createdAt,
      expiresAt: job.expiresAt,
      result: null,
      error: "REQUEST_EXPIRED"
    };
  }
  return {
    id: job.id,
    operation: job.operation,
    state: job.state,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    completedAt: job.completedAt,
    result: ["COMPLETE","FAILED"].includes(job.state) ? job.result : null,
    error: job.state === "FAILED" ? job.error : null
  };
}

export function agentClaim(job) {
  if (!job || job.state !== "CLAIMED" || !job.claimToken) throw new Error("INVALID_CLAIM");
  return {
    id: job.id,
    operation: job.operation,
    payload: job.payload,
    claimToken: job.claimToken,
    expiresAt: job.expiresAt
  };
}
