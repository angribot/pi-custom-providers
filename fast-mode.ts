// Keep the host API type-only; runtime Pi imports are exact local dependencies.
import type { CustomEntry, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { calculateCost, type Usage } from "@earendil-works/pi-ai";
export type FastModePolicy = "response" | "request" | "disabled";

const ENTRY_TYPE = "fast-mode";
const FAST_STATUS_KEY = "custom-providers-fast-mode";

type SelectedModel = {
  api?: string;
  id: string;
  provider: string;
};

interface FastModeEntryData {
  enabled: boolean;
}

type PendingRequestPricing = {
  model: string;
  provider: string;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// ADR-0011: vendor-published priority-tier premiums, not derivable from cost.tiers.
function applyPrioritySurcharge(cost: Usage["cost"], modelId: string): Usage["cost"] {
  const multiplier = modelId === "gpt-5.5" ? 2.5 : 2;
  const input = cost.input * multiplier;
  const output = cost.output * multiplier;
  const cacheRead = cost.cacheRead * multiplier;
  const cacheWrite = cost.cacheWrite * multiplier;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
  };
}

export function registerFastMode(
  pi: ExtensionAPI,
  providerPolicies: ReadonlyMap<string, FastModePolicy> = new Map(),
): void {
  pi.registerFlag("fast", {
    description: "Start with fast mode enabled",
    type: "boolean",
    default: false,
  });

  let enabled = false;
  let startupFlagApplied = false;
  let pendingRequestPricing: PendingRequestPricing | undefined;

  const policyFor = (candidate: SelectedModel | undefined): FastModePolicy =>
    candidate?.provider ? providerPolicies.get(candidate.provider) ?? "response" : "response";

  const isApplicable = (candidate: SelectedModel | undefined): boolean =>
    candidate?.api === "openai-responses" && policyFor(candidate) !== "disabled";

  const syncStatus = (ctx: ExtensionContext, model: SelectedModel | undefined = ctx.model as SelectedModel | undefined): void => {
    if (ctx.mode === "tui") ctx.ui.setStatus(FAST_STATUS_KEY, enabled && isApplicable(model) ? "⚡ Fast mode" : undefined);
  };

  pi.registerCommand("fast", {
    description: "Toggle fast mode",
    handler: async (_args, ctx) => {
      enabled = !enabled;
      pi.appendEntry<FastModeEntryData>(ENTRY_TYPE, { enabled });
      syncStatus(ctx);
      ctx.ui.notify(
        enabled ? "⚡ Fast mode on" : "Fast mode off",
        "info",
      );
    },
  });

  pi.on("before_provider_request", (event, ctx) => {
    pendingRequestPricing = undefined;
    const requestModel = ctx.model as SelectedModel | undefined;
    if (!enabled || !isApplicable(requestModel)) return undefined;
    const payload = event.payload;
    if (!isPlainRecord(payload)) return undefined;
    if (policyFor(requestModel) === "request" && requestModel) {
      pendingRequestPricing = {
        model: requestModel.id,
        provider: requestModel.provider,
      };
    }
    return { ...payload, service_tier: "priority" };
  });

  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return undefined;

    if (
      pendingRequestPricing?.provider !== message.provider
      || pendingRequestPricing.model !== message.model
    ) {
      return undefined;
    }
    pendingRequestPricing = undefined;

    const registryModel = ctx.modelRegistry.find(message.provider, message.model);
    if (!registryModel) return undefined;

    const baseCost = calculateCost(registryModel, {
      ...message.usage,
      cost: { ...message.usage.cost },
    });
    const cost = applyPrioritySurcharge(baseCost, message.model);
    return {
      message: {
        ...message,
        usage: {
          ...message.usage,
          cost,
        },
      },
    };
  });

  const restore = (ctx: ExtensionContext): void => {
    const entry = ctx.sessionManager.getBranch().findLast(
      (candidate): candidate is CustomEntry =>
        candidate.type === "custom" && candidate.customType === ENTRY_TYPE,
    );
    enabled = (entry?.data as FastModeEntryData | undefined)?.enabled === true;
    syncStatus(ctx);
  };

  pi.on("session_start", (event, ctx) => {
    pendingRequestPricing = undefined;
    restore(ctx);

    if (
      event.reason === "startup"
      && !startupFlagApplied
      && pi.getFlag("fast") === true
    ) {
      startupFlagApplied = true;
      if (!enabled) {
        enabled = true;
        pi.appendEntry<FastModeEntryData>(ENTRY_TYPE, { enabled: true });
        syncStatus(ctx);
      }
    }
  });
  pi.on("session_tree", (_event, ctx) => restore(ctx));
  pi.on("model_select", (event, ctx) => syncStatus(ctx, event.model as SelectedModel));
  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.mode === "tui") ctx.ui.setStatus(FAST_STATUS_KEY, undefined);
  });
}
