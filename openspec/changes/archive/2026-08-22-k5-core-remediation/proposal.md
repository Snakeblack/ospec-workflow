# Proposal: K5 Core Technical Remediation

## Intent

Remediar de forma exhaustiva y definitiva las 7 brechas técnicas del núcleo de K5 identificadas tras el review técnico de v2.45.11:
1. **Test E2E CAS de carrera post-efecto**: Verificar dos writers concurrentes que completan `effectExecutor` antes del CAS, demostrando retención de carry-over y no duplicación de efectos en el perdedor.
2. **Carry-over multidimensional runtime-owned**: Preservar todas las dimensiones consumidas (`turns`, `commands`, `patches`, `changed_lines`, `wall_time_minutes`, `effect_attempts`) calculadas desde el delta ejecutado real.
3. **Semántica de zero-delta contractual**: Separar `lifecycleProgress` de `effectProgress`, penalizando únicamente mutaciones effect-bearing de código con `reduced.outcome === "unchanged"`.
4. **Unificación de `resolvePrimaryFailure()`**: Aplicar resolución idéntica y determinista en selector de transiciones, emisor de permits y host boundary.
5. **Saneamiento de concurrencia en store y journal**: Prevenir sobreescrituras ciegas en `commitJournal` y garantizar aislamiento multi-writer sin pérdida de efectos ni desincronización de tickets.
6. **Emisor de permits estrictamente autoritativo**: Eliminar el fallback inseguro a `input.state` y exigir snapshot autoritativo del store (fail-closed).
7. **Default fail-closed en `mapLegacyRoutingTag`**: Mapear tags desconocidos a categoría no-reparable (`validation_gap`) impidiendo transiciones `repair` ilegítimas.

## Scope

### In Scope
- **Test E2E CAS post-efecto**: Suite E2E con 2 writers concurrentes ejecutando efectos antes de la resolución CAS, validando monotonicidad de carry-over y reintento idempotente.
- **Carry-over multidimensional completo**: Seguimiento de las 6 dimensiones de nodo y 4 de autoridad sobre deltas de consumo reales.
- **Zero-delta contractual**: Distinción clara entre progreso de ciclo de vida y mutación de archivos, restringiendo la penalización a no-avance con `reduced.outcome === "unchanged"`.
- **Resolución causal uniforme**: Integración centralizada de `resolvePrimaryFailure()` en `transition-selector.js`, `permit-authority.js`/`index.js` y `host-boundary.js`.
- **Aislamiento multi-writer en store**: Manejo de `mid_op_ticket` por revisión/escritor y protección contra sobreescrituras ciegas en `commitJournal`.
- **Controlled issuer fail-closed**: Emisión de permisos vinculada exclusivamente a snapshots autoritativos de `AuthorityStore`.
- **Default seguro en routing causal**: Mapeo de tags no reconocidos en `mapLegacyRoutingTag` a `validation_gap` (`UNKNOWN_ROUTING_TAG`) con prohibición de `repair`.

### Out of Scope
- Modificación del dialecto declarativo o compilador K4a.
- Rediseño de adapters de transporte de host K2a.
- Modificaciones en runtime de identidades K3.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `execution-budgets`: `REQ-execution-budgets-003` (carry-over multidimensional sobre deltas reales) y `REQ-execution-budgets-004` (zero-delta contractual delimitado a mutaciones de código con `reduced.outcome === "unchanged"`).
- `failure-recovery`: `REQ-failure-recovery-001` (default fail-closed de `mapLegacyRoutingTag` a `validation_gap` impidiendo `repair`), `REQ-failure-recovery-002` y `REQ-failure-recovery-003` (unificación de `resolvePrimaryFailure()` en selector, permit issuer y boundary).
- `authority-store`: `REQ-authority-store-003` y `REQ-authority-store-011` (aislamiento multi-writer en `commitJournal` y gestión concurrente de `mid_op_ticket`).
- `operation-permits`: `REQ-operation-permits-005` (eliminación de fallback `input.state`, fail-closed sin snapshot de store autoritativo).

## Approach

1. Modificar `mapLegacyRoutingTag` en `scripts/lib/causal-failure.js` para que el `default` retorne `{ category: "validation_gap", code: "UNKNOWN_ROUTING_TAG" }`, bloqueando transiciones `repair`.
2. Actualizar `scripts/lib/authority-store/index.js` para soportar tracking multi-ticket por revisión en `commitJournal` evitando colisiones entre writers concurrentes.
3. Refactorizar `issuePermitForSelectedTransition()` en `scripts/lib/lifecycle-kernel/index.js` para rechazar emisiones cuando no exista store snapshot autoritativo válido, eliminando `input.state`.
4. Unificar la extracción y priorización de fallos usando `resolvePrimaryFailure()` en `transition-selector.js`, la validación del controlled issuer en `index.js`, y el manejo de fallos en el host boundary.
5. Ajustar la detección de zero-delta en `reducer.js` e `index.js` para condicionar la deducción dual de turnos e intentos a mutaciones de código efectivas donde `reduced.outcome === "unchanged"`.
6. Extender el mecanismo de carry-over en `createKernelRuntime` para acumular exhaustivamente deltas reales de todas las dimensiones declaradas tras un `cas-conflict`.
7. Crear un test E2E robusto en `scripts/k5-e2e-budgets-recovery.test.js` que simule dos writers concurrentes ejecutando `effectExecutor` antes del commit CAS, verificando la retención de carry-over y la no duplicación de efectos.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/causal-failure.js` | Modified | Default de `mapLegacyRoutingTag` a `validation_gap` fail-closed. |
| `scripts/lib/authority-store/index.js` | Modified | Aislamiento concurrente de `commitJournal` y tickets multi-writer. |
| `scripts/lib/lifecycle-kernel/index.js` | Modified | Controlled issuer autoritativo, carry-over multidimensional y `resolvePrimaryFailure`. |
| `scripts/lib/lifecycle-kernel/transition-selector.js` | Modified | Unificación de fallos primarios con `resolvePrimaryFailure`. |
| `scripts/lib/lifecycle-kernel/reducer.js` | Modified | Separación de lifecycleProgress y zero-delta effectProgress. |
| `scripts/lib/execution-budgets.js` | Modified | Validación de deltas multidimensionales y contratos zero-delta. |
| `scripts/k5-e2e-budgets-recovery.test.js` | Modified | Nuevo test E2E CAS post-efecto con writers concurrentes. |
| `openspec/specs/**` | Modified | Delta specs para capabilities modificadas. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Incompatibilidad en tests unitarios que pasaban `input.state` sin mock de store | Med | Asegurar que los helpers de test inicialicen un `AuthorityStore` ligero o `createMemoryStore`. |
| Regresión en routing de tags legacy no registrados | Low | Tests exhaustivos para tags canónicos y verificación fail-closed para desconocidos. |
| Desincronización de tickets de journal en CAS de alta concurrencia | Low | Estructura Map de tickets indexada por `fromRevision` y `stateDigest` en `AuthorityStore`. |

## Rollback Plan

Revertir los commits del change mediante `git revert`, restaurando las implementaciones previas de `causal-failure.js`, `authority-store/index.js` y `lifecycle-kernel`.

## Dependencies

- Núcleo de Authority Store y CAS (`scripts/lib/authority-store/index.js`).
- Módulos `causal-failure.js`, `execution-budgets.js`, `failure-recovery.js`.

## Success Criteria

- [ ] Test E2E CAS post-efecto pasa demostrando retención de carry-over y no duplicación de efectos en writer perdedor.
- [ ] Carry-over acumula todas las dimensiones consumidas (`turns`, `commands`, `patches`, `changed_lines`, `wall_time_minutes`, `effect_attempts`).
- [ ] Mutaciones zero-delta se aplican exclusivamente ante `reduced.outcome === "unchanged"`.
- [ ] `resolvePrimaryFailure()` se invoca de forma idéntica en selector, permit issuer y boundary.
- [ ] `commitJournal` aísla múltiples writers sin sobreescritura de tickets ni pérdida de efectos.
- [ ] `issuePermitForSelectedTransition` falla cerrado sin snapshot de store autoritativo (sin fallback a `input.state`).
- [ ] Tags desconocidos en `mapLegacyRoutingTag` resuelven a `validation_gap` impidiendo transiciones `repair`.
- [ ] 100% de los tests (`npm test`) pasando sin regresiones.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
