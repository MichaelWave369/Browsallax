import test from "node:test";
import assert from "node:assert/strict";
import {
  RELAY_VERSION,
  operationForPath,
  normalizePayload,
  createQueuedRequest,
  claimable,
  claimJob,
  completeJob,
  publicRequest,
  agentClaim
} from "../src/relay-core.mjs";

test("relay contract is bounded to semantic bridge operations", () => {
  assert.equal(RELAY_VERSION, "PV-CBR-RELAY-0.3");
  assert.equal(operationForPath("/v1/bridge/status"), "bridge.status");
  assert.equal(operationForPath("/v1/vessie/observe"), "vessie.observe");
  assert.equal(operationForPath("/v1/vessie/ask"), "vessie.ask");
  assert.equal(operationForPath("/v1/vessie/resume"), "vessie.resume");
  assert.equal(operationForPath("/v1/domistika/status"), "domistika.status");
  assert.equal(operationForPath("/v1/domistika/observe"), "domistika.observe");
  assert.equal(operationForPath("/v1/domistika/capabilities"), "domistika.capabilities");
  assert.equal(operationForPath("/v1/domistika/capture"), "domistika.capture");
  assert.equal(operationForPath("/v1/domistika/draw"), "domistika.draw");
  assert.equal(operationForPath("/v1/browser/click"), null);
});

test("payload normalization rejects missing or oversized semantic fields", () => {
  assert.deepEqual(normalizePayload("bridge.status", { ignored: true }), {});
  assert.deepEqual(normalizePayload("vessie.ask", { message: "hello" }), { message: "hello" });
  assert.throws(() => normalizePayload("vessie.ask", {}), /MESSAGE_REQUIRED/);
  assert.deepEqual(normalizePayload("vessie.resume", { taskId: "abc" }), { taskId: "abc" });
  const draw = normalizePayload("domistika.draw", {
    recipe: {
      mode: "sticky",
      points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }]
    }
  });
  assert.equal(draw.recipe.points.length, 2);
  const capture = normalizePayload("domistika.capture", {
    sessionId: "s1",
    passName: "inspect",
    includeImage: true
  });
  assert.equal(capture.sessionId, "s1");
  assert.equal(capture.includeImage, true);
  assert.throws(
    () => normalizePayload("domistika.draw", { recipe: { points: [{ x: 0.5, y: 0.5 }] } }),
    /DOMISTIKA_POINTS_INVALID/
  );
  assert.throws(() => normalizePayload("shell.exec", {}), /OPERATION_NOT_ALLOWED/);
});

test("request lifecycle hides claim token from connector status", () => {
  const queued = createQueuedRequest("vessie.ask", { message: "hello" }, 1000);
  assert.equal(queued.state, "QUEUED");
  assert.equal(claimable(queued, 1001), true);

  const claimed = claimJob(queued, 1001);
  const agent = agentClaim(claimed);
  assert.equal(agent.id, queued.id);
  assert.ok(agent.claimToken);

  const visibleClaimed = publicRequest(claimed, 1002);
  assert.equal(Object.hasOwn(visibleClaimed, "claimToken"), false);
  assert.equal(Object.hasOwn(visibleClaimed, "payload"), false);

  const complete = completeJob(claimed, agent.claimToken, { result: { disposition: "COMPLETE" } }, 1003);
  assert.equal(complete.state, "COMPLETE");
  assert.deepEqual(publicRequest(complete, 1004).result, { disposition: "COMPLETE" });
});

test("wrong claim token cannot complete a request", () => {
  const queued = createQueuedRequest("vessie.observe", {}, 1000);
  const claimed = claimJob(queued, 1001);
  assert.throws(
    () => completeJob(claimed, "wrong-claim-token", { result: {} }, 1002),
    /CLAIM_TOKEN_MISMATCH/
  );
});
