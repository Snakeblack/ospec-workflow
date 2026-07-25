---
title: Known Issues
last_updated: 2026-07-25
---

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
