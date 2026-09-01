# Proposal: TUI System Doctor & Diagnostics (Milestone 6)

## Intent

Dotar a la TUI de `ospec` de su cuarta vista interactiva (**TabDoctor / Pestaña 4**), integrando un motor desacoplado de diagnósticos del entorno (`internal/system/doctor.go`) y una vista reactiva Bubble Tea/Lip Gloss (`internal/tui/views/doctor/`). Esta vista audita la salud del entorno de desarrollo (runtimes Node.js >= 22 y Go >= 1.23, estado del repositorio Git, integridad de archivos de configuración y presencia de API keys), proporcionando feedback visual con semáforo de severidades (`✓ OK`, `⚠ Aviso`, `✗ Error`), diagnósticos detallados, sugerencias de remediación inmediata y re-escaneo bajo demanda.

## Scope

### In Scope
- **Motor de Diagnósticos (`internal/system/doctor.go`)**:
  - Chequeos automáticos categorizados en 4 dominios:
    - *Runtimes & Toolchain*: Node.js (>= 22) y Go (>= 1.23).
    - *Repository & Git*: Binario de Git disponible y repositorio limpio (`git status --porcelain`).
    - *Configuration Files*: Presencia de `models.yaml`, `openspec/config.yaml`, `hooks/hooks.json` o `.hooks.json`.
    - *API Keys & Auth*: Detección informativa de variables de entorno (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `GITHUB_TOKEN`, etc.).
  - Tipos y severidades tipadas: `SeverityOK`, `SeverityWarning`, `SeverityError`, categorías, `DoctorCheck`, `DoctorReport`.
  - Sugerencias de remediación por cada chequeo fallido o con aviso.
  - API pública libre de dependencias de UI: `RunDiagnostics(repoRoot string) DoctorReport`.
- **Vista TUI del Doctor (`internal/tui/views/doctor/`)**:
  - Modelo Elm Bubble Tea (`Model`) con ciclo de vida completo (`Init`, `Update`, `View`).
  - Banner superior de resumen de salud general (`Healthy`, `Degraded`, `Critical`).
  - Lista navegable de chequeos con cursor interactivo (`↑`/`↓`, `j`/`k`, `Home`/`End`, `1`-`9`) y badges coloreados (`✓ OK`, `⚠ Aviso`, `✗ Error`).
  - Panel de detalle: evidencia técnica y caja destacada de recomendaciones de remediación.
  - Acción de re-escaneo interactivo (`r` o `Enter`).
  - Layout adaptativo: split horizontal lado a lado en terminales $\ge 96$ columnas, apilado vertical en terminales $< 96$ columnas.
- **Integración en Shell Raíz Elm (`internal/tui/app.go`)**:
  - Conexión de `TabDoctor` (ID 3 / Pestaña 4) en `AppModel`.
  - Manejo de navegación global (tecla `4`, `tab`, `shift+tab`), propagación de `tea.WindowSizeMsg` y refresco automático al entrar en la pestaña.

### Out of Scope
- Modificación del motor de hooks o reglas en TypeScript/Node.js.
- Hito 7: Footer global pulido, modal de ayuda `?`, empaquetado del binario release `ospec`.

## Capabilities

### New Capabilities
- `tui-system-doctor`: Motor de diagnósticos del entorno del sistema (`internal/system/doctor.go`), reporte consolidado de salud con remediaciones y vista interactiva Bubble Tea para TabDoctor en la TUI de ospec.

### Modified Capabilities
None

## Approach

- Crear el paquete de diagnóstico en `internal/system/doctor.go` implementando chequeos con `context.WithTimeout` de 1s para evitar bloqueos por comandos externos.
- Desarrollar la vista Elm `internal/tui/views/doctor/` aplicando los estilos comunes del sistema de diseño (`internal/tui/theme`).
- Conectar `doctor.Model` en `internal/tui/app.go` dentro del ciclo `Update` y `renderViewContent()`.
- Validar mediante suite TDD con cobertura de tests unitarios e integración para motor, vista y shell.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/system/doctor.go` | New | Motor de diagnósticos de runtimes, git, configuración y API keys con remediaciones |
| `internal/system/doctor_test.go` | New | Tests unitarios para el motor de diagnósticos y cálculo de reportes |
| `internal/tui/views/doctor/doctor.go` | New | Modelo Bubble Tea Elm y ciclo de vida de la vista System Doctor |
| `internal/tui/views/doctor/types.go` | New | Tipos de datos, mensajes y constantes de la vista del doctor |
| `internal/tui/views/doctor/view.go` | New | Renderizado Lip Gloss: banner de salud, lista de checks, panel de remediación y ayuda |
| `internal/tui/views/doctor/doctor_test.go` | New | Tests de interfaz, navegación por teclado y re-escaneo del doctor |
| `internal/tui/app.go` | Modified | Integración de `doctor.Model` en el loop Elm raíz bajo `TabDoctor` (pestaña 4) |
| `internal/tui/app_test.go` | Modified | Test de integración para conmutación a pestaña 4 y renderizado del doctor |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Comandos externos (`node`, `go`, `git`) bloquean la UI | Low | Ejecución protegida con `context.WithTimeout(1s)` y fallback seguro |
| Falsos positivos en variables de entorno de API keys | Low | Tratar API keys como advisory/warning sin bloquear la operatividad general |
| Desbordamiento visual en terminales estrechos | Low | Layout adaptativo split/stacked con clamps de anchura mínima |

## Rollback Plan

Revertir los archivos nuevos en `internal/system/doctor*.go` e `internal/tui/views/doctor/`, y restaurar `internal/tui/app.go` mediante `git checkout -- internal/tui/app.go internal/tui/app_test.go`.

## Dependencies

- Go standard library (`os`, `os/exec`, `path/filepath`, `context`, `time`, `strings`, `fmt`)
- `github.com/charmbracelet/bubbletea` y `github.com/charmbracelet/lipgloss`
- `internal/config` y `internal/tui/theme`

## Success Criteria

- [ ] `internal/system/doctor.go` diagnostica con precisión Node.js (>=22), Go (>=1.23), Git, archivos de configuración y API keys.
- [ ] `TabDoctor` (Pestaña 4) es accesible mediante tecla `4`, `tab` o atajos globales en la TUI.
- [ ] La interfaz muestra el checklist con badges (`✓ OK`, `⚠ Aviso`, `✗ Error`), detalles técnicos y sugerencias de remediación.
- [ ] La tecla `r` re-ejecuta los diagnósticos y actualiza la vista reactivamente.
- [ ] La suite completa de tests (`go test ./...`) compila y pasa al 100%.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
