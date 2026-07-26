# The JSON Schema is a closed contract, not documentation

`custom-providers.schema.json` is the enforcing edge of the Config File, not a description of it. Three choices make it that:

`additionalProperties: false` on a relay. An unknown key is a typo, and a typo is the failure mode this schema exists to catch — 0001 deliberately makes the loader silent about them, so the schema has to be loud. Closing the object is what turns `basUrl` from a relay priced at defaults into a red squiggle in the editor.

`baseUrl` and `api` required, everything else optional. Those two are the Catalog Fingerprint minus the Provider ID (0006); a relay without them isn't underspecified, it's not a relay.

`fastModePolicy` permitted only when `api` is `openai-responses`, via `if`/`then`. Fast Mode injects `service_tier` into a Responses-API payload and nothing else (0010), so the field is meaningless anywhere else. The loader drops it silently in that case; the schema is where the user finds out. Enums are closed for the same reason — a misspelled `requst` should be rejected, not read as the `response` default.

Consequence: adding a Relay API means editing the union, the loader's accepted list, and this enum. Three places, deliberately — the schema is a separate artifact shipped to the user's editor, and generating it from the types would trade an editor-visible contract for build machinery.
