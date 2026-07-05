# Verification Report: harden-archive-move-fingerprints

**Change**: harden-archive-move-fingerprints
**Mode**: openspec / Strict TDD (active)
**Verdict**: **PASS**
**Date**: 2026-07-05

## Task Completeness

| Phase | Tasks | Complete | Notes |
|-------|-------|----------|-------|
| 1 (RED) | 2 | 2/2 | Contract test + real-repo sentinel/absence rows |
| 2 (GREEN archive-move) | 2 | 2/2 | gate-archive-quality.md append + sdd-archive Step 5 rewrite |
| 3 (GREEN fingerprint) | 3 | 3/3 | sdd-spec Step 5b + orchestrator block + gate-change-collision edit |
| 4 (verification) | 4 | 4/4 | Suite + 4-target + line-count |
| 5 (cleanup) | 3 | 3/3 | Orchestrator re-read, cross-consistency, success criteria |
| **Total** | **14** | **14/14** | All factually done against real files |

## Build / Tests / Coverage

- Test runner: `npm test` (`node scripts/check.js` → native Node suite + 4 dist target validators).
- Full suite run (`env -u DISABLE_AGENT_SHIELD -u DISABLE_GIT_COLLABORATION_GUARD -u DISABLE_TOKEN_ADVISOR npm test`): **989 tests, 988 pass, 1 fail**.
  - The single failure was the documented known flake `appendRuntimeEvent serializes concurrent writers without corrupting lines` (`scripts/lib/ospec-state.test.js`) — EPERM lock-file contention on Windows temp.
  - Re-run isolated: `node --test scripts/lib/ospec-state.test.js` → **52/52 pass**. Flake confirmed, not a regression.
  - The second documented flake (parity-contract `pre-tool-use-ask` / token-advisor) did NOT trigger this run.
- Change-specific tests isolated:
  - `scripts/archive-move-fingerprint-contract.test.js` → **2/2 pass**.
  - `scripts/configure/real-repo.test.js` → **20/20 pass** (sentinels resolve, absence assertions hold, `lines.length < 500` holds).
- Coverage tool: not configured for this repo → coverage analysis skipped (not a failure).

## Spec Compliance Matrix

Evidence key: RT = runtime-test (test executes and asserts the anchor); IP = inspection-proof (prose read, governed by an RT-anchored parent contract). Each scenario's declared expected evidence is "static contract-test anchor" per the deltas.

### agents domain

| Requirement / Scenario | Strength | Evidence | Anchor | Level | Status |
|---|---|---|---|---|---|
| REQ-agents-008 · Inventory match — orchestrator deletes source | MUST | `gate-archive-quality.md` §Post-Return Move Completion; `recursively diff the destination` + "delete the source directory" | archive-move-fingerprint-contract.test.js #1 | RT | PASS |
| REQ-agents-008 · Inventory mismatch — halt, source intact, no delete | MUST | `halt with the source directory left intact` + "MUST NOT delete the source under a mismatch" | contract.test.js #1 | RT | PASS |
| REQ-agents-008 · Executor never deletes/self-certifies | MUST | `sdd-archive/SKILL.md` Step 5: `copy inventory`, `MUST NOT … delete the source`; absence `then delete the source folder` | contract.test.js #1 + mentor-adr A5.3 | RT | PASS |
| REQ-agents-009 · sdd-spec declares → orchestrator computes | MUST | `touched_baseline_domains` in sdd-spec Step 5b + orchestrator standing block; `baseline_fingerprints` in orchestrator | contract.test.js #2 + eje-b B2.4 | RT | PASS |
| REQ-agents-009 · New domain, no baseline → orchestrator writes null | MUST | orchestrator block: "or write `null` if no baseline exists yet" | contract.test.js #2 (parent anchor) + inspection | IP | PASS |
| REQ-agents-009 · No per-change fingerprint assumption entry | MUST | orchestrator block: "Do NOT record a per-change `assumptions:` entry … closes that gap structurally" | contract.test.js #2 (parent anchor) + inspection | IP | PASS |

### skills domain

| Requirement / Scenario | Strength | Evidence | Anchor | Level | Status |
|---|---|---|---|---|---|
| Baseline Fingerprint (MODIFIED) · sdd-spec declares without computing | MUST | sdd-spec Step 5b `touched_baseline_domains`; MUST NOT compute SHA-256 | contract.test.js #2 + eje-b B2.4 (`doesNotMatch /sha256/i`) | RT | PASS |
| Baseline Fingerprint · Fingerprint computed by orchestrator after spec | MUST | orchestrator standing block writes `state.yaml.baseline_fingerprints` | contract.test.js #2 + eje-b B2.4 | RT | PASS |
| Baseline Fingerprint · Stale baseline detected at archive | MUST | sdd-archive stale-baseline check + `blocker_type: stale-baseline` (unchanged by this delta) | eje-b B2.4 | RT | PASS |
| sdd-archive Copy-and-Report (ADDED) · Executor reports inventory, not completion | MUST | Step 5 copy-inventory report; Step 7 "Move Completion Pending" | contract.test.js #1 + mentor-adr A5.3 | RT | PASS |
| sdd-archive Copy-and-Report · Partial copy reported not concealed | MUST | Step 5: "never conceal a partial copy as if it were complete" | contract.test.js #1 (parent anchor) + inspection | IP | PASS |
| sdd-archive Copy-and-Report · Source left intact by executor | MUST | absence `then delete the source folder`; Step 6 checklist "Source directory still exists" | contract.test.js #1 + mentor-adr A5.3 | RT | PASS |

All MUST scenarios meet or exceed their required evidence strength. The three IP-level sub-scenarios (null handling, no-assumption-entry, partial-copy-not-concealed) are fine-grained prose behaviors whose governing MUST contracts each carry a runtime-executed static anchor; the specific load-bearing strings are present and read verbatim.

## Design Coherence

| Design decision | Implementation | Match |
|---|---|---|
| ADR-001: move-completion extends gate-archive-quality.md (no new pointer row) | `## Post-Return Move Completion` appended; no new pointer-table row | ✅ |
| ADR-002: fingerprint = standing inline orchestrator block (~6 lines, <500) | 4 net lines added; body at 497 lines | ✅ |
| ADR-003: new contract test + real-repo sentinel rows | Both present; sentinels resolve, absence assertions hold | ✅ |

No design deviations. The two additive wording touches (sdd-archive Step 6/7, sdd-spec Step 6) are consistency edits within design scope, no new load-bearing strings.

## TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | TDD Cycle Evidence table present in apply-progress.md |
| All coding tasks have tests | ✅ | Contract test + real-repo cover both REQs; prose-only edits anchored |
| RED confirmed (tests exist) | ✅ | `archive-move-fingerprint-contract.test.js` exists; RED narrative credible (case-sensitive `Recursively` mis-draft documented) |
| GREEN confirmed (tests pass) | ✅ | 2/2 contract, 20/20 real-repo executed by verifier |
| Triangulation adequate | ✅ | 2 test cases (archive-move + fingerprint-ownership); each asserts presence AND absence |
| Safety net for modified files | ✅ | Pre-existing eje-b B2.4 / mentor-adr A5.2-A5.3 updated to the new contract, re-run green |

**TDD Compliance**: 6/6 checks passed. The RED→GREEN evidence in apply-progress.md is consistent with the real files and clean git state.

## Regression-Fix Audit (superseded-contract tests)

The task flagged 3 pre-existing tests updated during apply. Audited against the NEW spec:

- **eje-b B2.4** — now asserts `touched_baseline_domains` in sdd-spec, `doesNotMatch /sha256/i` in sdd-spec (passes because prose is hyphenated "SHA-256"), orchestrator owns `baseline_fingerprints` sourced from `touched_baseline_domains`, and sdd-archive retains the stale-baseline check. Faithfully tracks REQ-agents-009 and the MODIFIED skills requirement; does NOT weaken assertions (adds presence+absence checks).
- **mentor-adr A5.2** — updated heading anchor from "Step 5: Move to Archive" to "Step 5: Copy Artifacts to Archive"; preserves the ADR-promotion-before-copy ordering assertion. Tracks the renamed step, no weakening.
- **mentor-adr A5.3** — replaced the old "A move is NOT a copy"/"MUST NOT exist" guard with the copy-and-report contract (`copy inventory` present, `MUST NOT … delete the source` present, `then delete the source folder` absent). This is the same load-bearing string set as the new contract test — stronger, not weaker.

Verdict: all 3 updates track the new spec faithfully; no assertion was weakened.

## Assumption Reconciliation

`state.yaml assumptions:` is empty → Step 2a is a no-op. No unresolved entries, no findings.

## Issues

- CRITICAL: none.
- WARNING: none.
- SUGGESTION: none.

## Final Verdict

**PASS** — All 14 tasks complete and factually done. Every MUST scenario in both delta specs maps to concrete evidence with the required strength. Orchestrator body is 497 lines (< 500 guard) with move-completion protocol confirmed absent from the body and present in `gate-archive-quality.md`. Full suite green except one documented Windows flake (passes isolated, 52/52). Git working tree matches the declared Files Changed set with no leftover mutations. The 3 regression-fixed tests faithfully encode the new contract.
