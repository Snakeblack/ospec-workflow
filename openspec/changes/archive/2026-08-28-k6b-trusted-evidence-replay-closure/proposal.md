# Proposal: K6b Trusted Evidence and Replay Closure

## Intent

Cerrar definitivamente las brechas de seguridad e integridad en K6b (Blockers B1, B2, B3 y Hallazgo H1): segregar físicamente las observaciones (`rawEvidence`) rechazando metadatos semánticos inyectados por el caller, eliminar la copia ciega de `required_evidence` derivando satisfacción únicamente desde runner receipts confiables, imponer cronología causal estricta basada en `execution_sequence` (prohibiendo fallback a orden de array), y asegurar replay exhaustivo de `evidence/v2` con recomputación de `computeEvidenceId`, digest de bytes y suficiencia de provenance.

## Scope

### In Scope
- Segregación estricta en `rawEvidence`: rechazar inmediatamente con `UNTRUSTED_CALLER_METADATA` si contiene `role`, `obligation_ids`, `obligation_id` o `evidence_requirements_satisfied`.
- Derivación autoritativa de satisfacción y rol a partir del Execution Graph y runner receipts (`receipts` / `runner_receipts`), eliminando la copia automática/ciega de `node.required_evidence`.
- Validación cronológica causal estricta en `evaluateStrategy` para Strict TDD, Bug y Refactor mediante `execution_sequence` (`run_id`, `ordinal` monotónico creciente y encadenamiento `previous_evidence_id`), prohibiendo fallback a la posición del array JSON.
- Replay exhaustivo en `assurance-graph` recomputando `digestRawBytes`, `computeEvidenceId` y `evaluateProvenanceSufficiency`, fallando con `GRAPH_DIVERGENCE` ante discrepancias o evidencias manipuladas.
- Actualización y endurecimiento de las especificaciones canónicas de `independent-verification` y `assurance-graph`.

### Out of Scope
- Challenges adversariales K6c (mutación de tests, reversiones automáticas) y análisis de complejidad K6d.
- Attestation formal de evaluación de entrega K8 y autorizaciones de release K10.
- Modificación de esquemas base `assessment/v2` o `evidence/v2` (se mantiene su definición canónica existente).

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `independent-verification`: Segregación estricta de `rawEvidence` con rechazo `UNTRUSTED_CALLER_METADATA`, derivación autoritativa de cobertura desde runner receipts sin copia ciega de `required_evidence`, y validación cronológica obligatoria basada en `execution_sequence` sin fallback al orden de array en Strict TDD, Bug y Refactor.
- `assurance-graph`: Replay integral de `evidence/v2` recomputando `computeEvidenceId`, digest de bytes y suficiencia de provenance frente a collector/transport de confianza, fallando con `GRAPH_DIVERGENCE`.

## Approach

1. Modificar `normalizeEvidence` para validar que `rawEvidence` carezca de propiedades semánticas (`role`, `obligation_ids`, `obligation_id`, `evidence_requirements_satisfied`), retornando `UNTRUSTED_CALLER_METADATA` en caso contrario.
2. Actualizar el enlace en `verifyCandidate` para correlacionar runner receipts con nodos y obligaciones del Execution Graph para inferir `evidence_requirements_satisfied`, eliminando la copia estática de `node.required_evidence`.
3. Reemplazar la validación basada en índices de array en `strategy-policy.js` por verificación causal obligatoria sobre `execution_sequence` (`run_id` consistente, `ordinal` estrictamente creciente y enlace `previous_evidence_id`).
4. Extender `validateReplayRecords` en `assurance-graph/index.js` para recomputar `computeEvidenceId` y digest de bytes de `evidence/v2`, y evaluar suficiencia de provenance, detonando `GRAPH_DIVERGENCE` ante cualquier falla.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `scripts/lib/independent-verifier/**` | Modified | Rechazo `UNTRUSTED_CALLER_METADATA`, derivación desde receipts, validación causal `execution_sequence` |
| `scripts/lib/assurance-graph/**` | Modified | Recomputación de `evidence_id`, bytes digest y suficiencia de provenance en replay |
| `openspec/specs/independent-verification/spec.md` | Modified | Especificación de segregación estricta de caller metadata y cronología causal |
| `openspec/specs/assurance-graph/spec.md` | Modified | Especificación de replay exhaustivo de evidencias y provenance |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Falso rechazo de suites de prueba existentes por omitir `execution_sequence` | Med | Adaptar generadores de fixtures/receipts de test para incluir `execution_sequence` canónico |
| Fallo en replay por bytes de evidencia no persistidos | Low | Requerir almacenamiento o paso canónico de rawBytes/bytes en replay para validación de digest e ID |

## Rollback Plan

Revertir los cambios en `scripts/lib/independent-verifier/` y `scripts/lib/assurance-graph/`, restaurando el comportamiento previo de normalización y replay mediante git revert del commit asociado.

## Dependencies

- Node.js 22+, suite de testing canónica `node --test`, baselines K4b/K6a archivados.

## Success Criteria

- [ ] `normalizeEvidence` rechaza con `UNTRUSTED_CALLER_METADATA` cualquier payload con `role`, `obligation_id(s)` o `evidence_requirements_satisfied`.
- [ ] La satisfacción de obligaciones se deriva exclusivamente de receipts de ejecución y Execution Graph sin copiar ciegamente `node.required_evidence`.
- [ ] Strict TDD, Bug y Refactor validan cronología causal estricta mediante `execution_sequence` (`run_id`, `ordinal`, `previous_evidence_id`), rechazando fallback al orden de array.
- [ ] `replayAssuranceGraph` recomputa `computeEvidenceId`, valida digest de bytes y evalúa suficiencia de provenance, fallando con `GRAPH_DIVERGENCE` ante discrepancias.
- [ ] Todos los tests unitarios y de integración de `independent-verifier` y `assurance-graph` pasan satisfactoriamente.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
