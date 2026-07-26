# Catalog fetch takes IDs only and is bounded

Catalog discovery reads `/models` (`/v1/models` for `anthropic-messages`) with the relay's own auth header shape, and keeps nothing but the `id` of each entry. A response that isn't `{ data: [...] }`, or that yields zero usable IDs, is an error rather than an empty Catalog. Every request carries a 5s timeout, combined with the host's abort signal.

The timeout is not a generic hygiene default. This fetch sits in front of Pre-Scope Discovery (0008), which runs inside Pi's initialization pass — an unreachable or slow relay would otherwise translate directly into startup delay for a user who never asked to talk to it. 5s is long enough for a cold relay and short enough to be tolerable once per process.

Per-relay wire details live in this one place: `anthropic-messages` fetches `/v1/models` with `x-api-key` and the pinned `anthropic-version: 2023-06-01`, everything else fetches `/models` with a bearer token. The version header is pinned rather than tracked, because the response we read is a list of IDs — the narrowest possible surface for a breaking change.

Within a response, an entry that has no usable string `id` is dropped and the rest are kept; the request only fails if nothing survives. A relay adding a malformed entry should not cost the user every other model it serves.

Treating an empty catalog as an error is what keeps a stored Catalog recoverable: refresh failures leave the previous Catalog in place instead of overwriting it with nothing.

Consequence: a relay that legitimately exposes no models can never be registered. Accepted; that relay is useless to Pi anyway.
