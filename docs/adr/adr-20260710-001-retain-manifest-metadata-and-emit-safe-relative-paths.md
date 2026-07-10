# ADR-20260710-001: Retain manifest metadata and emit `./`-relative component paths

- Status: accepted
- Change: codex-target-phase-2
- Date: 2026-07-10
- Archive Date: 2026-07-10

## Context
Codex 0.144.1 silently ignores `skills`/`mcpServers`/`hooks` whose paths are not
`./`-relative, and requires `name`/`version`/`description` metadata in the bundle
`plugin.json`. The current codex profile allowlist drops metadata and keeps bare paths.

## Decision
Extend `profile.manifest.keepFields` to include `name`, `version`, `description`, and add
a codex `reshapeManifest` post-step that rewrites the `skills`/`mcpServers`/`hooks` string
values to a `./`-relative form. Extend `validate-codex.js` `ALLOWED_BUNDLE_KEYS` to admit
the three metadata keys, and add a validator check rejecting any component path that is
not `./`-relative or contains a `..` traversal segment.

## Alternatives
- Leave bare paths — rejected: Codex drops the components at task start (field report §2).
- Hand-synthesize a codex-only plugin.json — rejected: duplicates and drifts from source.

## Consequences
Manifest becomes host-loadable; validator now gates path safety on the published payload.
Reversible: revert `keepFields` and the prefix step. Public contract change to the emitted
`plugin.json` shape and the validator schema.

## Implementation Details
- File: `scripts/lib/target-profiles/codex.js` — `keepFields` += `name`/`version`/`description`
- File: `scripts/lib/target-transform.js` — `reshapeManifest` keepFields branch + `toSafeRelativePath()`
- File: `scripts/configure/validate-codex.js` — `ALLOWED_BUNDLE_KEYS` extension + `isSafeRelativePath()` check
- Tests: `scripts/lib/target-transform.test.js`, `scripts/configure/validate-codex.test.js`

## Resolved By Specs
- REQ-generator-004: Codex Published Payload Path and Metadata Safety
- REQ-generator-001 (modified): Agent Files May Emit TOML For Codex-Style Profiles
