# Tasks: Canonicalize CX0 Context Measurement and Envelope Persistence

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-hooks-015: Invalid successful sdd-spec envelope becomes blocked status | MUST | `scripts/hooks/subagent-stop.js` (`resolveDispatchStatus`), `internal/hooks/subagentstop.go` (`resolveDispatchStatus`) | covered-by-design | Fail-closed a `"blocked"` cuando un envelope exitoso no pasa la validación de fase |
| REQ-hooks-015: Prefixed sdd-spec dispatch enforces fail-closed validation | MUST | `scripts/hooks/subagent-stop.js` (`resolveDispatchStatus`), `internal/hooks/subagentstop.go` (`resolveDispatchStatus`) | covered-by-design | Resolución canónica a `sdd-spec` activa validación de fase y guard fail-closed |
| REQ-hooks-015: Valid envelope from prefixed dispatch persists to state.yaml | MUST | `scripts/hooks/subagent-stop.js` (`persistResultEnvelope`), `internal/hooks/subagentstop.go` (`persistResultEnvelope`) | covered-by-design | Agente canónico genera phase key válida y actualiza `state.yaml` (`summary`, `key_decisions`) |
| REQ-hooks-015: Unresolvable or foreign agent skips envelope persistence fail-safely | MUST | `scripts/hooks/subagent-stop.js` (`persistResultEnvelope`), `internal/hooks/subagentstop.go` (`persistResultEnvelope`) | covered-by-design | Agentes no reconocidos retornan phase key vacía y omiten persistencia sin fallar |
| REQ-hooks-015: Zero device id still matches transcript identity | MUST | `scripts/hooks/subagent-stop.js` (`sameFileIdentity`) | covered-by-design | Comportamiento existente preservado |
| REQ-hooks-017: Measurement emission succeeds without changing hook behavior | MUST | `scripts/hooks/subagent-stop.js` (`persistContextMeasurement`) | covered-by-design | Ejecución posterior a O1 preservando stdout y `continue: true` |
| REQ-hooks-017: Host-prefixed sdd dispatch emits CX0 context measurement | MUST | `scripts/hooks/subagent-stop.js` (`persistContextMeasurement`) | covered-by-design | Resolución canónica previa a `derivePhaseKey` permite emitir registro CX0 en JSONL |
| REQ-hooks-017: Unresolvable or foreign agent skips CX0 emission fail-safely | MUST | `scripts/hooks/subagent-stop.js` (`persistContextMeasurement`) | covered-by-design | Retorna `{ status: "skipped", reason: "unsupported-agent" }` limpiamente |
| REQ-hooks-017: CX0 collector cannot read a host field | MUST | `scripts/hooks/subagent-stop.js` (`normalizeContextMeasurement`) | covered-by-design | Manejo de campos no disponibles con razón de fallback preservado |
| REQ-hooks-017: CX0 durable write fails | MUST | `scripts/hooks/subagent-stop.js` (`persistContextMeasurement`) | covered-by-design | Try/catch fail-safe boundary preservado |
| REQ-agent-identity-002: Emitter and validator agree for the same registered name | MUST | `scripts/lib/agent-identity.js`, `internal/agentidentity/agentidentity.go` | covered-by-design | Misma autoridad compartida para emisión y validación |
| REQ-agent-identity-002: Prefix-free compatibility with current attestation (O1) | MUST | `scripts/lib/agent-identity.js`, `internal/agentidentity/agentidentity.go` | covered-by-design | Nombres canónicos sin prefijo no sufren alteraciones |
| REQ-agent-identity-002: Envelope persistence and CX0 consumers share canonical resolution | MUST | `scripts/hooks/subagent-stop.js`, `internal/hooks/subagentstop.go` | covered-by-design | Todos los consumidores invocan el mismo punto de resolución compartida |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~60-100 líneas (~70-120 líneas incluyendo tests) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Canonicalizar resolución de identidad en SubagentStop (JS y Go mirror) con tests TDD | PR 1 | Entrega atómica completa en `scripts/hooks/` e `internal/hooks/` |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Soporte y pruebas para Result Envelope y Dispatch Status en JS

- [x] 1.1 RED: Escribir tests unitarios fallidos en `scripts/hooks/subagent-stop.test.js` para `resolveDispatchStatus` con dispatches prefijados (`plugin-host:sdd-spec` con envelope inválido -> "blocked", y envelope válido -> "success") y regresión con nombres sin prefijo. [REQ-hooks-015, REQ-agent-identity-002]
- [x] 1.2 RED: Escribir tests unitarios fallidos en `scripts/hooks/subagent-stop.test.js` para `persistResultEnvelope` con agentes prefijados (`plugin-host:sdd-design`), verificando persistencia en `state.yaml` (`summary` y `key_decisions`), y omisión fail-safe ante agentes desconocidos (`host:unsupported-worker`). [REQ-hooks-015, REQ-agent-identity-002]
- [x] 1.3 GREEN: Implementar resolución canónica con `resolveCanonicalAgent(resolveAgentName(input))` en `persistResultEnvelope` y `resolveDispatchStatus` en `scripts/hooks/subagent-stop.js`, pasando `canonicalAgent` a `validateEnvelope({ phase: canonicalAgent })` y evaluando `canonicalAgent === "sdd-spec"` para fail-closed. [REQ-hooks-015, REQ-agent-identity-002]
- [x] 1.4 REFACTOR: Limpiar variables intermedias y consolidar llamadas de extracción y validación en `scripts/hooks/subagent-stop.js` sin alterar comportamiento ni romper tests existentes. [REQ-hooks-015]

## Phase 2: Soporte y pruebas para CX0 Context Measurement en JS

- [x] 2.1 RED: Escribir tests unitarios fallidos en `scripts/hooks/subagent-stop.test.js` para `persistContextMeasurement` con dispatches prefijados (`plugin-host:sdd-spec`, `host:sdd-apply`), verificando retorno `{ status: "recorded", phase: ... }` y registro en `.ospec/session/{change}/context-measurements.jsonl`. [REQ-hooks-017, REQ-agent-identity-002]
- [x] 2.2 RED: Escribir test unitario en `scripts/hooks/subagent-stop.test.js` comprobando que dispatches con agentes no reconocibles o foráneos (`host:unknown-agent`) retornen `{ status: "skipped", reason: "unsupported-agent" }` sin emitir registros ni propagar errores. [REQ-hooks-017, REQ-agent-identity-002]
- [x] 2.3 GREEN: Implementar resolución canónica con `resolveCanonicalAgent(resolveAgentName(input))` en `persistContextMeasurement` en `scripts/hooks/subagent-stop.js` antes de invocar `derivePhaseKey`. [REQ-hooks-017, REQ-agent-identity-002]
- [x] 2.4 REFACTOR: Optimizar el flujo de guards y manejo fail-safe de excepciones en `persistContextMeasurement` en `scripts/hooks/subagent-stop.js` preservando el contrato de salida intacto. [REQ-hooks-017]

## Phase 3: Soporte y pruebas para Result Envelope y Dispatch Status en Go

- [x] 3.1 RED: Escribir tests unitarios fallidos en `internal/hooks/subagentstop_test.go` para `resolveDispatchStatus` con dispatches prefijados (`plugin-host:sdd-spec` con envelope inválido -> "blocked", y con envelope válido -> "success"). [REQ-hooks-015, REQ-agent-identity-002]
- [x] 3.2 RED: Escribir tests unitarios fallidos en `internal/hooks/subagentstop_test.go` para `persistResultEnvelope` con dispatches prefijados (`plugin-host:sdd-design`), verificando actualización en `state.yaml` y comportamiento fail-safe ante agentes no reconocidos. [REQ-hooks-015, REQ-agent-identity-002]
- [x] 3.3 GREEN: Implementar resolución canónica con `agentidentity.ResolveCanonicalAgent(resolveAgentName(input))` en `persistResultEnvelope` y `resolveDispatchStatus` en `internal/hooks/subagentstop.go`, pasando el agente canónico a `resultenvelope.ValidateForPhase` y evaluando `canonicalAgent == "sdd-spec"` para fail-closed. [REQ-hooks-015, REQ-agent-identity-002]
- [x] 3.4 REFACTOR: Normalizar el manejo de tipos y recuperación de pánico (`defer recover()`) en `internal/hooks/subagentstop.go`, asegurando formato canónico con `gofmt`. [REQ-hooks-015]

## Phase 4: Verificación de paridad Go/JS y pruebas completas de regresión

- [x] 4.1 Ejecutar suite completa de tests de hooks en Node.js (`node --test scripts/hooks/subagent-stop.test.js` y `node --test scripts/hooks/parity-contract.test.js`) verificando que todos los tests pasen sin regresiones. [REQ-hooks-015, REQ-hooks-017]
- [x] 4.2 Ejecutar suite completa de tests en Go (`go test -v ./internal/hooks/...`) confirmando compilación limpia y paso del 100% de los tests. [REQ-hooks-015, REQ-agent-identity-002]
- [x] 4.3 Validar paridad exacta entre JS y Go para el tratamiento de dispatches prefijados (`plugin-host:sdd-*`), agentes foráneos y preservación de contratos en `state.yaml`. [REQ-hooks-015, REQ-agent-identity-002]
