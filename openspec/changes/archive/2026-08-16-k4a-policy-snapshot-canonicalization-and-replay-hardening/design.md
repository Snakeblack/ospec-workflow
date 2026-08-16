# Technical Design: K4a PolicySnapshot Canonicalization, Replay Fixture Hardening, and Documentation Reconciliation

## Architectural Decisions

1. **PolicySnapshot Canonical Binding & Strict Digesting**:
   - `schemas/kernel/policy-snapshot/v1.schema.json` strictly specifies `pattern: "^sha256:[a-f0-9]{64}$"` on `snapshot_id` and `policy_bundle_digest`, and `minLength: 1` on `compiler_version`, `classifier_version`, and `runtime_version`.
   - `scripts/lib/kernel-schema-validator.js` evaluates `minLength` and `pattern` keywords natively.
   - `computePolicySnapshotDigest(snapshot)` is a pure mathematical digest over canonical fields, throwing fail-closed without hiding behind `|| "1.0.0"` defaults.
   - `createPolicySnapshot(params)` handles defaults before schema validation.

2. **Replay Fixture Result Contract Hardening**:
   - Completed fixtures must have a defined, non-null, plain object `evidence` property satisfying all `node.required_evidence` keys.
   - Fixtures with `exit_code !== 0` claiming `status: "completed"` are rejected as contradictory fail-closed.
   - Missing evidence or contradictions fail the node and produce reproducible counterexample traces.

3. **Roadmap and Architecture Evolution Alignment**:
   - `docs/roadmaps/harness-evolution.md` updated to mark K4a as `done`, K5 as `next-eligible`, and WorkOrder done criteria to `v2`.
   - `docs/architecture/harness-evolution.md` updated with verified status and next-eligible K5.
