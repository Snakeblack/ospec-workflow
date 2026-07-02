# Proposal: Assumption Ledger + Materiality Criterion

## Intent

Phase agents today resolve non-blocking ambiguities (naming, defaults, validation order, error messages, thresholds) with "reasonable judgment" and leave no trace. `sdd-clarify` and `question_gate` only capture *material, blocking* ambiguities; the silent micro-decisions — exactly what a senior notes and confirms later — are invisible and unauditable. This change makes every such decision explicit, persisted, and reviewable, turning "the AI probably decided nothing important" (hope) into "everything it decided is listed and audited" (guarantee). Roadmap item A1, Horizonte 1.

## Scope

### In Scope
- Extend the phase Return Envelope (§D of `sdd-phase-common.md`) with `assumptions[]`: each entry `{ id, phase, statement, reversibility: low|high, basis }`.
- Add a **materiality rule** to the executor shared protocol: decision affecting observable behavior / public contract and not in spec/design → do NOT assume, return `status: blocked` + `question_gate`; internal + reversible → assume and record in `assumptions[]`.
- Orchestrator persists returned assumptions into `state.yaml` under an `assumptions:` ledger, mirroring the existing `approvals:` shape.
- `sdd-verify` re-presents accumulated assumptions as a checklist (confirm / correct / promote-to-clarification); unresolved material assumptions become WARNING findings.
- Regenerate all four targets (claude, vscode, github-copilot, opencode) from canonical sources.

### Out of Scope
- Recommendation-contract enrichment (A2), earlier/later ambiguity detection (A3), mentor mode (A4), ADR wiring (A5).
- Any runtime hook / Go binary change; this is prompt/contract markdown only.
- Auto-promotion of assumptions into spec deltas (verify only flags; promotion stays human-decided).

## Capabilities

### New Capabilities
- `assumption-ledger`: the cross-cutting contract — the `assumptions[]` field schema, the materiality decision rule, the `state.yaml` ledger persistence shape, and the verify-phase checklist reconciliation.

### Modified Capabilities
- `agents`: the Result Envelope Contract (§6.1) gains the optional `assumptions[]` field; the orchestrator gains an Assumption Ledger Protocol alongside the Approval Ledger; `sdd-verify` gains assumption-checklist re-presentation.

## Approach

Author the behavior once in the shared executor protocol (`skills/_shared/sdd-phase-common.md`) so every phase inherits the field and materiality rule with a single edit. Add an Assumption Ledger Protocol block to `agents/sdd-orchestrator.agent.md` (and its skill mirror) modeled on the Approval Ledger. Extend `agents/sdd-verify.agent.md` (and `skills/sdd-verify/SKILL.md`) with the reconciliation checklist. Keep per-phase-agent edits to a reference-only pointer to the shared rule to avoid duplication. Run the generator to flow all canonical changes into `dist/`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `skills/_shared/sdd-phase-common.md` | Modified | `assumptions[]` in §D envelope; materiality rule in executor boundary |
| `agents/sdd-orchestrator.agent.md` | Modified | Assumption Ledger Protocol → `state.yaml assumptions:` |
| `skills/sdd-orchestrator/SKILL.md` | Modified | Mirror of orchestrator change (claude target source) |
| `agents/sdd-verify.agent.md` | Modified | Assumption checklist; unresolved material → WARNING |
| `skills/sdd-verify/SKILL.md` | Modified | Mirror of verify change |
| `openspec/changes/{c}/state.yaml` (runtime) | New shape | `assumptions:` ledger persisted per change |
| `dist/**` | Regenerated | Generator output for all four targets |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Prompt bloat inflates per-phase token cost | Med | Single shared-protocol edit; pointer-only per-agent references; keep entries compact |
| Materiality rule ambiguous → over-blocking or under-recording | Med | Concrete observable-behavior/public-contract test in the rule text; verify WARNING catches under-recording |
| Multi-target drift if `dist/` not regenerated | Med | Regeneration is an explicit task; parity tests assert self-generated output |
| Assumption checklist unwieldy when many accumulate | Low | Verify groups by reversibility; only material/unresolved escalate |

## Rollback Plan

Revert the markdown edits to the four canonical contract files (`sdd-phase-common.md`, `sdd-orchestrator.agent.md`, `sdd-verify.agent.md`, and the two skill mirrors) and re-run the generator to restore `dist/`. The `assumptions:` block in `state.yaml` is purely additive: older prompts ignore an unknown top-level key, so residual ledgers on in-flight changes are inert and need no data migration.

## Dependencies

- None external. Requires the generator (`scripts/`) to be runnable to refresh `dist/` targets.

## Success Criteria

- [ ] `sdd-phase-common.md` §D documents `assumptions[]` with all five fields and the materiality rule.
- [ ] Orchestrator persists returned assumptions into `state.yaml assumptions:` mirroring `approvals:`.
- [ ] `sdd-verify` re-presents assumptions as a checklist; unresolved material assumptions surface as WARNING findings.
- [ ] New `assumption-ledger` spec and `agents` delta are consistent; no contradiction with the Result Envelope Contract.
- [ ] All four dist targets regenerated; parity/self-generation tests pass.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention from the `branch-pr` skill (e.g. `git checkout -b feat/add-assumption-ledger main`).
