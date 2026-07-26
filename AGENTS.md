# Agent Instructions

## Agent skills

### Issue tracker

Issues tracked in GitHub Issues for `angribot/pi-custom-providers` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary, label strings unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.

## Upgrading the pi baseline

The two `@earendil-works/pi-*` entries in `devDependencies` are the baseline,
and the only place it is written down. They pin which type definitions `tsc`
and the tests resolve.

1. Bump both together: `npm i -D @earendil-works/pi-ai@^<new> @earendil-works/pi-coding-agent@^<new>`.
2. Run `npm run typecheck` — it reports what the new host API changed.
3. Run `npm test` — the `[host integration]` tests exercise the real `pi` on PATH.

Judge compatibility from step 3, not from comparing version strings. A host
version different from the baseline is not by itself an incompatibility.

## Never

- Pin `peerDependencies` — pi injects the host copies and installs extensions with peer resolution disabled.
- Bump one `pi-*` dev entry alone — `tsc` then checks stale types while the tests run the new host, and a removed API passes both.
- Commit `package-lock.json` — it is git-ignored and nothing consumes it.
