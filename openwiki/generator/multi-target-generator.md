# Generador Multi-Target

El generador multi-target es el núcleo responsable de compilar el árbol fuente canónico de OSpec (agentes, comandos, reglas, skills) hacia múltiples plataformas de asistentes de IA (VS Code, Claude Code, GitHub Copilot, OpenCode, Codex). Su rol es garantizar que una única base de código genere artefactos nativos para cada asistente, aplicando las adaptaciones estructurales necesarias.

## Flujo principal

El proceso inicia mediante los scripts definidos en `package.json` (ej. `npm run build:claude`, `build:codex`).
El orquestador (`cli.js`) lee el código fuente canónico y lo envía al motor de transformación pura (`target-transform.js`).
La transformación remodela manifiestos, hooks, y reasigna agentes/comandos basándose en perfiles declarativos (`target-profiles/*.js`).
El resultado en memoria se escribe de forma determinista y segura en `dist/<target>/`. Finalmente, se ejecuta una compuerta de calidad (validador) específica del target.

## Detalles técnicos

- **Perfiles (Capability Matrix):**
  - **vscode:** Formato base nativo sin reescrituras agresivas.
  - **claude:** Genera un `marketplace.json` local. El agente orquestador se emite como un *skill* para invocar dinámicamente el workflow.
  - **copilot:** Reestructura los hooks al formato de proyecto de Copilot (`.github/hooks/hooks.json`).
  - **opencode:** Sintetiza la configuración en `opencode.json` (instrucciones, mcp, schema). Variables de comandos pasan a ser posicionales.
  - **codex:** Convierte agentes a formato `.toml`, consolida reglas en un `AGENTS.md` sintetizado, y transforma comandos en skills invocables (`skills/commands/`).
- **Validación:** Se ejecuta tras la compilación mediante comandos CLI nativos o scripts (ej. `validate-codex.js`). Cualquier error o advertencia en la salida falla la compilación de forma estricta (a menos que se omita con `--no-validate`).

## Decisiones de diseño (Por qué es así)

- **Transformación pura:** El archivo `target-transform.js` no tiene dependencias de red o sistema de archivos. Esto facilita realizar pruebas deterministas y hace el código seguro.
- **Parsers sin dependencias:** Se implementan parsers ligeros (`parseModels`, serialización TOML manual) para mantener el sistema libre de dependencias pesadas, encajando en scripts puros de Node (CommonJS).
- **Escritura segura (Safe IO):** El proceso de escritura solo elimina artefactos obsoletos que están dentro de las raíces administradas, evitando destruir directorios ajenos.

## Puntos de extensión mayores

- **Nuevos Targets:** Para soportar un nuevo asistente, simplemente crea un nuevo perfil en `/scripts/lib/target-profiles/` y regístralo en el diccionario `PROFILES` de `/scripts/configure/cli.js`.
- **Estrategias de inyección de Reglas:** Puedes añadir nuevas estrategias a `isAccumulateStrategy` o funciones dedicadas en el transformador para acomodar asistentes con manejos únicos de contexto.

## Aspectos a tener en cuenta al editar (Gotchas)

- **Invariante Pura:** Nunca introduzcas operaciones de sistema de archivos (`fs`, `path`) dentro de `target-transform.js`. Toda la entrada/salida debe ocurrir en `cli.js`.
- **Exclusión de código:** Los scripts de prueba (`*.test.js`) y generadores están excluidos de las ramas de ejecución en producción de forma incondicional.
- **Advertencias como errores:** La función `validatorFailed` considera advertencias (warnings) como fallos. Asegúrate de que los validadores propios no emitan logs ruidosos en ejecuciones exitosas.

## Source Map

- `/package.json` - Define los targets de compilación y comandos de configuración (`build:*`, `setup:*`, `validate:*`).
- `/scripts/configure/cli.js` - Orquestador IO: lee archivos, despacha el transformador, escribe resultados en disco y lanza la validación.
- `/scripts/configure/claude-marketplace.js` - Envoltura especializada de compilación que genera metadatos de marketplace locales para Claude Code.
- `/scripts/lib/target-transform.js` - Motor de transformación in-memory puro.
- `/scripts/lib/target-profiles/` - Carpeta de perfiles declarativos que especifican el mapeo de capacidades y reglas de transformación para cada target.
