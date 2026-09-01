# Design: TUI System Doctor & Diagnostics (Milestone 6)

## Overview

El **System Doctor** proporciona a los desarrolladores y operadores de `ospec` una vista unificada y proactiva de la salud del entorno de ejecución, herramientas del sistema, archivos de configuración del proyecto y credenciales de proveedores AI. La arquitectura se basa en una separación limpia entre el **Motor de Diagnóstico de Dominio** (`internal/system/doctor.go`), agnóstico a la interfaz de usuario, y la **Vista Interactiva Bubble Tea** (`internal/tui/views/doctor/`), integrada de forma natural en el shell raíz Elm (`internal/tui/app.go`).

```
+-------------------------------------------------------------------------+
|                              AppModel (tui)                             |
|  [Tab 1: Dashboard] [Tab 2: Models Hub] [Tab 3: Targets] [Tab 4: Doctor]|
+-------------------------------------------------------------------------+
                                     |
                                     v (TabDoctor)
+-------------------------------------------------------------------------+
|                       views/doctor.Model (Elm Loop)                     |
|  - Banner de Salud: [ ✓ All Systems Healthy | Total: 6 | Warn: 0 | Err: 0]|
|  +-----------------------------------+--------------------------------+ |
|  | Master: Lista de Chequeos         | Detail: Diagnóstico & Remedio  | |
|  |  > [✓ OK] Node.js (>= 22)         | ID: runtime-node               | |
|  |    [✓ OK] Go Toolchain (>= 1.23)  | Categoría: Runtimes & Toolchain| |
|  |    [✓ OK] Git CLI & Working Tree  | Severidad: ✓ OK                | |
|  |    [✓ OK] Project Config Files    | Evidencia: v22.14.0 en PATH    | |
|  |    [⚠ WARN] Provider API Keys     | 💡 Remediación: N/A (Óptimo)   | |
|  +-----------------------------------+--------------------------------+ |
|  - Atajos: ↑/↓: Navegar | j/k: Mover | r: Re-escanear | 1-4: Vistas     |
+-------------------------------------------------------------------------+
                                     |
                                     v calls
+-------------------------------------------------------------------------+
|                       internal/system/doctor.go                         |
|  - RunDiagnostics(repoRoot) -> DoctorReport                             |
|  - checkNodeVersion()   (ctx timeout 1s, parse >= 22)                   |
|  - checkGoVersion()     (ctx timeout 1s, parse >= 1.23)                 |
|  - checkGit()           (git status --porcelain)                        |
|  - checkConfigFiles()   (models.yaml, openspec/config.yaml, hooks)      |
|  - checkAPIKeys()       (advisory env vars: OPENAI, ANTHROPIC, etc.)    |
+-------------------------------------------------------------------------+
```

---

## Architectural Decision Records (ADRs)

### ADR-012: Desacoplamiento del motor de diagnósticos en `internal/system/doctor.go`
- **Contexto**: Los diagnósticos deben poder ejecutarse tanto desde la TUI interactiva como potencialmente desde comandos CLI o hooks headless en el futuro, sin arrastrar dependencias de Bubble Tea ni Lip Gloss.
- **Decisión**: Centralizar toda la lógica de inspección del entorno en `internal/system/doctor.go`, exponiendo estructuras de datos puras (`DoctorCheck`, `DoctorReport`, `CheckSeverity`, `CheckCategory`) y la función `RunDiagnostics(repoRoot string) DoctorReport`.
- **Consecuencias**:
  - Positivas: 100% testeable mediante tests unitarios rápidos en Go estándar; cero dependencias de UI en el motor de diagnóstico; reutilizable por otros comandos CLI.
  - Negativas: Requiere un mapeo de datos entre el reporte de dominio y el modelo visual Bubble Tea.

### ADR-013: Arquitectura Split Master-Detail para diagnósticos y remediaciones en Bubble Tea
- **Contexto**: Los usuarios necesitan visualizar tanto el panorama global de chequeos como el detalle específico de fallos y las instrucciones exactas para corregirlos (remediación rápida).
- **Decisión**: Implementar un patrón Master-Detail interactivo en `internal/tui/views/doctor/` que adapta dinámicamente su renderizado (Split horizontal para terminales $\ge 96$ columnas, apilado vertical para terminales $< 96$ columnas).
- **Consecuencias**:
  - Positivas: Experiencia de usuario clara y estructurada; el usuario puede ver la sugerencia de solución inmediata con un simple toque de tecla; adaptabilidad a cualquier tamaño de terminal.
  - Negativas: Mayor complejidad en la lógica de maquetación Lip Gloss.

### ADR-014: Chequeos protegidos por timeouts y evaluación consultiva de API keys
- **Contexto**: La ejecución de subprocesos (`node`, `go`, `git`) en sistemas sobrecargados puede provocar bloqueos indeseados en la UI. Además, la ausencia de API keys no debe tratarse como error bloqueante si el usuario está operando offline o con modelos locales.
- **Decisión**:
  - Proteger toda llamada a binarios del sistema mediante `context.WithTimeout(ctx, 1*time.Second)`.
  - Tratar la ausencia de variables de entorno de API keys como `SeverityWarning` de carácter consultivo (`advisory`), documentando las opciones disponibles sin marcar el sistema como crítico (`Critical`).
- **Consecuencias**:
  - Positivas: Garantía de latencia $< 100\text{ms}$ en la respuesta de la UI; tolerancia a entornos sin conexión o sin credenciales configuradas; sin falsos positivos de bloqueo.

---

## Data Structures & Contracts

### Package `internal/system` (`doctor.go`)

```go
package system

import "time"

type CheckSeverity string

const (
	SeverityOK      CheckSeverity = "ok"
	SeverityWarning CheckSeverity = "warning"
	SeverityError   CheckSeverity = "error"
)

type CheckCategory string

const (
	CategoryRuntime CheckCategory = "Runtimes & Toolchain"
	CategoryRepo    CheckCategory = "Repository & Git"
	CategoryConfig  CheckCategory = "Project Configuration"
	CategoryAuth    CheckCategory = "API Keys & Credentials"
)

type DoctorCheck struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Category    CheckCategory `json:"category"`
	Severity    CheckSeverity `json:"severity"`
	Message     string        `json:"message"`
	Details     string        `json:"details"`
	Remediation string        `json:"remediation"`
}

type DoctorReport struct {
	Timestamp     time.Time     `json:"timestamp"`
	RepoRoot      string        `json:"repo_root"`
	Checks        []DoctorCheck `json:"checks"`
	TotalPassed   int           `json:"total_passed"`
	TotalWarnings int           `json:"total_warnings"`
	TotalErrors   int           `json:"total_errors"`
}

func (r DoctorReport) Status() string {
	if r.TotalErrors > 0 {
		return "Critical"
	}
	if r.TotalWarnings > 0 {
		return "Degraded"
	}
	return "Healthy"
}

func RunDiagnostics(repoRoot string) DoctorReport
```

---

### Package `internal/tui/views/doctor` (`types.go` & `doctor.go`)

```go
package doctor

import (
	tea "github.com/charmbracelet/bubbletea"
	"github.com/snakeblack/ospec-workflow/internal/system"
)

type DoctorReloadMsg struct{}
type DoctorRefreshedMsg struct {
	Report system.DoctorReport
}

type Model struct {
	repoRoot string
	report   system.DoctorReport
	selected int
	width    int
	height   int
	ready    bool
}

func New(repoRoot string) Model
func (m Model) Init() tea.Cmd
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd)
func (m Model) View() string
func (m *Model) Refresh() tea.Cmd
func (m *Model) SetSize(w, h int)
```

---

## File Changes

| File | Change | Description |
|------|--------|-------------|
| `internal/system/doctor.go` | New | Motor de diagnóstico: Node.js (>=22), Go (>=1.23), Git, Config files, API keys, con cálculo de reportes y remediaciones |
| `internal/system/doctor_test.go` | New | Suite de pruebas unitarias para todas las comprobaciones del doctor |
| `internal/tui/views/doctor/types.go` | New | Definición de mensajes, constantes de estilo y estructura de datos de la vista |
| `internal/tui/views/doctor/doctor.go` | New | Ciclo de vida Elm de la vista: navegación, atajos de teclado y trigger de re-escaneo |
| `internal/tui/views/doctor/view.go` | New | Renderizado Lip Gloss: banner de salud, lista de checks coloreada y panel de remediación detallado |
| `internal/tui/views/doctor/doctor_test.go` | New | Suite de pruebas de la vista TUI: teclado, bounds, re-run, y layout |
| `internal/tui/app.go` | Modified | Integración de `TabDoctor` en `AppModel`, delegación de eventos y conmutación reactiva |
| `internal/tui/app_test.go` | Modified | Test de integración verificando acceso a TabDoctor y renderizado del doctor |
| `docs/tui/roadmap.md` | Modified | Actualización del Hito 6 a Completado |

---

## Testing & Verification Strategy

1. **Unit Testing (`internal/system/doctor_test.go`)**:
   - Test de parsing de versiones (Node >= 22, Go >= 1.23, fallback a error en versiones inferiores o ausentes).
   - Test de verificación de repositorio Git (clean vs dirty vs no git).
   - Test de archivos de configuración requeridos (`models.yaml`, `openspec/config.yaml`, `hooks/hooks.json`).
   - Test de variables de entorno de API keys (advisory warning vs ok).
   - Test de consolidación de `DoctorReport` y método `Status()`.
2. **View Testing (`internal/tui/views/doctor/doctor_test.go`)**:
   - Inicialización y renderizado del banner y lista de checks.
   - Navegación por teclado (`Up`, `Down`, `j`, `k`, `Home`, `End`, direct keys).
   - Seguridad dimensional en resize (`tea.WindowSizeMsg`).
   - Re-escaneo reactivo con tecla `r` / `Enter`.
3. **Integration Testing (`internal/tui/app_test.go`)**:
   - Navegación con tecla `4` a `TabDoctor`.
   - Propagación de refresco y renderizado en el loop Elm raíz.
