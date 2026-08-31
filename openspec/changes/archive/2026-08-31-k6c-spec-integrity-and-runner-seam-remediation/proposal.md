# Proposal: Remediación Quirúrgica K6c de Integridad de Specs y Runner Seam

## Intent

Resolver dos vulnerabilidades críticas de integridad en el subsistema K6c:
1. Truncamiento y corrupción de especificaciones canónicas (`openspec/specs/adversarial-challenges/spec.md` perdió `REQ-003` y `REQ-004` introduciendo el token `undefined`) debido a falta de validación fail-closed en el archivador contra eliminación de requisitos o emisión de tokens espurios.
2. Existencia de un seam de evasión (`context.runWorkspaceTests`) en `executeChallengePlan` que permite a llamadores inyectar runners simulados para burlar el sandbox de mutación y reversión.

## Scope

### In Scope
- Restaurar `openspec/specs/adversarial-challenges/spec.md` con `REQ-001`, `REQ-002`, `REQ-003` y `REQ-004` completos y sin tokens `undefined`.
- Implementar validación fail-closed en `scripts/lib/archive-plan.js` y `scripts/lib/archive-transaction.js` para rechazar specs con tokens "undefined" o con eliminación no declarada de REQ IDs respecto a `target_before`.
- Añadir tests de invariantes en `scripts/manifest-sync.test.js` y `scripts/lib/archive-plan.test.js` verificando integridad de specs canónicas y retención de REQ IDs.
- Eliminar el seam `context.runWorkspaceTests` en `executeChallengePlan` y `runIsolatedMutation` (`scripts/lib/adversarial-challenges/runner.js`), confinando la inyección de tests exclusivamente a parámetros directos en pruebas unitarias internas.
- Añadir test adversarial negativo que demuestre que `executeChallengePlan` ignora mocks en contexto y ejecuta estrictamente el sandbox.

### Out of Scope
- Modificación del catálogo de challenges o del algoritmo de presupuesto causal.
- Reescritura del motor AST de mutación.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `adversarial-challenges`: Confinamiento estricto de la ejecución de challenges en sandbox sin exposición de seams de mock en el contexto público de ejecución (`REQ-adversarial-challenges-004`), y preservación íntegra de `REQ-001` a `REQ-004`.
- `archive-plan-contract`: Validación fail-closed de contenido en `spec_writes` para rechazar tokens `undefined` y supresión no declarada de identificadores de requisitos (`REQ-archive-plan-contract-002`, `REQ-archive-plan-contract-003`).
- `archive-transaction-runtime`: Preflight estricto con validación de integridad sintáctica y estructural de especificaciones antes de autorizar mutaciones de commit (`REQ-archive-transaction-runtime-001`).

## Approach

- **Restauración de Spec**: Integrar las secciones completas de `REQ-003` y `REQ-004` manteniendo la actualización de `REQ-002` en `adversarial-challenges/spec.md`.
- **Validación en Archive**: Añadir a `validatePlanAgainstSnapshot` y preflight la comprobación sintáctica de contenido (rechazo de `undefined`) y verificación de paridad de `{#REQ-...}` entre `target_before` y contenido preparado.
- **Confinamiento de Runner**: Reemplazar la resolución de `context.runWorkspaceTests` en `runner.js` por la ejecución obligatoria de `runWorkspaceTests` sandboxed en `executeChallengePlan`, permitiendo `_testRunner` directo sólo en la función interna `runIsolatedMutation`.
- **Test Invariants**: Extender `manifest-sync.test.js` para auditar todas las specs en `openspec/specs/**/spec.md`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/specs/adversarial-challenges/spec.md` | Modified | Restauración completa de REQ-001..REQ-004 |
| `scripts/lib/adversarial-challenges/runner.js` | Modified | Eliminación de `context.runWorkspaceTests` |
| `scripts/lib/adversarial-challenges/runner.test.js` | Modified | Migración a `_testRunner` directo y test adversarial contra seam bypass |
| `scripts/lib/archive-plan.js` | Modified | Validación fail-closed contra "undefined" y dropped REQ IDs |
| `scripts/lib/archive-transaction.js` | Modified | Verificación de integridad en preflight |
| `scripts/lib/archive-plan.test.js` | Modified | Tests de validación de integridad de spec |
| `scripts/manifest-sync.test.js` | Modified | Invariante de sanidad y REQ IDs en specs canónicas |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Falsos positivos en validación de REQ IDs | Low | Extracción precisa de anchors `{#REQ-[^}]+}` con regex estricta |
| Rotura en tests unitarios de runner existentes | Low | Ajustar tests internos a la firma de parámetro directo `_testRunner` |

## Rollback Plan

Revertir los cambios mediante `git revert` sobre los archivos modificados en `scripts/` y `openspec/specs/`.

## Dependencies

- Ninguna dependencia externa adicional (Node.js runtime nativo).

## Success Criteria

- [ ] `openspec/specs/adversarial-challenges/spec.md` contiene REQ-001..004 completos y sin "undefined".
- [ ] `archive-plan` y `archive-transaction` rechazan specs preparadas corruptas o con REQ IDs suprimidos.
- [ ] `manifest-sync.test.js` valida que todas las specs canónicas conservan sus REQ IDs.
- [ ] `executeChallengePlan` es impermeable a inyección de mocks vía `context.runWorkspaceTests`.
- [ ] `npm test` ejecuta limpiamente al 100%.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
