# ADR-005: Treat models.yaml as the canonical model-tier policy

- Status: accepted
- Change: strict-tdd-evidence-remediation-fast-path
- Date: 2026-07-25
- Updated: 2026-07-26

## Context

The approved SDD tier migration changes a public cross-target generation contract. Existing tests still encode prior assignments, and the minimal YAML parser can currently hide duplicate keys by overwriting them. An early implementation also mirrored the agent→tier partition in JavaScript (`SDD_AGENT_TIERS`), creating a second source of truth that rejected intentional YAML edits.

## Decision

Keep `models.yaml` as the **only** agent→tier policy source. The validator enforces structural invariants only: the complete 17-agent SDD roster, known tiers, review agents and `_default` on `default`, no unexpected `sdd-*` agents, duplicate-key rejection, and Codex premium/default/cheap pins to Sol/medium, Terra/medium, and Luna/low. Contract tests derive the live partition from `models.yaml` and verify generated model parity across targets; they must not re-pin which agent belongs to which cost tier in code.

## Alternatives

- Put agent tiers in target profiles: duplicates policy and mixes capability with cost selection.
- Require a model column on every target: invents unsupported GitHub Copilot configuration.
- Change only stale tests: would not detect incomplete or duplicate future mappings.
- Expand minimal goldens into the full roster: creates a second policy source.
- Hardcode the agent→tier partition in the validator: rejects intentional YAML policy changes and recreates dual sources of truth.

## Consequences

Editing `models.yaml` is enough to reassign an SDD agent to another known tier. Structural defects still fail closed. Codex model/effort pins remain product constraints independent of agent membership. Ignored `dist/**` is verified through temporary generation, not committed.
