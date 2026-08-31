# Proposal: K6c Budget and Execution Fail-Closed Remediation

## Intent

Remediar quirúrgicamente dos fallos de integridad fail-closed en el subsistema de adversarial challenges (K6c):
1. Falta de control estricto y monotónico de `mutation_budget` durante la ejecución de challenges `focal-mutation` en `runner.js`, que debe invocar `ChallengeBudgetTracker` y detener la ejecución de inmediato emitiendo un `causal-failure/v1` tipado con código `CHALLENGE_BUDGET_EXHAUSTED` (dimensión `mutation_budget`) si `consumeMutations(1)` falla.
2. Tratamiento indistinto entre fallos de aserción de tests vs errores de infraestructura, spawn, tooling o timeout en `worker-sandbox.js` y `runner.js`, que actualmente permite que errores de ejecución incrementen erróneamente `defects_detected` y produzcan `outcome: "passed"` en lugar de fallar estrictamente con `outcome: "error"` (`CHALLENGE_EXECUTION_ERROR` o `CHALLENGE_TIMEOUT`).

## Scope

### In Scope
- Pasar `ChallengeBudgetTracker` al ejecutor de mutaciones en `scripts/lib/adversarial-challenges/runner.js`.
- Detener de inmediato la ejecución de `focal-mutation` con fallo causal tipado `CHALLENGE_BUDGET_EXHAUSTED` (dimensión `mutation_budget`, categoría `validation_gap`) cuando `consumeMutations(1)` retorne `false`.
- Tipificar inequívocamente errores de spawn/infraestructura (`failure_class: "spawn_error"`, `failure_class: "timeout"`, `failure_class: "sandbox_rejection"`) en `scripts/lib/worker-sandbox.js`, distinguiéndolos de fallos de aserción (`exit_code != 0` sin fallo de tooling).
- Asegurar en `runner.js` que errores de infraestructura en `focal-mutation` o `revert` produzcan `outcome: "error"` con razón `CHALLENGE_EXECUTION_ERROR` o `CHALLENGE_TIMEOUT`, sin incrementar bajo ninguna circunstancia `defects_detected`.
- Cobertura adversarial con tests negativos en `scripts/lib/adversarial-challenges/runner.test.js`.

### Out of Scope
- Modificar el catálogo de challenges o la selección proporcional del planner (`REQ-001`, `REQ-002`).
- Cambios de arquitectura o API no relacionados en `worker-sandbox.js`.
- Fases posteriores del kernel (K6d).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `adversarial-challenges`:
  - `REQ-adversarial-challenges-003`: Verificación y consumo monotónico de `mutation_budget` en tiempo de ejecución para `focal-mutation` con transición inmediata a causal-failure tipado `CHALLENGE_BUDGET_EXHAUSTED`.
  - `REQ-adversarial-challenges-004`: Distinción estricta entre fallo de aserción de tests vs error de spawn/tooling/timeout; los errores de tooling jamás incrementan `defects_detected` y emiten `outcome: "error"`.

## Approach

1. En `scripts/lib/adversarial-challenges/runner.js`, propagar `tracker` a `runIsolatedMutation`.
2. Por cada mutación evaluada en `focal-mutation`, invocar `tracker.consumeMutations(1)`. Si retorna `false`, detener inmediatamente el plan retornando `{ ok: false, causalFailure: tracker.buildExhaustionFailure({ candidateId: plan.candidate_id, planId: plan.plan_id, dimension: "mutation_budget" }) }`.
3. En `scripts/lib/worker-sandbox.js`, asegurar que errores en `child.on("error")` y excepciones en `spawn` asignen `failure_class: "spawn_error"` o `failure_class: "execution_error"`.
4. En `scripts/lib/adversarial-challenges/runner.js` (`runWorkspaceTests` y `runIsolatedMutation`), asegurar que si `run.failure_class` está presente (sea `timeout`, `spawn_error`, `sandbox_rejection`, `cancel`) o hay error de ejecución, se emita `outcome: "error"` (`CHALLENGE_EXECUTION_ERROR` / `CHALLENGE_TIMEOUT`) sin incrementar `defects_detected`.
5. Validar con tests adversariales que ni los timeouts ni los fallos de infraestructura son tomados como defectos detectados y que el agotamiento del budget aborta sin reintentos ciegos.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `scripts/lib/adversarial-challenges/runner.js` | Modified | Monotonic mutation budget enforcement y manejo estricto de errores de ejecución |
| `scripts/lib/worker-sandbox.js` | Modified | Tipificación inequívoca de errores de spawn/infraestructura en `executeSandboxedCommand` |
| `scripts/lib/adversarial-challenges/runner.test.js` | Modified | Tests negativos para agotamiento de `mutation_budget` y errores de infraestructura |
| `openspec/specs/adversarial-challenges/spec.md` | Modified | Especificación normativa de `REQ-003` y `REQ-004` |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tests existentes que dependen de errores de spawn para simular fallos | Low | Revisar y actualizar fixtures para usar aserciones reales (`assert.equal`) |
| Incompatibilidad de signatura en `runIsolatedMutation` | Low | Mantener signatura limpia y propagar `tracker` y `plan` explícitamente |

## Rollback Plan

Revertir atómicamente los cambios en `scripts/lib/adversarial-challenges/runner.js`, `scripts/lib/worker-sandbox.js`, `runner.test.js` y deltas de especificación. No existen migraciones ni persistencia durable afectadas.

## Dependencies

- `scripts/lib/adversarial-challenges/budget.js` (`createChallengeBudgetTracker`).
- `scripts/lib/causal-failure.js` (`createCausalFailure`).
- `scripts/lib/worker-sandbox.js` (`executeSandboxedCommand`).

## Success Criteria

- [ ] Ejecución de `focal-mutation` con `mutation_budget` menor al número de mutaciones se detiene inmediatamente con `causal-failure/v1` `CHALLENGE_BUDGET_EXHAUSTED` (dimensión `mutation_budget`).
- [ ] Presupuesto de mutaciones se decrementa de forma estrictamente monotónica por cada mutación evaluada.
- [ ] Errores de spawn, timeouts o errores de tooling en la ejecución de tests bajo `focal-mutation` y `revert` producen `outcome: "error"` (`CHALLENGE_EXECUTION_ERROR` o `CHALLENGE_TIMEOUT`).
- [ ] Errores de infraestructura nunca incrementan `defects_detected` ni permiten que un challenge resulte `outcome: "passed"`.
- [ ] La suite de tests pasa limpiamente (`npm test`).

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
