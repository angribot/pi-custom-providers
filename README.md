# pi-custom-providers

Register OpenAI- and Anthropic-compatible relays as [pi](https://github.com/badlogic/pi-mono) providers,
with official model metadata and per-relay pricing.

A relay speaks a familiar api but serves its own model list under its own names, often with its own
prices. This extension reads one config file, registers each relay as a real pi provider, and fills in
capability and cost metadata from pi's official catalog so `/model` and cost accounting stay meaningful.

## Install

```
pi install git:github.com/angribot/pi-custom-providers
```

Or clone into `~/.pi/agent/extensions/pi-custom-providers/`.

## Configure

Create `~/.pi/agent/custom-providers.json`. Each top-level key is a provider name:

```json
{
  "$schema": "./git/github.com/angribot/pi-custom-providers/custom-providers.schema.json",
  "my-relay": {
    "baseUrl": "https://relay.example.com/v1",
    "api": "openai-responses",
    "costMultiplier": 0.5,
    "fastModePolicy": "request",
    "modelCostMultipliers": { "gpt-5.1-codex": 0.25 }
  },
  "my-claude-relay": {
    "baseUrl": "https://claude.example.com",
    "api": "anthropic-messages"
  }
}
```

| Field | Required | Meaning |
|---|---|---|
| `baseUrl` | yes | Relay endpoint. Trailing slashes are trimmed. |
| `api` | yes | `openai-responses`, `openai-completions`, or `anthropic-messages`. |
| `costMultiplier` | no | Scales all four cost fields for this relay. Default `1`. |
| `modelCostMultipliers` | no | Per-model override keyed by exact model ID. Beats `costMultiplier`. |
| `fastModePolicy` | no | `response` (default), `request`, or `disabled`. `openai-responses` only. |

`$schema` is optional and only drives editor completion. The path above is relative to `~/.pi/agent/`
and matches a `pi install git:` checkout; a manual clone into `extensions/` uses
`./extensions/pi-custom-providers/custom-providers.schema.json` instead.

No `apiKey` field. The extension does not set one, so credentials resolve through pi's own mechanisms:
`/login <provider>` or the matching environment variable.

An invalid provider entry is skipped with a warning and the rest of the file still loads. An unparseable
file logs an error and registers nothing.

## Model metadata

The relay is asked for its model list. Each returned ID is matched against pi's official catalog to
recover context window, capabilities, and base pricing; unmatched IDs fall back to conservative defaults.
Prices are then scaled by the multipliers above.

Metadata is cached in pi's model store. A cached entry is discarded whenever it is unusable, not only on
a fingerprint mismatch. Catalogs stay fresh for seven days. Run `/refresh-custom-models` inside pi to
request an immediate refresh for every configured relay; a failed request keeps the stored Catalog
available.

## Fast mode

For `openai-responses` relays, fast mode is exposed as a session toggle. The policy says who applies the
priority surcharge:

- `response` (default) — the relay's reported cost already includes it. Nothing is added locally.
- `request` — the relay bills the surcharge but does not report it. It is applied locally per request.
- `disabled` — no toggle is offered.

## Not covered

- No `apiKey` or custom headers in config. Use pi's credential resolution.
- Concurrent forced refreshes are not deduplicated; both fetches run.
- Cost multipliers apply to metadata only. They do not change what the relay charges you.
- The `request` surcharge table covers the GPT-5 family. Pre-GPT-5 models fall back to `2×`, which
  overstates their real premium (GPT-4.1 is 1.75×, GPT-4o 1.7×).

## Development

```
npm install
npm run typecheck
npm test
```

Design decisions live in `docs/adr/`; the domain model is in `CONTEXT.md`.

## License

MIT
