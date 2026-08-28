# Proposal: k6b-durable-replay-receipt-authority

## Intent

Cerrar en replay, y solo ahí, los dos blockers de v2.54.0: el canal opaco no sobrevive un restart (REQ-006 lo lista como persistible; el WeakMap es efímero), y `validateReplayRecords` no ata `assessment.role` al RunnerReceipt — un tamper `acceptance→integration` con `assessment_id` recomputado pasa. Reutilizar `runner-receipt/v1` (ADR-014). Sin PKI. K6b sigue `revise`; K6c bloqueado hasta archive.

## Scope

### In Scope
- Persistir `runner-receipt/v1` en el CAS K2.1, colección distinta de `authority.receipts` (`OperationReceipt`).
- Post-restart: rehidratar, recomputar `receipt_id`, reemitir un `runnerReceiptChannel` **nuevo**. Canal efímero; no serializar WeakMap.
- Replay: `normalizeRole(assessment.role)` MUST igualar `normalizeRole(runnerReceipt.role)`; mismatch → `GRAPH_DIVERGENCE` aunque `assessment_id` coincida.
- Corregir REQ-006: persistibles = records `runner-receipt/v1`, no el canal.
- Adversariales: restart A→B / mismo `graph_id`; receipt ausente → `GRAPH_DIVERGENCE`; role tampered + id recomputado → `GRAPH_DIVERGENCE`.
- Docs: K6b `revise`; K6c `blocked` hasta archive.

### Out of Scope
- `verifyCandidate`, strategy, MUST-walk, cronología, seguridad in-process del WeakMap.
- Serializar WeakMap; PKI; mezclar con `OperationReceipt`.
- Mutar `evidence/v2`, `verification/v2`, pins K1; nueva familia de schema.
- Arrancar K6c.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `assurance-graph`: REQ-006 deja de tratar el canal como persistible; replay exige records rehidratados + canal reemitido; binding de roles en assessments.
- `independent-verification`: runtime persiste `runner-receipt/v1` y, post-restart, rehidrata / recomputa `receipt_id` / reemite canal. `replay_evidence` sigue con `runner_receipt_id`. verifyCandidate/strategy/MUST-walk intactos.
- `authority-store`: bolsa durable aditiva para `runner-receipt/v1` en el CAS; no sobrecargar `authority.receipts`. Restauración en restart (extiende REQ-013).

## Approach

Delta spec: persistible = records + bundle; canal = capability efímera reemitida. CAS: bolsa hermana, kind `runner-receipt/v1` only; nombre de campo design-owned. Rehidratación: load → schema → recompute `receipt_id` → fail-closed si diverge → `issueRunnerReceiptChannel` (WeakMap vacío al arrancar). Replay: canal reemitido; receipt ausente o role mismatch → `GRAPH_DIVERGENCE`. Tests + roadmap.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/specs/assurance-graph/` | Modified | REQ-006; role binding |
| `openspec/specs/independent-verification/` | Modified | persist/rehydrate/reissue |
| `openspec/specs/authority-store/` | Modified | bolsa distinta de OperationReceipt |
| `scripts/lib/assurance-graph/index.js` | Modified | check de role en replay |
| `scripts/lib/independent-verifier/internal/runner-receipt-channel.js` | Modified | rehydrate + reissue |
| `scripts/lib/authority-store/index.js` | Modified | colección CAS aditiva |
| `docs/{architecture,roadmaps}/harness-evolution.md` | Modified | K6b `revise`; K6c blocked |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mezclar RunnerReceipt en `authority.receipts` | High | Colección distinta; kind check |
| Serializar canal / WeakMap | Med | Solo records; canal nuevo post-restart |
| `assessment_id` oculta tamper de role | High | `normalizeRole` aparte de identity |
| CAS rompe consumidores K2.1 | Med | Campo aditivo; OperationReceipt intacto |

## Rollback Plan

Revertir runtime, bolsa CAS, deltas, tests y docs como unidad. Conservar `authority.receipts`, schema `runner-receipt/v1`, WeakMap, pins `evidence/v2` / `verification/v2` / K1. Sin migrar receipts parciales. K6b `revise`; K6c bloqueado hasta archive.

## Dependencies

- v2.54.0 `runner-receipt/v1` + canal opaco (ADR-014); CAS K2.1.
- `normalizeRole` / `computeAssessmentId` ya incluyen role; el hueco es el binding contra el receipt.
- Delivery: `exception-ok`.

## Success Criteria

- [ ] Verify en A → persistir bundle + RunnerReceipts → destruir A → B rehidrata → reemite capability → replay → mismo `graph_id`.
- [ ] Receipt persistido ausente → `GRAPH_DIVERGENCE`.
- [ ] Role tampered (`acceptance→integration`) con `assessment_id` recomputado → `GRAPH_DIVERGENCE`.
- [ ] Canal post-restart ≠ pre-restart; copiar campos públicos no reconstruye autoridad.
- [ ] `authority.receipts` sigue siendo solo `OperationReceipt`.
- [ ] Roadmap: K6b `revise`; K6c blocked hasta archive.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
