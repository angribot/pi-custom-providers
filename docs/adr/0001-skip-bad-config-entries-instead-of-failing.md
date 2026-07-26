# Skip bad config entries instead of failing

All relays are declared in one `custom-providers.json` under the agent directory. Nothing in that file is required: a missing file returns silently, an unparseable file logs once and registers nothing, and a single malformed relay is warned about and skipped while its siblings still register.

An extension that throws during registration takes Pi's startup with it, so a typo in one relay's `baseUrl` would cost the user their whole session rather than one provider. Validation therefore rejects at the narrowest scope that still leaves a coherent result — per relay where the damage is local, per file only when the root isn't an object.

Consequence: a mistyped key is invisible unless the user reads stderr. Accepted; the JSON Schema is the place a typo should surface, not a crash.
