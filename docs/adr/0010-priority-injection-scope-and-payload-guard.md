# Priority injection scope, and why the payload guard rejects class instances

`service_tier: "priority"` is only meaningful on `openai-responses`, so injection is gated on the selected model's API and on the relay's Fast Mode Policy not being `disabled`. Anything else passes through untouched.

The payload is shallow-copied rather than mutated. The host owns that object and may still read it after the hook returns; mutating in place would make an unrelated retry inherit a tier the user has since toggled off.

The guard accepts plain objects and null-prototype objects, and rejects class instances — a `Date`, a `URL`, anything with its own prototype. The returned object goes back to the host and ends up serialized as the request body; spreading a class instance drops its accessors and methods, producing a body that silently isn't what the host built. Refusing to touch it is the honest outcome.

Fast Mode Policy `response` (the default when a relay declares nothing) means the relay's own usage numbers already include the Priority Surcharge, so pricing is left entirely to Pi's normal path. Only `request` triggers local recomputation.

Consequence: a relay that speaks `openai-responses` but doesn't honour `service_tier` will accept the field and change nothing. Not detectable from here.
