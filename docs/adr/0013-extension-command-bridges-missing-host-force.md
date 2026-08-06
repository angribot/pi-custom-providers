# Extension command bridges the missing host force surface

Superseded by ADR 0014 after Pi 0.84 added targeted force options and refresh results to `ModelRegistry.refresh()`.

ADR 0007 assigned forced Catalog refresh to the host. Current Pi exposes `pi update --models`, but that command builds a model runtime without loading third-party extensions, so it cannot refresh relay Catalogs registered here. The extension-facing `ModelRegistry.refresh()` does load them, but exposes no `force` option.

The extension therefore registers `/refresh-custom-models`. Invoking it scopes force intent around one awaited `ctx.modelRegistry.refresh()` call. Every network-enabled relay refresh inside that scope bypasses Catalog Freshness; the scope closes in `finally`, so failed or skipped host refreshes cannot force an unrelated later call. Overlapping command invocations hold independent scopes and therefore still issue independent fetches.

The force scope lives in extension memory rather than the Catalog Store. We do not edit or delete Pi's shared `models-store.json`, avoid depending on its file format and locking, and preserve the stored Catalog when the relay request fails. Pi still owns credentials, persistence, model publication, and the refresh lifecycle; the extension only supplies the missing force intent.

`ModelRegistry.refresh()` does not expose per-provider refresh errors, so the command reports that refresh was requested, not that every relay succeeded. If Pi later accepts refresh options through the extension interface, replace the force scope with `refresh({ force: true })` and retire this bridge.

This supersedes ADR 0007's decision not to register an extension refresh command. Its 7-day TTL and Catalog Freshness rules remain unchanged.
