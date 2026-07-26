# Fetch one catalog during Pi's offline init pass

Pi resolves model scope (`enabledModels`, `--model`, `--continue`) during an initialization pass where `refreshModels` is called with `allowNetwork: false`. A relay with no stored Catalog therefore has zero models at the moment scope is resolved, so a session pinned to a relay model fails to restore.

We deliberately ignore `allowNetwork: false` for exactly one attempt: if a credential exists, `PI_OFFLINE` is unset, and nothing is stored yet, we fetch anyway and share that single in-flight promise with any concurrent cache-only call. This violates the host's cache-only contract, so it is bounded — one attempt per process, skipped entirely once a Catalog is stored.

Three conditions gate the attempt, and the shape of each is a decision. `PI_OFFLINE` is tested for presence, not truthiness, so `PI_OFFLINE=""` still counts as set and still suppresses discovery — anyone who exported that variable at all meant to be offline. An already-aborted signal suppresses it too. And the in-flight promise is shared only among cache-only callers, then cleared once it settles, so discovery is one fetch per init rather than one per relay lookup, and a later refresh is never served a stale result.

Concurrent forced refreshes are deliberately *not* deduplicated: two `force: true` calls issue two fetches. Force means the caller believes the cache is wrong, and handing the second caller the first one's in-flight answer would defeat exactly the thing it asked for.

Because the attempt is opportunistic, its failure is not the caller's problem: a cache-only call that triggered discovery must still return the cached Catalog rather than propagate the fetch error. The host asked for cache, and answering with a rejection makes an unreachable relay look like a broken extension during init.

Alternative rejected: require users to warm the cache with an explicit refresh before relay models are selectable. Correct per the contract, but it makes first run and `--continue` fail in a way users read as a broken extension.
