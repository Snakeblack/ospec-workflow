# Inicio rápido de ospec-workflow

`ospec-workflow` es un arnés de desarrollo Spec-Driven Development (SDD) llave en mano diseñado para imponer rigor técnico y calidad en flujos de trabajo asistidos por IA. Utiliza OpenSpec como única fuente de verdad y proporciona un orquestador inteligente que coordina agentes de fase, garantizando Strict TDD, control de tamaño de revisiones y gates de seguridad activos en cada commit.

## Qué hace este repositorio

- **Orquestación de fases SDD**: Guía y ejecuta de forma secuencial las fases de propuesta, especificación, diseño, tareas, implementación, verificación y archivado.
- **Strict TDD**: Fuerza la ejecución de pruebas antes de cualquier cambio de código y requiere evidencias válidas.
- **Límites de revisión (400 líneas)**: Protege a los revisores humanos proponiendo estrategias de PRs encadenadas ante cambios extensos.
- **Runtime de hooks de ciclo de vida**: Automatiza validaciones críticas en `SessionStart`, `PreToolUse`, `PreCompact`, y `Stop`.
- **Compilación Multi-Target**: Compila de forma pura y aislada agentes y comandos para múltiples entornos como Claude Code, VS Code, GitHub Copilot y opencode.
- **Federación de espacios de trabajo**: Gestiona el impacto de contratos y cambios coordinados en arquitecturas multi-repositorio.

## Empieza aquí

- [Generador Multi-Target](generator/overview.md) — Detalles del compilador puro que transforma manifiestos y herramientas a perfiles nativos (`vscode`, `claude`, `github-copilot`, `opencode`).
- [Orquestación y Ruteo](orchestration/routing.md) — Explicación de cómo el orquestador inteligente selecciona rutas (`standard`, `lite`, `bugfix`, etc.) y evalúa gates de decisión.
- [Runtime de Hooks de Ciclo de Vida](hooks-runtime/lifecycle.md) — Funcionamiento del sistema de hooks local y los disparadores de eventos del ciclo de vida del agente.
- [Seguridad y Límites](security/guardrails.md) — Reglas y comportamientos de AgentShield y Token Budget Advisor para proteger secretos y controlar el consumo de tokens.
- [Estado OpenSpec y Persistencia](state-management/persistence.md) — El almacenamiento persistente de estados, tareas y progreso de implementación.
- [Verificación y Puertas de Calidad](testing-quality/verification.md) — Reglas de ejecución de pruebas, TDD estricto y aserciones de calidad en la fase `/sdd-verify`.
- [Federación de Workspace](workspace-federation/multi-repo.md) — Coordinación y análisis de impacto cruzado en espacios de trabajo multi-repositorio federados.

## Archivos fuente clave

- [/package.json](/package.json) — Metadatos del proyecto, dependencias y comandos de configuración y compilación.
- [/models.yaml](/models.yaml) — Tabla canónica de resolución de modelos por tier (default, cheap, premium) y target.
- [/openspec/config.yaml](/openspec/config.yaml) — Configuración principal de las rutas de orquestación, gates activos, límites y políticas del proyecto.
- [/agents/sdd-orchestrator.agent.md](/agents/sdd-orchestrator.agent.md) — El prompt y comportamiento del agente orquestador principal.
- [/scripts/check.js](/scripts/check.js) — Validador y suite principal de tests del arnés.
- [/scripts/configure/cli.js](/scripts/configure/cli.js) — Punto de entrada del compilador de targets del plugin.
- [/scripts/hooks/pre-tool-use.js](/scripts/hooks/pre-tool-use.js) — Lógica de intercepción de comandos de shell para control de token y seguridad de secretos.

## Mapa de documentación

A continuación se muestra el mapa simplificado de las secciones de la wiki técnica:

- **Configuración y Core**
  - [Generador Multi-Target](generator/overview.md)
  - [Orquestación y Ruteo](orchestration/routing.md)
- **Ciclo de vida y Seguridad**
  - [Runtime de Hooks](hooks-runtime/lifecycle.md)
  - [Seguridad y Límites](security/guardrails.md)
- **Datos y Calidad**
  - [Persistencia y OpenSpec](state-management/persistence.md)
  - [Verificación y Calidad](testing-quality/verification.md)
  - [Federación Multi-Repo](workspace-federation/multi-repo.md)

## Notas para futuros agentes

- **Contrato Coordinador-No-Ejecutor**: El agente principal siempre debe actuar como coordinador de fases, delegando tareas de exploración, escritura o testing a subagentes dedicados para evitar la inflación innecesaria del contexto.
- **Strict TDD Obligatorio**: Si existe un suite de pruebas, antes de modificar código en `/sdd-apply`, primero debes escribir o adaptar las pruebas unitarias y asegurar que fallen antes de proceder con el código de producción.
- **Validación de targets**: Cualquier cambio en manifiestos (`.plugin.json`) o comandos de agentes requiere ejecutar `npm test` para asegurar que el generador multi-target produce los artefactos `dist/` idénticos y sin errores de validación.

## Mapa de fuentes

Lista plana de los archivos principales del repositorio con evidencia de Git:

| Archivo | Rol en el Repositorio | Evidencia de Git (Último Commit) |
| :--- | :--- | :--- |
| [/package.json](/package.json) | Configuración de scripts y dependencias. | `457f385` |
| [/openspec/config.yaml](/openspec/config.yaml) | Definición de rutas, gates y reglas SDD. | `ba82de1` |
| [/models.yaml](/models.yaml) | Tabla de mapping de modelos por tier. | `457f385` |
| [/agents/sdd-orchestrator.agent.md](/agents/sdd-orchestrator.agent.md) | Agente orquestador principal del flujo. | `4a12d4b` |
| [/scripts/configure/cli.js](/scripts/configure/cli.js) | Compilador multi-target de plugins. | `2d703d6` |
| [/scripts/hooks/pre-tool-use.js](/scripts/hooks/pre-tool-use.js) | Interceptor de comandos y Token Advisor. | `422928f` |
| [/scripts/lib/ospec-state.js](/scripts/lib/ospec-state.js) | Lógica de persistencia de estado de cambios. | `457f385` |
