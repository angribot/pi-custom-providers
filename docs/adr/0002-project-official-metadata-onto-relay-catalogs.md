# Project official metadata onto relay catalogs

Relay `/models` endpoints return IDs and nothing usable — no context window, no cost, no reasoning flag — so a relay model built from the response alone is unusable for budgeting and context management. We therefore treat the Catalog as a list of IDs only, and take every other field from the `pi-ai` Official Model with the exact same ID, falling back to conservative defaults (128k context, 4k output, zero cost) for IDs we don't recognize.

Consequence: relay models are only as good as `pi-ai`'s builtin catalog, and a `pi-ai` bump can silently change a relay model's advertised limits. Accepted, because the alternative is hand-maintaining per-relay metadata that drifts from the vendor anyway.
