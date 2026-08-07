# Proposal: Remediación de Identidades de Ejecución y Candidate Freeze K3

## Intent

Corregir las vulnerabilidades y laxitudes detectadas en la especificación e implementación de identidades K3. Se busca garantizar la inviolabilidad de las 4 identidades de ejecución (`SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`), eliminar la aceptación de estructuras v1 no tipadas o maleables, imponer validaciones de binding fail-closed y prevenir ataques de suplantación/spoofing mediante un recálculo estricto de digests y una suite adversarial completa.

## Scope

### In Scope
- **Bloque 1**: Restaurar baseline pins de K1 en `scripts/lib/lifecycle-kernel/k1-compat.js` y preservar `candidate/v1` y `work-order/v1` intactos.
- **Bloque 2**: Crear `schemas/kernel/candidate/v2.schema.json` y `schemas/kernel/work-order/v2.schema.json` con discriminador `kind` explícito ("candidate/v2" y "work-order/v2").
- **Bloque 3**: Endurecer las 4 funciones `compute*`: requerir inputs obligatorios, validar formato digest `sha256:<64 hex>` e incluir payload canónico completo (incluyendo `dependencies`, `ownership`, `required_evidence` en `computeWorkOrderId`).
- **Bloque 4**: Establecer `freezeCandidate()` como constructor exclusivo de `candidate/v2`, rechazando campos vacíos y desambiguando `diffText` (siempre hasheado) vs `diff_hash` (digest validado).
- **Bloque 5**: Añadir `validateWorkOrderBinding()` y `validateWorkResultBinding()` con verificación fail-closed de `source_snapshot_id` y `work_order_id`.
- **Bloque 6**: Reescribir `evaluateCandidateRelation()` para recalcular digests de baseline y target desde sus payloads congelados, detectando `DECLARED_ID_MISMATCH` y fallback a `unknown`.
- **Bloque 7**: Reemplazar `validateIdentityKind()` por discriminación cerrada de `kind` + validación de schema JSON, e imponer la regla positiva para Attestation / Authorization (exigir `CandidateId` válido `sha256:<64 hex>`).
- **Bloque 8**: Crear suite de pruebas adversariales completa cubriendo 14 escenarios de ataque/bypasses.

### Out of Scope
- Modificación de schemas v1 entregados en K1 (`candidate/v1`, `work-order/v1`).
- Implementación del Execution Graph compiler (K4a) o aislamiento de workers (K6a).
- Emisión de `CandidateEvaluationAttestation` (K8) o `DeliveryAuthorization` (K10-delivery).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `execution-identities`: Endurecimiento de la separación de 4 identidades, esquemas v2 explícitos, validación estricta de bindings y freeze, evaluación determinista de relaciones y discriminación cerrada contra mutaciones o spoofing.

## Approach

Implementar las estructuras v2 y validadores en `scripts/lib/execution-identities/index.js` y schemas asociados. Las funciones `compute*` exigirán validación de formato `sha256:<64 hex>` en todos los digests referenciados. `freezeCandidate` construirá únicamente `candidate/v2` exigiendo que `diffText` sea procesado como digest SHA-256 de forma canónica. `evaluateCandidateRelation` ignorará los IDs declarados en los objetos y los recalculará de forma determinista para evitar suplantaciones. Se agregará una suite de pruebas unitarias y adversariales dedicadas.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/kernel/candidate/v2.schema.json` | New | Schema para `candidate/v2` con kind explícito |
| `schemas/kernel/work-order/v2.schema.json` | New | Schema para `work-order/v2` con kind explícito |
| `scripts/lib/lifecycle-kernel/k1-compat.js` | Modified | Restauración de baseline pins K1 |
| `scripts/lib/execution-identities/index.js` | Modified | Funciones compute*, freezeCandidate, bindings y evaluación de relación |
| `scripts/lib/execution-identities/index.test.js` | Modified | Suite de pruebas unitarias y 14 escenarios adversariales |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Incompatibilidad con consumidores legacy que esperen `v1` | Low | Preservación exacta de `v1` y exportación de funciones de compatibilidad |
| Falsos positivos en `evaluateCandidateRelation` por divergencia de digests | Med | Recálculo canónico normalizado de payloads en baseline y target |

## Rollback Plan

Revertir los cambios commits del branch `k3-identities-remediation` restaurando `scripts/lib/execution-identities/` y `schemas/kernel/` a su estado previo en main/v2.40.1.

## Dependencies

- K2a (Headless Conformance Host y `CapabilityProof` entregados en v2.40.0).

## Success Criteria

- [ ] `candidate/v2` y `work-order/v2` validados con schema estricto y discriminador `kind`.
- [ ] Las 4 funciones `compute*` rechazan inputs incompletos o digests fuera de formato `sha256:<64 hex>`.
- [ ] `validateWorkOrderBinding` y `validateWorkResultBinding` capturan desalineaciones de snapshot/work-order id fail-closed.
- [ ] `evaluateCandidateRelation` detecta `DECLARED_ID_MISMATCH` cuando el digest declarado no coincide con el recalculado.
- [ ] 14 escenarios de pruebas adversariales pasan correctamente en `npm test`.
