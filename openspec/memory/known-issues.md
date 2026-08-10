---
title: Known Issues
last_updated: 2026-08-10
---

## npm test exit code 1: scripts/lib/verify-lineage.test.js crashes on load with Error: freezeCandidate requires diffText or diff_hash
- severity: BLOCKER
- area: scripts/lib/verify-lineage.test.js
- workaround: pass diff_hash or diffText to freezeCandidate in sampleCandidate fixture
- change: verify-lineage-k3-final-closure-remediation
- date: 2026-08-10

## Over-claimed test pass in apply-progress.md and tasks.md (task 4.2 marked complete despite npm test failure)
- severity: BLOCKER
- area: openspec/changes/verify-lineage-k3-final-closure-remediation/apply-progress.md
- workaround: fix test failure and reconcile task status
- change: verify-lineage-k3-final-closure-remediation
- date: 2026-08-10


## K1 scope guard rejects new scripts (apply-resume.js, roadmap-boundary.test.js, verify-evidence-classification.js, etc.) as unmanifested inventory
- severity: BLOCKER
- area: scripts/lib/k1-scope-guard.test.js
- workaround: none
- change: verify-lineage-k3-final-closure-corrective
- date: 2026-08-10

## Legacy strict_tdd test assertion in pre-commit-hook.test.js fails after REQ-VL-FINAL-004 removed strict_tdd parsing
- severity: BLOCKER
- area: scripts/hooks/pre-commit-hook.test.js
- workaround: update pre-commit-hook.test.js to reflect REQ-VL-FINAL-004
- change: verify-lineage-k3-final-closure-corrective
- date: 2026-08-10

## Post-verify cleanup tasks 10.9 and 10.10 remain pending before archive
- severity: WARNING
- area: openspec/changes/verify-lineage-k3-alignment-corrective/tasks.md
- workaround: complete tasks 10.9 and 10.10 during sdd-archive phase
- change: verify-lineage-k3-alignment-corrective
- date: 2026-08-10

## Codex active runtime retains destination-only managed schemas
- severity: BLOCKER
- area: scripts/configure/install-codex.js (copyCodexRuntime / syncTreeByContent)
- workaround: remove obsolete files from the managed active schema tree before or during supported reinstall, then verify active inventory equals dist/codex/schemas exactly
- change: k3-readiness-remediation
- date: 2026-08-09

## Phase 9 tasks claim stale-schema cleanup without permanent coverage
- severity: BLOCKER
- area: openspec/changes/k3-readiness-remediation/tasks.md 9.2-9.4; scripts/configure/codex-smoke.test.js
- workaround: add a permanent isolated-home reinstall case that seeds a destination-only managed schema and requires it to be pruned
- change: k3-readiness-remediation
- date: 2026-08-09

## Task 4.4 work-unit commits still pending after K3 verify PASS
- severity: WARNING
- area: openspec/changes/k3-identities-boundary-closure (task 4.4 Conventional Commits)
- workaround: create Spanish Conventional Commits without AI attribution (schemas → runtime → tests); harness Co-authored-by injection must be avoided so the repo commit-msg hook accepts the message
- change: k3-identities-boundary-closure
- date: 2026-08-07

## Host-boundary success observe lacks explicit ok:true assertion
- severity: WARNING
- area: scripts/lib/lifecycle-kernel/host-boundary.test.js (REQ-lifecycle-kernel-runtime-017 success scenario)
- workaround: after observeHostPort with a successful port, assert.equal(a.ok, true) (and optionally a.outcome) instead of only comparing two runs for equality
- change: k2a-1-live-capability-probes-async-transports
- date: 2026-08-05

## Type-only re-export smoke for issueOperationPermit
- severity: WARNING
- area: scripts/lib/lifecycle-kernel/index.test.js:341 (task 2.4)
- workaround: assert a call through the kernel re-export returns a permit with expected_revision/operation (behavior already covered in permits.test.js)
- change: k2-1b-permit-issuance-atomic-consume
- date: 2026-08-05

## Harness-alone host-fault incompleteness lacks explicit negative runtime test
- severity: WARNING
- area: scripts/lib/minimal-kernel-harness.test.js (REQ-minimal-kernel-harness-009)
- workaround: add a runtime case that evaluates K2a host-fault conformance with only Minimal Kernel Harness fixtures (no Headless Conformance Host peer) and asserts coverage remains incomplete
- change: k2a-headless-conformance-host
- date: 2026-08-04

## Full npm test fails: K1 scope guard rejects new K2 modules as unmanifested inventory
- severity: BLOCKER
- area: scripts/lib/k1-scope-guard.test.js (frozen candidate inventory vs post-K1 changes)
- workaround: carve out or remediate the K1 frozen-inventory check so legitimate K2 paths under scripts/lib/lifecycle-kernel/**, lifecycle-model*, minimal-kernel-harness* and transition-parity.k2.test.js are not treated as unmanifested K1 changes; then re-run npm test and sdd-verify
- change: k2-lifecycle-kernel
- date: 2026-08-04

## Model inv-no-duplicate-effects checker is vacuous (always ok)
- severity: WARNING
- area: scripts/lib/lifecycle-model.js (checkNoDuplicateEffects)
- workaround: implement a real model-level duplicate-effect check or explicitly document that harness/journal tests are the sole enforcement and stop counting the stub as mechanical model enforcement
- change: k2-lifecycle-kernel
- date: 2026-08-04

## Archive receipt cost aggregation omits duration, model tiers, statuses and questions_asked
- severity: BLOCKER
- area: scripts/lib/archive-transaction.js (aggregateCost)
- workaround: sum duration_ms per phase, collect distinct model_tier and status lists, and read gates.*.questions_asked from the change state.yaml instead of hardcoding total_questions_asked to 0; add an FS fixture with a populated .ospec/session/{change}/phase-costs.jsonl
- change: hybrid-archive-transaction-runtime
- date: 2026-07-26

## CLI exit-mapping test redefines the mapping locally and never invokes main
- severity: BLOCKER
- area: scripts/archive-transaction-run.test.js
- workaround: replace the local exitCodeFor helper with a call to main([change, "--workspace", tmp], {log, error, exit}) over a mkdtemp fixture and assert both the parsed stdout receipt and the exit code
- change: hybrid-archive-transaction-runtime
- date: 2026-07-26

## Unknown-rejection-code fail-closed consumer is simulated instead of exercised
- severity: WARNING
- area: scripts/lib/archive-plan.test.js, scripts/lib/archive-transaction.js
- workaround: drive runArchiveTransaction with a validator result carrying an unknown code and assert the receipt still fails closed
- change: hybrid-archive-transaction-runtime
- date: 2026-07-26

## No Linux execution evidence for the cross-OS archive transaction fixtures
- severity: WARNING
- area: scripts/lib/archive-transaction.test.js, scripts/lib/atomic-write.test.js
- workaround: run npm test under WSL or CI on Linux before archive, or record the accepted limitation in the archive report
- change: hybrid-archive-transaction-runtime
- date: 2026-07-26

## baseline-stale preflight branch of the archive runtime has no test
- severity: WARNING
- area: scripts/lib/archive-transaction.js (runArchiveTransaction preflight)
- workaround: add an FS fixture whose state.yaml baseline_fingerprints disagree with the live target bytes and assert failure_reason baseline-stale with the origin intact
- change: hybrid-archive-transaction-runtime
- date: 2026-07-26

## resumed-success outcome is unreachable and contradicts ADR-006
- severity: WARNING
- area: scripts/lib/archive-transaction.js (opts._resumed recursive tail)
- workaround: either set the resumed flag when the journal is entered at a non-terminal state, or amend ADR-006 and record the deviation; the CLI exit branch for resumed-success is currently dead
- change: hybrid-archive-transaction-runtime
- date: 2026-07-26

## Strict TDD evidence lists 16 genesis paths but only 12 file digests
- severity: WARNING
- area: openspec/changes/hybrid-archive-transaction-runtime/apply-progress.md (json:strict-tdd-evidence)
- workaround: add digests for the four prose files (sdd-archive SKILL.md, gate-archive-quality.md, sdd-archive.agent.md, sdd-orchestrator.agent.md) so a later identity recheck can detect drift
- change: hybrid-archive-transaction-runtime
- date: 2026-07-26

## Assumption ledger left unreconciled at verify (sdd-design-002 is reversibility low)
- severity: WARNING
- area: openspec/changes/hybrid-archive-transaction-runtime/state.yaml (assumptions)
- workaround: relaunch sdd-verify with an assumption_resolutions block; sdd-design-002 needs an individual confirm/correct/promote decision, the 14 high-reversibility entries can be confirmed as a group
- change: hybrid-archive-transaction-runtime
- date: 2026-07-26

## Strict TDD evidence record fails schema-v1 validation (evidence_mode working-tree, legacy provenance source, invalid refactor marker)
- severity: BLOCKER
- area: openspec/changes/cursor-native-target/apply-progress.md (json:strict-tdd-evidence)
- workaround: evidence-section-only repair — set evidence_mode to "live", replace cycle provenance.source "working-tree" with commit "working-tree", and use an allowed refactor marker for cycle 5.2-5.5 (mirror it in the Final Derived Markdown Table); all 16 file digests already match
- change: cursor-native-target
- date: 2026-07-25

## Six-target branch-advisory scenario has no automated coverage for cursor or codex
- severity: WARNING
- area: scripts/configure.test.js (TARGETS array)
- workaround: extend TARGETS with "codex" and "cursor"; behavior itself already verified by build and grep of dist/cursor
- change: cursor-native-target
- date: 2026-07-25

## install-cursor main() non-dry-run path is never exercised by a test
- severity: WARNING
- area: scripts/configure/install-cursor.js, scripts/configure/install-cursor.test.js
- workaround: mirror the dry-run injected-deps test with dryRun false and assert syncTreeByContent, installHooksJson and copyBinaryToTree are called with the expected arguments
- change: cursor-native-target
- date: 2026-07-25

## tasks.md 5.1 is ticked complete although the baseline spec deltas are deferred to sdd-archive
- severity: WARNING
- area: openspec/changes/cursor-native-target/tasks.md
- workaround: sdd-archive must still apply the four delta specs to openspec/specs/{generator,install,agents,hooks-runtime}/spec.md; do not read the tick as done
- change: cursor-native-target
- date: 2026-07-25

## Mock-heavy install-cursor dry-run test (7 stubs vs 3 assertions)
- severity: WARNING
- area: scripts/configure/install-cursor.test.js
- workaround: add the positive non-dry-run case so the suite verifies behavior rather than only wiring absence
- change: cursor-native-target
- date: 2026-07-25

## docs/target-capabilities.md claims six targets but its capability table only tabulates five
- severity: WARNING
- area: docs/target-capabilities.md
- workaround: add the missing codex column to the capability table, or scope the lead sentence to the targets actually tabulated
- change: cursor-native-target
- date: 2026-07-25

## models.yaml has a duplicated agents: mapping block, breaking parseModels and npm test
- severity: BLOCKER
- area: models.yaml, scripts/configure/cli.js (parseModels)
- workaround: de-duplicate the agents: block in models.yaml (repo root) before running npm test or archiving
- change: review-remediation-slices
- date: 2026-07-25

## Remediation-v2 exact reconciliation remains incomplete
- severity: BLOCKER
- area: scripts/lib/review-lineage.js
- workaround: none
- change: review-remediation-slices
- date: 2026-07-22

## Remediation-v2 loses fail-closed candidate/path and interruption authority
- severity: BLOCKER
- area: scripts/lib/review-lineage.js
- workaround: none
- change: review-remediation-slices
- date: 2026-07-22

## Cross-slice regression and unrelated-observation authority are incomplete
- severity: BLOCKER
- area: scripts/lib/review-lineage.js
- workaround: none
- change: review-remediation-slices
- date: 2026-07-22

## O4.2 migration does not seed legacy outcomes or attempts
- severity: BLOCKER
- area: scripts/lib/review-lineage.js, scripts/review-lineage-o4-migration.test.js, openspec/changes/strict-tdd-evidence-remediation-fast-path/state.yaml
- workaround: none
- change: review-remediation-slices
- date: 2026-07-22

## Remediation-v2 integrity is not validated downstream
- severity: BLOCKER
- area: scripts/lib/review-lineage.js, scripts/lib/review-gate-state.js
- workaround: none
- change: review-remediation-slices
- date: 2026-07-22

## Strict TDD provenance is not authoritative per coding task
- severity: BLOCKER
- area: openspec/changes/review-remediation-slices/apply-progress.md, scripts/review-lineage-o4-migration.test.js
- workaround: none
- change: review-remediation-slices
- date: 2026-07-22

## Fast path accepts an unknown remediation origin
- severity: BLOCKER
- area: scripts/lib/strict-tdd-evidence-remediation.js
- workaround: none
- change: strict-tdd-evidence-remediation-fast-path
- date: 2026-07-18

## Fast path does not require an actual format gap or revalidate live functional identity
- severity: BLOCKER
- area: scripts/lib/strict-tdd-evidence-remediation.js
- workaround: none
- change: strict-tdd-evidence-remediation-fast-path
- date: 2026-07-18

## Fast path still accepts fabricated evidence and unverified focal events
- severity: BLOCKER
- area: scripts/lib/strict-tdd-evidence-remediation.js
- workaround: none
- change: strict-tdd-evidence-remediation-fast-path
- date: 2026-07-18

## Corrective Strict TDD evidence still fails authoritative validation
- severity: BLOCKER
- area: openspec/changes/strict-tdd-evidence-remediation-fast-path/apply-progress.md
- workaround: none
- change: strict-tdd-evidence-remediation-fast-path
- date: 2026-07-18

## Focal next-action and executable mutation coverage remain incomplete
- severity: BLOCKER
- area: scripts/lib/strict-tdd-evidence-remediation.js, agents/sdd-orchestrator.agent.md, and scripts/strict-tdd-evidence-parity.test.js
- workaround: none
- change: strict-tdd-evidence-remediation-fast-path
- date: 2026-07-18

# Known issues

## reference-changes-benchmark pendiente de evidencia live

- Estado: implementación focal 53/53 PASS; 0/3 perfiles core live aceptados.
- Impacto: `scripts/evals/reports/reference-baseline.md` sigue ausente y archive permanece bloqueado.
- Resolución: ejecutar el piloto core con `node scripts/evals/live-driver.js all`; revisar 3/3 resultados y publicar el baseline. La suite `extended` de nueve perfiles es opcional.
- O1: suplementario. Si falta o es inválido se marca `unavailable`; no requiere reparación del binding para medir tokens y duración run-level.
