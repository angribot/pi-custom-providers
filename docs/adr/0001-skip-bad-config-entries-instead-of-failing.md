# Skip bad config entries instead of failing

All relays are declared in one `custom-providers.json` under the agent directory. Nothing in that file is required: a missing file returns silently, an unparseable file logs once and registers nothing, and a single malformed relay is warned about and skipped while its siblings still register.

An extension that throws during registration takes Pi's startup with it, so a typo in one relay's `baseUrl` would cost the user their whole session rather than one provider. Validation therefore rejects at the narrowest scope that still leaves a coherent result — per relay where the damage is local, per file only when the root isn't an object.

Two things are dropped more quietly still, one level below a relay. `$schema` is skipped by name, so the editor hint the Config File is meant to carry never registers as a relay. And a malformed `costMultiplier` or a non-numeric entry in `modelCostMultipliers` drops just that value and keeps the relay: pricing is a calibration knob, and losing the relay because one multiplier was a string would be a worse trade than pricing it at 1.

Consequence: a mistyped key is invisible unless the user reads stderr. Accepted; the JSON Schema is the place a typo should surface, not a crash.
