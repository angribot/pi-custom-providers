# Catalog fetch takes IDs only and is bounded

Catalog discovery reads `/models` (`/v1/models` for `anthropic-messages`) with the relay's own auth header shape, and keeps nothing but the `id` of each entry. A response that isn't `{ data: [...] }`, or that yields zero usable IDs, is an error rather than an empty Catalog. Every request carries a 5s timeout, combined with the host's abort signal.

The timeout is not a generic hygiene default. This fetch sits in front of Pre-Scope Discovery (0008), which runs inside Pi's initialization pass — an unreachable or slow relay would otherwise translate directly into startup delay for a user who never asked to talk to it. 5s is long enough for a cold relay and short enough to be tolerable once per process.

Treating an empty catalog as an error is what keeps a stored Catalog recoverable: refresh failures leave the previous Catalog in place instead of overwriting it with nothing.

Consequence: a relay that legitimately exposes no models can never be registered. Accepted; that relay is useless to Pi anyway.
