# Priority Surcharge is a published multiplier table

Under Fast Mode Policy `request`, cost is recomputed from the registry model and multiplied: `2.5` for `gpt-5.5`, `2` otherwise.

These are the vendor's published priority-tier premiums. They are not derivable from `pi-ai`'s `cost.tiers`, which describes input-volume brackets on the standard tier and says nothing about service tiers — reading a surcharge out of them would be a coincidence, not a calculation.

Recomputation starts from `calculateCost` against the registry model rather than scaling the relay's reported cost, because a `request`-policy relay reports standard-tier numbers; scaling those would compound the relay's own Cost Multiplier into the surcharge.

The table is the calibration knob here: vendors reprice priority tiers independently of base rates, so this is expected to need editing, and it is the one place where being wrong overstates or understates real money.

Consequence: a model added to the priority tier at a different premium is billed at `2` until the table learns about it.
