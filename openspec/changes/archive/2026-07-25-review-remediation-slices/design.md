# Design: Slice-Scoped 4R Review Remediation

## Technical Approach

Keep the immutable review-lineage identity and one-shot discovery model, but add a separately versioned remediation layer. `scripts/lib/review-lineage.js` remains the pure authority: it freezes an evidence-backed slice manifest, selects one active slice, accounts correction lines and failed validations only there, and preserves passed slices unless a validator supplies exact cross-slice regression evidence. `scripts/lib/review-gate-state.js` remains a thin adapter over `nextLineageAction`.

Legacy lineages are upgraded additively before their next mutable action. Existing schema-v1 fields and histories remain byte-for-byte values in place; migration adds `remediation_schema_version: 2`, a source/manifest digest, and correction slices. The paused O4.2 lineage receives a reviewed manifest derived from its frozen finding evidence: historical provenance, `authorizedChange`, model-policy enforcement, and malformed-record handling. Its latest per-finding outcomes seed passed state monotonically; its 171 historical changed lines remain audited but are not falsely assigned to any new slice, while failed validations are attributed only to slices whose findings were unresolved in those validations.

Phase-cost support is additive: the existing `sdd-*` prefix rule is preserved, while exactly six review agents receive their full name as the phase key in both runtimes.

## Architecture Decisions

### Decision: Version remediation independently from immutable lineage identity

**Choice**: Retain `schema_version: 1`, the v1 lineage ID digest domain, genesis, lenses, findings, and legacy histories; add `remediation_schema_version: 2` and slice state. New lineages write both versions. See ADR-001.

**Alternatives considered**: Replace the full object with schema v2; mutate schema-v1 histories into slices; keep the lineage-wide budget.

**Rationale**: An additive axis avoids changing identity or rewriting audit history while giving the reducer an unambiguous authority switch. A v2-aware runtime fails closed if remediation metadata is incomplete; a v1-only runtime must not be used for mutable review after rollout.

### Decision: Freeze an explicit evidence-backed root-cause manifest

**Choice**: `freezeFindings` for new lineages and `migrateReviewLineage` for legacy lineages accept a canonical manifest that exactly partitions blocking finding IDs. Each group carries evidence digests and permitted genesis paths; the reducer validates and hashes it. No semantic clustering occurs inside the reducer.

**Alternatives considered**: Keyword clustering; grouping by reviewer owner; one slice per finding unconditionally.

**Rationale**: Text similarity is language-sensitive and owner is not root cause. An explicit, digest-bound manifest makes grouping deterministic and auditable. Missing/duplicate IDs, stale evidence hashes, non-genesis paths, or ambiguous legacy regression history return contract remediation.

### Decision: Bound and validate each slice monotonically

**Choice**: Each slice receives the established allowance `min(200, ceil(original_changed_lines / 2))`, cumulative `used_lines`, and `max_failed_attempts: 3`. Historical pre-slice lines are recorded as unallocated legacy usage, not charged speculatively. The reducer updates only the active slice; passed slices reopen only through exact impacted-slice regression records. See ADR-002.

**Alternatives considered**: Split one 200-line pool; reset budgets after every correction; revalidate all unresolved findings atomically.

**Rationale**: Reusing the known cap changes only its authority boundary. It remains finite without making unrelated fixes compete or reopening independently resolved causes.

### Decision: Use an exact reviewer telemetry allowlist

**Choice**: Add the same frozen set in JS and Go: `review-change`, `review-risk`, `review-readability`, `review-reliability`, `review-resilience`, `review-correction`. `derivePhaseKey` returns the stripped suffix for every `sdd-*`, the exact agent name for these six, and empty otherwise.

**Alternatives considered**: Accept every `review-*`; reuse model-tier membership as telemetry authority.

**Rationale**: Prefix matching expands authority accidentally, while model policy and observability eligibility are separate contracts. Local exact sets are straightforward to parity-test.

## Data Model and Interfaces

The new fields are additive to the existing lineage:

```js
{
  schema_version: 1,                 // immutable identity/audit schema
  remediation_schema_version: 2,
  remediation_migration: {
    source_digest, manifest_digest, migrated_at,
    legacy_used_lines, legacy_failed_attempts
  },
  slice_order: ["S-..."],            // canonical slice-id order
  active_slice_id: null,
  correction_slices: {
    "S-...": {
      slice_id, root_cause_key,
      finding_ids: ["F-..."],
      evidence_digests: ["sha256:..."],
      permitted_paths: ["repo/relative"],
      resolutions: { "F-...": "resolved|unresolved" },
      status: "ready|correcting|validating|passed|exhausted|escalated",
      budget: { limit_lines, used_lines, failed_attempts, max_failed_attempts: 3 },
      correction_history: [], validation_history: [], regression_history: [],
      legacy_correction_refs: [], legacy_validation_refs: []
    }
  }
}
```

`slice_id` is `S-` plus the first 16 hex characters of a domain-separated digest over `{lineage_id, root_cause_key, finding_ids, evidence_digests, permitted_paths}`. The manifest must partition every blocking frozen ID exactly once; advisory findings remain immutable follow-ups and consume no slice authority. Slice paths are canonical, non-empty subsets of genesis. Budget limits and maximum attempts are immutable after creation.

`migrateReviewLineage(v1, manifest)` first validates v1, rejects pending/unknown operations, verifies manifest evidence against frozen finding content, and computes `source_digest` over the unchanged v1 authority fields. It returns the same result on repeat. Latest legacy outcomes seed each finding's effective resolution; a passed slice remains passed. Each failed validation is counted for a slice only when that slice contains an unresolved outcome, or when legacy regression evidence explicitly names it. A legacy `regression.detected: true` without impacted IDs cannot be attributed and fails closed. Existing `correction_budget`, `correction_history`, `validation_history`, successor history, and finding `resolution` values remain untouched and become read-only legacy audit data.

O4.2's reviewed manifest groups its ten blocking IDs into four causes. The latest validation seeds provenance as `ready` with two failed attempts and the other three slices as `passed`. `legacy_used_lines: 171` is retained in migration audit, while all new slice `used_lines` start at zero because the old atomic corrections cannot be apportioned honestly. No pending operation exists, so migration needs no reconciliation and creates no successor.

`beginCorrection` accepts exactly the reducer-selected `slice_id`; paths and finding IDs must be subsets/equal to that slice. `recordCorrection` charges only its budget. `applyTargetedValidation` requires outcomes exactly for the active slice and adds:

```yaml
regression:
  detected: true|false
  evidence: [non-empty bounded evidence]
  impacted_slices:
    - slice_id: S-...
      finding_ids: [F-...]
      paths: [repo/relative]
      evidence: [bounded attribution]
```

When `detected: false`, `impacted_slices` must be empty. When true, every impacted ID/path must belong to the named passed slice; only those IDs become unresolved. Unrelated observations remain append-only non-blocking follow-ups. `nextLineageAction` selects the first actionable slice in `slice_order`; exhausted/escalated slices do not consume another slice's authority. The lineage becomes `approved` only when all slices pass, and terminal `exhausted`/`escalated` only when unresolved slices remain and none is actionable.

`createSuccessor` additionally requires `authority_kind: new-candidate|new-scope|new-discovery-authority` plus a valid approval reference. Slice failure, allowance exhaustion, validation failure, or a desire to retry is rejected as successor authority.

## Data Flow

```text
frozen findings + evidence-backed manifest
        -> validate/hash slices -> persist remediation v2
        -> nextLineageAction(active slice)
        -> persist pending correction -> apply delta -> charge active slice
        -> review-correction(active IDs only)
        -> pass/fail active slice
             \-> explicit impacted-slice regression only -> reopen named IDs
        -> all passed: approved | no actionable unresolved: exhausted/escalated
```

For a schema-v1 continuation: read state -> reconcile pending/unknown work -> validate migration manifest -> append v2 remediation fields -> persist -> dispatch the legal active slice. Downstream verify/delivery/archive remain read-only candidate and terminal-state checks.

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/review-lineage.js` | Modify | Slice schema, manifest validation, idempotent migration, per-slice reducer transitions, monotonic regression, successor authority. |
| `scripts/lib/review-gate-state.js` | Modify | Adapt slice-aware actions and block dispatch until migration/reconciliation is legal. |
| `scripts/review-lineage.test.js` | Modify | Reducer, migration, O4.2, monotonicity, exhaustion, and successor tests. |
| `scripts/review-gate-state.test.js` | Modify | Exact active-slice dispatch and downstream read-only tests. |
| `scripts/fixtures/review-lineage/o4-2-gen4-v1.json` | Create | Minimal frozen O4.2 lineage/manifest/expected migration fixture. |
| `skills/_shared/gate-4r-review.md`, `agents/sdd-orchestrator.agent.md` | Modify | Persist-before-dispatch, migration, slice selection, successor rules. |
| `skills/review-correction/SKILL.md`, `agents/review-correction.agent.md` | Modify | Active-slice input and explicit impacted-slice regression contract. |
| `rules/sdd-common.instructions.md`, `rules/sdd-openspec.instructions.md` | Modify | Keep workspace mirrors synchronized. |
| `scripts/review-correction-contract.test.js`, `scripts/selective-4r-parity.test.js` | Modify | Source and all-target contract parity. |
| `scripts/hooks/subagent-stop.js`, `internal/hooks/subagentstop.go` | Modify | Exact review allowlists and unchanged `sdd-*` key behavior. |
| `scripts/lib/ospec-state.js`, `internal/store/store.go` | Modify | Compute `relaunch` only from prior successful same-phase rows, as specified. |
| `scripts/hooks/subagent-stop.test.js`, `internal/hooks/subagentstop_test.go`, `internal/store/store_test.go` | Modify | Review eligibility, fallbacks, relaunch, and fail-safe tests. |
| `internal/testdata/parity/subagent-stop-phase-cost-review-*.json`, `scripts/hooks/parity-contract.test.js` | Create/Modify | Shared allowlisted and invented-review fixtures with normalized JS/Go parity. |
| `openspec/changes/strict-tdd-evidence-remediation-fast-path/state.yaml` | Modify | Add the audited idempotent O4.2 remediation-v2 migration only after reducer tests pass. |
| `dist/{claude,claude-marketplace,vscode,github-copilot,opencode,codex}/**` | Regenerate | Generated reducers, hooks, agents, and skills through existing target builds; never hand-edit. |

## Requirement and Scenario Allocation

| Requirement / scenarios | Design allocation | Verification |
|---|---|---|
| REQ-routing-004; independent resolution, explicit cross-slice regression, genesis escape | Slice schema and `beginCorrection`/`recordCorrection`/`applyTargetedValidation`; immutable manifest, exact impacted slices and paths | Reducer unit tests for policy failure preserving provenance, attributed reopen, unrelated reopen rejection, path escape. |
| REQ-routing-005; interrupted reviewer, paused O4.2, archive read-only | Reconciliation precedes migration; additive idempotent migrator; `validateLineageForGate` remains read-only | Unknown-operation tests, O4.2 fixture double migration, byte comparison of legacy fields, archive no-mutation assertion. |
| REQ-agents-013; two specialists, no rediscovery on remediation | Existing dimension dispatch unchanged; adapter emits only `review-correction` with active-slice context after freeze | Gate-state tests retain two-lens selection/parallel policy and reject specialist relaunch. |
| REQ-agents-015; slice exhaustion isolation, explicit successor authority | Per-slice counters/status; deterministic next slice; typed successor authority plus approval ledger | Three failures exhaust one slice without touching another; exhaustion-as-successor reason rejected. |
| REQ-skills-007; unrelated concern, passed slice monotonicity, reviewer relaunch rejection | Correction prompt/skill exact slice result and impacted regression grammar; one-shot lenses remain reducer-owned | Contract/parity tests plus reducer tests for follow-up-only observation, monotonic pass, and relaunch rejection. |
| REQ-hooks-001; allowlisted identical, fallbacks, repeated dispatch, no active change, arbitrary name, failure | Exact JS/Go sets; shared phase-key semantics; existing normalization/lock/fail-safe; success-only relaunch in append stores | JS and Go unit tests plus shared parity fixtures for `review-correction`, `review-invented`, missing context, repeat, no active change, and injected append/estimation failure. |

All normative MUSTs are owned by the rows above: immutable identity/lenses/findings and pending-operation safety stay in the reducer; orchestration never reconstructs authority; every supported target receives the same validator boundary through generated parity.

## Testing Strategy (Strict TDD)

| Layer | RED -> GREEN -> TRIANGULATE -> REFACTOR evidence |
|---|---|
| Reducer unit | First add failing tests for independent budgets, active-only outcomes, passed-slice preservation, attributed regression, exhaustion isolation, migration idempotence, malformed manifests, and successor reason rejection; implement the minimum pure transitions; triangulate with multi-slice/O4.2/unknown-operation cases; extract canonical manifest and invariant helpers without changing passing behavior. |
| Adapter/contract | Capture failures showing all unresolved IDs are dispatched and prose lacks slice isolation; adapt only reducer actions; triangulate downstream read-only and relaunch rejection; consolidate action-to-dispatch mapping. |
| Hook JS/Go | Add failing allowlisted-review and arbitrary-review cases in both runtimes; implement identical sets/key derivation; triangulate UTF-8 fallbacks, no active change, repeat, and failures; share fixture expectations and keep normalization unchanged. |
| Generated integration | Make source/mirror and target parity tests fail on old lifetime/atomic text; update sources and regenerate all targets; run focused parity then full `npm test` and `go test ./...`; record every cycle and command in future `apply-progress.md`. |

No production change may precede its focused RED. O4.2 state migration is the final write: snapshot its pre-migration digest, run the migrator, assert unchanged legacy digests and expected slices, then rerun it to prove zero delta.

## Migration / Rollout / Rollback

1. Ship dual-read reducer and tests; v1 remains readable but mutable action returns `migration-required`.
2. Update adapters/contracts and regenerate targets.
3. Migrate active lineages under exact state locks. Reconcile unknown/pending operations first; contract-invalid manifests stay blocked.
4. Migrate O4.2 from its pinned fixture/manifest, persist source and manifest digests, and resume only its provenance slice. Do not create a successor.
5. Enable review phase costs after JS/Go parity passes; existing `sdd-*` records and old `est_tokens` reads remain unchanged.

Rollback before state migration is a code revert. After any v2 remediation fields are persisted, pause mutable 4R work and roll forward or restore the exact pre-migration state snapshot; never delete migration audit or replay an unknown operation. Telemetry changes can be reverted independently because unsupported review agents simply stop emitting additive rows.

## Open Questions

None.
