import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import { createTestPi } from "./test-harness.mjs";

const officialCatalogs = new Map(
  ["openai", "anthropic", "xai", "moonshotai", "zai", "deepseek"]
    .map((provider) => [provider, getBuiltinModels(provider)]),
);
const officialIdCounts = new Map();
for (const models of officialCatalogs.values()) {
  for (const { id } of models) officialIdCounts.set(id, (officialIdCounts.get(id) ?? 0) + 1);
}
const officialOpenAIModel = officialCatalogs.get("openai").find(
  (model) => officialIdCounts.get(model.id) === 1
    && model.api === "openai-responses"
    && model.cost.input > 0,
);
assert.ok(
  officialOpenAIModel,
  "OpenAI catalog must expose an unambiguous priced Responses model",
);
const officialGpt56Sol = officialCatalogs.get("openai").find(({ id }) => id === "gpt-5.6-sol");
assert.ok(officialGpt56Sol, "OpenAI catalog must expose gpt-5.6-sol");

let agentDir;
let extension;
let previousAgentDir;
let previousFetch;
let previousHome;
let tempHome;

before(async () => {
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  previousHome = process.env.HOME;
  previousFetch = globalThis.fetch;
  tempHome = mkdtempSync(join(tmpdir(), "custom-providers-core-"));
  agentDir = join(tempHome, ".pi", "agent");
  process.env.HOME = tempHome;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  mkdirSync(agentDir, { recursive: true });
  ({ default: extension } = await import(`../index.ts?core-test=${Date.now()}`));
});

after(() => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  globalThis.fetch = previousFetch;
  rmSync(tempHome, { recursive: true, force: true });
});

async function initializeContent(content) {
  writeFileSync(join(agentDir, "custom-providers.json"), content);
  const harness = createTestPi();
  await extension(harness.pi);
  return harness;
}

function initialize(config) {
  return initializeContent(JSON.stringify(config));
}

function createStore(entry, { acceptPublication = true } = {}) {
  let current = entry;
  const writes = [];
  let deleted = 0;
  return {
    context() {
      return {
        stored: current === undefined ? undefined : structuredClone(current),
        async publish({ persist }) {
          if (!acceptPublication) return false;
          if (persist === null) {
            current = undefined;
            deleted++;
          } else if (persist !== undefined) {
            current = structuredClone(persist);
            writes.push(current);
          }
          return true;
        },
      };
    },
    get current() { return current; },
    get writes() { return writes; },
    get deleted() { return deleted; },
  };
}

function storedModel({ id = officialOpenAIModel.id, api = "openai-responses", baseUrl = "https://provider.invalid/v1", provider = "providerA" } = {}) {
  return {
    id,
    name: "old",
    api,
    provider,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1,
    maxTokens: 1,
  };
}

async function refresh(harness, store, options = {}) {
  const provider = harness.providers.find(({ name }) => name === (options.provider ?? "providerA"));
  assert.ok(provider, "provider registered");
  return provider.config.refreshModels({
    credential: { type: "api_key", key: "test-key" },
    ...store.context(),
    allowNetwork: true,
    signal: new AbortController().signal,
    ...options,
  });
}

test("registers valid providers independently from the default path with Pi-owned credentials", async () => {
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  const originalWarn = console.warn;
  delete process.env.PI_CODING_AGENT_DIR;
  console.warn = () => {};
  try {
    const harness = await initialize({
      broken: { baseUrl: "", api: "openai-responses" },
      providerA: {
        baseUrl: "https://provider.invalid/v1/",
        api: "openai-responses",
        fastModePolicy: "request",
      },
    });
    assert.deepEqual(harness.providers.map(({ name }) => name), ["providerA"]);
    assert.equal(harness.providers[0].config.baseUrl, "https://provider.invalid/v1");
    assert.equal(harness.providers[0].config.apiKey, undefined);
    assert.equal(harness.providers[0].config.streamSimple, undefined);
  } finally {
    process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    console.warn = originalWarn;
  }
});

test("invalid JSON and non-object roots register no providers", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const content of ["{", "[]"]) {
      const harness = await initializeContent(content);
      assert.deepEqual(harness.providers, []);
    }
  } finally {
    console.error = originalError;
  }
});

test("discovers each API catalog with Pi credential and stores unmultiplied source models", async () => {
  const cases = [
    ["openai-responses", "https://provider.invalid/v1", "/models", "Authorization"],
    ["openai-completions", "https://provider.invalid/v1", "/models", "Authorization"],
    ["anthropic-messages", "https://provider.invalid", "/v1/models", "x-api-key"],
  ];
  for (const [api, baseUrl, endpoint, credentialHeader] of cases) {
    const harness = await initialize({ providerA: { baseUrl, api, costMultiplier: 2 } });
    const storage = createStore();
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, statusText: "OK", json: async () => ({ data: [{ id: officialOpenAIModel.id }, {}] }) };
    };
    try {
      const models = await refresh(harness, storage);
      assert.equal(request.url, `${baseUrl}${endpoint}`);
      assert.equal(request.options.headers[credentialHeader], credentialHeader === "Authorization" ? "Bearer test-key" : "test-key");
      assert.deepEqual(models.map(({ id }) => id), [officialOpenAIModel.id]);
      assert.equal(models[0].cost.input, officialOpenAIModel.cost.input * 2);
      assert.equal(storage.current.models[0].cost.input, officialOpenAIModel.cost.input);
      assert.deepEqual(
        [storage.current.models[0].provider, storage.current.models[0].api, storage.current.models[0].baseUrl],
        ["providerA", api, baseUrl],
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  }
});

test("relay pricing shapes refreshed models, not the stored catalog", async () => {
  const harness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses", costMultiplier: 0.5 },
  });
  const storage = createStore();
  globalThis.fetch = async () => ({
    ok: true, status: 200, statusText: "OK",
    json: async () => ({ data: [{ id: "gpt-5.6-sol" }] }),
  });
  try {
    const [model] = await refresh(harness, storage);
    assert.equal(model.cost.input, officialGpt56Sol.cost.input * 0.5);
    assert.equal(storage.current.models[0].contextWindow, officialGpt56Sol.contextWindow);
    assert.deepEqual(storage.current.models[0].cost, officialGpt56Sol.cost);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("warns once per discovered Catalog about distinct Projection fallbacks", async () => {
  const harness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses" },
  });
  const storage = createStore();
  const unknownIds = [
    "relay-only-alpha",
    "relay-only-beta",
    "relay-only-gamma",
    "relay-only-delta",
  ];
  for (const id of unknownIds) assert.equal(officialIdCounts.has(id), false, id);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      data: [
        { id: officialOpenAIModel.id },
        { id: "gpt-5.6" },
        ...unknownIds.map((id) => ({ id })),
        { id: unknownIds[0] },
      ],
    }),
  });
  try {
    const models = await refresh(harness, storage);
    assert.deepEqual(models.map(({ id }) => id), [
      officialOpenAIModel.id,
      "gpt-5.6",
      ...unknownIds,
      unknownIds[0],
    ]);

    await refresh(harness, storage, { allowNetwork: false, credential: undefined });
    await refresh(harness, storage, { allowNetwork: false, credential: undefined });

    assert.deepEqual(warnings, [
      "[custom-providers] providerA: 4 unknown Catalog IDs use conservative fallback metadata (sample: relay-only-alpha, relay-only-beta, relay-only-gamma)",
    ]);
    assert.doesNotMatch(warnings[0], /relay-only-delta/);
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = previousFetch;
  }
});

test("bounds Provider IDs and Model IDs in Projection fallback warnings", async () => {
  const provider = `provider\u2028${"p".repeat(200)}`;
  const unknownId = `relay\u2029${"m".repeat(200)}`;
  const harness = await initialize({
    [provider]: { baseUrl: "https://provider.invalid/v1", api: "openai-responses" },
  });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ data: [{ id: unknownId }] }),
  });
  try {
    await refresh(harness, createStore(), { provider });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /1 unknown Catalog ID uses conservative fallback metadata/);
    assert.doesNotMatch(warnings[0], /[\p{Cc}\p{Zl}\p{Zp}]/u);
    assert.doesNotMatch(warnings[0], new RegExp(`p{81}|m{81}`));
    assert.ok(warnings[0].length < 320);
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = previousFetch;
  }
});

test("HTTP Catalog failures retain safe response diagnostics without reading the body", async () => {
  const harness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses" },
  });
  const apiKey = "catalog-secret";
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${apiKey}`);
    return {
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: new Headers({
        "x-request-id": `request-${apiKey}`,
        "x-oai-request-id": "openai-456",
        "cf-ray": "ray-789",
        "retry-after": "30",
      }),
      json: async () => { throw new Error("response-body-secret"); },
    };
  };
  try {
    await assert.rejects(
      refresh(harness, createStore(), { credential: { type: "api_key", key: apiKey } }),
      (error) => {
        assert.equal(
          error.message,
          "HTTP 429: Too Many Requests (x-request-id=request-[redacted]; x-oai-request-id=openai-456; cf-ray=ray-789; retry-after=30)",
        );
        assert.doesNotMatch(error.message, /catalog-secret|response-body-secret/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("HTTP Catalog failures remain readable when diagnostic headers are absent", async () => {
  const harness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses" },
  });
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    statusText: "Service Unavailable",
    json: async () => ({ error: "response-body-secret" }),
  });
  try {
    await assert.rejects(refresh(harness, createStore()), (error) => {
      assert.equal(error.message, "HTTP 503: Service Unavailable");
      assert.doesNotMatch(error.message, /response-body-secret|undefined/);
      return true;
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("failed or empty relay refreshes preserve the stored catalog for cache-only recovery", async () => {
  const originalTimeout = AbortSignal.timeout;
  const harness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses" },
  });
  const responses = [
    async () => ({ ok: true, status: 200, statusText: "OK", json: async () => ({}) }),
    async () => ({ ok: true, status: 200, statusText: "OK", json: async () => ({ data: [] }) }),
    async () => ({ ok: false, status: 401, statusText: "Unauthorized", json: async () => ({}) }),
    async () => { throw new Error("network unavailable"); },
  ];
  try {
    for (const respond of responses) {
      const storage = createStore({ checkedAt: 0, models: [storedModel()] });
      globalThis.fetch = respond;
      await assert.rejects(refresh(harness, storage));
      assert.deepEqual(storage.writes, []);

      const recovered = await refresh(harness, storage, {
        allowNetwork: false,
        credential: undefined,
      });
      assert.deepEqual(recovered.map(({ id }) => id), [officialOpenAIModel.id]);
    }

    let timeoutMs;
    let timeoutRequests = 0;
    AbortSignal.timeout = (milliseconds) => {
      timeoutMs = milliseconds;
      return AbortSignal.abort();
    };
    globalThis.fetch = async (_url, options) => {
      timeoutRequests++;
      assert.equal(options.signal.aborted, true);
      throw new Error("timed out");
    };
    await assert.rejects(refresh(
      harness,
      createStore({ checkedAt: 0, models: [storedModel()] }),
    ));
    assert.equal(timeoutMs, 5_000);
    assert.equal(timeoutRequests, 1);
  } finally {
    AbortSignal.timeout = originalTimeout;
    globalThis.fetch = previousFetch;
  }
});

test("uses catalogs below the 7-day TTL and refreshes catalogs past TTL or forced", async () => {
  const harness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses", costMultiplier: 2 },
  });
  const originalNow = Date.now;
  const now = originalNow();
  const ttl = 7 * 24 * 60 * 60 * 1000;
  const freshStorage = createStore({ checkedAt: now - ttl + 1, models: [storedModel()] });
  const expiredStorage = createStore({ checkedAt: now - ttl, models: [storedModel()] });
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return { ok: true, status: 200, statusText: "OK", json: async () => ({ data: [{ id: "refreshed" }] }) };
  };
  Date.now = () => now;
  try {
    const cached = await refresh(harness, freshStorage);
    const expired = await refresh(harness, expiredStorage);
    const forced = await refresh(harness, expiredStorage, { force: true });
    assert.equal(cached[0].name, officialOpenAIModel.name);
    assert.equal(cached[0].cost.input, officialOpenAIModel.cost.input * 2);
    assert.deepEqual(expired.map(({ id }) => id), ["refreshed"]);
    assert.deepEqual(forced.map(({ id }) => id), ["refreshed"]);
    assert.equal(requests, 2);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = previousFetch;
  }
});

test("/refresh-custom-models targets configured relays and reports the host result", async () => {
  const harness = await initialize({
    providerA: { baseUrl: "https://a.invalid/v1", api: "openai-responses" },
    providerB: { baseUrl: "https://b.invalid/v1", api: "openai-completions" },
  });
  const command = harness.commands.get("refresh-custom-models");
  assert.ok(command, "refresh command registered");

  const results = [
    { aborted: false, errors: new Map() },
    { aborted: true, errors: new Map() },
    { aborted: false, errors: new Map([["providerB", new Error("HTTP 429: Too Many Requests (x-request-id=request-123)")]]) },
  ];
  const refreshOptions = [];
  const notifications = [];
  const ctx = {
    modelRegistry: {
      async refresh(options) {
        refreshOptions.push(options);
        return results.shift();
      },
    },
    ui: {
      notify(message, level) { notifications.push([message, level]); },
    },
  };

  await command.handler("", ctx);
  await command.handler("", ctx);
  await command.handler("", ctx);

  assert.deepEqual(refreshOptions, [
    { providers: ["providerA", "providerB"], force: true },
    { providers: ["providerA", "providerB"], force: true },
    { providers: ["providerA", "providerB"], force: true },
  ]);
  assert.deepEqual(notifications, [
    ["Catalog refresh completed for 2 relays", "info"],
    ["Catalog refresh cancelled", "warning"],
    ["Catalog refresh failed for providerB: HTTP 429: Too Many Requests (x-request-id=request-123)", "error"],
  ]);
});

test("/refresh-custom-models skips the host refresh when no relays are configured", async () => {
  const harness = await initialize({});
  const command = harness.commands.get("refresh-custom-models");
  const notifications = [];
  await command.handler("", {
    modelRegistry: {
      async refresh() { throw new Error("refresh should not run"); },
    },
    ui: {
      notify(message, level) { notifications.push([message, level]); },
    },
  });
  assert.deepEqual(notifications, [["No relays configured", "warning"]]);
});

test("cache-only startup rejects invalid stores and shares one eligible pre-scope discovery", async () => {
  const harness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses" },
  });
  const invalidStores = [
    { checkedAt: Date.now() },
    { checkedAt: Date.now(), models: [] },
    { checkedAt: Date.now(), models: [storedModel({ id: "" })] },
    { checkedAt: Date.now(), models: [storedModel({ provider: "other" })] },
    { checkedAt: Date.now(), models: [storedModel({ api: "openai-completions" })] },
    { checkedAt: Date.now(), models: [storedModel({ baseUrl: "https://other.invalid/v1" })] },
  ].map(createStore);
  for (const storage of invalidStores) {
    assert.deepEqual(await refresh(harness, storage, {
      allowNetwork: false,
      credential: undefined,
    }), []);
    assert.equal(storage.deleted, 1);
  }

  const cachedHarness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses" },
  });
  let cachedRequests = 0;
  globalThis.fetch = async () => { cachedRequests++; };
  const cached = await refresh(
    cachedHarness,
    createStore({ checkedAt: Date.now(), models: [storedModel()] }),
    { allowNetwork: false },
  );
  assert.deepEqual(cached.map(({ id }) => id), [officialOpenAIModel.id]);
  assert.equal(cachedRequests, 0);

  const storage = createStore();
  let requests = 0;
  let releaseFetch;
  const fetchGate = new Promise((resolve) => { releaseFetch = resolve; });
  globalThis.fetch = async () => {
    requests++;
    await fetchGate;
    return { ok: true, status: 200, statusText: "OK", json: async () => ({ data: [{ id: "first-model" }] }) };
  };
  const previousOffline = process.env.PI_OFFLINE;
  process.env.PI_OFFLINE = "";
  try {
    assert.deepEqual(await refresh(harness, storage, { allowNetwork: false }), []);
    const controller = new AbortController();
    controller.abort();
    assert.deepEqual(await refresh(harness, storage, {
      allowNetwork: false,
      signal: controller.signal,
    }), []);
    assert.deepEqual(await refresh(harness, storage, {
      allowNetwork: false,
      credential: undefined,
    }), []);
    assert.equal(requests, 0);

    delete process.env.PI_OFFLINE;
    const first = refresh(harness, storage, { allowNetwork: false });
    const second = refresh(harness, storage, { allowNetwork: false });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests, 1);
    releaseFetch();
    const results = await Promise.all([first, second]);
    assert.deepEqual(results.map((models) => models.map(({ id }) => id)), [
      ["first-model"],
      ["first-model"],
    ]);
  } finally {
    if (previousOffline === undefined) delete process.env.PI_OFFLINE;
    else process.env.PI_OFFLINE = previousOffline;
    globalThis.fetch = previousFetch;
  }
});

test("a superseding cache-only generation publishes the shared Pre-Scope Discovery", async () => {
  const harness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses" },
  });
  const storage = createStore();
  const firstController = new AbortController();
  let requests = 0;
  let respond;
  globalThis.fetch = async (_url, { signal }) => new Promise((resolve, reject) => {
    requests++;
    respond = () => resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ data: [{ id: "discovered" }] }),
    });
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  try {
    const first = refresh(harness, storage, {
      allowNetwork: false,
      signal: firstController.signal,
    });
    for (let attempt = 0; attempt < 20 && !respond; attempt++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(respond, "Pre-Scope Discovery started");

    const replacement = refresh(harness, storage, { allowNetwork: false });
    firstController.abort();
    respond();

    await first;
    const models = await replacement;
    assert.deepEqual(models.map(({ id }) => id), ["discovered"]);
    assert.equal(requests, 1);
    assert.deepEqual(storage.current.models.map(({ id }) => id), ["discovered"]);
    assert.equal(storage.writes.length, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("a superseded forced refresh is cancelled while its replacement publishes", async () => {
  const harness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses" },
  });
  const storage = createStore({ checkedAt: Date.now(), models: [storedModel()] });
  const requests = [];
  globalThis.fetch = async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    requests.push(resolve);
  });
  try {
    const firstController = new AbortController();
    const first = refresh(harness, storage, { force: true, signal: firstController.signal });
    const firstCancelled = assert.rejects(first, { name: "AbortError" });
    const replacement = refresh(harness, storage, { force: true });
    for (let attempt = 0; attempt < 20 && requests.length < 2; attempt++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(requests.length, 2);

    firstController.abort();
    requests[1]({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ data: [{ id: "replacement" }] }),
    });

    await firstCancelled;
    assert.deepEqual((await replacement).map(({ id }) => id), ["replacement"]);
    assert.deepEqual(storage.current.models.map(({ id }) => id), ["replacement"]);
    assert.equal(storage.writes.length, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("failed pre-scope discovery degrades to cache-only instead of rejecting", async () => {
  const harness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses" },
  });
  const storage = createStore();
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("relay unreachable");
  };
  try {
    assert.deepEqual(await refresh(harness, storage, { allowNetwork: false }), []);
    assert.equal(requests, 1);
    assert.deepEqual(storage.writes, []);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("cancelled catalog response neither publishes, writes, nor warns", async () => {
  const harness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses" },
  });
  const storage = createStore({ checkedAt: 0, models: [storedModel()] });
  const controller = new AbortController();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    async json() {
      controller.abort();
      return { data: [{ id: "cancelled" }] };
    },
  });
  try {
    const models = await refresh(harness, storage, { signal: controller.signal });
    assert.deepEqual(models.map(({ id }) => id), [officialOpenAIModel.id]);
    assert.deepEqual(storage.writes, []);
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = previousFetch;
  }
});

test("superseded catalog publication preserves the store without warning", async () => {
  const harness = await initialize({
    providerA: { baseUrl: "https://provider.invalid/v1", api: "openai-responses" },
  });
  const stored = { checkedAt: 0, models: [storedModel()] };
  const storage = createStore(stored, { acceptPublication: false });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ data: [{ id: "superseded" }] }),
  });
  try {
    const models = await refresh(harness, storage);
    assert.deepEqual(models.map(({ id }) => id), [officialOpenAIModel.id]);
    assert.deepEqual(storage.current, stored);
    assert.deepEqual(storage.writes, []);
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = previousFetch;
  }
});
