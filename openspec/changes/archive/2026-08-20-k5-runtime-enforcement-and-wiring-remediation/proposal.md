# Proposal: K5 Runtime Enforcement and Wiring Remediation

## Intent

Remediar e integrar de extremo a extremo las garantías de K5 en el runtime autoritativo del lifecycle kernel, eliminando desajustes de cableado (wiring gaps), garantizando transiciones de recuperación explícitas (`repair`, `replan`, `escalate`, `stop`) sin sustituciones silenciosas, unificando la evaluación exhaustiva de presupuestos en `isBudgetExhausted()`, haciendo fail-closed la validación de ámbitos de reparación (`validateRepairScope()`), conectando honest recovery y contabilidad zero-delta a nivel de CAS, endureciendo los 7 checkers de invariantes K5 hacia composición real, actualizando los ADRs de K5 a `accepted` y preparando la release `2.45.8`.

## Scope

### In Scope
- **Transition Matrix Real**: Mapeo y emisión de transiciones explícitas (`repair`, `replan`, `escalate`, `stop`) en el selector sin sustitución silenciosa de `escalate` por `decide`.
- **Unified `isBudgetExhausted()`**: Función unificada que evalúa las 6 dimensiones de nodo (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`) y las 4 de autoridad (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`), aplicando podado terminal en selector, reducer y emisión de permisos.
- **Fail-Closed `validateRepairScope()`**: Validación estricta que rechaza scopes vacíos o inválidos e integración en la ruta autoritativa de ejecución.
- **Wiring de Honest Recovery y Zero-Delta**: Conexión de `validateRecoveryHonesty()`, `blockingFingerprint()` y contabilidad zero-delta en `runKernelOperation()` y commit atómico de CAS.
- **Hardening de Invariantes K5**: Endurecimiento de los 7 checkers de invariantes K5 para validar composición real del runtime, selector, reducer y CAS.
- **Deuda Documental y Release 2.45.8**: Transición de ADR-001, ADR-002 y ADR-003 a `accepted` e incremento de versión a `2.45.8`.

### Out of Scope
- Aislamiento de contenedores de workers o ejecución de work order capsules (K6a).
- Verificación multi-estrategia o emisión de review authority externa (K6b, K7, K8).

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `failure-recovery`: Transiciones explícitas (`repair`, `replan`, `escalate`, `stop`), `validateRepairScope` fail-closed ante scopes vacíos/inválidos e integración con el runtime.
- `execution-budgets`: Evaluación exhaustiva en `isBudgetExhausted` para 6 dimensiones de nodo y 4 de autoridad, con contabilidad zero-delta integrada en el runtime.
- `lifecycle-kernel-runtime`: Enforcement de recovery honesty, avance de `blockingFingerprint`, zero-delta y control presupuestario en `runKernelOperation`, selector, reducer y CAS.
- `lifecycle-model-conformance`: Endurecimiento de los 7 checkers de invariantes K5 evaluando composición runtime/store/CAS real.

## Approach

1. Implementar `isBudgetExhausted()` en `scripts/lib/execution-budgets.js` para evaluar integralmente límites de nodo y autoridad.
2. Hacer `validateRepairScope()` fail-closed ante scopes inválidos o vacíos en `scripts/lib/failure-recovery.js`.
3. Ajustar `transition-selector.js` y `reducer.js` para emitir transiciones explícitas y podar ejecuciones agotadas.
4. Conectar validación de honest recovery, `blockingFingerprint()` y mutaciones zero-delta directamente en el ciclo de ejecución y commit CAS de `index.js`.
5. Actualizar los 7 checkers de `lifecycle-model.js` para comprobar el runtime completo en lugar de funciones aisladas.
6. Actualizar ADRs K5 a `accepted` y versionado en `package.json` y `openspec/config.yaml`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/execution-budgets.js` | Modified | Exporta `isBudgetExhausted()` con evaluación exhaustiva (6 nodo + 4 autoridad) |
| `scripts/lib/failure-recovery.js` | Modified | `validateRepairScope()` fail-closed y transiciones explícitas sin bypass |
| `scripts/lib/lifecycle-kernel/` | Modified | Wiring en `transition-selector.js`, `reducer.js`, `recovery.js` e `index.js` |
| `scripts/lib/lifecycle-model.js` | Modified | Hardening de los 7 checkers de invariantes K5 con composición real |
| `docs/adr/adr-20260817-*.md` | Modified | Estado actualizado a `accepted` en los 3 ADRs de K5 |
| `package.json`, `openspec/config.yaml` | Modified | Bump de versión a `2.45.8` |
| `scripts/**/*.test.js` | Modified | Pruebas unitarias, de integración y modelo para el runtime endurecido |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bloqueo prematuro por fail-closed en scopes de reparación legítimos | Med | Validar scopes estándar predefinidos en fixtures y operaciones |
| Regresión en suites de pruebas existentes por cambio de transiciones | Med | Mantener compatibilidad con selector y verificar suite completa con `npm test` |

## Rollback Plan

Revertir los commits de esta change con `git revert`. Al tratarse de lógica pura y cableado en el runtime y tests de Node.js, revertir devuelve el comportamiento a los helpers de K5 previos sin afectar esquemas persistidos.

## Dependencies

- K5 base (`2026-08-17-k5-budgets-failures-recovery` archivado).

## Success Criteria

- [ ] `isBudgetExhausted()` detecta agotamiento en todas las dimensiones de nodo y autoridad.
- [ ] `validateRepairScope()` falla cerrado ante scopes vacíos o inválidos.
- [ ] Selector emite `escalate` explícito sin sustitución silenciosa por `decide`.
- [ ] `runKernelOperation` y CAS ejecutan validación de honest recovery y contabilidad zero-delta.
- [ ] Los 7 checkers de invariantes K5 pasan evaluando composición runtime/CAS real.
- [ ] ADRs 001, 002 y 003 de K5 marcados como `accepted`.
- [ ] `npm test` pasa al 100% de pruebas y versión sube a `2.45.8`.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
