import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerFastMode } from "./src/fast-mode.ts";
import { registerProviders } from "./src/providers.ts";

export default function (pi: ExtensionAPI) {
  const { fastModePolicies, beginForcedCatalogRefresh } = registerProviders(pi);
  registerFastMode(pi, fastModePolicies);

  pi.registerCommand("refresh-custom-models", {
    description: "Force refresh configured relay Catalogs",
    handler: async (_args, ctx) => {
      const forcedRefresh = beginForcedCatalogRefresh();
      if (forcedRefresh.providerCount === 0) {
        forcedRefresh.finish();
        ctx.ui.notify("No relays configured", "warning");
        return;
      }
      try {
        await ctx.modelRegistry.refresh();
      } finally {
        forcedRefresh.finish();
      }
      ctx.ui.notify(`Catalog refresh requested for ${forcedRefresh.providerCount} relays`, "info");
    },
  });
}
