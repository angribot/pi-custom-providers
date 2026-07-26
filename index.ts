import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerFastMode } from "./src/fast-mode.ts";
import { registerProviders } from "./src/providers.ts";

export default function (pi: ExtensionAPI) {
  const { fastModePolicies } = registerProviders(pi);
  registerFastMode(pi, fastModePolicies);
}
