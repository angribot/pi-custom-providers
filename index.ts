import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerFastMode } from "./src/fast-mode.ts";
import { registerProviders } from "./src/providers.ts";

export default function (pi: ExtensionAPI) {
  const { fastModePolicies, providerIds } = registerProviders(pi);
  registerFastMode(pi, fastModePolicies);

  pi.registerCommand("refresh-custom-models", {
    description: "Force refresh configured relay Catalogs",
    handler: async (_args, ctx) => {
      if (providerIds.length === 0) {
        ctx.ui.notify("No relays configured", "warning");
        return;
      }

      const result = await ctx.modelRegistry.refresh({ providers: providerIds, force: true });
      if (result.aborted) {
        ctx.ui.notify("Catalog refresh cancelled", "warning");
        return;
      }
      if (result.errors.size > 0) {
        const failures = [...result.errors]
          .map(([providerId, error]) => `${providerId}: ${error.message}`)
          .join("; ");
        ctx.ui.notify(`Catalog refresh failed for ${failures}`, "error");
        return;
      }
      ctx.ui.notify(`Catalog refresh completed for ${providerIds.length} relays`, "info");
    },
  });
}
