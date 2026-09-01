# Tasks: TUI Targets Manager & Declarative Sync (Milestone 5)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| `REQ-tui-targets-001`: Target Inspection & Capability Matrix | MUST | `internal/system/targets.go`, `InspectTargets()`, `InspectTarget()` | covered-by-design | Detección de 6 targets AI, jerarquía de 4 estados, rutas y capacidades. |
| Scenario: Inspect all supported AI targets in configured workspace | MUST | `internal/system/targets_test.go` | covered-by-design | Verificación de estados `Configured` ante `.claude-plugin`, `AGENTS.md`. |
| Scenario: Target status fallback to Inactive | MUST | `internal/system/targets_test.go` | covered-by-design | Retorno de `Inactive` en workspace vacío sin fallos. |
| `REQ-tui-targets-002`: Targets Manager UI & Navigation | MUST | `internal/tui/views/targets/types.go`, `cards.go`, `targets.go` | covered-by-design | Modelo Elm, navegación por teclado (`↑/↓/j/k`, `1-6`, `Home/End`), badges y tarjetas de diagnóstico. |
| Scenario: Navigate target list with keyboard | MUST | `internal/tui/views/targets/targets_test.go` | covered-by-design | Actualización reactiva del índice seleccionado y renderizado de detalle. |
| Scenario: Direct numeric jump | MUST | `internal/tui/views/targets/targets_test.go` | covered-by-design | Salto directo de índice (`1` a `6`) con renderizado inmediato. |
| `REQ-tui-targets-003`: Declarative Target Synchronization Trigger | MUST | `internal/system/targets.go` (`SyncTarget`), `internal/tui/views/targets/targets.go` | covered-by-design | Atajo `s`/`Enter`, ejecución asíncrona con `tea.Cmd`, feedback por toast y auto-refresh. |
| Scenario: Synchronize selected target successfully | MUST | `internal/tui/views/targets/targets_test.go`, `internal/system/targets_test.go` | covered-by-design | Creación atómica de archivos declarativos y notificación toast verde. |
| Scenario: Handle synchronization failure gracefully | MUST | `internal/tui/views/targets/targets_test.go` | covered-by-design | Manejo resiliente sin panic, toast rojo de error. |
| `REQ-tui-targets-004`: Responsive Rendering & Edge-case Handling | MUST | `internal/tui/views/targets/cards.go`, `targets.go` | covered-by-design | Layout Split ($\ge 96$) vs Stacked ($< 96$), clamps de dimensiones y truncado seguro. |
| Scenario: Layout adaptation on terminal resize | MUST | `internal/tui/views/targets/targets_test.go` | covered-by-design | Transición dinámica de split a stacked en `WindowSizeMsg`. |
| Scenario: Minimum dimension safety | MUST | `internal/tui/views/targets/targets_test.go` | covered-by-design | Dimensiones extremas (30x10) sin roturas ANSI ni panics. |
| `REQ-tui-targets-005`: Root AppModel Integration | MUST | `internal/tui/app.go`, `internal/tui/views/dashboard/detector.go` | covered-by-design | Integración en `AppModel` bajo `TabTargets`, propagación de eventos, atajos `'3'`, `'tab'`, `'t'` y refresh. |
| Scenario: Switch to TabTargets via numeric key '3' | MUST | `internal/tui/app_test.go` | covered-by-design | Conmutación directa y activación de `TabTargets`. |
| Scenario: Switch to TabTargets via dashboard quick action 't' | MUST | `internal/tui/app_test.go` | covered-by-design | Recepción de `SwitchTabMsg` y transición de pestaña. |

### Reconciliation Verdict

- **MUST coverage**: complete (100% de requerimientos y escenarios cubiertos por el diseño arquitectónico).
- **SHOULD/MAY gaps**: none.
- **Ambiguities to track**: none.

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 520 - 620 lines (código + tests unitarios e integración) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (o 3 unidades de trabajo autónomas en caso de requerir split) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Motor de Dominio e Inspección (`internal/system/targets.go` + tests) | PR 1 (o Slice 1) | Tipos de datos, escaneo de 6 targets, matriz de capacidades, sincronización declarativa y tests. |
| 2 | Componente Visual Targets Manager UI (`internal/tui/views/targets/` + tests) | PR 2 (o Slice 2) | Tipos, badges, tarjetas Lip Gloss, modelo Elm responsivo, navegación y tests de renderizado. |
| 3 | Integración con AppModel y Refactorización Dashboard (`internal/tui/app.go` + tests) | PR 3 (o Slice 3) | Cableado de `TabTargets`, atajos globales, conmutación reactiva y tests de integración. |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Motor de Inspección y Capacidades de Targets

- [x] 1.1 [RED] Escribir tests unitarios para `InspectTargets` e `InspectTarget` en `internal/system/targets_test.go` verificando los 6 targets AI (`claude`, `antigravity`, `vscode`, `codex`, `opencode`, `cursor`), la jerarquía de 4 estados (`Active`, `Configured`, `Detected`, `Inactive`), rutas `ConfigFileCheck` y matriz `CapabilityMatrix`. [REQ-tui-targets-001]
- [x] 1.2 [RED] Escribir tests unitarios para `SyncTarget` en `internal/system/targets_test.go` verificando la generación segura de archivos declarativos de configuración y el manejo de errores ante permisos o directorios inválidos. [REQ-tui-targets-003]
- [x] 1.3 [GREEN] Implementar tipos de dominio (`TargetSpec`, `TargetStatusKind`, `ConfigFileCheck`, `CapabilityMatrix`) y funciones de escaneo `InspectTargets` e `InspectTarget` en `internal/system/targets.go`. [REQ-tui-targets-001]
- [x] 1.4 [GREEN] Implementar `SyncTarget` en `internal/system/targets.go` para materializar las configuraciones base de cada target de forma atómica y no destructiva. [REQ-tui-targets-003]
- [x] 1.5 [REFACTOR] Refactorizar `internal/tui/views/dashboard/detector.go` para delegar la detección en `internal/system/targets.go`, manteniendo compatibilidad con `dashboard.TargetInfo` y verificando que la suite de dashboard continúe en verde. [REQ-tui-targets-001, REQ-tui-targets-005]

---

## Phase 2: Componente Targets Manager UI

- [x] 2.1 [RED] Escribir tests unitarios para `targets.Model` en `internal/tui/views/targets/targets_test.go` cubriendo inicialización, navegación por teclado (`↑/↓`, `j/k`, `1-6`, `Home/End`), límites de cursor `[0, 5]` y emisión de mensajes. [REQ-tui-targets-002]
- [x] 2.2 [RED] Escribir tests unitarios para layout responsivo (split horizontal $\ge 96$ vs vertical stacked $< 96$) y clamps de dimensiones mínimas (30x10) en `internal/tui/views/targets/targets_test.go`. [REQ-tui-targets-004]
- [x] 2.3 [GREEN] Crear `internal/tui/views/targets/types.go` definiendo tipos de vista, badges Lip Gloss (`StatusBadge`), mensajes Bubble Tea (`TargetSelectedMsg`, `TargetSyncedMsg`) y constantes de ayuda. [REQ-tui-targets-002]
- [x] 2.4 [GREEN] Crear `internal/tui/views/targets/cards.go` implementando funciones de renderizado modular con Lip Gloss para la lista de targets, panel de diagnóstico detallado (cabecera con badge, rutas configuradas vs faltantes, matriz de capacidades) y barra de atajos. [REQ-tui-targets-002, REQ-tui-targets-004]
- [x] 2.5 [GREEN] Crear `internal/tui/views/targets/targets.go` implementando el modelo Elm `Model`, ciclo de vida (`Init`, `Update`, `View`, `SetSize`, `Refresh`), despacho asíncrono no bloqueante `SyncSelectedTarget()` y notificaciones toast. [REQ-tui-targets-002, REQ-tui-targets-003, REQ-tui-targets-004]
- [x] 2.6 [REFACTOR] Optimizar composición de estilos Lip Gloss y truncado seguro de texto en `cards.go` y `targets.go` previniendo desbordamientos ANSI en cualquier resolución de terminal. [REQ-tui-targets-002, REQ-tui-targets-004]

---

## Phase 3: Integración con AppModel y Sincronización Declarativa

- [x] 3.1 [RED] Escribir tests de integración en `internal/tui/app_test.go` para transiciones hacia `TabTargets` (Tab ID 2) mediante la tecla `'3'`, rotación con `'tab'` / `'shift+tab'` y mensaje `SwitchTabMsg` desde Dashboard. [REQ-tui-targets-005]
- [x] 3.2 [RED] Escribir tests de integración en `internal/tui/app_test.go` verificando que la activación de `TabTargets` ejecuta `Refresh()` y que los eventos de teclado y redimensionamiento se propagan a `targets.Model`. [REQ-tui-targets-003, REQ-tui-targets-005]
- [x] 3.3 [GREEN] Actualizar `internal/tui/app.go` integrando el campo `targets targets.Model` en `AppModel`, inicializándolo en `NewAppModelWithRoot()`, y conectando el ciclo de eventos `Update()` para `TabTargets`. [REQ-tui-targets-005]
- [x] 3.4 [GREEN] Actualizar `renderViewContent()` en `internal/tui/app.go` para invocar `m.targets.View()` cuando `m.activeTab == TabTargets`. [REQ-tui-targets-005]
- [x] 3.5 [REFACTOR] Verificar la consistencia global de navegación, transiciones fluidas entre pestañas y persistencia de estado entre Dashboard, Models Hub y Targets Manager. [REQ-tui-targets-005]

---

## Phase 4: Verificación Integral, Build y 4R Review Gate

- [x] 4.1 Ejecutar suite completa de tests (`go test ./... -v -race`) validando que el 100% de los tests unitarios y de integración pasen exitosamente. [REQ-tui-targets-001, REQ-tui-targets-002, REQ-tui-targets-003, REQ-tui-targets-004, REQ-tui-targets-005]
- [x] 4.2 Compilar el binario (`go build ./cmd/ospec`) asegurando cero errores y advertencias de compilación. [REQ-tui-targets-001, REQ-tui-targets-005]
- [x] 4.3 Ejecutar verificación 4R (Relevance, Reliability, Robustness, Resilience) y generar reporte de calidad para confirmar que todos los requisitos fueron satisfechos sin regresiones. [REQ-tui-targets-001, REQ-tui-targets-002, REQ-tui-targets-003, REQ-tui-targets-004, REQ-tui-targets-005]
