# Proposal: K5 Concurrency Hardening

## Intent

Blindar definitivamente el núcleo de K5 y resolver las 7 brechas técnicas identificadas en la auditoría de v2.45.12:
1. **Ownership real de ExecutionUsage**: Extraer deltas de consumo exclusivamente de `result.usage` / `result.execution_usage` de `effectExecutor`, eliminando `input.consumed` como autoridad externa del caller.
2. **Particionado de Carry-Over**: Keyear `pendingCarryOver` por `${subjectId}:${nodeId}` para aislar presupuestos entre nodos concurrentes y evitar contaminación cruzada.
3. **Journal Merge-Safe y Preservación de Tickets**: Implementar upsert/merge por `effect_id` en `commitJournal` y eliminar `entry.midOpTickets.clear()` en `AuthorityStore` al avanzar estado (borrando solo el ticket ganador), preservando tickets de perdedores para su reconciliación.
4. **Test E2E de No-Duplicación de Efectos**: Comprobar que tras perder el CAS, un reintento del mismo efecto por el writer perdedor no vuelve a invocar `effectExecutor` (0 ejecuciones duplicadas) reutilizando el registro del journal.
5. **Alineación Contractual de Zero-Delta**: Actualizar `REQ-execution-budgets-004` y ADR-004 para basar la deducción en `effect-bearing code mutation AND effectProgress === false` reconociendo que `repair` avanza a nivel de lifecycle (`outcome: "advanced"`).
6. **Integración Causal en Host Boundary**: Integrar `resolvePrimaryFailure` en la normalización de fallos de `host-boundary.js` y alinear specs de `failure-recovery`.
7. **Gobernanza de ADRs**: Formalizar los ADRs promovidos con `Status: accepted`.

## Scope

### In Scope
- Extraer consumo exclusivamente desde `result.usage` / `result.execution_usage` emitido por `effectExecutor` y purgar `input.consumed`.
- Particionar `pendingCarryOver` por `${subjectId}:${nodeId}`.
- Upsert/merge por `effect_id` en `commitJournal` en `AuthorityStore`, `MemoryStore` y `FileSystemStore`.
- Preservar `midOpTickets` de writers perdedores tras CAS exitoso eliminando únicamente el ticket ganador `entry.midOpTickets.delete(midOpTicket)`.
- Suite E2E que valide 0 invocaciones duplicadas a `effectExecutor` en reintentos post-CAS conflict mediante journal replay.
- Reformular `REQ-execution-budgets-004` y lógica de zero-delta para evaluar `effect-bearing code mutation AND effectProgress === false`.
- Integrar `resolvePrimaryFailure` en la normalización de fallos de `host-boundary.js`.
- Promover ADRs de K5 a `Status: accepted`.

### Out of Scope
- Reescritura del compilador declarativo K4a o generación de grafos.
- Modificaciones en transportes de hosts o identidades K3.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `execution-budgets`: `REQ-execution-budgets-003` (ownership de consumo desde `effectExecutor`, eliminación de `input.consumed`, carry-over particionado por `${subjectId}:${nodeId}`) y `REQ-execution-budgets-004` (zero-delta contractual delimitado a mutaciones de código con `effectProgress === false`).
- `authority-store`: `REQ-authority-store-003` y `REQ-authority-store-011` (`commitJournal` merge-safe por `effect_id` y preservación de `midOpTickets` para perdedores de CAS).
- `failure-recovery`: `REQ-failure-recovery-002` y `REQ-failure-recovery-003` (integración unificada de `resolvePrimaryFailure` en `host-boundary.js`).
- `operation-permits`: `REQ-operation-permits-005` (particionado obligatorio de `pendingCarryOver` por `${subjectId}:${nodeId}` para evitar contaminación de presupuestos entre nodos concurrentes).

## Approach

1. **Usage Ownership**: Modificar `runKernelOperation` en `scripts/lib/lifecycle-kernel/index.js` para computar `executedDelta` estrictamente desde `result.usage` / `result.execution_usage` emitido por `effectExecutor`.
2. **Carry-over Partitioning**: En `createKernelRuntime`, indexar `pendingCarryOver` usando `${subjectId}:${nodeId}`.
3. **Journal & Tickets**: Implementar merge/upsert por `effect_id` en `commitJournal` (`AuthorityStore`, `FileSystemStore`, `MemoryStore`) y reemplazar `entry.midOpTickets.clear()` por `entry.midOpTickets.delete(midOpTicket)`.
4. **Zero-delta Alignment**: Actualizar evaluación de zero-delta en runtime y reducer a `effect-bearing code mutation AND effectProgress === false`.
5. **Host Boundary Causal Integration**: Usar `resolvePrimaryFailure` en normalización de errores en `scripts/lib/lifecycle-kernel/host-boundary.js`.
6. **E2E Test & Governance**: Añadir test E2E de no duplicación de efectos en `scripts/k5-e2e-budgets-recovery.test.js` y actualizar ADRs a `Status: accepted`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-kernel/index.js` | Modified | Ownership de usage, particionado `${subjectId}:${nodeId}`, eliminación de `input.consumed`. |
| `scripts/lib/authority-store/index.js` | Modified | Preservación de tickets perdedores (eliminar `clear()`) y journal merge-safe. |
| `scripts/lib/filesystem-store.js` | Modified | Merge/upsert por `effect_id` en `commitJournal`. |
| `scripts/lib/lifecycle-kernel/memory-store.js` | Modified | Merge/upsert por `effect_id` en `commitJournal`. |
| `scripts/lib/lifecycle-kernel/host-boundary.js` | Modified | Integración de `resolvePrimaryFailure`. |
| `scripts/lib/execution-budgets.js` | Modified | Actualización de invariantes contractuales zero-delta y carry-over. |
| `scripts/k5-e2e-budgets-recovery.test.js` | Modified | Test E2E de 0 ejecuciones duplicadas de `effectExecutor`. |
| `openspec/specs/**` | Modified | Delta specs para `execution-budgets`, `authority-store`, `failure-recovery`. |
| `docs/adr/**` | Modified | Promoción de ADRs K5 a `Status: accepted`. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tickets huérfanos acumulados en memoria por writers que nunca reintentan | Low | Tickets indexados expiran naturalmente con el ciclo de vida del proceso y baseline digests. |
| Tests legados que suministren `input.consumed` | Low | Refactorizar suites de test para proveer `result.usage` desde el mock de `effectExecutor`. |

## Rollback Plan

Revertir los cambios en `scripts/lib/` y `openspec/specs/` mediante `git checkout` / `git revert`.

## Dependencies

- Módulo `authority-store`, `lifecycle-kernel`, `causal-failure.js`, `execution-budgets.js`.

## Success Criteria

- [ ] Deltas de carry-over extraídos únicamente desde `result.usage` / `result.execution_usage` de `effectExecutor`.
- [ ] `pendingCarryOver` aislado bajo la clave `${subjectId}:${nodeId}` sin cross-contamination.
- [ ] `commitJournal` realiza upsert/merge por `effect_id` y `AuthorityStore` preserva tickets de perdedores CAS.
- [ ] Test E2E valida 0 ejecuciones duplicadas de `effectExecutor` tras CAS conflict.
- [ ] `REQ-execution-budgets-004` evalúa zero-delta como `effect-bearing mutation AND effectProgress === false`.
- [ ] `host-boundary.js` integra `resolvePrimaryFailure` en su normalización de fallos.
- [ ] ADRs correspondientes actualizados a `Status: accepted`.
- [ ] 100% test suite pasando limpiamente (`npm test`).

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
