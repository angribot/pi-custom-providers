# Priority Surcharge is a published multiplier table

Under Fast Mode Policy `request`, cost is recomputed from the registry model and multiplied: `2.5` for `gpt-5.5`, `2` otherwise.

These are the vendor's published priority-tier premiums, derived from [OpenAI's Priority Processing
pricing](https://openai.com/api-priority-processing/) against the standard rates on the [API pricing
page](https://developers.openai.com/api/docs/pricing). Verified 2026-07:

| Model | Standard in/out | Priority in/out | Multiplier |
|---|---|---|---|
| `gpt-5.5` | $5 / $30 | $12.50 / $75 | **2.5** |
| `gpt-5.6-sol` | $5 / $30 | $10 / $60 | 2 |
| `gpt-5.6-terra` | $2.50 / $15 | $5 / $30 | 2 |
| `gpt-5.6-luna` | $1 / $6 | $2 / $12 | 2 |
| `gpt-5.4` | $2.50 / $15 | $5 / $30 | 2 |
| `gpt-5.4-mini` | $0.75 / $4.50 | $1.50 / $9 | 2 |
| `gpt-5.2` | $1.75 / $14 | $3.50 / $28 | 2 |
| `gpt-5.1` | $1.25 / $10 | $2.50 / $20 | 2 |

Cached input scales by the same factor throughout, so one multiplier per model covers every cost field.

They are not derivable from `pi-ai`'s `cost.tiers`, which describes input-volume brackets on the standard tier and says nothing about service tiers — reading a surcharge out of them would be a coincidence, not a calculation.

Recomputation starts from `calculateCost` against the registry model rather than scaling the relay's reported cost, because a `request`-policy relay reports standard-tier numbers; scaling those would compound the relay's own Cost Multiplier into the surcharge.

The table is the calibration knob here: vendors reprice priority tiers independently of base rates, so this is expected to need editing, and it is the one place where being wrong overstates or understates real money.

Recomputation is armed per request, not per session: injecting `service_tier` records the provider and model it was injected for, and the usage hook consumes that record once and clears it. A response that arrives without a matching injection is priced normally. This is what keeps the surcharge attached to the requests that actually asked for priority, rather than to every request made while Fast Mode happened to be on.

The `2` fallback is correct for the whole GPT-5 family, which is the range a relay realistically serves
over `openai-responses`. It overstates older models, whose premiums predate that flat ratio: GPT-4.1 is
1.75×, GPT-4o 1.7×, o4-mini 1.82×. They are left uncorrected deliberately — a relay exposing 4o under
fast mode is close to hypothetical, and overstating a cost is the safer direction to be wrong in.

One further gap: the lookup keys on the model ID the relay reported, not on the Official Model an Alias
resolves to (0003). Today that is harmless, because `gpt-5.6` resolves to `gpt-5.6-sol` and both take
`2`. An alias pointing at `gpt-5.5` would take `2` instead of `2.5`.

Consequence: a model added to the priority tier at a different premium is billed at `2` until the table learns about it.
