# Archive Report: Compact Lite Contract and Consumer Compatibility

**Change**: `compact-lite-contract-and-consumer-compatibility`  
**Date**: 2026-09-11  
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)  
**Verification Verdict**: `PASS` (0 critical issues, 0 warnings, 13/13 tasks complete, 16/16 MUST scenarios satisfied)

---

## Executive Summary

El cambio `compact-lite-contract-and-consumer-compatibility` compacta y formaliza el contrato del flujo `lite` y adapta todos sus consumidores a través del ciclo de vida SDD, asegurando que la ausencia legítima de artefactos de especificación y diseño no genere fallos espurios ni requiera artefactos de relleno ("filler"):

1. **Autoridad de Ruta Persistida y Contrato de Planificación**:
   - `state.yaml.route.actual_route` gobierna los requisitos previos de artefactos en CLI y validadores de flujo (`validate-phase.js`, `flow-validator.js`).
   - El flujo `lite` mantiene su estructura canónica de cinco fases (`sdd-propose → sdd-tasks → sdd-apply → sdd-verify → sdd-archive`) basada en `proposal-lite.md` y `tasks.md` con etiquetas estables `AC-N`.

2. **Consumidores Route-Aware y Continuidad de Progreso**:
   - `sdd-apply` fusiona progreso previo en `apply-progress.md` sin sobrescribir trabajo verificado.
   - `sdd-verify` realiza verificación independiente y directa de criterios de aceptación sin requerir especificaciones locales.
   - Los contratos de agentes y el hook `pre-compact` resuelven la siguiente fase incompleta desde el estado persistido sin inventar dependencias ni promover rutas silenciosamente.

3. **Integridad de Archivo y Paridad de Generador**:
   - Validación Schema v1 en `archive-plan.js` adaptada para admitir inventarios completos de ruta `lite` con `spec_writes: []` permitido.
   - Preflight transaccional fail-closed en `archive-transaction.js` que rechaza referencias de diseño inventadas o huellas alteradas antes de cualquier mutación de origen.
   - Paridad estricta y sincronizada a través de los seis targets generados (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`).

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS`
- **Tasks Complete**: 13 / 13 (100% de tareas completadas)
- **Delta Scenarios Satisfied**: 16 / 16 (100% de cumplimiento con nivel de evidencia aceptable)
- **Automated Tests**:
  - Pruebas dirigidas (Fases 1-5): 311 pasadas, 0 fallos
  - Suite completa (`npm test`): exit 0 — todas las comprobaciones superadas
  - Equivalente pre-commit (`check.js --staged` y `pre-commit-hook.js`): exit 0 — commit permitido
- **Quality Review Gate**: completado con lenses satisfechos y autoridad consumida.
- **Issues Found**: 0 CRITICAL, 0 WARNING, 0 SUGGESTION.

---

## Merged Specifications Summary (Change-Local Preparation)

Se prepararon las especificaciones normativas a nivel local del cambio bajo `specs/` con preservación íntegra de identificadores de requisitos (`{#REQ-...}`):

| Domain | Action | Requirements Modified / Added | Status |
|---|---|---|---|
| `routing` | Prepared (Merged) | Agregado: `REQ-routing-015` (Explicit Lite Artifact Contract). Preservados: `REQ-routing-001` a `REQ-routing-014`. | ✅ Ready for runtime commit (`openspec/specs/routing/spec.md`) |
| `skills` | Prepared (Merged) | Agregado: `REQ-skills-017` (Route-Appropriate Lite Artifact Production and Consumption). Preservados: `REQ-skills-001` a `REQ-skills-016`. | ✅ Ready for runtime commit (`openspec/specs/skills/spec.md`) |
| `agents` | Prepared (Merged) | Agregado: `REQ-agents-028` (Lite Recovery and Summary Continuity). Preservados: `REQ-agents-001` a `REQ-agents-027`. | ✅ Ready for runtime commit (`openspec/specs/agents/spec.md`) |
| `generator` | Prepared (Merged) | Agregado: `REQ-generator-017` (Lite Contract Cross-Target Parity). Preservados: `REQ-generator-001` a `REQ-generator-016`. | ✅ Ready for runtime commit (`openspec/specs/generator/spec.md`) |
| `archive-plan-contract` | Prepared (Merged) | Agregado: `REQ-archive-plan-contract-004` (Route-Complete Lite Archive Inventory). Preservados: `REQ-archive-plan-contract-001` a `REQ-archive-plan-contract-003`. | ✅ Ready for runtime commit (`openspec/specs/archive-plan-contract/spec.md`) |

---

## Proposed ADR Promotions

Se propone 1 Decisión de Arquitectura (ADR) para su promoción al catálogo permanente en `docs/adr/`:

| Source | Proposed Target | Title |
|---|---|---|
| `decisions/adr-001.md` | `docs/adr/adr-20260911-001-persisted-route-owns-the-artifact-contract.md` | Persisted Route Owns the Artifact Contract |

---

## Cost

Estimated token cost per phase, aggregated from `.ospec/session/compact-lite-contract-and-consumer-compatibility/phase-costs.jsonl`. Figures are heuristic estimates (~4 bytes/token), not exact metering.

| Phase | Invocations | Re-launches | Duration | Model Tiers | Statuses | Estimated Prompt Tokens | Estimated Artifact Tokens | Estimated Tool Output Tokens | Estimated Output Tokens |
|-------|-------------|-------------|----------|-------------|----------|-------------------------|---------------------------|------------------------------|-------------------------|
| propose | 1 | 0 | 0ms | unknown | unknown | 75736 (estimated) | 0 (estimated) | 0 (estimated) | 23 (estimated) |
| spec | 1 | 0 | 0ms | unknown | success | 80261 (estimated) | 0 (estimated) | 0 (estimated) | 21 (estimated) |
| design | 1 | 0 | 0ms | unknown | success | 91414 (estimated) | 0 (estimated) | 0 (estimated) | 79 (estimated) |
| tasks | 1 | 0 | 0ms | unknown | success | 96099 (estimated) | 0 (estimated) | 0 (estimated) | 589 (estimated) |
| apply | 5 | 4 | 0ms | unknown | success, partial | 686902 (estimated) | 0 (estimated) | 0 (estimated) | 163 (estimated) |
| review-change | 1 | 0 | 0ms | unknown | success | 184950 (estimated) | 0 (estimated) | 0 (estimated) | 880 (estimated) |

**Total user questions asked**: 0

---

## Operative Memory

- `open_decisions`: Ausente en `state.yaml` para este cambio; no se registraron nuevas decisiones en `openspec/memory/decisions.md`.

---

## Change Inventory

El inventario de origen del cambio a preservar en el archivo histórico comprende 13 artefactos (excluyendo el plan autorreferencial `archive-plan.json`):

- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `design.md`
- `proposal.md`
- `specs/agents/spec.md`
- `specs/archive-plan-contract/spec.md`
- `specs/generator/spec.md`
- `specs/routing/spec.md`
- `specs/skills/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Ni este ejecutor ni el sub-agente realizan escrituras directas sobre las especificaciones vivas en `openspec/specs/**` o `docs/adr/**`, ni trasladan o eliminan el directorio de trabajo activo.
3. El orquestador ejecuta la transacción determinista llamando al runtime:
   ```bash
   node scripts/archive-transaction-run.js compact-lite-contract-and-consumer-compatibility
   ```
   (precedido opcionalmente por `node .ospec/sync-archive-plan-hashes.js compact-lite-contract-and-consumer-compatibility` para sincronización de digestión criptográfica).
4. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime es la única autoridad formal de cierre del cambio.
