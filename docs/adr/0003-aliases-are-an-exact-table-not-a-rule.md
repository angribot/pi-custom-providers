# Aliases are an exact table, not a rule

An Alias maps one catalog ID to one Official Model ID (`gpt-5.6` → `gpt-5.6-sol`). The lookup is exact equality against a fixed table; there is no prefix match, no suffix stripping, no fuzzy resolution.

The entry is the vendor's own routing, not a guess: OpenAI documents that "the `gpt-5.6` alias routes
requests to GPT-5.6 Sol" ([model guidance](https://developers.openai.com/api/docs/guides/latest-model),
[GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)). A relay passing `gpt-5.6`
upstream gets Sol, so Sol's metadata is what the model actually has.

A relay that exposes `gpt-5.6-custom-suffix` is a different model at a different price, and prefix matching would silently hand it another model's context window and cost. Getting no metadata (conservative defaults: 128k context, 4k output, zero cost) is recoverable; getting confidently wrong metadata is not — it misbudgets every request against that model.

An Alias resolves metadata, not pricing. A cost multiplier is looked up under the ID the user typed in their config and sees in the model picker — `gpt-5.6` — never under the resolved target. The alias table is an implementation detail of where metadata comes from, and making users price a model under a name they never wrote would leak it.

Consequence: each new alias is a code change, and relays that rename models get defaults until someone adds the entry. Accepted while the table is short. If it outgrows that, it belongs in the relay's own config block, not in a matching heuristic.
