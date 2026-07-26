# Project official metadata onto relay catalogs

Relay `/models` endpoints return IDs and nothing usable — no context window, no cost, no reasoning flag — so a relay model built from the response alone is unusable for budgeting and context management. We therefore treat the Catalog as a list of IDs only, and take every other field from the `pi-ai` Official Model with the exact same ID, falling back to conservative defaults (128k context, 4k output, zero cost) for IDs we don't recognize.

One field is not projected unconditionally: `compat` is copied only when the Official Model's own API matches the relay's Relay API. Compat quirks describe a wire protocol, so carrying OpenAI's compat block onto a model reached over `anthropic-messages` would describe a request shape that is never sent. Mutable sub-objects (`input`, `compat`, `thinkingLevelMap`) are cloned rather than shared, because the `pi-ai` registry entry is process-wide and a relay's Projection must not edit it.

Consequence: relay models are only as good as `pi-ai`'s builtin catalog, and a `pi-ai` bump can silently change a relay model's advertised limits. Accepted, because the alternative is hand-maintaining per-relay metadata that drifts from the vendor anyway.
