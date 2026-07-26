# Aliases are an exact table, not a rule

An Alias maps one catalog ID to one Official Model ID (`gpt-5.6` → `gpt-5.6-sol`). The lookup is exact equality against a fixed table; there is no prefix match, no suffix stripping, no fuzzy resolution.

A relay that exposes `gpt-5.6-custom-suffix` is a different model at a different price, and prefix matching would silently hand it another model's context window and cost. Getting no metadata (conservative defaults: 128k context, 4k output, zero cost) is recoverable; getting confidently wrong metadata is not — it misbudgets every request against that model.

Consequence: each new alias is a code change, and relays that rename models get defaults until someone adds the entry. Accepted while the table is short. If it outgrows that, it belongs in the relay's own config block, not in a matching heuristic.
