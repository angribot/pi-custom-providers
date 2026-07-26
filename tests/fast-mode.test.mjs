import assert from "node:assert/strict";
import test from "node:test";
import { registerFastMode } from "../fast-mode.ts";
import {
  createTestContext,
  createTestPi,
  fire,
  inject,
  toggle,
} from "./test-harness.mjs";

const STATUS_KEY = "custom-providers-fast-mode";

function endMessage(harness, ctx, message) {
  return harness.handlers.get("message_end")[0]({ type: "message_end", message }, ctx);
}

function message(model = "gpt-5.4") {
  return {
    role: "assistant",
    content: [],
    api: "openai-responses",
    provider: "providerA",
    model,
    usage: {
      input: 1_000_000,
      output: 100_000,
      cacheRead: 500_000,
      cacheWrite: 200_000,
      totalTokens: 1_800_000,
      cost: { input: 99, output: 98, cacheRead: 97, cacheWrite: 96, total: 390 },
    },
    stopReason: "stop",
    timestamp: 1,
  };
}

test("--fast forces startup preference once without rewriting enabled branch state", () => {
  const harness = createTestPi({ flagValues: { fast: true } });
  registerFastMode(harness.pi);
  const { ctx, statuses } = createTestContext({
    api: "openai-responses",
    branch: [{ type: "custom", customType: "fast-mode", data: { enabled: false } }],
  });

  fire(harness, { type: "session_start", reason: "resume" }, ctx);
  assert.deepEqual(harness.entries, []);
  assert.equal(statuses.get(STATUS_KEY), undefined);

  fire(harness, { type: "session_start", reason: "startup" }, ctx);
  assert.equal(statuses.get(STATUS_KEY), "⚡ Fast mode");
  ctx.sessionManager.getBranch = () => [{ type: "custom", customType: "fast-mode", data: { enabled: true } }];
  fire(harness, { type: "session_start", reason: "startup" }, ctx);

  assert.deepEqual(harness.entries, [{ type: "custom", customType: "fast-mode", data: { enabled: true } }]);
  assert.deepEqual(inject(harness, ctx, { model: "gpt-5.4" }), {
    model: "gpt-5.4",
    service_tier: "priority",
  });
});

test("/fast persists branch preference and only displays status for applicable model", async () => {
  const harness = createTestPi();
  registerFastMode(harness.pi, new Map([["providerA", "disabled"]]));
  const { ctx, statuses } = createTestContext({ api: "openai-responses", provider: "providerA" });

  await toggle(harness, ctx);
  await toggle(harness, ctx);
  await toggle(harness, ctx);
  assert.deepEqual(harness.entries, [
    { type: "custom", customType: "fast-mode", data: { enabled: true } },
    { type: "custom", customType: "fast-mode", data: { enabled: false } },
    { type: "custom", customType: "fast-mode", data: { enabled: true } },
  ]);
  assert.equal(statuses.get(STATUS_KEY), undefined);

  const builtin = { api: "openai-responses", provider: "openai", id: "gpt-5.4" };
  fire(harness, { type: "model_select", model: builtin, previousModel: ctx.model, source: "set" }, ctx);
  assert.equal(statuses.get(STATUS_KEY), "⚡ Fast mode");
  fire(harness, { type: "session_shutdown" }, ctx);
  assert.equal(statuses.get(STATUS_KEY), undefined);

  const rpc = createTestContext({ api: "openai-responses", provider: "openai", mode: "rpc" });
  fire(harness, { type: "model_select", model: builtin, previousModel: rpc.ctx.model, source: "set" }, rpc.ctx);
  assert.equal(rpc.statuses.size, 0);

  ctx.sessionManager.getBranch = () => [{ type: "custom", customType: "fast-mode", data: { enabled: false } }];
  fire(harness, { type: "session_tree", newLeafId: "leaf", oldLeafId: "root" }, ctx);
  assert.equal(statuses.get(STATUS_KEY), undefined);
});

test("injects priority only for enabled applicable object payloads", async () => {
  const harness = createTestPi();
  registerFastMode(harness.pi, new Map([["providerA", "disabled"]]));
  const { ctx } = createTestContext({ api: "openai-responses", provider: "providerA" });
  await toggle(harness, ctx);

  const payload = { model: "gpt-5.4", service_tier: "flex" };
  assert.equal(inject(harness, ctx, payload), undefined);
  assert.equal(payload.service_tier, "flex");
  assert.equal(inject(harness, ctx, null), undefined);
  assert.equal(inject(harness, ctx, new Date()), undefined);

  ctx.model = { api: "openai-responses", provider: "openai", id: "gpt-5.4" };
  const applicablePayload = { model: "gpt-5.4", service_tier: "default" };
  assert.deepEqual(inject(harness, ctx, applicablePayload), {
    model: "gpt-5.4",
    service_tier: "priority",
  });
  assert.equal(applicablePayload.service_tier, "default");
  assert.deepEqual(inject(harness, ctx, Object.assign(Object.create(null), { model: "gpt-5.4" })), {
    model: "gpt-5.4",
    service_tier: "priority",
  });
  ctx.model = { api: "anthropic-messages", provider: "providerA", id: "claude" };
  assert.equal(inject(harness, ctx, { model: "claude" }), undefined);
});

test("request policy recomputes injected request cost with public calculator and Priority Surcharge", async () => {
  const harness = createTestPi();
  registerFastMode(harness.pi, new Map([["providerA", "request"]]));
  const registryModels = new Map([["providerA/gpt-5.4", {
    cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  }]]);
  const { ctx } = createTestContext({ api: "openai-responses", provider: "providerA", modelId: "gpt-5.4", registryModels });
  await toggle(harness, ctx);

  inject(harness, ctx, { model: "gpt-5.4" });
  assert.equal(endMessage(harness, ctx, message("other-model")), undefined);
  const original = message();
  const result = endMessage(harness, ctx, original);
  const expectedCost = {
    input: 4,
    output: 2,
    cacheRead: 0.2,
    cacheWrite: 1,
    total: 7.2,
  };
  assert.deepEqual(result.message, {
    ...original,
    usage: { ...original.usage, cost: expectedCost },
  });
  assert.equal(endMessage(harness, ctx, original), undefined);

  const gpt55 = message("gpt-5.5");
  registryModels.set("providerA/gpt-5.5", { cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } });
  ctx.model = { api: "openai-responses", provider: "providerA", id: "gpt-5.5" };
  inject(harness, ctx, { model: "gpt-5.5" });
  assert.equal(endMessage(harness, ctx, gpt55).message.usage.cost.total, 9);
});

test("response policy, cleared pending state, and missing registry retain response cost", async () => {
  const responseHarness = createTestPi();
  registerFastMode(responseHarness.pi, new Map([["providerA", "response"]]));
  const response = createTestContext({ api: "openai-responses", provider: "providerA" });
  await toggle(responseHarness, response.ctx);
  inject(responseHarness, response.ctx, { model: "gpt-5.4" });
  assert.equal(endMessage(responseHarness, response.ctx, message()), undefined);

  const requestHarness = createTestPi();
  registerFastMode(requestHarness.pi, new Map([["providerA", "request"]]));
  const registryModels = new Map();
  const request = createTestContext({
    api: "openai-responses",
    provider: "providerA",
    modelId: "gpt-5.4",
    registryModels,
  });
  await toggle(requestHarness, request.ctx);

  inject(requestHarness, request.ctx, { model: "gpt-5.4" });
  assert.equal(inject(requestHarness, request.ctx, null), undefined);
  assert.equal(endMessage(requestHarness, request.ctx, message()), undefined);

  inject(requestHarness, request.ctx, { model: "gpt-5.4" });
  assert.equal(endMessage(requestHarness, request.ctx, message()), undefined);
  registryModels.set("providerA/gpt-5.4", {
    cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  });
  assert.equal(endMessage(requestHarness, request.ctx, message()), undefined);
});
