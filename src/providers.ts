import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { FastModePolicy } from "./fast-mode.ts";
import {
  createModelRefresh,
  isRecord,
  normalizeBaseUrl,
  type ProviderApi,
  type ProviderConfig,
} from "./models.ts";

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function providerConfig(configured: unknown): ProviderConfig | undefined {
  if (!isRecord(configured) || typeof configured.baseUrl !== "string") return undefined;
  const baseUrl = normalizeBaseUrl(configured.baseUrl);
  const api = configured.api as ProviderApi;
  if (!baseUrl || ![
    "openai-responses",
    "openai-completions",
    "anthropic-messages",
  ].includes(api)) return undefined;

  const costMultiplier = typeof configured.costMultiplier === "number"
    && Number.isFinite(configured.costMultiplier)
    && configured.costMultiplier >= 0
    ? configured.costMultiplier
    : undefined;
  const modelCostMultipliers = isRecord(configured.modelCostMultipliers)
    ? Object.fromEntries(
      Object.entries(configured.modelCostMultipliers).flatMap(([id, value]) =>
        id.length > 0 && typeof value === "number" && Number.isFinite(value) && value >= 0
          ? [[id, value] as const]
          : [],
      ),
    )
    : undefined;

  return {
    baseUrl,
    api,
    ...(costMultiplier !== undefined && { costMultiplier }),
    ...(modelCostMultipliers && Object.keys(modelCostMultipliers).length > 0 && { modelCostMultipliers }),
  };
}

// Fast mode is a request-time concern, so it stays out of ProviderConfig.
function fastModePolicy(configured: unknown, api: ProviderApi): FastModePolicy | undefined {
  if (!isRecord(configured) || api !== "openai-responses") return undefined;
  return configured.fastModePolicy === "request" || configured.fastModePolicy === "disabled"
    ? configured.fastModePolicy
    : undefined;
}

export function registerProviders(pi: ExtensionAPI): {
  fastModePolicies: Map<string, FastModePolicy>;
  providerIds: string[];
} {
  const fastModePolicies = new Map<string, FastModePolicy>();
  const providerIds: string[] = [];
  const registration = { fastModePolicies, providerIds };
  const configPath = path.join(
    process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), ".pi", "agent"),
    "custom-providers.json",
  );
  if (!fs.existsSync(configPath)) return registration;

  let config: unknown;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    console.error(`[custom-providers] Config parse failed: ${formatError(error)}`);
    return registration;
  }
  if (!isRecord(config)) {
    console.error("[custom-providers] Invalid config; expected an object.");
    return registration;
  }

  for (const [name, configured] of Object.entries(config)) {
    if (name === "$schema") continue;
    try {
      const provider = providerConfig(configured);
      if (!provider) {
        console.warn(`[custom-providers] ${name}: invalid provider; skipped.`);
        continue;
      }
      pi.registerProvider(name, {
        baseUrl: provider.baseUrl,
        api: provider.api,
        refreshModels: createModelRefresh(name, provider),
      });
      providerIds.push(name);
      const policy = fastModePolicy(configured, provider.api);
      if (policy) fastModePolicies.set(name, policy);
    } catch (error) {
      console.error(`[custom-providers] ${name}: setup failed: ${formatError(error)}`);
    }
  }

  return registration;
}
