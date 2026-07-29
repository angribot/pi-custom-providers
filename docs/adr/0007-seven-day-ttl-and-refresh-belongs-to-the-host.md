# 7-day TTL, and forcing a refresh belongs to the host

Superseded in part by ADR 0013: the TTL remains, but the extension now bridges the host's missing force surface.

A stored Catalog younger than 7 days suppresses network fetches. Relay catalogs change on the order of weeks, and every fetch is latency the user pays at startup, so the TTL is deliberately long.

The extension registers no refresh command. `force` arrives from the host, which already owns the model-refresh surface; a second entry point would mean two ways to invalidate the same file with no shared notion of which one the user meant.

Freshness is a window with two closed ends: a `checkedAt` in the future counts as stale, not fresh. A clock that jumped, or a file copied from another machine, otherwise buys itself an unbounded cache.

Deleting the store file is the escape hatch when a relay changes its catalog mid-window.

Consequence: a relay that adds a model can take up to a week to show it. Accepted at this TTL. Shortening it trades startup latency for freshness, and is a knob worth turning if relays start moving faster.
