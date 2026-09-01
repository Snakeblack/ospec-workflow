# Especificación: TUI Dashboard & Models Hub (Hitos 3 y 4)

## Resumen Ejecutivo

Esta especificación define los requisitos técnicos, contratos de comportamiento y escenarios de prueba para la **Vista 1: Dashboard & Accesos Rápidos** y la **Vista 2: Models Hub (Configurador de Modelos)** dentro de la TUI desacoplada `ospec` en Go.

---

## Requisitos Formales

### REQ-tui-dashboard-001: Model Profile Summary Card
El componente Dashboard DEBE renderizar una tarjeta informativa que exponga el preset activo actual (`cheap`, `default`, `premium`, `custom`), el modelo configurado por cliente AI y el tier asignado a los agentes clave del SDD (`sdd-propose`, `sdd-design`, `sdd-apply`, `sdd-verify`, `review-change`).

#### Escenario: Renderizado del Perfil de Modelos
- **GIVEN** un repositorio con `models.yaml` cargado y configurado en preset `default`
- **WHEN** se renderiza la vista del Dashboard
- **THEN** la tarjeta `MODEL PROFILE` muestra el badge `[Preset: Default]`, los modelos asignados a Claude, Codex, OpenCode, VS Code y Cursor, y los tiers de los agentes clave.

---

### REQ-tui-dashboard-002: Supported AI Targets Inspection Card
El componente Dashboard DEBE inspeccionar el filesystem del repositorio para identificar de forma segura la presencia de configuraciones de los 6 targets AI soportados (*Claude Code*, *Antigravity*, *VS Code / Copilot*, *Codex*, *OpenCode*, *Cursor*) y renderizar su estado con badges `✓ Configurado`, `⚙ Detectado` o `- Inactivo`.

#### Escenario: Detección de Clientes AI
- **GIVEN** un workspace con `.claude-plugin` y `AGENTS.md` presentes
- **WHEN** se ejecuta `DetectTargets(repoRoot)`
- **THEN** *Claude Code* y *Antigravity* retornan `StatusConfigured` con su archivo de evidencia correspondiente.

---

### REQ-tui-dashboard-003: OpenSpec Context Summary Card
El componente Dashboard DEBE parsear `openspec/config.yaml` y presentar un resumen estructurado del proyecto: nombre, versión, estado, modo TDD, runner de testing, capas de prueba activas y estado de baseline de dominios.

#### Escenario: Resumen del Contexto OpenSpec
- **GIVEN** `openspec/config.yaml` con `project.name = "ospec-workflow"`, `tdd_mode = "focused"` y `baseline.status = "done"`
- **WHEN** se renderiza el Dashboard
- **THEN** la tarjeta `OPENSPEC CONTEXT` refleja exactamente estos valores y muestra el estado de las capas unit/integration/e2e.

---

### REQ-tui-dashboard-004: Quick Actions Bar and Shortcuts
El Dashboard DEBE exponer una barra de acciones rápidas con soporte de navegación mediante teclado (`←/→/Tab`), ejecución con `Enter` y atajos directos de una sola pulsación (`[p]` para conmutar preset, `[d]` para Doctor, `[m]` para Models Hub, `[t]` para Targets Manager).

#### Escenario: Conmutación Rápida de Preset
- **GIVEN** el Dashboard con preset activo `default`
- **WHEN** el usuario presiona la tecla `p`
- **THEN** el preset cambia a `premium`, se persiste en `models.yaml`, se emite `PresetChangedMsg` y se actualiza el badge en la cabecera.

---

### REQ-tui-models-001: Visual Presets Selector
La vista Models Hub DEBE proporcionar una subvista de presets con tarjetas interactivas para *Cheap* (⚡), *Default* (⚖️) y *Premium* (🧠), mostrando sus características de latencia/costo, modelos por target y badge de estado activo.

#### Escenario: Aplicación de Preset desde Models Hub
- **GIVEN** la vista Models Hub en modo Presets
- **WHEN** el usuario navega a la tarjeta *Cheap* y presiona `Enter`
- **THEN** el preset `cheap` se aplica atómicamente a `models.yaml`, la tarjeta muestra el badge `[ACTIVO]` y se emite `PresetAppliedMsg`.

---

### REQ-tui-models-002: Granular Agent-to-Tier Configuration Table
La vista Models Hub DEBE proporcionar una subvista de afinamiento granular organizada por categorías (*Core & Orquestación*, *Fases SDD*, *Comité Revisor 4R*, *Fallback*) que permita modificar el tier asignado a cada subagente individual con teclas directas (`c`, `d`, `p`) o rotación (`←/→`).

#### Escenario: Modificación de Tier de un Subagente
- **GIVEN** la tabla de afinamiento granular con el cursor sobre `review-risk` (tier `default`)
- **WHEN** el usuario presiona la tecla `p`
- **THEN** el tier de `review-risk` se actualiza a `premium` en `models.yaml` de forma atómica y se emite `AgentTierUpdatedMsg`.

---

### REQ-tui-models-003: Responsive Multi-Column & Stacked Rendering
Tanto el Dashboard como el Models Hub DEBEN adaptar su layout según el ancho del terminal:
- Terminales anchos ($\ge 96$ o $\ge 110$ columnas): layout horizontal multi-columna.
- Terminales compactos ($< 96$ columnas): layout apilado vertical con clamps de ancho mínimo para evitar desbordamiento ANSI.

---

### REQ-tui-models-004: Atomic Persistence & Feedback Toasting
Toda modificación realizada en el Dashboard o en el Models Hub DEBE persistirse atómicamente en disco y proporcionar feedback visual inmediato (toasts en verde para éxito o naranja/rojo ante fallos).
