# Tasks: Extend Bench Agent Coverage (canonical agent identity)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-agent-identity-001 (resolución canónica, prefijo único, set cerrado, `unresolved`) | MUST | `scripts/lib/agent-identity.js`, `internal/agentidentity` | covered-by-design | Gramática ADR-002 |
| REQ-agent-identity-002 (autoridad única compartida emisor+validador, O1 sin migración) | MUST | `persistPhaseCost` (JS/Go) + `validCostRow` consumen el módulo | covered-by-design | Valores canónicos idénticos a los actuales sin prefijo |
| REQ-agent-identity-003 (paridad Go/JS con tabla espejada + caso regresión prefijo) | MUST | `agentidentity_test.go` / `agent-identity.test.js` | covered-by-design | Patrón resultenvelope |
| REQ-hooks-001 (delta SubagentStop: clasificación vía resolución, fail-safe) | MUST | `scripts/hooks/subagent-stop.js`, `internal/hooks/subagentstop.go` | covered-by-design | Escenarios existentes de fallbacks/relaunch ya cubiertos por tests vigentes |
| REQ-orchestrator-evals-009 (`validCostRow` vía resolución; CX0 sin cambios) | MUST | `scripts/evals/lib/benchmark.js` | covered-by-design | Cláusula de cobertura definida en design §Interfaces |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: resuelta aquí — el archivo de tests Go del hook es `internal/hooks/subagentstop_test.go` (cerrando la suposición `sdd-design-001`).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~480-620 (≈150 código, ≈330-420 tests, ≈30 docs) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (estrategia de entrega del cambio: `exception-ok`) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Módulo JS `agent-identity` + tests (T1-T2) | PR 1 (único) | Autónomo, base para todo |
| 2 | Espejo Go `agentidentity` + paridad E1 (T3-T4) | PR 1 (único) | Depende de Unit 1 |
| 3 | Integración emisor JS + Go (T5-T8) | PR 1 (único) | Depende de Units 1-2 |
| 4 | Consumidor bench `validCostRow` + compat O1/CX0 (T9-T10) | PR 1 (único) | Depende de Unit 1 |
| 5 | Verificación final + docs/registro (T11-T12) | PR 1 (único) | Cierre |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

Modo TDD estricto: cada unidad de comportamiento es par RED (test que falla, verificado con `node scripts/check.js` para JS y `go test ./...` para Go) → GREEN (implementación mínima). Runner JS obligatorio: `node scripts/check.js`.

## Phase 1: Módulo JS de identidad de agente (Foundation)

- [x] 1.1 RED: crear `scripts/lib/agent-identity.test.js` con tabla de casos — `sdd-spec`→`sdd-spec`, `plugin-host:sdd-spec`→`sdd-spec` (regresión prefijo), `host:review-runtime`→`review-runtime`, `a:b:sdd-spec`→`unresolved`, `sdd-`→`unresolved`, `""`/no-string→`unresolved`, `review-invented`→`unresolved`, los 6 `REVIEW_AGENTS` resuelven a sí mismos; y casos de `derivePhaseKey` (`sdd-x`→`x`, review→sí mismo, otro→`""`). Verificar que falla en `node scripts/check.js`. [REQ-agent-identity-001, REQ-agent-identity-003]
- [x] 1.2 GREEN: crear `scripts/lib/agent-identity.js` con `UNRESOLVED = "unresolved"`, `REVIEW_AGENTS` (6 nombres), `resolveCanonicalAgent(raw)` (trim → exactamente un `:` con lados no vacíos → resto en set cerrado `sdd-[a-z][a-z0-9-]*` o review allowlist; identidad sin prefijo) y `derivePhaseKey(canonical)`. Pure, sin I/O. Verificar GREEN. [REQ-agent-identity-001]
- [x] 1.3 Añadir en `scripts/lib/agent-identity.test.js` caso O1: para todo nombre sin prefijo válido, `resolveCanonicalAgent` + `derivePhaseKey` producen los valores que hoy emiten los hooks (identidad + strip `sdd-` / self / `""`). Verificar GREEN. [REQ-agent-identity-002]

## Phase 2: Espejo Go + paridad E1

- [ ] 2.1 RED: crear `internal/agentidentity/agentidentity_test.go` con la MISMA tabla byte-por-byte que 1.1 (patrón resultenvelope), incluyendo caso de regresión con nombre prefijado. Ejecutar `go test ./internal/agentidentity/` y verificar que falla (paquete inexistente → falla de compilación = RED). [REQ-agent-identity-003]
- [ ] 2.2 GREEN: crear `internal/agentidentity/agentidentity.go` — `package agentidentity`, `const Unresolved = "unresolved"`, `var ReviewAgents`, `func ResolveCanonicalAgent(rawName string) string`, `func DerivePhaseKey(canonicalAgent string) string`, reglas idénticas a 1.2. Verificar GREEN. [REQ-agent-identity-001, REQ-agent-identity-003]
- [ ] 2.3 Paridad E1: tabla de paridad en ambos tests (JS y Go) sobre el set representativo `sdd-spec`, `host:sdd-spec`, `review-runtime`, `host:review-runtime`, `review-invented` + caso regresión prefijado; mismos resultados esperados en ambos runtimes. Verificar `node scripts/check.js` + `go test ./...` en verde. [REQ-agent-identity-003]

## Phase 3: Integración emisor SubagentStop (JS)

- [ ] 3.1 RED: en `scripts/hooks/subagent-stop.test.js`, añadir casos — dispatch con nombre `plugin-host:sdd-spec` produce fila con `agent: "sdd-spec"`, `phase: "spec"` (idéntica a la del nombre sin prefijo); dispatch `host:review-runtime` produce fila con `phase`/`agent` = `review-runtime`; `review-invented` y `review-reliability` NO escriben fila y el hook sigue fail-safe (`continue: true`). Verificar RED. [REQ-hooks-001, REQ-agent-identity-002]
- [ ] 3.2 GREEN: en `scripts/hooks/subagent-stop.js`, en `persistPhaseCost`: importar de `scripts/lib/agent-identity.js`, clasificar vía `resolveCanonicalAgent(raw)` → `derivePhaseKey(canonical)`; `unresolved` → skip (sin fila); grabar `agent` = canónico; eliminar la copia local de `derivePhaseKey`. No tocar `resolveAgentName` ni `persistResultEnvelope`. Verificar GREEN en `node scripts/check.js`. [REQ-hooks-001, REQ-agent-identity-002]

## Phase 4: Integración espejo Go del hook

- [ ] 4.1 RED: en `internal/hooks/subagentstop_test.go` (archivo vigente de tests del hook Go; cierra la suposición `sdd-design-001` — NO `store_test.go`), replicar los casos de 3.1 con paridad byte de campos normalizados. Verificar RED con `go test ./internal/hooks/`. [REQ-agent-identity-003, REQ-hooks-001]
- [ ] 4.2 GREEN: en `internal/hooks/subagentstop.go`, integrar `agentidentity` en `persistPhaseCost` (raw → `ResolveCanonicalAgent` → `DerivePhaseKey`); `unresolved` → sin fila; `agent` = canónico; la copia local de `derivePhaseKey` delega al paquete `agentidentity`. Verificar GREEN con `go test ./...`. [REQ-hooks-001, REQ-agent-identity-002]

## Phase 5: Consumidor bench (validCostRow + O1 + CX0)

- [ ] 5.1 RED: en `scripts/evals/lib/benchmark.test.js`, añadir fixtures literales — fila `{phase:"spec", agent:"plugin-host:sdd-spec"}` pasa `validCostRow`; fila `agent:"review-runtime"` con `phase:"review-runtime"` pasa; fila `{phase:"design", agent:"sdd-design"}` sigue pasando igual; fila `agent:"review-invented"` (→ unresolved) falla; fila con fase que no coincide con la clave derivada falla. Verificar RED. [REQ-orchestrator-evals-009]
- [ ] 5.2 GREEN: en `scripts/evals/lib/benchmark.js`, reemplazar en `validCostRow` la igualdad estricta por la cláusula del design: `canonical !== UNRESOLVED && key !== "" && row.phase === key` vía `resolveCanonicalAgent`/`derivePhaseKey` del módulo compartido. CX0 consume `validCostRow` sin cambios. Verificar GREEN. [REQ-orchestrator-evals-009, REQ-agent-identity-002]
- [ ] 5.3 Compatibilidad O1: ejecutar la suite de bench existente sin editar fixtures — todos los tests vigentes de `benchmark.test.js` y las aserciones de `canonicalPersistedO1Row`/atestiguamientos v1/v2/v3 deben quedar verdes sin cambios. [REQ-agent-identity-002, REQ-orchestrator-evals-009]

## Phase 6: Verificación final y registro

- [ ] 6.1 Suite completa en verde: `node scripts/check.js` + `go test ./...` (recordar `env -u DISABLE_AGENT_SHIELD -u DISABLE_GIT_COLLABORATION_GUARD -u TOKEN_ADVISOR` si el entorno de sesión exporta esas variables). [REQ-agent-identity-003]
- [ ] 6.2 Marcar ADR-001 y ADR-002 como `accepted` en `openspec/changes/extend-bench-agent-coverage/decisions/` si la implementación coincidió con lo decidido. [sin REQ]
- [ ] 6.3 Registrar en `apply-progress.md` cada unidad de trabajo con su commit (commits en imperativo español, sin atribución de modelo; convención `work-unit-commits`). [sin REQ]
