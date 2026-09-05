# Priority injection scope, and why the payload guard rejects class instances

Injection of `service_tier: "priority"` covers `openai-responses` and Pi's built-in `openai-codex` provider using `openai-codex-responses`, with Fast Mode Policy not being `disabled`. Anything else passes through untouched. This expands the original Responses-only scope: Codex OAuth also uses the priority request tier, without requiring Codex relay registration.

For built-in Codex, the extension adds no Priority Surcharge and leaves host cost estimates untouched. Those estimates are not subscription quota accounting. The toggle requests priority; it does not check account eligibility or guarantee the server grants it.

The payload is shallow-copied rather than mutated. The host owns that object and may still read it after the hook returns; mutating in place would make an unrelated retry inherit a tier the user has since toggled off.

The guard accepts plain objects and null-prototype objects, and rejects class instances — a `Date`, a `URL`, anything with its own prototype. The returned object goes back to the host and ends up serialized as the request body; spreading a class instance drops its accessors and methods, producing a body that silently isn't what the host built. Refusing to touch it is the honest outcome.

Fast Mode Policy `response` (the default when a relay declares nothing) means the relay's own usage numbers already include the Priority Surcharge, so pricing is left entirely to Pi's normal path. Only `request` triggers local recomputation.

Consequence: a relay that speaks `openai-responses` but doesn't honour `service_tier` will accept the field and change nothing. Not detectable from here.
