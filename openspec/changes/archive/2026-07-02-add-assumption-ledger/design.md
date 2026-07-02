# Design: Assumption Ledger + Materiality Criterion

## Technical Approach

Prompt/contract-markdown change only — no runtime JS behavior changes. Author the `assumptions[]` envelope field and the Materiality Decision Rule ONCE in `skills/_shared/sdd-phase-common.md` §D, which every phase agent already loads (their `## Result Contract` sections point there), so zero per-phase-agent edits are needed for capture. Add an **Assumption Ledger Protocol** block to `agents/sdd-orchestrator.agent.md` directly after the existing Approval Ledger Protocol (line ~148), mirroring its shape. Extend `skills/sdd-verify/SKILL.md` with a reconciliation pre-flight step that uses the existing `question_gate` blocked-return machinery as the checklist channel. Pin all new prose contracts with a contract test (`federation-baseline-contract.test.js` pattern), then regenerate the four dist targets.

Design mode: `design-after-spec` — both change-local specs read; every MUST scenario allocated below.

## Architecture Decisions

### Decision: Single authoring point for capture (shared protocol §D)

**Choice**: `assumptions` field schema + materiality rule live only in `sdd-phase-common.md` §D; no per-agent pointer edits at all.
**Alternatives considered**: (a) duplicate the rule in each of the 15+ phase agent wrappers; (b) add a pointer line per wrapper.
**Rationale**: every wrapper's Result Contract already says "See sdd-phase-common.md for the return envelope structure" — the new field flows automatically. (a) creates drift risk and token bloat; (b) is redundant with the existing pointer. Matches the proposal's "single shared-protocol edit" mitigation.

### Decision: `skills/sdd-orchestrator/SKILL.md` is generated, not a source mirror

**Choice**: edit only `agents/sdd-orchestrator.agent.md`; the claude-target `skills/sdd-orchestrator/SKILL.md` is produced by `scripts/lib/target-transform.js` (verified: `target-transform.test.js:291`, `cli.test.js:49`).
**Alternatives considered**: creating a source `skills/sdd-orchestrator/SKILL.md` as the proposal's Affected Areas table implied.
**Rationale**: no such source file exists in the repo; creating one would duplicate the canonical agent file and fight the generator. This corrects a proposal assumption without changing scope — dist regeneration still flows the edit to all four targets.

### Decision: Verify checklist via blocked-first pre-flight `question_gate`

**Choice**: `sdd-verify` gains **Step 2a (Assumption Reconciliation Pre-flight)**, right after artifact retrieval and BEFORE tests/build: read `state.yaml assumptions:`; if unresolved entries exist and the launch prompt contains no `assumption_resolutions` block, return `status: blocked` with a checklist `question_gate` immediately. The orchestrator relays via AskUserQuestion and relaunches verify with the resolutions; verify applies them to `state.yaml` (sets `status` + `resolution` per entry), then runs the normal pass. Leftover unresolved `reversibility: low` entries become WARNING findings (existing Step 10b known-issues contract applies unchanged).

| Option | Tradeoff | Verdict |
|---|---|---|
| (A) Pre-flight blocked return, resolutions in relaunch prompt | Verify launched twice when assumptions exist, but first launch is cheap (no tests run yet); verify owns presentation AND resolution writes per the agents delta | **Chosen** |
| (B) Full pass first, checklist returned post-report for orchestrator to persist | Violates spec scenario "sdd-verify sets `status: confirmed`"; WARNING findings would need report rewrite after resolution; duplicates write logic in orchestrator | Rejected |
| (C) Orchestrator asks before launching verify | Moves the "presenting" duty off `sdd-verify`, contradicting the agents delta allocation; grows orchestrator prompt | Rejected |

**Rationale**: (A) is the only option where a sub-agent (which cannot talk to the user mid-run) both presents the checklist and records resolutions, satisfying all four reconciliation scenarios, while never re-running expensive checks.

### Decision: Checklist scalability — group by reversibility, bulk-confirm for `high`

**Choice**: the `question_gate` lists `reversibility: low` entries as individual questions (options: `Confirm` / `Correct` (freeform note) / `Promote to clarification` / `Leave unresolved`); `reversibility: high` entries are one `multiSelect` question ("confirm all selected; unselected stay unresolved with no escalation").
**Alternatives considered**: one question per entry regardless of reversibility.
**Rationale**: keeps the gate usable when many non-material entries accumulate (proposal risk "checklist unwieldy"); only material entries deserve per-entry attention.

### Decision: Orchestrator renumbering mechanics (bound by clarify — mechanics only)

**Choice**: at persist time, if incoming `id` collides with an existing `assumptions:` entry, the orchestrator reassigns `seq` to `max(existing seq for that phase) + 1`, zero-padded to 3 digits. `recorded_at` and `status: unresolved` are stamped by the orchestrator, not the phase agent.
**Rationale**: implements the binding clarify decision (`clarify-id-uniqueness-001`) with a deterministic rule; phase agents stay stateless across batches.

## Data Flow

Capture + persistence (every phase return):

    Phase agent                Orchestrator                 state.yaml
        │  envelope with            │                            │
        │  assumptions[] (local seq)│                            │
        ├───────────────────────────►                            │
        │                           │ read-merge-update          │
        │                           │ renumber on collision,     │
        │                           │ stamp recorded_at +        │
        │                           │ status: unresolved         │
        │                           ├────────────────────────────►
        │                           │ then dispatch next phase   │

Verify reconciliation (blocked-first):

    Orchestrator          sdd-verify (run 1)        User (AskUserQuestion)
        │ launch                │                          │
        ├────────────────────────►                         │
        │                        │ Step 2a: unresolved     │
        │  blocked + question_gate  entries found          │
        ◄────────────────────────┤                         │
        ├──────────────────────────────────────────────────►
        │              answers (confirm/correct/promote/skip)
        ◄──────────────────────────────────────────────────┤
        │ relaunch + assumption_resolutions                │
        ├────────────► sdd-verify (run 2)
        │                 │ apply resolutions → state.yaml
        │                 │ run tests/build (Steps 3-9)
        │                 │ unresolved low → WARNING finding
        │                 │ → verify-report.md + known-issues.md (Step 10b)

## Spec Traceability (MUST → allocation)

| Requirement / scenario | Allocation |
|---|---|
| Assumption Entry Schema (complete/incomplete) | §D schema table + "MUST NOT include incomplete entries" rule in `sdd-phase-common.md` |
| Materiality Decision Rule (3 scenarios) | New "Assumption Materiality Rule" subsection in §D, placed after Blocking Question Envelope |
| State Ledger Persistence Shape (append, no-op on empty) | Assumption Ledger Protocol block in `sdd-orchestrator.agent.md` (yaml shape verbatim from spec) |
| Envelope optional field / omitted field | §D envelope field list gains `assumptions` (OPTIONAL) |
| Orchestrator persists on every return / never fabricates | Protocol text: "fires on every phase return, independent of route or gate configuration; only explicitly returned entries are persisted" |
| Verify reconciliation duty (4 scenarios) | `skills/sdd-verify/SKILL.md` Step 2a + Decision Gates rows + report section; empty/absent `assumptions:` → Step 2a is a no-op |
| Promote = signaling only | Step 2a text: sets `status: promoted` only; MUST NOT auto-invoke `sdd-clarify` |

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `skills/_shared/sdd-phase-common.md` | Modify | §D: `assumptions` envelope field, entry schema table, local-seq note, Materiality Rule subsection |
| `agents/sdd-orchestrator.agent.md` | Modify | New `### Assumption Ledger Protocol` after Approval Ledger Protocol |
| `skills/sdd-verify/SKILL.md` | Modify | Step 2a pre-flight; 2 Decision Gates rows (unresolved-low → WARNING; unresolved-high → never escalates); Output Contract gains `## Assumption Reconciliation` |
| `skills/sdd-verify/references/report-format.md` | Modify | Add Assumption Reconciliation section (table: id, statement, reversibility, outcome) to report template |
| `agents/sdd-verify.agent.md` | Modify | Amend "Write only verify-report.md" to also permit `state.yaml` assumption-resolution updates per shared persistence contract |
| `scripts/assumption-ledger-contract.test.js` | Create | Prose-invariant contract tests + self-generated dist parity |
| `dist/**` (all 4 targets) | Regenerate | `npm run build:claude` / `build:vscode` / `build:copilot` / `build:opencode` |

## Interfaces / Contracts

Entry schema and `state.yaml` ledger shape: use verbatim from `specs/assumption-ledger/spec.md` (do not restate here). New launch-prompt contract for verify relaunch:

```yaml
# passed by orchestrator in the sdd-verify relaunch prompt
assumption_resolutions:
  - id: sdd-design-001
    action: confirm | correct | promote-to-clarification | leave-unresolved
    note: "required when action: correct"
```

## Testing Strategy

Strict TDD is active; runner: `npm test` (`node scripts/check.js` → `node --test scripts/**/*.test.js` + target validation). Since the change is prose contracts, RED tests are prose-invariant assertions written first, failing against the unedited canonical files (pattern: `scripts/federation-baseline-contract.test.js`).

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Contract (unit) | §D contains `assumptions` field + all 5 schema fields + materiality keywords ("observable behavior", "public contract", `question_gate`, `reversibility`) | `assumption-ledger-contract.test.js` reads `sdd-phase-common.md`, regex/includes assertions |
| Contract (unit) | Orchestrator file has `Assumption Ledger Protocol` heading, `assumptions:` shape, renumber-on-collision rule, "MUST NOT infer" | Same file, reads `sdd-orchestrator.agent.md` |
| Contract (unit) | Verify skill has Step 2a, three actions + leave-unresolved, WARNING-for-low rule, no-escalation-for-high, no auto-invoke of `sdd-clarify` | Same file, reads `skills/sdd-verify/SKILL.md` |
| Integration (dist parity) | Generated claude `skills/sdd-orchestrator/SKILL.md` and vscode `agents/sdd-orchestrator.agent.md` contain the protocol | Self-generate into a temp dir via `scripts/lib/target-transform.js` / CLI — NEVER read gitignored `ROOT/dist` (established project convention) |
| E2E | Existing `configure/e2e.test.js`, `real-repo.test.js` keep passing | Regression via `npm test` |

## Migration / Rollout

No migration. `assumptions:` in `state.yaml` is purely additive; older prompts ignore unknown top-level keys. Rollback = revert the five markdown edits + delete the test file + regenerate dist.

## Open Questions

None — the three material ambiguities (materiality policy, promote semantics, id ownership) were resolved at the clarify gate and are encoded in the specs.
