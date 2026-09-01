# 🗺️ Roadmap de Implementación: TUI `ospec`

Este roadmap desglosa las tareas, entregables, componentes y criterios de aceptación para construir la TUI interactiva `ospec` en Go, totalmente desacoplada del arnés.

---

## Estado Global del Roadmap

| Hito | Descripción | Estado |
| :--- | :--- | :---: |
| **Hito 1** | Cimientos, Dependencias y Shell Visual (Header, Logo, Tema) | ✅ Completado |
| **Hito 2** | Motor Declarativo de Persistencia (Opción B: `yaml.v3`) | ✅ Completado |
| **Hito 3** | Vista 1: Dashboard & Accesos Rápidos | ✅ Completado |
| **Hito 4** | Vista 2: Models Hub (Presets y Afinamiento por Agente) | ✅ Completado |
| **Hito 5** | Vista 3: Targets Manager & Sincronización Declarativa | ✅ Completado |
| **Hito 6** | Vista 4: System Doctor & Diagnóstico | ✅ Completado |
| **Hito 7** | Footer, UX Polish, Build del Binario y Verificación | ✅ Completado |

---

## 📌 Desglose Detallado de Hitos y Tareas

### 🧱 Hito 1: Cimientos, Dependencias y Shell Visual
> **Objetivo:** Tener el esqueleto funcional de la aplicación Bubbletea con su identidad visual, tema Lipgloss y cabecera con logo ASCII.

- [x] **1.1. Dependencias Go:**
  - Agregar módulos oficiales al `go.mod`:
    - `github.com/charmbracelet/bubbletea`
    - `github.com/charmbracelet/lipgloss`
    - `github.com/charmbracelet/bubbles`
    - `github.com/charmbracelet/huh`
    - `gopkg.in/yaml.v3`
- [x] **1.2. Sistema de Diseño / Tema Lipgloss (`internal/tui/theme/`):**
  - Paleta de colores inspirada en Scandinavian / Gentle-AI:
    - Primary (Cyan / Celeste brillante)
    - Accent (Magenta / Púrpura suave)
    - Success (Verde Esmeralda)
    - Warning (Ámbar cálido)
    - Subdued (Gris tenue / Dark Slate)
  - Estilos reutilizables para cajas, bordes redondeados, badges, pestañas activas/inactivas y textos destacados.
- [x] **1.3. Componente Cabecera (`internal/tui/header/`):**
  - Banner con logo en ASCII art `OSPEC`.
  - Badges informativos dinámicos:
    - Versión del proyecto (ej. `v2.56.0`).
    - Perfil de modelo activo (`Premium`, `Default`, `Cheap`).
    - Rama Git y estado del repo.
- [x] **1.4. Skeleton del App Model (`cmd/ospec/main.go`, `internal/tui/app.go`):**
  - Implementación de la arquitectura Elm (`Init`, `Update`, `View`).
  - Manejo de redimensionamiento de ventana (`tea.WindowSizeMsg`).
  - Navegación global por pestañas (`Tab`, `Shift+Tab`, `1-4`).
  - Atajos globales (`q`, `ctrl+c`, `?`).

---

### ⚙️ Hito 2: Motor Declarativo de Persistencia (Opción B)
> **Objetivo:** Leer y escribir la configuración de modelos y OpenSpec directamente en YAML sin depender de scripts de Node.js.

- [x] **2.1. Modelos de datos Go para Modelos (`internal/config/models.go`):**
  - Structs para `models.yaml`:
    - Sección `agents`: mapeo de nombre de agente (`sdd-propose`, `sdd-design`, `sdd-apply`, `sdd-verify`, `review-*`) a tier (`premium`, `default`, `cheap`).
    - Sección `tiers`: mapeo de cada tier a targets (`claude`, `vscode`, `opencode`, `codex`, `cursor`, `antigravity`).
  - Structs para perfiles en `profiles/models/*.yaml` (`cheap.yaml`, `default.yaml`, `premium.yaml`).
- [x] **2.2. Gestor de Modelos (`internal/config/models_manager.go`):**
  - Métodos para leer `models.yaml` y perfiles activos.
  - Método para aplicar presets predefinidos (`ApplyPreset("cheap"|"default"|"premium")`).
  - Método para modificar granularmente la asignación de un agente o target.
  - Escritura atómica (escritura a archivo temporal y rename para prevenir corrupción).
- [x] **2.3. Gestor de OpenSpec (`internal/config/openspec_manager.go`):**
  - Lectura de `openspec/config.yaml` (versión, escala de proyecto, estado de baseline, testing runner).
- [x] **2.4. Tests Unitarios del Motor (`internal/config/*_test.go`):**
  - Validar round-trips de lectura y guardado sin pérdida de datos.

---

### 🏠 Hito 3: Vista 1 - Dashboard & Accesos Rápidos
> **Objetivo:** Pantalla de bienvenida que ofrece una radiografía instantánea del estado del ecosistema y accesos rápidos.

- [x] **3.1. Tarjetas de Resumen (`internal/tui/views/dashboard/`):**
  - Tarjeta de **Model Profile**: Muestra el perfil actual y los modelos principales en uso.
  - Tarjeta de **Targets Soportados**: Indicador visual de qué targets están listos/configurados.
  - Tarjeta de **OpenSpec Context**: Resumen del modo TDD, estado de baseline y reglas activas.
- [x] **3.2. Acciones Rápidas (Quick Actions):**
  - Acceso directo para conmutar preset en 1 clic.
  - Acceso directo para ejecutar el Doctor del sistema.

---

### 🧠 Hito 4: Vista 2 - Models Hub (Configurador de Modelos)
> **Objetivo:** Permitir cambiar modelos de forma visual, tanto con presets instantáneos como con afinación granular.

- [x] **4.1. Selector de Presets (Vista Rápida):**
  - Selector en tarjetas visuales:
    - ⚡ **Cheap:** Modelos ligeros (Haiku / Luna / Composer / Flash).
    - ⚖️ **Default:** Modelos estándar (Sonnet / Terra / Grok).
    - 🧠 **Premium:** Modelos de alto razonamiento (Opus / Sol / Pro).
  - Previsualización del ahorro / capacidad antes de confirmar.
  - Guardado interactivo con feedback visual.
- [x] **4.2. Afinamiento Granular por Agente (Vista Detallada):**
  - Lista interactiva de todos los agentes del SDD (`sdd-orchestrator`, `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`, `sdd-archive`, `review-*`).
  - Selector desplegable para cambiar el tier asignado a cada uno.
  - Configuración de parámetros avanzados (ej. `reasoning_effort`, `verbosity` para Codex/Copilot).

---

### 🎯 Hito 5: Vista 3 - Targets Manager & Sincronización
> **Objetivo:** Visualizar y gestionar las configuraciones de los diferentes clientes AI soportados.

- [x] **5.1. Detección de Clientes AI (`internal/system/targets.go`):**
  - Detección de configuraciones existentes para:
    - Claude Code (`.claude/` / `CLAUDE.md`)
    - Antigravity / Gemini CLI (`.gemini/`)
    - GitHub Copilot (`.github/copilot-instructions.md`)
    - Codex (`.codex/` / `codex.toml`)
    - OpenCode (`.opencode/`)
    - Cursor (`.cursorrules` / `.cursor/`)
    - VS Code (`.vscode/settings.json`)
- [x] **5.2. Interfaz de Gestión de Targets (`internal/tui/views/targets/`):**
  - Lista de targets con badges de estado (`Activo`, `Detectado`, `No configurado`).
  - Botón interactivo para generar/actualizar la configuración declarativa del target seleccionado.

---

### 🩺 Hito 6: Vista 4 - System Doctor & Diagnóstico
> **Objetivo:** Diagnóstico interactivo para asegurar que el entorno de desarrollo tiene todo lo necesario.

- [x] **6.1. Motor de Chequeos (`internal/system/doctor.go`):**
  - Comprobaciones automáticas:
    - Node.js >= 22 instalado.
    - Git disponible y repositorio limpio.
    - Go >= 1.23 disponible.
    - Archivos clave presentes (`models.yaml`, `openspec/config.yaml`, `hooks/hooks.json`).
    - Detección de variables de entorno de API keys comunes (advisory).
- [x] **6.2. Interfaz del Doctor (`internal/tui/views/doctor/`):**
  - Vista interactiva con checklist coloreado (`✓ OK`, `⚠ Aviso`, `✗ Error`).
  - Consejos y sugerencias de remediación rápida en caso de problemas.

---

### ✨ Hito 7: Footer, UX Polish, Build del Binario y Verificación
> **Objetivo:** Cerrar el ciclo con navegación pulida, ayuda integrada, compilación del binario `ospec` y verificación de no-regresión.

- [x] **7.1. Footer y Modal de Ayuda (`internal/tui/footer/`):**
  - Barra inferior con atajos contextuales adaptados a la vista actual.
  - Modal emergente de ayuda accesible con `?`.
- [x] **7.2. Pipeline de Build del Binario:**
  - Configurar build para generar el binario standalone `ospec`:
    ```bash
    go build -o ospec ./cmd/ospec
    ```
  - Verificar que el binario es ligero, arranca en <50ms y funciona sin dependencias externas.
- [x] **7.3. Verificación de No-Regresión del Arnés:**
  - Ejecutar `npm test` del arnés para certificar que el 100% de las pruebas existentes de Node.js continúan en verde.

---

## 🚀 Criterios de Aceptación Globales

1. El comando `ospec` o `./ospec` abre la TUI interactiva instantáneamente.
2. La cabecera muestra el logo en ASCII art con badges dinámicos de versión y perfil.
3. Permite alternar perfiles de modelos (`Cheap`, `Default`, `Premium`) y modificar asignaciones de agentes en `models.yaml` de forma declarativa y segura.
4. El arnés Node.js existente y sus comandos `npm test` permanecen completamente desacoplados e intactos.
