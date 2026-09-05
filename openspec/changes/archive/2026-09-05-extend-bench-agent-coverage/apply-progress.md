# Apply Progress: extend-bench-agent-coverage

## Batch 1 (2026-09-05) — todas las tareas (Fases 1-6)

- Modo: Strict TDD (RED verificado por ejecución antes de cada GREEN).
- Entrega: PR único `size:exception` (estrategia `exception-ok` aprobada, approval-003/007 en state.yaml). Solo commits en la rama `feat/extend-bench-agent-coverage`; no se abre PR.
- Suite final: `node scripts/check.js` → 3158 tests, 0 fallos; `go test ./...` → 10/10 paquetes ok (con `env -u DISABLE_AGENT_SHIELD -u DISABLE_GIT_COLLABORATION_GUARD -u DISABLE_TOKEN_ADVISOR`).

### Unidades de trabajo y commits

| Unit | Tasks | Commit | Contenido |
|------|-------|--------|-----------|
| 1 | 1.1-1.3 | `088f602` feat(hooks): añade módulo compartido de identidad canónica de agente | `scripts/lib/agent-identity.js` + test (tabla 31 casos, O1, paridad E1); registro en `k1-scope-guard.test.js` |
| 2 | 2.1-2.3 | `fba5f38` feat(hooks): añade espejo Go de la identidad canónica de agente | `internal/agentidentity` (go + test espejado, paridad E1) |
| 3 | 3.1-3.2 | `128d982` feat(hooks): clasifica el coste de fase vía resolución canónica en SubagentStop JS | `persistPhaseCost` JS vía módulo compartido; copia local eliminada |
| 4 | 4.1-4.2 | `e803114` feat(hooks): clasifica el coste de fase vía resolución canónica en SubagentStop Go | `persistPhaseCost` Go vía `agentidentity`; delegación local; diagnóstico canónico |
| 5 | 5.1-5.3 | `4a38429` feat(evals): valida cobertura de costes vía resolución canónica en el bench | `validCostRow` con cláusula canónica; CX0 sin cambios; O1 intacto |
| 6 | 6.1-6.3 | (este registro + ADRs) | Suite completa verde; ADR-001/002 → accepted |

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------|
| 1.1 | `scripts/lib/agent-identity.test.js` | Unit | N/A (new) | ✅ Written (module absent → load failure) | ✅ Passed | ✅ 17 casos tabla | ✅ Clean | |
| 1.2 | `scripts/lib/agent-identity.js` | Unit | N/A (new) | ➖ | ✅ 31/31 | ➖ | ✅ Clean | Mínimo: set cerrado + gramática 1 prefijo |
| 1.3 | `scripts/lib/agent-identity.test.js` | Unit | ✅ | ✅ Written | ✅ Passed | ✅ réplica legacy emitter | ➖ | Caso O1 |
| 2.1 | `internal/agentidentity/agentidentity_test.go` | Unit (Go) | N/A (new pkg) | ✅ build failure (RED) | ➖ | ➖ | ➖ | |
| 2.2 | `internal/agentidentity/agentidentity.go` | Unit (Go) | N/A | ➖ | ✅ go test ok | ✅ tablas espejadas | ✅ gofmt clean | |
| 2.3 | ambos tests | Parity | ➖ | ✅ | ✅ | ✅ set representativo + regresión | ➖ | E1 |
| 3.1 | `scripts/hooks/subagent-stop.test.js` | Integration | ✅ 80/80 baseline | ✅ 2 fallos nuevos | ➖ | ✅ prefijo sdd + prefijo review + foráneos | ➖ | |
| 3.2 | `scripts/hooks/subagent-stop.js` | Integration | ✅ | ➖ | ✅ 60/60 | ➖ | ✅ copia local eliminada | |
| 4.1 | `internal/hooks/subagentstop_test.go` | Integration (Go) | ✅ paquete ok | ✅ 2 fallos nuevos | ➖ | ✅ espejo de 3.1 | ➖ | |
| 4.2 | `internal/hooks/subagentstop.go` | Integration (Go) | ✅ | ➖ | ✅ go test ./... ok | ➖ | ✅ delegación a agentidentity | |
| 5.1 | `scripts/evals/lib/benchmark.test.js` | Integration | ✅ | ✅ 2 fallos nuevos | ➖ | ✅ 5 fixtures literales | ➖ | |
| 5.2 | `scripts/evals/lib/benchmark.js` | Integration | ✅ | ➖ | ✅ 28/28 | ➖ | ✅ | |
| 5.3 | suite bench existente | O1 compat | ➖ | ➖ | ✅ sin editar fixtures | ➖ | ➖ | attestations v1/v2/v3 intactas |
| 6.1 | suite completa | Full | ➖ | ➖ | ✅ 3158 JS + 10 pkg Go | ➖ | ➖ | |
| 6.2 | ADR-001/002 | Docs | ➖ | ➖ | STATIC_VALIDATED | ➖ | ➖ | implementación coincidió → accepted |
| 6.3 | este archivo | Docs | ➖ | ➖ | STATIC_VALIDATED | ➖ | ➖ | |

### Test Summary

- **Total tests escritos (nuevos)**: ~40 (31 JS unit + ~12 Go unit + 6 hook JS + 3 hook Go + 5 bench)
- **Total tests pasando (suite final)**: 3158 JS (check.js) + Go 10/10 paquetes
- **Layers**: Unit (JS/Go), Parity (E1), Integration (hooks JS/Go, bench), O1 compat
- **Approval tests**: O1 réplica del emitter legacy (JS y Go) antes de tocar consumidores
- **Pure functions creadas**: 2 por runtime (`resolveCanonicalAgent`, `derivePhaseKey`)

### Desviaciones / notas

- `scripts/lib/k1-scope-guard.test.js`: se registraron los dos archivos nuevos en `SUCCESSOR_K2_EXACT` (convención establecida post-K1; sin ello el guarda rechaza el commit).
- En Go, la copia local `derivePhaseKey` se conserva como delegación pura a `agentidentity.DerivePhaseKey` (la tarea 4.2 lo indica); `persistResultEnvelope` (JS y Go) conserva su comportamiento exacto según la tarea 3.2 ("no tocar"), por lo que un nombre prefijado en la vía de envelope sigue sin escribir resumen — la resolución canónica aplica solo al camino phase-cost, como decidieron las tareas.
- Go `PhaseCostDiagnostic` ahora resuelve el canónico para mantener consistencia con el emisor (solo diagnósticos, sin cambio de contrato).
