# Design: Modernize Installer Model Selection

## Technical Approach

Mode: `design-after-spec`. Keep the existing Bubble Tea model, Node adapter, pure transformer, and installer `main(argv, deps)` seams. Node owns policy and native values; Go owns reversible navigation and opaque selections. Allocation below covers all 31 change-local scenarios.

## Architecture Decisions

### Decision: Canonical capability policy and protocol v2

| Option | Tradeoff | Decision |
|---|---|---|
| Expand existing resolver and private JSON protocol | Coordinated Go/Node update; one policy owner | Chosen |
| Let Go synthesize native model objects | Smaller adapter change; duplicates validation | Rejected |

`installer-adapter.js` currently accepts decoded custom IDs; `model.go` manufactures Codex efforts. Remove both paths. Extend `model-resolver.js` with pure normalization/validation shared by planning and configure. Preserve existing tier/default resolution and legacy scalar/list/object catalog inputs. New catalog records separate native `value` from finite `controls`; opaque IDs include target identity and normalized value, never list position. See ADR-001.

### Decision: Profile-owned emission and inheritance

| Option | Tradeoff | Decision |
|---|---|---|
| Declare model selection, catalog alias, and emitted fields in profiles | Small profile expansion; shared validation | Chosen |
| Keep adapter target sets and transformer special cases | Less schema work; support can diverge | Rejected |

GitHub Copilot explicitly aliases the VS Code catalog/default column, with its own target-scoped IDs and array-valued model representation. Antigravity explicitly disables selection and injection: its current `model: {format: "alias"}` could otherwise inject future tier values. Agents emitted as host instructions/skills (Codex/Claude orchestrators in `handleFile`) remain inherited because those paths do not emit agent model configuration. Reasoning emission uses profile allowlists after validation; remove stale source fields before setting selected fields. See ADR-002.

### Decision: Static-first discovery rollout

Discovery is optional in REQ-install-025 and the proposal asks to evaluate it. No model-discovery implementation or capability-bearing CLI contract exists in the inspected installer. Ship static catalogs in this change; invoke no discovery command and introduce no unused provider abstraction. Native discovery remains a separate optional activation, conditional on verified read-only CLI support. This avoids claiming bare CLI model names prove reasoning capabilities. The activation obligations below allocate its conditional scenarios without making installation depend on discovery.

## Interfaces / Contracts

`models.yaml` retains `agents` and `tiers`. Add mapping-based `phase_groups` (`id -> label, agents[]`) and `presets` (`id -> label, targets -> target -> agent -> choiceId, controls`). Every selectable agent belongs to exactly one group; presets expand to complete assignments. Include a defaults preset matching current tiers. Catalog mappings accept records containing `value`, optional `label`, and `controls` (native field -> finite string values); preserve existing values through normalization. Optional `runtime` capabilities are validated data, never inferred controls. Use mappings and scalar arrays supported by `parseModels`, not YAML aliases or sequences of objects.

Validate duplicate keys, shapes, target/profile references, known agents, complete groups, preset coverage, choice references, and control membership before transformation/publication. Return structured policy errors. Profiles declare supported native fields; Codex retains `model_verbosity` as validated native metadata without adding a verbosity picker.

Private protocol v2 adds target `presets` and `groups`; agent choices expose `controls`, and effective selections contain `choiceId` plus optional `controls`. Requests contain exactly `version`, `target`, `mode` (`preset|custom|inherited`), optional `presetId`, and complete `selections`. Preset-mode assignments must equal the fresh preset expansion; custom edits switch mode. Inherited requests carry empty selections. Reject unknown fields, agents, IDs, controls, unsupported versions, and missing assignments before delegation. Go never decodes IDs or constructs native values.

`runConfigure` validates overrides against the same normalized policy and target profile before `transform` and `publishTransaction`. Invalid selected metadata fails closed; unrelated source frontmatter is stripped defensively. Claude emits `effort`; Codex emits `model_reasoning_effort`; OpenCode emits `variant`, using `variant: ""` for absent/default values. Other targets omit reasoning fields. No tier or source file is mutated.

## Data Flow

```text
Go Client -> Node plan -> parse/validate static policy -> protocol v2
Go Model: target -> preset -> review
                      -> Custom -> group/phase -> search -> control -> review
Explicit Install -> Node fresh plan -> validate full request
                 -> native overrides -> selected main([], deps) once
                 -> runConfigure -> validate -> transform -> existing transaction
                 <- native exit status and diagnostics <- Go Client
```

Keep per-target mode/assignments and per-agent query, cursor, and control state in `Model`. Back changes navigation only. Filtering is case-insensitive over labels and displayed model values; zero matches never changes selection. Display the selected value separately when filtered out. Search-input handling precedes navigation shortcuts, allowing letters such as `q`, `j`, and `k`. A model change retains a control only if still valid; otherwise resets to the declared default/absence. Review lists every effective assignment, mode, and control; Install remains explicitly focused/confirmed through the existing action boundary.

## File Changes

| Files | Action / responsibility |
|---|---|
| `models.yaml` | Modify catalog capabilities, groups, presets |
| `scripts/lib/model-resolver.js`, `scripts/configure/cli.js` | Modify normalization and pre-write policy validation |
| `scripts/configure/installer-adapter.js` | Modify v2 planning/revalidation; remove custom-ID bypass |
| `scripts/lib/target-profiles/{claude,codex,opencode,vscode,github-copilot,cursor,antigravity}.js` | Modify explicit selection/emission policy |
| `scripts/lib/target-transform.js` | Modify native emission and stale-field removal |
| `internal/installer/{client,model,view}.go` | Modify wire types, navigation, filtering, review |
| Corresponding Go/Node test files; `scripts/configure/cli.test.js`, `scripts/model-tier-contract.test.js` | Modify behavioral and policy fixtures |
| `scripts/configure/installer-protocol.test.js` | Create Go/Node boundary fixture test |
| `docs/plugin-installation.md`, `docs/plugin-installation.es.md` | Modify navigation and static-discovery guidance |

## Scenario Allocation and Testing Strategy

Scenario numbers follow document order within each requirement. Each row includes every scenario in that range.

| Requirement / scenarios | Component and verification |
|---|---|
| install-024 / 1–4: search, compatible control, unsupported control, Back | Go model/view tests: mixed-case/clear/zero-match filtering, finite controls, no unsupported request fields, retained query/model/control |
| install-025 / 1–4: augmentation, timeout, IDE exclusion, incompatible entry | Rollout below; current adapter test proves no subprocess discovery and usable static catalog for all targets |
| install-019 / 1–5: target, preset, groups, Antigravity, Back | Go navigation tests: single target, full preset expansion, phase-only editing, inheritance bypass, retained selections |
| install-020 / 1–4: supported choice, Copilot parity, inheritance, invalid selection | Adapter/Go tests: isolated agent update, equivalent catalogs with distinct target IDs, no inherited choices, reject forged request |
| install-021 / 1–2: explicit Install, edit review | Existing UI/client tests: zero installer calls before confirmation/cancel, exact updated summary/request |
| install-022 / 1–4: read-only, delegation, invalid plan, discovery failure | Adapter tests: source/destination snapshots, one selected main, stale-plan rejection, static install without CLI |
| generator-015 / 1–3: valid policy, broken reference, Antigravity catalog | Resolver/CLI tests: immutable normalization, structured errors before publication, inherited output despite catalog |
| generator-016 / 1–5: Claude, Codex, stale variant, invalid value, leakage | Transform/CLI tests: native field assertions, deep-merge prior `high` with empty variant, no writes on invalid selection, foreign-field absence |

Run focused Node tests, `go test ./internal/installer`, then `npm test` during implementation verification. Cross-language test consumes actual Node plan JSON through Go request generation and Node validation using temporary fixture repositories and injected installer mains. Verify outcomes and boundary calls, not internal helper counts. Design phase has not executed these tests.

## Migration / Rollout

Upgrade adapter and Go protocol together; old binaries fail explicitly on version mismatch. Preserve legacy catalog parsing and current default assignments; regenerate target outputs through configure. No destination migration or installer transaction changes.

Before optional discovery activation, prove a supported read-only command and capability schema for each enabled Codex/OpenCode provider. Its owner must enforce finite timeout/output bounds, validate capability-bearing entries, deduplicate with static precedence, and retain every static choice. Fixture and process-boundary tests must cover augmentation, malformed/empty output, timeout, missing CLI, incompatible capabilities, and zero invocation for other targets. Revalidation reruns discovery; missing dynamic-only choices reject safely while static choices remain installable. Until activation, those dynamic conditions cannot arise.

## Open Questions

None blocking. Native discovery activation is deferred under the specification's MAY allowance. Review workload requires forecasting in tasks; `single-pr` does not itself approve a size exception.

## Audited Verify Successor Extension

Scope: REQ-verify-lineage-013/014 only, authorized by the persisted `new-scope` and `architecture` entries. Earlier installer allocations remain intact. This extension adds five scenarios to the original 31. It implements the approved recovery exception separately from ordinary remediation: no A-to-B delta can be asserted when A's source tree is unavailable.

### Decision: Preserve the predecessor and enter a directed successor recheck

| Option | Tradeoff | Decision |
|---|---|---|
| Add audited terminal/successor transitions to the existing lineage module | Requires durable operation evidence and snapshot validation | Chosen; preserves frozen obligations and consumed budget |
| Route existing `superseded` through discovery | Simpler; rediscovery resets the bounded verification context | Rejected by REQ-014 |
| Manufacture an A tree from current files | Avoids recovery failure; falsely claims historical equivalence | Rejected by REQ-013 |

`verify-lineage.js` currently sends every superseded lineage to discovery; `evaluateRecheck` accepts caller booleans. `verify-lineage-candidate-store.js` preserves canonical Candidate JSON, but that metadata does not materialize source trees. Extend these boundaries; retain canonical identity in `execution-identities/index.js`. See ADR-003.

### Recovery, snapshot, and transition contracts

Add `collectCandidateRecoveryAudit(state, options)` and `validateCandidateRecoveryAudit(state, reference, options)` in `scripts/lib/verify-lineage-recovery.js`. The collector uses bounded filesystem/Git probes and returns immutable `candidate-recovery-audit/v1` evidence with lineage ID, current Candidate ID, original reference content digest, source inventory, search bounds, evidence references/digests, and structured outcomes. Inventory covers persisted record, change root, Git objects/references (including unreachable objects), reflog, stash, worktrees, and every explicitly authorized external source. Each source records metadata recovery and source-tree recovery separately: the existing valid JSON can coexist with an irrecoverable source tree. Only complete negative source-tree recovery supports terminalization; metadata-only recovery is never equivalent to recovering source bytes.

Outcomes distinguish `unavailable`, `metadata-only`, `recovered`, `unknown`, and `not-applicable`. A not-applicable result requires verified applicability evidence; omitted, unattempted, truncated, failed, or timed-out probes are `unknown`. Scope limits must exhaust the declared inventory rather than silently exclude candidates. Digest-addressed probe evidence is reread and validated, not accepted as inline assertions. A matching recoverable tree blocks terminalization and returns the existing recovery path. External probes require supplied authorization; no network search is implied.

Extend the candidate store with `persistCandidateSnapshot` / `recoverCandidateSnapshot`. An additive snapshot reference binds canonical Candidate bytes and `content_digest` to both base and candidate source trees. In Git repositories validate actual tree OIDs, reachable contents and object types, and recompute the Candidate tree digests and diff from those contents; never strip `sha256:` and treat the result as an OID. Preserve referenced objects with recoverable immutable material. Without Git, persist complete canonical manifests and file blobs, including paths, types, modes and symlink contents; reject incomplete or escaping manifests. Derive digests from the same material during capture and validation. Capture B through `freezeCandidate` using this evidence; leave its Candidate predecessor relation absent. No canonical identity schema changes are needed.

Add `terminalizeIrrecoverableLineage(state, {auditRef, changeRoot})` and `startRecoverySuccessor(predecessor, {candidateRef, snapshotRef, changeRoot, mode})` to `verify-lineage.js`. Both resolve applicable approval references from the actual ledger. The first returns a cloned predecessor with only audit/approval references and terminal fields added or updated. Preserve all original fields, unknown historical extensions, findings, recipes, paths, counters, and late observations. Terminal reason is `candidate-recovery-irrecoverable`.

The second requires that terminal reason, valid audit, and fully rehydrated B. Clone findings literally, inherit counters/limits and observations, increment generation, link the predecessor lineage ID, and set both Candidate IDs to B. Compute a distinct lineage ID using the existing lineage digest inputs. Start `recheck-pending` without calling `startVerifyLineage`, which resets counters. Recompute the successor contract digest from finalized current proposal/spec/design/tasks bytes; retain A's original digest unchanged. The architecture approval authorizes this new contract boundary, not an assertion that the old and new digests match.

### Persistence and execution sequence

`scripts/lib/verify-lineage-recovery.js` owns a small persisted operation journal within the existing change root. `state.yaml` remains canonical workflow state; journal blobs are recovery evidence, not another authority store. A pending operation binds operation ID, input-state digest, expected output digest, audit/snapshot references, and operation type. Use no-clobber publication and readback patterns from the candidate store. The caller persists pending before side effects; concurrent or stale state fails its expected digest check.

```text
Caller -> journal: persist terminalization pending
Caller -> reducer: validate approvals + exhaustive audit
Caller -> state: persist terminal predecessor
Caller -> journal: persist snapshot/successor pending
Store  -> caller: publish and validate B + source trees
Caller -> state: append terminal predecessor to history; install successor
Verify -> journal: persist directed recheck pending
Runner -> evidence: execute frozen recipes; publish exact outcomes
Verify -> state: close B / remediation-pending / exhausted
```

Preserve the terminal predecessor in append-only `verify_lineage_history` when replacing the active pointer. Partial publication leaves inert blobs. Unknown writes or command outcomes select `reconciliation-required` through the operation record before ordinary drift/discovery routing. Reconciliation compares exact persisted input/output/evidence digests; it never reruns an uncertain command or allocates a successor. Replaying a completed operation returns its recorded result. Proven pre-dispatch operations may continue once; ambiguous dispatch stays blocked.

Add `runRecoverySuccessorRecheck` in `scripts/lib/verify-lineage-recheck.js`. Production runs only commands from the rehydrated frozen recipes, sequentially, with a persisted command-index record before each invocation and exit/output evidence afterward. Each recipe entry runs once per recheck, including repeated command strings in distinct findings. Caller `recheck_results` cannot authorize this path. Validate B, source snapshot and runtime-derived contract digest before execution and before consuming results; workspace drift prevents closure. Reuse outcome evaluation only after validated runner evidence. All pass closes B; failures preserve unresolved findings and choose remediation if `n < max`, otherwise exhaustion, without incrementing n. Unrelated observations remain non-blocking. Ordinary subsequent remediation retains mechanical delta enforcement.

### File allocation and focused TDD

| Files | Allocation |
|---|---|
| `scripts/lib/verify-lineage.js`, corresponding test | Terminal/successor APIs, preservation and routing guards |
| `scripts/lib/verify-lineage-candidate-store.js`, corresponding test | Snapshot capture/rehydration and exact tree binding |
| New `scripts/lib/verify-lineage-recovery.js`, corresponding test | Exhaustive audit, journal, restart/reconciliation |
| New `scripts/lib/verify-lineage-recheck.js`, corresponding test | Persisted recipe execution and validated outcomes |
| `skills/sdd-verify/SKILL.md`, `skills/sdd-apply/SKILL.md` | Minimal routing instructions for this explicit recovery branch |

REQ-013 scenario 1: reducer test deep-compares predecessor protected fields; scenario 2: table tests missing approval, omitted source, unknown result and tampered evidence with zero mutations/attempts. REQ-014 scenario 1: temporary real Git repository plus separate-process restart proves linked B closure and one invocation per recipe entry. Scenario 2: reject mismatched JSON, unresolvable OIDs, swapped trees, incomplete non-Git snapshots, stale contract and source drift. Scenario 3: failing command tests for n below/at the limit prove inherited counters and unresolved outcomes. Inject failures before/after publication and command dispatch to prove exact reconciliation and no replay. Keep fabricated digests only in negative tests.

Focused TDD: record these failing behavioral tests, implement the smallest transitions, then run the four focal Node test files and `npm test`. These are planned checks, not executed design evidence. No Go production changes are allocated. Finalize tasks before capturing B because task bytes affect its successor contract. Deploy recovery support first, then collect fresh audit and perform the transitions; this design does not itself terminalize A. Rollback before transition leaves existing state untouched; after transition preserve history and block on unsupported additive recovery fields rather than reopening A.

## Inconclusive Directed-Operation Successor Extension

This additive allocation covers all nine scenarios in REQ-verify-lineage-015–018. The persisted `successor-reconciliation` approval authorizes this distinct exception. Earlier decisions remain historical and operative for their original scopes. Here, terminal disposition applies to operations; the affected lineage itself remains literally unchanged, including its status and prior contract digest.

### Decision: Separate immutable disposition from pending records and successor authority

| Option | Tradeoff | Decision |
|---|---|---|
| Append terminal dispositions and an audited successor transition | Additional immutable references and restart validation | Chosen; preserves uncertain execution evidence |
| Rewrite pending as completed or restart its command | Smaller mutation; invents evidence or duplicates execution | Rejected |
| Reuse Candidate-irrecoverable terminalization | Reuses an API; asserts the wrong failure and mutates the predecessor | Rejected |

See ADR-004. `persistRecoveryOperation` already publishes pending records without clobbering; `completeDirectedRecheckOperation` publishes separate completions. Neither represents `non-reconcilable`. `runRecoverySuccessorRecheck` now normalizes durable results but blocks existing pending records. `startRecoverySuccessor` requires Candidate irrecoverability, so add a separate `startReconciliationSuccessor` boundary instead of weakening that precondition.

### Evidence and transition contracts

In `verify-lineage-recovery.js`, add preservation and validation helpers for an immutable operation disposition: `status: non-reconcilable`, `preserved: true`, operation ID/reference/digests, predecessor lineage digest, reason code, and inspection evidence. Reasons distinguish completion absent, unreadable, digest mismatch and ambiguous completion. A deterministic per-operation disposition path uses no-clobber publication and exact readback: retries return the existing identical disposition; conflicts fail closed. Original pending and completion files are never edited, deleted or replaced. A later completion cannot supersede this disposition.

Publish a separate digest-addressed reconciliation audit binding the exact predecessor representation, Candidate reference, complete frozen recipe inventory, each affected operation/disposition reference, inspection outcomes and applicable approval IDs. Validate every referenced byte and its identity. The operation inventory derives from frozen finding ID plus recipe ordinal, including duplicate command strings; caller omissions cannot make it complete. Valid completions use ordinary reconciliation; an inconclusive disposition never manufactures an exit code. Old unreadable/tampered evidence is recorded as such, while unreadable/tampered audit or disposition prevents successor creation. No inline results, narrative claims or caller booleans authorize promotion.

`startReconciliationSuccessor` validates this audit and the actual persisted `successor-reconciliation` approval (including decision, source and applicability), rather than accepting any nonempty gate via `requiredApproval`. It preserves the predecessor's exact stored representation in immutable evidence and appends its reference/history entry without rewriting previous history. It clones every finding, recipe, allowed path, observation, attempt counter, limit and additional budget field. Only the new object's identity, Candidate/contract references, status and recovery metadata change: distinct `lineage_id`, generation + 1, exact `predecessor_id`, `recheck-pending`, no verified Candidate. Do not call `startVerifyLineage` or increment an attempt. Keep inherited observations identical; attach predecessor-journal references separately as non-blocking history.

Reuse `captureCandidateSnapshot` / `recoverCandidateSnapshot` in the candidate store. Reuse B only when exact canonical bytes, complete snapshot material and current source projection validate; otherwise capture C after implementation and finalized tasks. Recompute tree/diff bindings from material, validate referenced file objects and compare the live execution tree, not merely copied digest labels. No fabricated Candidate predecessor or B/C equivalence. Compute the successor contract from finalized artifacts and preserve the old digest in recovery metadata.

A fresh journal manifest binds successor ID, Candidate, snapshot, contract and every frozen recipe identity. Files remain direct children of the trusted change root; a new namespace does not require a new directory. Operations bind this manifest and finding/recipe ordinal, producing distinct operation IDs even for identical commands. Completion resolution follows the active manifest's references: scanning unrelated old result files must not make their corruption block a successor. Preserve and expose those old results only as late, non-blocking evidence.

### Recovery and execution sequence

```text
Recovery -> old journal: inspect exact pending/completion evidence; execute nothing
Recovery -> evidence: publish/read back one disposition per inconclusive operation
Recovery -> audit: publish/read back complete inventory and approval bindings
Store    -> recovery: validate B or capture/revalidate C and finalized contract
Recovery -> journal: persist successor transition intent with expected state digests
Reducer  -> caller: unchanged predecessor + deterministic proposed successor
Caller   -> state: append predecessor/history and install successor atomically
Runner   -> new journal: publish manifest and pending before each fresh invocation
Runner   -> completion: publish, reread and validate exact exit/output
Runner   -> reducer: revalidate live Candidate/contract; consume durable coverage
```

The state adapter checks expected input digest and commits history plus active pointer together. Crash recovery compares exact expected output; it never allocates another generation. Inert publication cannot authorize commands. Existing pending/unknown/completed operations never execute again; only the invocation that freshly created an operation may dispatch it once. Publication/dispatch uncertainty returns reconciliation without replay. A failed evaluation retains valid completions for consumption after restart. Adopt the candidate store's file flush/no-clobber/readback discipline for completion publication.

### Allocation and verification

| Requirement / scenarios | Files and observable verification |
|---|---|
| 015 / both | `verify-lineage-recovery.js` and test: six pending operations yield six dispositions, zero invocations/promotions; repeat/crash preserves byte equality; absent, unreadable, altered and ambiguous completions cannot evaluate |
| 016 / both | `verify-lineage.js` and test, recovery test: reject missing/altered audit or approval before identity/journal allocation; exact predecessor/history preservation, generation/link and inherited budget; concurrent/stale transition cannot install twice |
| 017 / both | `verify-lineage-recheck.js` and test: observe completion readback before evaluation; interrupt after dispatch/publication/evaluation; restart invokes zero existing operations; late predecessor evidence cannot satisfy or block new coverage |
| 018 / all three | Recheck and lineage tests: exact finding/ordinal coverage, duplicate commands separate, missing/invalid/external results unsatisfactory, partial success retained; all-pass closes expected Candidate, otherwise unresolved findings and inherited n/limit choose remediation or exhaustion |
| Snapshot prerequisite | `verify-lineage-candidate-store.js` and test: temporary real Git trees, missing file objects, swapped binding and live source drift; B reuse or C capture verifies actual execution source |

The runner validates coverage against all expected frozen recipes before reduction; an empty or partial supplied entry list cannot pass vacuously. Preserve valid partial evidence without closing missing findings. `evaluateRecheck` recovery calls must resolve durable coverage rather than accept a forged result map; use the inherited `max_remediation_attempts` instead of its current module constant. Uncertain execution remains blocked for reconciliation even when a partial failed reduction exists; budget routing never authorizes replay.

Update only minimal recovery routing in `skills/sdd-verify/SKILL.md` and `skills/sdd-apply/SKILL.md`: unresolved journal/disposition takes precedence over generic contract-drift discovery. Plan RED/GREEN boundary tests in the four focal Node test files, then the required suite. No tests or runtime transitions occur in this design phase. Roll out support before collecting the audit; rollback preserves dispositions/history and blocks unsupported successors. No blocking design questions remain.
