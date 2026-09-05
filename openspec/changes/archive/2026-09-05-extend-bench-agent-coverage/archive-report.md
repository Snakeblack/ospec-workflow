# Archive Report: Extend Bench Agent Coverage

**Change**: `extend-bench-agent-coverage`  
**Date**: 2026-09-05  
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)  
**Verification Verdict**: `PASS WITH WARNINGS` (0 critical issues, 2 warnings aceptados, 1 suggestion como follow-up)

---

## Executive Summary

El cambio `extend-bench-agent-coverage` implementa la resolución canónica de identidad de agentes en el harness `ospec-workflow`, resolviendo la brecha de reconocimiento que impedía validar agentes con prefijo de host/plugin (`plugin-host:sdd-spec`) o agentes propios no-`sdd-*` (`review-*`), reemplazando las convenciones per-site de igualdad estricta `agent === \`sdd-${phase}\``:

1. **Módulo Compartido `agent-identity` (JS y Espejo Manual Go)**:
   - Implementado en `scripts/lib/agent-identity.js` y espejado en `internal/agentidentity/agentidentity.go` siguiendo el patrón desacoplado de `result-envelope`.
   - Gramática de un solo delimitador `:` con lados no vacíos y set cerrado de agentes del harness (`sdd-*` más allowlist de 6 agentes de revisión: `review-change`, `review-trust`, `review-runtime`, `review-evolution`, `review-efficiency`, `review-correction`).
   - Nombres foráneos o malformados retornan el centinela `"unresolved"` de forma fail-safe.
   - Preserva compatibilidad byte-a-byte con filas O1 existentes para nombres sin prefijo.

2. **Integración en Hooks `SubagentStop` (JS y Go)**:
   - Los emisores de `phase-cost` en JS (`scripts/hooks/subagent-stop.js`) y Go (`internal/hooks/subagentstop.go`) resuelven el nombre registrado a través del módulo compartido.
   - Si la resolución devuelve `"unresolved"`, la fila se omite silenciosamente sin arrojar excepciones.
   - Nombres prefijados se registran con su nombre canónico y derivan su clave de fase correctamente.
   - La vía de persistencia de result envelope se preservó intacta para no alterar su contrato actual.

3. **Integración en Benchmark y Validación CX0**:
   - `validCostRow` en `scripts/evals/lib/benchmark.js` valida filas usando `resolveCanonicalAgent`, permitiendo que agentes con prefijo válido y agentes de revisión allowlisteados cuenten como cubiertos.
   - La suite de evaluación CX0 hereda la resolución unificada sin requerir migración de fixtures O1 vigentes.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS WITH WARNINGS`
- **Tasks Complete**: 18 / 18 (100%)
- **Baseline Fingerprints (stale-baseline check)**:
  - `openspec/specs/hooks/spec.md`: `d17a9a1b6350f1713ce14ec69042e8518ab9d84839c38321aed7989c42525a1a` (sin drift)
  - `openspec/specs/orchestrator-evals/spec.md`: `ac1ceaddbd29fa8e281d73edc02509d824e6469accb31e52760a2c8f785a5f2d` (sin drift)
- **Automated Tests**:
  - Suite Node.js: 3158 passed / 0 failed / 0 skipped (`env -u ... node scripts/check.js`)
  - Suite Go: 10/10 paquetes `ok` (`go test ./...`)
  - Paridad E1: Pruebas cruzadas JS/Go afirmadas sobre tabla de casos representativos y regresión de prefijos
- **O1 Fixtures**: Verificado sin ediciones destructivas en fixtures existentes (+53/-0 en bench, +66/-0 en subagent-stop, +3/-0 en k1-scope-guard).
- **Review Gate**: `4r-review-gate` aprobado (lineage `sha256:af9f7f0c4e2412f5347b4b00d92c41dc6e3931e3cd3dd2b745eaf2a7486e9c2c`).
- **Accepted Warnings & Follow-ups**:
  1. `WARNING-1 (design-gap)`: La sección "Scope of hook integration" de `design.md` mencionaba un efecto en `persistResultEnvelope` que la implementación no produjo (y que estaba expresamente fuera del alcance de spec/tasks). Aceptado como riesgo de documentación; seguimiento registrado para el cambio CX0 subsiguiente.
  2. `WARNING-2 (state.yaml)`: Claves duplicadas y nesting anómalo detectados en la auditoría de estado. Resuelto y sanitizado en `state.yaml`.
  3. `F-c1cf060d0008ff4f (SUGGESTION)`: Observación sobre canonicalización en `persistContextMeasurement`; acordada para el cambio follow-up CX0 tras la confirmación de orden de archivo (`approval-010`).

---

## Merged Specifications Summary (Change-Local Preparation)

Se prepararon los contenidos de especificación completos y fusionados bajo la carpeta local del cambio (`openspec/changes/extend-bench-agent-coverage/specs/`):

| Domain | Action | Requirements Modified / Added | Status |
|---|---|---|---|
| `agent-identity` | Prepared (New Domain) | Creado: `REQ-agent-identity-001` (resolución canónica con set cerrado), `REQ-agent-identity-002` (autoridad única compartida), `REQ-agent-identity-003` (paridad Go/JS). | ✅ Ready for runtime commit (`openspec/specs/agent-identity/spec.md`) |
| `hooks` | Prepared (Merged) | Modificado: `REQ-hooks-001` (registro de phase-cost usando resolución canónica de agentes; soporte de prefijos y agentes de revisión allowlisteados; compatibilidad O1). Preservados: Todos los demás 12 requisitos normativos (`REQ-hooks-003` a `REQ-hooks-019`). | ✅ Ready for runtime commit (`openspec/specs/hooks/spec.md`) |
| `orchestrator-evals` | Prepared (Merged) | Agregado: `REQ-orchestrator-evals-009` (validación de cobertura de bench mediante resolución canónica). Preservados: Los 8 requisitos existentes (`REQ-orchestrator-evals-001` a `REQ-orchestrator-evals-008`). | ✅ Ready for runtime commit (`openspec/specs/orchestrator-evals/spec.md`) |

---

## Proposed ADR Promotions

Se proponen las siguientes 2 decisiones arquitectónicas para su promoción formal a `docs/adr/` durante la transacción de archivo:

| Source | Proposed Target | Title |
|---|---|---|
| `decisions/adr-001.md` | `docs/adr/adr-20260905-001-shared-agent-identity-module-with-manual-go-mirror.md` | Shared agent-identity module with manual Go mirror |
| `decisions/adr-002.md` | `docs/adr/adr-20260905-002-prefix-grammar-and-closed-set-failure-semantics.md` | Prefix grammar and closed-set failure semantics |

---

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/extend-bench-agent-coverage/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Change Inventory

El inventario de origen del cambio a preservar en el archivo histórico comprende:

- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `design.md`
- `proposal.md`
- `specs/agent-identity/spec.md`
- `specs/hooks/spec.md`
- `specs/orchestrator-evals/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Ni este ejecutor ni el sub-agente realizan escrituras directas sobre `openspec/specs/**` o `docs/adr/**`, ni mueven o eliminan la carpeta del cambio activo.
3. El orquestador ejecuta la transacción determinista llamando al runtime:
   ```bash
   node scripts/archive-transaction-run.js extend-bench-agent-coverage
   ```
   (precedido opcionalmente por `node .ospec/sync-archive-plan-hashes.js extend-bench-agent-coverage` para sincronización de digestión).
4. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime es la única autoridad formal de cierre del cambio.
