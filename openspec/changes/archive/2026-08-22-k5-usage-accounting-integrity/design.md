# Design: K5 Usage Accounting Integrity

## Technical Approach

Use `createKernelRuntime` as the accounting owner. Each invocation reads the pending delta for `${subjectId}:${nodeId}`, while `runKernelOperation` keeps reconciled journal results separate from results physically executed in that invocation. The prior delta is applied to the reduced candidate state; newly reported `ExecutionUsage` is normalized without defaults from caller arguments and applied before CAS. An internal disposition (`none`, `pending`, or `committed`) tells the runtime whether to preserve only the new delta, retain the prior delta unchanged, or clear the partition after a confirmed commit.

This is `design-after-spec`. It allocates the requirements in `execution-budgets`, `lifecycle-kernel-runtime`, `authority-store`, and `lifecycle-model-conformance` without expanding into K6a, worker processes, async permit issuance, or a wider executor trust boundary.

## Architecture Decisions

### Decision: Two-bucket accounting with an explicit commit disposition

**Choice**: Maintain `P` (prior runtime-owned carry-over) separately from `N` (usage produced by physical effects in the current invocation). Apply `P + N` to the candidate state, but persist only `N` into carry-over when this invocation executed work and no accounting commit was confirmed. Consume an internal disposition before returning from `createKernelRuntime.runOperation`; do not expose it as a new public API field.

**Alternatives considered**: Re-aggregate journal results on every CAS loss; add the candidate state delta and carry-over simultaneously; clear carry-over for every non-error return.

**Rationale**: A skipped `completed` effect is evidence, not a new execution. The disposition also distinguishes a pre-CAS failure from a later blocked response after CAS already committed, preventing state/carry-over overlap. See `decisions/adr-001.md`.

### Decision: Fail closed on absent executor usage

**Choice**: Replace fallback normalization with a validator that accepts only `result.usage` or `result.execution_usage` from each physical execution. A present object is canonicalized across declared node and authority dimensions with omitted dimensions equal to zero; negative, non-finite, malformed, or absent usage returns `execution-usage-required`. It never reads `input.consumed`, `args`, modified-line fallbacks, or historical journal results. Minimum attempt penalties are not fabricated; zero-delta supplies its own semantic penalty.

**Alternatives considered**: Preserve the current defaults (`turns: 1`, `effect_attempts: 1`), infer changed lines from output fields, or trust caller-supplied consumption.

**Rationale**: Defaults make successful executions look accounted while still accepting caller influence and can double-charge the separate zero-delta penalty.

### Decision: A shared monotonic journal merge primitive

**Choice**: Move journal upsert semantics into `scripts/lib/journal-merge.js`. For the same `effect_id`, an existing `completed` entry is absorbing against incoming `planned`, `started`, `failed`, or `unknown`; otherwise the incoming entry wins. Preserve the complete existing record, including result evidence. `AuthorityStore` re-exports the helper for compatibility, while all three store paths call the shared implementation.

**Alternatives considered**: Patch the duplicated MemoryStore helper only; define a total status ordering; reject every conflicting terminal update.

**Rationale**: MemoryStore is the inner store used by AuthorityStore, so guarding only the outer CAS is too late. The minimal absorbing rule satisfies the contract without inventing precedence between `failed` and `unknown`. See `decisions/adr-002.md`.

### Decision: Effect progress is independent from lifecycle progress

**Choice**: Derive `effectProgress` only from actual file/content evidence or an explicit executor effect-progress signal. A `repair` moving `failed -> pending` with no effect progress remains zero-delta. The zero-delta delta (`turns: 1`, `effect_attempts: 1`) is additive to exact executor usage and is journaled before CAS; read-only and terminal control paths remain excluded.

**Alternatives considered**: Treat `state_advanced`/`advanced` as effect progress or exempt every lifecycle transition.

**Rationale**: Lifecycle movement does not prove that the repair changed the failing artifact and must not enable sterile retry loops.

## Data Flow

### Physical execution and all post-effect exits

```text
createKernelRuntime.runOperation
  │ read P = pendingCarryOver[subject:node]
  ▼
runKernelOperation ── reduce head with P ──► candidate state
  │
  ├─ journal completed/skip ──► reconciledResults only (never N)
  │
  └─ effectExecutor called ──► validate usage ──► N += exact usage
                                      │
          ┌───────────────────────────┼────────────────────────────┐
          ▼                           ▼                            ▼
   missing/invalid usage       failed/ambiguous             successful effects
   journal evidence kept       journal evidence kept        candidate -= N
   code=execution-usage-       disposition=pending          zero-delta if eligible
   required; prior N pending   carry=P+N                    CAS(candidate)
                                                               │
                                                   ┌───────────┴───────────┐
                                                   ▼                       ▼
                                             CAS not confirmed       CAS confirmed
                                             disposition=pending     disposition=committed
                                             carry=P+N               clear carry partition
```

For an executor throw, usage is accepted only from a structured partial result. Previously accumulated `N` is retained; an unmetered throw fails closed. Kernel interruptions carry the same internal disposition to the wrapper before being rethrown.

### Retry after conflicts

```text
Head H, pending P, new physical usage N

candidate = reduce(H, P) - N - zeroDeltaPenalty

CAS win   => persist candidate; pending := 0
CAS lose  => persist nothing from candidate; pending := P + N
retry skip=> N := 0; candidate = reduce(newHead, P)
             lose again => pending remains P (never 2P)
```

Invariants:

1. A physical executor call contributes to `N` exactly once.
2. Reconciled/skipped results contribute zero to `N`.
3. The same delta is never both confirmed in authoritative state and present in carry-over.
4. Only a confirmed accounting commit clears `P`; a pre-effect block leaves it unchanged.
5. Carry-over keys and all declared dimensions remain isolated by `${subjectId}:${nodeId}`.
6. Journal merge cannot replace `completed` or its result evidence with a stale lower-progress entry.

## Requirement Allocation

| Spec allocation | Scenarios covered | Component / evidence |
|---|---|---|
| `REQ-execution-budgets-003`, `REQ-lifecycle-kernel-runtime-025` | successful CAS, post-effect failure/ambiguity, repeated CAS losses with one execution, exhaustive multi-writer dimensions, repair retry, missing usage, rejected caller consumption, partition isolation, exhaustion and terminal exceptions | `lifecycle-kernel/index.js`, `reducer.js`, `execution-budgets.js`; focal runtime and K5 E2E tests |
| `REQ-execution-budgets-004`, `REQ-lifecycle-kernel-runtime-027` | sterile repair, empty code mutation, read-only inspection, terminal control, zero-delta CAS race | effect-progress derivation and pre-CAS zero-delta journal in `index.js`; budget helper and runtime/model tests |
| `REQ-authority-store-003`, `REQ-authority-store-011` | one CAS winner, peer tickets, winner-only ticket deletion, distinct effects, stale completed preservation, unified atomic record | shared `journal-merge.js`, AuthorityStore/MemoryStore/FileSystemStore commit paths and store tests |
| `REQ-lifecycle-model-conformance-011` | success debit, repeated conflict/no re-execution, failure plus missing usage, sterile repair, monotonic completed | expand `checkK5BudgetMonotonicity()` and `checkK5ZeroDeltaConsumption()` through real runtime/store composition; model suite remains the executable gate |

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/lifecycle-kernel/index.js` | Modify | Separate executed/reconciled results, validate/apply usage before CAS, classify all exit dispositions, and retain only new invocation usage. |
| `scripts/lib/lifecycle-kernel/reducer.js` | Modify | Accept only the runtime-internal prior delta; remove `action.delta` and `args.consumed` accounting authority. |
| `scripts/lib/execution-budgets.js` | Modify | Keep decrement monotonic for invalid/negative input and distinguish effect progress from lifecycle progress. |
| `scripts/lib/journal-merge.js` | Create | Central monotonic merge by `effect_id`, with `completed` absorbing stale lower statuses. |
| `scripts/lib/authority-store/index.js` | Modify | Use/re-export the shared merge for journal durability and atomic CAS. |
| `scripts/lib/lifecycle-kernel/memory-store.js` | Modify | Use the shared monotonic merge in both commits. |
| `scripts/lib/filesystem-store.js` | Modify | Use the shared monotonic merge under the file lock. |
| `scripts/lib/lifecycle-kernel/index.test.js` | Modify | Add success, failed-effect, missing usage, caller rejection, repeated conflict, partition, and sterile-repair regressions; give physical test executors explicit usage. |
| `scripts/k5-e2e-budgets-recovery.test.js` | Modify | Prove two consecutive conflicts, one executor call, and one retained delta. |
| `scripts/lib/authority-store/index.test.js`, `scripts/lib/filesystem-store.test.js` | Modify | Prove `completed` and its result evidence survive stale journal updates in memory/authority and filesystem paths. |
| `scripts/lib/lifecycle-model.js`, `scripts/lib/lifecycle-model.test.js` | Modify | Make the K5 invariants observe successful, failed, missing-usage, retry, zero-delta, and monotonic-journal behavior. |
| `scripts/lib/minimal-kernel-harness.js`, `scripts/lib/minimal-kernel-harness.test.js` | Modify | Update trusted fixture executors to emit explicit zero or measured usage without changing harness authority boundaries. |
| `docs/adr/adr-20260821-004-*.md`, `docs/adr/adr-20260822-{007,009,011}-*.md` | Modify | Reconcile carry-over, fail-closed usage, monotonic journal, and sterile-repair semantics with the implemented contract. |

## Interfaces / Contracts

`ExecutionUsage` remains executor-owned and has no caller fallback:

```js
{
  turns, patches, commands, wall_time_minutes, changed_lines,
  effect_attempts, authority_mutations, evidence_runs, review_sweeps
}
```

All values are finite non-negative numbers. A physical result MUST contain `usage` or `execution_usage`; omitted dimensions inside a present usage object mean zero. `input.consumed` may remain tolerated as ignored input for compatibility, but cannot reach the reducer or affect accounting. `execution-usage-required` is the stable fail-closed code. Internal disposition metadata is consumed and removed by `createKernelRuntime`, so no new public response contract is introduced.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Usage validation/application, no args fallback, zero-delta independence, monotonic journal merge | Focused RED/GREEN tests with exact before/after budgets and result evidence. |
| Integration | Success/failure/ambiguity/CAS dispositions across runtime and AuthorityStore; MemoryStore/FileSystemStore parity | Real permits, journal barriers, CAS races, and locked filesystem commits. |
| Model/E2E | One execution across repeated conflicts, all dimensions, sterile repair, completed non-degradation | Extend K5 checkers and `k5-e2e-budgets-recovery.test.js`, then run `npm test`. |

Focused TDD is authoritative from `openspec/config.yaml`; strict-TDD evidence is not required for this change.

## Migration / Rollout

No persisted data migration is required. Existing journal entries remain valid; merge semantics only prevent future degradation. Test and harness executors must emit explicit usage before the fail-closed behavior is enabled. Baseline specs are promoted by archive, not edited during apply. K6a remains blocked until verification passes.

## Open Questions

None.
