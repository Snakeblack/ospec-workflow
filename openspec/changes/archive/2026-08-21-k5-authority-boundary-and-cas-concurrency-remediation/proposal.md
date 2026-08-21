# Proposal: K5 Authority Boundary and CAS Concurrency Remediation

## Intent

Cerrar los 5 bloqueantes estructurales de K5 detectados tras v2.45.9 garantizando un boundary autoritativo estricto: controlled issuer consultando Authority Store y evaluando presupuestos antes de emitir permisos (`REQ-operation-permits-005`), consolidación y commit CAS para transiciones terminales de control (`escalate`, `stop`) incluso ante agotamiento presupuestario, enforcement causal estricto en `validateOperationTransition()` y `runKernelOperation()` (`REQ-lifecycle-kernel-runtime-026`), monotonicidad y carry-over de presupuestos gestionados por el runtime ante conflictos CAS multi-writer (`inv-k5-budget-monotonicity`), delimitación precisa de zero-delta para mutaciones de código reales reconociendo el avance del reducer, y promoción formal de ADR-007 a ADR-011 a `Status: accepted`.

## Scope

### In Scope
- **Controlled issuer autoritativo**: `createKernelRuntime().issuePermitForSelectedTransition()` consulta el Authority Store (`expected_revision`), evalúa `isBudgetExhausted()` y allowlist causal antes de emitir permits.
- **Transiciones terminales en CAS**: `runKernelOperation()` permite que transiciones terminales de control (`escalate`, `stop`) consoliden su estado y realicen commit CAS incluso ante agotamiento presupuestario.
- **Enforcement causal en boundary**: Integrar `validateRecoveryTransition()` en `validateOperationTransition()` y `runKernelOperation()` para bloquear invocaciones que eludan la matriz causal.
- **Monotonicidad y carry-over CAS runtime-owned**: El runtime gestiona el carry-over de presupuestos consumidos por efectos ejecutados tras perder una carrera CAS multi-writer sin requerir argumentos fabricados.
- **Semántica precisa de Zero-Delta**: Delimitar zero-delta exclusivamente a mutaciones de código/archivos que no produzcan avance semántico, reconociendo el progreso del ciclo de vida del reducer (`reduced.outcome !== "unchanged"`).
- **Aceptación de ADRs**: Promover `docs/adr/adr-20260820-007` a `011` a `Status: accepted`.

### Out of Scope
- Modificación de contratos K2a de adapters o host capabilities.
- Alteración de la compilación o grafos de ejecución K4a.
- Nuevos componentes de ejecución en contenedores o delivery authorization.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `operation-permits`: `REQ-operation-permits-005` exige que el controlled issuer consulte el Authority Store y evalúe presupuestos y matriz causal antes de emitir cualquier OperationPermit.
- `lifecycle-kernel-runtime`: `REQ-lifecycle-kernel-runtime-025` (carry-over y monotonicidad runtime-owned ante CAS race), `REQ-lifecycle-kernel-runtime-026` (enforcement causal en boundary y persistencia CAS de transiciones terminales), `REQ-lifecycle-kernel-runtime-027` (semántica precisa de zero-delta acotada a mutaciones de código).
- `execution-budgets`: `REQ-execution-budgets-003` (preservación presupuestaria runtime-owned ante conflicto CAS) y `REQ-execution-budgets-004` (zero-delta acotado a mutaciones efectivas sin penalizar avances semánticos del ciclo de vida).
- `failure-recovery`: `REQ-failure-recovery-002` y `REQ-failure-recovery-003` (enforcement de matriz causal en boundary y persistencia CAS terminal).
- `lifecycle-model-conformance`: `REQ-lifecycle-model-conformance-011` (`inv-k5-budget-monotonicity` con verificación de carrera multi-writer 100% runtime-owned).

## Approach

1. Modificar `issuePermitForSelectedTransition()` en `scripts/lib/lifecycle-kernel/index.js` para cargar el head actual del Authority Store cuando sea necesario, evaluando `isBudgetExhausted()` y `validateRecoveryTransition()` fail-closed.
2. Ajustar `runKernelOperation()` para exceptuar operaciones terminales de control (`escalate`, `stop`) del bloqueo preflight de budget exhaustion, permitiendo su reducción y commit CAS terminal.
3. Incorporar `validateRecoveryTransition(primaryFailure.category, operation)` dentro de `validateOperationTransition()` en `operations.js` y en la validación preflight de `runKernelOperation()`.
4. Refactorizar la gestión de conflicto CAS en `runKernelOperation()` y el modelo en `scripts/lib/lifecycle-model.js` para que el runtime rastree el consumo incurrido por effectExecutors y lo deduzca automáticamente en reintentos.
5. Refinar `isZeroDeltaMutation()` y las condiciones de deducción zero-delta en `reducer.js` e `index.js` para evaluar mutaciones con efectos reales y respetar `reduced.outcome !== "unchanged"`.
6. Actualizar el estado de ADR-007 a ADR-011 a `accepted`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/lifecycle-kernel/index.js` | Modified | Controlled issuer con Authority Store, bypass de preflight para terminales, enforcement causal y carry-over CAS. |
| `scripts/lib/lifecycle-kernel/operations.js` | Modified | Validación causal obligatoria en `validateOperationTransition`. |
| `scripts/lib/lifecycle-kernel/reducer.js` | Modified | Semántica de zero-delta acotada a mutaciones con avance semántico. |
| `scripts/lib/execution-budgets.js` | Modified | Ajustes en evaluación de zero-delta y retención presupuestaria. |
| `scripts/lib/lifecycle-model.js` | Modified | Actualización del checker `inv-k5-budget-monotonicity` con carry-over runtime-owned. |
| `docs/adr/adr-20260820-007*.md` - `011*.md` | Modified | Promoción a `Status: accepted`. |
| `openspec/specs/**` | Modified | Delta specs para capabilities modificadas. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Regresión en tests que invocaban `issuePermitForSelectedTransition` sincrónicamente sin store | Med | Soportar carga asíncrona transparente y fallback a state inyectado preservando backwards-compatibility. |
| Falsos positivos de budget exhaustion en transiciones de control | Low | Excluir explícitamente `escalate` y `stop` del preflight blocking en `runKernelOperation`. |
| Inconsistencia en carry-over presupuestario en reintentos CAS | Low | El runtime asocia el consumo al permit/operation id en el bag de autoridad y reduce el head re-sincronizado. |

## Rollback Plan

Revertir los commits del cambio mediante `git revert` restaurando los módulos del kernel a v2.45.9 y restableciendo el estado de los ADRs a `proposed`.

## Dependencies

- Capa Authority Store y CAS (`scripts/lib/authority-store/index.js`).
- Módulos `causal-failure.js`, `failure-recovery.js`, y `execution-budgets.js`.

## Success Criteria

- [ ] `issuePermitForSelectedTransition()` rechaza la emisión ante agotamiento presupuestario y violaciones causales consultando el Authority Store.
- [ ] `runKernelOperation()` consolida y persiste vía CAS transiciones `escalate` y `stop` ante presupuestos agotados.
- [ ] `validateOperationTransition()` y `runKernelOperation()` rechazan operaciones no allowlisteadas según causal taxonomy.
- [ ] `inv-k5-budget-monotonicity` pasa con 2 writers concurrentes sin argumentos fabricados en retry.
- [ ] Zero-delta no penaliza transiciones legítimas de control o avance de ciclo de vida.
- [ ] ADR-007 a ADR-011 promovidos a `Status: accepted`.
- [ ] 100% de la suite `npm test` y model invariants pasando limpiamente.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
