# Instalación de Objetivos

La instalación de plataformas objetivo se encarga de la distribución del plugin `ospec-workflow` a cada herramienta soportada (Claude Code, GitHub Copilot, OpenCode y Codex). Gestiona cómo cada plataforma recibe su árbol de archivos generado, los comandos npm utilizados, y las validaciones de seguridad e idempotencia que previenen escrituras destructivas o corrupción de repositorios.

## Flujo principal

1. **Claude Code**: Se instala a través de un registro de marketplace local. `npm run setup:claude` construye el árbol en `dist/claude-marketplace/`, registra el marketplace e instala el plugin usando el CLI de `claude`. Para iteración rápida, `npm run reload:claude` solo reconstruye el artefacto para aplicarlo con `/reload-plugins` en una sesión activa.
2. **GitHub Copilot y OpenCode**: Operan mediante sincronización en el sistema de archivos hacia el repositorio destino. `npm run install:copilot -- <destRepo>` y `npm run install:opencode -- <destRepo>` generan el árbol y lo copian recursivamente en la raíz del proyecto para su auto-descubrimiento.
3. **Codex**: Utiliza instalación global nativa. `npm run setup:codex` instala agentes TOML, el runtime nativo y registra servidores MCP a nivel global en `~/.codex/`. Alternativamente, su versión local copia la configuración al repositorio destino sin sobrescribir el archivo `config.toml`.
4. **VSCode**: No dispone de un comando público de instalación. El árbol se genera exclusivamente para pruebas de regresión en tiempo de ejecución.

## Detalles técnicos

- **Validación de destino seguro**: Las funciones de seguridad como `assertSafeOutDir` y `assertSafeDest` impiden instalaciones destructivas en la raíz del sistema de archivos, el directorio home o el propio repositorio del harness.
- **Integración de binarios**: Los scripts de instalación integran el binario precompilado de Go (`ospec-hooks`) en la estructura correspondiente de cada plataforma destino, otorgando los permisos ejecutables requeridos.
- **Detección de CLI**: La resolución del binario CLI se realiza buscando en el PATH y localizaciones adicionales, intentando múltiples extensiones (como `.cmd` y `.exe`) para esquivar problemas de resolución de PowerShell en Windows.
- **Idempotencia**: Todos los comandos de instalación garantizan que las ejecuciones sucesivas alcancen el mismo estado seguro sin duplicar recursos ni dejar restos del estado anterior.

## Decisiones de diseño

- **División de mecanismos**: Claude Code demanda un registro en el marketplace porque usa un modelo centralizado de plugins. Copilot y OpenCode esperan configuraciones directamente dentro del proyecto local. Codex exige un formato descentralizado y herramientas CLI globales para registrar su servidor MCP.
- **Validadores Node puros**: GitHub Copilot y OpenCode incluyen validadores internos que no dependen de comandos externos, permitiendo verificar los artefactos construidos incluso cuando la herramienta final no está instalada localmente.
- **Módulos desacoplados**: Los instaladores separan la generación de código (en `dist/`) de la instalación final (escritura final o registro). Esto facilita pruebas de regresión limpias y seguras sin efectos secundarios destructivos.

## Puntos de extensión

- **Añadir nuevos targets de sincronización**: Modificando el script unificado `install-target.js` se puede dar soporte a nuevas plataformas basadas en archivos.
- **Soporte de binarios externos**: Las rutinas de búsqueda como `resolveClaudeBin` y `findCodexBin` ofrecen patrones probados para buscar nuevas rutas y manejadores empaquetados en múltiples sistemas operativos.
- **Hooks personalizados para Codex**: La lógica de agregación en Codex facilita extender o añadir nuevos grupos de hooks conservando intacta cualquier configuración local del usuario.

## Consideraciones importantes

- **Fallos silenciosos en CLI**: La ausencia del binario externo (`claude`, `codex`) no bloquea ni falla la compilación; los scripts simplemente dejan los artefactos listos en `dist/` e informan de la ausencia de la herramienta.
- **No sobrescribir config en Codex**: La instalación a nivel de repositorio local de Codex NUNCA debe modificar el archivo de configuración `.codex/config.toml` pre-existente del usuario.
- **Evasión de seguridad mediante symlinks**: Las validaciones de destino usan siempre rutas canónicas reales (`fs.realpathSync`) para evitar engaños de anidamiento a través de enlaces simbólicos.

## Mapa de fuentes

- `/openspec/specs/install/spec.md` - Especificación de los modelos de instalación, contratos de seguridad, y pruebas requeridas.
- `/scripts/configure/claude-marketplace.js` - Lógica de compilación para la estructura de plugin de Claude Code.
- `/scripts/configure/install-claude.js` - Script que orquesta la compilación y ejecución de comandos en el CLI de `claude`.
- `/scripts/configure/install-target.js` - Lógica de sincronización en sistema de ficheros para GitHub Copilot y OpenCode.
- `/scripts/configure/install-codex.js` - Instalador global y local estructurado para el ecosistema descentralizado de Codex.
