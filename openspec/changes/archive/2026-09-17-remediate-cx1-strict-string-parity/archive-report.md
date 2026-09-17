# Archive Report

**Change**: remediate-cx1-strict-string-parity
**Date**: 2026-09-17
**Route**: standard
**Verification Verdict**: PASS (Run 3 — re-verificación final del delta Phase 6)

> **Nota de segunda emisión**: este reporte fue re-emitido como read-merge tras el
> rechazo `inventory-mismatch` del primer `archive-plan.json` (los artefactos cambiaron
> por las rondas de remediación gen2/gen3 posteriores a ese intento). Todos los hashes
> del plan vigente fueron re-verificados byte a byte contra el working tree.

## Summary

Cambio completado exitosamente: hardening de schemas JSON con `pattern: "\\S"` para semantica `isNonEmptyString`, validacion estricta de tipo string para `detailed_report` en runtimes JS y Go, y matriz compartida de fixtures negativos con conformidad diferencial trifasica.

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `openspec/changes/remediate-cx1-strict-string-parity/proposal.md` | Done |
| Spec (kernel-contract-schemas) | `openspec/changes/remediate-cx1-strict-string-parity/specs/kernel-contract-schemas/spec.md` | Done |
| Spec (skills) | `openspec/changes/remediate-cx1-strict-string-parity/specs/skills/spec.md` | Done |
| Design | `openspec/changes/remediate-cx1-strict-string-parity/design.md` | Done |
| Tasks | `openspec/changes/remediate-cx1-strict-string-parity/tasks.md` | Done (19/19 complete) |
| Apply Progress | `openspec/changes/remediate-cx1-strict-string-parity/apply-progress.md` | Done (incluye remediaciones gen2, fases 5-6) |
| Verify Report | `openspec/changes/remediate-cx1-strict-string-parity/verify-report.md` | PASS (Runs 1-3) |
| ADR-001 | `openspec/changes/remediate-cx1-strict-string-parity/decisions/adr-001.md` | Done |
| ADR-002 | `openspec/changes/remediate-cx1-strict-string-parity/decisions/adr-002.md` | Done |
| ADR-003 | `openspec/changes/remediate-cx1-strict-string-parity/decisions/adr-003.md` | Done |

## Spec Merge Summary

| Domain | Action | Details |
|--------|--------|---------|
| kernel-contract-schemas | MODIFIED | REQ-kernel-contract-schemas-031: added pattern \\S enforcement, detailed_report type string constraint, 2 new negative fixtures |
| skills | MODIFIED | REQ-skills-018: added detailed_report runtime string validation, whitespace-only and non-string fixture coverage |

## ADR Promotions (plan -- runtime-owned)

Hashes re-verificados contra los bytes vivos de `decisions/adr-00{1,2,3}.md` (sin cambios desde el plan previo; objetos 004-006 de `docs/adr/` libres de colisión a 2026-09-17).

| Source | Target | Hash |
|--------|--------|------|
| decisions/adr-001.md | docs/adr/adr-20260917-004-hardening-schemas-json-pattern-s-campos-isnonemptystring.md | 1e32567488b388b507a5b0b97a6013ed12c7b1d61c346546c7425e0ed7bb07fd |
| decisions/adr-002.md | docs/adr/adr-20260917-005-validacion-tipo-string-detailed-report-runtimes-js-go.md | 88bb54a9ab3c8aafda6a54d42f0247ba75b43cb88dba0416144fb30374f1ac66 |
| decisions/adr-003.md | docs/adr/adr-20260917-006-matriz-compartida-fixtures-negativos-conformidad-diferencial-trifasica.md | fdd6b24a8624118d11af61d35f21fd3482c02a630bebd7371f9768dccca2af25 |

## Verification Issues

Verdict final: **PASS** (Run 3). Ninguna issue abierta bloqueante.

- CRITICAL: 0
- WARNING (sin remediar): 0 — los 4 WARNING in-scope del gen1 fueron remediados (Run 2: 4/4) y el delta re-verificado (Run 3: Node 71/71, `go test ./...` verde)
- Findings restantes: solo advisory, registrados como follow-ups (ver abajo)

Historial de verificación (verify-report.md, read-merge):
- **Run 1** (pre-remediación): PASS inicial, 28/28 escenarios.
- **Run 2** (post-remediación gen2): PASS, 19/19 tareas, 28/28 escenarios, 4/4 findings remediados, Node 68/68 + Go ok.
- **Run 3** (delta Phase 6, gen2): PASS, fixture NEL con bytes C2 85 válidos, paridad de mensaje para `question_gate` falsy en `status: blocked` (JS/Go) y espejos JS; Node 71/71 (3 tests nuevos), Go 11 paquetes ok, regresión cero.

## Accepted Warnings

None -- verification passed with no unremediated warnings. Los findings advisory
del quality-review-gate se registran como follow-ups, no como warnings aceptados
(`accepted_warnings: []` en `archive-plan.json`).

## Quality Review Gate Context

- Gate `quality-review-gate` final: **APPROVED** (gen3), classification `high-risk`
  (dominios trust, runtime, evolution, efficiency), terminal reason
  `no-unresolved-blocking-findings`, `classification_status: sufficient`.
- Approvals registrados en `state.yaml`: `intent-briefing-001`,
  `quality-review-gate-001..005`.

### Tres generaciones de review

| Gen | Candidate | Resultado |
|-----|-----------|-----------|
| gen1 | Candidate inicial (328 authored lines, 11 paths) | 0 BLOCKER, 0 CRITICAL, 5 WARNING, 4 SUGGESTION. Primer archive frenado (`quality-review-gate-001`, `quality-review-ambiguity-unresolved`); reclasificación a high-risk aprobada (`quality-review-gate-002`); remediación de 4 warnings in-scope aprobada (`quality-review-gate-003`). |
| gen2 | Candidate post-gen1-remediation (lineage `sha256:5f62bae4...`) | Remediación 4/4 del gen1 (approval `quality-review-gate-004`): fixture NEL con byte crudo C2 85, alineación de mensaje para `question_gate` falsy no-null en `status: blocked`, tests espejo JS (BOM/NEL/null-question-gate). Re-verify (Run 2) PASS y lineage sucesor gen3. |
| gen3 | Candidate post-gen2 (562 authored lines, lineage `sha256:1d320b61...`, approved) | 1 WARNING de mecánica de tests + 3 SUGGESTION, todos advisory. Archive aprobado (`quality-review-gate-005`, decision `archive-with-gen3-followups`). |

El WARNING de trust del gen3 sobre el fixture NEL fue **descartado como falso
positivo** por el orquestador con verificación byte-level (el fixture contiene
los bytes UTF-8 válidos C2 85 = U+0085; no está vacuo).

### Follow-ups acumulados (advisory, no bloquean el archive)

**gen1** (registrados en `state.yaml` `gates.quality-review-gate.non_blocking_follow_ups`):

| ID | Severidad | Resumen |
|----|-----------|---------|
| F-56ac2a291e91c857 | WARNING (trust) | `resultenvelope.go:381` omite validar `question_gate: null` explícito en status no bloqueado; JS y schema lo rechazan. **Remediado en gen2.** |
| F-81c7b43233a3d682 | WARNING (trust) | `result-envelope.js:438` `adaptLegacyEnvelope` coerciona `schema_version` falsy a 1 (bypass solo por vía JS). Queda como follow-up (fallback legacy, fuera de scope aceptado — con trust-002/trust-004). |
| F-9cb30d71ec9aa7e5 | WARNING (runtime) | Whitespace Unicode exótico U+FEFF/U+0085 rompe paridad trifásica. **Remediado en gen2** (fixtures BOM/NEL + clase ECMA compartida). |
| F-a8097f47b57d3ff6 | WARNING (evolution) | Schema raíz es copia manual de v1 sin test de paridad estructural (deepEqual). Follow-up. |
| F-6f7aad9d4ee43fa6 | WARNING (evolution) | Cinco fixtures de nivel superior fuera de la red trifásica. Follow-up. |
| F-55a71bba8e1613c6 | SUGGESTION (trust) | `strings.TrimSpace` Go no elimina U+FEFF (BOM) mientras JS sí. Follow-up. |
| F-9afc6fb1fd6127d4 | SUGGESTION (trust) | `adaptLegacyEnvelope` defaultea `skill_resolution` a `injected` ante valores ausentes/irreconocibles. Follow-up. |
| F-b62491f94ed6768f | SUGGESTION (trust) | Items de arrays de texto más laxos que la forma string del mismo campo. Follow-up. |
| F-c8f5ddf32e0037b5 | SUGGESTION (runtime) | `conformance_test.go` nunca evalúa el JSON schema: paridad Go-schema inferida, no asertada. Follow-up. |

Más los follow-ups legacy de confianza ya aceptados fuera de scope: **trust-002** y
**trust-004** (vía `adaptLegacyEnvelope`), destinados a un change propio de fallback
legacy, más las sugerencias restantes del gen1.

**gen3** (lineage `sha256:1d320b61...`, findings_digest `sha256:22436a49...`):

| ID | Severidad | Resumen |
|----|-----------|---------|
| F-cf17bb5efe2839fc | SUGGESTION (trust) | Caso `null` de `question_gate` con `status: blocked` no está en las tablas de paridad (comportamiento consistente hoy; riesgo de divergencia futura de `isJSONFalsy`). |
| F-6fc1cc575dafa602 | WARNING (evolution) | Matriz falsy de `question_gate` solo como tests inline espejados a mano, sin fixture diferencial bajo `fixtures/invalid/`. |
| F-dca37776d989b0f7 | SUGGESTION (evolution) | Convención de codificación inconsistente entre fixtures gemelos (BOM usa escape `﻿`, NEL usa bytes crudos C2 85); `apply-progress.md` 6.1 dice "escape JSON" contradiciendo el contenido real. |
| F-515ef4d8ac9d4bd8 | SUGGESTION (evolution) | Ancla de paridad JS-Go vive solo en Go; las contrapartes JS no referencian al espejo. |

(FP descartado del gen3: WARNING de trust sobre fixture NEL vacuo — refutado por
verificación byte-level.)

### FU1 — gap del router de clasificación

El gap estructural del router de clasificación (ambigüedad
`public-kernel-contract-unattributed` en contratos públicos del kernel) quedó
registrado como **FU1** en `docs/roadmaps/harness-evolution.md`. Queda como
follow-up del harness: NO se resuelve en este change.

## Cost

Estimated token cost per phase, aggregated from
`.ospec/session/remediate-cx1-strict-string-parity/phase-costs.jsonl`. Figures are
heuristic estimates (~4 bytes/token), not exact metering. All rows report
`cost-fields-unavailable`, so token/duration sums are 0.

| Phase | Invocations | Re-launches | Duration | Model Tiers | Statuses | Estimated Prompt Tokens | Estimated Artifact Tokens | Estimated Tool Output Tokens | Estimated Output Tokens |
|-------|-------------|-------------|----------|-------------|----------|-------------------------|---------------------------|------------------------------|-------------------------|
| apply | 1 | 0 | 0ms | default | success | 0 (estimated) | 0 (estimated) | 0 (estimated) | 0 (estimated) |
| archive | 1 | 0 | 0ms | cheap | unknown | 0 (estimated) | 0 (estimated) | 0 (estimated) | 0 (estimated) |
| review-change | 1 | 0 | 0ms | premium | unknown | 0 (estimated) | 0 (estimated) | 0 (estimated) | 0 (estimated) |
| review-efficiency | 3 | 2 | 0ms | default | unknown, success | 0 (estimated) | 0 (estimated) | 0 (estimated) | 0 (estimated) |
| review-evolution | 3 | 2 | 0ms | default | unknown, success | 0 (estimated) | 0 (estimated) | 0 (estimated) | 0 (estimated) |
| review-runtime | 3 | 2 | 0ms | default | unknown, success | 0 (estimated) | 0 (estimated) | 0 (estimated) | 0 (estimated) |
| review-trust | 3 | 2 | 0ms | default | unknown, success | 0 (estimated) | 0 (estimated) | 0 (estimated) | 0 (estimated) |
| verify | 2 | 1 | 0ms | premium | success | 0 (estimated) | 0 (estimated) | 0 (estimated) | 0 (estimated) |

**Total user questions asked**: 0 (sin campos `gates.*.questions_asked` en `state.yaml`;
las decisiones del gate se resolvieron vía approvals `quality-review-gate-001..005`)
