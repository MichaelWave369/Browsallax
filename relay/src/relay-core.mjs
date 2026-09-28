import crypto from "node:crypto";

export const RELAY_VERSION = "PV-CBR-RELAY-0.4";
export const STORE_NAME = "phi-chatgpt-relay";
export const REQUEST_TTL_MS = 10 * 60 * 1000;
export const CLAIM_LEASE_MS = 4 * 60 * 1000;
export const MAX_BODY_CHARS = 16000;
export const MAX_AGENT_RESULT_BODY_CHARS = 3 * 1024 * 1024;
export const ALLOWED_OPERATIONS = new Set([
  "bridge.status",
  "vessie.observe",
  "vessie.ask",
  "vessie.resume",
  "domistika.status",
  "domistika.observe",
  "domistika.capabilities",
  "domistika.capture",
  "domistika.draw"
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

export async function readJson(request, maxChars = MAX_BODY_CHARS) {
  const text = await request.text();
  if (text.length > maxChars) {
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
    "/v1/vessie/resume": "vessie.resume",
    "/v1/domistika/status": "domistika.status",
    "/v1/domistika/observe": "domistika.observe",
    "/v1/domistika/capabilities": "domistika.capabilities",
    "/v1/domistika/capture": "domistika.capture",
    "/v1/domistika/draw": "domistika.draw"
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

  if (operation === "domistika.capture") {
    const keys = Object.keys(body || {});
    if (keys.some((key) => !["sessionId", "passName", "includeImage", "scope"].includes(key))) {
      throw Object.assign(new Error("UNEXPECTED_PAYLOAD_FIELDS"), { statusCode: 400 });
    }
    return {
      sessionId: body.sessionId == null ? undefined : String(body.sessionId),
      passName: body.passName == null ? undefined : String(body.passName),
      includeImage: body.includeImage !== false,
      scope: body.scope == null ? undefined : String(body.scope)
    };
  }

  if (operation === "domistika.draw") {
    const keys = Object.keys(body || {});
    if (keys.some((key) => !["recipe", "sessionId", "passName", "returnCapture", "includeImage", "captureScope", "postSaveAction"].includes(key))) {
      throw Object.assign(new Error("UNEXPECTED_PAYLOAD_FIELDS"), { statusCode: 400 });
    }
    const recipe = body.recipe;
    if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
      throw Object.assign(new Error("DOMISTIKA_RECIPE_REQUIRED"), { statusCode: 400 });
    }
    const recipeKeys = new Set([
      "projectName", "newCanvas", "tool", "color", "size", "symmetry",
      "mode", "points", "intervalMs", "saveToGallery", "gallery"
    ]);
    if (Object.keys(recipe).some((key) => !recipeKeys.has(key))) {
      throw Object.assign(new Error("DOMISTIKA_RECIPE_FIELDS_INVALID"), { statusCode: 400 });
    }
    if (!Array.isArray(recipe.points) || recipe.points.length < 2 || recipe.points.length > 512) {
      throw Object.assign(new Error("DOMISTIKA_POINTS_INVALID"), { statusCode: 400 });
    }
    return {
      recipe,
      sessionId: body.sessionId == null ? undefined : String(body.sessionId),
      passName: body.passName == null ? undefined : String(body.passName),
      returnCapture: body.returnCapture === true,
      includeImage: body.includeImage !== false,
      captureScope: body.captureScope == null ? undefined : String(body.captureScope),
      postSaveAction: body.postSaveAction == null ? undefined : String(body.postSaveAction)
    };
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
