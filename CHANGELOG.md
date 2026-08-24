# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-08-24

### Added

- Added Oxlint configuration and a `lint` script for TypeScript and JavaScript checks.
- Added trusted npm publishing with provenance attestations.

### Changed

- CI now runs Oxlint alongside type checking and tests.

## [0.3.0] - 2026-08-24

### Added

- Catalog HTTP failures now include bounded, credential-safe request diagnostics such as request IDs and retry information.
- Unknown relay model IDs now emit a bounded warning when conservative fallback metadata is used.

### Changed

- Consolidated relay configuration normalization.
- Added a CI workflow that verifies type checking and tests on pushes and pull requests.

## [0.2.0] - 2026-08-06

### Added

- Added `/refresh-custom-models` to force an immediate refresh of every configured relay catalog.

### Changed

- Migrated catalog refreshes to Pi 0.84's native provider-targeted refresh API.
- Forced refreshes now report completion, cancellation, and per-provider failures while preserving stored catalogs on failure.
- Overlapping refreshes now follow Pi's native generation and cancellation behavior.

## [0.1.0] - 2026-07-26

### Added

- Initial release.
- Added JSON Schema-backed configuration for OpenAI Responses, OpenAI Completions, and Anthropic Messages relays.
- Added relay registration as native Pi providers with Pi-managed credential resolution.
- Added official model metadata projection, exact model aliases, configurable relay and per-model cost multipliers, conservative fallbacks, and seven-day catalog caching.
- Added session-scoped fast mode with relay-controlled priority pricing policies.
- Added validation that skips invalid provider entries while allowing valid entries to load.

[Unreleased]: https://github.com/angribot/pi-custom-providers/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/angribot/pi-custom-providers/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/angribot/pi-custom-providers/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/angribot/pi-custom-providers/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/angribot/pi-custom-providers/releases/tag/v0.1.0
