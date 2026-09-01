# Archive Report: TUI System Doctor & Diagnostics (Milestone 6)

**Change**: `2026-08-30-tui-system-doctor`  
**Date**: 2026-08-30  
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)  
**Verification Verdict**: `PASS`  
**Quality Gates**: Approved (100% compliance, clean build, zero regressions)

---

## Executive Summary

El cambio `2026-08-30-tui-system-doctor` implementa el **Hito 6** de la hoja de ruta de la TUI de `ospec`, entregando la vista interactiva **TabDoctor (Pestaña 4)**, el motor desacoplado de diagnósticos del entorno (`internal/system/doctor.go`) y la integración completa en el shell raíz Elm:

1. **Motor de Diagnósticos del Sistema (`internal/system/doctor.go`)**:
   - Inspección en 4 dominios: Runtimes & Toolchain (Node.js >= 22, Go >= 1.23), Repository & Git (binario Git y working tree limpio), Project Configuration (`models.yaml`, `openspec/config.yaml`, `hooks/hooks.json`), y API Keys & Credentials (detección no bloqueante de claves estándar).
   - Tipos de severidad (`SeverityOK`, `SeverityWarning`, `SeverityError`), categorización tipada, cálculo de reportes consolidados y estado de salud (`Healthy`, `Degraded`, `Critical`).
   - Evidencias técnicas claras e instrucciones accionables de remediación rápida por chequeo.
   - Ejecución segura y no bloqueante mediante `context.WithTimeout(1*time.Second)`.

2. **Capa Visual Interactiva (`internal/tui/views/doctor/`)**:
   - Modelo Elm Bubble Tea (`doctor.Model`) con navegación por teclado (`↑/↓`, `j/k`, `Home/End`, `1-9`).
   - Disposición adaptativa Master-Detail con layout split horizontal ($\ge 96$ columnas) y apilado vertical ($< 96$ columnas), con clamps dimensionales seguros.
   - Tarjetas estilizadas con Lip Gloss: banner de salud global con métricas en tiempo real, checklist con badges coloreados (`✓ OK`, `⚠ AVISO`, `✗ ERROR`), panel de detalle con evidencia técnica y caja destacada de sugerencias de remediación (`💡 Remediación`).
   - Re-escaneo interactivo bajo demanda (`r` / `Enter`) que refresca los diagnósticos sin salir de la TUI.

3. **Integración en Shell Raíz (`internal/tui/app.go`)**:
   - Conexión de `TabDoctor` (ID 3 / Pestaña 4) en `AppModel`, con navegación por tecla `'4'`, rotación de tabs (`'tab'` / `'shift+tab'`) y acceso rápido `'d'` desde el Dashboard.
   - Propagación de eventos de redimensionado (`tea.WindowSizeMsg`) y refresco al conmutar.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS`
- **Tasks Complete**: 100%
- **Scenarios Satisfied**: 100% (`runtime-test` evidence level)
- **Build Status**: ✅ `go build ./cmd/ospec` (clean exit 0, zero warnings/errors)
- **Tests Execution**: ✅ 100% passed / 0 failed / 0 skipped (`go test -race ./...`)
- **Issues Found**: 0 CRITICAL, 0 WARNING, 0 SUGGESTION

---

## Merged Specifications Summary

| Domain | Action | Target Specification | Details | Status |
|--------|--------|----------------------|---------|--------|
| `tui-system-doctor` | Prepared (New Specification) | `openspec/specs/tui-system-doctor/spec.md` | Nueva especificación formal con 5 requisitos y 8 escenarios: `REQ-tui-doctor-001` (System Diagnostics Engine), `REQ-tui-doctor-002` (UI & Navigation), `REQ-tui-doctor-003` (Diagnostic Re-run Action), `REQ-tui-doctor-004` (Responsive Rendering), `REQ-tui-doctor-005` (Root AppModel Integration). | ✅ Ready for runtime commit |

---

## Proposed ADR Promotions

| Source | Target | Title |
|--------|--------|-------|
| `design.md (ADR-012)` | `docs/adr/adr-20260830-012-desacoplamiento-del-motor-de-diagnosticos-en-internal-system-doctor-go.md` | Desacoplamiento del motor de diagnósticos en internal/system/doctor.go |
| `design.md (ADR-013)` | `docs/adr/adr-20260830-013-arquitectura-split-master-detail-para-diagnosticos-y-remediaciones-en-bubbletea.md` | Arquitectura Split Master-Detail para diagnósticos y remediaciones en Bubble Tea |
| `design.md (ADR-014)` | `docs/adr/adr-20260830-014-chequeos-protegidos-por-timeouts-y-evaluacion-consultiva-de-api-keys.md` | Chequeos protegidos por timeouts y evaluación consultiva de API keys |
