# Store catalogs at official prices, apply relay pricing on read

The Catalog Store holds each model projected with multiplier `1`; Cost Multipliers are applied when models are handed to Pi, not when they're written.

On read, the multiplier is resolved most-specific-first: `modelCostMultipliers[id]`, then the relay's `costMultiplier`, then `1`. Per-model presence is tested with `Object.hasOwn`, not by truthiness or a plain lookup — an inherited `toString` must not be mistaken for a configured price, and a legitimate `0` must not fall through to the relay default.

This keeps a config edit (change `costMultiplier`) effective immediately without invalidating a 7-day cache, and keeps the stored file readable as "what the relay exposes" rather than "what it cost last week". The cost is that the same projection runs on every read and stored costs never match what Pi displays — a deliberate mismatch, not a bug.
