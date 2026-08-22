# Archive Report

**Change**: `k5-reconciliation`  
**Date**: 2026-08-22  
**Status**: review-gate-approved → archiving  
**Archive Plan**: `openspec/changes/k5-reconciliation/archive-plan.json`  
**Planned Destination**: `openspec/changes/archive/2026-08-22-k5-reconciliation`  
**Verification Verdict**: `PASS` · **Gate 4R**: `approved` (linaje terminal)

---

## Executive Summary

El cambio `k5-reconciliation` ha completado exitosamente su ciclo de implementación (Strict TDD), verificación formal (`PASS`, matriz V1–V7 conforme) y gobernanza: es el **primer change de la familia K5 que ejecuta formalmente el gate `4r-review-gate`** (linaje terminal `approved`, generación 1, 0 BLOCKER / 0 CRITICAL / 1 WARNING no bloqueante).

Resuelve los cuatro focos de deuda de cierre K5 detectados en exploración:

1. **A2 — Clasificación causal fail-closed** (`956cf33`): `mapLegacyRoutingTag` ahora mapea los tags legacy guionados (`code-bug`, `spec-gap`, `design-gap`, `tasks-gap`) a códigos canónicos existentes; el default `UNKNOWN_FAILURE_CODE` queda reservado a tags genuinamente desconocidos. Restaura el contrato declarado en `docs/architecture/harness-evolution.md`.
2. **B — Prueba real de no-inflación de presupuestos tras conflicto CAS** (`8f40c11`): el test e2e débil se reescribió con carrera stale-permit real contra Authority Store y `deepEqual` de presupuestos before/after; el matcher laxo de `index.test.js` se estrechó a `stale-permit` con doble evidencia (200/200 empírico + orden estático de autorización).
3. **C1/C2/C3 — Reconciliación documental** (`c3b6057`): estado `archived` + nota correctiva en el change archivado 2026-08-20, conteo de tareas reconciliado a 31 (verificado por checkboxes reales) y fila K5 del roadmap citando publicación v2.45.10 y remediaciones v2.45.7→v2.45.10.
4. **D — Gap de gobernanza cerrado**: este gate 4R salda la ausencia de linaje de revisión en los cuatro changes K5 previos (sin lineage retroactivo).

**Ruta bugfix sin spec deltas**: este cambio NO introduce dominios baseline nuevos ni modifica `openspec/specs/**`; la reconciliación fue código + tests + docs. `spec_writes` y `adr_promotions` del plan son vacíos por diseño.

Suite final: **2384 pass / 0 fail / 3 skipped** preexistentes del baseline (coincidencia literal entre apply y verify).

---

## Change Artifacts Inventory

- `exploration.md` ✅ (4 focos verificados con localización exacta; Opción 1 decidida para A2)
- `tasks.md` ✅ (5 fases, 9 tareas, ~115–160 líneas, riesgo Low)
- `apply-progress.md` ✅ (9/9 tareas ejecutadas; evidencia TDD; desviación de consolidación de commits registrada)
- `verify-report.md` ✅ (veredicto PASS; V1–V7 conforme; TDD compliance 6/6)
- `state.yaml` ✅ (status `review-gate-approved`; bloque gates.4r-review-gate con linaje persistido)
- `archive-report.md` ✅ (este documento)
- `archive-plan.json` ✅ (plan transaccional emitido; excluido del fingerprint por diseño auto-referencial)

Nota: ruta bugfix — sin `proposal.md`, `design.md`, `specs/` ni `decisions/`.

---

## Trazabilidad tarea → commit → test

| Tarea | Commit | Evidencia código | Evidencia test |
|---|---|---|---|
| 1.1 Extender switch `mapLegacyRoutingTag` | `956cf33` (+20) | `scripts/lib/causal-failure.js:83-102` (4 casos antes del default intacto :103-107) | `causal-failure.test.js:75,80,85,90` — deepEqual por tag |
| 1.2 Tests unitarios A2 | `956cf33` (+30) | — | `causal-failure.test.js:96-102` — fail-closed negativo (`nonexistent-tag`, `""`, `null`) |
| 2.1 Test e2e B reescrito | `8f40c11` | `k5-e2e-budgets-recovery.test.js:172-225` (store acotado, permit vs head.revision, segundo writer gana CAS) | deepEqual presupuestos before/after (:211,:224); outcome blocked + código exacto (:219-223) |
| 2.2 (condicional) Matcher estrechado | `8f40c11` | `scripts/lib/lifecycle-kernel/index.test.js:827` — `assert.equal(code, "stale-permit")`; determinismo demostrado (200/200 + orden estático `permits.js:111-113`) | 38/38 pass |
| 3.1 C1 estado archived | `c3b6057` | `archive/2026-08-20-k5-authoritative-enforcement-and-cas-remediation/state.yaml:5` + nota correctiva :2-4 | verificación textual |
| 3.2 C2 conteo 28→31 | `c3b6057` | mismo change: `state.yaml:41,43,49,54` y `apply-progress.md:5,58-59` + nota :11 | conteo grep de checkboxes: 31 `[x]` / 0 `[ ]` |
| 4.1 C3 fila roadmap K5 | `c3b6057` | `docs/roadmaps/harness-evolution.md:78` — v2.45.7→v2.45.10, formato alineado a K1–K4a | verificación textual |
| 5.1 Suite completa | registro apply | `node scripts/check.js` → All checks passed | tests 2387 · pass 2384 · fail 0 · skipped 3 (idéntico en verify) |
| 5.2 Gate 4R (gobernanza) | orquestador | `state.yaml` gates.4r-review-gate: linaje `sha256:ae91ecdb…`, findings frozen, terminal `no-unresolved-blocking-findings` | sin diff (por diseño) |

Desviación documentada: 3 commits en lugar de los 5 sugeridos (C1+C2+C3 consolidados por instrucción del orquestador; registrada en `apply-progress.md`).

---

## Verification Evidence Summary

- **Build / Suite**: `node scripts/check.js` PASSED ("All checks passed."); `node --test` → tests 2387 · pass 2384 · fail 0 · cancelled 0 · skipped 3.
- **Skipped**: 3 condicionales preexistentes del baseline (claude CLI no instalado; 2 locks Windows-specific). Sin regresiones (baseline previo 2380→2387 netos).
- **Archivos del change aislados**: causal-failure.test.js 7/7 · k5-e2e-budgets-recovery.test.js 6/6 · lifecycle-kernel/index.test.js 38/38.
- **Calidad de aserciones**: 0 tautologías, 0 ghost loops; fail-closed negativo explícito; deepEqual presupuestario sobre `getBudgets()` que clona.
- **Scope drift**: ninguno — diff de los 3 commits = exactamente los archivos declarados en IN; OUT intocado (`resolvePrimaryFailure`, `CAUSAL_PRIORITY`, `createCausalFailure`, `ALLOWED_ORIGINS`, schemas/fixtures, AuthorityStore).
- **Gate 4R**: generalista única (needs-specialist, dimensions=reliability) → lente review-reliability 1/1 → freezeFindings → terminal approved. Fingerprint de evidencia `sha256:c0704d60a921982b1103b5595`.

---

## Specs Prepared for Promotion

**Ninguna.** Ruta bugfix sin spec deltas: este change no introduce ni modifica dominios baseline; `openspec/specs/**` permanece intacto. El plan declara `spec_writes: []` conforme al contrato de `archive-plan.json` v1.

## Proposed ADR Promotions

**Ninguna.** Sin bloque `decisions/` (las decisiones quedaron registradas como key_decisions en `state.yaml`). El plan declara `adr_promotions: []`.

---

## Issues finales

| Severidad | Origen | ID | Descripción | Estado |
|---|---|---|---|---|
| CRITICAL | — | — | Ninguno (gate ni verify) | — |
| WARNING | gate 4R (reliability) | `F-7bb9293b802b7ec1` | El e2e no ejercita conflicto CAS posterior a efectos ejecutados; el deepEqual de presupuestos no verifica retención tras carrera real post-efectos (`k5-e2e-budgets-recovery.test.js:198`) | Congelado, no bloqueante (severity floor); follow-up aceptado |
| SUGGESTION | verify | S1 | El deepEqual de presupuestos compara before/after del bloqueo pero no fija literales iniciales `{attempts:3, corrections:2, turns:10}` | No bloqueante; mejora opcional futura |
| SUGGESTION | verify | S2 | Checkboxes de tasks.md sin marcar pese a finalización registrada | Cosmético; precedente del repo deja casillas marcadas |

## Follow-ups (post-archive)

1. **F-7bb9293b802b7ec1 (WARNING, candidato natural):** extender el e2e CAS a un escenario post-efectos (conflicto CAS después de mutaciones ejecutadas) para verificar retención presupuestaria tras carrera real post-efectos. Aceptado en `accepted_warnings` del plan.
2. **S1:** anclar los presupuestos del e2e B a sus literales iniciales además de la comparación before/after.
3. **S2:** marcar los checkboxes de `tasks.md` al completar (convención ya aplicada en changes archivados).

## Warnings del archive

Ninguno durante la emisión del plan: inventario estable (6 archivos), fingerprints calculados contra el árbol actual, sin staging previo ni journal residual bajo `.ospec/archive-tx/k5-reconciliation`.

---

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k5-reconciliation/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Plan-and-Report Status

- **Plan emitido**: `openspec/changes/k5-reconciliation/archive-plan.json` (schema v1, rollback `staging-rename`).
- **Escrituras vivas pendientes**: ninguna — no hay spec writes ni promociones ADR; la transacción solo moverá el directorio.
- **Movimiento de directorio pendiente**: el directorio activo `openspec/changes/k5-reconciliation/` se mantiene intacto. El orquestador invocará `node scripts/archive-transaction-run.js k5-reconciliation` y el receipt JSON será la única autoridad de cierre (`success` | `resumed-success`).
