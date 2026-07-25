# Tasks: Strict TDD Evidence Remediation Fast Path (verification remediation)

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-agents-012 equivalent gap and focal continuation | MUST | Pure reducer, evidence-only write, orchestrator focal dispatch | covered-by-design | Corrective tasks 1.6, 1.8, 1.10, 2.9–2.10, 4.7. |
| REQ-agents-012 missing/fabricated evidence | MUST | Provenance validator and CRITICAL ordinary fallback | covered-by-design | Corrective tasks 1.3, 1.8, 2.5, 2.9, 4.4. |
| REQ-agents-012 functional delta, identity drift, focal failure | MUST | Immutable snapshot, allowlist, one-shot reducer | covered-by-design | Corrective tasks 1.4, 1.8, 1.10–1.11, 2.5, 2.7, 2.9–2.10, 4.7. |
| REQ-routing-006 deterministic classification and origin preservation | MUST | Canonical normalization and ordinary origin-priority route | covered-by-design | Corrective tasks 1.4, 1.6, 1.8, 1.10–1.11, 2.6, 2.9–2.10, 4.4, 4.7. |
| REQ-routing-006 cost, write-set, mutation and parity guards | MUST | Configured cap, reducer counters, five-target generated tests | covered-by-design | Corrective tasks 1.3–1.5, 1.8, 1.11, 2.5, 2.9, 4.2, 4.7. |
| REQ-skills-008 structured evidence, immutable fields and bounded recheck | MUST | JSON authority, derived table, apply/verify contracts | covered-by-design | Corrective tasks 1.7, 1.9–1.11, 2.5, 2.7, 2.9–2.10, 4.5, 4.8, 5.5. |
| REQ-generator-005 exact SDD tier policy | MUST | `models.yaml`, `validateSddModelPolicy()`, duplicate-aware `parseModels()` | covered-by-design | Tasks 6.2–6.5, 7.1–7.3 and 8.1–8.4 pin the exact 5/6/6 roster and reject stale, duplicate, incomplete, or wrong policy. |
| REQ-generator-005 five-target model parity | MUST | `resolveModel()`, target transform, temporary `runConfigure()` outputs | covered-by-design | Tasks 6.4–6.5, 7.3–7.5 and 8.2–8.4 cover model-capable targets, Codex pairs, and fail-soft omission. |
| REQ-sdd-document-001 cheap tier and unchanged route/tools | MUST | `models.yaml` plus focused `scripts/sdd-document.test.js` contract | covered-by-design | Task 6.1 preserves captured RED; tasks 7.4 and 8.1 update cheap-tier expectations without weakening route/tools checks. |

### Reconciliation Verdict

- MUST coverage: complete after the corrective tasks below.
- SHOULD/MAY gaps: none.
- Ambiguities to track: none; O6A, archive finalization, reviewers, and adaptive routing remain out of scope.

## Verification Remediation Input

The 38 O4.2 remediation tasks are preserved as verified. The approved tier-migration expansion adds only tasks 6.1–9.2. The current `scripts/sdd-document.test.js` default-vs-cheap failure is accepted as captured RED for `REQ-sdd-document-001`; it must turn GREEN by updating the migrated contract, not by restoring the old tier.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,350–1,800 total change (existing O4.2 plus tier parser/validator, five-target policy tests, integrations, and final evidence) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Verified O4.2 core → tier policy/parser → five-target integration → documentation and final evidence |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Maintainer-approved `size-exception` permits one delivery; retain four work-unit boundaries for review and rollback.

## Suggested Work Units

| Unit | Goal | Likely PR | Verification |
|---|---|---|---|
| 1 | RED boundary matrix, provenance/identity reducer hardening, configured cap | PR 1 (size exception) | Focused remediation test file. |
| 2 | Orchestrator focal routing and ordinary fallback semantics | PR 1 | Agent contract/integration assertions and state transition probes. |
| 3 | Five-target in-memory parity mutants, TDD evidence regeneration, full regression | PR 1 | `npm test`, digest check, per-task evidence table. |
| 4 | Exact tier policy, duplicate-safe parser, target parity, and cheap `sdd-document` migration | PR 1 | Focused tier tests, temporary five-target generation, no `dist/**` writes. |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Partially implemented or not independently verified
- `[x]` Implemented and independently evidenced by verification

## Phase 1: RED — Corrective Boundary Tests

- [x] 1.1 Expand `scripts/strict-tdd-evidence-remediation.test.js` from four narrow cases to table-driven cases for equivalent rendering drift, functional/task/spec/test origins, missing/fabricated provenance, identity drift, unauthorized/empty write sets, configured/absent/invalid caps, repeated rechecks, and focal failure [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 1.2 Replace the conditional check in `scripts/strict-tdd-evidence-parity.test.js` with a failing in-memory `loadTree` + `transform` probe that asserts all five target outputs and non-empty helper content [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 1.3 Add RED fixtures that create real temporary test files, verify SHA-256/provenance and cycle enums, reject invented paths/commits/digests, reject absent or invalid cap configuration, and reject empty evidence write sets in `scripts/strict-tdd-evidence-remediation.test.js` [REQ-routing-006, REQ-skills-008]
- [x] 1.4 Add RED reducer tamper cases for candidate ID, genesis paths, original finding, budget, section digest, write set, and ordinary origin preservation; include stable REQ IDs in test names [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 1.5 Add RED parity mutants for allowlist, reason code, origin, identity, changed-line cap, and one-recheck cap across Claude, VS Code, GitHub Copilot, OpenCode, and Codex in `scripts/strict-tdd-evidence-parity.test.js` [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 1.6 Add RED orchestrator contract/integration tests that require `evidence-format-gap`, persisted remediation state, `run-focal-recheck`, `next_action`, one-shot dispatch, and ordinary fallback in `agents/sdd-orchestrator.agent.md` and related scripts [REQ-agents-012, REQ-routing-006]
- [x] 1.7 Add RED Strict TDD evidence-conformance fixtures for every coding task, requiring exact helper/config/agent/skill/rule digests, per-task test files, `✅ Written`/`✅ Passed` markers, provenance, and complete functional projection in `openspec/changes/strict-tdd-evidence-remediation-fast-path/apply-progress.md` [REQ-skills-008, REQ-agents-012]
- [x] 1.8 Add RED event tests that call classify, write, and focal actions with and without a real `rootDir`; omit or falsify candidate, finding, evidence, and file digests and assert CRITICAL `ordinary-routing` [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 1.9 Add RED finalization tests that validate the authoritative JSON with `rootDir`, recompute every per-task digest after the final changed-file set, render the Markdown table from that JSON, and reject stale digest/table mismatches [REQ-agents-012, REQ-skills-008]
- [x] 1.10 Add RED reducer/consumer tests requiring typed `next_action: run-focal-recheck`, persisted one-shot consumption, and frozen candidate/finding/evidence checks before resolution [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 1.11 Add RED executable mutation cases that alter or drop provenance, identity, finding, origin, cap, write-set, `next_action`, recheck result, and repetition guards; each mutation must fail closed through ordinary routing [REQ-agents-012, REQ-routing-006, REQ-skills-008]

## Phase 2: GREEN — Core and Orchestrator Remediation

- [x] 2.1 Harden schema-v1 parsing and normalization in `scripts/lib/strict-tdd-evidence-remediation.js` to validate cycle enums, task/test references, provenance, and deterministic reason/origin classifications [REQ-routing-006, REQ-skills-008]
- [x] 2.2 Harden functional snapshot hashing and evidence-section rendering/digest comparison; require before/after identity equality and reject any production/spec/test path in the exact allowlist [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 2.3 Harden reducer transitions with integrity tokens for frozen candidate/finding/budget, non-empty single-write enforcement, unknown-write artifact/digest reconciliation, and configured cap ≤40; absent/invalid cap must disable fast path [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 2.4 Preserve existing runtime-root/config wiring in `scripts/configure/cli.js` and `openspec/config.yaml` while exposing the corrected reducer contracts [REQ-routing-006, REQ-skills-008]
- [x] 2.5 Implement real provenance/digest checks and immutable-state validation in `scripts/lib/strict-tdd-evidence-remediation.js`; fabricated records, tampered state, empty writes, identity drift, or cap absence must return CRITICAL `ordinary-routing` [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 2.6 Implement deterministic JSON-authoritative/Markdown-derived rendering comparison and preserve the original finding/origin for every ordinary fallback [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 2.7 Implement exact unknown-write reconciliation and `run-focal-recheck` reducer validation of candidate, evidence, rendering, original finding, referenced tests, and recheck budget [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 2.8 Add semantic O4.2 behavior to `agents/sdd-orchestrator.agent.md`: persist state before write/dispatch, select focal verify once, consume `next_action`, and route failures by existing origin priority; normalize EOLs so the diff is reviewable [REQ-agents-012, REQ-routing-006]
- [x] 2.9 Make `rootDir` and real candidate/finding/evidence/file digests mandatory inputs at classification, evidence write, and focal-recheck transitions; fail closed when any event proof is absent or unverifiable [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 2.10 Emit typed executable `next_action: run-focal-recheck` from the reducer, persist it before dispatch, and consume it only after validating frozen candidate/finding/evidence identity with one-shot semantics [REQ-agents-012, REQ-routing-006, REQ-skills-008]

## Phase 3: GREEN — Contract Synchronization

- [x] 3.1 Keep `skills/sdd-apply/SKILL.md` and `skills/sdd-apply/strict-tdd.md` structured-record, allowlist, identity, provenance, and fallback requirements [REQ-agents-012, REQ-skills-008]
- [x] 3.2 Keep `skills/sdd-verify/SKILL.md` and `skills/sdd-verify/strict-tdd-verify.md` one-shot focal-mode and fail-closed requirements [REQ-agents-012, REQ-skills-008]
- [x] 3.3 Update `agents/sdd-apply.agent.md` and `agents/sdd-verify.agent.md` to consume the hardened reducer and orchestrator `next_action` contract without synthesizing evidence [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 3.4 Keep synchronized rules and init reference in `rules/sdd-strict-tdd.instructions.md`, `rules/sdd-common.instructions.md`, `rules/sdd-openspec.instructions.md`, and `skills/sdd-init/references/init-details.md` [REQ-routing-006, REQ-skills-008]

## Phase 4: TRIANGULATE — Runtime, Parity and Evidence Proof

- [x] 4.1 Re-run `scripts/strict-tdd-evidence-remediation.test.js` with the complete boundary matrix and assert exact state/reason/origin/CRITICAL outcomes [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 4.2 Re-run `scripts/strict-tdd-evidence-parity.test.js` against generated in-memory outputs, asserting all five targets and each isolated mutant fails the corresponding guard [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 4.3 Add runtime focal-recheck tests for pass, failed recheck, identity mismatch, referenced-test failure, second recheck, and ordinary routing; verify no full route redispatch [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 4.4 Execute focused tests and `npm test`; require every scenario in the three change-local specs to have a named test and no vacuous conditional assertions [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 4.5 Regenerate `apply-progress.md` structured JSON and Markdown table with one conformant cycle per coding task, exact current SHA-256 digests, complete functional projection, and `✅ Written`/`✅ Passed` evidence [REQ-skills-008, REQ-agents-012]
- [x] 4.6 Verify `agents/sdd-orchestrator.agent.md` has a semantic focal-routing diff and that generated target contracts retain it [REQ-agents-012, REQ-routing-006]
- [x] 4.7 Execute the isolated mutation harness from `scripts/strict-tdd-evidence-parity.test.js` against generated in-memory outputs and the reducer; prove tests fail when each provenance, identity, finding, origin, cap, write-set, `next_action`, recheck-result, or repetition guard is removed [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 4.8 After all implementation/tests/contracts are final, validate the authoritative evidence JSON with `rootDir`, recompute all per-task digests, render the Markdown table from the same JSON, and assert byte/field equivalence with no stale provenance [REQ-agents-012, REQ-skills-008]

## Phase 5: REFACTOR — Handoff Integrity

- [x] 5.1 Refactor deterministic rendering/reducer naming only after snapshots, reason codes, and identity tests pass [REQ-agents-012, REQ-skills-008]
- [x] 5.2 Preserve O6A/archive/reviewer/adaptive-routing exclusions and rollback scope across all changed paths [REQ-agents-012, REQ-routing-006]
- [x] 5.3 Replace generic grouped `PASS` claims with per-task TDD evidence and independently verified safety-net chronology in `openspec/changes/strict-tdd-evidence-remediation-fast-path/apply-progress.md` [REQ-skills-008]
- [x] 5.4 Perform final static scope/EOL review, confirm no production/spec/test write is possible through the fast path, and hand off to `sdd-verify` only after all corrective tasks are `[x]` [REQ-agents-012, REQ-routing-006, REQ-skills-008]
- [x] 5.5 Finalize the evidence artifact only once, freeze the final file/digest set, and fail the handoff if any later code/test/contract edit would make JSON provenance or its derived Markdown table stale [REQ-agents-012, REQ-skills-008]

## Phase 6: RED — Model-Tier Migration Contracts

- [x] 6.1 Preserve the current failing assertion in `scripts/sdd-document.test.js` as captured RED for the intentional `default`→`cheap` migration; retain the existing command-route and exact read/search/edit/execute tool assertions [REQ-sdd-document-001]
- [x] 6.2 Create `scripts/model-tier-contract.test.js` RED cases for the exact premium/default/cheap 5/6/6 SDD roster, the full intended agent mapping, unchanged six reviewers plus `_default`, and Codex Sol/medium, Terra/medium, and Luna/low pairs [REQ-generator-005]
- [x] 6.3 Add RED mutations in `scripts/model-tier-contract.test.js` and `scripts/configure/cli.test.js` for duplicate YAML agent keys, missing agents, duplicate tier membership, stale `sdd-propose`/`sdd-document` assignments, unknown tiers, incomplete mappings, and wrong Codex model/effort pairs [REQ-generator-005]
- [x] 6.4 Add RED temporary-generation cases in `scripts/model-tier-contract.test.js` for all five targets: complete tier-derived model fields where supported, exact Codex pairs, and GitHub Copilot/special-output fail-soft model omission without writing `dist/**` [REQ-generator-005]
- [x] 6.5 Add RED integration expectations to `scripts/lib/model-resolver.test.js`, `scripts/lib/target-transform.test.js`, `scripts/hooks/subagent-stop.test.js`, and `scripts/sdd-document.test.js` for moved proposal/document tiers, `OMIT`, telemetry parity, cheap generated output, and unchanged route/tools [REQ-generator-005, REQ-sdd-document-001]

## Phase 7: GREEN — Canonical Policy and Parser

- [x] 7.1 Complete `models.yaml` as the canonical exact 17-agent 5/6/6 policy, preserve reviewer and `_default` tiers, and correct comments to match Codex Sol/medium, Terra/medium, and Luna/low rather than stale Luna/default prose [REQ-generator-005, REQ-sdd-document-001]
- [x] 7.2 Extend `parseModels()` in `scripts/configure/cli.js` to reject duplicate YAML keys before overwrite while preserving minimal fixtures and unsupported-column fail-soft behavior [REQ-generator-005]
- [x] 7.3 Implement and export the pure exact-partition/Codex-contract validator beside `resolveModel()` in `scripts/lib/model-resolver.js`, with stable agent-specific errors and unchanged `OMIT` semantics [REQ-generator-005]
- [x] 7.4 Update `scripts/sdd-document.test.js` from the stale default expectation to cheap source/output assertions while preserving command routing and exact tools coverage [REQ-sdd-document-001, REQ-generator-005]
- [x] 7.5 Make the new RED expectations GREEN in `scripts/lib/model-resolver.test.js`, `scripts/configure/cli.test.js`, `scripts/lib/target-transform.test.js`, and `scripts/hooks/subagent-stop.test.js` using the canonical parser/validator and moved-tier telemetry [REQ-generator-005]

## Phase 8: TRIANGULATE — Resolver, Transform and Five-Target Parity

- [x] 8.1 Run focused `scripts/model-tier-contract.test.js`, `scripts/lib/model-resolver.test.js`, `scripts/configure/cli.test.js`, `scripts/lib/target-transform.test.js`, `scripts/hooks/subagent-stop.test.js`, and `scripts/sdd-document.test.js`; require the captured RED to turn GREEN without restoring the old tier [REQ-generator-005, REQ-sdd-document-001]
- [x] 8.2 Generate Claude, VS Code, GitHub Copilot, OpenCode, and Codex into temporary directories through `runConfigure()`; inspect the full 17-agent roster, exact supported model fields/Codex effort, fail-soft omissions, and assert no `dist/**` file changed [REQ-generator-005]
- [x] 8.3 Execute stale/duplicate/incomplete/wrong-tier and wrong-model/effort mutations through parser, validator, resolver, target transform, SubagentStop telemetry, and `sdd-document`; require deterministic contract failure before parity can pass [REQ-generator-005, REQ-sdd-document-001]
- [x] 8.4 Run the existing Strict TDD remediation focused suites and complete `npm test` after tier integration, preserving all 38 verified O4.2 tasks and confirming no review-agent/default or fail-soft regression [REQ-generator-005, REQ-agents-012, REQ-routing-006, REQ-skills-008]

## Phase 9: REFACTOR — Policy Documentation and Final Evidence

- [x] 9.1 Refactor shared policy constants/errors without duplicating the roster outside the validator, align `models.yaml` comments and ADR-003/design references, and keep target capability/fail-soft logic separate from tier policy [REQ-generator-005, REQ-sdd-document-001]
- [x] 9.2 After every model/parser/test/contract file is stable, append cycles 6.1–9.1 to `openspec/changes/strict-tdd-evidence-remediation-fast-path/apply-progress.md`, recompute all authoritative digests, render Markdown from the same JSON, and validate with `rootDir` before verify handoff [REQ-generator-005, REQ-sdd-document-001, REQ-skills-008]
