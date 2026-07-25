# ADR-005: Treat models.yaml as the canonical model-tier policy

- Status: accepted
- Change: strict-tdd-evidence-remediation-fast-path
- Date: 2026-07-25

## Context

The approved SDD tier migration changes a public cross-target generation contract. Existing tests still encode prior assignments, and the minimal YAML parser can currently hide duplicate keys by overwriting them.

## Decision

Keep `models.yaml` as the generation source. Reject duplicate parser keys, validate the exact 17-agent SDD partition, preserve review agents and `_default`, and pin Codex premium/default/cheap to Sol/medium, Terra/medium, and Luna/low. Generate all five targets in temporary contract tests; targets or special outputs without a model field retain fail-soft omission.

## Alternatives

- Put agent tiers in target profiles: duplicates policy and mixes capability with cost selection.
- Require a model column on every target: invents unsupported GitHub Copilot configuration.
- Change only stale tests: would not detect incomplete or duplicate future mappings.
- Expand minimal goldens into the full roster: creates a second policy source.

## Consequences

Tier changes become intentional, reproducible, and mutation-tested across targets. Parser duplicate handling becomes fail-closed, while resolution of unavailable target columns remains fail-soft. Ignored `dist/**` is verified through temporary generation, not committed.
