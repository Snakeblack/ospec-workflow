# Archive Report

**Change**: close-pp2-cx1-preflight-guarantees
**Date**: 2026-09-26
**Route**: standard (`state.yaml.route.actual_route`)
**Planned archive folder**: `openspec/changes/archive/2026-09-26-close-pp2-cx1-preflight-guarantees/`
**Verification Verdict**: PASS

## Summary

Cierre acotado de las garantías PP2/CX1 que 2.68.2 dejó abiertas: comando pre-delegación del orquestador con ruta real del plugin y `--workspace`, prueba de aceptación con proceso Node independiente, autoridad de `route.actual_route` con paridad de parsers dispatcher/`validate-phase`, y noop v2.67 limitado al orden de claves congelado. Quality review aprobada (`all-remediation-slices-passed`); dos CRITICAL de runtime/evolution resueltos en remediación acotada.

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `proposal.md` | Done |
| Spec (agents) | `specs/agents/spec.md` | Done |
| Spec (install) | `specs/install/spec.md` | Done |
| Spec (routing) | `specs/routing/spec.md` | Done |
| Spec (lifecycle-kernel-runtime) | `specs/lifecycle-kernel-runtime/spec.md` | Done |
| Design | `design.md` | Done |
| Tasks | `tasks.md` | Done (10/10) |
| Apply Progress | `apply-progress.md` | Done |
| Verify Report | `verify-report.md` | PASS |
| Review lineage | `.review-lineage.json` | Frozen (audit) |
| Archive plan | `archive-plan.json` | Emitted (runtime commit pending) |

## Spec Merge Summary

| Domain | Action | Details |
|--------|--------|---------|
| agents | ADDED | REQ-agents-030: pre-delegación `validate-phase` vía ruta real del plugin + `--workspace`; 3 escenarios |
| install | MODIFIED | REQ-install-027: escenario de proceso Node independiente con `cwd` ajeno; in-process no basta como única prueba |
| routing | MODIFIED | REQ-routing-016: autoridad de `route.actual_route`, exclusión out-of-block, paridad parsers (cierra F-66efe8421b856f34); 3 escenarios nuevos |
| lifecycle-kernel-runtime | MODIFIED | REQ-lifecycle-kernel-029: noop v2.67 solo orden congelado; status-first no prometido; sin conservación de bytes; 2 escenarios nuevos |

Prepared merge artifacts (hashed for runtime): `specs/*/spec-prepared.md`. No requisitos REMOVED; ningún delta destructivo masivo.

### Baseline fingerprints (pre-change, from `state.yaml`)

| Domain | Recorded SHA-256 |
|--------|------------------|
| agents | `722499b7f9c706a99392037b8e37c3538bd472b7fad878435c5680f99487586f` |
| install | `1f897ef817b28b4b08b129919649690a00b779d1e362bb19839faa329d076dcd` |
| routing | `f4091577b7e37fee11377698f499f73ff7d8418fa15a287b23e64724781fd890` |
| lifecycle-kernel-runtime | `2a5fc3907d161f86650f8a6b1dc1ed4a19b9fbae685900b021117cdda32a7406` |

Live `openspec/specs/{domain}/spec.md` bytes at archive time match these recorded fingerprints (stale-baseline preflight expected to pass).

## Live Specs / ADR Commit Pending

Runtime `node scripts/archive-transaction-run.js close-pp2-cx1-preflight-guarantees` applies `spec_writes[]` to `openspec/specs/**`. No ADR promotions (`decisions/` absent).

## Verification Issues

**CRITICAL**: None (verify report).

**WARNING**: None.

## Quality Review Gate

- Gate: `quality-review-gate`, schema v2, classification `high-risk`
- Status: `approved`, `terminal_reason`: `all-remediation-slices-passed`
- Findings: 2 CRITICAL (F-7105b9967bdef631, F-693006dcc36924eb) resolved via remediation slice S-3071d45248678240; 0 BLOCKER; 0 WARNING at terminal
- Lineage approved for archive; historical approvals in `state.yaml` preserved

## Delivery / Approvals (archive-relevant)

| ID | Decision | Applies to |
|----|----------|------------|
| execution-mode-001 | automatic | sdd-archive (among phases) |
| delivery-strategy-001 | ask-on-risk | sdd-tasks, sdd-apply |

Review workload: ~280–340 líneas; presupuesto 400 Low; sin excepción de tamaño requerida para archive.

## Out of Scope (explicit)

- Conservar bytes JSON originales de envelopes históricos.
- Rediseño PP2/CX1; `adaptive-operation-identity-binding`.
- Reescritura de `openspec/changes/archive/2026-09-25-remediate-pp2-cx1-preflight-gaps/state.yaml`.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/close-pp2-cx1-preflight-guarantees/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

## Move Completion

Source directory `openspec/changes/close-pp2-cx1-preflight-guarantees/` remains at the active path until the archive transaction runtime completes successfully.
