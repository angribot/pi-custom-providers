# Store catalogs at official prices, apply relay pricing on read

The Catalog Store holds each model projected with multiplier `1`; Cost Multipliers are applied when models are handed to Pi, not when they're written.

This keeps a config edit (change `costMultiplier`) effective immediately without invalidating a 7-day cache, and keeps the stored file readable as "what the relay exposes" rather than "what it cost last week". The cost is that the same projection runs on every read and stored costs never match what Pi displays — a deliberate mismatch, not a bug.
