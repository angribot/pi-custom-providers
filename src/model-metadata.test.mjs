import assert from "node:assert/strict";
import test from "node:test";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";

import { buildModelDefinition } from "./models.ts";

const PROVIDERS = ["openai", "anthropic", "xai", "moonshotai", "zai", "deepseek"];
const CATALOGS = new Map(PROVIDERS.map((provider) => [provider, getBuiltinModels(provider)]));
const ID_COUNTS = new Map();
for (const models of CATALOGS.values()) {
  for (const { id } of models) ID_COUNTS.set(id, (ID_COUNTS.get(id) ?? 0) + 1);
}
const OFFICIAL_IDS = new Set(ID_COUNTS.keys());

function providerConfig(api, extra = {}) {
  return { baseUrl: "https://provider.invalid", api, ...extra };
}

// Conflicting IDs have no recorded precedence; contract projection tests use only unambiguous samples.
function unambiguousCatalogModel(provider, predicate = () => true) {
  const models = CATALOGS.get(provider).filter(
    (candidate) => ID_COUNTS.get(candidate.id) === 1 && predicate(candidate),
  );
  const model = models.find((candidate) => candidate.thinkingLevelMap !== undefined) ?? models[0];
  assert.ok(model, `${provider} catalog must expose an unambiguous representative model`);
  return model;
}

function assertCostMultiplier(actual, official, multiplier) {
  for (const field of ["input", "output", "cacheRead", "cacheWrite"]) {
    assert.equal(actual[field], official[field] * multiplier, field);
  }
}

test("all declared official catalogs project exact model metadata", () => {
  const fields = [
    "name",
    "reasoning",
    "input",
    "cost",
    "contextWindow",
    "maxTokens",
    "thinkingLevelMap",
  ];

  for (const provider of PROVIDERS) {
    const official = unambiguousCatalogModel(provider);
    const model = buildModelDefinition(official.id, providerConfig(official.api));

    assert.equal(model.id, official.id, provider);
    for (const field of fields) assert.deepEqual(model[field], official[field], `${provider}.${field}`);
    assert.equal(model.provider, undefined, `${provider}.provider`);
    assert.equal(model.api, undefined, `${provider}.api`);
    assert.equal(model.baseUrl, undefined, `${provider}.baseUrl`);
    assert.equal(model.headers, undefined, `${provider}.headers`);
  }
});

test("official compat is copied only for the same API", () => {
  const official = PROVIDERS
    .flatMap((provider) => CATALOGS.get(provider))
    .find((model) => ID_COUNTS.get(model.id) === 1 && model.compat !== undefined);
  assert.ok(official, "official catalogs must expose an unambiguous model with compat");
  const crossApi = ["openai-responses", "openai-completions", "anthropic-messages"]
    .find((api) => api !== official.api);
  assert.ok(crossApi);

  assert.deepEqual(
    buildModelDefinition(official.id, providerConfig(official.api)).compat,
    official.compat,
  );
  assert.equal(
    buildModelDefinition(official.id, providerConfig(crossApi)).compat,
    undefined,
  );
});

test("official metadata lookup is exact and unknown IDs use conservative defaults", () => {
  const official = unambiguousCatalogModel("openai");
  let unknown = `${official.id}-custom-suffix`;
  while (OFFICIAL_IDS.has(unknown)) unknown += "-unknown";

  const model = buildModelDefinition(unknown, providerConfig("openai-responses"));
  assert.deepEqual(model, {
    id: unknown,
    name: unknown,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4_096,
  });
  assert.equal(
    buildModelDefinition("toString", providerConfig("openai-responses")).name,
    "toString",
  );
});

test("exact gpt-5.6 alias inherits gpt-5.6-sol metadata", () => {
  const alias = buildModelDefinition(
    "gpt-5.6",
    providerConfig("openai-responses"),
  );
  const sol = buildModelDefinition(
    "gpt-5.6-sol",
    providerConfig("openai-responses"),
  );

  assert.deepEqual(alias, { ...sol, id: "gpt-5.6" });
  assert.equal(
    buildModelDefinition("gpt-5.6-custom-suffix", providerConfig("openai-responses")).name,
    "gpt-5.6-custom-suffix",
  );
  const pricedAlias = buildModelDefinition("gpt-5.6", providerConfig("openai-responses", {
    modelCostMultipliers: { "gpt-5.6": 2, "gpt-5.6-sol": 3 },
  }));
  assertCostMultiplier(pricedAlias.cost, sol.cost, 2);
});

test("provider costMultiplier keeps non-tiered costs unchanged in shape", () => {
  const official = unambiguousCatalogModel("anthropic", (model) => !model.cost.tiers);
  const model = buildModelDefinition(
    official.id,
    providerConfig(official.api, { costMultiplier: 2 }),
  );

  assertCostMultiplier(model.cost, official.cost, 2);
  assert.equal(model.cost.tiers, undefined);
});

test("cost multipliers preserve tier thresholds and model precedence", () => {
  const official = unambiguousCatalogModel("openai", (model) => model.cost.tiers?.length > 0);
  const providerPriced = buildModelDefinition(
    official.id,
    providerConfig(official.api, { costMultiplier: 2 }),
  );
  const modelPriced = buildModelDefinition(
    official.id,
    providerConfig(official.api, {
      costMultiplier: 0.5,
      modelCostMultipliers: { [official.id]: 2 },
    }),
  );

  assertCostMultiplier(providerPriced.cost, official.cost, 2);
  assertCostMultiplier(modelPriced.cost, official.cost, 2);
  assert.deepEqual(modelPriced.cost.tiers, providerPriced.cost.tiers);
  assert.equal(providerPriced.cost.tiers.length, official.cost.tiers.length);
  for (let index = 0; index < official.cost.tiers.length; index++) {
    const expected = official.cost.tiers[index];
    const actual = providerPriced.cost.tiers[index];
    assert.equal(actual.inputTokensAbove, expected.inputTokensAbove);
    assertCostMultiplier(actual, expected, 2);
  }
});
