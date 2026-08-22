# Apply Progress: K5 Authoritative Enforcement and CAS Remediation

- Change Name: `k5-authoritative-enforcement-and-cas-remediation`
- Version: `2.45.9`
- Delivery Decision: `size:exception` (remediación integral cohesiva de las 6 fases y 31 tareas en una sola pasada)
- Status: `COMPLETED`
- Baseline Safety Net: 2382/2382 tests passing (100% PASS)

---

> **Nota aclaratoria (2026-08-22, change k5-reconciliation):** los contadores originales de este change registraban "28 tareas", pero el conteo verificado de checkboxes de `tasks.md` es **31** (31 × `- [x]`, 0 pendientes), consistente con las 31 filas 1.1–6.5 de esta tabla. La discrepancia estaba en los contadores y resúmenes, no en las tareas; se corrigen 28→31 sin alterar contenido técnico histórico.

## Strict TDD Evidence Table

| Task ID | Phase | Test Target | RED Output Summary | GREEN Implementation | REFACTOR / Validation |
|---------|-------|-------------|--------------------|----------------------|-----------------------|
| 1.1 | Phase 1 | `scripts/lib/lifecycle-kernel/transition-selector.test.js`, `scripts/lib/failure-recovery.test.js` | `code_defect` emitía `recover` en vez de `repair`; `ambiguous_effect` emitía `kind: 'decide'` en vez de `'escalate'` | Modificados `transition-selector.js` y `failure-recovery.js` para emitir explícitamente `{ kind: "execute", operation: "repair" }` y `{ kind: "escalate", operation: "escalate" }` | Validada taxonomía estricta y eliminación de degradación silenciosa |
| 1.2 | Phase 1 | `scripts/lib/lifecycle-kernel/index.test.js` | `escalate` retornaba `outcome: 'blocked'` y no avanzaba revisión CAS en Authority Store | Modificados `reducer.js` e `index.js` para procesar `escalate` con phase/status `terminal` y commit consolidado en CAS | Test de integración verifica avance de revisión y estado terminal persistido |
| 1.3 | Phase 1 | `scripts/lib/lifecycle-kernel/transition-selector.js`, `failure-recovery.js` | Transiciones de recuperación no cumplían la taxonomía canónica | Alineación de exports y matriz de allowlist | Verificada ausencia de operaciones de recuperación prohibidas |
| 1.4 | Phase 1 | `scripts/lib/lifecycle-kernel/reducer.js`, `index.js` | Escalate abortaba antes del despacho CAS | Integrado commit terminal con receipt en Authority Store | Verificado recibo de operación con `outcome: 'terminal'` |
| 1.5 | Phase 1 | `scripts/lib/failure-recovery.js` | Ramas residuales de degradación `repair -> recover` | Eliminadas ramas muertas y asegurada consistencia de tipos | Suite de Phase 1 100% PASS |
| 2.1 | Phase 2 | `scripts/lib/execution-budgets.test.js`, `scripts/lib/lifecycle-kernel/permits.test.js` | `issueOperationPermit` permitía emisión cuando el presupuesto de nodo o de autoridad estaba en 0 | Endurecido `issueOperationPermit` en `permit-authority.js` invocando `isBudgetExhausted()` y rechazando con `budget-exhausted` | Verificada denegación exhaustiva en 6 dimensiones de nodo y 4 de autoridad |
| 2.2 | Phase 2 | `scripts/lib/lifecycle-kernel/index.test.js` | `runKernelOperation` invocaba `effectExecutor` o fallaba tardíamente ante cuotas agotadas | Integrado preflight exhaustivo en `runKernelOperation()` antes de autorizar o despachar a `effectExecutor` | Verificado retorno de `budget-exhausted` con exactamente 0 llamadas al executor |
| 2.3 | Phase 2 | `scripts/lib/execution-budgets.js` | Helper unificado de evaluación de 10 dimensiones | Implementado `isBudgetExhausted(budget, consumed, options)` con soporte de nodo y autoridad | Tests unitarios exhaustivos para cada dimensión |
| 2.4 | Phase 2 | `scripts/lib/lifecycle-kernel/permits.js`, `permit-authority.js` | Emisión de permisos sin validación de estado presupuestario | Integrado chequeo previo de `isBudgetExhausted` | Verificada denegación de permisos con código `budget-exhausted` |
| 2.5 | Phase 2 | `scripts/lib/lifecycle-kernel/index.js` | Fuga de efectos ante cuotas agotadas | Preflight bloquea antes de `effectExecutor` devolviendo `blockedResult` | Verificado 0 llamadas a efectos en runtime |
| 2.6 | Phase 2 | `scripts/lib/lifecycle-kernel/transition-selector.js` | Transiciones activas se emitían aún con autoridad agotada | Podadas transiciones `execute` en `transition-selector.js` cuando `authority_budget` está agotado | Suite de Phase 2 100% PASS |
| 3.1 | Phase 3 | `scripts/lib/failure-recovery.test.js` | `validateRepairScope` no requería `finding_ids`, `node_ids` o `allowed_paths` no vacíos en ausencia de target explícito | Endurecido `validateRepairScope` para validar que `scope` sea objeto no nulo con arrays no vacíos en las 3 claves | Tests unitarios para scope nulo, vacío, array o con claves faltantes |
| 3.2 | Phase 3 | `scripts/lib/lifecycle-kernel/index.test.js` | `repair` sin `args.scope` ejecutaba efectos o intentaba inferir de historial pasado | Preflight de `index.js` rechaza `repair` sin `args.scope` con `repair-scope-violation` y 0 executor calls | Eliminado fallback `effectRecords[0]?.payload?.scope` |
| 3.3 | Phase 3 | `scripts/lib/failure-recovery.js` | `validateRepairScope` flexible | Reglas fail-closed estrictas implementadas | Validación simétrica pre y post efecto |
| 3.4 | Phase 3 | `scripts/lib/lifecycle-kernel/index.js` | Invocación de efectos en repair sin scope | Preflight bloquea invocación antes de executor | Verificado en test de integración |
| 3.5 | Phase 3 | `scripts/lib/lifecycle-kernel/index.js` | Referencias obsoletas a scope histórico | Eliminada inferencia de scope de efectos pasados | Suite de Phase 3 100% PASS |
| 4.1 | Phase 4 | `scripts/lib/lifecycle-kernel/index.test.js`, `execution-budgets.test.js` | Zero-delta no decrementaba `authority_budget.effect_attempts` y arrojaba `invalid journal status` | Integrada deducción dual (`turns` y `effect_attempts`) y permitido `zero-delta-attempt` en `journal.js` | Persistido registro durable en journal antes de commit CAS |
| 4.2 | Phase 4 | `scripts/lib/lifecycle-kernel/index.test.js` | Consultas de sólo lectura (`status`) arriesgaban penalización | Exención explícita de `operation === "status"` en contabilidad zero-delta | Verificado que `status` mantiene presupuestos intactos |
| 4.3 | Phase 4 | `scripts/lib/execution-budgets.js` | Deducción monótona multi-dimensión | Lógica no-decremental con clamping en cero | Tests unitarios de monotonicidad |
| 4.4 | Phase 4 | `scripts/lib/lifecycle-kernel/index.js` | Detección y emisión durable post-efecto | Integrada deducción simultánea y `upsertJournal` con persistencia antes de CAS commit | Evento `zero-delta-attempt` emitido y verificado |
| 4.5 | Phase 4 | `scripts/lib/lifecycle-kernel/index.js` | Posible polución de estado autoritativo por telemetría | Aislamiento verificado entre claves efímeras y digest autoritativo | Suite de Phase 4 100% PASS |
| 5.1 | Phase 5 | `scripts/lib/execution-budgets.test.js` | Reconciliación tras CAS conflict no verificaba retención monótona | Implementado test unitario de reconciliación determinista | Monotonicidad comprobada sin restablecer cuota inicial |
| 5.2 | Phase 5 | `scripts/lib/lifecycle-model.js`, `k5-lifecycle-model.test.js` | `inv-k5-budget-monotonicity` no modelaba 2 writers concurrentes reales | Implementado escenario concurrente con 2 runtimes (W1 y W2) sobre el mismo Authority Store | W1 gana CAS (R0 -> R1), W2 falla con `cas-conflict` o `stale-permit` y conserva consumo al reintentar |
| 5.3 | Phase 5 | `scripts/lib/lifecycle-kernel/index.js` | Presupuestos consumidos por efectos en carreras perdidas | Cuotas consumidas retenidas al reintentar contra nuevo head | Cero restablecimiento de presupuestos |
| 5.4 | Phase 5 | `scripts/lib/lifecycle-model.js` | Checker K5 Invariant 1 desactualizado | Actualizado `checkK5BudgetMonotonicity()` con escenario determinista de 2 writers | Invariante 1 pasa al 100% |
| 5.5 | Phase 5 | `scripts/lib/authority-store/index.js` | Retorno determinista de `cas-conflict` | Verificado aislamiento de stores y transacciones CAS | Suite de Phase 5 100% PASS |
| 6.1 | Phase 6 | `scripts/lib/k5-lifecycle-model.test.js` | Checkers desactualizados fallaban en suite K5 | Ejecutada suite y aislados puntos de divergencia | Todos los fallos mapeados |
| 6.2 | Phase 6 | `scripts/lib/lifecycle-model.js` | 7 checkers ejecutables de K5 desalineados | Actualizados los 7 checkers con composición real de CAS, Authority Store y taxonomía canónica | 7/7 invariantes ejecutables en verde |
| 6.3 | Phase 6 | `scripts/k5-e2e-budgets-recovery.test.js`, `k5-budgets-failures-recovery.test.js`, `recovery.test.js`, `minimal-kernel-harness.test.js` | Asersiones esperaban `kind: "decide"` para `escalate` | Actualizadas asersiones para aceptar `kind: "escalate"` y halting en minimal harness | Suite completa de tests nativos 100% PASS |
| 6.4 | Phase 6 | `package.json`, `openspec/config.yaml`, `.plugin.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md` | Versión en 2.45.8 | Incrementada versión a `2.45.9` y documentada release en CHANGELOG | Sincronización completa de metadatos |
| 6.5 | Phase 6 | `scripts/check.js` | Validación final de todo el repositorio | Ejecutado `node scripts/check.js` (2382 tests + 7 target generators) | 100% PASS (0 fallos, 0 regresiones) |

---

```json:strict-tdd-evidence
{
  "schema_version": 1,
  "change_name": "k5-authoritative-enforcement-and-cas-remediation",
  "version": "2.45.9",
  "delivery_strategy": "size:exception",
  "total_phases": 6,
  "total_tasks": 31,
  "tasks_completed": 31,
  "test_suite_status": {
    "total_tests": 2382,
    "passed_tests": 2382,
    "failed_tests": 0,
    "skipped_tests": 2,
    "target_generators_validated": [
      "claude",
      "vscode",
      "github-copilot",
      "opencode",
      "codex",
      "cursor",
      "antigravity"
    ]
  },
  "blockers_remediated": [
    {
      "id": "blocker-1",
      "title": "Canonical Transitions and Escalate CAS Consolidation",
      "description": "code_defect explicitly emits { kind: 'execute', operation: 'repair' }; ambiguous_effect emits { kind: 'escalate', operation: 'escalate' } committed via CAS to Authority Store with terminal status.",
      "verified_by": ["scripts/lib/lifecycle-kernel/transition-selector.test.js", "scripts/lib/lifecycle-kernel/index.test.js"]
    },
    {
      "id": "blocker-2",
      "title": "Exhaustive 6+4 Budget Preflight",
      "description": "Unified isBudgetExhausted evaluates 6 node and 4 authority dimensions; preflight in issueOperationPermit and runKernelOperation denies execution with exactly 0 calls to effectExecutor.",
      "verified_by": ["scripts/lib/execution-budgets.test.js", "scripts/lib/lifecycle-kernel/permits.test.js", "scripts/lib/lifecycle-kernel/index.test.js"]
    },
    {
      "id": "blocker-3",
      "title": "Mandatory Fail-Closed args.scope on Repair",
      "description": "validateRepairScope enforces explicit non-empty node_ids, allowed_paths, finding_ids; runKernelOperation blocks repair without args.scope with 0 executor calls and no historical scope fallbacks.",
      "verified_by": ["scripts/lib/failure-recovery.test.js", "scripts/lib/lifecycle-kernel/index.test.js"]
    },
    {
      "id": "blocker-4",
      "title": "Dual Zero-Delta Accounting with Durable Journal Event",
      "description": "Zero-delta mutations simultaneously deduct node turns and authority effect_attempts, persisting zero-delta-attempt record in journal before CAS commit.",
      "verified_by": ["scripts/lib/lifecycle-kernel/index.test.js", "scripts/lib/execution-budgets.test.js"]
    },
    {
      "id": "blocker-5",
      "title": "CAS Conflict Budget Monotonicity and 2-Writer Concurrent Test",
      "description": "Lost CAS attempts retain consumed effect quotas without reset upon re-sync; inv-k5-budget-monotonicity executes concurrent 2-writer race scenario deterministically.",
      "verified_by": ["scripts/lib/lifecycle-model.js", "scripts/lib/k5-lifecycle-model.test.js"]
    }
  ]
}
```
