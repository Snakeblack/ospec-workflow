# Archive Report: K6b Trusted Evidence and Replay Closure

**Change**: `k6b-trusted-evidence-replay-closure`
**Date**: 2026-08-28
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)
**Verification Verdict**: `PASS` (0 critical issues, 0 warnings, 0 suggestions)

---

## Executive Summary

El cambio `k6b-trusted-evidence-replay-closure` implementa el cierre definitivo de las brechas de seguridad, causalidad e integridad criptográfica en el subsistema K6b (mitigando los bloqueadores B1, B2, B3 y el hallazgo H1):

1. **Segregación Física Estricta de rawEvidence (B1)**:
   - Normalización fail-closed en `normalizeEvidence` ante cualquier metadato o aserción semántica inyectada por el llamador (`role`, `obligation_ids`, `obligation_id`, `evidence_requirements_satisfied`), rechazando de inmediato con `UNTRUSTED_CALLER_METADATA`.
   - La observación física sólo admite propiedades de observación puras (`bytes`/`rawBytes`, `provenance`, `origin`, `node_id`, `execution_sequence`).

2. **Derivación Autoritativa de Satisfacción desde Runner Receipts (B2)**:
   - Erradicación total de la copia automática o ciega de `node.required_evidence` hacia `evidence_requirements_satisfied`.
   - Derivación exclusiva y verificada de satisfacción a partir de `receipts` / `runner_receipts` de ejecución y el Execution Graph.

3. **Cronología Causal Estricta sin Fallback a Arrays (B3)**:
   - Exigencia obligatoria de metadatos causales `execution_sequence` (`run_id`, `ordinal` monotónico creciente y enlace `previous_evidence_id`) en estrategias temporales (`strict-tdd`, `bug`, `refactor`).
   - Prohibición estricta de fallback al orden de elementos en arrays JSON, fallando inmediatamente con `STRATEGY_SEQUENCE_VIOLATION`.

4. **Replay Criptográfico Íntegro en Assurance Graph (H1)**:
   - Recomputación exhaustiva en `validateReplayRecords` / `replayAssuranceGraph` de `digestRawBytes`, `computeEvidenceId` y evaluación de suficiencia de procedencia mediante `evaluateProvenanceSufficiency`.
   - Detección y rechazo inmediato de cualquier discrepancia, mutación de bytes o procedencia insuficiente mediante `GRAPH_DIVERGENCE`.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS`
- **Tasks Complete**: 15 / 15 (100%)
- **Scenarios Satisfied**: 28 / 28 (100% de cumplimiento con pruebas automatizadas `runtime-test`)
- **Focal Automated Tests**: 95 passed / 0 failed (suites `independent-verifier`, `assurance-graph` y suites e2e)
- **Full Repository Test Suite (`npm test`)**: Exit code 0 (2790+ tests passed)
- **Contract Lint**: 0 offenders
- **Accepted Warnings**: Ninguno (0 warnings)

---

## Merged Specifications Summary (Change-Local Preparation)

Se prepararon las siguientes especificaciones principales integrando los deltas del cambio sobre las especificaciones maestras correspondientes:

| Domain | Action | Requirements Modified / Preserved | Status |
|--------|--------|-----------------------------------|--------|
| `independent-verification` | Prepared (Merged) | `REQ-independent-verification-003` (segregación física rawEvidence y UNTRUSTED_CALLER_METADATA), `REQ-005` (cobertura MUST derivada de receipts sin copia ciega), `REQ-006` (causalidad execution_sequence sin fallback a array); REQ-001, 002, 004, 007, 008 preservados intactos. | ✅ Ready for runtime commit |
| `assurance-graph` | Prepared (Merged) | `REQ-assurance-graph-006` (replay integral con computeEvidenceId, digestRawBytes y evaluateProvenanceSufficiency); REQ-001, 002, 003, 004, 005, 007, 008 preservados intactos. | ✅ Ready for runtime commit |

---

## Proposed ADR Promotions

Se proponen las siguientes decisiones arquitectónicas para su promoción formal a `docs/adr/` durante la ejecución de la transacción de archivo:

| Source | Proposed Target | Title |
|--------|-----------------|-------|
| `decisions/adr-001.md` | `docs/adr/adr-20260828-010-untrusted-caller-metadata-rejection.md` | Segregación física estricta de rawEvidence (UNTRUSTED_CALLER_METADATA) |
| `decisions/adr-002.md` | `docs/adr/adr-20260828-011-authoritative-receipt-derivation-no-blind-copy.md` | Derivación autoritativa de satisfacción desde Runner Receipts |
| `decisions/adr-003.md` | `docs/adr/adr-20260828-012-strict-causal-chronology-execution-sequence.md` | Cronología causal estricta mediante execution_sequence |
| `decisions/adr-004.md` | `docs/adr/adr-20260828-013-cryptographic-evidence-replay-integrity.md` | Replay criptográficamente íntegro en Assurance Graph |

---

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k6b-trusted-evidence-replay-closure/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Change Inventory

- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `decisions/adr-004.md`
- `design.md`
- `proposal.md`
- `specs/assurance-graph/spec.md`
- `specs/independent-verification/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Las escrituras finales en `openspec/specs/**` y `docs/adr/**`, así como el traslado atómico de la carpeta activa a `openspec/changes/archive/2026-08-28-k6b-trusted-evidence-replay-closure` y la eliminación del directorio de origen tras verificación íntegra, son responsabilidad exclusiva del runtime determinista de transacción:
   ```bash
   node scripts/archive-transaction-run.js k6b-trusted-evidence-replay-closure
   ```
3. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime es la única autoridad de cierre para el cambio.
