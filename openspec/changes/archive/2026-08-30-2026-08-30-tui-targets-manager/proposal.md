# Proposal: TUI Targets Manager & Declarative Sync (Milestone 5)

## Intent

Dotar a la TUI de `ospec` de su tercera vista interactiva esencial (**TabTargets / Pestaña 3**), proporcionando un centro de control visual y motor de diagnóstico para los 6 targets AI soportados (*Claude Code*, *Antigravity*, *VS Code / Copilot*, *Codex*, *OpenCode*, *Cursor*). Esta vista permite auditar la presencia de archivos de configuración y binarios, inspeccionar capacidades y herramientas por target, y ejecutar acciones interactivas de sincronización declarativa sin abandonar la interfaz de terminal.

## Scope

### In Scope
- **Motor de inspección de targets (`internal/system/targets.go`)**:
  - Detección rigurosa y tipada del estado de los 6 targets AI con 4 niveles: `Active` (en ejecución/contexto actual), `Configured` (archivos de configuración presentes en repo), `Detected` (artefactos en dist/binario en PATH), e `Inactive` (no configurado).
  - Mapeo de rutas clave de configuración por target (`.claude-plugin`, `AGENTS.md`, `codex.toml`, `opencode.json`, `.cursorrules`, `.vscode/settings.json`, etc.).
  - Matriz de capacidades nativas (subagentes, MCP, hooks, skills, context window, dynamic tools) y herramientas soportadas.
  - Generador/sincronizador declarativo que materializa o refresca la configuración del target seleccionado.
- **Interfaz visual interactiva (`internal/tui/views/targets/`)**:
  - Lista navegable de targets con soporte de teclas de cursor (`↑`/`↓`, `j`/`k`) y selección directa (`1`-`6`).
  - Panel de detalle e inspección dividido en tarjetas informativas: estado con badges temáticos, archivos detectados vs faltantes, capacidades activas y catálogo de herramientas.
  - Acción interactiva de generación/sincronización declarativa (tecla `s` o `enter`) con toast de feedback en tiempo real.
- **Integración en shell raíz Elm (`internal/tui/app.go`)**:
  - Conexión de `TabTargets` (ID 2 / Pestaña 3) en el ciclo de mensajes de Bubble Tea, permitiendo conmutación por `3`, `tab` y atajos globales.
  - Coexistencia fluida y sincronización de estado con Dashboard (`TabDashboard`) y Models Hub (`TabModels`).

### Out of Scope
- Modificación del motor compilador o perfiles target en TypeScript/Node.js (`scripts/lib/target-transform.js`).
- Hito 6 (System Doctor) e Hito 7 (Empaquetado binario release).

## Capabilities

### New Capabilities
- `tui-targets-manager`: Motor de inspección de estado, rutas, herramientas y capacidades para los 6 targets AI soportados, sincronización declarativa interactiva y vista interactiva Bubble Tea para TabTargets en la TUI de ospec.

### Modified Capabilities
None

## Approach

- Crear el paquete `internal/system` con estructuras `TargetSpec`, `TargetStatus`, `TargetCapability` y funciones `InspectTargets(repoRoot string)` y `SyncTarget(repoRoot string, targetID string)`.
- Diseñar la vista Elm `internal/tui/views/targets/` respetando el sistema de diseño (`internal/tui/theme`), dividida en lista lateral/superior y pane de diagnóstico detallado.
- Exponer mensajes Bubble Tea tipados (`TargetSelectedMsg`, `TargetSyncedMsg`, `TargetStatusChangedMsg`) para desacoplar el estado de la vista de la lógica de aplicación.
- Enlazar la pestaña `TabTargets` en `internal/tui/app.go` inicializando el modelo de targets y delegando `Update` y `View` cuando la pestaña 3 esté activa.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/system/targets.go` | New | Motor de detección, inspección de rutas/herramientas y sincronización de targets AI |
| `internal/system/targets_test.go` | New | Tests unitarios para detección de estado y sincronización de targets |
| `internal/tui/views/targets/targets.go` | New | Modelo Bubble Tea Elm, ciclo de vida y handlers de interacción de TabTargets |
| `internal/tui/views/targets/types.go` | New | Tipos de datos, mensajes y constantes visuales de la vista de targets |
| `internal/tui/views/targets/view.go` | New | Renderizado Lip Gloss: lista de targets, badges de estado, panel de capacidades y ayuda |
| `internal/tui/views/targets/targets_test.go` | New | Tests de interfaz, navegación por teclado y acciones interactivas de targets |
| `internal/tui/app.go` | Modified | Integración de `targets.Model` en el loop Elm raíz bajo `TabTargets` (pestaña 3) |
| `internal/tui/app_test.go` | Modified | Test de integración para conmutación a pestaña 3 y renderizado de targets |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Falsos positivos/negativos en detección de targets | Low | Chequeos jerárquicos ordenados de rutas de configuración con fallback seguro a `Inactive` |
| Bloqueo de UI durante la sincronización de configuración | Low | Ejecución no bloqueante o feedback inmediato vía mensajes asíncronos en Bubble Tea |
| Desbordamiento visual en terminales compactas | Low | Layout adaptativo con scroll vertical o apilado en anchos inferiores a 80 columnas |

## Rollback Plan

Revertir los archivos nuevos en `internal/system/` e `internal/tui/views/targets/`, y restablecer `internal/tui/app.go` a su estado anterior mediante `git checkout -- internal/tui/app.go internal/tui/app_test.go`.

## Dependencies

- Go standard library (`os`, `path/filepath`, `strings`, `fmt`)
- `github.com/charmbracelet/bubbletea` y `github.com/charmbracelet/lipgloss`
- `internal/config` y `internal/tui/theme`

## Success Criteria

- [ ] `internal/system/targets.go` detecta e inspecciona con precisión los 6 targets AI en cualquier workspace.
- [ ] La vista `TabTargets` en `internal/tui/views/targets/` muestra la lista navegable y panel de detalles con badges correctos.
- [ ] La acción de sincronización declarativa genera/actualiza la configuración del target seleccionado y muestra confirmación visual.
- [ ] La navegación en `internal/tui/app.go` permite alternar a la pestaña 3 con `3`, `tab` o atajos sin regresiones en Dashboard ni Models Hub.
- [ ] La suite de tests en Go (`go test ./...`) compila y pasa al 100%.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
