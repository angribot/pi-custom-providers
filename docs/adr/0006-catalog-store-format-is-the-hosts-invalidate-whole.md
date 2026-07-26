# Catalog Store format is the host's; a fingerprint mismatch invalidates the whole file

The Catalog Store is Pi's `models-store.json`, shared with the host's own providers. Its shape is therefore not ours to choose: each stored model is a full model definition (name, input modes, cost, context window, max tokens) plus the Catalog Fingerprint — Provider ID, Relay API, base URL.

This is why stored entries carry metadata the read path never consumes. Projection (0002) rebuilds every field from the Official Model on each read, so only `id` and the Fingerprint are actually load-bearing. The redundancy is the price of writing a format the host defines.

If any stored model's Fingerprint disagrees with the current config, the entire stored Catalog is deleted rather than filtered. A relay that changed base URL or Relay API is a different endpoint; keeping the entries that happen to still match would serve models from a mixture of two configurations, which is harder to diagnose than an empty Catalog and one refresh.

The same whole-file delete covers every unusable shape, not just a Fingerprint disagreement: a missing or non-array `models`, an empty array, an entry without a usable string `id`. All of them mean the same thing operationally — there is nothing here we can trust — and giving each its own recovery path would be three ways to be half-cached. Base URLs are compared with trailing slashes normalized away, so `https://r.example/v1` and `https://r.example/v1/` are one endpoint rather than a cache-busting pair.

Consequence: editing a relay's `baseUrl` discards its cache and forces a refetch. Intended — that edit means the old Catalog was about something else.
