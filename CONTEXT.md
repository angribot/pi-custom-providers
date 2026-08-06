# Custom Providers

A Pi extension that registers user-configured **relays** as Pi providers, projects official model metadata onto the model IDs they expose, and re-prices them to what the relay actually charges.

## Language

### Relays and configuration

**Relay**:
A third-party endpoint that re-exposes another vendor's models under its own base URL, key, and price. Not the model vendor.
_Avoid_: proxy, mirror, gateway, upstream

**Provider ID**:
The config key a relay is registered under in `custom-providers.json`, and the name Pi shows in `provider/model`.
_Avoid_: provider name, alias

**Relay API**:
Which wire protocol a relay speaks: `openai-responses`, `openai-completions`, or `anthropic-messages`. Fixed per relay, not per model.
_Avoid_: api type, protocol, format

### Models and metadata

**Catalog**:
The list of model IDs one relay currently exposes, as returned by its `/models` endpoint.
_Avoid_: model list, inventory

**Official Model**:
A builtin `pi-ai` model definition, keyed by exact model ID. The source of truth for context window, cost, reasoning, and input modes.
_Avoid_: upstream model, real model, vendor model

**Projection**:
Building a Pi model definition from a catalog ID by looking up its Official Model and applying relay pricing. An ID with no Official Model gets conservative defaults instead.
_Avoid_: mapping, enrichment, hydration

**Alias**:
A catalog ID that means an Official Model under a different name (`gpt-5.6` → `gpt-5.6-sol`).
_Avoid_: rename, synonym

### Pricing

**Cost Multiplier**:
The factor a relay's price differs from official price, applied to every cost field and tier. Relay-wide, or per model ID.
_Avoid_: discount, rate, markup

**Priority Surcharge**:
The premium the vendor charges for priority-tier service, applied locally when the relay's own usage numbers don't already include it.
_Avoid_: fast multiplier, priority multiplier

### Runtime behavior

**Fast Mode**:
A session-scoped toggle that asks for priority-tier service by injecting `service_tier: "priority"` into the request. Only meaningful for `openai-responses` relays.
_Avoid_: priority mode, turbo

**Fast Mode Policy**:
Per-relay setting for whether Fast Mode is offered at all, and whether the relay's reported cost already includes the Priority Surcharge (`response`) or the surcharge must be applied locally (`request`).
_Avoid_: fast policy, pricing trust

**Catalog Store**:
The provider-scoped persistence Pi hands to the extension, holding the last fetched Catalog and when it was checked. Stored at official prices, never at relay prices.
_Avoid_: cache file, models store

**Catalog Freshness**:
Whether a stored Catalog is younger than the 7-day TTL. A fresh Catalog suppresses network fetches unless forced.
_Avoid_: staleness, expiry

**Catalog Fingerprint**:
The Provider ID, Relay API, and base URL recorded next to each stored model. A mismatch invalidates the whole stored Catalog.
_Avoid_: signature, validation, checksum

**Pre-Scope Discovery**:
One opportunistic network fetch during Pi's offline initialization pass, so relay models exist before Pi resolves model scope and `--continue` can select one.
_Avoid_: bootstrap, eager refresh, warmup

**Forced Catalog Refresh**:
One user-requested, provider-targeted network refresh that bypasses Catalog Freshness for configured relays. `/refresh-custom-models` delegates force, generation, cancellation, and provider errors to Pi's native model refresh contract because Pi's host refresh command does not load extension providers.
_Avoid_: cache clear, cache reset, reload
