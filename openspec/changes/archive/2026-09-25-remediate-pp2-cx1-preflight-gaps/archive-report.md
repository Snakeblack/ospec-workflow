# Archive Report

**Change**: remediate-pp2-cx1-preflight-gaps
**Date**: 2026-09-26
**Route**: standard (`state.yaml.route.actual_route`)
**Planned archive folder**: `openspec/changes/archive/2026-09-26-remediate-pp2-cx1-preflight-gaps/`
**Verification Verdict**: PASS WITH WARNINGS

## Summary

Remediación acotada sobre main 2.68.1: replay dual-hash v2.67 en Node/Go, política `actual_route` con excepción legacy, separación plugin/proyecto en `validate-phase`, e inventario de consumidores. Quality review aprobada (`all-remediation-slices-passed`); dos CRITICAL resueltos en remediación.

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `proposal.md` | Done |
| Spec (lifecycle-kernel-runtime) | `specs/lifecycle-kernel-runtime/spec.md` | Done |
| Spec (routing) | `specs/routing/spec.md` | Done |
| Spec (install) | `specs/install/spec.md` | Done |
| Design | `design.md` | Done |
| Tasks | `tasks.md` | Done (18/18) |
| Apply Progress | `apply-progress.md` | Done |
| Verify Report | `verify-report.md` | PASS WITH WARNINGS |
| Consumer inventory | `consumer-inventory.md` | Done |
| Archive plan | `archive-plan.json` | Emitted (runtime commit pending) |

## Spec Merge Summary

| Domain | Action | Details |
|--------|--------|---------|
| lifecycle-kernel-runtime | MODIFIED | REQ-lifecycle-kernel-029: dual-accept v2.67 insertion-order hash noop; 2 escenarios añadidos; texto (Previously) |
| routing | ADDED | REQ-routing-016: persistencia y fail-closed de `route.actual_route`; excepción legacy acotada; 3 escenarios |
| install | ADDED | REQ-install-027: raíces plugin vs proyecto en instalación global; 4 escenarios |

Prepared merge artifacts (hashed for runtime): `specs/*/spec-prepared.md`. No destructive delta: ningún requisito REMOVED ni secciones masivas eliminadas (`rules.archive`).

### Baseline fingerprints (pre-change, from `state.yaml`)

| Domain | Recorded SHA-256 |
|--------|------------------|
| lifecycle-kernel-runtime | `128d3669690403e48eb09c567f0ce7160f14cb56c32890176d8a15713117f076` |
| routing | `08650d0620f7125836610320593249f21244dd5e6b4c5e8e8b362a8432acac09` |
| install | `8c547a0564fc8b4a68d28bbc44f3432326427826bba1bf3b2b7c5113d00515ce` |

Live `openspec/specs/{domain}/spec.md` bytes at archive time match these recorded fingerprints (stale-baseline preflight expected to pass).

## Live Specs / ADR Commit Pending

Runtime `node scripts/archive-transaction-run.js remediate-pp2-cx1-preflight-gaps` applies `spec_writes[]` to `openspec/specs/**`. No ADR promotions (`decisions/` absent).

## Verification Issues

**CRITICAL**: None (verify report).

**WARNING (accepted for archive)**:

1. **Review workload budget exceeded** — ~770 changed lines vs presupuesto 400. Aceptado vía `approvals.review-workload-002` (`size:exception`) y `approvals.delivery-strategy-002` (`exception-ok`), fuente `cursor/plain-chat`, `applies_to: sdd-archive`. Supersede la entrega single-pr previa para archive sin invalidar el trabajo verificado.

**Follow-up (unresolved, not accepted as fixed)**:

| ID | Owner | Summary |
|----|-------|---------|
| F-66efe8421b856f34 | evolution | `validate-phase.js` `readPersistedRouteInfo` puede hacer match global de `actual_route` mientras `route-dispatch-run.js` `extractStateRouteInfo` limita el fallback al bloque `route:` — fail-closed inconsistente bajo ciertos `state.yaml`. Permanece advisory; no remediado en este change. |

## Accepted Warnings (plan)

See `archive-plan.json` `accepted_warnings[]` — presupuesto de líneas de revisión aceptado bajo `size:exception`.

## Quality Review Gate

- Gate: `quality-review-gate`, schema v2, classification `high-risk`
- Status: `approved`, `terminal_reason`: `all-remediation-slices-passed`
- Findings: 0 BLOCKER, 2 CRITICAL (resolved), 1 WARNING (F-66efe842 advisory), 0 SUGGESTION
- CRITICAL F-a03bc117fe7eef44 and F-71a2828de183a068: resolved via remediation slices; not reopened

## Delivery / Approvals (archive-relevant)

| ID | Decision | Applies to |
|----|----------|------------|
| delivery-strategy-002 | exception-ok | sdd-archive |
| review-workload-002 | size:exception | sdd-archive |

## Out of Scope (explicit)

- BOM strip en `scripts/hooks/ospec-hooks-launch.js` — fuera del change; sin delta de spec.
- Segunda implementación PP2/CX1, Adaptive global, change `adaptive-operation-identity-binding`.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/remediate-pp2-cx1-preflight-gaps/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

## Move Completion

Source directory `openspec/changes/remediate-pp2-cx1-preflight-gaps/` remains at the active path until the archive transaction runtime completes successfully.
