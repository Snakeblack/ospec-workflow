# Archive Report: TUI Targets Manager & Declarative Sync (Milestone 5)

**Change**: `2026-08-30-tui-targets-manager`  
**Date**: 2026-08-30  
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)  
**Verification Verdict**: `PASS`  
**Quality Gates**: Approved (100% compliance, clean build, zero regressions)

---

## Executive Summary

El cambio `2026-08-30-tui-targets-manager` implementa el Hito 5 de la hoja de ruta de la TUI en Go de `ospec`, entregando la vista interactiva **TabTargets (Pestaña 3)**, el motor de diagnóstico e inspección de targets AI en `internal/system/targets.go` y la acción de sincronización declarativa segura:

1. **Motor de Dominio e Inspección (`internal/system/targets.go`)**:
   - Inspección jerárquica de 4 estados (`Active`, `Configured`, `Detected`, `Inactive`) para los 6 targets AI soportados (*Claude Code*, *Antigravity*, *VS Code*, *Codex*, *OpenCode*, *Cursor*).
   - Diagnóstico detallado de archivos de configuración (`ConfigFileCheck`), matriz de capacidades nativas (`CapabilityMatrix`) y evidencia resolutiva.
   - Sincronizador declarativo atómico (`SyncTarget`) que materializa o refresca configuraciones base sin dependencias de runtimes externos.
   - Refactorización de `internal/tui/views/dashboard/detector.go` para unificar la inspección del sistema en todo el binario.

2. **Capa Visual Interactiva (`internal/tui/views/targets/`)**:
   - Modelo Elm Bubble Tea (`targets.Model`) con navegación por teclado (`↑/↓`, `j/k`, `Home/End`) y salto directo por teclas numéricas (`1` a `6`).
   - Disposición adaptativa Master-Detail con layout split horizontal ($\ge 96$ columnas) y apilado vertical ($< 96$ columnas), con clamps dimensionales seguros (30x10).
   - Tarjetas informativas con estilo Lip Gloss: badges de estado, panel de rutas encontradas vs faltantes, matriz de capacidades y barra de atajos.
   - Despacho asíncrono no bloqueante de sincronización (`s` / `Enter`) mediante `tea.Cmd` con notificaciones toast de éxito o error.

3. **Integración en Shell Raíz (`internal/tui/app.go`)**:
   - Cableado completo de `TabTargets` (ID 2 / Pestaña 3) en `AppModel`, con soporte de navegación directa (`'3'`), rotación cíclica (`'tab'` / `'shift+tab'`) y atajo rápido (`'t'`) desde el Dashboard.
   - Auto-refresco de diagnósticos (`Refresh()`) al conmutar a la pestaña y preservación de estado entre vistas.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS`
- **Tasks Complete**: 19 / 19 (100%)
- **Scenarios Satisfied**: 10 / 10 (100% `runtime-test` evidence level)
- **Build Status**: ✅ `go build ./cmd/ospec` (clean exit 0, zero warnings/errors)
- **Tests Execution**: ✅ 18 packages / 100% passed / 0 failed / 0 skipped (`go test ./... -v -race -count=1`)
- **Issues Found**: 0 CRITICAL, 0 WARNING, 0 SUGGESTION
- **Accepted Warnings**: None (zero residual risks)

---

## Merged Specifications Summary (Change-Local Preparation)

| Domain | Action | Target Specification | Details | Status |
|--------|--------|----------------------|---------|--------|
| `tui-targets-manager` | Prepared (New Specification) | `openspec/specs/tui-targets-manager/spec.md` | Nueva especificación formal con 5 requisitos y 10 escenarios: `REQ-tui-targets-001` (Target Inspection & Capability Matrix), `REQ-tui-targets-002` (UI & Navigation), `REQ-tui-targets-003` (Declarative Sync Trigger), `REQ-tui-targets-004` (Responsive Rendering & Edge-cases), `REQ-tui-targets-005` (Root AppModel Integration). | ✅ Ready for runtime commit |

---

## Proposed ADR Promotions

| Source | Proposed Target | Title |
|--------|-----------------|-------|
| `decisions/adr-001.md` | `docs/adr/adr-20260830-009-desacoplamiento-del-motor-de-inspeccion-de-targets-en-internal-system-targets-go.md` | Desacoplamiento del motor de inspección de targets en internal/system/targets.go |
| `decisions/adr-002.md` | `docs/adr/adr-20260830-010-arquitectura-de-panel-dividido-split-master-detail-responsiva-en-bubbletea.md` | Arquitectura de panel dividido (Split Master-Detail) responsiva en Bubbletea |
| `decisions/adr-003.md` | `docs/adr/adr-20260830-011-sincronizacion-declarativa-segura-sin-invasion-de-runtime-externo.md` | Sincronización declarativa segura sin invasión de runtime externo |

---

## Cost

No per-phase cost data was recorded for this change (`.ospec/session/2026-08-30-tui-targets-manager/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Change Inventory

Origin paths preserved by the planned runtime move:
- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `design.md`
- `proposal.md`
- `specs/tui-targets-manager/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Las escrituras vivas en `openspec/specs/tui-targets-manager/spec.md` y `docs/adr/adr-20260830-009..011-*.md`, la copia de inventario a staging, la verificación de integridad y el movimiento atómico de la carpeta a `openspec/changes/archive/2026-08-30-tui-targets-manager` son responsabilidad exclusiva del runtime transaccional determinista:
   ```bash
   node scripts/archive-transaction-run.js 2026-08-30-tui-targets-manager
   ```
3. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime constituye la única autoridad de cierre formal para el cambio.
