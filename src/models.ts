import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type { Api, Model, ModelCost, RefreshModelsContext } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";

export type ProviderApi =
  | "openai-responses"
  | "openai-completions"
  | "anthropic-messages";

export interface ProviderConfig {
  baseUrl: string;
  api: ProviderApi;
  costMultiplier?: number;
  modelCostMultipliers?: Record<string, number>;
}

const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CATALOG_TIMEOUT_MS = 5_000;
const DEFAULT_MODEL: Omit<ProviderModelConfig, "id" | "name"> = {
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 4_096,
};
const OFFICIAL_MODELS = new Map<string, Model<Api>>(
  [
    ...getBuiltinModels("openai"),
    ...getBuiltinModels("anthropic"),
    ...getBuiltinModels("xai"),
    ...getBuiltinModels("moonshotai"),
    ...getBuiltinModels("zai"),
    ...getBuiltinModels("deepseek"),
  ].map((model) => [model.id, model as Model<Api>]),
);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function multiplierFor(modelId: string, config: ProviderConfig): number {
  const modelMultiplier = config.modelCostMultipliers && Object.hasOwn(config.modelCostMultipliers, modelId)
    ? config.modelCostMultipliers[modelId]
    : undefined;
  return modelMultiplier ?? config.costMultiplier ?? 1;
}

function multiplyCost(cost: ModelCost, multiplier: number): ModelCost {
  return {
    ...cost,
    input: cost.input * multiplier,
    output: cost.output * multiplier,
    cacheRead: cost.cacheRead * multiplier,
    cacheWrite: cost.cacheWrite * multiplier,
    ...(cost.tiers && {
      tiers: cost.tiers.map((tier) => ({
        ...tier,
        input: tier.input * multiplier,
        output: tier.output * multiplier,
        cacheRead: tier.cacheRead * multiplier,
        cacheWrite: tier.cacheWrite * multiplier,
      })),
    }),
  };
}

// ADR-0003: exact-match aliases only; no prefix or fuzzy resolution.
const ALIASES = new Map<string, string>([["gpt-5.6", "gpt-5.6-sol"]]);

export function buildModelDefinition(
  id: string,
  config: ProviderConfig,
  multiplier = multiplierFor(id, config),
): ProviderModelConfig {
  const official = OFFICIAL_MODELS.get(ALIASES.get(id) ?? id);
  const thinkingLevelMap = official?.thinkingLevelMap && { ...official.thinkingLevelMap };
  return {
    id,
    name: official?.name ?? id,
    reasoning: official?.reasoning ?? DEFAULT_MODEL.reasoning,
    input: official ? [...official.input] : [...DEFAULT_MODEL.input],
    cost: multiplyCost(official?.cost ?? DEFAULT_MODEL.cost, multiplier),
    contextWindow: official?.contextWindow ?? DEFAULT_MODEL.contextWindow,
    maxTokens: official?.maxTokens ?? DEFAULT_MODEL.maxTokens,
    ...(thinkingLevelMap && { thinkingLevelMap }),
    ...(official?.api === config.api && official.compat && {
      compat: { ...official.compat } as ProviderModelConfig["compat"],
    }),
  };
}

function storedIds(
  stored: unknown,
  provider: string,
  api: ProviderApi,
  baseUrl: string,
): string[] | undefined {
  if (!isRecord(stored) || !Array.isArray(stored.models) || stored.models.length === 0) {
    return undefined;
  }
  const ids: string[] = [];
  for (const model of stored.models) {
    if (
      !isRecord(model)
      || typeof model.id !== "string"
      || model.id.length === 0
      || model.provider !== provider
      || model.api !== api
      || typeof model.baseUrl !== "string"
      || normalizeBaseUrl(model.baseUrl) !== baseUrl
    ) {
      return undefined;
    }
    ids.push(model.id);
  }
  return ids;
}

function fresh(stored: unknown): boolean {
  if (!isRecord(stored) || typeof stored.checkedAt !== "number" || !Number.isFinite(stored.checkedAt)) {
    return false;
  }
  const age = Date.now() - stored.checkedAt;
  return age >= 0 && age < CATALOG_TTL_MS;
}

async function fetchIds(
  baseUrl: string,
  api: ProviderApi,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const anthropic = api === "anthropic-messages";
  const timeout = AbortSignal.timeout(CATALOG_TIMEOUT_MS);
  const response = await fetch(`${baseUrl}${anthropic ? "/v1/models" : "/models"}`, {
    headers: anthropic
      ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
      : { Authorization: `Bearer ${apiKey}` },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const payload = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("Invalid model response; expected a data array.");
  }
  const ids = payload.data.flatMap((item) =>
    isRecord(item) && typeof item.id === "string" && item.id.length > 0 ? [item.id] : [],
  );
  if (ids.length === 0) throw new Error("Model refresh returned no models.");
  return ids;
}

function catalogStoreEntry(ids: readonly string[], provider: string, config: ProviderConfig) {
  return {
    checkedAt: Date.now(),
    models: ids.map((id) => ({
      ...buildModelDefinition(id, config, 1),
      provider,
      api: config.api,
      baseUrl: config.baseUrl,
    })),
  };
}

export function createModelRefresh(
  provider: string,
  config: ProviderConfig,
  isForcedRefreshRequested: () => boolean,
) {
  let preScopeAttempted = false;
  let preScopeRefresh: Promise<ProviderModelConfig[]> | undefined;
  const refresh = async (
    context: RefreshModelsContext,
    preScope = false,
  ): Promise<ProviderModelConfig[]> => {
    const stored = context.stored;
    const ids = storedIds(stored, provider, config.api, config.baseUrl);
    if (
      stored !== undefined
      && ids === undefined
      && !(await context.publish({ persist: null }))
    ) return [];

    const cached = (ids ?? []).map((id) => buildModelDefinition(id, config));
    const apiKey = context.credential?.type === "api_key" ? context.credential.key : undefined;
    const locallyForced = context.allowNetwork
      && !context.signal.aborted
      && apiKey !== undefined
      && isForcedRefreshRequested();
    if (
      context.signal.aborted
      || (!(context.allowNetwork || (preScope && ids === undefined)))
      || (!(context.force || locallyForced) && ids !== undefined && fresh(stored))
      || !apiKey
    ) {
      return cached;
    }

    // Discovery is shared across superseding cache-only generations, so the request
    // uses its own timeout while each generation still guards publication with its signal.
    const fetchedIds = await fetchIds(
      config.baseUrl,
      config.api,
      apiKey,
      preScope ? undefined : context.signal,
    );
    const models = fetchedIds.map((id) => buildModelDefinition(id, config));
    // A superseding cache-only generation can still publish this shared discovery result.
    if (context.signal.aborted) return preScope ? models : cached;
    const published = await context.publish({
      persist: catalogStoreEntry(fetchedIds, provider, config),
    });
    return published || preScope ? models : cached;
  };

  return (context: RefreshModelsContext): Promise<ProviderModelConfig[]> => {
    if (!context.allowNetwork && preScopeRefresh) {
      return preScopeRefresh.then(async (models) => {
        if (context.signal.aborted || models.length === 0) return [];
        const published = await context.publish({
          persist: catalogStoreEntry(models.map(({ id }) => id), provider, config),
        });
        return published ? models : [];
      });
    }
    const apiKey = context.credential?.type === "api_key" ? context.credential.key : undefined;
    if (!context.allowNetwork && !preScopeAttempted && apiKey && process.env.PI_OFFLINE === undefined && !context.signal.aborted) {
      preScopeAttempted = true;
      const promise = Promise.resolve()
        .then(() => refresh(context, true))
        // ADR-0008: discovery is opportunistic, so a failed fetch degrades to cache-only.
        .catch(() => refresh(context));
      preScopeRefresh = promise;
      promise
        .finally(() => { if (preScopeRefresh === promise) preScopeRefresh = undefined; })
        .catch(() => {});
      return promise;
    }
    return refresh(context);
  };
}
