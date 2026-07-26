# Proposal: Hybrid Transactional Archive Runtime

Roadmap: O6A (`docs/roadmaps/harness-evolution.md`) — Architecture: `docs/architecture/harness-evolution.md` §9.

## Intent

Archive closure is agent-executed prose. `sdd-archive` merges Markdown deltas and copies the change folder; the orchestrator performs an ad-hoc recursive diff before deleting the source (REQ-agents-008). Verification-before-delete exists only as instructions anchored by static string assertions in `scripts/archive-move-fingerprint-contract.test.js` — no machine-checkable plan, no input-hash validation, no staging, no journal, no receipt, no recovery. An interruption between copy and delete leaves a state only a human can reconcile. O6A applies principle 4 (the model produces semantics; the runtime applies structure).

## Scope

### In Scope

- `archive-plan.json` schema v1: the semantic/deterministic boundary contract, with input hashes and fail-closed validation codes.
- Deterministic transaction runtime: validate verdict, gates, approvals and `baseline_fingerprints`; validate plan schema, integrity and every referenced input by hash; write staging; copy the full inventory; byte/hash-compare origin ↔ staging ↔ destination; atomic commit/rename; delete origin **only** after a full match.
- Transaction journal enabling resume of an interrupted archive, plus rollback and a receipt (inventory + cost + outcome).
- `sdd-archive` converted to plan emission: interprets deltas, prepares resulting spec content, proposes ADRs, records accepted warnings; never deletes origin, never claims a completed move.
- Orchestrator Post-Return Move Completion delegated to the runtime instead of ad-hoc diffing.
- Strict-TDD coverage: unit tests plus filesystem fixtures for rollback, interrupted-transaction recovery and hash mismatch, on Windows and Linux.
- Doc sync (no behavior change): mark O4.2 done and O6A in progress in the roadmap; rebuild the six target distributions after prompt edits.

### Out of Scope

- Deterministic semantic parser for free Markdown — interpretation stays with the agent.
- Migrating remaining evidence artifacts to JSON.
- Headless CI archive.
- Changing the spec file format.
- Preflight documentation cleanup (four → five/six targets metadata) — independent change.
- Go mirror of the transaction runtime: `cmd/ospec-hooks` has no archive responsibility, so JS/Go parity is not applicable here and is recorded as such.

## Capabilities

### New Capabilities

- `archive-plan-contract`: schema v1 of `archive-plan.json` (`source_fingerprint`, `spec_writes` with `target_before_sha256`/`content_sha256`, `adr_promotions`, `archive_inventory`, `accepted_warnings`, `rollback.strategy`), plus deterministic validation and allowlisted rejection codes.
- `archive-transaction-runtime`: transaction lifecycle (preflight validation → staging → inventory → byte compare → atomic commit → delete-after-full-match), journal, rollback, interrupted-transaction recovery, and receipt emission.

### Modified Capabilities

- `agents`: REQ-agents-008 — orchestrator move completion becomes a runtime invocation with a receipt; the archive executor emits a plan and never self-certifies a completed move.
- `skills`: `sdd-archive` Copy-and-Report Contract becomes a Plan-and-Report contract; ADR promotion and the Cost block are expressed through the plan and the receipt.

## Approach

Two CommonJS modules under `scripts/lib/`: a pure `archive-plan.js` (parse + validate, no I/O, mirroring the `result-envelope.js` validator style) and `archive-transaction.js` (staged filesystem transaction reusing `atomic-write.js` rename semantics and its Windows `EPERM`/`EEXIST` fallback). The runtime is idempotent and journal-driven, so re-running after a failure either resumes or is a no-op. Agent-side changes stay prose-only: `sdd-archive` writes the plan, the orchestrator calls the runtime. Static contract-test anchors are updated in the same change so drift keeps failing `npm test`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/archive-plan.js` | New | Plan schema v1 parse/validate |
| `scripts/lib/archive-transaction.js` | New | Staging, compare, commit, rollback, recovery, receipt |
| `scripts/lib/atomic-write.js` | Modified | Reused/extended for directory-level atomic commit |
| `skills/sdd-archive/SKILL.md` | Modified | Copy-and-report → plan-and-report |
| `skills/_shared/gate-archive-quality.md` | Modified | Move completion delegated to the runtime |
| `agents/sdd-archive.agent.md`, `agents/sdd-orchestrator.agent.md` | Modified | Plan emission and runtime invocation contracts |
| `scripts/archive-move-fingerprint-contract.test.js` | Modified | Re-anchor contract strings |
| `docs/roadmaps/harness-evolution.md` | Modified | O4.2 done / O6A in progress |
| `dist/**` (six targets) | Regenerated | Distribution sync after prompt changes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Windows rename/lock semantics break atomic commit | High | Reuse proven `atomic-write.js` fallback; fixtures executed on both OSes |
| Plan/runtime contract drift with agent prose | Med | Schema validation is fail-closed plus static contract-test anchors |
| Change exceeds the 400-line review budget | High | `delivery_strategy: exception-ok`; `sdd-tasks` slices plan-contract, runtime, and agent-prose work |
| Partial migration leaves two archive paths active | Med | Single authority: the orchestrator only closes archive through a runtime receipt |
| Recovery re-run corrupts an already-committed archive | Low | Journal + hash identity make the runtime idempotent; the archive audit trail is never rewritten |

## Rollback Plan

Revert the branch: the new `scripts/lib/` modules are additive and the prose edits return to the current copy-and-report contract with the orchestrator-owned recursive diff. No data migration and no spec-format change occur, so no archived change needs repair. For a mid-transaction failure in real use, the journal plus staging directory restore the pre-transaction state with the origin intact; manual recovery is deleting the staging directory only.

## Dependencies

- O4.2 (Strict TDD evidence remediation fast path) — delivered and archived.
- Existing gates: verify verdict, `gates.quality-gates`, `gates.4r-review-gate`, `baseline_fingerprints`.

## Success Criteria

- [ ] A failure before commit leaves the origin change folder intact.
- [ ] A failure after staging is resumable by re-running the runtime.
- [ ] A wrong reference or hash mismatch blocks the transaction fail-closed.
- [ ] No deletion occurs before a full origin/destination match.
- [ ] Rollback is proven by filesystem fixtures.
- [ ] The archive agent never declares a completed move.
- [ ] JS/Go parity applied where applicable (documented as N/A for the transaction runtime).
- [ ] `npm test` and the filesystem tests pass on Windows and Linux.

**Branch advisory:** before `sdd-apply` starts, create a feature branch following the `<tipo>/<descripción>` convention from the `branch-pr` skill (e.g. `git checkout -b feat/hybrid-archive-transaction-runtime main`).
