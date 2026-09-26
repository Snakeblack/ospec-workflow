# Tasks: Close PP2/CX1 Preflight Guarantees

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-agents-030 — plugin path + `--workspace` | MUST | `agents/sdd-orchestrator.agent.md`, `scripts/configure/real-repo.test.js` | covered-by-design | Sin nuevo resolver |
| REQ-install-027 — proceso Node independiente, cwd ajeno | MUST | `scripts/configure/validate-phase.test.js` (`spawn`/`execFile`) | covered-by-design | No basta `main({ scriptDir })` solo |
| REQ-routing-016 — autoridad `route.actual_route`; paridad parsers | MUST | `scripts/route-dispatch-run.js`, `scripts/validate-phase.js`, tests | covered-by-design | Cierra F-66efe8421b856f34 |
| REQ-routing-016 — legacy sin bloque `route:` | MUST | Misma asignación | covered-by-design | Excepción pre-policy intacta |
| REQ-lifecycle-kernel-029 — noop orden congelado v2.67 | MUST | `phase-completion-reducer.js` / `.go` + tests | covered-by-design | Sin conservación de bytes |
| REQ-lifecycle-kernel-029 — otro orden no prometido | MUST | Tests Node + Go | covered-by-design | Envelope status-first ≠ noop legacy |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~280–340 (additions + deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | PR único en `fix/close-pp2-cx1-preflight-guarantees` |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Tres garantías + pruebas | PR único | `npm test`; `node --test` focalizado; `go test` en `internal/hooks` |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Orquestador e instalación global (REQ-agents-030, REQ-install-027)

- [x] 1.1 En `agents/sdd-orchestrator.agent.md`, sustituir el comando pre-delegación relativo `node scripts/validate-phase.js …` por invocación al `scripts/validate-phase.js` de la raíz de instalación del plugin con `--workspace <projectRoot>` explícito (y placeholders de fase/ruta/cambio sin asumir cwd del plugin). [REQ-agents-030]
- [x] 1.2 Actualizar el pin de contrato en `scripts/configure/real-repo.test.js` para que el walk del orquestador exija la forma plugin-path + `--workspace` (no la cadena relativa al repo consumidor). [REQ-agents-030]
- [x] 1.3 Añadir en `scripts/configure/validate-phase.test.js` una prueba de **proceso Node independiente** (`spawn`/`execFile`): `cwd` = proyecto fixture **sin** `validate-phase.js`; invocar el script del plugin con `--workspace` apuntando a ese proyecto; verificar separación de roots (p. ej. resolución de `openspec/` del proyecto vs assets del plugin). Complementar con tests in-process solo como apoyo, no como única evidencia. [REQ-install-027]

## Phase 2: Autoridad de ruta y paridad de parsers (REQ-routing-016)

- [x] 2.1 En `scripts/route-dispatch-run.js`, hacer que `route.actual_route` bajo `route:` en `state.yaml` sea autoridad; si `--persisted-route` (o equivalente) difiere de un valor persistido no vacío, fallar cerrado sin sustituir. [REQ-routing-016]
- [x] 2.2 En `scripts/validate-phase.js` (`readPersistedRouteInfo`), eliminar el fallback global de `actual_route` fuera del bloque `route:` para alinear con `extractStateRouteInfo` del dispatcher; mantener la excepción legacy cuando falta el bloque `route:` completo. [REQ-routing-016]
- [x] 2.3 Ampliar `scripts/route-dispatch-run.test.js` y tests de parser en `scripts/configure/validate-phase.test.js`: persistido R vs `--persisted-route` S → fallo o R intacto; clave `actual_route` fuera de `route:` ignorada; mismos fixtures → mismos resultados en ambos parsers. [REQ-routing-016]

## Phase 3: Replay v2.67 — orden de claves congelado (REQ-lifecycle-kernel-029)

- [x] 3.1 Alinear `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` con Go: noop legacy v2.67 solo cuando el envelope serializa en el orden congelado (`schema_version` primero; órdenes anidadas de `question_gate`/pregunta/opción ya fijados); no prometer noop por igualdad semántica con otro orden (p. ej. envelope status-first). [REQ-lifecycle-kernel-029]
- [x] 3.2 En `scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js`: fixture orden congelado → convergencia zero-delta; fixture mismo contenido con orden distinto → **no** noop legacy prometido. [REQ-lifecycle-kernel-029]
- [x] 3.3 En `internal/hooks/phase-completion-reducer.go` y `phase-completion-reducer_test.go`: documentar/rechazar promesa fuera del orden congelado; test Go de replay noop sobre fixture frozen-order (paridad con Node). [REQ-lifecycle-kernel-029]

## Phase 4: Verificación local

- [x] 4.1 Ejecutar `npm test` y, focalizado, `node --test` sobre suites tocadas (`configure/validate-phase`, `route-dispatch-run`, `lifecycle-kernel/phase-completion-reducer`) más `go test ./internal/hooks/...` para replay. Registrar evidencia en `apply-progress.md` (TDD focused: ciclos RED/GREEN donde aplique, sin tabla strict). [REQ-agents-030, REQ-install-027, REQ-routing-016, REQ-lifecycle-kernel-029]
