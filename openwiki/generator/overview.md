# Generador Multi-Target

El dominio del Generador Multi-Target comprende el compilador e instalador automatizado que traduce la definición canónica del plugin `ospec-workflow` a formatos de distribución específicos para cada una de las herramientas de asistencia de IA soportadas. Esto permite mantener una única definición de agentes, comandos y reglas en el repositorio, mientras se exportan artefactos validados y autocontenidos para cada plataforma.

## Cómo funciona

La compilación se realiza de forma pura mediante scripts Node.js sin frameworks externos. El proceso sigue la siguiente secuencia:

1. **Lectura canónica**: Carga el archivo de manifiesto principal `.plugin.json` y la configuración de modelos `models.yaml`.
2. **Validación inicial**: Ejecuta comprobaciones sobre la estructura de archivos y consistencia de nombres.
3. **Transformación de perfiles**: El motor de transformación (`target-transform.js`) toma la definición original y aplica filtros específicos según el destino (`vscode`, `claude`, `github-copilot`, `opencode`).
4. **Generación de artefactos**: Escribe los archivos modificados bajo el directorio temporal `dist/{target}/`.
5. **Validación estricta de salida**: Cada target ejecuta un suite de aserciones específico (por ejemplo, `claude plugin validate --strict` para Claude) para certificar que el archivo empaquetado cumple al 100% con los estándares de la plataforma.

## Detalles técnicos

### Transformaciones específicas por Target

- **VS Code**: Carga directa del código fuente sin compilación adicional.
- **Claude Code**: Reestructura el manifiesto a `.claude-plugin/plugin.json`, expone comandos en formato Claude, y empaqueta el agente orquestador principal como una *skill* reutilizable dentro de los prompts de fase.
- **GitHub Copilot**: Mapea los agentes individuales a archivos Markdown en `.github/agents/` y los comandos a `.github/prompts/`, asegurando que las reglas globales apliquen con la expresión glob `**`.
- **opencode**: Genera el manifiesto consolidado `opencode.json`, traduce los comandos para que admitan argumentos posicionales, y empaqueta la configuración MCP local directamente dentro del objeto de configuración.

### Modelos y Tiers

El archivo `/models.yaml` centraliza la resolución de modelos de LLM. Asocia tiers lógicos (`default`, `cheap`, `premium`) a modelos concretos por target, lo que permite a los agentes ejecutar tareas costosas (diseño, verificación) en modelos premium, y tareas mecánicas (búsqueda, propuesta) en modelos económicos.

## Por qué la arquitectura tiene esta forma

Se optó por un generador de transformaciones puras en lugar de múltiples archivos de configuración distribuidos por el repositorio para evitar el desfase de características (feature drift). Toda nueva característica añadida a la definición principal se propaga inmediatamente a todos los targets al ejecutar la compilación.

## Puntos de extensión principales

- **Agregar un nuevo target**: Se debe implementar un perfil de transformación adicional en `/scripts/lib/target-transform.js` y agregar el validador en `/scripts/configure/` con su respectiva aserción.
- **Modificar asignación de modelos**: Modificar `/models.yaml` para actualizar las prioridades o modelos recomendados para un target determinado.

## Aspectos a tener en cuenta al editar

- **Sincronización del Manifiesto**: El validador en CI (`/scripts/manifest-sync.test.js`) fallará inmediatamente si se edita el manifiesto canónico y no se actualiza su contraparte en `.claude-plugin/plugin.json` o si la transformación no es determinista.
- **Strict TDD en transformaciones**: Modificaciones en el motor de transformación deben tener su correspondiente test en `/scripts/lib/target-transform.test.js` antes de implementarse.

## Mapa de fuentes

| Archivo / Directorio | Rol | Evidencia de Git |
| :--- | :--- | :--- |
| [/scripts/configure/cli.js](/scripts/configure/cli.js) | CLI de compilación y punto de entrada para los instaladores. | `2d703d6` |
| [/scripts/lib/target-transform.js](/scripts/lib/target-transform.js) | Motor de transformación de manifiestos y agentes. | `457f385` |
| [/models.yaml](/models.yaml) | Tabla de mapping de modelos por tier y target. | `457f385` |
| [/scripts/configure.test.js](/scripts/configure.test.js) | Suite de tests para el generador. | `2d703d6` |
