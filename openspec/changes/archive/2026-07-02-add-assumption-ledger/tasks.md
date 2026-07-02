# Tasks: Assumption Ledger + Materiality Criterion

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| Assumption Entry Schema: complete entry recorded | MUST | `skills/_shared/sdd-phase-common.md` §D schema table | covered-by-design | 5-field table |
| Assumption Entry Schema: incomplete entry rejected | MUST | §D "MUST NOT include incomplete entries" rule | covered-by-design | |
| Materiality Rule: observable-behavior decision blocks | MUST | §D new "Assumption Materiality Rule" subsection | covered-by-design | after Blocking Question Envelope |
| Materiality Rule: internal reversible decision assumed | MUST | same subsection | covered-by-design | |
| Materiality Rule: internal costly-to-reverse decision flagged material | MUST | same subsection | covered-by-design | |
| State Ledger: append without disturbing prior entries | MUST | `agents/sdd-orchestrator.agent.md` Assumption Ledger Protocol | covered-by-design | mirrors Approval Ledger Protocol |
| State Ledger: no assumptions returned → ledger untouched | MUST | same protocol block | covered-by-design | |
| Verify Checklist: material unresolved → WARNING finding | MUST | `skills/sdd-verify/SKILL.md` Step 2a + `references/report-format.md` | covered-by-design | reuses known-issues.md contract |
| Verify Checklist: confirmed → status updated, no finding | MUST | same | covered-by-design | |
| Verify Checklist: non-material unresolved → no escalation | MUST | same | covered-by-design | |
| Envelope: assumptions field present | MUST | §D envelope field list | covered-by-design | |
| Envelope: assumptions omitted when none | MUST | §D envelope field list | covered-by-design | |
| Orchestrator: persists on every phase return | MUST | Assumption Ledger Protocol block | covered-by-design | fires independent of route |
| Orchestrator: does not fabricate assumptions | MUST | same block | covered-by-design | |
| sdd-verify: reconciliation runs as part of standard pass | MUST | SKILL.md Step 2a (pre-flight, blocked-first) | covered-by-design | |
| sdd-verify: no assumptions → verify unaffected | MUST | Step 2a no-op branch | covered-by-design | |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (materiality policy, promote semantics, id ownership were resolved at the clarify gate: `clarify-materiality-001`, `clarify-promote-001`, `clarify-id-uniqueness-001` in `state.yaml`)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~300–420 (5 prose edits ~40+40+45+15+5 lines + 1 new contract test file ~150–200 lines; `dist/**` is gitignored/generated, not part of the diff) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | single PR (`size:exception`), internally ordered as Work Units 1–4 below |
| Delivery strategy | exception-ok (cached, `state.yaml` approval `delivery-strategy-001`) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | §D shared-protocol edit: `assumptions[]` field + Materiality Rule | Single PR (`size:exception`) | Foundation — everything else depends on this |
| 2 | Orchestrator Assumption Ledger Protocol | Same PR | Depends on Unit 1's schema |
| 3 | `sdd-verify` reconciliation (SKILL.md, report-format.md, agent write-scope) | Same PR | Depends on Unit 1's schema |
| 4 | Contract tests + `dist/**` regeneration | Same PR | Verifies Units 1–3; regenerated dist is gitignored, no reviewer diff |

## Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Shared Protocol Foundation

- [x] 1.1 RED: add failing assertions to new `scripts/assumption-ledger-contract.test.js` that read `skills/_shared/sdd-phase-common.md` and assert it contains: an `assumptions` OPTIONAL field in the §D envelope field list, a 5-column Assumption Entry Schema table (`id`, `phase`, `statement`, `reversibility`, `basis`), and the materiality keywords `"observable behavior"`, `"public contract"`, `reversibility`, `question_gate`.
- [x] 1.2 GREEN: edit `skills/_shared/sdd-phase-common.md` §D — add `assumptions` to the envelope field bullet list (OPTIONAL, list of entries per Assumption Entry Schema), add the schema table, and add a new "Assumption Materiality Rule" subsection right after the Blocking Question Envelope section, encoding the two-branch rule (observable/public-contract → block with `question_gate`; internal → assume + record `assumptions[]` with honest `reversibility`).
- [x] 1.3 Run `node --test scripts/assumption-ledger-contract.test.js` and confirm the Phase 1 assertions now pass.

## Phase 2: Orchestrator Assumption Ledger Protocol

- [x] 2.1 RED: add failing assertions asserting `agents/sdd-orchestrator.agent.md` contains an `### Assumption Ledger Protocol` heading, the `assumptions:` YAML shape (mirroring `approvals:`), and the renumber-on-collision rule text ("MUST NOT infer assumption entries from conversation memory").
- [x] 2.2 GREEN: add `### Assumption Ledger Protocol` to `agents/sdd-orchestrator.agent.md` directly after the existing Approval Ledger Protocol block (~line 148), documenting: read-merge-update into `state.yaml assumptions:` on every non-empty `assumptions` return, orchestrator-owned `seq` renumbering on `id` collision (`max(existing seq for phase) + 1`, zero-padded to 3 digits), `recorded_at`/`status: unresolved` stamped by the orchestrator, and "fires on every phase return, independent of route or gate configuration."
- [x] 2.3 Run the contract test file and confirm the Phase 2 assertions pass.

## Phase 3: sdd-verify Reconciliation

- [x] 3.1 RED: add failing assertions that `skills/sdd-verify/SKILL.md` contains a "Step 2a" pre-flight step, the three actions (`confirm`, `correct`, `promote-to-clarification`) plus `leave-unresolved`, the WARNING-for-`reversibility: low` rule, the no-escalation-for-`reversibility: high` rule, and "MUST NOT auto-invoke `sdd-clarify`".
- [x] 3.2 GREEN: insert `### Step 2a: Assumption Reconciliation Pre-flight` into `skills/sdd-verify/SKILL.md` Execution Steps, right after artifact retrieval (Step 2) and before Step 3 (testing/TDD resolution): read `state.yaml assumptions:`; if unresolved entries exist and no `assumption_resolutions` block was passed in the launch prompt, return `status: blocked` with a checklist `question_gate` (grouped by `reversibility`: `low` entries individually, `high` entries as one `multiSelect`); on relaunch with `assumption_resolutions`, apply them to `state.yaml` (`status` + `resolution`) before continuing to Step 3.
- [x] 3.3 GREEN: add two rows to the `skills/sdd-verify/SKILL.md` Decision Gates table — "unresolved `reversibility: low` entry after checklist" → WARNING finding; "unresolved `reversibility: high` entry" → no escalation.
- [x] 3.4 GREEN: extend the Output Contract section of `skills/sdd-verify/SKILL.md` to mention the `## Assumption Reconciliation` report section.
- [x] 3.5 RED: add a failing assertion that `skills/sdd-verify/references/report-format.md` contains an `### Assumption Reconciliation` section with a table of `id`, `statement`, `reversibility`, `outcome`.
- [x] 3.6 GREEN: add the `### Assumption Reconciliation` section (table template) to `skills/sdd-verify/references/report-format.md`, placed after the `### Issues Found` section and before `### Verdict`.
- [x] 3.7 RED: add a failing assertion that `agents/sdd-verify.agent.md` "Required artifacts" section permits `state.yaml` assumption-resolution writes, not only `verify-report.md`.
- [x] 3.8 GREEN: amend `agents/sdd-verify.agent.md` line "Write only `openspec/changes/{change-name}/verify-report.md`" to also permit `state.yaml` assumption-resolution updates per the shared persistence contract (Section C).
- [x] 3.9 Run the full contract test file and confirm all Phase 3 assertions pass.

## Phase 4: Cross-Target Regeneration and Integration

- [x] 4.1 RED: add an integration assertion (self-generated, temp-dir pattern per `dist-tests-must-self-generate` convention) that generating the vscode target from `agents/sdd-orchestrator.agent.md` and `agents/sdd-verify.agent.md` via `scripts/lib/target-transform.js` produces output containing the Assumption Ledger Protocol and Step 2a text.
- [x] 4.2 RED: add the equivalent self-generated assertion for the claude target (`skills/sdd-verify/SKILL.md` is already a source file for claude; assert the generated claude orchestrator/verify agent wrapper carries the pointer to `sdd-phase-common.md` §D unchanged).
- [x] 4.3 GREEN: run `npm run build:claude`, `build:vscode`, `build:copilot`, `build:opencode` locally to regenerate `dist/**` (gitignored; not part of the review diff) and confirm no generator errors.
- [x] 4.4 Run `npm test` (`node scripts/check.js`) end-to-end and confirm existing suites (`configure/e2e.test.js`, `real-repo.test.js`, `federation-baseline-contract.test.js`) still pass with no regressions.

## Phase 5: Cleanup / Documentation

- [x] 5.1 Verify `## Cross-References` sections in `openspec/changes/add-assumption-ledger/specs/assumption-ledger/spec.md` and `specs/agents/spec.md` resolve to the actual edited file paths (no stale pointers).
- [x] 5.2 Confirm the proposal's Success Criteria checklist items are all satisfiable by the completed tasks (no unchecked criterion left unmapped).
