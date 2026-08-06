# Use Pi's native targeted Forced Catalog Refresh

Pi 0.84 gives extension commands the force surface ADR 0013 was waiting for: `ModelRegistry.refresh({ providers, force })` accepts exact Provider IDs, and its result reports cancellation plus provider-specific errors. `/refresh-custom-models` therefore passes the Provider IDs successfully registered from the Config File with `force: true`. Invalid entries never enter that list, and unrelated builtin or extension providers are not refreshed.

The extension-local force-depth bridge is removed. Catalog Freshness now reads only the host's `context.force`, while Pi owns refresh generations, cancellation, persistence, and publication. When Forced Catalog Refresh operations overlap for one relay, the newer generation aborts the older one; only the current generation can publish. A relay request that throws publishes nothing, so its stored Catalog remains available.

The command treats the refresh result as user-visible truth. It reports complete success only when the operation was not aborted and the provider error map is empty, reports cancellation separately, and names each Provider ID whose refresh failed.

This supersedes ADR 0013. The extension command remains necessary because `pi update --models` does not load third-party extensions, but the command no longer bridges missing force state in extension memory.
