# Archive Report: Canonicalize CX0 Context Measurement

**Change**: `canonicalize-cx0-context-measurement`  
**Date**: 2026-09-05  
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)  
**Verification Verdict**: `PASS` (0 critical issues, 0 warnings, 0 suggestions)

---

## Executive Summary

El cambio `canonicalize-cx0-context-measurement` extiende de manera uniforme la resolución canónica de identidad de agentes (`agent-identity`) a todos los puntos de entrada pendientes dentro del hook `SubagentStop`, resolviendo el follow-up `F-c1cf060d0008ff4f`:

1. **Persistencia de Mediciones de Contexto CX0 (`persistContextMeasurement` en JS)**:
   - `scripts/hooks/subagent-stop.js` ahora invoca `resolveCanonicalAgent` antes de llamar a `derivePhaseKey`.
   - Dispatches con prefijos de host/plugin (`plugin-host:sdd-spec`, `host:sdd-apply`) se resuelven a su identidad canónica (`sdd-spec`, `sdd-apply`), registrando debidamente registros CX0 en `.ospec/session/{change}/context-measurements.jsonl` en lugar de descartarse silenciosamente como `unsupported-agent`.
   - Mantiene aislamiento total frente a errores y omisiones fail-safe para agentes foráneos o no reconocidos.

2. **Persistencia de Result Envelope (`persistResultEnvelope` en JS y Go)**:
   - `scripts/hooks/subagent-stop.js` y `internal/hooks/subagentstop.go` resuelven la identidad canónica antes de derivar la clave de fase de estado y validar el contenido del envelope.
   - Pasa el agente canónico como contexto de fase a `validateEnvelope` (`{ phase }` en JS) y `resultenvelope.ValidateForPhase` (Go), garantizando la validación de contratos específicos de fase en dispatches prefijados.
   - Actualiza debidamente `phases.<phase>.summary` y `key_decisions` en `state.yaml` para dispatches prefijados.

3. **Resolución de Estado de Dispatch Fail-Closed (`resolveDispatchStatus` en JS y Go)**:
   - Evalúa `canonicalAgent === "sdd-spec"` (JS) y `canonicalAgent == "sdd-spec"` (Go).
   - Si un dispatch `sdd-spec` (incluyendo variantes prefijadas como `plugin-host:sdd-spec`) emite `status: "success"` pero su envelope viola el contrato de fase, el estado se degrada estrictamente a `"blocked"` fail-closed.

4. **Especificaciones y Paridad Transversal**:
   - `REQ-agent-identity-002` se actualiza formalmente para consolidar la autoridad única compartida que cubre `persistResultEnvelope`, `resolveDispatchStatus`, `persistContextMeasurement`, `persistPhaseCost` y la suite de evaluación benchmark.
   - `REQ-hooks-015` y `REQ-hooks-017` se actualizan para reflejar la resolución canónica en envelope, fail-closed guard y lane de telemetría CX0 en ambos runtimes.
   - Paridad estricta y exhaustiva entre Node.js y Go validada sin regresiones.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS`
- **Tasks Complete**: 15 / 15 (100%)
- **TDD Compliance**: 6/6 checks passed (RED confirmado, GREEN confirmado, triangulación adecuada y red de seguridad para archivos modificados).
- **Baseline Fingerprints (stale-baseline check)**:
  - `hooks`: `92fe66f82caf823c518cf979eb5ace4178e1b959194fef5d44aa15f6df5fa4db` (sin drift)
  - `agent-identity`: `f1d5bd4075869fef98633e860504ff88afea28194598c10629935f4a11df60e8` (sin drift)
- **Automated Tests**:
  - Suite Node.js: 74 tests passed (64 en `subagent-stop.test.js`, 10 en `parity-contract.test.js`, check.js limpio).
  - Suite Go: 36 tests passed en `internal/hooks/...`, 10/10 paquetes `ok` en `go test ./...`.
  - Total: 110 tests passed / 0 failed / 0 skipped.
- **Spec Compliance**: 13/13 escenarios satisfechos con nivel de evidencia `runtime-test`.
- **Review & Approval Gates**:
  - `intent-briefing`: Aceptado (`approval-001`, `2026-09-05T09:45:12Z`).
  - `execution-mode`: Fast-forward (`approval-002`, `2026-09-05T10:13:28Z`).
  - `delivery-strategy`: Exception-ok (`approval-003`, `2026-09-05T10:13:28Z`).
  - `propose-continue`: Continue-to-spec (`approval-004`, `2026-09-05T10:13:28Z`).
  - `apply-continue`: Continue-to-apply (`approval-005`, `2026-09-05T10:22:33Z`).
  - `archive-continue`: Continue-to-archive (`approval-006`, `2026-09-05T10:37:21Z`).
- **Issues Found**: 0 CRITICAL, 0 WARNING, 0 SUGGESTION.

---

## Merged Specifications Summary (Change-Local Preparation)

Se prepararon los contenidos de especificación completos y fusionados bajo la carpeta local del cambio (`openspec/changes/canonicalize-cx0-context-measurement/specs/`):

| Domain | Action | Requirements Modified / Added | Status |
|---|---|---|---|
| `hooks` | Prepared (Merged) | Modificados: `REQ-hooks-015` (resolución canónica en envelope, phase context y fail-closed a blocked para spec prefijado) y `REQ-hooks-017` (resolución canónica en emisión fail-safe de mediciones de contexto CX0). Preservados: Todos los demás requisitos normativos (`REQ-hooks-001`, `REQ-hooks-003` a `REQ-hooks-007`, `REQ-hooks-014`, `REQ-hooks-016`, `REQ-hooks-018`, `REQ-hooks-019` y contratos E1). | ✅ Ready for runtime commit (`openspec/specs/hooks/spec.md`) |
| `agent-identity` | Prepared (Merged) | Modificado: `REQ-agent-identity-002` (ampliada formalmente la autoridad única compartida para incluir `persistResultEnvelope`, `resolveDispatchStatus` y `persistContextMeasurement`). Preservados: `REQ-agent-identity-001` y `REQ-agent-identity-003`. | ✅ Ready for runtime commit (`openspec/specs/agent-identity/spec.md`) |

---

## Proposed ADR Promotions

Se propone la siguiente decisión arquitectónica para su promoción formal a `docs/adr/` durante la transacción de archivo:

| Source | Proposed Target | Title |
|---|---|---|
| `decisions/adr-001.md` | `docs/adr/adr-20260905-003-canonical-agent-resolution-in-subagent-stop-ingress-points.md` | Uniform Canonical Agent Identity Resolution Across SubagentStop Hooks |

---

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/canonicalize-cx0-context-measurement/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Change Inventory

El inventario de origen del cambio a preservar en el archivo histórico comprende:

- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `design.md`
- `proposal.md`
- `specs/agent-identity/spec.md`
- `specs/hooks/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Ni este ejecutor ni el sub-agente realizan escrituras directas sobre `openspec/specs/**` o `docs/adr/**`, ni mueven o eliminan la carpeta del cambio activo.
3. El orquestador ejecuta la transacción determinista llamando al runtime:
   ```bash
   node scripts/archive-transaction-run.js canonicalize-cx0-context-measurement
   ```
   (precedido opcionalmente por `node .ospec/sync-archive-plan-hashes.js canonicalize-cx0-context-measurement` para sincronización de digestión).
4. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime es la única autoridad formal de cierre del cambio.
