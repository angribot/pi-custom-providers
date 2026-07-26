import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerFastMode } from "./fast-mode.ts";
import { registerProviders } from "./providers.ts";

export default function (pi: ExtensionAPI) {
  const { fastModePolicies } = registerProviders(pi);
  registerFastMode(pi, fastModePolicies);
}
