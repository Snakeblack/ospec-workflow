# Design: K3 Readiness Remediation

## Technical Approach

Remediate K3 as one contract surface spanning the canonical Candidate v2 schema, the execution-identity runtime, generated targets, fixtures, and evidence-backed workflow metadata. `freezeCandidate()` remains the exclusive Candidate v2 constructor. A single non-exported derivation primitive will recompute CandidateIds from canonical frozen payloads and determine `exact` or `changed`; both freeze and relation evaluation use it, preventing schema fields, caller-provided IDs, or a second successor API from becoming competing authorities.

The rollout is fail-closed: retired relation values are rejected, a bare predecessor digest is no longer sufficient to construct lineage, generated targets must contain both runtime and schema dependencies, and archived evidence is immutable. `REQ-execution-identities-010` is allocated to the per-destination staging transaction, mandatory staged-tree validator, restore path, and injected-failure suite below, so prune, directory creation, write, or validation failures cannot expose a partial managed tree. K4a graph, replay, obligations, and worker authority are not introduced.

## Architecture Decisions

### Decision: Keep successor construction inside `freezeCandidate()`

**Choice**: Extend the existing input with `predecessorCandidate?: CandidateV2`. Root calls remain unchanged. When a predecessor is supplied, validate and recompute it, freeze the proposed payload, and derive lineage from the two recomputed IDs. Equal IDs return the canonical `exact` record with `predecessor_id: null`; distinct IDs return a `changed` record with the recomputed predecessor ID. Reject legacy `predecessorId` / `predecessor_id`-only input because it cannot prove payload lineage. A non-exported `deriveCandidateRelation()` performs the shared comparison and coherence checks.

**Alternatives considered**: Export `createCandidateSuccessor()` (second construction authority); let callers provide `relation` and `predecessor_id` (unverifiable); overload `evaluateCandidateRelation()` to construct records (mixes evaluation and construction).

**Rationale**: The specs require `freezeCandidate()` to remain exclusive and relation to derive from frozen bytes. One internal derivation primitive avoids duplicated rules while preserving the established public entry point. See ADR-001.

### Decision: Publish K3 runtime and a closed schema asset set to every configured target

**Choice**: Add `scripts/lib/execution-identities/index.js` to the curated runtime BFS roots in `scripts/configure/cli.js`. Add a curated K3 schema asset list containing `schemas/kernel/manifest.json`, Candidate v2, SourceSnapshot v1, WorkOrder v1/v2, and WorkResult v1. `loadTree()` copies these byte-for-byte before target transformation. All six `PROFILES` targets are applicable; `dist/claude-marketplace` remains packaging output rather than a seventh semantic target.

**Alternatives considered**: Copy all repository schemas (unbounded distribution growth); publish only Candidate v2 (runtime loaders for the other exported K3 APIs break); rely on source-tree fallback (distributions cease to be self-contained).

**Rationale**: The runtime already loads schemas through the manifest relative to the distribution root. Curated roots preserve the generator's explicit publication model and make missing assets testable. See ADR-002.

### Decision: Publish each destination through a sibling staging transaction

**Choice**: Keep `writeTree()` as the deterministic managed-tree mutator, but run it only against a process-owned sibling staging directory. If the destination exists, first record its managed inventory/byte manifest and clone its complete tree into staging so unmanaged files retain today's semantics; if absent, start with an empty staging tree. Prune and write the transformed output in staging, then always validate its desired managed inventory and bytes, including the K3 runtime/schema closure. When the existing `validate` option is enabled, also run the profile validator against staging. Only a valid stage may commit. Commit moves the current destination into a unique sibling backup container and renames staging to the destination. If the second rename fails, synchronously rename the backup back, verify the restored managed manifest, and then propagate the original error. Publication is independently transactional for each `runConfigure()` call/target; there is no six-target coordinator or rollback of already successful targets.

**Alternatives considered**: Continue in-place prune/write and snapshot only managed files (partial state remains observable and restoration duplicates inventory rules); rename staging directly over a non-empty destination (not portable across Windows and POSIX); transact all six targets together (unrequested global coupling and larger recovery surface).

**Rationale**: Sibling directories share the destination parent's filesystem, avoiding `EXDEV`, while the two-rename protocol never exposes a partial tree: readers may briefly observe no destination, but can observe only the old complete tree or the new complete tree. Restoration provides the spec's required failure semantics without introducing a native dependency. See ADR-003.

### Decision: Reconcile archive workflow metadata through an allowlist

**Choice**: Mutate only `state.yaml` in the three evidence-backed non-terminal K3 archive folders. Reconcile top-level `status`, `last_updated`, and `phases.archive` status/artifact/summary where absent or stale. Before editing, record SHA-256 digests for every sibling artifact; after editing, require every non-state digest to match.

**Alternatives considered**: Rewrite archive/verify reports to match state (destroys evidence); leave contradictory state untouched (continuation logic misclassifies archived work); normalize every K3 archive (unnecessary scope).

**Rationale**: Each target folder already contains an archive plan/report and PASS verify evidence. The allowlist corrects derived workflow metadata without changing historical evidence bytes.

### Decision: Preserve the singular lineage and add a canonical generational container

**Choice**: Keep `gates.4r-review-gate.lineage` byte-for-byte as the immutable legacy seed and add `lineages: { schema_version, revision, active_lineage_id, order, by_id, pending_mutation }` beside it. `order` is the canonical generation order; `by_id` owns every complete lineage record; `active_lineage_id` is the only mutable selection pointer. Migration seeds generation one by cloning the singular lineage into `by_id`, records both its canonical-record digest and raw legacy-block digest, and never rewrites the singular node. New readers resolve and validate the container; legacy readers continue to see a terminal predecessor and therefore fail closed rather than mutating the successor.

**Alternatives considered**: Replace `lineage` with `{ active_lineage_id, by_id }` (breaks existing readers and destroys the literal legacy node); keep the active lineage in `lineage` plus a historical collection (every activation overwrites the compatibility field and makes predecessor preservation harder to prove); store generations in an external sidecar (splits canonical workflow state and complicates archive/recovery).

**Rationale**: An additive sibling is the only option that simultaneously preserves existing state bytes, gives new consumers an unambiguous active pointer, supports any number of successors, and permits compare-and-swap persistence of one canonical object. See ADR-004.

## Data Flow

```text
freeze input
  -> canonicalize and validate payload
  -> compute CandidateId
  -> no predecessor ----------------------> exact root, predecessor_id=null
  -> validate frozen predecessor
       -> recompute predecessor CandidateId
       -> deriveCandidateRelation(ids)
            -> equal ----------------------> exact canonical record, no successor lineage
            -> different ------------------> changed successor, predecessor_id=recomputed id

evaluateCandidateRelation(baseline, target)
  -> validate both Candidate v2 records
  -> recompute both IDs
  -> deriveCandidateRelation(ids)
  -> verify target.relation + predecessor_id coherence
       -> coherent ------------------------> validate | re-evaluate
       -> mismatch ------------------------> unknown / stop / LINEAGE_RELATION_MISMATCH
```

Typed ambiguous/unknown selectors retain their current fail-closed path after the frozen-candidate gate. They do not construct or persist Candidate records.

Distribution flow:

```text
canonical runtime + curated schema assets
  -> loadTree()
  -> target transform (claude|vscode|github-copilot|opencode|codex|cursor)
  -> acquire per-destination sibling lock
  -> clone existing destination (or empty) into sibling staging
  -> prune managed stale files + mkdir/write complete output in staging
  -> mandatory inventory/byte/K3 assertions in staging
  -> optional profile validator(staging) unless --no-validate
       -> fail: delete staging; destination is unchanged
       -> pass: destination -> sibling backup; staging -> destination
            -> commit failure: backup -> destination; propagate failure
            -> success: delete backup and release lock
```

The stage and backup containers are created with `fs.mkdtempSync()` under the resolved destination parent; code deletes only the exact paths returned by that call. A fixed sibling lock (`.<destination-name>.configure.lock`) is acquired with exclusive creation and records the PID, destination, and start time. A collision fails closed before staging; stale locks are reported for explicit operator cleanup and are never stolen. The parent is created before lock acquisition when necessary. Existing destination symlink/mount/permission behavior is not redefined: any `lstat`, clone, or rename error aborts, and the destination remains untouched unless the backup move already completed.

Because Node core has no portable atomic exchange for two non-empty directories, commit intentionally has an absence window between the two renames. The invariant is completeness, not continuous availability. The stage and backup are siblings specifically to make same-device rename an implementation precondition; an `EXDEV` or other first-rename failure leaves the destination in place. After the destination has moved to backup, every failure path restores it before returning. If restoration itself fails, retain the backup, raise an `AggregateError` naming its recovery path, and never delete the only complete copy.

## Interfaces / Contracts

```js
freezeCandidate({
  repositoryId,
  projection,
  baseTree,
  candidateTree,
  diffText,            // or validated diff_hash
  paths,
  fileModes,
  intendedUntracked,
  predecessorCandidate // optional, complete frozen candidate/v2; never a bare ID
}) -> CandidateV2
```

`CandidateV2.relation` is required and exactly `exact | changed | ambiguous | unknown`. `predecessor_id` remains nullable lineage metadata. JSON Schema enforces vocabulary and shape; cryptographic predecessor/relation coherence is enforced by runtime and adversarial contract fixtures because Draft 2020-12 cannot recompute CandidateIds.

For a derived `exact` pair, the target must carry `relation: "exact"` and no predecessor lineage. For a derived `changed` pair, it must carry `relation: "changed"` and `predecessor_id` equal to the recomputed baseline ID. Any declared CandidateId mismatch remains `DECLARED_ID_MISMATCH`; lineage/relation mismatch uses `LINEAGE_RELATION_MISMATCH` with `relation: "unknown"`, `action: "stop"`.

Legacy Candidate v2 values (`superset`, `subset`, `overlapping`, `disjoint`) have no aliases. Existing bytes are rejected. Migration means reading the source as legacy input outside Candidate-v2 validation and calling `freezeCandidate()` to create a new canonical record; the source file is never overwritten.

Transactional publication remains an internal CLI contract. `runConfigure()` keeps its result shape. `--no-validate` skips only the external profile gate; a new synchronous `validateStagedTree(stageDir, output, managedRoots)` check always verifies every desired path and byte, absence of stale managed paths, and the required K3 closure before commit. Profile-validation failure still returns a non-zero `exitCode` rather than throwing, but now discards the invalid stage and leaves `outDir` unchanged; mandatory staged-tree or filesystem failures throw after cleanup/restoration. Internal helpers accept an operation observer/fault seam invoked immediately before each mutating `prune`, `mkdir`, `write`, and `rename` operation; production supplies a no-op, while tests throw deterministically by phase, operation, and ordinal. The existing injected `runValidator(profile, stageDir)` seam drives external-validation failures; validators must receive the stage path, not the live destination.

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/execution-identities/index.js` | Modify | Add the shared internal derivation/coherence primitive; extend `freezeCandidate()` with a complete predecessor record; reject bare lineage input; enforce stored relation coherence in evaluation. |
| `schemas/kernel/candidate/v2.schema.json` | Modify | Replace the six retired values with the exact four-value K3 enum; keep `relation` required and `predecessor_id` nullable. |
| `schemas/kernel/candidate/fixtures/valid/v2-minimal.json` | Modify | Preserve a canonical exact root fixture under the corrected enum. |
| `schemas/kernel/candidate/fixtures/valid/v2-changed-successor.json` | Create | Structurally valid changed successor fixture. |
| `schemas/kernel/candidate/fixtures/invalid/v2-retired-superset.json` | Create | Pin retired-vocabulary rejection. |
| `schemas/kernel/candidate/fixtures/invalid/v2-exact-with-predecessor.json` | Create | Feed the runtime coherence check for the impossible lineage combination. |
| `schemas/kernel/candidate/fixtures/identity/{symlink-target-change,case-distinct-paths,projection-change}.json` | Create | Paired freeze inputs proving identity-significant boundaries without pretending JSON Schema can recompute digests. |
| `scripts/lib/execution-identities/index.test.js` | Modify | RED/GREEN tests for roots, equal no-successor, changed successor, bare-ID rejection, stored mismatch, symlink, case, projection, mode, untracked, and identity separation. |
| `scripts/lib/k3-schema-fixtures.test.js` | Modify | Assert exact enum, retired rejection, structural fixtures, runtime coherence fixture, v1/K1 immutability, and non-aliasing. |
| `scripts/configure/cli.js` | Modify | Add K3 runtime BFS root and curated schema assets; add per-destination lock, managed-tree snapshot, sibling stage/backup ownership, mandatory staged-tree validation, clone-stage-write-validate-commit/restore helpers, exact cleanup, and deterministic internal fault seams while retaining synchronous I/O. |
| `scripts/configure/cli.test.js` | Modify | Unit-test asset/root inclusion, generator-only exclusions, all six successful transactions, preservation of unmanaged entries, lock/name collision handling, and injected prune/mkdir/write/validation/commit failures with byte-and-inventory snapshots. |
| `scripts/strict-tdd-evidence-parity.test.js` | Modify | Assert all six transformed targets contain the K3 API, validator dependencies, manifest, and canonical Candidate v2 bytes. |
| `dist/{claude,vscode,github-copilot,opencode,codex,cursor}/**` | Regenerate | Rebuild canonical generated outputs; K3 files must be present and target validation must pass. |
| `openspec/changes/archive/2026-08-07-k3-identities-boundary-closure/state.yaml` | Modify | Reconcile verified/pending archive metadata to archived/done from existing PASS + archive artifacts. |
| `openspec/changes/archive/2026-08-08-k3-cumulative-schema-binding-remediation/state.yaml` | Modify | Reconcile proposing status and add completed archive metadata from existing PASS + archive artifacts. |
| `openspec/changes/archive/2026-08-08-k3-strict-schema-binding-remediation/state.yaml` | Modify | Reconcile proposing status to archived while preserving its completed archive phase. |
| `scripts/lib/k3-readiness-reconciliation.test.js` | Create | Pin the state allowlist, archive evidence digests, and K3/K4a documentation boundary. |
| `docs/roadmaps/harness-evolution.md` | Modify | Mark K3 readiness remediation as the prerequisite; K4a is blocked until this change verifies/archives. Do not add K4a behavior. |
| `docs/architecture/harness-evolution.md` | Modify | Align readiness wording and Candidate v2 projection/relation references without designing K4a. |

No v1 schema, `K1_SCHEMA_BASELINE`, archived report, archive plan, apply progress, spec, design, task, or 4R sidecar may change.

## Testing Strategy

Strict TDD applies task-by-task with `node --test <focal-file>` for GREEN and `npm test` for final regression.

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Relation derivation and freeze construction | RED tests first for equal/different predecessors, bare-ID rejection, recomputed-ID mismatch, persisted-coherence rejection, and selector regression. Mutation challenge: forcing `relation: "exact"` for a changed payload must fail. |
| Contract | Schema vocabulary and fixtures | RED schema tests prove `superset` rejection, exact four-value enum, valid changed shape, invalid exact lineage at runtime, identity non-aliasing, and unchanged v1 digests. |
| Identity boundaries | Symlink, case, projection, modes, untracked | Paired fixture inputs are frozen through production code; assert distinct CandidateIds and case-preserving canonical paths. |
| Distribution | Six self-contained transactional targets | For every `PROFILES` key, assert transformed and regenerated trees contain byte-equal canonical schema assets plus loadable K3 runtime dependencies, and that the validator receives the sibling stage. Snapshot the complete pre-existing tree before each injected failure and deep-compare inventory and bytes afterward. |
| Publication fault injection | Prune, mkdir, write, validation, rename, cleanup | RED tests inject: prune failure after at least one staged stale-file removal; managed-directory `mkdir` failure; write failure after staged pruning; mandatory staged-tree assertion failure; profile-validator non-zero/warning; destination-to-backup rename failure; stage-to-destination rename failure with successful restoration. Repeat absent-destination cases and assert no destination or managed partial remains. Assert restored managed manifest equality, stage/backup cleanup, original error propagation, and retained backup on simulated restore failure. |
| Historical/doc | Safe reconciliation and K4a boundary | Pin all non-state archive artifact digests, assert only three allowlisted states are terminal, and assert docs no longer claim K4a is eligible before remediation closure. |
| Regression | Repository suite | Run focal tests after each GREEN, then `npm test`; record RED, GREEN, TRIANGULATE, and REFACTOR evidence in `apply-progress.md`. |

Triangulation must include at least root/exact, equal predecessor/exact, changed successor, invalid declared ID, retired relation, and inconsistent lineage. Tests must call production functions and must not self-generate expected relation values from the implementation under test.

## Migration / Rollout

1. Capture immutable K1 and targeted archive evidence digests.
2. Land failing runtime/schema/fixture tests, then implement the single derivation authority and four-value schema.
3. Add failing transactional-publication tests, then implement the synchronous sibling stage/validate/backup/rename protocol. Add distribution roots/assets and six-target assertions; regenerate every configured target deterministically through that protocol.
4. Reconcile only the three allowlisted archive `state.yaml` files and update the two K3/K4a references; verify sibling bytes are unchanged.
5. Run focal suites and `npm test`. K4a remains blocked until SDD verify and archive complete.

Rollback is one change revert followed by regenerating all six targets. Each regeneration is independently recoverable: a failed target retains its prior complete destination and does not roll back other successful targets. Historical rollback restores only the three prior `state.yaml` versions; immutable sibling artifacts require no restoration because their digests must never change.

## Approved Successor And Generational Persistence Allocation

This follow-up allocates `REQ-agents-016` and `REQ-routing-007` without changing the already verified K3 Candidate/publication behavior. The existing terminal lineage remains immutable; successor review is a new high-risk generation over the verified Candidate.

### Approval resolution contract

`resolveSuccessorApproval()` receives the persisted change ledger, the exact reference, requested operation, authority kind, and all approval references already consumed by the chain. It accepts an identifier only when its UTF-8 representation is 1-128 bytes, is already trimmed, and contains no control characters; it deliberately imposes no semantic naming grammar. Therefore `4r-warning-remediation-001`, `approval-42`, and `release.scope.v1` are equally valid spellings.

Resolution requires exactly one ledger entry with that id, `source: vscode/askQuestions`, a non-empty bounded `decision`, and an `applies_to` array containing the exact requested operation. The operation itself is allowlisted (`sdd-verify`, `4r-review-gate`, or `review-change`). Authority is independently allowlisted as `new-candidate | new-scope | new-discovery-authority` and constrained by approval gate: `architecture` may authorize all three, `testing` only `new-candidate`, and `archive-warning` only `new-scope`. The current warning approval is therefore consumed as `new-scope` for `sdd-verify`; the distinct Candidate check remains mandatory. Missing/duplicate entries, malformed source/decision/scope, gate-authority mismatch, a reused reference anywhere in `order`, a non-terminal predecessor, or a CandidateId equal to the predecessor all reject before generalist/specialist dispatch. The successor stores an immutable approval snapshot digest plus `approval_reference`, `requested_operation`, and `authority_kind` in `recovery` audit data.

### Generational store and invariants

```js
lineages: {
  schema_version: 1,
  revision: 0,
  active_lineage_id: "sha256:...",
  order: ["sha256:..."],
  by_id: { "sha256:...": ReviewLineageV1 },
  legacy_lineage_digest: "sha256:...",
  legacy_source_digest: "sha256:...",
  pending_mutation: null
}
```

`scripts/lib/review-lineage-store.js` owns only collection invariants and compare-and-swap persistence; `scripts/lib/review-lineage.js` remains the pure authority for each lineage transition. Store validation requires: unique ids and generations; `order.length === Object.keys(by_id).length`; every key equals its record's `lineage_id`; generation one has no predecessor; every later record links to the immediately prior ordered id and increments generation by one; only the last id is active; all inactive records are terminal and contain no pending/unknown operation; and the singular legacy node and generation-one entry match their pinned canonical/raw digests. No migration or successor operation may reset attempts, budgets, findings, executions, slices, pending history, unknown history, or terminal outcome.

`migrateLegacyLineageGate()` first reconciles any legacy pending/unknown operation through the existing reducer. It then adds the container in one read-merge-write while leaving the raw singular block unchanged. A second call validates and returns zero delta. Existing containers are never reseeded: collision, ambiguous pointer, malformed chain, digest drift, missing generation, or partial-write artifacts fail closed.

### Atomic persistence and exact dispatch flow

`persistReviewLineageStore()` acquires an exclusive state-file lock, recovers or reports exact `.tmp`/`.bak` artifacts, reads the current bytes, and checks both the expected whole-file SHA-256 and expected store revision. It applies a pure merge, writes a same-directory temporary file, flushes it, atomically renames it with the existing verified backup/restore pattern, rereads it, and validates the intended store digest plus unchanged legacy-block digest. A collision returns stale-revision without write. An indeterminate rename/restore records or preserves `pending_mutation.status: unknown`; only `reconcileLineageStoreMutation()` with the exact request id, before/after digest, and observed committed bytes may continue.

The successor gate sequence is fixed:

```text
normalize evidence
  -> persist pending generalist request
  -> review-change
  -> record exact result / deriveReviewDimensions / validateReviewDecision
  -> resolve approval + active terminal predecessor
  -> createSuccessor (pure reducer)
  -> persist appended generation + active pointer
  -> for each reducer-selected lens:
       beginLens -> persist pending lineage operation -> dispatch reviewer
       -> recordLensResult -> persist
  -> freezeFindings -> persist
  -> planLineageGate(active lineage) -> execute only returned next_action
```

The pending record is durable before every external dispatch. Generalist uncertainty and lens uncertainty both become reconciliation-only states. `review-gate-state.js` resolves the active lineage through the store and passes it unchanged to `planLineageGate`; it maps the reducer's `next_action` to dispatch metadata but never selects another generation, rewrites authority, or infers a transition. Verify, delivery, and archive call `validateLineageChainForGate()` read-only: it validates the complete chain and delegates active-candidate status to `validateLineageForGate()` without allocating or mutating anything.

### Follow-up file changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/review-lineage.js` | Modify | Replace approval-id regex coupling with exact unique ledger resolution; validate source, decision, exact scope, gate-authority mapping, chain-wide reuse, terminal predecessor, and distinct Candidate; retain resolved audit data. |
| `scripts/lib/review-lineage-store.js` | Create | Canonical generational container, legacy migration, chain validation, active resolution, collision/pending/unknown handling, and atomic compare-and-swap state persistence. |
| `scripts/lib/review-gate-state.js` | Modify | Resolve the active generation and adapt only reducer-authorized `next_action`; add read-only downstream chain validation. |
| `scripts/review-lineage.test.js` | Modify | Generic approval ids; missing, duplicate, invalid-source, empty-decision, out-of-scope, authority-mismatch, reused-reference, same-Candidate, and predecessor-immutability cases. |
| `scripts/review-lineage-store.test.js` | Create | Legacy migration, second successor, idempotency, chain/pointer/collision/partial-write/unknown reconciliation, raw and canonical predecessor preservation, and read-only downstream checks. |
| `scripts/review-gate-state.test.js` | Modify | Adapter consumes only the active lineage and never reinterprets reducer output. |
| `scripts/selective-4r-parity.test.js` | Modify | Six-target runtime and handler parity for the store, approval contract, active pointer, and successor flow. |
| `skills/_shared/gate-4r-review.md` | Modify | Specify the exact generalist-to-successor sequence and pending-before-dispatch persistence. |
| `skills/_shared/approval-ledger.md`, `skills/_shared/openspec-convention.md` | Modify | Document generic exact-id resolution, single-use successor scope, and additive `lineages` state shape. |
| `agents/sdd-orchestrator.agent.md`, `rules/sdd-common.instructions.md`, `rules/sdd-openspec.instructions.md` | Modify | Keep source orchestration and workspace mirrors synchronized with generational persistence. |
| `scripts/configure/cli.js` | Modify | Include the new store runtime in the curated/generated closure when dependency reachability does not already do so. |
| `dist/{claude,vscode,github-copilot,opencode,codex,cursor}/**` | Regenerate | Publish source changes through the supported generator; never edit generated output manually. |
| `scripts/configure/install-codex.js`, `scripts/configure/codex-smoke.test.js` | Verify/modify only if needed | Install and execute the regenerated runtime from an isolated and active Codex home, preserving scripts/schema parity and stale-prune boundaries. |

### Follow-up testing and Strict TDD evidence

RED first pins every approval rejection and proves the three generic valid ids do not depend on spelling. Store tests pin the exact pre-migration legacy byte span and canonical object digest, migrate twice, append a successor, terminalize it, append a second successor, and assert every earlier entry remains deep-equal and digest-equal. Fault tests inject stale revision, duplicate id/generation, active-pointer ambiguity, temporary/backup partial state, failure before/after rename, and unknown outcome; no reviewer may be dispatched until exact reconciliation succeeds.

Integration tests run the full high-risk path: generalist once, deterministic full 4R selection, four `beginLens` persistence barriers, four one-shot reviewers, result recording, findings freeze, and `planLineageGate`. Downstream verify/delivery/archive snapshots must be byte-identical before/after. Mutation challenges attempt to reset predecessor attempts/budget/findings/executions and to make the adapter dispatch a non-reducer action; each must fail closed.

The Strict TDD functional manifest expands to every modified source, test, handler, rule, builder, and installer file. Apply records authenticated RED/GREEN receipts for the same permanent tests, focal store/reducer/adapter suites, K1 guards, six-target generation/parity, parallel `npm test`, and serial corpus. Verification recomputes the final Candidate, then creates the real explicitly approved successor and completes its high-risk 4R review. Codex dogfood regenerates `dist/codex`, installs through `install-codex.js`, verifies active runtime bytes and loadability, and notes that a new session is required to reload instructions/hooks.

### Migration, rollback, and boundaries

Rollout order is reducer approval hardening, store RED/GREEN, adapter/handler wiring, source-mirror synchronization, six-target regeneration, active Codex install, full verify, then the real successor review. Rollback is allowed only before a successor dispatch: remove the additive container and revert source/generated changes while the singular predecessor remains untouched. After a successor has dispatched, rollback must preserve the generational audit and terminate/invalidate through legal reducer transitions; it must never delete a generation or reactivate its predecessor.

K1 baselines, Candidate v1, and historical archive evidence remain immutable. The existing K3 Candidate/publication behavior stays in scope only as regression coverage. K4a Graph, Obligation Manifest, replay, global coordination, and worker authority remain excluded, and K4a cannot begin until the new requirements verify, the successor lineage is terminally approved, and this change archives.

## Open Questions

None. The specs resolve the public vocabulary, lineage authority, archive boundary, target scope, and K4a exclusion.
