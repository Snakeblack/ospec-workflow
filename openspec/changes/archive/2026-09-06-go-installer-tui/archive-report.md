# Archive Report: Go Installer TUI

**Change**: `go-installer-tui`  
**Date**: 2026-09-06  
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)  
**Verification Verdict**: `PASS WITH WARNINGS` (0 critical issues, 1 advisory warning aceptado formalmente bajo approval `warning-001` en `state.yaml`)

---

## Executive Summary

El cambio `go-installer-tui` entrega un instalador de terminal guiado y minimalista implementado en Go, manteniendo compatibilidad total con la suite de instaladores existentes en Node.js y respetando las políticas de modelos declaradas:

1. **TUI Guiada con Navegación Persistente**:
   - Implementada en Go utilizando Bubble Tea v1.3.4 y estilos Lip Gloss v1.0.0, conservando el toolchain base Go 1.23.
   - Proceso interactivo estructurado en pasos secuenciales: Selección de Target -> Selección de Modelos por Agente -> Revisión -> Instalación Explícita.
   - El retroceso (Back) en cualquier punto conserva intactas las selecciones previas específicas de cada destino.

2. **Selección de Modelos Acotada por Capacidad**:
   - La selección de modelos por agente se deriva estrictamente de las capacidades declaradas por el adaptador para cada destino; no se permite entrada libre ni identificadores no soportados.
   - Destinos con configuración fija o heredada (como Antigravity y GitHub Copilot) omiten el selector de modelos y muestran su comportamiento heredado de forma informativa.
   - Los valores seleccionados no modifican el archivo canónico `models.yaml`, aplicándose únicamente como overrides efímeros en memoria durante la ejecución.

3. **Frontera de Confirmación Previa a la Instalación (No-Write Pre-Install)**:
   - La pantalla de revisión detalla el destino activo y la resolución efectiva (o heredada) para cada agente.
   - Ningún instalador es invocado ni se realiza ninguna mutación en disco antes de la acción explícita `Install`.
   - Salir o cancelar desde la revisión descarta el plan de forma limpia sin efectos colaterales.

4. **Adaptador Node y Delegación Segura**:
   - Se introduce `scripts/configure/installer-adapter.js` bajo el protocolo versionado JSON v1 (`plan` e `install`).
   - El modo `plan` es completamente de sólo lectura.
   - El modo `install` revalida el plan recibido y delega la ejecución al `main(argv, deps)` del instalador correspondiente a través de un seam compatible, preservando íntegramente sus diagnósticos, código de salida, transacciones y manifiestos de instalación.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS WITH WARNINGS`
- **Tasks Complete**: 12 / 12 (100%)
- **Delta Scenarios Satisfied**: 10 / 10 (100% de cumplimiento con nivel de evidencia `runtime-test`)
- **Automated Tests**:
  - Suite Node (`npm test`): 3.243 checkmarks pasados, 0 fallos (`final-node-regression.log`)
  - Suite Go (`go test ./...`): 11 paquetes aprobados, 0 fallos (`final-go-regression.log`)
  - Verificación interactiva PTY (`terminal-smoke.md`): menú, navegación Back, restauración de terminal y propagación de código de salida nativo 17 del fixture controlado.
- **Quality Review Gate**:
  - Estado: `done` / `approved`
  - Dominios evaluados: `trust`, `runtime`, `efficiency`
  - Hallazgos bloqueantes: 0
- **Warning Acceptance**:
  - Advertencia advisory `tasks-gap`: ausencia de IDs de requisitos estables (`REQ-install-019` .. `REQ-install-023`) en los nombres o comentarios de los archivos de prueba.
  - Aceptación formal: Registrada y autorizada explícitamente en `state.yaml` bajo la aprobación `warning-001` (`gate: verify-warning-acceptance`, decisión `accepted`, 2026-09-06T15:35:31.000Z) como deuda técnica / seguimiento futuro.

---

## Merged Specifications Summary (Change-Local Preparation)

Se preparó la especificación fusionada del dominio `install` de forma change-local en `specs/install/spec.md`, preservando la totalidad de los requisitos preexistentes e incorporando los requisitos del delta:

| Domain | Action | Requirements Modified / Added | Status |
|---|---|---|---|
| `install` | Prepared (Merged) | Preservados: `REQ-install-001` a `REQ-install-018` (§1 a §10 íntegros). Agregados en §11: `REQ-install-019` (Guided Single-Target Installer TUI), `REQ-install-020` (Capability-Evidenced Per-Agent Model Choices), `REQ-install-021` (Review Before Explicit Installation), `REQ-install-022` (Adapter Plan and Delegated Installation), `REQ-install-023` (Installer TUI Contract Coverage). | ✅ Ready for runtime commit (`openspec/specs/install/spec.md`) |

---

## Proposed ADR Promotions

Se proponen dos Decisiones de Arquitectura (ADR) para su promoción al catálogo permanente en `docs/adr/`:

| Source | Proposed Target | Title |
|---|---|---|
| `decisions/adr-001.md` | `docs/adr/adr-20260906-001-bubble-tea-for-installer-navigation.md` | Bubble Tea for installer navigation |
| `decisions/adr-002.md` | `docs/adr/adr-20260906-002-node-adapter-and-ephemeral-model-overrides.md` | Node adapter and ephemeral model overrides |

---

## Cost

Estimated token cost per phase, aggregated from `.ospec/session/go-installer-tui/phase-costs.jsonl`. Figures are heuristic estimates (~4 bytes/token), not exact metering.

| Phase | Invocations | Re-launches | Duration | Model Tiers | Statuses | Estimated Prompt Tokens | Estimated Artifact Tokens | Estimated Tool Output Tokens | Estimated Output Tokens |
|-------|-------------|-------------|----------|-------------|----------|-------------------------|---------------------------|------------------------------|-------------------------|
| propose | 1 | 0 | 0ms | unknown | unknown | 69925 (estimated) | 0 (estimated) | 0 (estimated) | 85 (estimated) |
| spec | 1 | 0 | 0ms | unknown | blocked | 77512 (estimated) | 0 (estimated) | 0 (estimated) | 31 (estimated) |
| tasks | 1 | 0 | 0ms | unknown | success | 84969 (estimated) | 0 (estimated) | 0 (estimated) | 73 (estimated) |
| apply | 6 | 5 | 0ms | unknown | success | 720717 (estimated) | 0 (estimated) | 0 (estimated) | 1493 (estimated) |
| verify | 2 | 1 | 0ms | unknown | success, blocked | 303338 (estimated) | 0 (estimated) | 0 (estimated) | 603 (estimated) |
| review-efficiency | 1 | 0 | 0ms | unknown | success | 160804 (estimated) | 0 (estimated) | 0 (estimated) | 215 (estimated) |
| review-trust | 1 | 0 | 0ms | unknown | success | 163675 (estimated) | 0 (estimated) | 0 (estimated) | 142 (estimated) |
| review-runtime | 1 | 0 | 0ms | unknown | success | 164199 (estimated) | 0 (estimated) | 0 (estimated) | 112 (estimated) |

**Total user questions asked**: 0

---

## Operative Memory

- `open_decisions`: Ausente en `state.yaml` para este cambio; no se registraron nuevas decisiones en `openspec/memory/decisions.md`.

---

## Change Inventory

El inventario de origen del cambio a preservar en el archivo histórico comprende 20 artefactos (excluyendo el plan autoreferencial `archive-plan.json`):

- `adapter-progress.md`
- `apply-progress.md`
- `archive-report.md`
- `client-progress.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `design.md`
- `final-go-regression.log`
- `final-node-regression.log`
- `node-regression.log`
- `proposal.md`
- `quality-review.json`
- `spec-result.json`
- `specs/install/spec.md`
- `state.yaml`
- `tasks.md`
- `terminal-smoke.md`
- `test-evidence.md`
- `tui-progress.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Ni este ejecutor ni el sub-agente realizan escrituras directas sobre las especificaciones vivas en `openspec/specs/**` o `docs/adr/**`, ni trasladan o eliminan el directorio de trabajo activo.
3. El orquestador ejecuta la transacción determinista llamando al runtime:
   ```bash
   node scripts/archive-transaction-run.js go-installer-tui
   ```
   (precedido opcionalmente por `node .ospec/sync-archive-plan-hashes.js go-installer-tui` para sincronización de digestión criptográfica).
4. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime es la única autoridad formal de cierre del cambio.
