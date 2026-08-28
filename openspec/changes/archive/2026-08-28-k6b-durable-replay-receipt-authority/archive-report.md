# Archive Report: K6b Durable Replay Receipt Authority

**Change**: `k6b-durable-replay-receipt-authority`
**Date**: 2026-08-28
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)
**Verification Verdict**: `PASS WITH WARNINGS` (accepted residual risk documented below)
**4R Gate**: approved (lineage revision 12, `all-remediation-slices-passed`, `archive_allowed: true`)

---

## Executive Summary

El cambio `k6b-durable-replay-receipt-authority` cierra los dos blockers de replay de v2.54.0 sin tocar `verifyCandidate`, strategy ni MUST-walk:

1. **Persistencia durable de `runner-receipt/v1` (B1 / IV-009 / AS-018)**:
   - Colección CAS aditiva `runner_receipts` en la raíz del registro de revisión, distinta de `authority.receipts` (OperationReceipt).
   - Tras restart: rehidratación, recomputación de `receipt_id`, fail-closed en divergencia, y reemisión de un `runnerReceiptChannel` **nuevo** (WeakMap efímero; no se serializa el canal).

2. **Binding de rol en replay independiente de `assessment_id` (B2 / AG-006 / ADR-004)**:
   - `normalizeRole(assessment.role)` MUST coincidir con el del receipt enlazado; mismatch → `GRAPH_DIVERGENCE` aunque `assessment_id` recompute idéntico.

3. **Wording AG-006 corregido**:
   - Persistibles = records `runner-receipt/v1` + bundle; el canal opaco NO es persistible.

**Secuencia de producto (residual, no es FAIL de verify):** K6b permanece `revise` hasta que el orchestrator complete esta transacción de archive y actualice la documentación de roadmap; entonces K6b puede pasar a `done` y K6c queda next-eligible.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS WITH WARNINGS`
- **Tasks Complete**: 24 / 24 (100%)
- **Scenarios Satisfied**: 24 / 25 (1 MUST WARNING heredado, aceptado como riesgo residual)
- **Targeted Tests**: 67 passed / 0 failed
- **Full Repository Test Suite (`npm test`)**: 2817 passed / 0 failed
- **4R**: 0 BLOCKER; CRITICAL F-e9dfc8f1b40b4940 remediado y validado; 6 WARNING + 2 SUGGESTION advisory (no bloquean archive)

### Accepted Residual Risk / Follow-up

| ID | Source | Summary | Disposition |
|----|--------|---------|-------------|
| `ag-006-receipt-token-attestation` | verify-report.md (tasks-gap) | Escenario heredado AG-006 "Assessment coverage not attested by the bound receipt" sin test runtime dedicado que ejercite la rama receipt-token (el check existe en `validateReplayRecords`; la tabla de mutaciones ejercita obligation-token mismatch) | **Aceptado** — no reabre B1/B2; follow-up opcional |

---

## Merged Specifications Summary (Change-Local Preparation)

| Domain | Action | Requirements | Status |
|--------|--------|--------------|--------|
| `assurance-graph` | Prepared (Merged) | **MODIFIED** `REQ-assurance-graph-006`: persistibles incluyen `runner-receipt/v1`; replay rehidrata records + canal reemitido; bind `normalizeRole(assessment.role)` ↔ receipt; escenarios cross-runtime y role tamper añadidos. REQ-001–005, 007–008 preservados. | ✅ Ready for runtime commit |
| `independent-verification` | Prepared (Merged) | **ADDED** `REQ-independent-verification-009`: persist/rehydrate/reissue; canal efímero; verifyCandidate unchanged. REQ-001–008 preservados. | ✅ Ready for runtime commit |
| `authority-store` | Prepared (Merged) | **ADDED** `REQ-authority-store-018`: colección CAS aditiva `runner_receipts`; kind mismatch fail-closed; restart restore sin mezclar familias. REQ-001–017 preservados. | ✅ Ready for runtime commit |

---

## Proposed ADR Promotions

| Source | Proposed Target | Title |
|--------|-----------------|-------|
| `decisions/adr-001.md` | `docs/adr/adr-20260828-015-distinct-cas-collection-field-runner-receipts.md` | Distinct CAS collection field `runner_receipts` |
| `decisions/adr-002.md` | `docs/adr/adr-20260828-016-additive-runner-receipts-digest-compute-revision.md` | Additive `runner_receipts_digest` in `computeRevision` |
| `decisions/adr-003.md` | `docs/adr/adr-20260828-017-persist-records-reissue-ephemeral-channel-after-restart.md` | Persist records; reissue ephemeral channel after restart |
| `decisions/adr-004.md` | `docs/adr/adr-20260828-018-replay-role-bind-independent-assessment-id.md` | Replay role bind independent of recomputed `assessment_id` |

---

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k6b-durable-replay-receipt-authority/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Change Inventory

- `.4r/decision.json`
- `.4r/diff.unified.patch`
- `.4r/evidence.json`
- `.4r/freeze-lineage.js`
- `.4r/lens-results.json`
- `.4r/lineage.json`
- `.4r/persist-lenses.js`
- `.4r/request-ids.json`
- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `decisions/adr-004.md`
- `design.md`
- `proposal.md`
- `specs/assurance-graph/spec.md`
- `specs/authority-store/spec.md`
- `specs/independent-verification/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Las escrituras finales en `openspec/specs/**` y `docs/adr/**`, así como el traslado atómico de la carpeta activa a `openspec/changes/archive/2026-08-28-k6b-durable-replay-receipt-authority` y la eliminación del directorio de origen tras verificación íntegra, son responsabilidad exclusiva del runtime determinista de transacción:
   ```bash
   node scripts/archive-transaction-run.js k6b-durable-replay-receipt-authority
   ```
3. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime es la única autoridad de cierre para el cambio.
4. Tras el archive exitoso, el orchestrator debe actualizar `docs/roadmaps/harness-evolution.md` y `docs/architecture/harness-evolution.md` para marcar K6b como `done` y desbloquear K6c.
