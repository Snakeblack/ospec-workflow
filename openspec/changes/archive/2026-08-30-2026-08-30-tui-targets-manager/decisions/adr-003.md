# ADR-003: Sincronización declarativa segura sin invasión de runtime externo

- Status: proposed
- Change: 2026-08-30-tui-targets-manager
- Date: 2026-08-30

## Context
El usuario necesita materializar o actualizar la configuración declarativa de targets AI desde la TUI (`s` / `Enter`). Invocar compiladores pesados externos o subprocesos invasivos puede congelar el event loop de Bubbletea, fallar si no existen dependencias externas de Node.js o corromper configuraciones manuales existentes.

## Decision
Ejecutar la sincronización declarativa mediante operaciones seguras de scaffolding y escrituras atómicas en `internal/system/targets.go`, encapsuladas en comandos asíncronos Bubbletea (`tea.Cmd`) que emiten `TargetSyncedMsg` y actualizan la vista con toasts visuales no bloqueantes.

## Alternatives
- Invocación de subprocesos externos (`node scripts/configure/cli.js`): rechazada para evitar dependencias duras de runtime en el binario compilado de Go y evitar riesgo de bloqueos de I/O en la TUI.
- Sobrescritura destructiva indiscriminada de archivos: rechazada para preservar directivas o configuraciones personalizadas previas en el espacio de trabajo.

## Consequences
- Mantiene la interfaz de usuario fluida y libre de bloqueos durante la sincronización.
- Garantiza feedback visual inmediato (toasts temáticos de éxito o error) con auto-refresco del estado de inspección.
- Provee una implementación portable y autocontenida en Go sin requerir herramientas externas preinstaladas.
