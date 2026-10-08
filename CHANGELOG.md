# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.117.9] - 2026-10-08

### Security
- **Lecturas sensibles desde shell (E1.17, REQ-hooks-024)**: los hooks JS/Go reutilizan AgentShield para operandos literales de lectores comunes y redirecciones de entrada. Las denegaciones de comandos y archivos tienen prioridad frente a los avisos por secretos. Se conserva la política aprobada: ASK en modo normal y aviso sin bloqueo en bypass o hosts sin ASK. Las 18 reglas JS/JSON tienen una prueba de paridad completa.

### Fixed
- **Deadline y errores del launcher (REQ-hooks-025)**: `scripts/hooks/ospec-hooks-launch.js` limita el hijo directo a 4000 ms con SIGKILL y descarta stdout parcial ante fallos de arranque, señal, salida no cero o respuesta inválida. Los adaptadores conservan el aviso compatible con cada target. La prueba real de un hijo que maneja SIGTERM termina alrededor de 4,1 s en Windows; no se garantiza la contención de descendientes.

### Changed
- **Contrato, roadmap e inspección de seguridad**: REQ-hooks-024/025 y pruebas de lectores, bypass, adaptadores y fallos actualizados. E1.17 cerrado con IDD (`idd/archive/2026-10-08-hook-boundary-reliability/`), revisión de seguridad y validación dirigida aprobadas; E1.21 queda como siguiente trabajo. El informe `docs/analysis/2026-10-08-hook-security-hardening.md` documenta reproducciones y mejoras pendientes, sin afirmar una auditoría completa ni cambiar la política vigente.

**Verificación directa**: `node scripts/check.js` (3388 tests pasando, 0 fallos y 0 omitidos), incluida la generación de los siete targets. `go test ./...` pasando; reproducciones rojo→verde JS/Go y revisión acotada registradas en IDD.

## [2.117.8] - 2026-10-08

### Fixed
- **Los instaladores recorrían el almacén de Engram sin necesitarlo (E1.23)**: los siete `setup:*` dejan de ejecutar `engram doctor` antes y después del setup, evitando dos sondas que podían agotar 60 s cada una y cuyo resultado solo generaba un aviso. Se conservan la detección del binario, MCP y protocolo, la compatibilidad del ciclo de vida, el registro idempotente y el comportamiento fail-open. El diagnóstico global sigue disponible con `ospec doctor`.

### Changed
- **Contrato y documentación**: REQ-install-028 y guías de instalación EN/ES describen las comprobaciones por target y el diagnóstico explícito. Roadmap E1.23 hecho con IDD (`idd/archive/2026-10-08-install-engram-no-doctor/`).

**Verificación directa**: `node scripts/check.js` (3382 tests pasando, 0 fallos y 0 omitidos), incluida la generación de los siete targets. Reproducción rojo→verde en los siete targets y 71 pruebas enfocadas pasando.

## [2.117.7] - 2026-10-08

### Fixed
- **Los `setup:*` locales instalaban un hook Go desfasado (E1.22)**: `ensureRuntimeBinary` reutilizaba cualquier `release/dist/ospec-hooks-<os>-<arch>` existente, que está fuera de git, y nunca recompilaba; en el checkout había uno de junio, así que VS Code, Cursor, Copilot, Antigravity y Claude instalados desde el checkout llevaban un hook sin E1.16 ni cambios Go posteriores. Ahora, con Go disponible, el binario se recompila si es más antiguo que `cmd/`, `internal/`, `go.mod` o `go.sum`, y se reutiliza si está al día; sin Go se usa el existente con un aviso de posible desfase. Las instalaciones del Marketplace no se veían afectadas. Spec `install` §4.5.

### Changed
- **Roadmap**: E1.22 `stale-hooks-binary` hecho. Hecho con IDD (`idd/archive/2026-10-08-stale-hooks-binary/`).

**Verificación directa**: `node scripts/check.js` (3374 tests pasando, 0 fallos y 0 omitidos).

## [2.117.6] - 2026-10-08

### Changed
- **Roadmap: E1.21 `idd-checks-config-guidance`**: sin `checks:` en `idd/config.yaml` (nada crea el fichero), `checks-pass` no se puede satisfacer, `ospec next` repite `ospec check`, `close` se rechaza y `ospec doctor` lo da por bueno; la skill `idd` no lo menciona. Reproducido en un consumidor temporal. Corrección mínima aceptada por el usuario: `next`/`check` nombran lo que falta, la skill propone el comando de test y lo escribe solo con aprobación, y doctor avisa con un cambio abierto sin checks. Se ejecuta después de E1.17; la corrección sigue sin implementar. Hecho con IDD (`idd/archive/2026-10-08-roadmap-idd-config-checks/`).

**Verificación directa**: `node scripts/check.js` (3371 tests pasando, 0 fallos y 0 omitidos). Comprobación documental: `git diff --check`.

## [2.117.5] - 2026-10-08

### Fixed
- **El hook PreToolUse concedía permisos que el host habría pedido (E1.16, OSP-017)**: sin ninguna objeción, los hooks JS y Go devolvían `permissionDecision: "allow"`, y Claude Code y VS Code lo tratan como aprobación que se salta su propio aviso de permisos. Con el plugin instalado, un Write que el host deniega sin plugin se ejecutaba. Ahora, sin objeción, el hook no escribe nada y sale con 0, así que el host aplica su modo, avisos y reglas. Las decisiones explícitas no cambian: `deny`, `ask`, el `ask` del error de parseo y la degradación de `ask` a `allow` en `bypassPermissions`. Codex sigue recibiendo `{}` y Cursor `permission: "allow"`. Verificado en real con Claude Code: el mismo Write se deniega ahora con y sin plugin. Spec de hooks (§3.1 y Step 7), hooks-runtime y git-collaboration-guard alineadas; el fixture de paridad pasa a `pre-tool-use-neutral.json` con salida vacía.

### Changed
- **Roadmap**: E1.16 hecho; E1.17 `hook-boundary-reliability` (OSP-001/002/003) pasa a `next-eligible`. Hecho con IDD (`idd/archive/2026-10-08-hook-neutral-permissions/`).

**Verificación directa**: `node scripts/check.js` (3371 tests pasando, 0 fallos y 0 omitidos).

## [2.117.4] - 2026-10-08

### Changed
- **Prioridades OSP para la siguiente sesión**: el roadmap antepone E1.16 (OSP-017, permisos neutrales), E1.17 (OSP-001/002/003, secretos y launcher), E1.18 (OSP-018, frescura de evidencia y estado), E1.19 (OSP-019, contexto del revisor IDD) y E1.20 (OSP-020, documentación de instalación). E1.16 pasa a `next-eligible`; E2.1 queda pendiente para retomarse después. Cada ítem conserva su evidencia, alcance mínimo y criterios de cierre. Las correcciones siguen sin implementar. Hecho con IDD (`idd/archive/2026-10-08-prioridades-osp-siguiente-sesion/`).
- **Evidencia para retomar el trabajo**: [análisis fechado](docs/analysis/2026-10-08-osp-permisos-y-evidencia.md) con reproducción real del permiso, probes del launcher y secretos, contraejemplo de configuración verificadora excluida de la huella y revisión IDD en un consumidor aislado. Distingue defectos confirmados, sobrecarga de contexto, bloqueo de formato no demostrado y verificaciones todavía pendientes; priorizar no aprueba una política nueva de bypass.

**Verificación directa**: `node scripts/check.js` (3368 tests pasando, 0 fallos y 0 omitidos). Comprobación documental: `git diff --check`.

## [2.117.3] - 2026-10-08

### Changed
- **Cinco oportunidades de mejora continua aceptadas en el roadmap**: se concretan E1.12 (continuidad y reanudación de IDD), E1.13 (Strict TDD según el modo activo) y E2.1 (contrato de conocimiento arquitectónico); se añaden E1.15 (coherencia de la política de revisiones sucesoras, pendiente de decisión humana) y E4.4 (experimento de recursos, empezando por cuatro ejecuciones A/B de effort). Cada oportunidad incluye evidencia, alcance, alternativas y criterios de aceptación. E2.1 conserva `next-eligible` y E1.12 destaca por su retorno inmediato en paralelo. La entrega actualiza la planificación; las capacidades siguen pendientes. Hecho con IDD (`idd/archive/2026-10-08-oportunidades-mejora-continua/`).

**Verificación directa**: `node scripts/check.js` (3368 tests pasando, 0 fallos y 0 omitidos). Comprobación documental: `git diff --check`.

## [2.117.2] - 2026-10-08

### Changed
- **Checkpoint de cierre de la Etapa 1: `continue`** ([informe](docs/analysis/2026-10-08-checkpoint-etapa-1.md)): medido en v2.117.1, todas las filas de objetivos de la etapa se cumplen. Router más protocolo IDD: 8,6–9,0 KB (objetivo ≤ 16 KB). Las 7 obligaciones activas solo se cierran con evidencia que registra el CLI. Un cambio trivial crea 0 documentos. Las preguntas llegan en un solo lote por cambio. Hay 31 skills por defecto. La tabla «Objetivos medibles» del roadmap gana la columna «Cierre E1 (v2.117.1)», y el objetivo de preguntas pasa a ser «un solo lote, solo en los cuatro gates». Salvedad registrada: el criterio de E1.6 se probó en real solo en Claude Code.
- **Roadmap**: los follow-ups de la etapa pasan a ser ítems `pending` en paralelo con la Etapa 2: E1.11 `idd-protocol-hygiene` (codificación al editar, `ospec next` pide declarar el plan y corrección de un plan sobredeclarado), E1.12 `session-hook-idd` (`Stop` y `PreCompact` no ven los cambios IDD), E1.13 `idd-openspec-asymmetries` (Strict TDD del pre-commit y `.ospec/`) y E1.14 `codex-repo-runtime`. Lo siguiente es E2.1 `knowledge-map-contract`. Hecho con IDD (`idd/archive/2026-10-08-checkpoint-etapa-1/`).

**Verificación directa**: `node scripts/check.js` (3368 tests pasando, 0 fallos y 0 omitidos).

## [2.117.1] - 2026-10-08

### Fixed
- **`setup:vscode --dry-run` rompía el plugin instalado (E1.10, REQ-install-039)**: la simulación construía en `dist/vscode`, el árbol que VS Code carga en vivo, y salía antes de sustituir `__OSPEC_SHARED_DIR__` y `__OSPEC_RUNTIME_DIR__`, así que VS Code cargaba una versión rota. Ahora el dry-run construye, valida y sustituye los marcadores en un directorio temporal que borra después; `dist/vscode` queda igual byte a byte (o ausente si no existía). Verificado en real comparando el hash de `dist/vscode` antes y después.
- **Instalación de VS Code fallida a medias**: si la copia del binario de hooks o la sustitución de marcadores fallaba después de la build, `dist/vscode` quedaba publicado con marcadores sin sustituir. `runConfigure` acepta un paso `prepareTree(dir)` que corre sobre el staging ya validado antes de publicarlo (y sobre el destino tras una publicación en sitio); `setup:vscode` prepara ahí el árbol, de modo que un fallo deja la instalación anterior intacta y sin staging, copia de seguridad ni cerrojo. La fase «Preparar el plugin» pasa a formar parte de «Generar y validar».

### Changed
- **Roadmap**: E1.10 `vscode-dry-run` hecho; lo siguiente sigue siendo el checkpoint de cierre de la Etapa 1, en una sesión aparte. Hecho con IDD (`idd/archive/2026-10-08-vscode-dry-run/`).

**Verificación directa**: `node scripts/check.js` (3368 tests pasando, 0 fallos y 0 omitidos).

## [2.117.0] - 2026-10-08

### Added
- **Salida común de los instaladores (E1.9, REQ-install-038)**: los 7 `setup:*` y el paso Engram escriben por `scripts/configure/install-output.js`, en español: cabecera con el host, una línea por fase `✓ [n/N] fase (s)` (en terminal interactiva la fase en curso se ve como `… [n/N] fase` y se reescribe en su sitio al terminar) y un resumen final con destino, ficheros, paquetes, siguiente paso y tiempo total, o `✗ Instalación fallida · <host> (código N)`. Nuevo `--verbose`: muestra la salida de los validadores, la copia del binario de hooks y la salida de la CLI `claude`, que por defecto se ocultan. Los avisos y errores salen siempre, y una build fallida muestra siempre la salida del validador.

### Fixed
- **`setup:vscode` con VS Code abierto**: en Windows, renombrar `dist/vscode` mientras VS Code (o una terminal dentro) lo tiene abierto fallaba con `filesystem mutation failed for unknown path after 4 attempts (EPERM)`. La publicación sigue siendo un renombrado atómico, pero para `dist/vscode`, si choca con `EPERM`, `EACCES` o `EBUSY`, escribe en su sitio el árbol ya validado (sobrescribe y poda dentro de las raíces gestionadas) y lo vuelve a validar; el resumen lo indica. Verificado con un proceso real bloqueando el directorio.
- **Errores accionables del sistema de ficheros**: un bloqueo que persiste tras los reintentos nombra la operación, la ruta y el host que hay que cerrar («Cierra VS Code (o el proceso que use esa ruta) y reintenta la instalación.»); antes la publicación no pasaba operación ni ruta. Si la publicación en sitio también falla, el error dice que el destino ha quedado a medio actualizar.
- **Excepciones de un instalador**: el envoltorio común las convierte en `error: …` con código 1 y resumen de fallo, en lugar de terminar con `fatal:` y la pila (que sigue saliendo con `--verbose`).

### Changed
- **Roadmap**: E1.9 `install-cli-ux` pasa a hecho; lo siguiente es el checkpoint de cierre de la Etapa 1, en una sesión aparte. Hecho con IDD (`idd/archive/2026-10-08-install-cli-ux/`).

**Verificación directa**: `node scripts/check.js` (3364 tests pasando, 0 fallos y 0 omitidos).

## [2.116.0] - 2026-10-08

### Added
- **`ospec doctor` cubre los 7 targets (E1.7 (b), REQ-idd-019)**: además de Claude Code, diagnostica Codex, Cursor, Antigravity, OpenCode y GitHub Copilot CLI (por el `.ospec-workflow-install.json` de su instalador global; Codex respeta `CODEX_HOME`) y VS Code (por las entradas `ospec-workflow` de `chat.pluginLocations` en VS Code y VS Code Insiders, como lista o como mapa). Por host: instalación (`error` con manifiesto ilegible, sin versión o `0.0.0`), runtime `scripts/ospec.js` ausente (`error`), marcadores sin sustituir en skills o agentes (`error`), router ausente, copia del orquestador anterior a E0.4 en el `AGENTS.md` de Codex u `opencode.json` sin `instructions/*.md` (`warn`), presupuesto de 4 KB, hooks ausentes (`error`) y Engram. En VS Code avisa de varias builds registradas (`warn`), de entradas que cargan el checkout fuente o rutas inexistentes (`error`) y de `chat.agentFilesLocations` que cargan dos veces los agentes del plugin. `install-drift` compara cada host con el checkout, `sdd-package` nombra todos los hosts sin SDD y `codex-repo` avisa de una instalación de Codex en el repositorio sin protocolo IDD. Engram se sondea en cada host con una sola ejecución de `engram version` y `engram doctor`. `--target <host>` acepta los 7 hosts y comprueba solo ese.

### Changed
- **Documentación de VS Code**: el README (en/es) y `docs/plugin-installation(.es).md` retiran la «Opción A» (raíz del repositorio en `chat.pluginLocations`) y la instalación desde una URL Git, rotas desde E0.4 y E1.6 porque el source lleva marcadores sin sustituir y todo el paquete SDD; la vía es `npm run setup:vscode`, que registra `dist/vscode`. La resolución de problemas describe el doctor de los 7 hosts.
- **Roadmap**: E1.7 `ospec-doctor` pasa a hecho. Nuevo ítem E1.9 `install-cli-ux`, elegible por decisión del usuario: arreglar el `EPERM` de `setup:vscode` con VS Code abierto y dar a los 7 instaladores progreso, errores accionables y un resumen común. Hecho con IDD (`idd/archive/2026-10-08-ospec-doctor-targets/`).

### Fixed
- **Aislamiento del test del CLI `doctor`**: `scripts/ospec.test.js` ya no hereda `APPDATA`, `CODEX_HOME` ni `XDG_CONFIG_HOME` reales. La instalación `0.0.0` de `~/.copilot` que detecta el doctor en la máquina del autor la dejó, el 2026-08-14, una versión en desarrollo de `tests/integration/installation-convergence.test.js`; la versión commiteada ya usa `--dest` y la suite completa no modifica ningún manifiesto real.

**Verificación directa**: `node scripts/check.js` (3349 tests pasando, 0 fallos y 0 omitidos).

## [2.115.0] - 2026-10-08

### Added
- **`ospec doctor` (E1.7 (a), REQ-idd-019)**: diagnóstico de solo lectura de la instalación y del proyecto. Cada comprobación da `ok`, `info`, `warn` o `error`; los avisos y errores llevan causa y acción, y el comando sale con 1 solo si hay un error. `--json` imprime el resultado y `--target claude` limita los hosts. Comprueba el runtime; desde el checkout, `dist/` y la instalación desfasados respecto al checkout y los git hooks; en el proyecto, `idd/config.yaml`, el modo, el paquete SDD, los cambios IDD y SDD interrumpidos con el comando que los reanuda, las asimetrías IDD/openspec y las guardas `DISABLE_*`; y en Claude Code, el plugin, los hooks, el bloque del router (ausente, desfasado o duplicado), el presupuesto *always-on* de 4 KB y Engram. Los otros seis targets llegan en E1.7 (b).

### Changed
- **Detección de Engram en el runtime**: pasa de `scripts/configure/engram-setup.js` a `scripts/lib/engram-detect.js`, que siguen usando los instaladores. Enmienda acotada de `adr-20261002-003` y de REQ-session-memory-002: el doctor puede detectar si Engram está instalado, nunca lee memorias ni llama a `mem_*`, y ningún resultado de Engram es un error.
- **Documentación**: las guías de instalación empiezan la resolución de problemas por `ospec doctor`.
- **Roadmap**: E1.7 (a) entregado; queda (b), que cierra la Etapa 1. Hecho con IDD (`idd/archive/2026-10-08-ospec-doctor/`).

**Verificación directa**: `node scripts/check.js` (3332 tests pasando, 0 fallos y 0 omitidos).

## [2.114.2] - 2026-10-08

### Fixed
- **`/sdd-new` y `/sdd-lite` reciben la petición completa (E1.8, REQ-generator-026)**: piden una sola entrada, `${input:request}`, en vez de un nombre y una intención por separado. En Claude, `/sdd-new Quiero poder …` ya no llega con `Quiero` como nombre y `poder` como intención. El primer token es el nombre del cambio solo si es kebab-case con guion (`add-login`); si no, el orquestador deriva el nombre de la petición.
- **Comandos con una sola entrada**: el generador sustituye una única `${input:x}` por la cadena completa (`$ARGUMENTS`) en Claude, OpenCode y Codex, y Claude deja de declarar `arguments` para esos comandos. Afecta también a comandos como `sdd-apply`, que en OpenCode y Codex pasan de `$1` a `$ARGUMENTS`. Los comandos con varias entradas siguen posicionales.

### Changed
- **Roadmap**: E1.8 `sdd-new-intent-argument` pasa a hecho, con prueba real en Claude Code con y sin nombre de cambio. E1.7 `ospec-doctor` pasa a elegible. Hecho con IDD (`idd/archive/2026-10-08-sdd-new-intent-argument/`).

**Verificación directa**: `node scripts/check.js` (3310 tests pasando, 0 fallos y 0 omitidos).

## [2.114.1] - 2026-10-08

### Changed
- **Roadmap**: nuevo ítem por demanda E5.8 `sdd-marketplace-plugin`, para publicar un segundo plugin `ospec-workflow-sdd` en el marketplace de Claude, que hoy solo ofrece la build sin SDD. Queda aplazado por decisión del usuario; lo siguiente sigue siendo E1.8. Hecho con IDD (`idd/archive/2026-10-07-roadmap-sdd-marketplace-plugin/`).

**Verificación directa**: `node scripts/check.js` (3307 tests pasando, 0 fallos y 0 omitidos).

## [2.114.0] - 2026-10-08

### Changed
- **README y documentación de producto con IDD por defecto (E1.6 d3)**: el README en inglés y en español, las guías de instalación, `docs/README.md`, `docs/en/README.md` y la web (`openwiki/` y `web-doc/astro.config.mjs`) presentan IDD como flujo por defecto, con sus señales, obligaciones, gates, `idd/config.yaml` y `mode: sdd`, y SDD como modo opcional con `--with-sdd`/`--no-sdd`. Las páginas K1–K12 de la web quedan marcadas como históricas, y `docs/en/README.md` deja de citar la revisión v1 retirada.
- **Lema IDD en los manifiestos (REQ-install-037)**: `package.json`, `.plugin.json` y `.claude-plugin/plugin.json` publican la misma descripción, con IDD primero y SDD como modo opcional. El marketplace de Claude copia la descripción del manifiesto en vez de tener la suya y añade la palabra clave `idd`.
- **Roadmap**: E1.6 `idd-default-entry` pasa a hecho. La prueba real del «hecho cuando», en Claude Code con la build por defecto (`claude -p --plugin-dir`, Sonnet, $0,30), carga 0 skills, agentes o comandos SDD y crea y cierra un cambio IDD con documento vivo. Lo siguiente es E1.8. Hecho con IDD (`idd/archive/2026-10-07-idd-default-docs/`).

### Known issues
- El marketplace publicado en la rama `release` se construye sin `--with-sdd`, así que quien instala desde él no puede activar SDD. Para usar SDD en Claude Code hay que instalar desde un checkout con `npm run setup:claude -- --with-sdd`. Queda como follow-up.

**Verificación directa**: `node scripts/check.js` (3307 tests pasando, 0 fallos y 0 omitidos).

## [2.113.0] - 2026-10-08

### Added
- **Paquete SDD opcional (E1.6 d2, REQ-generator-025)**: las skills, los agentes (con el orquestador), los comandos `/sdd-*` y las reglas `sdd-*` solo se instalan con `--with-sdd`. Los agentes `review-*`, `skills/_shared/` y el runtime se quedan, porque IDD los usa. Por defecto, el orquestador pasa de 44–61 KB a 0, las skills instaladas de 47–48 a 31, los agentes de 22–23 a 6 y el listado de skills de Codex de 6,4 a 4,2 KB.
- **`--with-sdd` y `--no-sdd` en los 7 instaladores e `install-target` (REQ-install-036)**: sin flag, una reinstalación conserva SDD si la instalación anterior lo traía (según su manifiesto de propiedad o su directorio de agentes) y lo avisa; `--no-sdd` lo quita. Quien instaló antes de esta versión conserva SDD al actualizar.
- **Paquetes en el instalador TUI**: la pantalla de revisión ofrece «Modo SDD» y «Extras», que se activan con las teclas 1 y 2; el adaptador los pasa al instalador como `--with-sdd` y `--with-extras`.

### Changed
- **Router**: si se pide SDD y no está instalado, indica que hay que reinstalar con `--with-sdd`. *Always-on* sube 64 B (3,1–3,5 KB).
- **Validadores**: Cursor, Antigravity, Copilot y OpenCode ya no exigen el directorio de comandos o prompts, que una instalación sin SDD no tiene.
- **Banco**: construye el plugin siempre con `--with-sdd`, así que los dos brazos conservan el plugin con el que se midieron `sdd-baseline-3` e `idd-2`. `bench-margins-5` (esquema 4) cambia `candidate_digest` por `candidate_digests` y añade `hosts/claude.js` a la excepción de huella; el checkpoint de `idd-2` sigue dando `continue` (REQ-bench-005).
- **Roadmap**: E1.6 (d2) entregado y hecho con IDD (`idd/archive/2026-10-07-sdd-optional-package/`). Lo siguiente es (d3): README y documentación de producto.

### Fixed
- Los revisores `review-*` citaban `skills/sdd-verify/SKILL.md` desde el módulo compartido que incrustan; la referencia se quita para que no apunte a un fichero ausente sin SDD.

**Verificación directa**: `node scripts/check.js` (3306 tests pasando, 0 fallos y 0 omitidos).

## [2.112.0] - 2026-10-08

### Changed
- **IDD es el flujo por defecto (E1.6 d1)**: el router manda a IDD (skill `idd`) los cambios de código que no son una petición de SDD, sin necesidad de `mode: idd`. Las preguntas y el trabajo de solo lectura siguen directos, y un cambio se hace directo solo si el usuario lo pide expresamente sin IDD. `resolveMode` da `idd` cuando ni el cambio ni `idd/config.yaml` declaran modo (REQ-idd-001, REQ-generator-022 y REQ-generator-024).
- **Aviso para proyectos SDD**: un proyecto sin `mode` en `idd/config.yaml` pasa a IDD aunque tenga `openspec/`. Para conservar el comportamiento anterior (trabajo directo y SDD solo con `/sdd-*` o petición explícita), declarar `mode: sdd` en `idd/config.yaml`. Los cambios SDD en curso terminan en SDD.
- **Contexto**: *always-on* sube 117–140 B por target (3,0–3,4 KB, bajo el límite de 4 KB) y el listado de skills, 13 B; techos de `scripts/fixtures/context-baseline.json` actualizados.
- **Roadmap**: E1.6 (d) se entrega en tres PRs; (d1) hecho y primer ítem ejecutado con IDD en este repositorio (`idd/archive/2026-10-07-idd-default-mode/`). Lo siguiente es (d2), las fases SDD en el paquete `--with-sdd`.

**Verificación directa**: `node scripts/check.js` (3273 tests pasando, 0 fallos y 0 omitidos).

## [2.111.0] - 2026-10-07

### Added
- **Corrida `idd-2` y checkpoint `continue` (E1.6)**: record `scripts/evals/bench/records/idd-2.json` e [informe](docs/analysis/2026-10-07-bench-idd-2.md). Con el gate `open-facts` de v2.110.0, los seis escenarios terminan con 43/43 checks y 0 escapados. Gastan 3,06 M tokens ($2,07), el 4,7 % de `sdd-baseline-3`, con un mensaje de preguntas por escenario. El checkpoint con `bench-margins-4` da `continue`, sin vetos.
- **Comparación de calidad de las entregas** (`scripts/evals/quality/`): `collect` guarda el diff de producto de cada escenario y brazo, sus métricas (líneas por categoría, proporción de test, documentación, suite) y el mutation score de los tests entregados, sin modelo. `judge` hace una revisión a ciegas por pares, anónima y en los dos órdenes, y puntúa corrección, legibilidad, diseño, tests y alcance. `report` genera las tablas. Es análisis fuera del harness del banco, así que no cambia `harness_digest`. Los resultados de `sdd-baseline-3` frente a `idd-2` quedan en `results/`: mutation score medio del 83,1 % frente al 81,8 %, y el juez prefiere IDD en 5 de 6 escenarios.

### Changed
- **Roadmap**: E4.1 `bench-scenarios` pasa a `done`. Lo siguiente es E1.6 (d), IDD como flujo por defecto. Follow-up del protocolo IDD: editar ficheros de texto respetando su codificación, porque una entrega dejó un README en ISO-8859-1.

**Verificación directa**: `node scripts/check.js` (3273 tests pasando, 0 fallos y 0 omitidos).

## [2.110.0] - 2026-10-07

### Added
- **Gate `open-facts` (REQ-idd-018)**: `ospec record intent` exige declarar los hechos abiertos: las preguntas de comportamiento que ni la petición ni el código fijan, como valores por defecto, entradas inválidas, error o silencio, normalización y compatibilidad (`--open-fact`, repetible), o bien `--no-open-facts --basis`. Si falta la declaración, el intento se rechaza con `facts-undeclared`. Los hechos abiertos abren el gate `open-facts`: `next` lo pide antes de cualquier obligación y devuelve todas las preguntas juntas, y solo lo resuelve la respuesta del usuario. El `state.yaml` guarda la declaración en `facts`; los estados anteriores siguen siendo válidos.
- **Contrato público desde `package.json` (REQ-idd-012)**: `public-contract` se deriva también de los ficheros que publica un `package.json` no privado en la raíz (`main`, `types`, `typings`, `bin` y las rutas de `exports`), con el motivo «published by package.json». Un manifiesto ausente o mal formado no publica nada.

### Changed
- **Protocolo `idd`**: antes de abrir el cambio, el agente lee el código, lista los hechos abiertos sin decidirlos y los pregunta todos juntos. Si el host no tiene herramienta de preguntas, termina el turno con ellas. REQ-idd-008 pasa a cuatro gates y REQ-generator-024 lo recoge.
- **Roadmap**: revisión de IDD de E1.6 entregada. Lo siguiente es la corrida `idd-2` contra `sdd-baseline-3`. Un smoke real en `brownfield` pasa de 3 defectos escapados a 0, con una pregunta decisiva y 467 k tokens.

**Verificación directa**: `node scripts/check.js` (3264 tests pasando, 0 fallos y 0 omitidos).

## [2.109.1] - 2026-10-07

### Added
- **Primera corrida del brazo IDD (E1.6, PR c)**: record `scripts/evals/bench/records/idd-1.json` e [informe](docs/analysis/2026-10-07-bench-idd-1.md). Los seis escenarios se completan en 10 minutos con 1,74 M tokens ($1,08), el 2,6 % de `sdd-baseline-3`, y sin subagentes. Pasan 37 de 43 checks: escapan 6 defectos (3 en brownfield, 2 en public-library y 1 en bugfix), así que el checkpoint con `bench-margins-4` da `revise`, por escapados y por regresiones.

### Changed
- **Roadmap**: E1.6 (c) entregado; (d), el cambio de default, no se ejecuta. Causas: el agente IDD no hizo ninguna pregunta (SDD hizo 13, 5 decisivas) y decidió él mismo las reglas de negocio; y las señales de impacto, aunque se calcularon en los seis cambios, solo derivaron `always`, porque sus patrones buscan convenciones de directorio. Decisión del usuario: añadir un cuarto gate, «hechos abiertos», derivar señales sin configuración y, después, medir `idd-2` contra la misma línea base.

**Verificación directa**: `node scripts/check.js` (3253 tests pasando, 0 fallos y 0 omitidos).

## [2.109.0] - 2026-10-07

### Added
- **Brazo `idd` del banco (E1.6, PR b)**: `scripts/evals/bench/arms.js` habilita `--arm idd`. En el setup no medido, el agente escribe `idd/config.yaml` con `mode: idd` y el check `npm test`, el mismo comando que `sdd-init` registró para el brazo `sdd`. El setup termina cuando ese fichero se lee en modo IDD. El cambio entra con `/ospec-workflow:idd <brief>`, porque el router no se carga en la configuración aislada del banco, y termina cuando `ospec close` deja un cambio en `idd/archive/` (REQ-bench-006). `driver.js` no cambia.
- **Excepción de huella verificada**: los márgenes pasan a `bench-margins-4` (schema 3), con los mismos umbrales que `bench-margins-3` y un campo `harness_exception`. El checkpoint acepta un harness distinto solo para el par declarado, en esa dirección: `sdd-baseline-3` (`42261bd0…`) → huella actual, con `arms.js` y `checkpoint.js` como únicos ficheros cambiados. El resultado y el informe lo hacen constar (REQ-bench-005). `harness-exception.test.js` comprueba que la huella actual es la declarada, que restaurar esos dos ficheros desde `__fixtures__/harness-baseline/` reconstruye la de la línea base y que el brazo `sdd` se comporta igual. Así no hay que repetir la línea base, que costaría unos 66 M tokens.

### Changed
- **Roadmap**: E1.6 (b) entregado. Lo siguiente es (c): las seis corridas IDD, el checkpoint contra `sdd-baseline-3` y su informe.

**Verificación directa**: `node scripts/check.js` (3253 tests pasando, 0 fallos y 0 omitidos).

## [2.108.1] - 2026-10-07

### Fixed
- **Compatibilidad del ciclo de sesión de Engram**: `scripts/configure/engram-setup.js` comprueba `codex-register`, `codex-resolve` y `codex-session-end` con entrada vacía y timeout de tres segundos, sin crear sesiones. El setup identifica operaciones incompatibles o desconocidas y evita anunciar como operativo un registro que solo tiene plugin y MCP presentes. La confirmación de identidad sigue correspondiendo al hook del runtime.
- **Lanzamiento de hooks nativos**: `scripts/hooks/ospec-codex-hook.js` fija los marcadores de Codex dentro del proceso Node y conserva la selección Go/Node y la adaptación de resultados del launcher compartido. `scripts/lib/target-transform.js` elimina las asignaciones específicas del shell que provocaban `Hook failed` en PowerShell; las llamadas seguras conservan la aprobación normal y las prohibidas siguen bloqueadas.
- **Instalación en homes gestionados**: `scripts/configure/install-codex.js` respeta `CODEX_HOME` absoluto. Los productores SessionStart Node y Go reconocen el runtime activo y las skills compartidas; el instalador conserva los enlaces de `AGENTS.md` al archivo global regular validado. Las comparaciones usan rutas reales para admitir alias de directorios, como `/var` y `/private/var` en macOS. Esto cubre instalaciones directas y gestionadas por Orca sin modificar el host ni admitir destinos arbitrarios.
- **Migración de hooks existentes**: la reinstalación sustituye solo handlers propios, conserva los de terceros incluso en grupos mixtos y no duplica hooks. Las guías de instalación en español e inglés y los informes de `docs/testing/` documentan la reparación y sus límites.

**Verificación directa**: `node scripts/check.js` (3248 tests pasando, 0 fallos y 0 omitidos). Generación de los siete targets, `go test ./...`, 255 pruebas de la selección con cobertura de líneas del 91,93 % y 24 llamadas de hooks instalados entre cmd, Windows PowerShell 5.1, PowerShell 7 y Git Bash en los homes global y de Orca. El nuevo arranque automático del host queda pendiente de reinicio o reanudación.

## [2.108.0] - 2026-10-07

### Added
- **Protocolo IDD en los 7 targets (E1.6, PR a)**: nueva skill `idd` (`skills/idd/SKILL.md`, 4,5 KB, bajo demanda). Trabaja el cambio con el CLI `ospec`: sigue `ospec next` y su `next_step.how`, registra evidencia solo con `ospec run`, `check` y `review`, se detiene solo en los tres gates (intención ambigua, operación irreversible y ADR enmendado o contradicho) y nombra `work-unit-commits`, `branch-pr` y `chained-pr` para la entrega, que decide el usuario (REQ-generator-024).
- **Ruta del CLI instalado**: en Claude, el protocolo usa `${CLAUDE_SKILL_DIR}/../../scripts/ospec.js`. En el resto de targets lleva el marcador `__OSPEC_RUNTIME_DIR__`, que cada instalador sustituye por el directorio de su runtime: la raíz de instalación en Copilot, OpenCode, Cursor y Antigravity, `~/.codex/ospec-workflow` en Codex, `dist/vscode` en VS Code y `.` en `install-target`. Como el marcador de `_shared`, se restaura en `dist/` tras sincronizar (REQ-install-035).

### Changed
- **Router**: con `mode: idd` en `idd/config.yaml`, los cambios de código que no son una petición SDD entran por la skill `idd`. Sin ese modo, el comportamiento es el de antes, y SDD sigue disponible con `/sdd-*`. *Always-on* sube unos 0,3 KB (2,9–3,3 KB, por debajo de 4 KB) y el listado de skills, 0,2 KB; techos regenerados en `scripts/fixtures/context-baseline.json`.
- **Roadmap**: E1.6 pasa a `in-progress`, con sus cuatro PRs y la decisión de comparabilidad del usuario. Activar el brazo `idd` cambia `harness_digest`, así que `margins.json` declarará el par de huellas y un test verificará que solo cambian `arms.js` y `checkpoint.js` y que el brazo `sdd` se comporta igual, sin repetir `sdd-baseline-3`.

Dos pruebas reales con Claude Code (Sonnet 5.5, unos $0,13 cada una), una con `/ospec-workflow:idd` y otra con el router, arreglan un bug de juguete en IDD: test de reproducción en rojo y en verde, `ospec check` y `ospec close` con archivo en `idd/archive/`.

**Verificación directa**: `node scripts/check.js` (3229 tests pasando, 0 fallos y 0 omitidos).

## [2.107.2] - 2026-10-07

### Changed
- **Roadmap**: nuevo ítem E1.8 `sdd-new-intent-argument` (bugfix), después de E1.6 por decisión del usuario. Corrige que el comando `sdd-new` generado declare dos argumentos posicionales y parta una petición escrita sin nombre de cambio (hallazgo de `sdd-baseline-3`).

**Verificación directa**: `node scripts/check.js` (3206 tests pasando, 0 fallos y 0 omitidos).

## [2.107.1] - 2026-10-07

### Added
- **Línea base del modo SDD `sdd-baseline-3` (E4.1, PR e)**: record `scripts/evals/bench/records/sdd-baseline-3.json` (Claude Code 2.1.289, Sonnet 5.5, persona Sonnet 5.5, plugin v2.107.0) e informe en `docs/analysis/2026-10-07-bench-linea-base-sdd-3.md`. Seis de seis escenarios completos, 43/43 checks ocultos, 0 defectos escapados, 65,7 M tokens ($38,64) y 13 intervenciones, de las que 5 cambian una decisión. Es la línea base contra la que E1.6 medirá IDD; `sdd-baseline-2` queda como histórico.
- Hallazgo registrado en el informe: en Claude, `/sdd-new` declara dos argumentos posicionales y parte una petición escrita sin nombre de cambio. Queda pendiente de corregir.

### Changed
- **Márgenes `bench-margins-3`** (revisión del usuario por cuota): una repetición por escenario y brazo, con los mismos márgenes de `bench-margins-2` (0 escapados medios de diferencia, tokens ≤ 0,9 y veto de regresiones). `sdd-baseline-3` conserva sus tres primeras corridas, hechas con la campaña de tres repeticiones; en el record solo cambió `repetitions` de 3 a 1.
- **Roadmap**: E4.1 (e) entregado y E1.6 `idd-default-entry` como siguiente; README del banco con los márgenes nuevos.

**Verificación directa**: `node scripts/check.js` (3206 tests pasando, 0 fallos y 0 omitidos).

## [2.107.0] - 2026-10-06

### Added
- **Repeticiones en el banco (E4.1, PR d)**: `bench.js run --repetitions <n>` corre cada escenario n veces, repetición a repetición, cada una en su propio workspace. El record pasa a schema 2 (`repetitions` en la identidad y `repetition` en cada corrida) y el informe añade la media de cada escenario; los records de schema 1, como `sdd-baseline-2`, se siguen leyendo como una repetición (REQ-bench-004).
- **Márgenes `bench-margins-2`** (decisión del usuario): 3 repeticiones por brazo; el checkpoint suma medias por escenario, IDD no puede escapar más defectos medios que SDD (`max_mean_delta: 0`) y gasta como mucho el 90 % de sus tokens medios. Un check que SDD pasa en todas sus repeticiones e IDD falla en alguna veta el cambio de default. Una repetición que falta o un número de repeticiones distinto al de los márgenes también obliga a revisar (REQ-bench-005).

### Fixed
- **Cuota agotada del host**: un turno que acaba en HTTP 429 (por ejemplo, el límite de sesión de una suscripción) detiene la corrida sin reintentar, y `bench.js run` termina toda la campaña con código 3 sin registrar la corrida cortada; el mismo comando la reanuda tras el reset. Antes se registraba como `host-error` y la campaña seguía quemando el siguiente escenario (REQ-bench-002).
- **Corridas anuladas en el setup**: `setup-incomplete` y `setup-modified-seed` ya no se juzgan contra la semilla. El informe las muestra como «not judged» en vez de contarles como escapados los checks que la semilla falla.

### Changed
- **Roadmap**: E4.1 registra las decisiones del usuario tras la línea base y su entrega (d). La línea base se repite como `sdd-baseline-3`, con 3 repeticiones, antes de E1.6.

**Verificación directa**: `node scripts/check.js` (3206 tests pasando, 0 fallos y 0 omitidos).

## [2.106.1] - 2026-10-06

### Fixed
- **`validate-phase` en proyectos sin tabla de rutas** (REQ-routing-017): `sdd-init` no escribe `routing:` en `openspec/config.yaml`, y el orquestador prevé ese caso eligiendo `lite` o `standard` («Graceful Degradation»). Pero `validate-phase.js` rechazaba toda ruta salvo `freeform`, así que el agente tenía que pedir permiso para seguir sin validación de transiciones. Lo detectó la línea base del banco en `cli-local`. Ahora, sin tabla, `lite` y `standard` se validan contra sus fases por defecto; cualquier otra ruta sigue necesitando tabla, y una tabla declarada sigue siendo la única autoridad.

### Changed
- El informe de la línea base corrige la causa de una pregunta de `brownfield`: era la pregunta de modo de ejecución del protocolo, no una consecuencia del routing.

**Verificación directa**: `node scripts/check.js` (3196 tests pasando, 0 fallos y 0 omitidos).

## [2.106.0] - 2026-10-06

### Added
- **Línea base del modo SDD (E4.1, PR c)**: record `scripts/evals/bench/records/sdd-baseline-2.json` (Claude Code 2.1.289, Sonnet 5.5, persona Sonnet 5.5, plugin v2.105.1) e informe en `docs/analysis/2026-10-06-bench-linea-base-sdd.md`. Los seis escenarios terminan completos: 43/43 checks ocultos, 0 defectos escapados, 63,1 M tokens ($37,00, 91 % lecturas de caché), 93 minutos y 14 intervenciones, de las que 6 cambian una decisión. Con los márgenes `bench-margins-1`, el brazo IDD de E1.6 no puede escapar ningún defecto y debe gastar como mucho unos 56,8 M tokens.
- Hallazgos del modo SDD registrados en el informe: `sdd-init` no escribe `routing:` y `validate-phase` rechaza entonces toda ruta salvo `freeform`; verify se bloquea esperando confirmar supuestos en la mitad de los escenarios. También los follow-ups del banco: abortar al agotarse la cuota de sesión del host y no contar como escapados los checks de una corrida con el setup incompleto.

### Changed
- **Roadmap**: E4.1 (c) entregado; E1.6 `idd-default-entry` pasa a elegible y E4.1 queda pendiente del brazo IDD, que se ejecuta en E1.6. La fila «Escenarios comparados» registra la línea base.

**Verificación directa**: `node scripts/check.js` (3195 tests pasando, 0 fallos y 0 omitidos).

## [2.105.1] - 2026-10-06

### Fixed
- **Persona del banco (E4.1)**: en la primera corrida de la línea base, la persona con Haiku declaró haber revelado tres hechos ocultos tras contestar solo «Confirmado», y no corrigió un resumen del agente que contradecía uno de ellos. Eso inflaba las preguntas decisivas y podía atribuir a SDD un defecto causado por la persona. Ahora la persona usa Sonnet por defecto, solo declara los hechos cuyo contenido escribe en su respuesta y compara con sus hechos cada resumen o plan que aprueba (REQ-bench-003). La corrida `sdd-baseline-1` se descarta.
- **Identidad del record**: el record y el checkpoint incluyen `harness_digest`, la huella del código del banco (driver, persona, host, record y checkpoint). Un record no se reanuda con otro harness, y dos records de harness distintos no se comparan (REQ-bench-004 y 005).

**Verificación directa**: `node scripts/check.js` (3195 tests pasando, 0 fallos y 0 omitidos).

## [2.105.0] - 2026-10-05

### Removed
- **Lo que quedaba de K12 (E4.1, PR b)**: `worker-record`, `runner`, `run-manifest` y su esquema `schemas/kernel/run-manifest/` (REQ-kernel-contract-schemas-033), `cohort`, `obligation-oracle` y `pilot-checkpoint`, con sus tests, el corpus de 22 tareas, los márgenes, las calibraciones y las instantáneas del piloto Adaptive Repair. Su forma estaba atada al kernel retirado (políticas `fixed` y `adaptive-repair-v1`, medidas de fases, efectos y eventos) y el banco de E4.1 usa su propio record. `k1-compat` y `k1-scope-guard` dejan de registrar esas rutas. El piloto sigue documentado en `docs/analysis/2026-10-03-adaptive-pilot-report.md` y se reproduce con v2.104.0 o anterior.

### Changed
- El intervalo t del 95 % por tarea pasa del runner de K12 a `scripts/evals/bench/stats.js`, con tests propios; el checkpoint del banco lo usa desde ahí.
- **Roadmap**: E4.1 (b) entregado; la fila de K12 en la base entregada queda como retirada.

**Verificación directa**: `node scripts/check.js` (3193 tests pasando, 0 fallos y 0 omitidos).

## [2.104.0] - 2026-10-05

### Added
- **Banco de escenarios con agentes reales (E4.1, PR a)** (`scripts/evals/bench/`, spec `bench`, REQ-bench-001 a 006):
  - Seis escenarios, uno por perfil (CLI local, SaaS pequeño, regulado, brownfield, librería pública y bugfix). Cada uno trae un repositorio semilla, una petición, los hechos que solo conoce el usuario y checks ocultos de aceptación, de hecho y de regresión. Una entrega de referencia por escenario prueba que los checks pasan con una solución correcta y que la semilla falla la aceptación.
  - Driver por turnos sobre `claude -p` con el plugin construido desde el checkout y un `CLAUDE_CONFIG_DIR` propio del banco. El setup del proyecto queda fuera de la medición: la persona solo conoce su objetivo, y un setup que modifica la semilla anula la corrida (`setup-modified-seed`). Una prueba de humo con Haiku detectó que, sin esa separación, el agente arreglaba el bug durante el init. La corrida acaba cuando el brazo da el cambio por terminado o al llegar al tope de turnos o de coste.
  - Persona simulada (modelo barato, sin herramientas, con salida estructurada): clasifica cada mensaje del agente, contesta con los hechos ocultos solo si se le pregunta y marca las preguntas que cambian una decisión.
  - Métricas por corrida: tokens de todos los modelos (subagentes incluidos), coste, duración, turnos, preguntas, preguntas decisivas, intervenciones y defectos escapados. El record versionado ata cada corrida a host, modelo, build del plugin, persona y corpus, y no se reanuda con otra identidad.
  - Checkpoint con márgenes predeclarados (`margins.json`, `bench-margins-1`): IDD no puede escapar más defectos en total y tiene que gastar como mucho el 90 % de los tokens del modo SDD. Fijos en código: records incomparables, corridas incompletas y cualquier check que SDD pasa e IDD falla obligan a revisar.
  - CLI `node scripts/evals/bench/bench.js list|run|report|checkpoint`. `run` gasta tokens y nunca corre en `npm test`. El brazo `idd` queda declarado y se niega a correr hasta E1.6.

### Changed
- **Roadmap**: E4.1 registra las decisiones del usuario (un host, persona con hechos ocultos, Sonnet 5.5 con una repetición, márgenes y retirada de K12) y su entrega en tres PRs.

**Verificación directa**: `node scripts/check.js` (3241 tests pasando, 0 fallos y 0 omitidos).

## [2.103.0] - 2026-10-05

### Fixed
- **Scripts de SDD que no llegaban al runtime (E1.4, PR d)**: las skills y los agentes de SDD citan por ruta `scripts/archive-transaction-run.js`, `scripts/lib/apply-resume.js`, `scripts/lib/lifecycle-hooks.js`, `scripts/lib/quality-gates.js` y `scripts/lib/verify-lineage.js`, pero no se distribuían, así que en un proyecto consumidor esos pasos no podían ejecutarse. Pasan a `RUNTIME_ENTRY_SCRIPTS` con sus dependencias; el runtime pasa de 82 a 89 ficheros, sin dependencias colgando.
- Los comentarios de `lifecycle-hooks.js` dejan de escribir una ruta de unidad de Windows literal, que el validador de GitHub Copilot rechaza en el dist; `k1-scope-guard` registra el fichero como evolución sucesora.

### Added
- **Test de cobertura del runtime** (`scripts/configure/cli.test.js`): todo script que citan skills, agentes, reglas, comandos o hooks, que exista en el repositorio y no sea un test, debe distribuirse.

### Changed
- **Roadmap**: E1.4 `ospec-check-and-close` queda cerrado; pasan a elegibles E4.1 `bench-scenarios` (empezando por el brazo del modo SDD, línea base antes de E1.6) y E2.1 `knowledge-map-contract`.

**Verificación directa**: `node scripts/check.js` (3178 tests pasando, 0 fallos y 0 omitidos).

## [2.102.0] - 2026-10-05

### Added
- **`ospec close --change <id>` (E1.4, PR c)** (REQ-idd-017, `scripts/lib/idd-close.js`):
  - Rechaza con `evidence-stale` si la evidencia de `checks-pass` no es del árbol actual: el último `check` liquidó en ese árbol todo lo que depende de él.
  - Bajo un lock fuera del directorio del cambio, liquida `living-doc`: `change.md` debe conservar las cuatro secciones, con `Plan` y `Decisions` escritos, y entonces se registra `living-doc-current`. Después rechaza con `close-refused` si queda una obligación pendiente o un gate abierto, y registra `status: closed` y `closed_at` (marca de reanudación).
  - Reescribe solo la sección de evidencia de `change.md` y mueve el cambio a `idd/archive/<fecha>-<id>/`. Compara la huella de inventario de O6A antes y después; si el renombrado falla, copia a staging y compara antes de sustituir.
  - Repetir `close` termina un movimiento interrumpido, rechaza un destino con otro contenido (`archive-conflict`) e informa `already_complete` si ya estaba archivado.

### Changed
- **`ospec check`**: un `change.md` al día no cuenta como pendiente (la evidencia la registra `close`); si no lo está, el motivo dice qué le falta. `next` da la pista `how` del documento vivo.
- **Estado `idd-state/v1`** (REQ-idd-003): campo `closed_at` en los cambios cerrados.
- **Spec `idd`**: REQ-idd-017 nuevo; REQ-idd-004 define cuándo el documento vivo está al día y REQ-idd-009 remite al cierre transaccional.
- **Roadmap**: E1.4 (c) entregado, con los cuatro criterios de «hecho cuando» cumplidos; el siguiente es el PR (d).

**Verificación directa**: `node scripts/check.js` (3177 tests pasando, 0 fallos y 0 omitidos).

## [2.101.0] - 2026-10-05

### Added
- **`ospec review` (E1.4, PR b2)** (REQ-idd-016): review de confianza de un cambio IDD con el linaje acotado existente (`review-lineage.js`, esquema v2, solo la lente `trust`):
  - `review start` congela el candidato: las rutas que el diff cambia respecto a la base, la huella de su contenido y las líneas cambiadas, tomadas de una instantánea del árbol de trabajo (objeto *tree* de git con un índice temporal, sin `idd/`). Devuelve la petición para el revisor independiente `review-trust`; si hay un review en curso, devuelve ese.
  - `review record --result <json|@fichero>` congela los hallazgos. Sin `BLOCKER` ni `CRITICAL`, registra la evidencia `frozen-review` (linaje, candidato, árbol y huella de hallazgos).
  - Con un bloqueante, una sola corrección acotada: `review correct` registra los cambios dentro de las rutas congeladas y del presupuesto de líneas, y `review validate` aplica el veredicto de `review-correction` a los IDs congelados. Si la validación falla, el linaje termina.
  - El review sucesor no pide aprobación (REQ-idd-008), pero exige que las rutas revisadas hayan cambiado, y un cambio admite como mucho 3 reviews; al agotarlos, `trust-review` queda pendiente y decide la persona.
- **Caducidad del review**: en cada `check`, `trust-review` vuelve a pendiente si cambian las rutas revisadas o el diff toca otra ruta de frontera de seguridad.
- `idd-workspace.js`: `snapshotTree`, `commitTree`, `treeBlobs` y `treeNumstat`.

### Changed
- **Estado `idd-state/v1`** (REQ-idd-003): campo opcional `reviews` con los linajes, del más antiguo al más reciente. `validateState` exige que `frozen-review` nombre un review aprobado de su candidato.
- **`ospec check` y `next`**: el motivo de `trust-review` dice qué paso del review falta, y `next` da el comando.
- **Roadmap**: E1.4 (b2) entregado; el siguiente es el PR (c), `ospec close`.

**Verificación directa**: `node scripts/check.js` (3166 tests pasando, 0 fallos y 0 omitidos).

## [2.100.0] - 2026-10-05

### Added
- **Evidencia de contrato (E1.4, PR b1)** (REQ-idd-015): en cada `ospec check`, `contract-spec-and-test` se satisface si el diff toca un documento de contrato y un test y ese mismo `check` registró la evidencia `check-run`. La evidencia nombra el árbol, esa `check-run` y los documentos y tests tocados. Si falta algo, la obligación vuelve a pendiente con el motivo (sin documento, sin test o checks sin pasar).
- **Documentos de contrato y tests** (`scripts/lib/idd-contracts.js`): una base para cualquier proyecto (OpenAPI, Swagger, AsyncAPI, protobuf, GraphQL, JSON Schema y `docs/api/**`; `*.test.*`, `*.spec.*` y directorios de test), valores por defecto por stack (`*.d.ts`, `*.pyi`, `*_test.go`, `src/test/**`, `*Tests.cs`…) y la sección `contracts:` de `idd/config.yaml` (`documents`, `tests` y `defaults`). Este repositorio declara `openspec/specs/**`.
- **Evidencia de migración**: `ospec run --obligation migration-compat-and-test --command <test> --plan <compatibilidad o rollback>` registra una ejecución `migration-test`. Si pasa, la evidencia nombra la ejecución, el árbol y el plan; si falla, la obligación vuelve a pendiente. En cada `check`, la evidencia de un árbol anterior devuelve la obligación a pendiente.
- **`ospec next`**: pistas `how` para el contrato y la migración.

### Changed
- **Spec `idd`**: REQ-idd-005 precisa las evidencias de contrato y de migración, REQ-idd-013 añade la clave `contracts` y REQ-idd-014 admite `migration-test` como propósito de ejecución. `validateState` comprueba la coherencia de ambas evidencias.
- **Roadmap**: E1.4 (b) se parte en (b1), entregado, y (b2), el review de confianza, que es el siguiente.

**Verificación directa**: `node scripts/check.js` (3152 tests pasando, 0 fallos y 0 omitidos).

## [2.99.0] - 2026-10-05

### Added
- **`ospec check` (E1.4, PR a)** (REQ-idd-014):
  - Recalcula las señales con el diff respecto a la base del cambio (REQ-idd-006).
  - Ejecuta en orden los `checks:` de `idd/config.yaml` y registra cada ejecución en `runs`, con su código de salida, la huella de su salida y la del árbol de trabajo (`HEAD`, el diff binario y los ficheros sin seguimiento, nunca `idd/`).
  - Responde `missing`, con el motivo de cada obligación pendiente, `needs-decision` o `ready`.
  - `checks-pass` solo queda satisfecha si todos los checks pasaron en el árbol actual; si el árbol cambia, el siguiente `check` registra evidencia nueva o devuelve la obligación a pendiente. Un check que falla no satisface nada, diga lo que diga el modelo.
- **`ospec run --obligation repro-test|tdd-red-green --command <test> [--unit <nombre>]`**: ejecuta el test y registra la ejecución. Si el mismo comando (y unidad) falló antes en otro árbol, registra la evidencia del par rojo → verde.
- **Base del cambio**: `record intent` guarda el commit de partida en `base`, y `check` y `signals --diff` calculan el diff contra él (antes, contra `HEAD`).
- **`checks:` en `idd/config.yaml`** (REQ-idd-013): checks con nombre (`nombre: comando`), en el orden en que se declaran. Este repositorio declara `test: node scripts/check.js`.
- `scripts/lib/idd-check.js` (reductores puros y veredicto) y `scripts/lib/idd-exec.js` (ejecución por shell en la raíz del proyecto). Un comando que no arranca o que termina por una señal nunca cuenta como pasado.

### Changed
- **Estado `idd-state/v1`** (REQ-idd-003): campos opcionales `base` y `runs`. La evidencia de ejecución (`check-run`, `repro-run-pair`, `tdd-red-green`) debe nombrar las ejecuciones que la prueban, y `validateState` comprueba que sean coherentes. Los `state.yaml` anteriores siguen siendo válidos.
- **`ospec next`**: el siguiente paso incluye en `how` el comando que registra la evidencia de `checks-pass`, `repro-test` y `tdd-red-green`.
- **Spec `idd`**: REQ-idd-005 define `tdd-red-green` como las dos ejecuciones registradas por el CLI, y REQ-idd-012 toma por defecto la base del cambio.
- **Roadmap**: E1.4 (a) entregado; el siguiente es el PR (b).

**Verificación directa**: `node scripts/check.js` (3138 tests pasando, 0 fallos y 0 omitidos).

## [2.98.0] - 2026-10-05

### Changed
- **Configuración de IDD en `idd/config.yaml` (E1.4, PR 0)**: IDD deja de leer `openspec/config.yaml`, que queda solo para el modo SDD. `scripts/lib/idd-config.js` lee `idd/config.yaml` (REQ-idd-013), que es opcional y admite solo tres claves de primer nivel: `mode` (el modo del proyecto de REQ-idd-001), `strict_tdd` e `impact`. Una clave desconocida o repetida, un valor fuera de su dominio o una línea ilegible se rechazan con `config-invalid`; el contenido inválido de `impact` sigue dando `impact-config-invalid`. `ospec signals` sale con 1 en ambos casos.
- **Spec `idd`**: REQ-idd-001 resuelve el modo del proyecto con `mode` de `idd/config.yaml`; REQ-idd-002 prohíbe que IDD guarde configuración, estado o artefactos en `openspec/`; REQ-idd-005 habla del documento del contrato, sin fijarlo en `openspec/specs/`; REQ-idd-012 lee `strict_tdd` e `impact` de `idd/config.yaml`.
- **Este repositorio**: su sección `impact:` pasa de `openspec/config.yaml` a `idd/config.yaml` (con `scripts/lib/idd-config.js` como contrato público), y `k1-scope-guard` pierde la normalización que la toleraba en `openspec/config.yaml`.
- **Roadmap**: directriz de E1.4 (IDD no vive en `openspec/`) y plan de entrega en cinco PRs; E2.1 y el paso 7 de la foundation dejan el estado de máquina fuera de `openspec/`, y E1.6 activa SDD con `mode: sdd` en `idd/config.yaml`.

### Removed
- `parseProjectConfig` de `scripts/lib/idd-impact.js`: el parseo del fichero pasa a `idd-config.js`, e `idd-impact.js` exporta `validateImpact`.

**Verificación directa**: `node scripts/check.js` (3109 tests pasando, 0 fallos y 0 omitidos).

## [2.97.0] - 2026-10-05

### Removed
- **Kernel no cableado (E1.5 c)**: 45 módulos de producción (15,5 k líneas) y 46 tests que ningún proyecto consumidor ejecutaba:
  - Lifecycle K2: `lifecycle-model`, `lifecycle-kernel/*` salvo `k1-compat` y el reducer de fases, `minimal-kernel-harness`, `next-transition`, `transition-parity` y `kernel-aliases`.
  - Authority Store y permits (K2.1).
  - Conformance host, host adapters y capability proof (K2a).
  - Budgets y recovery (K5).
  - Repair shadow (K4b).
  - Executor y sandbox de workers (K6a), y `runner-receipt-store`.
- **13 dominios de spec** que solo describían ese código: `authority-store`, `operation-permits`, `effect-semantics`, `lifecycle-model-conformance`, `minimal-kernel-harness`, `transition-surface-parity`, `headless-conformance-host`, `reference-host-adapter`, `host-capabilities-contract`, `capability-proof`, `execution-budgets`, `failure-recovery` y `repair-shadow-orchestration`.

### Changed
- **Specs recortadas**:
  - `lifecycle-kernel-runtime` conserva el reducer de fases que usa `ospec-state` (REQ-lifecycle-kernel-028 a 030).
  - `harness-authority-canon` conserva los principios de autoridad y las superficies de evidencia que siguen distribuidas (REQ 001, 002, 010, 011 y 013).
  - `worker-isolation` conserva `worker-workspace` y `allowed-paths-validator` (REQ 001, 002, 003, 007 y 009).
- **Guardias**: `k1-scope-guard` pierde 41 entradas y 13 aserciones sobre rutas que ya no existen; `roadmap-boundary` deja de recorrer los módulos retirados.
- **Checkers k4a, k5 y k6a**: se mantienen, a diferencia de lo que proponía el inventario, porque validan fixtures de `schemas/kernel`, que se sigue distribuyendo.
- **Docs**: `target-capabilities.md` deja constancia de la retirada de K2a. E1.5 queda cerrado en el roadmap y E1.4 `ospec-check-and-close` pasa a ser el siguiente. `scripts/lib` baja de 51,6 k a 33,9 k líneas de producción.

**Verificación directa**: `node scripts/check.js` (3102 tests pasando, 0 fallos y 0 omitidos).

## [2.96.0] - 2026-10-05

### Removed
- **Executor del piloto y campaña K12 (E1.5 b)**: se retiran `k12/pilot-executor.js`, `k12/campaign-executor.js` y el CLI `scripts/k12-campaign.js`. Ejecutaban el piloto Adaptive Repair y la campaña de maquinaria sobre el kernel (Execution Graph, repair shadow, verifier y harness de K2), y eran lo único que mantenía vivo ese código desde K12.

### Changed
- **Fixtures del piloto**: las últimas ejecuciones del piloto determinista y de las dos calibraciones con agentes reales quedan en `scripts/evals/__fixtures__/k12/snapshots/`, con rutas fijas y sin datos de la máquina. Los tests de `pilot-checkpoint` y `worker-record` juzgan el checkpoint en vivo sobre ellas. `worker-record`, `runner`, `run-manifest`, `cohort`, el oracle y el checkpoint se conservan para el bench de E4.1.
- **Docs**: el README de K12, el protocolo de calibración y el informe del piloto indican que la reproducción exacta requiere v2.94.0 o anterior. El roadmap marca E1.5 (b) como entregado.

**Verificación directa**: `node scripts/check.js` (3685 tests pasando, 0 fallos y 0 omitidos).

## [2.95.0] - 2026-10-05

### Added
- **Inventario de cableado del kernel (E1.5)**: `docs/analysis/2026-10-05-inventario-cableado-kernel.md` mide qué parte de `scripts/lib` llega a un proyecto consumidor: 19,1 k de 51,6 k líneas de producción, no las 9 k que estimaba el roadmap, porque Execution Graph, Assurance Graph y parte del verifier se distribuyen a través del binding K7 del review. Clasifica los 108 ficheros sin cablear (28,6 k líneas) y recoge la decisión: retirar 64, congelar 19 con dueño, cablear 6 de K12 en E4.1 y conservar 19 de *tooling*. También detecta que las skills citan 8 scripts que no se distribuyen.

### Removed
- **Checkers de la arquitectura archivada**: `k1-maturity` (con REQ-contract-lint-011), `k21-maturity-docs`, `k2a-maturity-docs`, `k3-readiness-reconciliation` y `roadmap-reconciliation`. Validaban un documento que ya no cambia y fijaban filas del roadmap vigente.
- **Ejecución de challenges K6c**: planner, runner, mutator, budget, diff-scope e índice, con REQ-adversarial-challenges-002 a 004 y REQ-harness-authority-canon-012. Se conservan el catálogo y la integridad de planes y resultados, que el verifier y el Assurance Graph distribuidos siguen leyendo; el planner pasa a `test-support/k6c-challenge-fixtures.js` para sus tests.
- **Attestation K8**: `evaluation-attestation/` y su dominio de spec. El esquema `candidate-evaluation-attestation/v1` sigue en `schemas/kernel`.
- **`operation-identity-binding`**: E1.2 se entregó sin él y ningún hook lo usaba.

### Changed
- **Roadmap**: E1.5 registra el inventario, la decisión y la entrega en PRs encadenados; la tabla "Base entregada" indica qué se cablea, qué se congela y qué se retira de cada pieza del programa K.

**Verificación directa**: `node scripts/check.js` (3710 tests pasando, 0 fallos y 0 omitidos).

## [2.94.0] - 2026-10-05

### Added
- **`ospec signals` (E1.3)**: deriva y registra las señales de impacto de un cambio IDD (REQ-idd-012). `always`, `strict-tdd`, `bug-fix` y `multi-unit-or-decision` salen de la intención, de `strict_tdd` en `openspec/config.yaml` y de lo declarado (`--work-units`, `--decision`). Contrato público, datos persistentes y frontera de seguridad salen de las rutas previstas (`--path`, `source: declaration`) y, con `--diff [--base <ref>]`, del diff de git, incluidos los ficheros sin seguimiento (`source: diff`). Cada señal muestra su razón, con la ruta y el patrón que la disparó.
- **Patrones de impacto por stack**: base común más valores por defecto para `node`, `jvm`, `dotnet`, `python` y `go`, detectados por su manifiesto en la raíz. La nueva sección `impact:` de `openspec/config.yaml` añade patrones por señal, fija el stack, desactiva los valores por defecto (`defaults: false`) o excluye rutas; una clave o un stack desconocidos se rechazan. La documentación (`**/*.md`, `**/*.mdx`, `docs/**`) nunca deriva señales.
- **Gate de operación irreversible automático**: se abre por una operación declarada (`--operation drop-column`, `drop-table`, `truncate-table`…) o por una sentencia destructiva que el diff añade a un fichero de datos persistentes (DROP de tabla, esquema, base de datos o columna, TRUNCATE o DELETE sin WHERE, en SQL y en los ORM habituales). Los comentarios no cuentan.
- **Suelos de K1 reutilizados**: las señales de ruta y `bug-fix` se corresponden uno a uno con los suelos de riesgo de PP1/PP2 (`public_api`, `data_migration`, `auth_security`, `localized_reproducible_bug`), y `signals` informa del suelo resultante.
- **Fixtures**: los 8 fixtures de E1.1 se reproducen desde su declaración, y `scripts/fixtures/idd/signals/` cubre un contrato público tocado en dos líneas solo en el diff, una migración que solo aparece en el diff, una columna borrada en el diff y documentación de seguridad. Un refactor mecánico de 240 ficheros no abre ningún gate.

### Changed
- **Registro de señales idempotente**: repetir `signals` no cambia `state.yaml`, nunca quita una señal ya registrada ni reabre un gate resuelto, y se rechaza mientras la intención es ambigua.
- **Este repositorio** declara su sección `impact:` (CLI `ospec`, instalador, hooks y manifiestos como contrato público; estado y archive como datos persistentes; `scripts/hooks/` como frontera de seguridad). El guardia K1 de `openspec/config.yaml` la trata como contrato sucesor.
- **Docs**: E1.3 queda cerrado en el roadmap; E1.5 `kernel-wiring-inventory` pasa a ser el siguiente, antes de E1.4.

**Verificación directa**: `node scripts/check.js` (3834 tests pasando, 0 fallos y 0 omitidos).

## [2.93.0] - 2026-10-05

### Added
- **CLI `ospec` para cambios IDD (E1.2)**: `node scripts/ospec.js status | next | record`, con salida `--json` y códigos de salida 0 (correcto), 1 (el contrato IDD lo rechaza) y 2 (error de uso). Se distribuye en el runtime de los 7 targets (REQ-idd-011).
- **`record` idempotente y atómico**: acepta `intent`, `signal`, `gate` y `withdraw`. Si se repite, `state.yaml` no cambia ni un byte, y si intenta reescribir un hecho ya registrado con otro contenido, se rechaza. Cada escritura se valida contra `idd-state/v1`, corre bajo el lock del fichero y lo sustituye de forma atómica, así que un `record` interrumpido deja legible el último estado confirmado. El id del change se valida antes de tocar disco. `record` no acepta evidencia: la registrará el CLI al observar la ejecución que la prueba (E1.4), así que el modelo no puede afirmarla.
- **`next` y `status` deterministas**: `next` devuelve el cambio activo, las obligaciones pendientes en orden de trabajo, la decisión pendiente con su pregunta, el siguiente paso y las referencias de conocimiento. Es una función pura del estado guardado. Cada fixture de `scripts/fixtures/idd/` declara ahora su siguiente paso esperado, y el test lo reproduce sea cual sea el orden en que se registraron las señales.
- **Documento vivo desde plantilla**: cuando se activa la obligación `living-doc`, el CLI crea `idd/<id>/change.md` con las secciones de la plantilla y los marcadores de evidencia, y no lo vuelve a sobrescribir.

### Changed
- **Contrato IDD (REQ-idd-003)**: mientras el gate `ambiguous-intent` está abierto, la intención guarda la petición original en `intent.request` con `kind`, `summary` y `acceptance` a null, y no puede haber señales ni obligaciones. Los gates admiten un `reason` opcional, y `state.yaml` se escribe como JSON, que es YAML 1.2 válido.
- **Docs**: E1.2 queda cerrado en el roadmap y E1.3 `impact-signals` pasa a ser el siguiente.

**Verificación directa**: `node scripts/check.js` (3789 tests pasando, 0 fallos y 0 omitidos).

## [2.92.0] - 2026-10-05

### Added
- **Contrato de IDD (E1.1)**: nueva spec canónica `openspec/specs/idd/spec.md` (REQ-idd-001 a REQ-idd-010), que abre la etapa 1 del roadmap. Define cómo se resuelve el modo de cada change (`mode` del change, luego `workflow.mode` de `openspec/config.yaml` y, si falta, `sdd` hasta E1.6), la ubicación de un cambio IDD en `idd/<id>/` en la raíz del proyecto (aislado de `openspec/changes/`, con archivo en `idd/archive/<fecha>-<id>/`), el `state.yaml` mínimo `idd-state/v1` que solo escribe el CLI y la plantilla del documento vivo `change.md`, que solo existe con la obligación `living-doc`. También fija el catálogo señal → obligación → evidencia (8 señales; la de ADR queda inactiva hasta E3.1), los tres únicos gates (`ambiguous-intent`, `adr-amend-or-contradict` e `irreversible-operation`) y las reglas de cierre: la afirmación del modelo no es evidencia, y una obligación solo se retira con motivo y cuando ninguna señal activa la deriva.
- **Catálogo en código**: `scripts/lib/idd-contract.js` expone el catálogo, `resolveMode`, `deriveObligations`, `validateState`, `canWithdraw` y `canClose` para que los consuman E1.2–E1.4. Un test de paridad falla si el código y la spec divergen.
- **Fixtures de referencia**: `scripts/fixtures/idd/` recoge las señales, obligaciones y gates esperados de seis cambios tipo (typo, bug, feature interna con Strict TDD, API pública, migración aditiva y autenticación) y de dos casos de gate (intención ambigua y migración destructiva). El typo cierra solo con los checks, sin documento ni preguntas.

### Changed
- **Docs**: E1.1 queda cerrado en el roadmap y E1.2 `ospec-cli-core` pasa a ser el siguiente. Ninguna spec de SDD cambia.

**Verificación directa**: `node scripts/check.js` (3735 tests pasando, 0 fallos y 0 omitidos).

## [2.91.0] - 2026-10-04

### Removed
- **Lentes de review v1 (E0.3, PR d)**: se retiran los agentes y las skills `review-risk`, `review-reliability`, `review-resilience` y `review-readability`, con su mapeo de modelo en `models.yaml` y la lista de solo lectura de Cursor. Quedan 46 skills instaladas por target (47 en Claude y Codex) y cuatro agentes menos. Con esto se cierra la etapa 0 del roadmap.

### Changed
- **Ningún plan despacha una lente v1**: una ruta que aún nombra `4r-review-gate` se bloquea con `legacy-review-retired`. Si un linaje `schema_version: 1` aún tiene lentes pendientes, `planLineageGate` devuelve `migrate-taxonomy-v2` cuando el linaje no ha empezado, o `retire-v1-lineage` (`v1-lens-retired`) cuando está a medias.
- **Sucesor v2 de un linaje v1**: `createSuccessor` crea un sucesor v2 a partir de un predecesor v1 terminal. El sucesor lleva un recibo `taxonomy-v1-to-v2` que forma parte de su digest. Si no recibe `selected_domains`, hereda las dimensiones del predecesor traducidas a dominios de calidad. Así se recupera un linaje a medias sin perder el vínculo con su predecesor (REQ-routing-011 y REQ-routing-012).
- **Lectura compatible durante una versión menor**: los hallazgos congelados y los estados terminales v1 siguen funcionando (`review-correction`, verify, delivery y archive). Su retirada queda como E5.7 en el roadmap, a partir de v2.92.0.
- **ADR**: enmiendas al ADR-003 (linaje de doble esquema) y al ADR-004 (`createSuccessor`).
- **Docs**: specs de agents y routing, coste por target en `target-capabilities`, catálogo de agentes en `openwiki/` (fuente de la web), y cierre de E0.3 en el roadmap.

**Verificación directa**: `node scripts/check.js` (3710 tests pasando, 0 fallos y 0 omitidos).

## [2.90.0] - 2026-10-04

### Changed
- **Una skill de stack por tecnología (E0.3, PR c)**: las skills de stack pasan de 24 a 13 (REQ-skills-021). Las 11 sub-skills de Go, Kotlin, Python, React y Spring Boot (`stack-go-testing`, `stack-kotlin-coroutines-flows`, `stack-kotlin-exposed-patterns`, `stack-kotlin-ktor-patterns`, `stack-kotlin-testing`, `stack-python-testing`, `stack-react-performance`, `stack-react-testing`, `stack-springboot-security`, `stack-springboot-tdd` y `stack-springboot-verification`) pasan a `references/` de su skill y se leen bajo demanda. Cada skill fusionada gana una regla condensada por sub-área que nombra el fichero de referencia. Antes, un proyecto Kotlin inyectaba cinco bloques de reglas de stack y agotaba el tope de cinco; ahora inyecta uno.
- **React y Spring Boot inyectan reglas**: no tenían sección de reglas, así que no aportaban *compact rules*. Ahora tienen `## Core Rules` sacadas de su propio contenido.
- **Coste de contexto**: 50 skills instaladas por target (51 en Claude) y el listado de skills baja unos 0,93 KB. Techos regenerados.
- **Docs**: specs de skills y agents, coste por target en `target-capabilities` y avance de E0.3 en el roadmap.

### Fixed
- **Enlaces rotos en React**: cuatro enlaces a reglas, skills y comandos que no existen (`rules/react/*.md`, `react-patterns`, `e2e-testing`, `/react-*`) se quitan. Un test nuevo exige que `SKILL.md` enlace cada referencia y que todo enlace relativo de una skill de stack resuelva.

**Verificación directa**: `node scripts/check.js` (3717 tests pasando, 0 fallos y 0 omitidos).

## [2.89.0] - 2026-10-04

### Added
- **Rutas `_shared` del orquestador resolubles desde la instalación (E0.4, PR b)**: el generador apunta las referencias `_shared` del orquestador a la copia instalada (REQ-generator-023). En Claude usa `${CLAUDE_SKILL_DIR}/../_shared`, que Claude Code sustituye en el cuerpo de la skill. En los demás targets deja el marcador `__OSPEC_SHARED_DIR__`. Antes, esas rutas eran relativas al proyecto del usuario, donde no existen.
- **Sustitución en los instaladores** (`scripts/configure/shared-dir.js`, REQ-install-034): cada instalador cambia el marcador por el directorio donde deja `skills/_shared/`. Es una ruta absoluta en `setup:copilot`, `setup:opencode`, `setup:cursor`, `setup:codex` y `setup:antigravity` (una por raíz, y una raíz WSL con su ruta de Windows), la de `dist/vscode` en `setup:vscode`, y una ruta relativa al repositorio en `install-target` e `install:codex -- <repo>`. Después de sincronizar, `dist/` recupera el marcador, salvo en VS Code, que carga ese árbol directamente.

### Changed
- **`install:codex -- <repo>`** instala ahora también `.agents/skills/_shared` junto a la skill del orquestador.
- **`reload:vscode`** ejecuta el instalador en vez de solo `build:vscode`, que dejaría el marcador sin sustituir.
- **Coste de contexto**: el orquestador sube 175–490 B por las rutas más largas. Techos regenerados.
- **Docs**: specs de generator, install y agents (paridad entre targets); guía de instalación y README de Codex (la instalación por repositorio estaba desfasada desde v2.88.0); coste por target en `target-capabilities`. El roadmap da E0.4 por terminado.

**Verificación directa**: `node scripts/check.js` (3715 tests pasando, 0 fallos y 0 omitidos).

## [2.88.0] - 2026-10-04

### Added
- **Router *always-on* en los 7 targets (E0.4, PR a)**: `rules/ospec-router.instructions.md` sustituye a `global-instructions/`, que ningún instalador usaba. Dice que SDD solo se usa con `/sdd-*` o con una petición explícita, y nombra el orquestador de cada host con un marcador que resuelve el generador (REQ-generator-022).
- **Bloque con marcadores** (`scripts/configure/instruction-block.js`, REQ-install-033): `setup:claude` escribe el router en `~/.claude/CLAUDE.md` y `setup:codex` en `~/.codex/AGENTS.md` o en el `AGENTS.md` del repositorio, sin tocar el texto del usuario. Reinstalar solo reemplaza el bloque, y `--no-router` lo quita.

### Changed
- **Codex carga el orquestador bajo demanda**: su `AGENTS.md` lleva solo el router y la regla de atribución, y el orquestador pasa a la skill `sdd-orchestrator`, que cargan los comandos `$sdd-*`. La instalación por repositorio deja la skill en `.agents/skills/`. El `AGENTS.md` de 63 KB que poseía la instalación anterior se sustituye por el bloque, sin borrarse.
- **Claude** saca sus reglas globales del orquestador a `global-instructions/CLAUDE.md`, que el instalador copia al bloque de `~/.claude/CLAUDE.md`. El validador estricto rechaza un `CLAUDE.md` en la raíz del plugin.
- **Regla de atribución compactada** (2,4 → 1,5 KB), con las mismas prohibiciones y el mismo patrón de comprobación.
- **Coste de contexto**: *always-on* de 2,7–3,0 KB en los 7 targets, router incluido; Codex baja de 63,0 a 2,7 KB. Techos regenerados.
- **Docs**: README (ya no pide copiar plantillas), guía de instalación, specs de generator, install y codex-target, y coste por target en `target-capabilities`. El roadmap marca el (a) de E0.4 como entregado; el (b) sigue pendiente.

**Verificación directa**: `node scripts/check.js` (3701 tests pasando, 0 fallos y 0 omitidos).

## [2.87.0] - 2026-10-04

### Added
- **Paquete opcional de extras (E0.3, PR b2)**: `issue-creation`, `comment-writer`, `gh-release-notes`, `judgment-day`, `caveman-compress` y `stack-webmcp` siguen en `skills/`, pero ningún target las instala por defecto. La lista vive en `scripts/lib/skill-extras.js`, y el generador las deja fuera salvo con `withExtras` (REQ-generator-021).
- **Flag `--with-extras`** en los 7 instaladores (`setup:<target>`), en `install-target` y en el CLI del generador (REQ-install-032). Reinstalar sin el flag desinstala las extras, porque la poda por manifiesto quita lo que la nueva build ya no trae. El instalador TUI todavía no expone el paquete.

### Changed
- **Coste de contexto**: las skills instaladas bajan de 67 a 61 por target (de 68 a 62 en Claude) y el listado de skills, de 5,8 a 4,9 KB (de 7,8 a 6,8 KB en Codex). Techos regenerados.
- **Tests de `real-repo`**: la comprobación de que se distribuyen todas las skills del source excluye ahora las del paquete opcional.
- **Docs**: README, guía de instalación, spec de skills (§1.5) y coste por target en `target-capabilities`. El roadmap marca el (b2) como entregado; E0.4 queda desbloqueado y (c) y (d) siguen pendientes.

**Verificación directa**: `node scripts/check.js` (3682 tests pasando, 0 fallos y 0 omitidos).

## [2.86.0] - 2026-10-04

### Removed
- **Diez skills que no aportaban al usuario del harness (E0.3, PR b)**, según el veredicto de la auditoría §5.1:
  - `agent-harness-construction` y `ai-first-engineering`: la segunda es un ensayo sin reglas accionables.
  - `agent-self-evaluation`: la autoevaluación 1–5 contradice la regla de que un modelo no aprueba su propio trabajo.
  - `tdd-workflow`: duplicaba y contradecía el Strict TDD del harness.
  - `token-budget-advisor`: su descripción de 816 caracteres se cargaba siempre. El hook de `PreToolUse` del mismo nombre y su dominio de spec se conservan.
  - `context7-mcp`, `backend-patterns`, `frontend-patterns`, `architecture-decision-records` (la sustituye el modelo de decisiones de la Etapa 2) y `caveman-help`.

### Changed
- **Fusiones**:
  - `caveman-commit` y `caveman-review` pasan a ser los modos `commit` y `review` de `caveman`, con un modo `help`. Sus reglas se condensan para que el bloque inyectado baje a unos 240 tokens.
  - `agent-introspection` pasa a la regla de recuperación del orquestador, que ahora describe cuándo una ejecución está descarrilada.
  - El checklist de `ai-regression-testing` pasa a `sdd-verify/references/ai-blind-spots.md`, incrustado en el agente de verify.
  - `harness-audit` pasa a ser una skill local del repositorio (`.agents/skills/`), actualizada a los 7 targets, la medición de contexto y el ámbito de reglas.
- **Lint de `Trigger:`**: ya no tiene exenciones.
- **Tope de *compact rules***: baja de 500 a 450 tokens estimados en el lint, en `token-budget.md` y en la spec de skills; el peor caso es ahora `stack-starlight`, con unos 418.
- **Coste de contexto**: el listado de skills baja de 9,5 a 5,8 KB por target (de 11,4 a 7,8 KB en Codex), y las skills instaladas pasan de 82 a 67. Techos regenerados.
- **Roadmap**: E0.3 avanza con el PR (b). El paquete opcional `--with-extras` toca los instaladores de los 7 targets y pasa a un PR propio (b2), antes de (c) stacks y (d) review v1.

**Verificación directa**: `node scripts/check.js` (3663 tests pasando, 0 fallos y 0 omitidos).

## [2.85.0] - 2026-10-04

### Fixed
- **Las *compact rules* ya no inyectan antipatrones (E0.3, PR a)**: el registro de skills trataba como reglas cualquier sección cuyo título contuviera `patterns`, `gates` o `constraints`, incluidas `## Anti-Patterns to Avoid`. Si una skill no tenía ninguna, recogía todas sus viñetas, también las de «When to Activate». Así, la sesión recibía como instrucciones frases como «Domain entities importing ORM models». Ahora el extractor:
  - solo lee encabezados de reglas explícitos: hasta tres palabras seguidas de `Rules` (`Rules`, `Critical Rules`, `Naming Rules`) o `Reglas` seguido de hasta tres palabras, y nunca uno que contenga `anti`;
  - deja `compact_rules: []` cuando no hay sección de reglas, sin recurrir a todas las viñetas.

  El cambio se aplica a la vez en JS (`scripts/lib/skill-registry.js`) y en Go (`internal/skillreg`), con un test de paridad sobre las skills publicadas.

### Changed
- **Skills**: `accessibility`, `api-design` y `hexagonal-architecture` ganan una sección `## Rules` breve, porque antes solo aportaban antipatrones. `cognitive-doc-design` renombra `Critical Patterns` a `Critical Rules`. `accessibility`, `api-design`, `design-system` y `hexagonal-architecture` declaran `Trigger:` en su descripción.
- **Lint de `Trigger:`**: un test exige `Trigger:` en la descripción de toda skill de conocimiento; las `review-*` y `stack-*` se resuelven por gate y por capacidad. Quedan exentas, de forma temporal, las diez skills que el PR (b) de E0.3 elimina o fusiona. Otro test recorre las skills publicadas y falla si alguna *compact rule* procede de un antipatrón o de una lista «When to…».
- **Spec**: `openspec/specs/skill-registry/spec.md` §5.2 y §5.3 se reescriben (encabezados de reglas, sin fallback, paridad JS/Go y `Trigger:` obligatorio).
- **Coste de contexto**: el listado de skills baja 36 bytes por target. Techos regenerados.
- **Roadmap**: E0.3 avanza con el PR (a); siguen (b) eliminaciones y fusiones, (c) stacks y (d) retirada de review v1.

**Verificación directa**: `node scripts/check.js` (3663 tests pasando, 0 fallos y 0 omitidos).

## [2.84.0] - 2026-10-04

### Changed
- **Las reglas conservan su ámbito en todos los targets (E0.2)**: Cursor, Copilot, OpenCode y Antigravity convertían todas las reglas en instrucciones *always-on* y cargaban unos 23 KB en cada petición. Ahora cada regla conserva el ámbito que declara su `applyTo` de origen:
  - **Global** (`**`): sigue siendo *always-on*. Solo la regla de atribución.
  - **Orquestador** (`agents/**`): el protocolo SDD común y el anexo de Engram se incrustan en el agente `sdd-orchestrator`, como ya hacía Claude.
  - **Por ruta**: `openspec/**` y Strict TDD se cargan con el mecanismo nativo de cada host: `globs` con `alwaysApply: false` en Cursor, `applyTo` en Copilot, y `trigger: glob` con `globs` en Antigravity, que no lee `applyTo`. Las llaves se expanden porque Copilot y Antigravity separan patrones por comas. OpenCode no tiene ámbito por ruta: la regla de OpenSpec pasa al orquestador y la de Strict TDD no se carga, como en Claude.
- **Coste de contexto**: el *always-on* baja de 22,0–25,7 KB a 2,3–2,4 KB en los cuatro targets. El orquestador sube entre 10,8 y 17,0 KB, pero solo se carga en sesiones SDD, y en ellas el total también baja (en Copilot, de 66,3 a 56,8 KB). Techos regenerados.
- **Validadores**: `validate-github-copilot` acepta cualquier `applyTo` no vacío, y `validate-cursor` exige `globs` solo en las reglas con `alwaysApply: false`.
- **Spec**: nuevo REQ-generator-020; REQ-generator-006 y el escenario de despacho de reglas se reescriben. Los ADR del 2026-07-25 sobre `to-mdc` y `AGENTS.md` quedan superados.
- **Roadmap**: E0.2 queda cerrado; el siguiente ítem es E0.3 (`curate-skill-catalog`).

### Removed
- **Fuga del flujo de release a Cursor**: Cursor instalaba el `AGENTS.md` de este repositorio como regla `agents-protocol.mdc` con `alwaysApply: true`. Así, todos los proyectos consumidores recibían en cada petición el flujo de versión, changelog y release de ospec. Ningún target distribuye ya ese fichero; el ciclo de review acotado que también llevaba ya estaba en `sdd-common`.

**Verificación directa**: `node scripts/check.js` (3659 tests pasando, 0 fallos y 0 omitidos).

## [2.83.0] - 2026-10-03

### Fixed
- **Los agentes de trabajo funcionan en proyectos consumidores (E0.1)**: los agentes de fase SDD y los revisores leían `skills/<skill>/SKILL.md` y `skills/_shared/*.md` con rutas relativas que solo existen en este repositorio. En un proyecto consumidor trabajaban sin su skill y sin los módulos condicionales; por ejemplo, el de Strict TDD nunca llegaba a cargarse. Ahora el generador incrusta en cada agente, en los 7 targets, una sección `## Embedded references` con:
  - su skill, sin frontmatter ni el aviso dirigido al orquestador;
  - los módulos de su propio directorio que la skill nombra (`strict-tdd`, `focused-tdd`, `strict-tdd-verify`, `references/*`);
  - los ficheros `_shared` que nombran el agente, su skill o esos módulos.

  Cada referencia pasa a ser un marcador `«id»` de su sección. Las referencias entre ficheros `_shared` no se siguen, y lo que no se incrusta se señala como parte de las skills instaladas de ospec, nunca como una ruta del proyecto. El orquestador no cambia.

### Changed
- **Coste de contexto**: los revisores no cambian y la mayoría de las fases bajan unos 0,4 KB. Suben los agentes cuyos módulos condicionales antes se perdían: `sdd-apply` (73,0 → 93,3 KB), `sdd-verify` (48,0 → 68,1 KB), `sdd-init` (+5,3 KB), `sdd-document` (+4,5 KB) y `sdd-foundation` (+2,5 KB). La medición de E0.0 cuenta lo incrustado como bytes del agente y no sigue lo que nombra. Los techos se regeneran con esa justificación.
- **Spec**: nuevo REQ-generator-019 en `openspec/specs/generator/spec.md`. Los agentes fuente dejan de hablar de «in-repository skill file», y dos ejemplos de documentación ya no usan rutas de skills reales de ospec.
- **Roadmap**: E0.1 queda cerrado; el siguiente ítem es E0.2 (`scope-always-on-instructions`).

**Verificación directa**: `node scripts/check.js` (3652 tests pasando, 0 fallos y 0 omitidos).

## [2.82.0] - 2026-10-03

### Added
- **Línea base de contexto por target (E0.0)**: `node scripts/measure-context-baseline.js` genera los 7 targets en memoria y mide qué carga cada host antes de trabajar: instrucciones *always-on*, orquestador, skills instaladas y listadas, y lo que lee cada agente (el agente y las skills y ficheros `_shared` que nombra). Reproduce las cifras de la auditoría del 2026-10-03:
  - Codex carga 62,6 KB en cada sesión.
  - Cursor carga 25,7 KB en cada petición; Copilot y Antigravity, 22,7 KB; OpenCode, 22,0 KB, y VS Code, 2,4 KB.
  - Las fases SDD leen entre 33 y 73 KB, y los revisores, unos 37 KB.
- **Techos de contexto en CI**: `scripts/fixtures/context-baseline.json` guarda cada valor como techo, y `scripts/lib/context-baseline.test.js` falla si alguno sube o si aparece un target o un agente sin techo. `--update` los regenera cuando un cambio reduce contexto, o cuando lo aumenta con una justificación en el PR. Los bytes se normalizan a LF para que Windows y CI midan lo mismo.

### Changed
- **Roadmap**: E0.0 queda cerrado y el siguiente ítem es E0.1 (`fix-phase-agent-skill-loading`). El método y la línea base están en `docs/target-capabilities.md` §7.

**Verificación directa**: `node scripts/check.js` (3642 tests pasando, 0 fallos y 0 omitidos).

## [2.81.3] - 2026-10-03

### Changed
- **Roadmap reorientado a IDD (desarrollo guiado por impacto)**: SDD deja de ser el flujo por defecto y queda como modo opcional para quien lo pida. El nuevo flujo por defecto deriva obligaciones de señales de impacto (contrato público, datos persistentes, frontera de seguridad, componente con ADR o atributo de calidad, bug o Strict TDD), las comprueba con el CLI `ospec` (`next`, `check` y `close`) y solo pregunta ante una intención ambigua, un ADR enmendado o contradicho, o una operación irreversible. Un cambio trivial no crea documentos, y uno de contrato público abre un documento vivo con su contrato y su test.
  - Las recetas Direct, Repair y Critical y la clasificación por impacto pasan a ser señales y obligaciones de la Etapa 1.
  - El cambio de default (E1.6) depende de un bench contra el modo SDD (E4.1).
  - Quedan aparcados la migración del orquestador SDD al CLI y el troceado de su protocolo.
  - Change Program pasa a la plataforma por demanda.
- **Nuevo hallazgo en E0.2**: Cursor instala el `AGENTS.md` de este repositorio, con su flujo de release, como regla `alwaysApply` en los proyectos consumidores.
- **Ejecución del roadmap**: hasta E1.6, los ítems se entregan como cambios directos con test primero y spec actualizada en el mismo PR, sin `/sdd-new`. `AGENTS.md` dispara el flujo de release también al cerrar un cambio directo.

**Verificación directa**: `node scripts/check.js` (3634 tests pasando, 0 fallos y 0 omitidos).

## [2.81.2] - 2026-10-03

### Changed
- **`docs/architecture/` queda solo para la arquitectura vigente**: la arquitectura objetivo del kernel, la revisión crítica de Adaptive, la proporcionalidad, la foundation holística y la investigación (P0–P27, *proof-carrying* y Change Program) pasan a `docs/roadmaps/archive/2026-10-03-arquitectura/`, con un aviso de archivo y un índice que indica qué ítem del roadmap usa cada documento como insumo (E1.5, E2.3, E4.x y E6.2). Las fases SDD leen `docs/architecture/` como la arquitectura del proyecto, y estos documentos describían una arquitectura objetivo en buena parte sin implementar o aparcada. La carpeta conserva un README que remite a la referencia técnica actual hasta que E2.6 genere el baseline y los ADR de ospec.
- **`docs/README.md` vuelve a ser el índice de la documentación**: desde el 2026-07-18 contenía por error una copia de la arquitectura en el corte v2.29.1, y los README de la raíz lo enlazan como índice.
- **El release ya no exige un corte documental en la arquitectura**: `manifest-sync` solo cruza la versión con el roadmap. El checker `k1-maturity` y los tests de documentación de K2.1, K2a y K3 leen ahora el documento archivado; E1.5 decide si se retiran.

### Removed
- `docs/codex.md`: copia del roadmap en el corte v2.29.1, sustituida desde entonces por el roadmap único.

**Verificación directa**: `node scripts/check.js` (3634 tests pasando, 0 fallos y 0 omitidos).

## [2.81.1] - 2026-10-03

### Added
- **Auditoría del harness y comparación con gentle-ai** (`docs/analysis/2026-10-03-auditoria-harness-y-gentle-ai.md`): en proyectos consumidores, los agentes de fase no cargan su skill porque la leen con ruta relativa (en una sesión real, `sdd-apply` y `sdd-clarify` trabajaron sin ella). Mide el coste fijo de instrucciones por target (Codex carga 63 KB en cada sesión; Cursor, Copilot, OpenCode y Antigravity, 23–26 KB en cada petición) y detecta que el extractor de *compact rules* inyecta antipatrones como reglas. Incluye el veredicto sobre las 82 skills (46 por defecto, 6 opcionales y 30 fuera o fusionadas) y la comparación con gentle-ai v4.

### Changed
- **Roadmap único**: `docs/roadmaps/harness-evolution.md` pasa a tener seis etapas con objetivos medibles y una tabla de estado que se ejecuta change a change con el propio ospec-workflow: base sana, CLI `ospec` (status, next, record y doctor), foundation de verdad (mapa de conocimiento, motor de huecos de decisión y ADRs de arquitectura agnósticos), conocimiento vivo en cada change, ejecución proporcional y demostración frente a gentle-ai. El roadmap K1–K12 se archiva en `docs/roadmaps/archive/2026-10-03-harness-evolution-kernel.md`. K9 general, K10-delivery, K11, K12 longitudinal, CX2–CX6 y Dream-RSI quedan aparcados con criterio de reapertura, y la receta Repair sigue como E4.2.
- **Instrucciones recomendadas**: `global-instructions/CLAUDE.md` y `AGENTS.md` pasan a ser un router fino que explica cuándo usar ospec, cómo entrar en cada host y qué reglas valen siempre. Todavía no se instalan; los cablea E0.4.
- **Gobernanza documental**: el README de roadmaps, `docs/CLAUDE.md` y las cabeceras de la arquitectura señalan el roadmap único como fuente de dirección y prioridad.

**Verificación directa**: `node scripts/check.js` (3634 tests pasando, 0 fallos y 0 omitidos).

## [2.81.0] - 2026-10-03

### Added
- **Engram automático en todos los targets**: `setup:claude`, `setup:codex`, `setup:antigravity`, `setup:opencode`, `setup:cursor`, `setup:vscode` y `setup:copilot` configuran Engram al terminar la instalación global si el binario `engram` está en el PATH. Cada uno ejecuta el `engram setup <agente>` oficial (`claude-code`, `codex`, `antigravity-cli`, `opencode`, `cursor`, `vscode-copilot`) y vuelve a comprobar que el host tenga el servidor MCP y su pieza de protocolo. Copilot CLI, que no tiene setup oficial, recibe una entrada `engram mcp --tools=agent` en `~/.copilot/mcp-config.json` que conserva los demás servidores. `--no-engram` omite el paso. Sin el binario, el instalador solo muestra cómo instalarlo. El paso es idempotente, nunca cambia el código de salida y no se ejecuta con `--dry-run`, `--dest` ni un repo de destino.
- **Modo seguro de Windows medido (Claude Code)**: tras configurar Engram, una sonda de fork en Git Bash (dirname/date/jq/curl ×3, presupuesto de 1,5 s) decide si se puede desactivar el modo seguro del hook oficial, que apaga la captura de prompts y los recordatorios de guardado. Si la sonda es rápida, escribe `ENGRAM_CLAUDE_WINDOWS_BASH_SAFE_MODE=0` en `~/.claude/settings.json`. Nunca pisa un valor que ya hayas puesto.

### Changed
- **Addendum de memoria neutral y en todos los targets**: `rules/engram-session-memory.instructions.md` deja de ser exclusivo de Claude y se elimina su `drop` en los perfiles. Si el host no inyectó contexto de Engram al arrancar, permite un único `mem_context` como pista. El output generado sigue sin registrar Engram en ningún MCP ni hook.
- **`--with-engram` queda obsoleto**: se acepta sin efecto, porque el paso ahora es automático. La TUI del instalador también lo ejecuta.
- **ADR-20261003-001** reemplaza los ADR-20261002-001 (addendum solo para Claude) y ADR-20261002-002 (opt-in). Se actualizan REQ-install-028..030, se añade REQ-install-031 y se actualizan REQ-session-memory-008/009 y REQ-generator-018.

**Verificación directa**: `node scripts/check.js` (3634 tests pasando, 0 fallos y 0 omitidos).

## [2.80.0] - 2026-10-03

### Added
- **Calibración del piloto Adaptive Repair con agentes reales (K12)**: `scripts/lib/k12/worker-record.js` graba la salida de un agente por brazo y tarea (parche, artefactos por fase y consumo de tokens, herramientas y duración) y el ejecutor del piloto la reproduce (`workerRecord`) por el mismo pipeline determinista con checks ocultos. `k12-campaign.js --paired --worker-record <registro>` juzga una reproducción por brazo contra `calibration-margins.json`. El protocolo exacto de los prompts está versionado en `scripts/evals/__fixtures__/k12/calibration/PROTOCOL.md`.
- **Dos registros con `claude-haiku-4-5-20251001` sobre las 7 tareas de behavior-repair**: el primero da `revise` bajo los márgenes del piloto aunque el Repair fue mejor (7/7 frente a 6/7); el confirmatorio, juzgado con `k12-calibration-margins-1` declarados antes de correrlo, da `continue`: 7/7 en ambos brazos, −3,9 % de tokens, −1,7 llamadas a herramientas y −21 % de duración por tarea, con intervalos por debajo de cero.

### Changed
- **Checkpoint del piloto**: con un worker grabado, un fallo del brazo de control es un resultado del worker y no un defecto del harness; se lista en `control_failures` sin pedir revisión. El holdout acepta cohortes acotadas a algunos estratos.

**Verificación directa**: `node scripts/check.js` (3620 tests pasando, 0 fallos y 0 omitidos).

## [2.79.0] - 2026-10-03

### Added
- **Piloto Adaptive Repair — P4, checkpoint (K12)**: `scripts/lib/k12/pilot-checkpoint.js` convierte la campaña emparejada en una decisión `continue | revise | reject`. Los vetos son fijos y no elegibles: obligación `must` omitida, fallo escapado, defecto que solo escapa en Adaptive y regresión de aprobación. Solo lo elegible se predeclara en `scripts/evals/__fixtures__/k12/pilot-margins.json` (`k12-pilot-margins-1`): no inferioridad (límite inferior del IC95 ≥ 0), mejora práctica (Δ fases ≤ −1) y una familia holdout por estrato. Los márgenes se cargan antes de cualquier corrida y su digest queda en el resultado; `k12-campaign.js --paired` imprime el checkpoint y sale con 1 ante `reject`.
- **Informe del piloto** (`docs/analysis/2026-10-03-adaptive-pilot-report.md`): con 3 repeticiones (66 pares) ambos brazos detectan 216/216 defectos, no se activa ningún veto, se cumplen todos los márgenes (también en el holdout) y el checkpoint es `continue`. El informe declara lo que no demuestra (calidad con agentes reales, coste, holdout limpio, destino de la traza) y recomienda una calibración mínima con agentes antes de K9.

**Verificación directa**: `node scripts/check.js` (3613 tests pasando, 0 fallos y 0 omitidos).

## [2.78.0] - 2026-10-03

### Added
- **Piloto Adaptive Repair — P3, cohorte del piloto (K12)**: la cohorte pasa de 11 a 22 tareas (catálogo `k12-pilot-1`: 6 local-reversible, 7 behavior-repair, 5 multi-module y 4 adversarial), todas con `pilot.json` v2. Las 18 tareas de reparación siembran los cuatro defectos y las 4 adversariales combinan dos fallos inyectados. Sin migraciones ni efectos externos.
- **Multi-module en el piloto**: su ruta de control es `bugfix` y la receta Repair lo trata como un solo nodo cuyas rutas permitidas cubren todos los módulos tocados. El `wrong-patch` es una propagación parcial o un contrato entre módulos desalineado.
- **`validatePilotCohortShape`** (`scripts/lib/k12/cohort.js`): exige 20–24 tareas, peso en local-reversible y behavior-repair y dos familias de holdout por estrato; `k12-campaign.js --paired` la aplica. Resultado: 22 tareas comparables, 0 excluidas, defectos 72/72 por repetición en ambos brazos, fallos contenidos 2/2 en cada adversarial y 0 regresiones.

**Verificación directa**: `node scripts/check.js` (3607 tests pasando, 0 fallos y 0 omitidos).

## [2.77.1] - 2026-10-03

### Fixed
- **Web de documentación en el idioma de la wiki (`sdd-document`, Option D)**: la plantilla Starlight ignoraba el `doc_language` persistido en `openwiki/.last-update.json`, así que la interfaz y `<html lang>` salían en inglés y los grupos del sidebar mostraban el nombre de la carpeta. Ahora `astro.config.mjs` declara `doc_language` como locale `root` monolingüe (inglés si falta) y `sync-openwiki.mjs` etiqueta los grupos con el nuevo campo opcional `section_labels`. La web de este repositorio pasa a español: interfaz, 15 grupos del sidebar, descripción y `og:site_name`.

**Verificación directa**: `node scripts/check.js` (3603 tests pasando, 0 fallos y 0 omitidos).

## [2.77.0] - 2026-10-03

### Added
- **Piloto Adaptive Repair — P2c, fallos inyectados en adversarial (K12)**: los fixtures `adversarial-interrupted-recovery` y `adversarial-authority-boundary` reciben `pilot.json` v2 con `faults`. El pipeline limpio se ejecuta como efecto de `complete` en un lifecycle de un nodo a través del harness K2 público, y cada fallo exige su único comportamiento correcto: `interrupt-pre-effect` se reanuda y ejecuta el efecto exactamente una vez; `interrupt-mid-executor` falla cerrado con `reconciliation-required` sin reejecutar; `bypass-without-permit` queda bloqueado como `unauthorized` y el reintento autorizado completa. Un fallo no contenido falla la corrida. Control negativo: un host que pierde el journal al reanudar reejecuta el efecto ambiguo y se detecta.
- **Cohorte semilla del piloto**: 8 tareas comparables (multi-module sigue excluido), fallos contenidos 2/2 por tarea adversarial en ambos brazos y 0 regresiones. Los recuentos van en `measurements.interruptions` y `measurements.recoveries`, sin cambios de contrato.

**Verificación directa**: `node scripts/check.js` (3600 tests pasando, 0 fallos y 0 omitidos).

## [2.76.0] - 2026-10-03

### Added
- **Piloto Adaptive Repair — P2b, defectos sembrados (K12)**: `pilot.json` v2 declara un check real por rol de evidencia (acceptance, invariants, contract, negative), ejecutado en `node:vm` sobre los archivos del candidate; solo los checks que pasan producen evidencia y receipt del runner K6b, y los de aceptación deben fallar sobre la base (reproducción, etapa compartida por ambos brazos). Cada fixture siembra cuatro variantes con etapa de detección declarada: `scope-drift` (integración K4b), `complacent-test` (reproducción), `wrong-patch` (verify) y `stale-receipt` (verify, por binding del receipt). Las variantes aceptadas cuentan como escapadas; las rechazadas en otra etapa fallan la corrida como fixture mal atribuido.
- **`outcome.defects` en `RunManifest v1`** (aditivo, autoconsistente: `seeded`, `detected`, `escaped`) y recuentos por brazo en `summarizePairedCohort`, con los escapes exclusivos del brazo Adaptive como `defect_regressions` (candidatos a veto). Con la cohorte semilla ambos brazos detectan 24/24 por repetición y no hay regresiones de defectos.

### Changed
- **Análisis del piloto**: la recuperación en adversarial pasa a un slice propio (P2c). Límite conocido registrado: K6b juzga por presencia de evidencia que pasa por rol.

**Verificación directa**: `node scripts/check.js` (3598 tests pasando, 0 fallos y 0 omitidos).

## [2.75.0] - 2026-10-03

### Added
- **Piloto Adaptive Repair — P2a, ejecutor determinista (K12)**: `scripts/lib/k12/pilot-executor.js` ejecuta los dos brazos del piloto sobre la misma salida guionizada del worker (`pilot.json` por fixture: archivos base, un parche, obligaciones declaradas y rutas permitidas) en los estratos local-reversible y behavior-repair. Cada brazo compila su Execution Graph bajo su propio `PolicySnapshot` y pasa el parche por las etapas puras de K4b (`integrateWorkResultPatches` y Candidate K3), el verifier K6b y el oracle K12, ahora aplicado (`oracle.applied: true`). Los planes de control salen de la tabla de routing viva (`lite` y `bugfix`); la receta Repair comprime fases y hereda todos los gates de control. Los demás estratos quedan como excluidos. No mide aislamiento del worker (K6a) ni calidad de modelo, y el número de fases es una hipótesis declarada.
- **`node scripts/k12-campaign.js --paired`**: corre la campaña emparejada y resume con `summarizePairedCohort` (sale con 1 si no es `usable-comparison`). Con la cohorte semilla da 6 tareas comparables, 0 regresiones y −2 fases por tarea.

### Changed
- **Análisis del piloto**: el brazo Repair usa las etapas puras de K4b en lugar de `orchestrateRepairShadow` (exige aislamiento K6a real y prohíbe ejecutores inyectados); P2 se divide en P2a y P2b.

**Verificación directa**: `node scripts/check.js` (3589 tests pasando, 0 fallos y 0 omitidos).

## [2.74.0] - 2026-10-02

### Added
- **Piloto Adaptive fijo — P1, brazo y comparación emparejada (K12)**: `RunManifest v1` admite de forma aditiva el brazo `adaptive-repair-v1` además del control `fixed` (REQ-kernel-contract-schemas-033 modificado). `planPairedRuns` (`scripts/lib/k12/runner.js`) planifica ambos brazos por repetición de cada fixture con el mismo orden de tareas que `planRuns`, orden de brazos sembrado y worktree/cache aislados por brazo. `summarizePairedCohort` reporta por tarea la tasa de pase y los deltas de medición (adaptive − fixed), la media, la desviación y el intervalo t del 95 % sobre tareas (la tarea es la unidad estadística), las regresiones como candidatas a veto, los pares excluidos y los oráculos no aplicados; solo da `usable-comparison` cuando todos los pares están completos. `summarizeCohort` rechaza mezclar políticas. No existe aún ejecutor del brazo Adaptive (P2), nada se promueve y `fixed` sigue siendo el default.
- **Análisis de alcance del piloto** (`docs/analysis/2026-10-02-adaptive-pilot-scoping.md`): receta Repair en el host de referencia, ejecutor determinista primero, huecos de K12 y slices P1–P4.

### Changed
- **Roadmap**: historial con el análisis y la entrega de P1; versión de referencia y corte documental en v2.74.0.

**Verificación directa**: `node scripts/check.js` (3581 tests pasando, 0 fallos y 0 omitidos).

## [2.73.1] - 2026-10-02

### Fixed
- **Emisión de attestation K8 (revisión trust de v2.73.0)**:
  - **Reconciliación por replay**: un outcome registrado o desconocido en la operación ligada se evalúa después del check de replay exacto. Así, re-presentar los mismos inputs tras una interrupción converge aunque el llamador haya marcado la operación como `unknown`. Sin replay sigue devolviendo `EVALUATION_OPERATION_BINDING_RECONCILIATION_REQUIRED` sin consumir el permit, y un target sin identidad resoluble se rechaza antes de leer el store.
  - **Cierre único por subject**: un segundo permit ya no puede re-emitir una attestation emitida (`EVALUATION_ISSUANCE_ALREADY_ISSUED`) ni cerrar otra vez una operación de evaluación ya cerrada en el mismo subject (`EVALUATION_OPERATION_ALREADY_CLOSED`).
  - **Alcance del binding aclarado**: el binding operativo y su registro son snapshots aportados por el llamador; el resolver solo prueba su consistencia mutua, y la identidad la autentica el digest de argumentos del permit. La emisión no verifica la operación contra un registro vivo; quien mintea el permit debe leer ese registro de una fuente confiable. Corrige la descripción de v2.73.0, que lo presentaba como una resolución contra el registro de la operación.

### Changed
- **Specs reconciliadas**: `kernel-contract-schemas` documenta el schema de attestation (REQ-032) y `run-manifest/v1` de K12 (REQ-033), y REQ-026 recoge las relaciones `reviewed-by`/`invalidates` y los nodos de review de K7. Nuevo dominio baseline `evaluation-attestation` (REQ-001 a REQ-018) para el constructor/validador y el issuer de K8.

**Verificación directa**: `node scripts/check.js` (3575 tests pasando, 0 fallos y 0 omitidos).

## [2.73.0] - 2026-10-02

### Added
- **K8 — binding operativo en la emisión de attestation**: `issueCandidateEvaluationAttestation` (`scripts/lib/evaluation-attestation/issuer.js`) exige un `operationBinding` explícito `{changePath, phase, expectedRevision, operation}` y lo resuelve con `resolveOperationIdentityBinding` contra el registro de la operación de evaluación. Solo una coincidencia exacta `bound` admite la emisión: un binding ausente (incluido el passthrough legacy de candidato único) devuelve `EVALUATION_OPERATION_BINDING_ABSENT`; uno malformado, stale o ajeno, o con snapshots contradictorios, devuelve `EVALUATION_OPERATION_BINDING_REJECTED`; y un resultado ya registrado o desconocido devuelve `EVALUATION_OPERATION_BINDING_RECONCILIATION_REQUIRED`. Todos se rechazan antes de leer o escribir el store y sin consumir el permit. La identidad ligada entra en los argumentos del permit (un permit emitido para otra operación o revisión no autoriza la emisión) y queda registrada en el journal y en el resultado. Cierra el done criterion K8 de bindings ausentes, stale o ajenos; `approved-for-evaluation` sigue sin ser pase de delivery.

### Changed
- **Roadmap reconciliado**: el mínimo K8 pasa a `done` (ODD, v2.71.0 + v2.73.0) y el siguiente slice elegible es el piloto Adaptive fijo en ámbito aislado. Versión de referencia y corte documental en v2.73.0.

**Verificación directa**: `node scripts/check.js` (3570 tests pasando, 0 fallos y 0 omitidos).

## [2.72.1] - 2026-10-02

### Fixed
- **`setup:claude --with-engram` dejaba Engram sin herramientas `mem_*`**: el plugin upstream `engram@engram` solo trae hooks y skill, no servidor MCP. El servidor MCP de usuario `engram` (las herramientas `mem_*`) solo lo registra `engram setup claude-code`, y la v2.72.0 se lo saltaba porque daba el plugin registrado por configurado. Ahora "configurado" exige plugin **y** servidor MCP. Con opt-in, la única acción mutante es el idempotente `engram setup claude-code`, que agrega la pieza que falte. Después se comprueba `claude mcp list` y, si el servidor sigue ausente, se avisa con el arreglo manual. Validado de punta a punta con el CLI real: sin el MCP lo vuelve a registrar y la segunda corrida informa "already configured".
- **Detección más estricta y menos sondas**: los regex del plugin y del MCP se anclan a `engram@engram` y a `engram:`, así que nombres parecidos (`my-engram`, `engram@fork`) ya no cuentan como registrados. Se elimina la sonda del marketplace, porque ahora la gestiona el setup upstream, y desaparece la cascada de acciones encadenadas ante un fallo parcial.
- REQ-install-030 corregido (plugin Y MCP, nuevo escenario *Plugin registered without MCP server*); enmienda en ADR-002; READMEs actualizados.

**Verificación directa**: `node scripts/check.js` (3564 tests pasando, 0 fallos y 0 omitidos).

## [2.72.0] - 2026-10-02

### Added
- **Memoria de sesión con Engram, opcional y no autoritativa (target Claude Code)**: addendum `rules/engram-session-memory.instructions.md` confinado a Claude (los perfiles copilot, vscode, opencode, codex, cursor y antigravity lo descartan vía `drop`, y `collectRules` respeta esa lista). Protocolo slim: recall después de enrutar por `state.yaml`, punteros de fase SDD con `topic_key`, guardado solo desde el orquestador y recall tratado como dato no confiable. OpenSpec y el Authority Store siguen siendo la fuente de verdad; la caída o ausencia de Engram nunca bloquea.
- **Detección e instalación opt-in en `setup:claude`**: nuevo `scripts/configure/engram-setup.js` fail-open. Detecta binario, plugin, marketplace y servidor MCP, e imprime guía (incluido el requisito bash/jq/curl). Con `--with-engram` registra el marketplace y el plugin upstream `engram@engram`, y solo recurre a `engram setup claude-code` si el plugin no queda registrado.
- **Spec `session-memory`** (10 requisitos) y deltas de `install` (REQ-install-028/029/030), `generator` (REQ-generator-018) y `skills` (REQ-skills-020). ADR-001..003 promovidos a `docs/adr/`.

### Changed
- **Deriva documental corregida**: `project-memory` (Purpose y fila *Session memory*), `sdd-phase-common` y `docs/comparacion-arneses.md` ya no afirman una integración con Engram que no existía; describen un adaptador opcional definido por `session-memory`.

Ciclo SDD completo (ruta standard, high-risk): verificación PASS WITH WARNINGS (W1–W4 resueltos) y quality review con cuatro dominios, 0 BLOCKER/CRITICAL; los 3 WARNING y 6 SUGGESTION advisory (pin de la fuente upstream, cortocircuito ante fallo parcial, regex de detección, coste de las sondas y alcance del contract test) quedan como follow-up. Archivado en `openspec/changes/archive/2026-10-02-add-engram-session-memory/`.

**Verificación directa**: `node scripts/check.js` (3561 tests pasando, 0 fallos y 0 omitidos).

## [2.71.0] - 2026-10-01

### Added
- **K8 mínimo — CandidateEvaluationAttestation (PRs #209/#211)**: schema `candidate-evaluation-attestation/v1` con 8 fixtures, registro en manifest/claims/k1-compat y entradas sucesoras del scope-guard; constructor/validador puro (`scripts/lib/evaluation-attestation/index.js`) con 16 reason codes `EVALUATION_*` y drift de candidato fail-closed (exige binding K7 fresco: sin binding no se emite attestation aprobatoria); issuer por CAS (`issuer.js`) con OperationPermit de un solo uso (replay converge, stale pierde, reconciliación bidireccional) que distingue `EVALUATION_ISSUANCE_COMMIT_FAILED` de `EVALUATION_CAS_CONFLICT`. `approved-for-evaluation` nunca es pase de delivery; K7 no-model sigue fail-closed (`K7_NO_MODEL_DEFERRED` → cero attestation). Library-only, sin CLI. Roadmap K8 reconciliado. (#210 quedó cerrado automáticamente por GitHub al fusionarse la rama base; su contenido llegó íntegro vía #211.)

### Changed
- **Rename de la familia OpenAI en el catálogo (PR #212)**: slugs Codex `gpt-5.6-sol/terra/luna` → `gpt-6.1-sol`/`gpt-6-terra`/`gpt-6-luna` y labels de copilot `GPT-5.6 Sol/Terra/Luna` → `gpt-6 Sol/Terra/Luna`, alineado con la identidad vigente de los modelos. Contrato del test sdd-document, tabla de tiers de `docs/model-routing.md` y escenarios de spec de generator actualizados en consecuencia. Advisories no bloqueantes de la revisión nativa registrados en #213.

### Fixed
- **Quoting de la raíz del plugin en hooks (PR #214)**: los cinco comandos de `hooks/hooks.json` envuelven la ruta del launcher en comillas dobles, la forma que exige el validador oficial del CLI de Claude (con `--strict` los warnings de variable sin quotear son errores); restaura el E2E contra el CLI real.

**Verificación directa**: `node scripts/check.js` (3520 tests pasando, 0 fallos y 0 omitidos).

## [2.70.0] - 2026-09-28

### Added
- **K12 focal — contrato de medición (PR #204)**: oracle independiente de obligaciones por fixture (`scripts/lib/k12/obligation-oracle.js`), `RunManifest v1` (`schemas/kernel/run-manifest/`), cohorte semilla de 11 tareas estratificadas en 4 estratos con 4 familias de holdout y runner determinista con repeticiones de orden sembrado, aislamiento por corrida y reporte de varianza agrupado por tarea. Solo instrumentación: `fixed` sigue siendo la única política medida.
- **K12 campaña operativa de machinery (PR #205)**: ejecutor determinista que materializa cada tarea en worktree aislado, la pasa por el harness K2, inyecta `interrupt+recover` en el estrato adversarial dentro de budgets y registra `measurements`/`oracle` en el outcome del RunManifest. CLI `scripts/k12-campaign.js` que emite el baseline de machinery de la cohorte semilla (11 tareas × 3 = 33 runs, verdict `usable-baseline`; oracle honesto `applied:false` en fixtures sin contrato observado).
- **K7 mínimo — review authority (PR #206)**: binding validado `scripts/lib/review-k7-binding.js` con gramática tipada cerrada `k7/v1:` sobre `PolicySnapshot.effective_rules` (fail-closed ante reglas desconocidas/duplicadas/conflictivas), denominador residual por obligaciones MUST del contrato y validación integral de Candidate v2 canónico, PolicySnapshot, Execution Graph + SourceSnapshot, verificación K6b PASS y equivalencia exacta evidencia presentada/replay. Lineage `schema_version: 3` gobernado por el reducer (`startK7ReviewLineage` exige replay completo de la emisión y contexto de diff canónico re-derivado; freeze/finalize-aprobatorio/successor requieren `K7_ISSUANCE_REPLAY_REQUIRED`; presupuesto global de slices; drift de policy/binding invalida con successor explícito); gate presentation-only. Proyección derivada de relaciones de review en el Assurance Graph (`reviewed-by`/`invalidates` solo desde estados v3 autenticados; receipt inmutable de successor dirige la invalidación; evidencia independiente K6b conserva digests; K8 sigue rechazado). Protocolo v3 documentado en `skills/_shared/gate-4r-review.md` con paridad selective-4r. Signals/no-model quedan fail-closed como deuda explícita hasta un oráculo residual independiente; K7 permanece `pending/next-eligible` hasta aceptación. Cambio Orgánico (ODD), verificación adversarial independiente por slice.

**Verificación directa**: `node scripts/check.js` (3493 tests pasando, 0 fallos y 0 omitidos).

## [2.69.0] - 2026-09-26

### Added
- **Adaptador aislado de identidad de operación**: `scripts/lib/operation-identity-binding.js` compara un binding explícito `{changePath, phase, expectedRevision, operation}` contra snapshots objetivo y registros candidatos del mismo `changePath`, y devuelve señales tipadas (`bound`, `rejected`, `reconciliation_required`) sin autorizar ni invocar efectos. Contradicciones entre snapshots, ambigüedad de candidatos y outcomes registrados fallan cerrados sin asignación por recencia; un `verify` exitoso no equivale a PASS funcional. Deliberadamente sin wiring a runtime: no es un canal confiable de despacho.

### Fixed
- **Atribución ambigua en `SubagentStop`**: Node (proyección de envelope, coste de fase y medición CX0) y Go (proyección y coste de fase) ya no eligen el change activo más reciente por `mtime` cuando hay varios activos: omiten toda escritura con alcance de change y registran exactamente un evento global de auditoría (`reason: ambiguous-active-change`, `authentication: none`, sin nombre de change adivinado). Con exactamente un change activo el flujo legacy y la salida del hook no cambian. Paridad Node/Go con fixture dedicado de dos changes activos.

Cambio Orgánico (ODD, dos PRs apilados #201/#202); `size:exception` aceptado por el mantenedor para el slice indivisible del adaptador (658 líneas código+tests).

**Verificación directa**: `node scripts/check.js` (3446 tests pasando, 0 fallos y 0 omitidos).

## [2.68.4] - 2026-09-26

### Fixed
- **Hijo directo de `route.actual_route`**: el dispatcher y `validate-phase` comparten `parsePersistedRouteSection`. Solo cuenta un `actual_route` hijo directo del bloque `route:` de columna 0. Un `actual_route` más profundo no lo sustituye. Contrato: `REQ-routing-016`.
- **Ausencia sin relleno externo**: si ese bloque existe y el hijo directo falta, el dispatch responde `missing_actual_route` antes de `--persisted-route` o el contexto. La ausencia del bloque `route:` entero sigue siendo la excepción legacy.

**Verificación directa**: `node scripts/check.js` (3412 tests pasando, 0 fallos y 0 omitidos).

## [2.68.3] - 2026-09-26

### Fixed
- **Pre-delegación con ruta real del plugin**: el comando del orquestador invoca `validate-phase` desde la raíz de instalación del plugin y pasa `--workspace` del proyecto. La aceptación es un proceso Node cuyo directorio de trabajo no contiene el script. Contrato: `REQ-agents-030`, `REQ-install-027`.
- **Autoridad de `route.actual_route`**: `--persisted-route` no sustituye un valor persistido distinto; si discrepan, el dispatch falla cerrado. `extractStateRouteInfo` y `readPersistedRouteInfo` reconocen solo el bloque `route:` de columna 0. Un `route:` anidado no rellena `actual_route` ni evita `missing_actual_route`. Cierra `F-66efe8421b856f34`. Contrato: `REQ-routing-016`.
- **Replay v2.67 acotado**: el noop histórico acepta solo el orden de claves congelado (`schema_version` primero y formas anidadas ya fijadas). Un sobre que empieza por `status` no es un noop prometido. No se conservan los bytes JSON originales. Contrato: `REQ-lifecycle-kernel-029`.

Ciclo SDD completo (ruta standard): deltas de `agents`, `install`, `routing` y `lifecycle-kernel-runtime`; verificación PASS; quality review con dos hallazgos CRITICAL del mismo hueco de parser, resueltos en un slice. Archivado en `openspec/changes/archive/2026-09-26-close-pp2-cx1-preflight-guarantees/`.

## [2.68.2] - 2026-09-26

### Fixed
- **Replay v2.67 anidado en Node y Go**: `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` y `internal/hooks/phase-completion-reducer.go` tratan un `last_payload_hash` de `JSON.stringify` (v2.67.0–v2.67.3), incluido `question_gate` con objetos anidados, como noop sin subir `revision`. Las escrituras nuevas siguen guardando solo el hash canónico. Contrato: `REQ-lifecycle-kernel-029`.
- **Raíces separadas en `validate-phase`**: `scripts/validate-phase.js` y `scripts/configure/validate-phase.js` distinguen la raíz del plugin y el workspace del proyecto (`--workspace`, `OSPEC_PROJECT_ROOT` o el directorio de trabajo). Queda cubierto para Claude y Cursor, y el layout colapsado (openspec solo bajo el plugin) falla cerrado. Contrato: `REQ-install-027`.
- **`route.actual_route` en changes nuevos**: `scripts/lib/route-dispatcher.js` y `scripts/route-dispatch-run.js` fallan cerrados si existe `route:` y falta `actual_route`. La ausencia del bloque `route:` completo sigue siendo la excepción legacy, con test. Contrato: `REQ-routing-016`.
- **BOM en el launcher de hooks**: `scripts/hooks/ospec-hooks-launch.js` elimina `U+FEFF` del stdin antes de detectar el host. Un `preToolUse` de Cursor servido desde el plugin de Claude ya no responde `permission: "ask"`.
- **Aislamiento del hook de commit**: `scripts/hooks/pre-commit-hook.js` no propaga `GIT_DIR` ni `GIT_INDEX_FILE` al proceso de `check.js`. Las pruebas que invocan git dejan de reescribir el índice del commit en curso.

### Changed
- **Presupuesto de revisión**: el diff de este patch superó 400 líneas y se aceptó como `size:exception` (`exception-ok`). `scripts/lib/review-lineage.js` exporta el arranque, el registro y la validación de slices de remediación.

Ciclo SDD completo (ruta standard): deltas de `lifecycle-kernel-runtime`, `routing` e `install`; verificación PASS WITH WARNINGS; quality review con dos hallazgos CRITICAL resueltos. Archivado en `openspec/changes/archive/2026-09-25-remediate-pp2-cx1-preflight-gaps/`.

**Verificación directa**: `node --test` del reducer, `validate-phase`, el launcher y el dispatch (186 pruebas, 0 fallos) y `go test ./internal/hooks/` del replay v2.67.

**Follow-up abierto**: `F-66efe8421b856f34`. `scripts/validate-phase.js` todavía puede leer `actual_route` fuera del bloque `route:`, y `scripts/route-dispatch-run.js` no. No está corregido en esta versión.

## [2.68.1] - 2026-09-23

### Fixed
- **Proyección CX1 en Go y Node (PR #195)**: `internal/hooks/phase-completion-reducer.go`, `internal/hooks/subagentstop.go`, `internal/store/store.go`, `scripts/hooks/subagent-stop.js` y `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` alinean el reducer de `SubagentStop`, el replay idempotente, la actualización CAS bajo bloqueo y la recuperación de estado. `scripts/lib/ospec-state.js` rechaza YAML malformado sin sobrescribir el estado (fail-safe). La paridad está cubierta por tests de ambos runtimes; no implica que todos los hosts invoquen el hook.
- **Preflight PP2 distribuido y paridad de targets (PR #196)**: `scripts/validate-phase.js` se distribuye como validador de fase ejecutable independiente; `scripts/configure/validate-phase.js`, `scripts/configure/cli.js` y `scripts/configure/real-repo.test.js` comprueban la entrega y ejecución en siete perfiles, incluido Antigravity. `openspec/specs/generator/spec.md` actualiza el contrato y `docs/target-capabilities.md` distingue validación instruccional, mapeo parcial y prueba de ejecución real del host; distribuir scripts no demuestra enforcement automático.

La evidencia de integración de PR #195 y #196 incluye `npm test` (3385/3385 pruebas), pruebas Go en cuatro paquetes y CI en tres sistemas operativos; cubre código y generación, no la ejecución efectiva de hooks en cada host.

**Verificación directa**: `node scripts/check.js` (3385 tests pasando, 0 fallos y 0 omitidos).

### Changed
- **Arquitectura y roadmap de OSPEC Adaptive**: `docs/architecture/ospec-adaptive-critical-design.md` establece la fuente canónica de decisiones Adaptive; `docs/architecture/harness-evolution.md`, `docs/roadmaps/README.md` y `docs/roadmaps/harness-evolution.md` alinean la autoridad documental y la proyección del backlog. Esta actualización documental independiente no activa el runtime Adaptive.

## [2.68.0] - 2026-09-18

### Added
- **Resolución de ambigüedad del Quality Review Gate (FU1)** — capability nueva `quality-review-attribution-resolution`:
  - **Atribución por scopes de contrato kernel**: fact sintético `kernel-contract-change` (dominios `trust`+`evolution`, fuente `metadata`) emitido por `normalizeQualityReviewEvidence` cuando un `capability_scope` cubre `schemas/kernel/**`; fluye por el pipeline normal (fingerprint, cobertura per-capability, audit) y crea findings por sí solo nunca. Un change kernel limpio clasificado `normal` ya no termina en `quality-review-ambiguity-unresolved` (`REQ-quality-review-attribution-resolution-001`).
  - **Override declarativo acotado `quality_review.attribution_override`** (patrón `quality_gates`, opt-in, comentado por defecto): `justification` obligatoria, `scope` de prefijos/globs `dir/**`, `applies_to` ⊆ códigos de ambigüedad cerrados; fail-closed con `validation_error_codes: ["attribution-override-invalid"]`, registro `{source, justification, scope, closed_codes}` en el gate audit y no reaparición del código cerrado (`REQ-quality-review-attribution-resolution-002`, `REQ-routing-003` MODIFIED).
  - **Contrato `resolution` del router residual**: `validateRouterDecision`/`mergeRouterDecision` aceptan `resolution: {source: scope-attribution|attribution-override, codes, justification?, scope}` exact-shape; solo esas dos fuentes cierran un código; evidencia residual sin `fact_codes` sigue bloqueando (`REQ-quality-review-attribution-resolution-003`).
  - **`createSuccessor` v2 nativo**: un linaje v2 terminal produce sucesores v2 vía `startQualityReviewLineage` heredando dominios del genesis; taxonomía mixta (4R contra v2, o v1 forzado) falla cerrado con `TypeError` estructurado antes de crear estado o presupuesto; v1 sigue produciendo v1 (`REQ-quality-review-attribution-resolution-004`, `REQ-routing-012`).
  - **Regla runtime per-capability** (`REQ-routing-008` MODIFIED): `runtime-code-without-domain-attribution` dispara por capability sin atribución con paths runtime (scoped o descubiertos), sin enmascaramiento por señales globales.
  - **Sentinels de propagación de build** (`REQ-install-026`): los validadores de los 4 targets in-scope y el builder del marketplace fallan cerrado ante builds stale o referencias kernel sin mapeo nativo; targets out-of-scope intactos en sus proyecciones diferenciadas.
- **Documentación**: bloque comentado en `openspec/config.yaml`, ruta de cierre documentada en `skills/_shared/gate-4r-review.md`, FU1 marcado resuelto en el roadmap con follow-ups FU1a/FU1b, y 4 ADRs promovidos a `docs/adr/adr-20260918-00{1..4}`.

### Fixed
- La trampa FU1: un change de contrato kernel limpio sin señales léxicas quedaba trabado en `public-kernel-contract-unattributed` → `quality-review-ambiguity-unresolved` sin dispatch ni archive (hallazgo observado en `remediate-cx1-strict-string-parity`).
- Ciclo SDD completo archivado en `openspec/changes/archive/2026-09-18-fix-fu1-review-gate-attribution-gap/`; requisitos, escenarios y suite focal verificados en runtime.

### Changed
- Ampliación documentada de la regla runtime: cambios con una sola capability runtime no atribuida que además portan un fact global (p.ej. `dependency-trust-change`) ahora clasifican `ambiguous` (semántica per-capability del spec); sin cambios en tests pineados.

## [2.67.3] - 2026-09-17

### Fixed
- **Paridad estricta de strings en Result Envelope (CX1)**:
  - **Patrón `\\S` en campos `isNonEmptyString`**: Incorporado `"pattern": "\\S"` junto a `minLength: 1` en `executive_summary`, `next_recommended`, rama string de `risks`, items de `key_decisions`, propiedades de `assumptions` y campos de texto de `question_gate` en `schemas/kernel/result-envelope/v1/envelope.schema.json` y el schema raíz, con paridad 1:1 entre ambos verificada por test `deepStrictEqual` estructural (`REQ-kernel-contract-schemas-031`).
  - **Validación de tipo `string` para `detailed_report`**: Los validadores JS (`scripts/lib/result-envelope.js`) y Go (`internal/resultenvelope/resultenvelope.go`) rechazan valores no string con mensaje determinista `detailed_report must be a string` (`REQ-skills-018`).
  - **Clase de whitespace alineada con ECMA-262**: Nueva helper `isECMAWhitespace` en Go (U+FEFF incluido, U+0085 excluido) espejando `trim()`/`\S` de ECMA, con fixtures diferenciales `bom-whitespace-only-strings.json` (inválido) y `nel-non-whitespace-strings.json` (válido) en la red trifásica.
  - **Paridad de mensajes para `question_gate`**: `question_gate: null` explícito en status no bloqueado y valores falsy no-null (`false`/`0`/`""`) en status blocked producen mensajes idénticos en JS y Go (`isJSONFalsy`), con fixtures `null-question-gate.json` y tests de paridad espejados en ambos runtimes.
  - **Vinculación de fixtures top-level**: Los cinco fixtures de nivel superior del corpus quedan vinculados mecánicamente a sus copias en `valid/`//`invalid/` mediante tests de igualdad estructural (Node) y byte-a-byte (Go).
  - **Promociones ADR**: Publicados `docs/adr/adr-20260917-004` (hardening de schemas), `adr-20260917-005` (validación `detailed_report`) y `adr-20260917-006` (matriz compartida de fixtures).
  - Ciclo SDD completo (change archivado en `openspec/changes/archive/2026-09-17-remediate-cx1-strict-string-parity/`, ruta standard, reclasificado high-risk): verificación PASS en 28/28 escenarios runtime-test y quality-review-gate aprobado en 3 generaciones con 2 rondas de remediación. Evidencia: Node 71/71 en 3 suites result-envelope, `go test ./...` 11/11 paquetes, regresión cero.

## [2.67.2] - 2026-09-17

### Fixed
- **Paridad canónica y conformidad diferencial de Result Envelope (CX1)**:
  - **Regla condicional `if/then` en JSON Schema**: Incorporada la regla `if status == "blocked" -> then required: ["question_gate"]` en `schemas/kernel/result-envelope/v1/envelope.schema.json` y en el schema raíz de compatibilidad `schemas/kernel/result-envelope.schema.json`, cerrando la discrepancia estructural con los validadores de runtime (`REQ-kernel-contract-schemas-031`).
  - **Restricción `minLength: 1` en campos de texto**: Añadido `minLength: 1` en `question_gate.reason`, `questions[].header`, `questions[].question`, `options[].label`, y en `assumptions` (`id`, `phase`, `statement`, `basis`), alineando la validación del schema con los chequeos de `isNonEmptyString` en JS y Go (`REQ-kernel-contract-schemas-031`).
  - **Matriz de fixtures negativos atómicos**: Añadidos `blocked-missing-question-gate.json`, `empty-question-gate-fields.json` y `empty-assumption-fields.json` en `schemas/kernel/result-envelope/v1/fixtures/invalid/` para validar el rechazo determinista de casos de frontera.
  - **Arnés de conformidad diferencial simétrico**: Creadas suites automatizadas en Node.js (`scripts/lib/result-envelope-conformance.test.js`) y Go (`internal/resultenvelope/conformance_test.go`) comprobando sobre la matriz completa de fixtures compartidos la invariante `schema.valid === js.valid === go.valid` (`REQ-skills-018`).
  - **Sincronización del Roadmap**: Actualizada la tabla de lanes en `docs/roadmaps/harness-evolution.md` marcando CX1 como `implemented-archived`.
  - **Transacción de archivo**: Cambio archivado en `openspec/changes/archive/2026-09-16-remediate-cx1-conformance-parity/` con 15/15 tareas y 24/24 escenarios verificados con pruebas en tiempo de ejecución.

## [2.67.1] - 2026-09-14

### Fixed
- **Remediación de contratos y proyección de envelopes (CX1)**:
  - **Fallback legacy en `SubagentStop`**: Conectada la normalización vía `adaptLegacyEnvelope()` ante retornos sin fence canónico en JavaScript (`scripts/hooks/subagent-stop.js`) y Go (`internal/hooks/subagentstop.go`), garantizando la preservación estricta de `status: blocked` fail-closed en `sdd-spec` ante ausencia de señales de ambigüedad (`REQ-hooks-015`).
  - **Autoridad de `verify_outcome` en reducer**: Añadida la propiedad canónica `verify_outcome` (`PASS`, `PASS WITH WARNINGS`, `FAIL`) a `result-envelope/v1`, requerida obligatoriamente en `sdd-verify`, y condicionado el avance a `status: verified` en `PhaseCompletionReducer` exclusivamente a un veredicto positivo explícito (`PASS` o `PASS WITH WARNINGS`). La omisión, `FAIL` o valores desconocidos proyectan mecánicamente `status: blocked` con `blocking_questions` (`REQ-lifecycle-kernel-028`, `REQ-skills-018`).
  - **Paridad estricta entre Schema y validadores JS/Go**: Validación canónica rigurosa de elementos string en `artifacts` y `risks`, enum cerrado de `skill_resolution`, estructura de `question_gate` y verificación de `schema_version == 1` en el mirror Go (`internal/resultenvelope`), unificando el corpus de fixtures bajo `schemas/kernel/result-envelope/v1/fixtures/` (`REQ-kernel-contract-schemas-031`).
  - **Transacción de archivo de cambio**: Cambio archivado en `openspec/changes/archive/2026-09-14-remediate-cx1-envelope-projection/` con 25/25 tareas completadas y 29/29 escenarios verificados en runtime con suite completa verde (3,331 tests en Node y 11 paquetes Go pasando).

## [2.67.0] - 2026-09-14

### Added
- **Envelope versionado y proyección mecánica de estado (CX1)**:
  - Incorporado el contrato `result-envelope/v1` con validación, adaptador legacy y renderer humano desacoplado en `schemas/kernel/` y `scripts/lib/result-envelope.js`.
  - Incorporado `PhaseCompletionReducer` y su proyección de estado con CAS, recuperación y replay idempotente en `scripts/lib/lifecycle-kernel/`, `scripts/lib/ospec-state.js` y `scripts/hooks/subagent-stop.js`.
  - Ciclo SDD completo archivado en `openspec/changes/archive/2026-09-11-phase-envelope-state-mechanical-projection/`; requisitos 11/11, escenarios 50/50 y tareas 24/24 verificados.
  - **Verificación archivada**: 189/189 tests focales, `npm test` con 3316/3316 tests pasando y `node scripts/check.js` con salida 0.

## [2.66.1] - 2026-09-11

### Fixed
- **Aceptación canónica end-to-end de ruta Lite y verificación independiente (`compact-lite-contract`)**:
  - Incorporada prueba de aceptación integral de las cinco fases (`propose` -> `tasks` -> `apply` -> `verify` -> `archive`) con recorrido en change real deliberadamente sin `proposal.md`, `specs/` ni `design.md`.
  - Demostración de apply acumulativo y reanudable que preserva tareas completadas en `apply-progress.md` entre sesiones.
  - Verificación runtime verdaderamente independiente que evalúa criterios de aceptación (`AC-1`/`AC-2`) directamente sobre el código, detectando fallos en pruebas adversariales incluso con tareas marcadas como completadas.
  - Cierre transaccional fail-closed validando el inventario de 6 artefactos de `LITE_ARCHIVE_ARTIFACTS` con `spec_writes: []`.
  - Elevación del nivel de evidencia de `REQ-skills-017` a `runtime-test` en la matriz de verificación de `openspec/changes/archive/2026-09-11-compact-lite-contract-and-consumer-compatibility/`.
  - Registro formal de deuda técnica sobre el vocabulario de estados de quality gates en `readArchiveGateFacts()`.

**Verificación directa**: `node --test scripts/compact-lite-contract.test.js` (4/4 tests pasando) y suite completa `node scripts/check.js`.

## [2.66.0] - 2026-09-11

### Added
- **Contrato compacto de ruta Lite y compatibilidad de consumidores (`compact-lite-contract-and-consumer-compatibility`)**:
  - Contrato lite de 5 fases (`propose` -> `tasks` -> `apply` -> `verify` -> `archive`) con `proposal-lite.md` y `tasks.md` como artefactos de planificación, manteniendo `spec` y `design` legítimamente ausentes sin requerir artefactos de relleno.
  - Adaptación de consumidores en `sdd-apply` y `sdd-verify` para soportar `actual_route: lite` con continuidad de `apply-progress.md` y validación de escenarios referenciando etiquetas estables de aceptación.
  - Integración de cierre e integridad de archivo en `sdd-archive` con preflight y verificación de inventario mínimo para ruta lite (`LITE_ARCHIVE_ARTIFACTS`) sin comprobaciones espurias de deltas inexistentes.
  - Paridad de generación en los seis targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`) preservando el guardián de dependencias estándar.
  - Actualización y consolidación de especificaciones vivas en `openspec/specs/routing/spec.md` (`REQ-routing-015`), `openspec/specs/skills/spec.md` (`REQ-skills-017`), `openspec/specs/agents/spec.md` (`REQ-agents-028`), `openspec/specs/generator/spec.md` (`REQ-generator-017`) y `openspec/specs/archive-plan-contract/spec.md` (`REQ-archive-plan-contract-004`).
  - Promoción de ADR en `docs/adr/adr-20260911-001-persisted-route-owns-the-artifact-contract.md`.
  - Archivado atómico del cambio `compact-lite-contract-and-consumer-compatibility` en `openspec/changes/archive/2026-09-11-compact-lite-contract-and-consumer-compatibility/`.

**Verificación directa**: `npm test` y suites enfocadas de archive y paridad de targets pasando (13/13 tareas verificadas).

## [2.65.1] - 2026-09-09

### Added
- **Modernización y presets en instalador interactivo (`modernize-installer-model-selection`)**:
  - Navegación orientada a preconfiguraciones (presets) con edición granular por fases y controles finos de razonamiento (`effort`, `model_reasoning_effort`, `variant`) en la TUI Go.
  - Paridad de configuración para GitHub Copilot equivalente a VS Code, manteniendo la herencia automática de Antigravity sin selector.
  - Protocolo v2 de adaptador e instalador con validación estricta de planes frescos y catálogo estático sin descubrimiento forzado.
- **Recuperación auditada de linaje y preservación de Candidate (`verify-lineage`)**:
  - Terminación auditada de Candidates irrecuperables (`candidate-recovery-irrecoverable`) y creación de sucesoras con preservación literal de hallazgos, recetas congeladas y presupuesto de remediación sin repetición de recetas (`no-replay`).
  - Captura canónica de Candidates vinculada a árboles Git mediante índices aislados y snapshots duraderos a nivel de workspace (`startVerifyLineageFromWorkspace`, `captureCandidateSnapshot`).
  - Journaling inmutable de operaciones dirigidas y soporte para sucesoras de reconciliación ante operaciones inconclusas (`preserved: true`).
- **Trazabilidad y memoria de arquitectura**:
  - Actualización y consolidación de especificaciones en `openspec/specs/generator/spec.md` (`REQ-generator-015..016`), `openspec/specs/install/spec.md` (`REQ-install-019..025`) y `openspec/specs/verify-lineage/spec.md` (`REQ-verify-lineage-013..018`).
  - Promoción de decisiones de arquitectura ADR-20260909-001 a ADR-20260909-004 en `docs/adr/`.
  - Archivado atómico del cambio `modernize-installer-model-selection` en `openspec/changes/archive/2026-09-09-modernize-installer-model-selection/`.

**Verificación directa**: `node scripts/check.js` (3267 tests pasando, 0 fallos) y `go test ./internal/installer -count=1` (ok).

## [2.65.0] - 2026-09-07

### Added
- **Catálogos ampliados por destino (`models.yaml`)**:
  - Incorporación de catálogo canónico por target con modelos vigentes (OpenAI GPT-6 Astra, GPT-5.6 Sol/Terra/Luna, o4-mini, o3; Claude Fable 5.1, Opus 5, Sonnet 5, Haiku 4.5; Zhipu GLM-5.3/5.2/5.1; Grok 4.6/4.5, Composer 2.5; Gemini 3.8 Flash, 3.1 Pro).
  - Etiquetas amigables normalizadas en la presentación del configurador interactivo (`scripts/configure/installer-adapter.js`).
- **Entrada manual de modelos personalizados en el instalador**:
  - Compatibilidad para ingresar modelos arbitrarios a mano en destinos que lo permiten (`claude`, `cursor`, `codex`, `opencode`), facilitando el uso de proxies y modelos alternativos como GLM en Claude Code.
  - Validación segura y decodificación `base64url` de modelos personalizados en el adaptador Node sin romper los invariantes de los destinos cerrados.
  - Modo interactivo de entrada de texto (`c`) en la TUI de Go (`internal/installer/`).
- **Control de nivel de esfuerzo de razonamiento en Codex**:
  - Ciclado interactivo (`e`) entre niveles `low`, `medium`, `high` y `xhigh` para modelos de Codex directamente desde la TUI, actualizando la configuración y etiquetas en tiempo real.

**Verificación directa**: `node scripts/check.js` (3249 tests pasando, 0 fallos y 0 omitidos) y `go test ./...` (11/11 paquetes ok).

## [2.64.0] - 2026-09-06

### Added
- **Instalador guiado en terminal (TUI) en Go (`cmd/ospec-install/`, `internal/installer/`)**:
  - Interfaz de terminal construida con Bubble Tea v1.3.4 y Lip Gloss para guiar la selección e instalación en los 7 destinos soportados (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`, `antigravity`).
  - Menú de selección de destino único y configuración de modelos por agente basada en capacidades declaradas, aplicando herencia automática para Antigravity y GitHub Copilot.
  - Navegación bidireccional que retiene selecciones locales por destino al retroceder y paso obligatorio de revisión previa a la instalación.
  - Restauración garantizada del estado de la terminal al salir y propagación fiel de flujos de salida y códigos de terminación nativos del proceso.
- **Adaptador Node desacoplado y anulaciones efímeras (`scripts/configure/installer-adapter.js`)**:
  - Protocolo v1 basado en JSON sobre stdin para comunicación entre el binario Go y el runtime Node.
  - Resolución in-memory de anulaciones de modelos efímeros sin alterar el archivo canónico `models.yaml`.
  - Reutilización de los puntos de entrada existentes `main(argv, deps)` de los instaladores sin duplicar transacciones ni mutaciones en el sistema de archivos.
- **Trazabilidad y especificaciones vivas**:
  - Incorporación y consolidación de requisitos `REQ-install-019` a `REQ-install-023` en `openspec/specs/install/spec.md`.
  - Promoción de decisiones de arquitectura: [ADR-20260906-001](docs/adr/adr-20260906-001-bubble-tea-for-installer-navigation.md) (Bubble Tea para navegación del instalador) y [ADR-20260906-002](docs/adr/adr-20260906-002-node-adapter-and-ephemeral-model-overrides.md) (Adaptador Node y anulaciones efímeras de modelos).
  - Aceptación formal de advertencia advisory de trazabilidad test-side bajo aprobación `warning-001` y archivado completo del cambio `go-installer-tui` en `openspec/changes/archive/2026-09-06-go-installer-tui/`.

## [2.63.3] - 2026-09-05

### Fixed
- **Empaquetado y distribución del runner canónico en targets (`scripts/configure/cli.js`)**:
  - Incorporación de `scripts/route-dispatch-run.js` como raíz explícita de BFS dentro de `RUNTIME_ENTRY_SCRIPTS` (con alias `SKILL_ENTRY_SCRIPTS`).
  - Arrastre automático de dependencias transitivas (`route-dispatcher.js`, `change-classification.js`, `archive-plan.js`, etc.) en los paquetes generados de todos los targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`, `antigravity`), garantizando que la autoridad operativa única de despacho sea ejecutable en instalaciones reales.
- **Saneamiento de comentarios JSDoc (`scripts/lib/route-dispatcher.js`)**:
  - Reemplazo de residuo de namespace `vscode/askQuestions` por referencia agnóstica a la herramienta de preguntas para cumplir los invariantes de validación multi-target.
- **Validación e integración en repositorios reales (`scripts/configure/real-repo.test.js`)**:
  - Adición de pruebas de integración que verifican la presencia del runner y sus dependencias de runtime en los 7 targets generados.
  - Verificación de ejecución directa del runner (`scripts/route-dispatch-run.js`) desde la salida generada de un target, validando el ciclo completo de resolución de rutas en el artefacto distribuido.

**Verificación directa**: `node scripts/check.js` (3236 tests pasando, 0 fallos y 0 omitidos) y `go test ./...` (10/10 paquetes ok). Reensobres Quality Review Gate (Trust, Runtime, Evolution, Efficiency) sin hallazgos.

## [2.63.2] - 2026-09-05

### Fixed
- **Soporte de contexto completo y banderas de intención en runner CLI (`scripts/route-dispatch-run.js`)**:
  - Habilitación de entrada de contexto completo estructurado mediante `--context='<json>'`, `--context-file=<path>` y lectura de stdin con `--context=-`.
  - Fusión determinista con precedencia estricta: configuración por defecto (`openspec/config.yaml`) + estado persistido (`state.yaml`) + contexto suministrado (`--context`/`--context-file`) + anulaciones directas por flags CLI.
  - Soporte de banderas de intención shorthand (`--bugfix`, `--refactor`, `--hotfix`) mapeadas a sus respectivas señales (`explicit_*_intent`).
  - Desanidado y preservación de comillas en argumentos JSON de consola y validación fail-closed de formato de objeto.
- **Autoridad operativa única en orquestador (`agents/sdd-orchestrator.agent.md`)**:
  - Paso 3 declara `node scripts/route-dispatch-run.js [change-name] [options]` como la única autoridad operativa de despacho, delegando de forma canónica en `selectRoute(routes, ctx, { persistedRoute })` con contexto serializado en JSON.
  - Preservación del presupuesto estricto de líneas del agente orquestador (< 500 líneas).
- **Reconciliación normativa de exención de prerrequisitos contextuales (`openspec/specs/routing/spec.md`)**:
  - Actualización formal de `REQ-routing-013` y `REQ-routing-014` para documentar normativamente que las rutas contextuales (`foundation`, `brownfield`) están exentas de las fases requeridas por mínimos de riesgo durante su ejecución como prerrequisitos, manteniendo su precedencia e invarianza en continuación.
- **Ampliación de suite E2E multiplataforma (`scripts/route-dispatch-run.test.js`)**:
  - Cobertura integral E2E para selección de `bugfix`, `refactor`, `hotfix`, derivación de `brownfield` desde señales en contexto (`specs_empty_with_code`, `code_without_specs`), y selección de `lite` en cambios nuevos sin estado previo.
  - Invocación segura sin shell para evitar la interpolación de comillas en Windows (`cmd.exe`).

**Verificación directa**: `node scripts/check.js` (3234 tests pasando, 0 fallos y 0 omitidos) y `go test ./...` (10/10 paquetes ok). Reensobres Quality Review Gate (Trust, Runtime, Evolution, Efficiency) sin hallazgos.

## [2.63.1] - 2026-09-05

### Fixed
- **Integración canónica del despacho de rutas en el orquestador (`agents/sdd-orchestrator.agent.md`)**:
  - Sustitución del algoritmo heurístico redundante de Step 3 por la autoridad canónica de despacho `selectRoute(routes, ctx, { persistedRoute })`, sincronizando la especificación del agente con la implementación de routing en vivo.
  - Adición del runner CLI `scripts/route-dispatch-run.js` y su suite de pruebas (`scripts/route-dispatch-run.test.js`) para resolver y despachar rutas de forma determinista con códigos de salida normalizados (`0` éxito, `2` bloqueado por decisión de usuario, `1` error).
- **Validación estricta y blindaje fail-closed de rutas en `selectRoute` (`scripts/lib/route-dispatcher.js`)**:
  - Validación de elegibilidad de `fallbackRoute` frente a `floorGuarantees` vía `isRouteEligible()`, impidiendo que rutas de respaldo incumplan los requisitos de fase de pisos críticos.
  - Manejo fail-closed cuando una ruta persistida en `state.yaml` no existe en la tabla de routing declarada (`persisted_route_missing`), requiriendo decisión explícita del usuario.
  - Exención explícita de rutas contextuales (`foundation`, `brownfield`) de las fases requeridas por floors de implementación de código tanto en el despacho inicial como en continuación, preservando su rol como prerrequisitos de workflow.
  - Fusión inclusiva de señales de impacto (`HARD_FLOORS`) evitando sombreado de claves raíz cuando `ctx.impact` se provee como objeto vacío.
- **Robustez y seguridad en runner CLI (`scripts/route-dispatch-run.js`)**:
  - Prevención de path traversal en `changeName` mediante validación estricta con `isSafeChangeName()`.
  - Normalización y eliminación de comillas en `persistedRoute` y `classification`.
  - Parseo seguro de señales booleanas en `state.yaml` ignorando líneas de comentarios y admitiendo valores encomillados (`"true"`, `'true'`).

**Verificación directa**: `node scripts/check.js` (3226 tests pasando, 0 fallos y 0 omitidos) y `go test ./...` (10/10 paquetes ok). Reensobres 4R sin hallazgos.

## [2.63.0] - 2026-09-05

### Added
- **Normalización fail-closed de señales de clasificación (`scripts/lib/route-dispatcher.js`)**:
  - Función `normalizeClassificationSignals(ctx)` que armoniza las claves `classification` y `change.classification` en el contexto.
  - Clase de error determinista `ClassificationConflictError` lanzada cuando ambas señales están presentes pero difieren en valor, impidiendo ambigüedad silenciosa o desalineación en el despacho.
- **Filtrado de elegibilidad de rutas por metadata (`scripts/lib/route-dispatcher.js`)**:
  - Función `isRouteEligible(route, resolvedClassification, floorGuarantees)` que evalúa metadatos antes de las condiciones dinámicas.
  - Eliminación del sombreado de la ruta `standard` sobre `lite` en proyectos activos (`project.status: active`), permitiendo el despacho directo y seguro de flujos reducidos para cambios `trivial` y `small`.
- **Conexión de mínimos de riesgo K1 a despacho de rutas (`scripts/lib/change-classification.js`, `scripts/lib/route-dispatcher.js`)**:
  - Constante `FLOOR_GUARANTEES` y función `resolveFloorGuarantees(floor)` que traducen mínimos de impacto K1 (`auth_security`, `data_migration`, `public_api`) a una garantía estricta de tier mínimo `standard`.
  - Imposibilidad de degradar garantías de seguridad mediante marcas `explicit_hotfix_intent` o tamaños reducidos de diff (LOC).
- **Invarianza de ruta en continuación y compuerta bloqueante (`scripts/lib/route-dispatcher.js`)**:
  - `selectRoute` (con alias `dispatchRoute`) preserva la ruta persistida en `state.yaml` a lo largo de fases sucesivas.
  - Detección de riesgos emergentes tardíos: si una evidencia posterior viola los mínimos de riesgo de la ruta activa, la ejecución se detiene de forma determinista con estado `blocked` y `blocker_type: needs_user_decision` en lugar de degradar o cambiar silenciosamente de ruta.
- **Documentación de arquitectura (ADRs)**:
  - `ADR-20260905-007`: Normalización determinista de señales y manejo fail-closed de conflictos.
  - `ADR-20260905-008`: Filtrado de elegibilidad de ruta por metadata previo a evaluación.
  - `ADR-20260905-009`: Conexión de mínimos de impacto de riesgo K1 al despacho de rutas en vivo.
  - `ADR-20260905-010`: Invarianza de decisión de ruta en continuación y compuerta bloqueante.
  - Cambio archivado en `openspec/changes/archive/2026-09-05-live-routing-eligibility-and-risk-floors/`.

### Changed
- **Configuración declarativa de enrutamiento (`openspec/config.yaml`)**:
  - Ampliación de metadata de clasificación en rutas contextuales (`foundation`, `federated`, `brownfield`) a `[trivial, small, normal, high-risk]` para preservar su precedencia independientemente del tamaño del cambio.
  - Actualización de la condición de activación de la ruta `lite` a `project.status: active`, eliminando el acoplamiento redundante a `change.classification: small` resuelto ahora por filtrado de elegibilidad.
- **Especificaciones canónicas OpenSpec (`openspec/specs/`)**:
  - Incorporación de requisitos en `openspec/specs/routing/spec.md` (REQ-routing-012, REQ-routing-013, REQ-routing-014) y `openspec/specs/change-classification/spec.md` (REQ-change-classification-003, REQ-change-classification-004).

**Verificación directa**: `npm test` (3204 tests pasando, 0 fallos y 0 omitidos).

## [2.62.1] - 2026-09-05

### Fixed
- **Robustez del runtime de `skill-registry` ante errores de lectura (`scripts/lib/skill-registry.js`, `internal/skillreg/skillreg.go`)**:
  - Implementación de pipeline con snapshot único en memoria durante el descubrimiento (`discoverSkills`/`DiscoverSkills`) para el cálculo del fingerprint SHA-256 (`calculateFingerprint`/`CalculateFingerprint`), eliminando lecturas redundantes de disco y evitando discrepancias de estado entre parseo y hashing.
  - Degradación elegante ante ficheros no legibles (`EACCES`, errores de permisos o I/O): emite una advertencia en `stderr`, omite el skill del registro parseado y hashea 0 bytes en el fingerprint sin relanzar excepciones ni abortar `SessionStart`.
  - Paridad criptográfica y de comportamiento verificada entre Node.js y Go mediante pruebas automatizadas de integración cruzada.
- **Guarda `requireSkills` fail-closed en raíces de skills compartidas (`~/.agents/skills`)**:
  - Verificación estricta de anclas canónicas de identidad OSpec (`skills/_shared/`, `skills/skill-registry/SKILL.md` o manifiesto `.ospec-workflow-install.json`) cuando `requireSkills: true` se ejecuta sobre raíces externas.
  - Impide que una raíz compartida que contenga únicamente skills foráneos o de terceros satisfaga la guarda cuando el bundle de OSpec está ausente, evitando la corrupción o vaciado de caches válidas previas.
- **Documentación de arquitectura (ADRs)**:
  - `ADR-20260905-005`: Pipeline de snapshot único en memoria y degradación a contenido vacío en hashing ante errores de lectura.
  - `ADR-20260905-006`: Verificación fail-closed de anclas canónicas de identidad OSpec en directorios compartidos y externos.
  - Cambio archivado en `openspec/changes/archive/2026-09-05-fix-cx0-skill-registry-robustness/`.

**Verificación directa**: `node scripts/check.js` (3176 tests pasando, 0 fallos y 0 omitidos) y `go test ./...` (10/10 paquetes ok)

## [2.62.0] - 2026-09-05

### Added
- **Registro de skills para instalaciones globales de CX0 (`scripts/hooks/session-start.js`, `scripts/lib/skill-registry.js`, `internal/skillreg`, `internal/hooks/sessionstart.go`)**:
  - Detección del layout de instalación global del target CX0 y soporte de root externo (`~/.agents/skills`) con paths absolutos portables.
  - Cache-hit con deep-equal de entradas de skills para reparar caches vacíos o desactualizados ante fingerprints coincidentes.
  - Guard `requireSkills` fail-closed para evitar que un bundle roto o vacío reemplace un registro válido con hash de entrada vacía.
  - Exclusión automática de skills `sdd-*` anidados para prevenir recursión y duplicidad.
  - Discovery lee cada archivo una sola vez y degrada con warning sin abortar la sesión ante fallos de lectura.
  - Launcher CX0: preservación de campos estructurados (`registry`, `capabilities`) en `additionalContext` como línea JSON y marco explícito `[ospec error]` en envelopes de error.
  - Paridad completa verificada entre las implementaciones de Node.js y Go.
  - ADR `adr-20260905-004`: `~/.agents/skills` como frontera de confianza equivalente al bundle del plugin.
  - `k1-scope-guard`: registro de `skill-registry` en el inventario de sucesores.

### Changed
- **Juicio compartido de revisión y compactación de agentes (`skills/_shared/`, `agents/review-*.agent.md`)**:
  - Nuevas referencias compartidas `skills/_shared/review-judgment.md` (protocolo de evidencia, schema de findings, severidad y literales de lineage para especialistas v2/4R) y `skills/_shared/engineering-judgment.md` (proporcionalidad, calidad verificable y estructura proporcional).
  - Agentes `review-*` y skills de revisión delegan en las referencias compartidas, eliminando duplicidades y umbrales rígidos arbitrarios (anidación, ratio de mocks).
  - Jerarquía estricta de autoridad en `skill-resolver` y `sdd-phase-common` entre procedimiento de fase y standards suplementarios.
  - Manejo de `strict-tdd`: estados `STATIC_VALIDATED` y `DEFERRED` documentan limitaciones de ejecución sin otorgar pases runtime falsos; modo estricto sin runner nunca resuelve a Standard.
  - Verificación en `real-repo.test.js` de que los 7 targets embarquen ambas referencias.
- **Reconciliación canónica de especificaciones OpenSpec (`openspec/specs/`)**:
  - Reconciliación de especificaciones de los dominios `hooks`, `skill-registry`, `skills` y `agents` con la ventana de cambios `359deff..4f96084`.

**Verificación directa**: `node scripts/check.js` (3171 tests pasando, 0 fallos y 0 omitidos) y `go test ./...` (10/10 paquetes ok)

## [2.61.0] - 2026-09-05

### Added
- **Autoridad compartida de identidad de agentes (`scripts/lib/agent-identity.js` e `internal/agentidentity`)**:
  - Punto único y compartido de resolución canónica de identidad de agentes que normaliza nombres con prefijos de host (ej. `plugin-host:sdd-*`, `host:review-*`) a su identificador canónico (`sdd-*`, `review-*`), tolerando hasta un prefijo con delimitador `:`.
  - Conjunto cerrado de agentes propios del harness con manejo fail-closed a `unresolved` ante agentes desconocidos o foráneos, impidiendo omisiones o bypasses de coverabilidad.
  - Espejo completo en Go con pruebas de paridad cruzada entre ambos runtimes.
  - ADRs `adr-20260905-001` y `adr-20260905-002`.

### Changed
- **Emisión de costes de fase y validación de cobertura en benchmark (`extend-bench-agent-coverage`)**:
  - `persistPhaseCost` (en Node.js `scripts/hooks/subagent-stop.js` y en Go `internal/hooks/subagentstop.go`) utiliza la resolución canónica compartida para clasificar dispatches y registrar el `agent` canónico, permitiendo la persistencia de costes de agentes prefijados.
  - `validCostRow` en `scripts/evals/lib/benchmark.js` valida cobertura contra la identidad canónica en lugar de igualdad estricta `agent === \`sdd-${phase}\``, extendiendo el soporte a todos los agentes propios del harness y manteniendo compatibilidad retroactiva O1 byte a byte.
  - Cambio archivado en `openspec/changes/archive/2026-09-05-extend-bench-agent-coverage/`.
- **Ingress canonicalization en telemetría CX0 y Result Envelope (`canonicalize-cx0-context-measurement`)**:
  - `persistContextMeasurement` en `scripts/hooks/subagent-stop.js` canonicaliza el nombre de agente antes de derivar la clave de fase, evitando que dispatches prefijados omitan la medición de contexto CX0.
  - `persistResultEnvelope` y `resolveDispatchStatus` en Node.js y Go (`subagentstop.go`) resuelven el agente canónico para derivar la phase key, garantizando la persistencia de resúmenes de envelope en `state.yaml` y la validación fail-closed a `blocked` para `sdd-spec` con envelope inválido.
  - ADR `adr-20260905-003`.
  - Cambio archivado en `openspec/changes/archive/2026-09-05-canonicalize-cx0-context-measurement/`.

**Verificación directa**: `node scripts/check.js` y `go test ./...` (10/10 paquetes ok)

## [2.60.5] - 2026-09-05

### Fixed
- **Falsa ausencia del CLI host en Windows (`check.js`, `configure/cli.js`, `configure/e2e.test.js`)**: en Windows `resolveClaudeBin()` resuelve al shim npm `claude.cmd`, y Node lo rechaza con `EINVAL` al spawnearlo con `shell: false` (endurecimiento de CVE-2024-27980). Los tres puntos de spawn (`claudeCliAvailable`, `defaultRunValidator` y el probe/E2E) fallaban el probe y la validación del perfil degradaba silenciosamente a generation-only. Nuevo helper `spawnCliSync` en `scripts/configure/cli.js` que enruta shims `.cmd`/`.bat` por `cmd.exe /d /s /c` con quoting explícito (ni `EINVAL` ni la falta de quoting de `shell: true`); el resto de binarios sigue con `shell: false`. El E2E real (`plugin validate --strict`) vuelve a ejecutarse en Windows.
- **Historia de costes con líneas largas (`internal/store/store.go`)**: `AppendPhaseCost` lee la historia con `bufio.Reader` en vez de `bufio.Scanner` (las filas de evidencia podían superar el límite de token de 64 KiB) y propaga errores de lectura/apertura/cierre en lugar de atestiguar una historia parcialmente leída.
- **Diff unificado más rápido y fail-closed (`scripts/lib/worker-executor.js`)**: `computeLineDiff` recorta prefijo/sufijo comunes antes del DP (preservando el alineamiento cuando hay líneas repetidas) y se elimina el helper muerto `splitLines`; `generateUnifiedDiff` solo lee el contenido de archivos cuyo sha cambió y aborta la captura ante un fallo de lectura en lugar de fabricar un borrado.
- **Transporte asíncrono bajo guards (`scripts/lib/host-contract/index.js`)**: `invokeTransportAsync` mantiene la work anidada (thenables en `value`) dentro de los guards de deadline/abort, también cuando se asientan tras una cancelación.
- **Limpieza de eventos retirados (`scripts/configure/install-engine.js`)**: `mergeHooksDoc` filtra comandos ospec-hooks también de eventos que el manifiesto generado ya no emite, y elimina las claves vacías.
- **Backup preservado en rollback fallido (`scripts/configure/install-target.js`)**: `syncEntriesTransactional` conserva el snapshot de recuperación cuando la restauración falla, reportando su ruta en el error.
- **Detección de host explícita (`scripts/hooks/ospec-hooks-launch.js`)**: un `OSPEC_TARGET` explícito gana sobre marcadores heredados del terminal/plugin (VSCODE_PID/CWD ya no fuerzan Cursor), y la ausencia de target ya no implica Claude por defecto en la presencia de marcadores Cursor.

**Verificación directa**: `node scripts/check.js` (3119 tests pasando, 0 fallos y 0 omitidos)

## [2.60.4] - 2026-09-04

### Fixed
- **Falso verde sintáctico en `.js` ESM (`staged-validator.js`)**: cuando `vm.Script` falla únicamente por modo ESM (`import`/`export`) en un `.js` staged, el contenido completo se valida con `node --check` sobre un temporal `.mjs` (reutilizando `checkMjsSyntax`, con cleanup en `finally` y type `js-esm-syntax`). Antes, un `.js` con `import` válido más un error sintáctico real (p. ej. `const broken = ;`) pasaba la validación porque el `continue` incondicional interpretaba el error de modo ESM como archivo válido.
- **Rechazo de ESM en `.cjs` (`staged-validator.js`)**: `.cjs` pierde la exención de modo ESM; `import`/`export` en un `.cjs` staged ahora se reporta como error de sintaxis (`js-syntax`), según su semántica CommonJS explícita.
- **Regresiones**: 2 tests unitarios (`.js` ESM roto con verificación de invocación real de `node --check`; `.cjs` con `import` que falla sin invocar el fallback) y 2 tests de integración end-to-end (exit 1 con "Error de sintaxis en archivos staged"; exit 0 para ESM válido).

### Archived
- Cambio archivado en `openspec/changes/archive/2026-09-04-fix-precommit-js-esm-syntax-green/`.

**Verificación directa**: `npm test` (3091 tests, 3089 pasando, 0 fallos, 2 omitidos)

## [2.60.3] - 2026-09-04

### Fixed
- **Invalidación de targets ante libs de runtime distribuidas (`staged-validator.js`)**: `findAffectedTargets` ahora trata cualquier módulo de producción bajo `scripts/lib/**` (excluyendo `*.test.js` y `scripts/lib/test-support/**`) como fuente compartida distribuida, retornando `ALL_TARGETS`. Esto cierra el hueco donde módulos empaquetados por `gatherRuntimeScripts()` y sus dependencias transitivas de `require()` (p. ej. `review-dimensions.js`, `federation-marker.js`, `review-gate-state.js`, `review-lineage.js`) producían cero regeneraciones de target en el fast pre-commit.
- **Validación sintáctica real de `.mjs` (`staged-validator.js`)**: los blobs staged `.mjs` se materializan en un archivo temporal y se validan con `node --check` (parseo ESM nativo según extensión), en lugar de saltarse silenciosamente, cumpliendo el contrato de la spec que promete validar `.js`, `.mjs`, `.cjs` y `.json`. Fail-closed ante fallo del spawn.
- **Spec actualizada (`openspec/specs/git-precommit-hook/spec.md`)**: la frontera de invalidación documenta `scripts/lib/**` de producción y los escenarios de regresión correspondientes.

**Verificación directa**: `node scripts/check.js` (3086 tests pasando, 0 fallos y 4 omitidos)

## [2.60.2] - 2026-09-04

### Fixed
- **Invalidación exhaustiva de targets y política fail-closed en pre-commit (`precommit-invalidation-and-failclosed`)**:
  - **Invalidación exhaustiva con fallback a `ALL_TARGETS` (`staged-validator.js`)**: ampliación de `findAffectedTargets` para cubrir todas las entradas canónicas del generador (`agents/**`, `commands/**`, `rules/**`, `skills/**`, `hooks/**`, `schemas/kernel/**`, `.mcp.json`, `.claude-plugin/plugin.json`, `models.yaml`), módulos auxiliares (`frontmatter.js`, `model-resolver.js`, `target-transform.js`, `target-profiles/**`) y hooks de runtime (`scripts/hooks/**`), garantizando que cualquier cambio en la especificación o generación de agentes y flujos regenere y valide los 7 targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`, `antigravity`) (ADR-005).
  - **Política fail-closed estricta en Git index (`staged-validator.js`)**: `getStagedFiles` y `getStagedContent` lanzan `Error` descriptivo ante fallos de Git (`git diff`, `git show`, errores de proceso o `maxBuffer`), impidiendo la degradación silenciosa a listas vacías o valores nulos (ADR-006).
  - **Escaneo de secretos fail-closed (`pre-commit-hook.js`)**: bloqueo inmediato con código de salida `1` y banner diagnóstico ante cualquier fallo al leer o inspeccionar blobs staged en AgentShield, manteniendo las vías de bypass de emergencia autorizadas (`DISABLE_OSPEC_PRECOMMIT`, `DISABLE_AGENT_SHIELD`, `--no-verify`).
  - **Robustez en entorno de ejecución (`RUN-001` a `RUN-004`)**:
    - Compatibilidad ESM en validación sintáctica: exclusión de `.mjs` y tolerancia a declaraciones de módulo ESM en `.js` evaluados bajo CommonJS.
    - Pre-filtrado por tamaño con `git cat-file -s` para omitir blobs >= 1 MB antes de invocar `git show`, evitando desbordamientos de `maxBuffer`.
    - Detección y omisión segura de submódulos Git en el índice (`commit, not a blob`).
    - Desactivación de escape octal en rutas con `-c core.quotepath=false` en `git diff`.
  - **Pruebas de integración Git en repositorios efímeros**: cobertura completa en `staged-validator.integration.test.js` para invalidación canónica y comportamiento fail-closed ante índices o blobs corruptos.
  - **Especificaciones y ADRs**: Requisitos delta `REQ-git-precommit-hook-001`, `REQ-git-precommit-hook-003` y `REQ-agent-shield-security-001`; ADRs `adr-20260904-005` y `adr-20260904-006`.

### Archived
- Cambio archivado en `openspec/changes/archive/2026-09-04-precommit-invalidation-and-failclosed/`.

## [2.60.1] - 2026-09-04

### Fixed
- **Remediación del pre-commit diferencial y lectura desde Git index (`fast-precommit-remediation`)**:
  - **Lectura estricta desde Git index (`staged-validator.js`, `pre-commit-hook.js`)**: sustitución de lecturas directas del working tree (`fs.readFileSync`) por lectura de blobs en el índice (`git show :<path>`) con normalización POSIX y manejo seguro de buffers (ADR-001). Garantiza que tanto la validación sintáctica como el escaneo de secretos de AgentShield evalúen exactamente el contenido staged, previniendo bypasses por staging parcial o desincronización con el árbol de trabajo.
  - **Invalidación conservadora de targets con fallback a `ALL_TARGETS`**: resolución exhaustiva en `findAffectedTargets` para generadores compartidos (`scripts/configure/cli.js`, `install-engine.js`, `install-target.js`, `validate-phase.js`), perfiles de target (`scripts/lib/target-profiles/*.js`), transformaciones (`target-transform.js`) y catálogo de modelos (`models.yaml`), evitando ejecuciones vacías ante modificaciones de infraestructura común (ADR-002).
  - **Fallback a suite de pruebas completa de Node**: ejecución integral de tests ante cambios en módulos compartidos de infraestructura (`scripts/lib/` o `scripts/check.js`) en `findAffectedTests`, asegurando cobertura ante modificaciones de dependencias compartidas (ADR-003).
  - **Pruebas de integración con repositorios Git efímeros**: nueva suite de pruebas de integración (`staged-validator.integration.test.js`) que valida sobre repositorios reales temporales (`git init`) escenarios de staging parcial: sintaxis inválida staged con working tree limpio, sintaxis válida staged con working tree roto, y secretos staged con working tree limpio (ADR-004).
  - **Optimización de I/O en validación de sintaxis (`EFF-001`)**: filtrado previo por extensiones sintácticas (`.js`, `.mjs`, `.cjs`, `.json`) antes de consultar blobs en Git index, eliminando llamadas innecesarias a `git show` sobre archivos de documentación o configuración.
  - **Especificaciones y ADRs**: Requisitos delta `REQ-git-precommit-hook-001`, `REQ-git-precommit-hook-002`, `REQ-git-precommit-hook-003` y `REQ-agent-shield-security-001`; ADRs `adr-20260904-001` a `adr-20260904-004`.

### Archived
- Cambio archivado en `openspec/changes/archive/2026-09-04-fast-precommit-remediation/`.

## [2.60.0] - 2026-09-04

### Added
- **Optimización diferencial del hook pre-commit y defensa en profundidad (`fast-precommit-hook`)**:
  - **Validación diferencial dirigida (`staged-validator.js`)**: nuevo motor de análisis de archivos staged que realiza comprobaciones sintácticas en memoria (<1 ms con `node:vm.Script` y `JSON.parse`), resuelve el grafo de tests afectados y ejecuta únicamente las pruebas y builds impactados.
  - **Soporte `--staged` en `check.js`**: permite al hook pre-commit validar el espacio de trabajo de manera incremental, acelerando el tiempo de commit de ~63 s a <1 s (hasta 85x-230x de mejora en latency), mientras `npm test` y CI conservan la matriz completa.
  - **Defensa en profundidad con AgentShield en pre-commit**: escaneo preventivo automático de archivos y contenidos staged antes de confirmar el commit, bloqueando archivos sensibles (`.env*`, claves SSH, `.npmrc`) y tokens de credenciales (`sk-...`, `AIzaSy...`, AWS, JWT, contraseñas genéricas).
  - **Preservación estricta de robustez y compatibilidad**: mantiene intacta la verificación de Strict TDD, banners informativos `===` con diagnóstico detallado y todas las vías de bypass (`DISABLE_OSPEC_PRECOMMIT`, `DISABLE_AGENT_SHIELD`, `OSPEC_PRECOMMIT_FULL`, `git commit --no-verify`).
  - **Verificación directa**: `node scripts/check.js` (3045 tests pasando, 0 fallos y 4 omitidos).

## [2.59.0] - 2026-09-04

### Added
- **Adaptador de telemetría de tokens Claude CX0 (`claude-cx0-telemetry-adapter`)**:
  - **Extracción de uso observada desde transcripciones**: extracción de contadores de tokens (`input_tokens`, `output_tokens`, `cached_input_tokens`) desde transcripciones JSONL para alimentar la lane CX0 (`ospec-context-measurement/v1`) con métricas `host-observed` y derivadas (`runtime-derived`).
  - **Normalización de contadores Anthropic**: soporte para suma del par `cache_read_input_tokens` y `cache_creation_input_tokens` al triple canónico.
  - **Lectura acotada de cola (Tail Read Window)**: lectura de cola de 64 KB de un solo salto posicionado sin cargar transcripciones completas en memoria (ADR-009).
  - **Precedencia de detección de host**: resolución de la dimensión host a `claude` bajo marcadores y firmas de sesión (ADR-010).
  - **Enrutamiento de SubagentStop a Node**: enrutamiento del subcomando `subagent-stop` hacia Node.js en hosts Claude Code para asegurar la ejecución del extractor.
  - **Especificaciones y ADRs**: Requisitos `REQ-context-measurement-007`, `REQ-context-measurement-008`, `REQ-hooks-018` y `REQ-hooks-019`; ADRs `docs/adr/adr-20260903-009` y `docs/adr/adr-20260903-010`.

### Fixed
- **Interoperabilidad WSL y modelos OpenCode (`wsl-claude-interop-guard`)**:
  - **Guard de binario WSL interop**: detección y descarte fail-soft de ejecutables Windows bajo `/mnt/<letra>/` invocados desde WSL/Linux, degradando a generación sin validador externo para evitar fallos de rutas POSIX.
  - **Compatibilidad multiplataforma de tests**: aislamiento de `LOCALAPPDATA` y simulación de plataforma en pruebas de validadores y chequeo `stat.isFile()` en lecturas de transcripción para evitar fallos en Windows nativo.
  - **Alineación de modelos OpenCode**: actualización del modelo del tier light y default en `models.yaml` y pruebas unitarias a `zai-coding-plan/glm-5.3-flash`.

### Archived
- Cambios archivados en `openspec/changes/archive/2026-09-03-claude-cx0-telemetry-adapter/` y `openspec/changes/archive/2026-09-04-wsl-claude-interop-guard/`.

## [2.58.0] - 2026-09-03

### Added
- **Deltas de complejidad y arquitectura K6d (`k6d-complexity-architecture-delta`)**:
  - **Nueva capability `complexity-architecture-delta`**: informes de delta estructural reproducibles, Candidate-bound y exclusivamente advisory, con orden canónico locale-independent en dimensiones y señales.
  - **Contratos v1 cerrados y aditivos**: schemas `schemas/kernel/complexity-architecture-delta/v1.schema.json` y `schemas/kernel/architecture-alternative/v1.schema.json`, content-addressed (`report_id`, `alternative_id`), con corpus de fixtures válidos e inválidos incluido binding divergente de Candidate.
  - **Señales advisory sin autoridad**: enum cerrado `authority:["advisory"]`, guards de autoridad en capa separada (`rejectAuthorityMisuse` fail-closed), sin consumo de telemetría CX0 ni concesión de autoridad a K7/K8/K9.
  - **Compatibilidad K1 y manifest**: entradas aditivas en `contract-claims.json`, `manifest.json` y `k1-compat.js`; límites roadmap verificados en `roadmap-boundary.test.js`.
- **ADRs `docs/adr/adr-20260903-006` a `008`**: frontera de inventario estructural canónico, familias de contrato aditivas y frontera advisory-only de K6d.

### Fixed
- **K6D-V001**: orden canónico de registros independiente de `localeCompare` (UTF-16 code-unit) en `analyzer.js` e `integrity.js`, garantizando bytes/identidad de report reproducibles entre locales.
- **K6D-V002**: corpus de fixtures negativos completado (report/candidate ids ausentes, malformados y binding divergente).
- **K6D-RR-001 (gate de calidad)**: eliminado `localeCompare` residual en el orden de `signals` de `advisory.js`, con test anti-locale que ejercita ≥2 alternativas `new-abstraction`.

### Archived
- Change archivado en `openspec/changes/archive/2026-09-03-k6d-complexity-architecture-delta/`; verify PASS (lineage gen-2 cerrada) y quality-review gate aprobado con 6 hallazgos advisory como follow-ups.

## [2.57.0] - 2026-09-03

### Changed
- **Quality Review Gate (`quality-review-gate`)**: el gate post-verify live pasa de 4R (`risk|reliability|resilience|readability` + `review-change` obligatorio) a cuatro dominios (`trust|runtime|evolution|efficiency`).
  - Identidad canónica v2: `quality-review-gate` en rutas live (`bugfix`/`refactor`/`standard`); `4r-review-gate` solo para linajes schema-v1 e historial archivado; ambas claves en estado mutable fallan cerrado.
  - Routing determinista primero: high-risk selecciona los cuatro dominios y omite el router; `review-change` solo con residuo por capability no atribuida; `normal-signal-overflow` eliminado.
  - Linaje dual-schema: v1 conserva ejecutores 4R; v2 usa especialistas de calidad; `review-correction` valida dueños según schema, nunca mezclados.
  - Cursor emite `readonly: true` en especialistas de calidad y, si existen, en los cuatro agentes 4R de compatibilidad.
  - KPIs CX0 sidecar (`quality-review-kpis/v1`) sin persistencia paralela ni autoridad de routing.
  - Specs actualizadas en `agents`, `skills`, `routing`, `generator`, `hooks`, `orchestrator-evals` y `context-measurement`; ADRs `docs/adr/adr-20260903-001` a `005`.
  - Verify PASS WITH WARNINGS; hallazgos CRITICAL del gate resueltos; WARNING de KPI tokens ausentes queda como follow-up.
  - Archivado en `openspec/changes/archive/2026-09-03-quality-review-gate/`.

## [2.56.8] - 2026-09-02

### Added
- **Telemetría CX0 coverage-aware (`cx0-context-measurement`)**:
  - **Carril JSONL separado de O1**: registros `ospec-context-measurement/v1` en `.ospec/session/{change}/context-measurements.jsonl` con métricas available/unavailable, fuente, cobertura y `reason_code`; sin payloads y sin autoridad sobre routing, gates ni Candidate.
  - **Contrato y reporting advisory**: schema cerrado, fixtures válidas/inválidas, hipótesis machine-readable, P50/P90 nearest-rank y comparación `supported`/`contradicted`/`insufficient-evidence` desconectada del scoring.
  - **Emisión fail-safe en SubagentStop**: append CX0 posterior a phase-cost; fallos de escritura no alteran stdout ni la continuación del hook.
  - **Specs y ADRs**: dominio nuevo `openspec/specs/context-measurement/spec.md`; `REQ-hooks-017` y `REQ-orchestrator-evals-007`; ADRs `docs/adr/adr-20260902-004`, `005` y `006`.
  - Verify PASS (12/12), 4R aprobado (0 BLOCKER/CRITICAL; 6 WARNING y 1 SUGGESTION advisory aceptados); archivado en `openspec/changes/archive/2026-09-02-cx0-context-measurement/`.

## [2.56.7] - 2026-09-02

### Fixed
- **Persistencia y recuperación content-addressed de Candidate en el linaje de verificación (`verify-lineage-candidate-persistence`)**:
  - **Almacenamiento CAS change-local para Candidate/v2**: Implementada la persistencia inmutable en `scripts/lib/verify-lineage-candidate-store.js` mediante publicación atómica no-clobber a nivel de raíz del cambio (`.verify-lineage-candidate-<digest>.json`) con mitigación estricta contra TOCTOU y enlaces simbólicos.
  - **Rehidratación y doble validación entre procesos**: Actualizado `scripts/lib/verify-lineage.js` para que `prepareRemediation` y `recordRemediationAttempt` rehidraten el material del Candidate referenciado y recalculen el digest de bytes y el `candidate_id` canónico, bloqueando de forma fail-closed ante cualquier material ausente o alterado sin requerir preimágenes en memoria (`REQ-verify-lineage-010`, `REQ-verify-lineage-011`, `REQ-verify-lineage-012`).
  - **Continuidad de remediación en linajes de verificación**: Habilitada la reanudación segura de remediaciones tras serializar y recargar `state.yaml`, desbloqueando los linajes de remediación pendientes en cambios paralelos como `cx0-context-measurement` y `k6d-complexity-architecture-delta`.
  - **Especificaciones y ADRs normativos**: Incorporados en `openspec/specs/verify-lineage/spec.md` los requisitos `REQ-verify-lineage-010`, `REQ-verify-lineage-011` y `REQ-verify-lineage-012`; promovidos los ADRs `docs/adr/adr-20260902-001`, `002` y `003`.
  - Verify PASS (14/14 tareas), suite de linaje y almacenamiento al 100% (25/25 tests), Gate 4R aprobado (0 hallazgos bloqueantes); archivado transaccional en `openspec/changes/archive/2026-09-02-verify-lineage-candidate-persistence/`.

## [2.56.6] - 2026-09-01

### Fixed
- **Restauración íntegra del contrato K6c (`adversarial-challenges`)**: Recuperadas en `openspec/specs/adversarial-challenges/spec.md` todas las garantías normativas y escenarios de `REQ-adversarial-challenges-003` y `REQ-adversarial-challenges-004`, conservando la prohibición de `context.runWorkspaceTests`; reforzado `scripts/manifest-sync.test.js` con un inventario de 13 escenarios y cláusulas críticas que detecta reducciones semánticas aunque permanezcan los Requirement IDs.
- **Verificación directa**: `node scripts/check.js` (2915 tests pasando, 0 fallos y 1 omitido).

## [2.56.5] - 2026-08-31

### Fixed
- **Integridad de especificaciones y confinamiento estricto del runner sandboxed en K6c (`k6c-spec-integrity-and-runner-seam-remediation`)**:
  - **Restauración canónica de `adversarial-challenges`**: Recuperadas íntegramente las cláusulas de `REQ-adversarial-challenges-003` y `REQ-adversarial-challenges-004` en `openspec/specs/adversarial-challenges/spec.md`, erradicando el token corrupto `undefined` introducido por fallos de split bajo CRLF.
  - **Validación fail-closed de integridad de especificaciones en archive**: Incorporados los códigos de rechazo `corrupted-spec-content` y `dropped-requirement-id` en `scripts/lib/archive-plan.js` y `scripts/lib/archive-transaction.js`. La transacción aborta en preflight ante cualquier token `undefined`, `[object Object]` o supresión de `{#REQ-...}` de `target_before` no declarada explícitamente en `## REMOVED Requirements`.
  - **Confinamiento estricto del runner sin seams en contexto**: Eliminada la lectura de `context.runWorkspaceTests` en la API pública `executeChallengePlan` de `scripts/lib/adversarial-challenges/runner.js`. La suite del candidato se ejecuta estrictamente en un subproceso aislado (`executeSandboxedCommand`) dentro del sandbox efímero, aislando la inyección de test runners para unit tests a parámetros posicionales directos en `runIsolatedMutation` (`REQ-adversarial-challenges-004`).
  - **Tests de invariantes globales e integración adversarial**: Añadidos tests en `scripts/manifest-sync.test.js`, `scripts/lib/archive-plan.test.js`, `scripts/lib/archive-transaction.test.js` y prueba negativa en `scripts/lib/adversarial-challenges/runner.test.js` asegurando que mocks pasados en contexto son estrictamente ignorados.
  - **ADRs y cierre SDD**: Promovidos `docs/adr/adr-20260831-007` y `docs/adr/adr-20260831-008`. Verify PASS (16/16 escenarios), 2912 tests pasando, 4R review aprobado (0 hallazgos bloqueantes); archivado transaccional en `openspec/changes/archive/2026-08-31-k6c-spec-integrity-and-runner-seam-remediation/`.

### Changed
- K6c queda sellado de forma definitiva con integridad canónica normada y confinamiento de ejecución; K6d permanece `next-eligible`.

## [2.56.4] - 2026-08-31

### Fixed
- **Integridad fail-closed y control de presupuesto en K6c (`k6c-budget-execution-failclosed`)**:
  - **Enforcement monotónico de `mutation_budget`**: Propagación estricta de `ChallengeBudgetTracker` y consumo unitario (`consumeMutations(1)`) antes de cada mutación evaluada en `focal-mutation` (`scripts/lib/adversarial-challenges/runner.js`), deteniendo la ejecución inmediatamente con `causal-failure/v1` tipado `CHALLENGE_BUDGET_EXHAUSTED` (dimensión `mutation_budget`, categoría `validation_gap`) ante agotamiento de cuota (`REQ-adversarial-challenges-003`).
  - **Clasificación estricta de errores de infraestructura vs test failures**: Asignación explícita de `failure_class: "spawn_error"` en `child.on("error")` y bloque `catch` de `scripts/lib/worker-sandbox.js`. En `runner.js`, cualquier error de spawn, timeout (`failure_class: "timeout"`), rechazo de sandbox (`sandbox_rejection`) o cancelación (`cancel`) emite `outcome: "error"` (`CHALLENGE_EXECUTION_ERROR` o `CHALLENGE_TIMEOUT`) sin incrementar bajo ninguna circunstancia `defects_detected` ni producir falsos aprobados (`REQ-adversarial-challenges-004`).
  - **Tests adversariales y de regresión**: Batería exhaustiva de tests negativos para `mutation_budget: 1` ($\ge 2$ mutaciones), `mutation_budget: 0`, errores de spawn en procesos hijos y timeouts en `scripts/lib/adversarial-challenges/runner.test.js` y `scripts/lib/worker-sandbox.test.js`.
  - **Especificación y ADRs**: Actualizada la especificación normativa `adversarial-challenges` (`REQ-003`, `REQ-004`) y promovidos los ADRs `docs/adr/adr-20260831-005` y `docs/adr/adr-20260831-006`.
  - Verify PASS 12/12 MUST, 43/43 tests focalizados, 11/11 tareas completadas, 4R review aprobado (0 hallazgos bloqueantes); archivado transaccional en `openspec/changes/archive/2026-08-31-k6c-budget-execution-failclosed/`.

### Changed
- K6c queda cerrado en su totalidad con enforcement real de presupuesto y discriminación estricta de errores de tooling; K6d permanece `next-eligible`.

## [2.56.3] - 2026-08-31

### Fixed
- **Endurecimiento de recuperación en instaladores ante errores transitorios de filesystem (`harden-installer-fs-recovery`)**:
  - **Primitiva centralizada de reintentos**: Implementada `withTransientFsRetries` y `mutateFs` en `scripts/configure/install-engine.js` para reintentar de forma acotada (0-5 intentos, backoff con `sleep` inyectable) exclusivamente ante errores transitorios de filesystem (`EPERM`, `EACCES`, `EBUSY`), fallando de inmediato ante errores permanentes como `ENOENT`.
  - **Rollback resiliente**: Integrada la política de reintentos en cada paso individual de restauración de `createRollbackJournal` y en `createFilesystemTransaction.rollback()` (`restorePath` y `removePathIfPresent` en `scripts/configure/install-codex.js`), garantizando recuperación consistente frente a locks temporales en Windows/POSIX.
  - **Preservación de identidad de target en poda**: Propagadas las opciones de reintento (`retryOptions`) a `pruneStaleFiles` en Antigravity y Cursor, asegurando diagnósticos enriquecidos que identifican explícitamente el instalador afectado ante agotamiento de reintentos.
  - **Migración transversal de targets**: Aplicada la tolerancia transitoria a Antigravity, Cursor, Codex, VS Code, GitHub Copilot, OpenCode y sincronizaciones de repositorio en `install-target.js`.
  - **Especificación y ADRs**: Actualizada la especificación `install` (`REQ-install-016`, `REQ-install-017`, `REQ-install-018`) y promovidos los ADRs `docs/adr/adr-20260831-001` a `003`.
  - Verify PASS 8/8 MUST, 16/16 tareas; archivado en `openspec/changes/archive/2026-08-31-harden-installer-fs-recovery/`.

## [2.56.2] - 2026-08-31

### Fixed
- **Fail-closed K6c (`k6c-failclosed-integrity`)**:
  - El verifier y el projector/replay pasan la `evidenceStrategy` seleccionada (`selectStrategy`) a `validateChallengeResultSet`; un ChallengePlan canónico de otra estrategia (p. ej. verifier `feature` + plan `bug`) falla con `CHALLENGE_INTEGRITY_INVALID` / `GRAPH_DIVERGENCE`.
  - `missing_tests`, `mutations_tested === 0` y revert/mutación sin cambio de bytes emiten `outcome: "error"` (`MISSING_TESTS` / `NO_MUTATION_APPLIED` / `CHALLENGE_NOOP`), nunca `passed` ni `COMPLACENT_TEST_DETECTED`.
  - `createChallengePlan` rechaza estrategia omitida, vacía o desconocida con `TypeError` (sin coerción a `strict-tdd`). El verifier conserva el fallback Strict TDD de REQ-002 cuando no hay estrategia declarada.
  - `challenge-result/v1` deja de duplicar `node_id` en `required`; `validateSchemaDocument` recorre `uniqueItems` de `required` (Draft 2020-12, sin Ajv).
  - Archivos: `scripts/lib/independent-verifier/{index,challenge-evidence}.js`, `scripts/lib/assurance-graph/{projector,index}.js`, `scripts/lib/adversarial-challenges/{integrity,planner,runner}.js`, `scripts/lib/kernel-schema-validator.js`, `schemas/kernel/challenge-result/v1.schema.json`.
  - Ciclo SDD completo (ruta standard, TDD focused, 4R approved). Verify PASS WITH WARNINGS (33/33 MUST; el exit 1 de `npm test` es un after-hook EISDIR preexistente en `scripts/configure/cli.test.js`, no causado por este cambio). 4R: 0 BLOCKER/CRITICAL, 2 WARNING de readability (advisory). Archivado en `openspec/changes/archive/2026-08-31-k6c-failclosed-integrity/`.

### Changed
- K6c permanece `done` con el fail-closed de strategy/missing_tests cerrado; K6d sigue `next-eligible` y no se inicia.
- Specs `adversarial-challenges` (REQ-002, REQ-004), `independent-verification` (REQ-010), `assurance-graph` (REQ-009) y `kernel-contract-schemas` (REQ-029).
- ADRs `docs/adr/adr-20260831-001` a `004`.

## [2.56.1] - 2026-08-31

### Fixed
- **Integridad K6c (`k6c-integrity-remediation`)**:
  - Frontera canónica compartida: schemas, IDs, bindings Candidate/nodo/estrategia/`PolicySnapshot` y cardinalidad exacta en planner, runner, verifier y proyección.
  - Ejecución aislada fail-closed: cada challenge muta y corre sobre un workspace K6a; timeout sticky; tipos sin executor emiten `CHALLENGE_CAPABILITY_UNAVAILABLE` (no `{ pass: true }`).
  - El verifier exige el conjunto exacto de plan/resultados y emite `challenge_verification`; casos missing, duplicate y foreign no habilitan K6d.
  - Assurance Graph proyecta plan/resultados como nodos derivados no autoritativos; el replay produce `graph_id` byte-idéntico.
  - Fixtures `malformed-hash` y pares cross-bound; tests de revert complaciente vs `revert_verified`.
  - Verify PASS 24/24 MUST, 30/30 tareas; 4R approved (3 CRITICAL remediados). Archivado en `openspec/changes/archive/2026-08-30-k6c-integrity-remediation/`.

### Changed
- K6c permanece `done` con la integridad cerrada; K6d queda `next-eligible`.
- Specs `adversarial-challenges` (REQ-002, REQ-004), `independent-verification` (REQ-010), `assurance-graph` (REQ-009) y `kernel-contract-schemas` (REQ-029).
- ADRs `docs/adr/adr-20260830-001` a `003`.

## [2.56.0] - 2026-08-28

### Added
- **Iniciativa K6c — Adversarial Challenges (Policy-Selected)**:
  - **Catálogo de Challenges**: Catálogo tipado y cerrado de 9 tipos (`revert`, `focal-mutation`, `independent-acceptance`, `regression-acceptance`, `compatibility-acceptance`, `test-inspection`, `structural-validation`, `behavior-equivalence`, `rollback`) con objetivos normativos y validación fail-closed (`scripts/lib/adversarial-challenges/catalog.js`).
  - **Planificador determinista proporcional**: Emisión determinista de `ChallengePlan` (`challenge-plan/v1`) con selección proporcional según estrategia de evidencia (`bug`, `refactor`, `migration`, `config-docs`, `feature`, `strict-tdd`) y `PolicySnapshot`, omisiones con razones explícitas y hash SHA-256 (`scripts/lib/adversarial-challenges/planner.js`).
  - **Control de Presupuesto y Fallo Causal**: Tracker monótono de `ChallengeBudget` con límites (`max_challenges`, `mutation_budget`, `timeout_seconds`) y transición inmediata a `causal-failure/v1` con razón `CHALLENGE_BUDGET_EXHAUSTED` y categoría `validation_gap` (`scripts/lib/adversarial-challenges/budget.js`).
  - **Mutaciones Focales y Detección de Complacencia**: Inyección de mutaciones focales de operadores acotadas estrictamente a líneas modificadas en el candidato congelado, reversión de patches, e inspección de tests complacientes (`COMPLACENT_TEST_DETECTED`) y aserciones tautológicas (`TAUTOLOGICAL_TEST_DETECTED`) (`scripts/lib/adversarial-challenges/mutator.js`, `runner.js`).
  - **Nuevos Esquemas Kernel**: `challenge-plan/v1.schema.json` y `challenge-result/v1.schema.json` (JSON Schema 2020-12) con fixtures canónicas válidas e inválidas, registrados en `manifest.json` y `contract-claims.json`.
  - **Integración con Verifier Independiente**: `verifyCandidate` evalúa `challengePlan` y `challengeResults` como evidencia complementaria de calidad técnica, aplicando fail-closed ante fallos o agotamiento de presupuesto, sin conceder en ningún caso autoridad de entrega o delivery (`REQ-harness-authority-canon-012`, `rejectDeliveryAuthorityMisuse`).

### Changed
- K6c pasa a `done`; K6d queda `next-eligible`.
- Specs `adversarial-challenges` (nueva capacidad), `independent-verification` (REQ-010), `kernel-contract-schemas` (REQ-001, REQ-029) y `harness-authority-canon` (REQ-011, REQ-012).
- ADRs `docs/adr/adr-20260828-019` a `022`.
- Ciclo SDD completo `k6c-policy-selected-challenges` (verify PASS 29/29 escenarios; 4R approved; archivado en `openspec/changes/archive/2026-08-28-k6c-policy-selected-challenges/`).

## [2.55.0] - 2026-08-28

### Added
- **Persistencia durable de `runner-receipt/v1` entre procesos**:
  - Colección CAS aditiva `runner_receipts` en la raíz del registro de Authority Store, distinta de `authority.receipts` (OperationReceipt).
  - Tras restart: rehidratación, recomputación de `receipt_id` y reemisión de un canal opaco **nuevo** (el WeakMap no se serializa).
  - Bags con forma de array fallan cerrados (`receipt-kind-mismatch` / `INVALID_RUNNER_RECEIPT`); no emiten canal de confianza ni retaguean en silencio.
- **Binding de `assessment.role` en replay**: `normalizeRole(assessment.role)` debe coincidir con el del RunnerReceipt; mismatch → `GRAPH_DIVERGENCE` aunque `assessment_id` se recalcule.

### Changed
- K6b pasa a `done`; K6c queda `next-eligible`.
- Specs `assurance-graph` (REQ-006), `independent-verification` (REQ-009) y `authority-store` (REQ-018).
- ADRs `docs/adr/adr-20260828-015` a `018`.
- Ciclo SDD `k6b-durable-replay-receipt-authority` (verify PASS WITH WARNINGS; 4R approved tras remediación del CRITICAL de type-confusion). Archivado en `openspec/changes/archive/2026-08-28-k6b-durable-replay-receipt-authority/`.

## [2.54.0] - 2026-08-28

### Security
- **Autoridad y binding exacto de RunnerReceipt (`runner-receipt/v1`)**:
  - Nuevo contrato kernel `ospec://schemas/kernel/runner-receipt/v1` con `receipt_id` content-addressed y `evidence_id` obligatorio.
  - `verifyCandidate` rechaza DTOs caller-owned `runner_receipts`/`receipts` (`UNTRUSTED_RUNNER_RECEIPT`) y solo consume un canal opaco `runnerReceiptChannel` emitido por el runtime.
  - Se elimina matching por posición/nodo y fallback de role a `node.kind`; Candidate, Evidence y nodo deben coincidir exactamente (`INVALID_RUNNER_RECEIPT` / `RUNNER_RECEIPT_BINDING_MISMATCH`).
  - `outcome: failed` con tokens satisfechos falla con `INVALID_RUNNER_RECEIPT`.
- **Cronología y replay fail-closed completos**:
  - Strategies temporales exigen `run_id` único no vacío, ordinales estrictos y `previous_evidence_id` en cada transición posterior a la raíz.
  - Replay exige bytes o `observation_blob_id` content-addressed resoluble, más el canal de receipts; sin material de observación retorna `GRAPH_DIVERGENCE`.

### Changed
- K6b permanece `revise` pendiente de terminal review objetivo; K6c sigue `blocked-by-K6b-terminal-review`.
- Dominios `independent-verification`, `assurance-graph` y `kernel-contract-schemas` enrolados en el baseline (skip) y reconciliados contra `a476b9a`.
- ADR `docs/adr/adr-20260828-014-runner-receipt-authority-binding.md`. Specs `independent-verification`, `assurance-graph` y `kernel-contract-schemas`.
- Remediación directa post-v2.53.1, documentada con `sdd-baseline` (skip) y `sdd-reconcile`. Verificación: focused K6b 115 pass; `npm test` PASS. Archivado en `openspec/changes/archive/2026-08-28-k6b-receipt-binding-and-replay-finalization/`.

## [2.53.1] - 2026-08-28

### Security
- **Segregación física de `rawEvidence` y rechazo explícito de metadatos de caller (`UNTRUSTED_CALLER_METADATA`)**:
  - `normalizeEvidence` rechaza de forma fail-closed (`UNTRUSTED_CALLER_METADATA`) cualquier observación `rawEvidence` que contenga propiedades semánticas (`role`, `obligation_ids`, `obligation_id`, `evidence_requirements_satisfied`).
  - Las observaciones físicas admiten estrictamente: `bytes` / `rawBytes`, `provenance`, `origin`, `node_id`, `execution_sequence`.
  - Se eliminan atributos semánticos del payload devuelto por `normalizeEvidence`.

### Changed
- **Derivación autoritativa desde Runner Receipts y eliminación de copia ciega**:
  - `verifyCandidate` resuelve `role` y `obligation_ids` consultando el Execution Graph y runner receipts (`node.role`, `node.kind`, `receipt.role`, `graphObligations.implemented_by`).
  - `evidence_requirements_satisfied` se deriva exclusivamente de los tokens atestiguados en `runner_receipts` o `receipts` del harness; se erradica por completo la copia automática de `node.required_evidence`.
  - Ausencia de receipts para una obligación MUST produce `UNFULFILLED_MUST` sin generar afirmaciones espurias.
- **Validación cronológica causal obligatoria por `execution_sequence`**:
  - `assertRoleOrder` exige la presencia de `execution_sequence` (`run_id`, `ordinal` monotónico creciente y `previous_evidence_id`) en estrategias temporales (`strict-tdd`, `bug`, `refactor`).
  - Se prohíbe explícitamente el fallback al orden posicional del array JSON.
  - Verificación causal estricta: `red.ordinal < green.ordinal` (y enlace `previous_evidence_id`) en TDD, `red < patch < green` en `bug`, y `before < after` en `refactor`. Violaciones emiten `STRATEGY_SEQUENCE_VIOLATION`.
- **Replay criptográficamente íntegro de Evidence en Assurance Graph**:
  - `validateReplayRecords` recomputa `digestRawBytes` y `computeEvidenceId(record, bytes)` validando igualdad exacta contra `record.digest` y `record.evidence_id`.
  - Revalidación obligatoria de procedencia mediante `evaluateProvenanceSufficiency(record, { requireRuntime: true })`, fallando con `GRAPH_DIVERGENCE` ante adulteración de digest, id o insuficiencia de provenance.
  - ADRs `docs/adr/adr-20260828-010` a `013`. Specs `independent-verification` y `assurance-graph`.
  - Cierre declarado originalmente para B1, B2, B3 y H1. El review terminal post-release reabrió receipt authority/binding, causalidad completa y replay sin material; ver errata del verify report. Archivado en `openspec/changes/archive/2026-08-28-k6b-trusted-evidence-replay-closure/`.

## [2.53.0] - 2026-08-28

### Added
- **Publicación canónica de `assessment/v2` (`ospec://schemas/kernel/assessment/v2`)**:
  - `evidence_requirements_satisfied` obligatorio con `minItems: 1` para afirmaciones de satisfacción efectiva.
  - Restauración retrocompatible de `assessment/v1` (`ospec://schemas/kernel/assessment/v1`) al contrato original sin forzar campos rompientes.
  - Registro de familia de esquema v2 en `schemas/kernel/manifest.json`, `contract-claims.json` y checkers de compatibilidad.

### Changed
- **Integridad semántica y frontera de confianza en verificación K6b (`k6b-evidence-binding-and-schema-stability-remediation`)**:
  - Desacoplamiento estricto de `rawEvidence` (observación física: `bytes`, `provenance`, `origin`, `node_id`, `execution_sequence`) respecto a metadatos de confianza (`role`, `obligation_ids`, `evidence_requirements_satisfied`), derivados autoritativamente por el verifier contra el Execution Graph y runner receipts.
  - Matriz de incompatibilidad de roles (`red` ↔ `green`, `characterization-before` ↔ `characterization-after`, `negative` ↔ `acceptance`) en lugar de prohibición universal de aliasing, permitiendo compartición no conflictiva (`integration` + `acceptance`).
  - Validación cronológica causal en refactor (`characterization-before` < `characterization-after`) y TDD (`red` < `green`) basada en `execution_sequence` y `previous_evidence_id`.
  - Recomputación y validación autoritativa de `openspec_input_digest` en `resolveCanonicalInputDigests()`, fallando con `GRAPH_DIVERGENCE` ante cualquier discordancia.
  - Revalidación integral en `replayAssuranceGraph` para `evidence/v2`, `verification/v2` y `assessment/v2` contra adulteraciones o desalineaciones de `candidate_id` y procedencia.
  - Proyección de aristas `satisfies` en el Assurance Graph condicionada a satisfacción no vacía (`evidence_requirements_satisfied.length > 0`).
  - ADRs `docs/adr/adr-20260828-004` a `006`. Specs `kernel-contract-schemas`, `independent-verification` y `assurance-graph`.
  - Cierre definitivo de K6b; K6c queda `next-eligible`. Ciclo SDD completo (ruta standard, verify PASS 93 tests focales, 0 issues, 4R approved). Archivado en `openspec/changes/archive/2026-08-28-k6b-evidence-binding-and-schema-stability-remediation/`.

## [2.52.0] - 2026-08-28

### Changed
- **Integridad semántica K6b (`k6b-semantic-integrity-remediation`)**:
  - Roles de estrategia incompatibles no pueden compartir un `EvidenceId`; el orden temporal RED→GREEN / RED→PATCH→GREEN es fail-closed (`STRATEGY_EVIDENCE_ALIAS`, `STRATEGY_SEQUENCE_VIOLATION`).
  - Cobertura MUST token a token persistida en `assessment/v1` (`evidence_requirements_satisfied`); omisión o subconjunto incompleto falla cerrado.
  - El digest de contrato se comprueba antes de strategy (`BINDING_MISMATCH` sin verdict).
  - Projector, replay y reconcile del Assurance Graph fallan cerrados ante inputs canónicos contradictorios, assessments tampered o payload almacenado incompleto (`GRAPH_DIVERGENCE`).
  - `evidence/v2`, `verification/v2` y K1 v1 permanecen byte-identical. ADRs `docs/adr/adr-20260828-001` a `003`.
  - K6b queda `done`; K6c pasa a `next-eligible`. Verify: 2762 pass, 0 fail; 4R approved (4 WARNING advisory). Archivado en `openspec/changes/archive/2026-08-27-k6b-semantic-integrity-remediation/`.

## [2.51.0] - 2026-08-27

### Added
- **Remediación de integridad K6b (`k6b-verification-integrity-remediation`)**:
  - PASS exige evidencia admisible por cada obligación MUST del Execution Graph; `strategy satisfied ≠ Execution Graph satisfied`.
  - Contrato aditivo `assessment/v1` (`ospec://schemas/kernel/assessment/v1`): binding persistible EvidenceId ↔ role ↔ obligation_id ↔ node_id ↔ policy, sin mutar `evidence/v2` ni K1 v1.
  - Provenance fuerte derivada del canal del harness (`input.collector` / `input.collectors[]`); `collector` en el sobre del worker falla cerrado (`UNTRUSTED_COLLECTOR`). Desacuerdo claim↔canal simétrico; weak+allowlist no escala a clase fuerte.
  - `graph_id` fingerprinta inputs canónicos; proyección fail-closed (`GRAPH_PROJECTION_FAILED` / `GRAPH_DIVERGENCE`); `rejectForbidden` por kind/namespace.
  - ADRs `docs/adr/adr-20260827-007` a `010`. Specs `independent-verification`, `assurance-graph` y `kernel-contract-schemas`.
  - K6b queda `done`; K6c pasa a `next-eligible`. Ciclo SDD completo (ruta standard, high-risk, size:exception, 4R successor approved). Verify: 2754 pass, 0 fail. Archivado en `openspec/changes/archive/2026-08-27-k6b-verification-integrity-remediation/`.

## [2.50.0] - 2026-08-27

### Added
- **Verifier independiente, evidence v2 y Assurance Graph (K6b, `k6b-verifier-evidence-assurance-graph`)**:
  - Verifier fail-closed sobre Candidate congelado (`CandidateId`, no `WorkResultId`); estrategias bug/feature/refactor/migration/config-docs con provenance y fallback Strict TDD sin reescribir `tdd_mode`.
  - Contratos aditivos `evidence/v2` y `verification/v2`; `evidence/v1`, `verification/v1` y pins K1 permanecen byte-identical.
  - Assurance Graph `v1` como proyección content-addressed (no autoridad): invalidación selectiva del closure dependiente; manifest de equivalencia no promocional.
  - ADRs `docs/adr/adr-20260827-004` a `006`. Specs `independent-verification` y `assurance-graph`; deltas en `kernel-contract-schemas` y `harness-authority-canon`.
  - Ciclo SDD completo (ruta standard, high-risk, size:exception, 4R approved). Follow-up 4R: provenance anyOf/negative y casos `satisfies`/`verified-by` del closure. Archivado en `openspec/changes/archive/2026-08-27-k6b-verifier-evidence-assurance-graph/`.

## [2.49.0] - 2026-08-27

### Added
- **Briefing funcional de intención (`orchestrator-intent-briefing`)**:
  - `/sdd-new`, `/sdd-ff` y `/sdd-lite` (y equivalentes en lenguaje natural) presentan un resumen funcional de 2–4 líneas antes de clasificar, tanto si la petición es vaga como si es concreta.
  - Hasta 2 correcciones; después solo se puede confirmar la última síntesis o abortar. Mientras espera no crea `openspec/changes/{name}/`.
  - Al aceptar, persiste `gate: intent-briefing` (`synthesis`, `scope`) en `state.yaml` y después clasifica. Al abortar, cero artefactos y no hay clasificación.
  - `/sdd-continue`, fases posteriores con briefing ya aceptado y el trabajo cosmético del Ambient Gate no reabren el gate.
  - Corpus de evals 7→9 (`specific-request-no-artifact`, `continue-no-rebrief`) y goldens de configure regenerados.
  - K10 sigue pendiente para generalizar `clarify-intent` como receta de grafo. Follow-up 4R: landmarks de aborto independiente y de síntesis fresca.
  - Ciclo SDD completo (ruta standard, size:exception, 4R approved). Verify: 41/41, `npm test` 2677 pass. Archivado en `openspec/changes/archive/2026-08-27-orchestrator-intent-briefing/`.

## [2.48.3] - 2026-08-26

### Fixed
- **Cierre de invariantes K4b (`k4b-mode-only-and-baseline-projection`)**:
  - **Mode-only fail-closed**: un diff solo-modo sobre un path ausente aborta con `MALFORMED_UNIFIED_DIFF`; si el `old mode` no coincide con el de la base autorizada (default `100644`) aborta con `INVALID_FILE_MODE`. No se congela Candidate ni se materializan archivos fantasma.
  - **Baseline graph-bound**: el orchestrator ya no rellena `baseline.executionGraph` con el Graph shadow. Una baseline no canónica y sin artefactos propios produce `INVALID_COMPARISON_PROJECTION` en telemetría; la orquestación sigue `ok: true` (REQ-006). El E2E usa una proyección canónica de siete dimensiones.
  - Ciclo SDD completo (ruta bugfix, 4R approved, 0 hallazgos). Verify: 49/49 focales y `npm test` en verde. Archivado en `openspec/changes/archive/2026-08-26-k4b-mode-only-and-baseline-projection/`.

## [2.48.2] - 2026-08-26

### Fixed
- **Invariantes de integración K4b (`k4b-integration-invariants-remediation`)**:
  - **Patches malformados fail-closed**: un `WorkResult.patch` no vacío que no parsea, create/delete solo-cabecera o `@@` inválido aborta con `MALFORMED_UNIFIED_DIFF` y no congela Candidate; los diffs solo-modo siguen siendo válidos.
  - **Cápsula mínima Option A**: `WorkOrder` v2 exige `capsule_inputs` concretos; K4a los emite (inventario opcional ligado a `source_snapshot_id`); K6a materializa `EffectiveShadowBase ∩ capsule_inputs`, no el árbol derivado completo.
  - **Conflictos DAG**: `detectPredecessorContextConflicts` solo rechaza predecesores incomparables; el refinamiento secuencial sobre el mismo contexto lo valida el apply estricto.
  - **Store 1:N**: `repair-shadow-execution/v1` se indexa por fingerprint interno; un Candidate admite varias ejecuciones; `CandidateId` queda como índice secundario, no como quinta identidad.
  - **Comparador canónico**: la proyección del ExecutionGraph entrega las siete dimensiones con `steps = node_id` topológico.
  - Ciclo SDD completo (ruta standard, high-risk, 4R approved). Verify: 2667 pass, 0 fail. Archivado en `openspec/changes/archive/2026-08-26-k4b-integration-invariants-remediation/`.

## [2.48.1] - 2026-08-26

### Fixed
- **Remediación de corrección K4b (`k4b-correctness-remediation`)**:
  - **Despacho exclusivo vía K6a**: `orchestrateRepairShadow` llama `executeWorkOrder({ workOrder, workspace, ... })` con firma de objeto; `executorFn` queda fuera de la API productiva; `executorOptionsByNode` solo admite `commands`, `command`, `args`, `signal` y `declaredTargets`.
  - **Propagación material de dependencias**: N2 consume el árbol integrado de N1 mediante `EffectiveShadowBase` derivada y workspace fresco por nodo; el freeze de Candidate sigue anclado al `SourceSnapshot` original.
  - **Integrador fail-closed**: hunks validan contexto, borrado, counts y solapes; containment usa `WorkOrder.allowed_paths` del productor; los cambios de mode entran en Candidate v2.
  - **Comparador de siete dimensiones**: steps, dependencies, diffs, inventory, obligations, invariants y execution metrics se evalúan siempre; vacíos no se omiten; métricas estables frente al reloj.
  - **Registro auditable `repair-shadow-execution/v1`**: persistencia obligatoria sobre `filesystem-store` con bindings Candidate ↔ Graph ↔ PolicySnapshot; sin store no hay promoción.
  - **E2E real K4a → K4b → K6a → K3**: N1 añade `multiply()` y N2 lo importa y ejecuta (`multiply_ok=6`) con WorkerTransport y WorkerIsolation controlados.
  - **Cierre de iniciativa**: K4b pasa a `done`; K6b queda `next-eligible`. Archivado en `openspec/changes/archive/2026-08-25-k4b-correctness-remediation/`.

## [2.48.0] - 2026-08-25

### Added
- **Orquestación de Repair Shadow K4b (`k4b-repair-shadow-execution`)**:
  - **Orquestador Repair Shadow (`scripts/lib/repair-shadow/orchestrator.js`)**: Consumo del `ExecutionGraph` compilado por K4a (`compileExecutionGraph`), validación de vinculación con `SourceSnapshot` y despacho determinista de `WorkOrder` v2 en orden topológico.
  - **Despacho Exclusivo y Workspaces Efímeros vía K6a**: Ejecución aislada nodo a nodo mediante `createWorkspace`, `materializeSourceSnapshot`, `executeWorkOrder`, `captureWorkResult` y `disposeWorkspace`, exigiendo `isolationReported: "enforced"` sin fallbacks locales no confinados.
  - **Integración Determinista de Parches y Freeze de Candidate v2 (`patch-integrator.js`)**: Aplicación de unified diffs sobre la base autorizada con contención estricta de `allowed_paths`, cálculo del árbol candidato y congelación exclusiva de `CandidateId` mediante `freezeCandidate` de K3.
  - **Cadena Criptográfica de 4 Identidades E2E**: Verificación estricta de proveniencia `SourceSnapshotId` → `WorkOrderId` → `WorkResultId` → `CandidateId` con validación y recomputación fail-closed.
  - **Comparador Shadow Pasivo vs Baseline Fixed (`shadow-comparator.js`)**: Evaluación dimensional (steps, diffs, obligaciones, invariantes, inventario) y telemetría estructurada sin mutar el flujo activo, branches ni defaults de producción.
  - **Frontera Arquitectónica Unidireccional K4b → K6a**: Consumo de primitivas K6a con verificación estática de cero referencias o acoplamiento inverso hacia Repair en K6a.
  - **Especificación y ADRs Normativos**: Publicada capacidad `repair-shadow-orchestration` en `openspec/specs/` y promovidos ADRs 20260825-006 a 20260825-009 en `docs/adr/`.

## [2.47.2] - 2026-08-25

### Fixed
- **Endurecimiento de la frontera de aislamiento K6a (`k6a-isolation-frontier-hardening`)**:
  - Política de sandbox inmutable: el preload congela `{workspaceRoot, allowedPaths}` y `confineChildEnv` reconstruye `OSPEC_SANDBOX_*` y `NODE_OPTIONS` desde ese snapshot, no desde `process.env` vivo.
  - Wrap exhaustivo de APIs mutantes de filesystem en Node 22 (`mkdtemp*`, `chmod*`/`chown*`/`utimes*`/`lutimes*`, fd y `FileHandle`) con fail-closed fuera de `allowed_paths`.
  - WorkerIsolation ligada a la identidad viva del `WorkerTransport` que ejecuta (`port_id` + fingerprint SHA-256); el probe de contención son tres escrituras reales (PASS / BLOCKED / BLOCKED) y `{blocked:true}` vacuo no autoriza `enforced`.
  - Comandos fail-closed salvo `isolationReported=enforced` (REQ-008 alineado al runtime); K4b y jail de OS siguen fuera de alcance.
  - Interceptación de `worker_threads.Worker` en el preload: `execArgv: []` no puede soltar `--require`; `SHARE_ENV` falla cerrado.
  - Escrituras permitidas bajo alias de `tmpdir` (p. ej. `/var` → `/private/var` en macOS) se juzgan por `realpath`, no por `path.relative` de la forma no canónica.
  - Ciclo SDD completo (ruta standard, high-risk, 4R approved, finding `F-a93a0811da865770` resuelto). Verificación: PASS (35/35 MUST). Tras la corrección 4R, `node --test scripts/lib/worker-sandbox.test.js` 20/20.

## [2.47.1] - 2026-08-25

### Fixed
- **Cierre de escapes de proceso en el sandbox K6a**:
  - La confianza en Node se liga al `realpath(process.execPath)` autorizado; ejecutables arbitrarios llamados `node` o `node.exe` se rechazan fail-closed.
  - `spawn`, `spawnSync`, `execFile`, `execFileSync` y `fork` reconstruyen el entorno de cada Node hijo y fuerzan el preload y las variables de contención, aunque el caller pase `env: {}` o intente vaciarlas.
  - Tests adversariales verifican ambos bypasses, variantes sync/async de entorno y `fork`, además de conservar el alias legítimo del runtime.

## [2.47.0] - 2026-08-25

### Added
- **Contrato verificable de `sdd-document` (P1–P7, `harden-sdd-document-contract`)**:
  - **Canonicidad y cobertura en el plan**: Step 5b exige mapa `canonical for` y propuestas de cobertura en update mode antes de editar páginas existentes.
  - **Re-descubrimiento y hechos volátiles**: Update Mode re-escanea el repo actual y re-verifica contadores, umbrales y versiones en cada run; el no-op solo refresca `updatedAt`/`gitHead` en `.last-update.json`.
  - **Checklist medible (Step 6.4) y pase factual (Step 6.5)**: umbrales de densidad, grafo de enlaces, heurística Mermaid y contraste de cifras/identificadores citados; el generador no auto-certifica calidad de contenido.
  - **Metadatos completos (Step 6.6)**: `sections` lista todas las páginas; `filesSkipped` pasa a `{file, reason}[]`.
  - **QA J6 orchestrator-owned**: `route-document.md` §7 registra `gates.content-qa` y detiene el cierre ante hallazgos confirmados (re-dispatch por defecto). Tests L1 de contrato y oráculos L2 in-test; eval golden conductual de J6 queda como deuda documentada.

## [2.46.9] - 2026-08-24

### Fixed
- **Blindaje de Frontera Genérica de Proceso, Restricción de Subprocesos y Contención de Symlinks (K6a / REQ-008)**:
  - **Rechazo Fail-Closed de Binarios No-Node sin Sandbox**: `executeSandboxedCommand` rechaza de forma determinista cualquier comando no-Node (`/bin/sh`, `cmd.exe`, `python`, etc.) cuando no cuenta con sandbox nativo verificado, evitando la ejecución de subprocesos no confinados en el host.
  - **Restricción de `child_process` en Procesos Node Sandboxed**: `worker-sandbox-preload.js` intercepta llamadas de creación de subprocesos (`spawn`, `spawnSync`, `exec`, `execSync`, `execFile`, `execFileSync`), bloqueando intentos de invocar shells o binarios arbitrarios con `EACCES: permission denied by worker sandbox`.
  - **Blindaje Estricto de `assertWriteAllowed` y Symlinks**: Validación con `isOutsideNorm || isOutsideReal`, resolución ascendente de ancestros mediante `realpath` para detectar enlaces simbólicos externos antes de cualquier escritura e intercepción de `fs.symlink` / `promises.symlink` impidiendo la creación de enlaces con destino fuera de la raíz del workspace.
  - **Tests Adversariales E2E Completos**: Verificación física de los 3 vectores de contención (ejecución no-Node fail-closed, bloqueo de escape vía `child_process` a shell y bloqueo de escrituras a través de enlaces simbólicos externos).

## [2.46.8] - 2026-08-24

### Fixed
- **Aislamiento Físico y Acoplamiento Real de WorkerTransport al Sandbox de WorkerIsolation (K6a / REQ-008)**:
  - **Sandbox Interceptor en Tiempo de Ejecución**: Implementado `scripts/lib/worker-sandbox-preload.js` y `scripts/lib/worker-sandbox.js` para interceptar llamadas mutantes de filesystem (`writeFileSync`, `mkdirSync`, `openSync`, `promises.*`, etc.) e impedir físicamente cualquier escritura fuera de `allowed_paths` o de la raíz del workspace, lanzando `EACCES: permission denied by worker sandbox` antes de que el archivo toque el disco del host.
  - **Resolución Canónica con Realpath y Compatibilidad con macOS**: Soportada la resolución canónica de rutas mediante `fs.realpathSync` tanto en el workspace root como en los paths objetivo para compatibilidad total con enlaces simbólicos (`/var` -> `/private/var`) en macOS, Linux y Windows.
  - **Acoplamiento Físico de Transports y Primitivas en el Adapter**: `WorkerTransport` y `WorkerIsolation` en `scripts/lib/host-adapters/claude.js` quedan unificados y gobernados por la misma frontera física de ejecución sandbox (`makeSandboxedWorkerPrimitive`).
  - **Inyección de `sandbox_context` en Invocación de Transporte**: `executeWorkOrder` propaga `workspace_root`, `allowed_paths` y `sandbox_context` en la llamada a `WorkerTransport`.
  - **Separación Canónica de Capabilities y Probe Observado**: `WorkerTransport` y `WorkerIsolation` se evalúan independientemente en capability-proof/v1 sin mutar schemas, exigiendo prueba de contención observada por el host (`allowed_write: "PASS"`, `undeclared_workspace_write: "BLOCKED"`, `external_root_write: "BLOCKED"`).
  - **Tests Adversariales E2E Obligatorios**: Verificación física de que intentos de escritura fuera del workspace (`/tmp/...`) o en rutas no declaradas son prevenidos y los archivos nunca llegan a existir en el filesystem del host.

## [2.46.7] - 2026-08-24

### Fixed
- **Aislamiento Físico Riguroso, Enforzamiento Fail-Closed de Subprocesos y Probes de Contención K6a**:
  - **Eliminación Total de Subprocesos Arbitrarios sin Aislamiento**: `executeWorkOrder` rechaza de forma fail-closed (`reason: "subprocess-requires-enforced-isolation"`) cualquier intento de ejecutar comandos o subprocesos externos si el aislamiento no está demostrado y verificado como `enforced`, incluso en órdenes de trabajo etiquetadas como solo lectura (`verify`, `probe`, `read_only`), cerrando cualquier ruta de escape fuera del workspace en entornos no confinados. Las operaciones internas puras del runtime se evalúan en memoria sin subprocesos y reportan honestamente su estado `unavailable`.
  - **Probe Real de Contención en CapabilityProof**: La promoción a `isolationCapability: "enforced"` requiere la demostración empírica de contención física en el probe (`allowed_write: "PASS"`, `undeclared_workspace_write: "BLOCKED"`, `external_root_write: "BLOCKED"`), rechazando con `reason: "containment-probe-unfulfilled"` cualquier transporte o prueba que carezca de estas garantías de sandbox.
  - **Validación Estricta y Verificación Upfront de CLI en Tests**: Corregido el chequeo de disponibilidad de herramientas externas (`git --version`) antes de la ejecución de pruebas de parches y diffs, garantizando que fallos en la aplicación de diffs (`git apply --check` y `git apply`) lancen aserciones fallidas en lugar de ser silenciados o enmascarados como skips.
  - **Reconciliación Histórica de Versiones de Roadmap y Arquitectura**: Reconciliadas las versiones canónicas de entrega en `docs/architecture/harness-evolution.md` alineándolas con el roadmap operativo (K3 en v2.42.3, K4a en v2.45.7, K5 en v2.45.13 y K6a en v2.46.7).

## [2.46.6] - 2026-08-24

### Fixed
- **Cierre Terminal de Aislamiento de Workers, Contención Estructural de Mutaciones y Formato Git Apply K6a**:
  - **Contención Estricta de Mutaciones por Clasificación Estructural**: Sustituida la comprobación superficial de strings (`operation === "apply"`) por clasificación estructural completa basada en `ownership.mode === "exclusive"`, `effect_class === "workspace_mutation"|"irreversible"`, o verbos mutantes (`apply|mutate|build|generate|install|compile`), protegiendo órdenes canónicas como `apply_implementation` de K4a y forzando rechazo fail-closed (`mutation-requires-enforced-isolation`) en fallbacks sin transporte con aislamiento `enforced` verificado. Eliminado `allowUnsafeFallbackMutation`.
  - **Pre-validación Rigurosa de WorkOrder v2 con Schema y Hash Canónico**: `executeWorkOrder` valida de forma estricta las órdenes contra el esquema JSON Schema Draft 2020-12 `work-order/v2`, verifica la coincidencia exacta entre el `work_order_id` declarado y el recomputado mediante `computeWorkOrderId`, y rechaza sin excepción listas de `allowed_paths` vacías (`missing-allowed-paths`).
  - **Formato de Diff Git Real y Aplicable (`git apply` compliant)**: `generateUnifiedDiff` emite cabeceras Git conformes (`diff --git a/{p} b/{p}\nold mode ...\nnew mode ...`), omitiendo hunks vacíos en cambios de solo modo y produciendo diffs válidos verificados directamente mediante `git apply --check` y `git apply`.
  - **Encapsulación y Transiciones de Estado en Registro Privado**: Reemplazado el setter genérico público `updateWorkspaceStatus` por la primitiva restringida `markWorkspaceInterrupted(workspaceId, reason)`, validando la máquina de estados (`active` -> `interrupted`) y blindando el registro privado frente a mutaciones externas arbitrarias.
  - **Triangulación Zero-Trust y Manejo Conforme de Symlinks en Tests**: Corregido el test zero-trust en `worker-workspace.test.js` calculando hashes SHA-256 por archivo con triangulación positiva y negativa; los tests de symlink reportan `t.skip` en entornos sin privilegios de creación de enlaces.
  - **Suite E2E Adversarial y Verificación Canónica K3 -> K4a -> K6a -> K3**: Pipeline E2E en `scripts/k6a-e2e-worker-isolation.test.js` ejecutando órdenes de trabajo mutantes sobre `WorkerTransport` con `CapabilityProof` válido, verificando la aplicación real de patches con `git apply --check` y `git apply` en repositorio temporal, y validando contención ante intentos de escape fuera de `allowed_paths` y ejecuciones mutantes no aisladas.

## [2.46.5] - 2026-08-24

### Fixed
- **Hardening Integral de Aislamiento de Workers, Zero-Trust Criptográfico y Preservación de Telemetría K6a**:
  - **Zero-Trust Criptográfico en Merkle Tree**: `computeTreeDigest` exige contenido de bytes real para cada archivo en colecciones tipo Array, eliminando la aceptación ciega de hashes declarados sin bytes; `materializeSourceSnapshot` hidrata y valida siempre los bytes candidatos (`candidateFiles`) contra `base_tree_digest` y comprueba que los hashes declarados en `filesSource` coincidan byte a byte.
  - **Transición Autoritativa en el Registro Privado**: Añadida y exportada la primitiva `updateWorkspaceStatus` en `worker-workspace.js`, sincronizando el estado real del registro privado `workspaceRegistry` en recuperaciones e interrupciones (`recoverInterruptedExecution` y handlers de cuota/abort/timeout en `executeWorkOrder` marcan `descriptor.status = "interrupted"`).
  - **Preservación Íntegra de Telemetría en WorkerTransport**: `classifyTransportFailure` en `host-contract/index.js` y `executeWorkOrder` capturan y preservan `exit_code`, `stderr`, `stdout`, `error`, `message` y `reason` ante fallos (`ok: false`) del transporte.
  - **Contención de Subprocesos y Aislamiento en Mutaciones**: Restringida la ejecución de órdenes de trabajo mutantes (`operation: "apply"`) en fallback exclusivamente a transportes con aislamiento verificado `enforced`, garantizando frontera fail-closed ante escrituras no contenidas.
  - **Inspección de Workspace Fail-Closed y Blindaje de Symlinks**: `inspectWorkspace` utiliza `lstatSync` y `checkSymlinkEscape` antes de seguir symlinks, fallando cerrado ante symlinks con escape fuera de la raíz de trabajo, enlaces rotos o archivos ilegibles.
  - **Reconciliación Documental**: Actualizado `docs/architecture/harness-evolution.md` reflejando la entrega y conformidad estricta de las primitivas de aislamiento K6a.

## [2.46.4] - 2026-08-24

### Fixed
- **Remediación de Fronteras Criptográficas, Contratos y Runtime K6a (`k6a-runtime-boundary-remediation`)**:
  - **Vinculación Tripartita Estricta (3-Way Binding)**: `materializeSourceSnapshot` y `executeWorkOrder` exigen igualdad criptográfica entre `workspace.source_snapshot_id`, `workOrder.source_snapshot_id` y `sourceSnapshot.source_snapshot_id`, abortando fail-closed antes de la creación física de archivos o ejecución de comandos si hay discrepancias de procedencia.
  - **Merkle Tree Digest Byte-Exact y Zero-Trust**: `computeTreeDigest` calcula hashes SHA-256 directamente sobre los buffers binarios crudos sin normalización CRLF/LF ni decodificaciones intermedias, asegurando digests Merkle distintos para saltos de línea diferentes y recalculando siempre los bytes reales ante hashes declarados.
  - **Barrera de Asentamiento Asíncrona (Settlement Barrier)**: `invokeTransportAsync` aguarda asíncronamente la finalización de cancelación/terminación del worker (`port.cancel()`, `port.terminate()`, `port.abort()`) antes de retornar o rechazar ante timeout/abort, eliminando condiciones de carrera y escrituras huérfanas.
  - **Cabeceras Git Mode en Diff Unificado**: `generateUnifiedDiff` emite cabeceras de permisos estándar tipo git (`old mode 100644\nnew mode 100755`) tanto para modificaciones de chmod puro como para cambios combinados de permisos y contenido.
  - **Conformidad Estricta de Esquema WorkOrder v2**: Eliminado el campo no estándar `strict_isolation` del payload `work-order/v2` (preservando `additionalProperties: false`), gestionando el aislamiento estricto vía opciones de ejecución (`options.strictIsolation`).
  - **Autoridad Exclusiva del Registry en Inspección y Recuperación**: `inspectWorkspace` y `recoverInterruptedExecution` resuelven la ruta de trabajo exclusivamente desde el `workspaceRegistry` privado, ignorando descriptores no registrados o con rutas suplantadas.
  - **Pipeline Canónico E2E K3 -> K4a -> K6a -> K3**: Reescrita la suite de integración en `scripts/k6a-e2e-worker-isolation.test.js` utilizando compiladores reales de K4a (`compileExecutionGraph`, `compileWorkOrdersV2`) y validadores de ligadura (`validateWorkOrderBinding`).
  - **Especificación OpenSpec**: Añadidos requisitos `REQ-worker-isolation-009` (3-Way Cryptographic Binding and Byte-Exact Merkle Tree Digest) y `REQ-worker-isolation-010` (Transport Capability Binding, Async Settlement Barrier, and Git Mode Diffing) en `openspec/specs/worker-isolation/spec.md`.

## [2.46.3] - 2026-08-24

### Fixed
- **Cierre Integral de Fronteras y Autoridad de Runtime K6a (`k6a-runtime-boundary-closure`)**:
  - **Autoridad Física Estricta de Workspace**: `executeWorkOrder` resuelve `root_path`, `baselineInventory` y metadata exclusivamente desde `workspaceRegistry.get(workspace_id)` (`record.rootPath`), rechazando de forma fail-closed (`reason: "workspace-not-registered"`) cualquier descriptor externo no registrado o con ruta suplantada.
  - **Ligadura Criptográfica de Bytes Materializados**: `materializeSourceSnapshot` valida criptográficamente los bytes en memoria contra `base_tree_digest` mediante Merkle tree SHA-256 (`computeTreeDigest`) antes de escribir en disco, evitando discrepancias de procedencia entre `SourceSnapshot` y contenido físico.
  - **Vinculación Estricta `CapabilityProof` ↔ `WorkerTransport`**: `isolationReported = "enforced"` exige obligatoriamente que `workerTransport` provisto coincida de forma exacta con `adapter_id` y `probe_digest` verificados en el `CapabilityProof`.
  - **Cancelación Activa e In-flight Termination**: `invokeTransportAsync` pasa `{ input, signal, deadlineMs }` y ejecuta cancelación activa (`port.cancel()` / `port.terminate()`) ante timeout/abort para detener físicamente los procesos worker en ejecución.
  - **Contención Fail-Closed en Fallback**: Comandos con efectos que requieran aislamiento estricto (`strict_isolation: true`) sin `WorkerTransport` verificado fallan cerrado (`reason: "strict-isolation-unfulfilled"`).
  - **Detección de Cambios de Modo (`mode`) en `computeMutationDelta`**: Detección de alteraciones de permisos en archivos (`baseline.mode !== post.mode`) incluyéndolos en `modified` aun cuando el hash SHA-256 permanezca idéntico.
  - **Diffing Exacto con Preservación de EOF y Reversibilidad de Árbol**: `generateUnifiedDiff` implementa `analyzeLines` con emisión de marcadores estándar `\ No newline at end of file` y garantiza la reconstrucción del árbol idéntica byte a byte.
  - **Auditoría Estática Recursiva REQ-contract-lint-018**: `k6a-canonical-contracts` escanea recursivamente todos los archivos JS y tests bajo `scripts/` detectando accesos no canónicos a `.files` o dependencias no SHA-256.
  - **Suite E2E de Composición Canónica Real K3 -> K4a -> K6a -> K3**: Pipeline integral en `scripts/k6a-e2e-worker-isolation.test.js` importando y ejecutando `computeSourceSnapshotId`, `compileExecutionGraph`, `compileWorkOrdersV2`, `validateWorkOrderBinding`, `materializeSourceSnapshot`, `executeWorkOrder`, `apply patch` y `validateWorkResultBinding`.
  - **Promoción de ADRs**: Formalizados y promovidos `adr-20260823-018` a `023` en `docs/adr/`.

## [2.46.2] - 2026-08-23

### Fixed
- **Cierre de Fronteras y Contención de Runtime K6a (`k6a-runtime-boundary-closure`)**:
  - **Generación de Diff Unificado Real y Aplicable**: `generateUnifiedDiff` implementa comparación línea por línea contra `baselineContents` (almacenado durante `materializeSourceSnapshot`), emitiendo hunks estándar `--- a/` / `+++ b/` y `@@ -l,s +l,s @@` con contexto real y eliminando placeholders sintéticos `-old` / `-deleted`.
  - **Enforcement Estricto de WorkerTransport**: `isolationReported = "enforced"` requiere obligatoriamente que `effective_state === "enforced"` y que exista un `WorkerTransport` verificado activo provisto. Si falta transporte acoplado, la ejecución falla cerrada (`ok: false`) o se degrada explícitamente a `unavailable`/`partial` en spawn local, impidiendo reportes falsos de aislamiento.
  - **Firma Canónica y Telemetría de HostTransport**: Corregida la invocación `invokeTransportAsync(workerTransport, { signal, deadlineMs, input })` con paso adecuado de timeout y cancelación. `normalizeTransportOutcome` preserva y expone `stdout`, `stderr` y `exit_code`.
  - **Encapsulación Autorizada de Workspaces**: `createWorkspace` autogenera exclusivamente `workspace_id` mediante UUIDs internos (`ws-${crypto.randomUUID()}`), descartando identificadores del invocador que permitan directory traversal. `getWorkspaceRecord` retorna copias defensivas inmutables y `materializeSourceSnapshot` falla cerrado ante workspaces no registrados (sin fallback a `descriptor.root_path`).
  - **Sincronización de Procesos y Eliminación de Races**: En cancelaciones o timeouts en spawn local, el runtime espera la resolución obligatoria del evento `'close'` del proceso hijo antes de invocar `recoverInterruptedExecution`, garantizando que no existan escrituras concurrentes residuales.
  - **Validación de Symlinks Fail-Closed**: `checkSymlinkEscape` retorna `isEscape: true` ante cualquier excepción o fallo en `fs.realpathSync` / `fs.lstatSync`, cerrando ramas fail-open en la contención de filesystem.
  - **Reconciliación REQ-contract-lint-018**: Eliminados fallbacks legacy `.files` en el runtime y ampliado el checker `k6a-canonical-contracts` para auditar fixtures e invocaciones JS que asuman contratos no canónicos.
  - **Suite E2E de Composición Canónica K3 -> K4a -> K6a -> K3**: Verificado el ciclo completo con derivación criptográfica de `computeSourceSnapshotId`, compilación vía `compileExecutionGraph`/`compileWorkOrdersV2`, validación de `validateWorkOrderBinding` y vinculación estricta de `validateWorkResultBinding`.
  - **Promoción de ADRs**: Formalizados y promovidos `adr-20260823-012` a `017` en `docs/adr/`.

## [2.46.1] - 2026-08-23

### Fixed
- **Integración Canónica de Contratos y Runtime K6a (`k6a-contract-runtime-integration-remediation`)**:
  - **Contratos Canónicos K3/K4a y Snapshot**: Desacopladas las dependencias DAG SHA-256 (`WorkOrderId`) de los inputs de filesystem de la cápsula (`capsule_inputs: string[]`). `materializeSourceSnapshot` consume `SourceSnapshot v1` canónico (sin propiedad sintética `.files`) y falla cerrado ante dependencias faltantes.
  - **Identidad Criptográfica de WorkResult**: `captureWorkResult` emite estrictamente `work-result/v1` canónico delegando el cálculo de `work_result_id` en `computeWorkResultId` de `execution-identities`, enlazando `execution_usage` como metadatos/evidencia externa.
  - **Integración Real con WorkerTransport (K2a)**: `executeWorkOrder` opera de forma asíncrona mediante `invokeTransportAsync`, comprueba `CapabilityProof` con `resolveCapabilityState` (con degradación segura a `partial`/`unavailable`), y respeta `AbortSignal` y presupuestos de tiempo de K5 (`wall_time_minutes`, `commands`).
  - **Contención de Filesystem y Symlinks**: Validación preventiva de symlinks en jerarquías intermedias no instanciadas y evaluación estricta de `allowed_paths` sobre el mutation delta (`created`, `modified`, `deleted`) respecto al `baselineInventory`.
  - **Registro Privado de Workspaces**: Ciclo de vida gestionado internamente (`workspace_id -> internal descriptor`), impidiendo ejecuciones destructivas sobre rutas suministradas por el llamador en `disposeWorkspace`.
  - **Generación de Parche Unified Diff Real**: Generación de un diff aplicable con contenido antes y después, con verificación de reconstrucción de árbol de filesystem.
  - **Promoción de ADRs**: Formalizados y promovidos `adr-20260823-007` a `011` en `docs/adr/`.

## [2.46.0] - 2026-08-23

### Added
- **Worker Isolation y Work-Order Capsule K6a (`k6a-worker-isolation`)**:
  - **Primitivas de Ejecución en Aislamiento**: Implementadas las funciones `createWorkspace`, `materializeSourceSnapshot`, `executeWorkOrder`, `captureWorkResult`, `validateAllowedPaths`, `recoverInterruptedExecution` y `disposeWorkspace` en `scripts/lib/`.
  - **Contención Estricta de Filesystem (`allowed_paths`)**: Validador dual-phase (pre-flight y post-flight) fail-closed contra traversals (`../`), caracteres nulos y escapes por symlinks (`allowed-paths-validator.js`).
  - **Cápsula Determinista y Snapshot**: Proyección exacta de dependencias declaradas con huella SHA-256 determinista libre de artefactos ajenos (`worker-workspace.js`).
  - **Frontera de Identidad K3**: El worker opera sobre `SourceSnapshot`, recibe `WorkOrder` y emite `WorkResult` con enlace criptográfico sin generar ni asumir `CandidateId`. APIs públicas desacopladas de Repair y compilación de grafos.
  - **Esquemas JSON de Kernel y Fixtures**: Registradas 4 nuevas familias en `schemas/kernel/` (`workspace-descriptor`, `capsule-definition`, `work-result-execution-payload` y `containment-violation`) con fixtures positivos y negativos de no-aliasing con Candidate.
  - **Checkers de Contract-Lint**: Implementados `k6a-candidate-prohibition.js` y `k6a-capsule-path-containment.js` registrados en `contract-lint.js`.
  - **Invariantes de Modelo de Ciclo de Vida**: Agregados 6 invariantes ejecutables para K6a en `lifecycle-model.js`.
  - **Integración con WorkerTransport de K2a y Fallback**: Ejecución segura vía transporte de host con degradación explícita ante capacidades de aislamiento `partial` o `unavailable`.
  - **Promoción de ADRs**: Formalizados y promovidos `adr-20260823-003` a `006` en `docs/adr/`.

## [2.45.16] - 2026-08-23

### Fixed
- **Fallback configurable de tiers (`internal/modelconfig/models_test.go`)**: Alineada la expectativa de la prueba Go para agentes no declarados con `_default: premium` de `models.yaml`, manteniendo la validación cerrada ante rutas o configuraciones inválidas. Este hotfix sucede a `v2.45.15`, cuyo workflow `Build ospec-hooks` falló en macOS, Ubuntu y Windows por la expectativa obsoleta; validación: `go test ./...`, `npm test` y sincronización de manifiestos.

## [2.45.15] - 2026-08-23

### Fixed
- **Integridad de contabilidad de uso K5 (`k5-usage-accounting-integrity`)**: Corregida la aplicación exactamente una vez de `ExecutionUsage` en éxitos, fallos y reintentos CAS. El runtime conserva el carry-over entre recreaciones sin volver a debitar efectos fallidos ya reconciliados, trata los resultados `undefined`/`null` del executor de forma cerrada y mantiene el estado `completed` del journal como absorbente durante merges concurrentes.
- **Semántica de zero-delta y reconciliación durable**: Las reparaciones sin progreso efectivo conservan la penalización dual de zero-delta; la reconciliación distingue consumo físico nuevo de resultados históricos para evitar duplicación o pérdida presupuestaria.

### Changed
- **Trazabilidad SDD y remediación 4R**: Archivados proposal, specs, diseño, tareas, evidencia de apply/verify, decisiones arquitectónicas y linajes inmutables. El gate 4R completo cerró sus tres hallazgos críticos mediante slices acotados y validación dirigida; los advisories aceptados permanecen registrados como deuda no bloqueante.

- **Evidencia Strict TDD**: 37/37 escenarios contractuales y 167/167 pruebas focales superadas. La suite completa finalizó con 2408/2410 pruebas superadas y 2 omisiones esperadas por entorno, sin fallos.

## [2.45.14] - 2026-08-22

### Fixed
- **Política de modelos configurable (`models.yaml`)**: Eliminadas de `scripts/lib/model-resolver.js` las restricciones duplicadas que fijaban los reviewers y `_default` al tier `default`, además de los modelos y `model_reasoning_effort` de Codex. Las asignaciones, modelos, esfuerzo y verbosidad se leen ahora exclusivamente desde `models.yaml`; se conservan las guardas estructurales del roster SDD, tiers conocidos y agentes válidos. Las pruebas contractuales, de generación y telemetría derivan sus expectativas de la configuración viva. Verificación: `npm run setup:codex` con 0 errores y 0 warnings; suite completa `npm test` superada.

## [2.45.13] - 2026-08-22

### Fixed
- **Blindaje y Hardening de Concurrencia K5 (`k5-concurrency-hardening`)**:
  - **Ownership Autoritativo de ExecutionUsage**: El consumo de presupuestos se extrae exclusivamente de `result.usage` / `result.execution_usage` emitido por el `effectExecutor`, purgando definitivamente `input.consumed` como autoridad del caller (`REQ-execution-budgets-003`).
  - **Particionado de Carry-Over por Sujeto y Nodo**: Acumulador `pendingCarryOver` indexado por `${subjectId}:${nodeId}` aislando cuotas y evitando contaminación presupuestaria entre nodos/workers concurrentes (`REQ-operation-permits-005`).
  - **Journaling Merge-Safe y Preservación de Peer Tickets**: `commitJournal` opera con `upsertJournalEntries` merge-safe por `effect_id` en todos los stores (`AuthorityStore`, `MemoryStore`, `FileSystemStore`), y el commit CAS elimina exclusivamente el ticket ganador (`entry.midOpTickets.delete(winner)`), preservando intactos los tickets de los peers concurrentes (`REQ-authority-store-003`, `REQ-authority-store-011`).
  - **Garantía de Cero Duplicación de Efectos**: Reconciliación contra el journal que retorna `action: "skip"` ante efectos ya completados, verificando exactamente 0 llamadas adicionales al executor en reintentos post-CAS.
  - **Alineación Contractual de Zero-Delta**: Deducción condicionada a `effect-bearing mutation AND effectProgress === false`, eximiendo transiciones de ciclo de vida como `repair` con avance (`REQ-execution-budgets-004`).
  - **Integración Causal en Host Boundary**: Integrado `resolvePrimaryFailure` en `host-boundary.js` normalizando fallos de transporte como `environment_tooling` (`REQ-failure-recovery-002`, `REQ-failure-recovery-003`).
  - **Gobernanza Formal de ADRs**: Promovidos y formalizados `adr-20260822-007` a `012` a `Status: accepted` en `docs/adr/`.

### Added
- **Gate 4R Completo K5**: Pipeline de revisión 4R selectiva (`risk`, `reliability`, `resilience`) completado con 0 hallazgos y verificación de suite al 100% (2401 tests).

## [2.45.12] - 2026-08-22

### Fixed
- **Remediación Técnica Integral del Núcleo K5 (`k5-core-remediation`)**:
  - **Concurrencia CAS Post-Efecto Multi-Writer**: Suite E2E en `scripts/k5-e2e-budgets-recovery.test.js` con carrera real de dos writers ejecutando efectos antes de resolver el CAS, demostrando deterministamente que el writer perdedor retiene su carry-over real y el reintento no duplica efectos ciegamente.
  - **Carry-Over Multidimensional Exhaustivo**: Acumulador en `createKernelRuntime` que preserva el consumo real de todas las dimensiones (`turns`, `commands`, `patches`, `changed_lines`, `wall_time_minutes`, `effect_attempts`) calculadas a partir del delta ejecutado real ante `cas-conflict`.
  - **Semántica Contractual de Zero-Delta**: Deducción restringida exclusivamente a mutaciones effect-bearing de código sin avance semántico (`reduced.outcome === "unchanged"` y 0 archivos/líneas modificadas), eximiendo transiciones de ciclo de vida.
  - **Unificación Determinista de `resolvePrimaryFailure()`**: Resolución idéntica por prioridad causal conectada de forma homogénea en el selector de transiciones, controlled permit issuer y host boundary.
  - **Aislamiento Multi-Writer en Store y Journal**: `midOpTickets` gestionados con `Map` indexado por escritor/revisión en `AuthorityStore` y validación estricta de continuidad del journal para prevenir sobreescrituras destructivas.
  - **Controlled Issuer Estrictamente Autoritativo**: Eliminado el fallback a `input.state`, exigiendo snapshot autoritativo de `AuthorityStore` (fail-closed ante ausencia de store).
  - **Taxonomía Causal Fail-Closed**: Tags no reconocidos en `mapLegacyRoutingTag` resuelven a `validation_gap` (`UNKNOWN_ROUTING_TAG`), prohibiendo transiciones `repair`.
  - **Promoción de ADRs**: Formalizados y promovidos `adr-20260822-001` a `006` en `docs/adr/`.

### Added
- **Gate 4R Exhaustivo K5**: Pipeline de revisión 4R completo (screening generalista → especialistas en `risk`, `reliability` y `resilience`) completado con 0 hallazgos y aprobación limpia.

## [2.45.11] - 2026-08-22

### Fixed
- **Reconciliación del Cierre K5 (`k5-reconciliation`)**:
  - **Mapeo de Tags Legacy Guionados**: `mapLegacyRoutingTag` mapea `code-bug`, `tasks-gap`, `design-gap` y `spec-gap` a los códigos canónicos existentes de la taxonomía causal, eliminando la caída silenciosa al default `UNKNOWN_FAILURE_CODE`; el default se conserva fail-closed para tags desconocidos y está fijado por tests negativos.
  - **E2E CAS Real**: el test de no-inflación presupuestaria en `k5-e2e-budgets-recovery.test.js` ejercita una carrera stale-permit real contra el Authority Store con aserción `deepEqual` de presupuestos; el matcher laxo de `lifecycle-kernel/index.test.js` se estrecha a `stale-permit` tras evidencia empírica de determinismo (200/200 ejecuciones).
- **Docs**:
  - Reconciliados metadatos del change archivado `2026-08-20-k5-authoritative-enforcement-and-cas-remediation` (`archive-planned` → `archived`, conteo de tareas corregido a 31 con nota correctiva).
  - Fila K5 del roadmap general alineada al formato K1–K4a citando las remediaciones v2.45.7→v2.45.10.

### Added
- **Primer Gate 4R Formal de la Familia K5**: `k5-reconciliation` ejecuta el pipeline completo de revisión selectiva (generalista read-only → clasificador determinista targeted `[reliability]` → linaje congelado con candidate ID y budget de corrección → lente única → findings congelados) registrando linaje terminal `approved` en `state.yaml`. Follow-up no bloqueante: e2e de conflicto CAS post-efectos (F-7bb9293b802b7ec1).

## [2.45.10] - 2026-08-21

### Fixed
- **Remediación Integral de Boundary Autoritativo, CAS Terminal y Monotonicidad Concurrente K5 (`k5-authority-boundary-and-cas-concurrency-remediation`)**:
  - **Controlled Issuer Autoritativo**: `issuePermitForSelectedTransition` consulta el `AuthorityStore` (`snapshot`/`state`), valida la vigencia de revisión (`expected_revision`), evalúa el agotamiento presupuestario de nodo y autoridad (`isBudgetExhausted`), y valida fail-closed la matriz causal de transiciones antes de emitir cualquier `OperationPermit` (`REQ-operation-permits-005`).
  - **Consolidación y Commit CAS de Transiciones Terminales**: `runKernelOperation` permite que las operaciones terminales de control (`escalate`, `stop`) superen el preflight de agotamiento presupuestario y consoliden su estado terminal en el `AuthorityStore` vía `compareAndSwap` (`REQ-lifecycle-kernel-runtime-025`, `REQ-lifecycle-kernel-runtime-026`, `REQ-failure-recovery-002`).
  - **Enforcement Causal en Boundary Autoritativo**: `validateOperationTransition` invoca `validateRecoveryTransition` ante operaciones de recuperación sobre nodos en fallo (`failed`/`interrupted`), impidiendo que llamadas directas eludan la matriz causal (`REQ-failure-recovery-002`, `REQ-failure-recovery-003`).
  - **Carry-Over de Presupuestos y Monotonicidad CAS Runtime-Owned**: `createKernelRuntime` retiene las cuotas consumidas por efectos tras un conflicto CAS multi-writer (`pendingCarryOver`) y las deduce automáticamente en el reintento sobre el nuevo head sin requerir inyección manual de `args.consumed`; verificado con carrera concurrente real de 2 writers en `inv-k5-budget-monotonicity` (`REQ-execution-budgets-003`, `REQ-lifecycle-model-conformance-011`).
  - **Semántica Refinada de Zero-Delta**: Acotada la deducción zero-delta exclusivamente a mutaciones effect-bearing reales que no producen avance semántico en el ciclo de vida (`reduced.outcome === "unchanged"`), eximiendo transiciones válidas de control y progreso (`REQ-execution-budgets-004`, `REQ-lifecycle-kernel-runtime-027`).
  - **Promoción Formal de ADRs**: Promovidos `adr-20260820-007` a `011` a `Status: accepted`.

## [2.45.9] - 2026-08-20

### Fixed
- **Remediación Autoritativa de K5 y Consolidación CAS (`k5-authoritative-enforcement-and-cas-remediation`)**:
  - Transiciones Canónicas: `code_defect` emite explícitamente `{ kind: "execute", operation: "repair" }` sin degradar a `recover`; `ambiguous_effect` emite `{ kind: "escalate", operation: "escalate" }` consolidándose como commit terminal en el Authority Store vía CAS.
  - Preflight Exhaustivo de Presupuestos: `isBudgetExhausted()` integrado en preflight de `issueOperationPermit()` y `runKernelOperation()`, denegando permisos y garantizando exactamente 0 llamadas a `effectExecutor` ante cuotas agotadas en 6 dimensiones de nodo y 4 de autoridad.
  - Repair Scope Fail-Closed Obligatorio: `validateRepairScope()` requiere estructura explícita con `node_ids`, `allowed_paths` y `finding_ids` no vacíos; preflight en `runKernelOperation()` rechaza llamadas a `repair` sin `args.scope` con 0 llamadas a efectos y eliminando fallbacks de histórico.
  - Contabilidad Zero-Delta Dual y Evento Durable: Mutaciones de efecto que producen zero-delta decrementan simultáneamente `node.turns` y `authority_budget.effect_attempts`, persistiendo el registro durable `zero-delta-attempt` en el journal antes del commit CAS.
  - Preservación de Presupuesto ante CAS Conflict y Test Concurrente de 2 Writers: Los turnos e intentos consumidos por efectos ejecutados se conservan ante conflictos CAS sin restablecer cuotas al resincronizar contra el nuevo head; verificado en el checker `inv-k5-budget-monotonicity` de `lifecycle-model.js`.

## [2.45.8] - 2026-08-20


### Fixed
- **Endurecimiento de Verificación de Presupuestos Fail-Closed y Monótonos (`k5-runtime-enforcement-and-wiring-remediation`)**:
  - Implementado `isBudgetExhausted(budget, consumed, options)` evaluando exhaustivamente las 6 dimensiones de nodo (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`) y 4 de autoridad (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`).
  - Endurecido `validateRepairScope()` para fail-closed estricto ante scopes vacíos, nulos o no coincidentes con `node_ids`, `allowed_paths` y `finding_ids`.
  - Integrado pipeline de validación en `runKernelOperation()`: pre-effect scope validation, captura de métricas post-effect, deducción de cuotas monótona ante zero-delta mutations, validación de honestidad en recuperación con `blockingFingerprint`, y verificación de agotamiento presupuestario pre-CAS.
  - Reimplementados los 7 invariant checkers de K5 en `scripts/lib/lifecycle-model.js` con composición real de runtime, `AuthorityStore` y CAS.
  - Aceptados los ADRs `adr-20260817-001`, `adr-20260817-002` y `adr-20260817-003`.

## [2.45.7] - 2026-08-20

### Fixed
- **Reconciliación Canónica de `ReplayFixtureResult` (REQ-006) (`k4a-replay-completion-contract-reconciliation`)**:
  - `openspec/specs/execution-graph-compiler/spec.md` formaliza el contrato canónico mínimo de `ReplayFixtureResult` en 6 dimensiones deterministas: Provenance estricto (`graph_id` y `work_order_id`), Estado Terminal (`completed` sin cancelaciones ni fallos), Consistencia de Exit Code (`exit_code === 0`), Objeto de Evidencia plano no nulo y no array, Cobertura de Evidencia Requerida por Nodo (`node.required_evidence ⊆ keys(evidence)`), y Satisfacción de Obligaciones a Nivel de Grafo con generación de contraejemplos reproducibles.
  - Eliminada la referencia ambigua a "missing output fields", consolidando el diccionario de `evidence` como el único contenedor canónico de outputs y pruebas en K4a sin introducir schemas de output artificiales.
  - Preservación estricta de las fronteras de kernel: estructuras de ejecución de workers vivos (`WorkResult`), permisos y cápsulas permanecen en K6a/K4b, y causalidad de recuperación permanece en K5.

### Added
- **Suite Exhaustiva de Pruebas Contractuales y Adversariales en Replay Engine**:
  - `scripts/lib/execution-graph/replay-engine.test.js` ampliado con tests unitarios y adversariales para todas las 6 dimensiones de completitud de `ReplayFixtureResult`.
  - Cobertura para combinaciones contradictorias de terminal status (`status: "completed"` con `outcome: "failed"`, `ok: false`, non-zero `exit_code`).
  - Cobertura para tipos de evidencia inválidos (`null`, `[]`, strings, números, booleanos).
  - Cobertura para rechazo de nodos con evidencia requerida incompleta y bloqueo downstream.
  - Cobertura para obligaciones `MUST` diferidas vs no satisfechas y generación determinista de contraejemplos.

## [2.45.6] - 2026-08-16

### Fixed
- **Binding Canónico Estricto en `PolicySnapshot` (`k4a-policy-snapshot-canonicalization-and-replay-hardening`)**:
  - `schemas/kernel/policy-snapshot/v1.schema.json` impone validación estricta con `pattern: "^sha256:[a-f0-9]{64}$"` para `snapshot_id` y `policy_bundle_digest`, y `minLength: 1` para `compiler_version`, `classifier_version` y `runtime_version`.
  - `scripts/lib/kernel-schema-validator.js` implementa soporte nativo de evaluación para `minLength` y `pattern`.
  - `computePolicySnapshotDigest` se convierte en una función pura que procesa exclusivamente el payload canónico ya resuelto sin inyectar defaults ocultos (`|| "1.0.0"`), fallando de forma cerrada ante valores vacíos `""`, sólo espacios o digests malformados.
  - `createPolicySnapshot` normaliza y aplica defaults antes de la validación de esquema.
- **Endurecimiento del Contrato de Fixtures en Replay Engine**:
  - `replayExecutionGraph` exige que todo fixture que reclame `status: "completed"` proporcione un objeto `evidence` válido, definido y no nulo que cubra los `node.required_evidence` del nodo. Fixtures incompletos fallan de forma cerrada y generan un contraejemplo reproducible.
  - Verificación de contradicción: rechazo *fail-closed* si un fixture declara `status: "completed"` pero contiene `exit_code !== 0`.
- **Reconciliación de Autoridad Documental y Roadmap**:
  - `docs/roadmaps/harness-evolution.md`: K4a reconciliado a `done`, K5 a `next-eligible`, y Done Criteria de WorkOrder a `v2` con compilación determinista.
  - `docs/architecture/harness-evolution.md`: Estado verificado actualizado con K4a `done` y K5 `next-eligible`.
  - Sincronizados REQ-003 y REQ-006 en `openspec/specs/execution-graph-compiler/spec.md`.

### Added
- **Suites de Pruebas Adversariales**:
  - Tests adversariales para `PolicySnapshot` contra strings vacíos, whitespace, digests malformados y rechazos de esquema.
  - Tests adversariales para `ReplayEngine` contra fixtures con objeto de evidencia ausente y códigos de salida no nulos con estado `completed`.

## [2.45.5] - 2026-08-16

### Fixed
- **Determinismo Canónico en Compilación de WorkOrders (`k4a-work-order-replay-determinism-and-spec-sync`)**:
  - `compileWorkOrdersV2` se establece como una función pura estrictamente determinista de `ExecutionGraph` y su `SourceSnapshot` validado, fijando `role: "repair-worker"` y `DEFAULT_WORK_ORDER_BUDGET`.
  - Rechazo *fail-closed* ante intentos de suministrar `role` variable (distinto de `"repair-worker"`), `budgets` o `defaultBudget` desacoplados con error `unsupported-compilation-context`, garantizando que todo WorkOrder compilado sea 100% reproducible en `replayExecutionGraph`.
- **Segregación Estricta de Replay Legacy**:
  - Eliminado el soporte de `allowLegacyFixtures` en la API canónica `replayExecutionGraph()`, reservando la evaluación de fixtures no vinculados exclusivamente a `replayLegacyFixtureGraph()`.
- **Sincronización del Spec Canónico Activo (`openspec/specs/execution-graph-compiler/spec.md`)**:
  - Incorporadas todas las garantías contractuales de `v2.45.4` y `v2.45.5` en el spec canónico (provenance estricta `graph_id` + `work_order_id`, autoridad de obligaciones `unknown-obligation-id`, semántica estricta de Shadow `match: false` en dimensiones omitidas, y determinismo de compilación).
- **Claridad de Autoridad de Esquemas**:
  - Documentado formalmente que `schemas/kernel/execution-graph/v1.schema.json` ($defs.node) es el único contrato semántico autoritativo para K4a con `minLength: 1`, manteniendo `schemas/kernel/graph-node/v1.schema.json` congelado para compatibilidad K1.

### Added
- **Pruebas de Composición WorkOrder Compiler → Replay**:
  - Añadidas suites de pruebas verificando la reproducibilidad total de WorkOrders canónicos en Replay y el rechazo estricto de opciones no ligadas.

## [2.45.4] - 2026-08-16

### Fixed
- **Replay Fixture Strict Provenance y Compilación Fail-Closed (`k4a-replay-provenance-and-shadow-remediation`)**:
  - `replayExecutionGraph` exige de forma obligatoria que todo fixture declare `graph_id` y `work_order_id` coincidentes con el grafo canónico y el WorkOrder compilado, rechazando fixtures no vinculados o stale con `stale-fixture-rejected`.
  - Eliminado el `catch` silencioso en la compilación de WorkOrders durante el replay, asegurando fallo cerrado (`work-order-compilation-failed`).
  - Segregada la compatibilidad de fixtures legacy mediante `replayLegacyFixtureGraph()` y el flag explícito `options.allowLegacyFixtures: true`.
- **Autoridad Absoluta de Obligaciones Contractuales**:
  - `compileExecutionGraph` valida que toda obligación externa reconcilie estrictamente con `contract.obligations`, rechazando identificadores desconocidos con `unknown-obligation-id`.
- **Consistencia Semántica en Shadow Comparator**:
  - `compareShadowExecution` restringe `match: true` exclusivamente a coincidencias completas (`full-match`) con cero dimensiones omitidas (`skipped_dimensions.length === 0`).
  - Ante dimensiones no evaluadas en el baseline (por ejemplo, omisión de `ownership`), retorna `match: false`, `discrepancy_classification: "partial-match"` y emite la discrepancia estructurada en `telemetryDiff`.
- **Endurecimiento de Esquemas y Nodos Canónicos**:
  - `schemas/kernel/execution-graph/v1.schema.json` y el compilador imponen `minLength: 1` en todos los identificadores y descriptores de nodo (`node_id`, `kind`, `operation`, `objective`, `budget_ref`, `ownership.owner`, `obligation.id`, `deferred.reason`, `deferred.approved_by`), impidiendo la emisión de grafos con strings vacíos.

### Added
- **Suite de Pruebas Adversariales**:
  - Tests exhaustivos en `replay-engine.test.js`, `compiler.test.js`, `shadow-comparator.test.js` y `k3-k4a-integration.test.js` para los 4 vectores adversariales: `oldUnboundFixture + clarifiedGraph`, `unknownExternalObligation`, `baselineMissingOwnership` y `compileExecutionGraph(node_id: "")`.

## [2.45.3] - 2026-08-16

### Fixed
- **Propagación de Clarify en Identidad de WorkOrders (`k4a-integrity-and-bindings-remediation`)**:
  - Actualizado `schemas/kernel/work-order/v2.schema.json` y `scripts/lib/execution-identities/index.js` (`computeWorkOrderId`) para digerir `clarification_context` canónicamente en la preimagen criptográfica de WorkOrders.
  - `compileWorkOrdersV2` propaga `node.clarification_context` a los WorkOrders v2, produciendo digests `work_order_id` diferenciados para nodos afectados y sus descendientes dependientes.
- **Validación de Provenance de Fixtures en Replay**:
  - `replayExecutionGraph` verifica la vinculación de fixtures contra `graph_id` y `work_order_id`, rechazando fixtures obsoletos pre-clarificación con código `stale-fixture-rejected`.
  - Discriminación cerrada ante contradicciones lógicas en fixtures (`status` vs `outcome`, `ok: false` con status completed, `cancelled` con outcome completed).
- **Merge Seguro de Obligaciones y Sanitización de Deferrals**:
  - `compileExecutionGraph` implementa merge con lista blanca sobre `contract.obligations` inmutables, impidiendo la inyección arbitraria de `deferred` sobre obligaciones `MUST`.
- **Unicidad de `node_id` Fail-Closed**:
  - Validación de unicidad de `node_id` en `dag.js`, `binding.js`, `compiler.js` y `work-order-compiler.js` rechazando duplicados con código `duplicate-node-id` / `DUPLICATE_NODE_ID`.
- **Validación Canónica de ClarifyEvent**:
  - `applyClarifyEvent` valida atómicamente contra el esquema canónico `ospec://schemas/kernel/clarify-event/v1`.
- **Verificación Criptográfica de SourceSnapshot y PolicySnapshot**:
  - Validación y recomputación de `sourceSnapshot` en `compileExecutionGraph` contra su preimagen y rechazo de `policySnapshot: { snapshot_id: "" }`.
- **Clasificación y Comparación Profunda en Shadow**:
  - `compareShadowExecution` restringe `full-match` a comparaciones con 0 dimensiones omitidas y realiza comparación profunda de gobernanza en obligaciones.

## [2.45.2] - 2026-08-16

### Fixed
- **Primitivas Canónicas de Binding Criptográfico (`k4a-integrity-and-bindings-remediation`)**:
  - Implementación de [`validateExecutionGraphBinding()`](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/execution-graph/binding.js) verificando atómicamente conformidad con el esquema JSON y consistencia criptográfica estricta entre `graph_id` y su preimagen de contenido (`nodes`, `obligations`, `source_snapshot_id`, `policy_snapshot_id`, `policy_bundle_digest`, `contract_digest`), protegiendo de raíz contra manipulación post-compilación (*tampering*).
  - Implementación de [`validatePolicySnapshotBinding()`](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/execution-graph/policy-snapshot.js) con recálculo determinista de `snapshot_id` mediante `computePolicySnapshotDigest()`, rechazando snapshots falsificados.
- **Conformidad de Esquema en Clarify y Composabilidad Extremo a Extremo**:
  - Actualizado `schemas/kernel/execution-graph/v1.schema.json` para soportar `clarification_context` opcional en `$defs/node`.
  - Garantizada la composabilidad del pipeline: `applyClarifyEvent` → `validateExecutionGraphBinding` → `compileWorkOrdersV2` → `validateWorkOrderBinding`.
- **Autoridad Absoluta de Obligaciones y Acoplamiento en Preimagen de GraphId**:
  - Blindaje de `contract.obligations` como la única autoridad inmutable sobre criticidad (`MUST` no puede ser degradado a `MAY`/`SHOULD` por entradas externas).
  - Incorporación obligatoria de `obligations` en el cálculo de `computeGraphId()`.
- **Validación Estricta de Provenance y Evidencia en Replay**:
  - Rechazo inmediato *fail-closed* ante `sourceSnapshotId: ""` o valores malformados sin fallback silencioso al contrato.
  - Verificación estricta de `node.required_evidence ⊆ recorded.evidence` a nivel de nodo en `replayExecutionGraph()`.
- **Consolidación de Utilidades DAG y Comparador Shadow Multidimensional**:
  - Módulo unificado `scripts/lib/execution-graph/dag.js` (`hasCycle`, `topologicalSort`, `computeDescendantClosure`).
  - Discriminación multidimensional en `compareShadowExecution()` entre `full-match`, `partial-match` y `diverged`.

### Added
- **Suite Integral de Tests Adversariales Cross-Layer**:
  - Casos de prueba exhaustivos en `scripts/lib/k3-k4a-integration.test.js` cubriendo detección de tampering en grafos, rechazo de degradación de obligaciones, pipeline completo de Clarify con compilación de WorkOrders, snapshots de políticas falsificados, `sourceSnapshotId` vacío y fixtures sin evidencia por nodo.
- **ADRs Promovidos**:
  - Incorporación de ADR-001 a ADR-008 en `docs/adr/` (ADR-20260816-001 a ADR-20260816-008).

## [2.45.1] - 2026-08-15

### Fixed
- **Resolución Topológica y Compatibilidad Criptográfica de WorkOrders v2 (`k4a-remediation-v2-45-1`)**:
  - `compileWorkOrdersV2` (`scripts/lib/execution-graph/work-order-compiler.js`) compila los nodos en orden topológico determinista y materializa sus dependencias como digests SHA-256 (`sha256:...`) de los `WorkOrderId` canónicos upstream mediante `computeWorkOrderId()`.
  - Actualizado `schemas/kernel/work-order/v2.schema.json` restringiendo estrictamente los elementos de `dependencies` al patrón `^sha256:[a-f0-9]{64}$`.
  - Asegurada interoperabilidad estricta y transparente con la autoridad de identidades K3 [`validateWorkOrderBinding()`](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/execution-identities/index.js).
- **Validación Atómica Canónica de Esquemas**:
  - `compileWorkOrdersV2()` valida atómicamente el grafo completo contra `schemas/kernel/execution-graph/v1.schema.json` y cada orden emitida contra `schemas/kernel/work-order/v2.schema.json` mediante `validateInstance()`, emitiendo cero órdenes parciales ante cualquier error.
- **Autoridad Absoluta de Obligaciones del Contrato**:
  - `compileExecutionGraph()` (`scripts/lib/execution-graph/compiler.js`) toma `contract.obligations` como la autoridad canónica inmutable, impidiendo la omisión silenciosa de obligaciones `MUST` mediante arreglos vacíos o sobreescrituras externas.
- **Propagación de Invalidación en Clarify y Replay Fail-Closed**:
  - `applyClarifyEvent()` (`scripts/lib/execution-graph/clarify.js`) muta y actualiza los nodos afectados/invalidados en el grafo y recalcula el `graph_id` determinista.
  - `replayExecutionGraph()` (`scripts/lib/execution-graph/replay-engine.js`) incorpora discriminación cerrada de completitud y rechazo *fail-closed* ante fixtures de nodos invalidados (`stale-fixture-rejected`).
- **Vinculación Criptográfica de `policy_snapshot_id`**:
  - Incorporado `policy_snapshot_id` obligatorio en `schemas/kernel/execution-graph/v1.schema.json` y acoplado a la preimagen de cálculo de `computeGraphId()`.
- **Detección de Ciclos e Inmutabilidad en Compilación de Grafos**:
  - `compileExecutionGraph()` ejecuta `hasCycle()` antes de emitir la estructura y aplica clonación defensiva profunda (`structuredClone()`) sobre nodos y obligaciones.
- **Endurecimiento del Comparador Shadow**:
  - `compareShadowExecution()` (`scripts/lib/execution-graph/shadow-comparator.js`) evalúa multidimensionalmente invariantes, obligaciones, dependencias, ownership, steps y rutas permitidas en modo de solo lectura.

### Added
- **Suite de Integración Transversal K3 ↔ K4a**:
  - Nuevo test end-to-end `scripts/lib/k3-k4a-integration.test.js` validando la cadena criptográfica completa: `SourceSnapshot` → `compileExecutionGraph` → `compileWorkOrdersV2` → `validateWorkOrderBinding` → `validateWorkResultBinding` → `replayExecutionGraph`.
- **ADRs Promovidos**:
  - Incorporación de ADR-007 a ADR-012 en `docs/adr/` documentando las decisiones de remediación de dependencias, validación canónica, autoridad de obligaciones, invalidación en clarify, enlace de policy snapshot y comparación shadow.

## [2.45.0] - 2026-08-15

### Added
- **Compilador de ExecutionGraph y Vínculo Formal con SourceSnapshot (`k4a-execution-graph-compiler-replay`)**:
  - Requisito obligatorio de `source_snapshot_id` (`^sha256:[a-f0-9]{64}$`) en `schemas/kernel/execution-graph/v1.schema.json` y `schemas/kernel/work-order/v2.schema.json`.
  - Derivación determinista de `GraphId` acoplando resúmenes criptográficos de contrato, política, snapshot y estructura de nodos en `scripts/lib/execution-graph/compiler.js`.
  - Validación atómica *fail-closed* en `compileWorkOrdersV2()` (`scripts/lib/execution-graph/work-order-compiler.js`): rechaza desajustes de procedencia, nodos microscópicos o dependencias cíclicas emitiendo cero órdenes parciales ante cualquier error.
  - Preservación estricta, byte a byte, del contrato legacy `work-order/v1.schema.json` y el baseline histórico K1 (`K1_SCHEMA_BASELINE`).
- **Motor de Replay Determinista y Comparador Shadow de Solo Lectura**:
  - Implementación de `replayExecutionGraph()` en `scripts/lib/execution-graph/replay-engine.js` con ordenación topológica robusta y generación de trazas de contraejemplo.
  - Implementación de `compareShadowExecution()` en `scripts/lib/execution-graph/shadow-comparator.js` con clonación profunda defensiva (`structuredClone`) y no-interferencia con el estado activo.
  - Gestión de eventos de aclaración (`applyClarifyEvent`) en `scripts/lib/execution-graph/clarify.js` con cálculo de clausura transitiva e invalidación descendente de nodos dependientes.
  - Verificación de completitud de obligaciones en `validateObligationManifest()` (`scripts/lib/execution-graph/obligation-manifest.js`).
- **Linters de Contratos y Conformidad del Modelo de Ciclo de Vida K4a**:
  - Checkers `k4a-microscopic-nodes.js` y `k4a-obligation-completeness.js` integrados en `scripts/lib/contract-lint.js`.
  - Promoción y validación de 7 invariantes ejecutables K4a en `scripts/lib/lifecycle-model.js` (`inv-k4a-no-microscopic-nodes`, `inv-k4a-obligation-completeness`, `inv-k4a-derived-graph-identity`, `inv-k4a-atomic-work-order-compilation`, `inv-k4a-replay-determinism`, `inv-k4a-shadow-non-interference`, `inv-k4a-no-live-authority`).
- **ADRs Promovidos**:
  - Incorporación de ADR-001 a ADR-006 en `docs/adr/` documentando las decisiones de arquitectura del compilador, modelo de replay, WorkOrder v2 y validación de procedencia.

## [2.44.3] - 2026-08-15

### Added
- **Eliminación Directa de Comas Finales en el Autómata de Estados**:
  - `stripJsoncComments()` en `scripts/configure/install-engine.js` gestiona la omisión de comas finales directamente durante el escaneo carácter a carácter fuera de cadenas, evitando expresiones regulares sobre el texto resultante.
- **Validación Roundtrip y Preflight en VS Code**:
  - `updateSettingsJsoncPreservingComments()` en `scripts/configure/install-vscode.js` revalida el documento resultante antes de retornar, y `main()` ejecuta un preflight completo sobre todos los archivos de configuración antes de escribir cambios a disco.

### Fixed
- **Limpieza de Alcance en Especificación**:
  - Eliminada la referencia residual a `install:copilot` en la sección Scope de `openspec/specs/install/spec.md`.

## [2.44.2] - 2026-08-15

### Added
- **Convergencia y Poda de Skills en Codex**:
  - Seguimiento de manifiesto `.ospec-workflow-install.json` en `~/.agents/skills/` y cálculo de `gatherCodexSkillsFiles()` en `scripts/configure/install-codex.js`.
  - Poda automática de skills obsoletas entre versiones preservando de forma estricta las skills personalizadas del usuario.
- **Parser JSONC con Autómata de Estados**:
  - Implementación de `stripJsoncComments()` en `scripts/configure/install-engine.js` mediante escáner carácter por carácter, garantizando que cadenas literales con `//` o `/* ... */` no se corrompan y eliminando comas finales.
- **Soporte Escalar y Creación de Configuración en VS Code**:
  - Conversión limpia de `"chat.pluginLocations": "ruta"` a listas sin duplicación de propiedades.
  - Creación automática de `settings.json` cuando el directorio de configuración del usuario existe.
  - Salida con código de error no cero (`exit 1`) en `scripts/configure/install-vscode.js` cuando no se encuentra ningún directorio de configuración de VS Code en el host.
- **Código de Salida en Compilación de Hooks**:
  - Actualización del script `build:hooks` en `package.json` para fallar con código `1` si el aprovisionamiento del binario no tiene éxito.

### Fixed
- **Alineación de la Especificación OpenSpec**:
  - Corrección de la ruta global de Copilot (`~/.copilot/`) y comandos de scripts (`install:global:copilot`, `setup:copilot`) en `openspec/specs/install/spec.md`.

## [2.44.1] - 2026-08-15

### Added
- **Aprovisionamiento Automático de Binario en Clones Limpios (`REQ-install-015`)**:
  - Función `ensureRuntimeBinary()` en `scripts/configure/install-target.js` que compila automáticamente `ospec-hooks` con el compilador `go` local cuando está disponible en PATH.
  - Scripts `build:hooks` y `ensure:hooks` en `package.json`.
- **Tests de Integración de Convergencia Multiversión**:
  - Nueva suite `tests/integration/installation-convergence.test.js` que valida ciclos de actualización entre versiones (v1 -> v2), poda de archivos obsoletos y preservación de archivos y hooks de usuario en OpenCode, Copilot, VS Code y Antigravity.

### Fixed
- **Corrección de Prefijo en Ownership de OpenCode y Copilot (`destRel`)**:
  - Paso de `remap.destRel` como `relPrefix` a `syncTargetTree()` en `install-global-opencode.js` e `install-global-copilot.js` para registrar rutas relativas correctas (`agents/...`, `skills/...`) en `.ospec-workflow-install.json`.
- **Poda Segura Fail-Closed en `pruneStaleFiles`**:
  - Re-lanzamiento estricto de cualquier error del sistema de archivos, permisos o violación de seguridad en `install-engine.js` (ignorando únicamente `ENOENT`).
- **Integración de Ownership y Convergencia en Codex**:
  - Soporte de manifiesto de propiedad `.ospec-workflow-install.json`, cálculo de `gatherCodexOwnedFiles()` y poda automática `pruneStaleFiles()` en `install-codex.js`.
- **Preservación de Comentarios JSONC y Fail-Closed en VS Code**:
  - `updateSettingsJsoncPreservingComments()` en `install-vscode.js` para actualizar `chat.pluginLocations` preservando comentarios y formato, retornando código de salida no cero ante configuraciones corruptas.
- **Sanitización de Variables MCP en Cursor**:
  - Resolución o eliminación de placeholders no soportados `${input:...}` en `install-cursor.js` para evitar fugas en `~/.cursor/mcp.json`.
- **Consolidación de la Especificación de Instalación**:
  - Actualización completa de la línea base `openspec/specs/install/spec.md` con los 7 targets globales y requerimientos `REQ-install-008` a `REQ-install-015`.

## [2.44.0] - 2026-08-14

### Added
- **Target Antigravity de Primera Clase**:
  - Perfil declarativo del compilador (`scripts/lib/target-profiles/antigravity.js`) y registro en `PROFILES` de `cli.js`.
  - Transformador de hooks para Antigravity en `scripts/lib/target-transform.js` adaptando eventos (`SessionStart`, `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop`).
  - Validador formal `scripts/configure/validate-antigravity.js` y suite de pruebas `validate-antigravity.test.js`.
  - Instalador transaccional `scripts/configure/install-antigravity.js` con soporte para expansión de variables, idempotencia y preservación de hooks de usuario.
  - Comandos npm en `package.json`: `build:antigravity`, `setup:antigravity`, `reload:antigravity`.
  - Eliminado el script legacy no integrado `scripts/sync-antigravity.js`.
- **Motor Unificado de Instalación (`scripts/configure/install-engine.js`)**:
  - Manifiesto de propiedad (`.ospec-workflow-install.json`) con normalización de rutas POSIX para todos los targets globales.
  - Poda automática y segura de archivos obsoletos (`pruneStaleFiles`) entre versiones preservando estrictamente archivos del usuario.
  - Journal de rollback transaccional con reversión completa en caso de fallo durante la sincronización.
  - Parsers JSON y JSONC seguros con política fail-closed (cero escrituras destructivas ante sintaxis inválida).
  - Fusión no destructiva de configuraciones y hooks en `~/.cursor/hooks.json`, `~/.gemini/config/hooks.json` y `opencode.json`.

### Fixed
- **Hardening de Seguridad y Convergencia Multiobjetivo**:
  - **Cursor**: Sincronización de servidores MCP desde `.mcp.json` y preservación no destructiva de hooks de usuario en `~/.cursor/hooks.json`.
  - **OpenCode**: Ejecución fail-closed en `tool.execute.before` (`opencode-plugin.js`), denegando herramientas ante errores de hook; requerimiento mandatorio de binario compilador (`required: true`).
  - **Copilot**: Fusión segura fail-closed de configuración y seguimiento mediante manifiesto de propiedad.
  - **Codex**: Extracción dinámica de MCP desde `.mcp.json` con soporte completo de variables de entorno (`env`); eliminada la tabla estática duplicada.
  - **Claude**: Validación estricta de códigos de salida en comandos de marketplace y plugin (`status === 0`), eliminando falsos éxitos.
  - **VS Code**: Fusión segura JSONC de `settings.json` preservando comentarios; validador `validate-vscode.js` integrado en la suite de comprobación.
  - **Limpieza de Código Muerto**: Eliminadas constantes obsoletas (`ALLOWED_BUNDLE_KEYS`, `RELATIVE_PATH_KEYS`) en `validate-codex.js`.
  - **Especificación OpenSpec**: Actualizada la línea base de `openspec/specs/install/spec.md` con los requerimientos `REQ-install-008` a `REQ-install-014`.

## [2.43.5] - 2026-08-14

### Fixed
- **Unificación Total de Autoridad TDD y Binding Mecánico Candidate ↔ Git Tree**:
  - `deriveCandidateDeltaPaths` y `recordRemediationAttempt` soportan binding mecánico explícito entre identidades canónicas de Candidate v2 (con digests SHA-256 reales de 64 hex) y Git Tree OIDs (`options.git_trees`, `options.before_git_tree`/`options.after_git_tree`), eliminando el hack de relleno y recorte de 24 ceros (`slice(24)` / `padStart(64, "0")`).
  - `skills/sdd-verify/SKILL.md`: eliminada la regla que otorgaba autoridad directa al prompt del orquestador; `testing.tdd_mode` resuelto mediante `resolveTddMode` es la única autoridad, y el orquestador se limita a reenviar el valor resuelto.
  - `skills/sdd-apply/SKILL.md`: clarificada la activación de Strict TDD supeditada exclusivamente a `testing.tdd_mode: strict`.
  - `rules/sdd-strict-tdd.instructions.md`: actualizada la cabecera de activación condicional para referir a `testing.tdd_mode: strict`.
  - `skills/sdd-init/SKILL.md`: Paso 3 actualizado para definir el test runner como detector de disponibilidad y delegar el modo TDD en `testing.tdd_mode` / preset de escala.
  - `agents/sdd-orchestrator.agent.md`, `docs/tdd-y-revision.md` y `docs/harness-runtime.md`: eliminadas todas las referencias residuales a `strict_tdd: true`.

## [2.43.4] - 2026-08-10

### Fixed
- **Cierre definitivo de Bounded Verify Lineage (K3)**:
  - `deriveCandidateDeltaPaths` exige objetos Git resolubles para calcular el delta real Candidate A → B; eliminados `diffText`/`diff` externos y fallback por conjuntos de paths.
  - `startVerifyLineage`, `evaluateRecheck` y `getLineageNextAction` derivan `contract_digest` exclusivamente desde bytes OpenSpec en disco (`computeContractDigestFromArtifacts(changeRoot, mode)`); el objeto `contract` inline ya no es autoridad.
  - `resolveTddMode` lee únicamente `testing.tdd_mode`; eliminado todo residuo de `strict_tdd`/`strictTdd` en runtime, pre-commit hook, regla Strict y skill de init.
  - `scale: team` ya no activa Focused Mode si `testing.tdd_mode: standard`.
  - Integridad de evidencia de verificación: afirmaciones de `apply-progress.md` y `verify-report.md` reconciliadas contra HEAD real.

## [2.43.3] - 2026-08-10

### Fixed
- **Cierre Final de Garantías de Bounded Verify Lineage (K3)**:
  - Guard de candidate drift pre-remediación (`prepareRemediation`) con validación obligatoria contra `current_candidate_id` antes de escrituras.
  - Derivación mecánica del delta de remediación (`deriveCandidateDeltaPaths`) a partir de la diferencia real Candidate A → Candidate B.
  - Derivación de `contract_digest` directamente desde los bytes de artefactos OpenSpec leídos de disco (`computeContractDigestFromArtifacts`).
  - `resolveTddMode` simplificado a `testing.tdd_mode` exclusivamente, eliminando `scale` y legacy `strict_tdd` en runtime.
  - Fast-path de remediación en `sdd-apply` ejecutado antes de la carga de contexto completo.
  - Lógica determinista de reanudación de tareas (`apply-resume.js`) impidiendo la reejecución de tareas `[x]` tras reinicios.
  - Clasificación de evidencia de verificación (`verify-evidence-classification.js`) y suite de límites de roadmap (`roadmap-boundary.test.js`).
  - Reconciliación de estado terminal de `k3-readiness-remediation` y roadmap marcando K4a como `next-eligible`.

## [2.43.2] - 2026-08-10

### Fixed
- **Alineación de Bounded Verify Lineage con Garantías K3**:
  - Reemplazada la identidad `verify-candidate-v1` por el `Candidate/v2.candidate_id` canónico de K3.
  - Detección de candidate drift activa en todos los estados (`remediation-pending`, `recheck-pending`, `closed`).
  - `contract_digest` vinculado a los bytes reales de artefactos OpenSpec ordenados canónicamente.
  - Comprobación mecánica del scope de remediación (`actual_remediation_changed_paths` ⊆ `allowed_paths`).
  - Recetas explícitas de validación obligatorias para congelar hallazgos bloqueantes sin fallbacks implícitos.
  - Recuperación normal de tareas `[x]` en `sdd-apply` leyendo `apply-progress.md` antes del flujo normal.
  - `resolveTddMode(config)` como única autoridad runtime TDD para `sdd-apply`, `sdd-verify` y pre-commit.

## [2.43.1] - 2026-08-10

### Fixed
- **Remediación de Defectos de Convergencia FSM y Alineación del Contrato Nativo de Codex**:
  - Incorporado el estado `remediation-pending` en `verify-lineage.js` y la transición mediante `recordRemediationAttempt()` a `recheck-pending`.
  - Validación estricta del digest del candidato en estado `closed` (`verified_candidate_id`), transicionando a `supersede-and-discovery` si el código cambia.
  - Reordenado `Step 2a: Bounded Verify Lineage Router` en `sdd-verify/SKILL.md` para ejecutarse al inicio de `sdd-verify` con `HALT` inmediato antes de cualquier preflight de discovery.
  - Implementación del `Step 2c: Remediation Mode Pipeline` y desglose del `Step 4: Common Task Executor` (`standard`, `focused`, `strict`) en `sdd-apply/SKILL.md`.
  - Emisión e instalación exclusiva de `AGENTS.md` para el target Codex en `~/.codex/AGENTS.md` o `<repo>/AGENTS.md`, eliminando la dependencia de `agent.md`.
  - Filtrado de reglas condicionales (`activation: conditional`) en la inyección de `AGENTS.md` para Codex.
  - Unificación de la resolución del modo TDD desde `testing.tdd_mode` como fuente única de verdad.

## [2.43.0] - 2026-08-10

### Fixed
- **Remediación Determinista del Protocolo SDD, Bounded Verify Lineage y Codex Target**:
  - Implementación del reductor puramente funcional `verify-lineage.js` con presupuesto acotado de 2 reintentos de remediación (`max_remediation_attempts: 2`), digests de candidato/contrato y manejo determinista de regresiones causales vs observaciones tardías.
  - Separación física en `sdd-verify` entre los pipelines de Discovery y Targeted Recheck, con `RETURN` explícito tras finalizar la verificación dirigida de hallazgos congelados.
  - Creación e integración del módulo `focused-tdd.md` en `sdd-apply` soportando 3 modos de TDD (`STRICT`, `FOCUSED`, `STANDARD`).
  - Corrección de la duplicación de reglas en la transformación del target Codex (`scripts/lib/target-transform.js`), evitando inyectar contenido de reglas en `agent.md` cuando la estrategia es `to-agents-md`.
  - Migración de la configuración legacy `strict_tdd: true` a `testing.tdd_mode: focused` en `openspec/config.yaml`.
  - Eliminación de la contradicción en `strict-tdd.md` sobre la ejecución de tests tras el lote completo de refactorización.

## [2.42.8] - 2026-08-10

### Changed
- **Reestructuración de Arquitectura TDD, Bounded Lineage y Codex Target**:
  - Desacoplamiento de `strict_tdd: true` implícito por detección de test runner en `sdd-init`, estableciendo el modelo por niveles `testing.tdd_mode` (`standard`, `focused`, `strict`) según escala (`solo` → `standard`, `team` → `focused`, `enterprise` → `strict`).
  - Triangulación y refactorización condicional en `strict-tdd.md` eliminando microciclos excesivos y ejecutando pruebas tras el lote de refactor completo.
  - Exclusión explícita en `tdd-workflow` cuando el ciclo de cambio SDD se encuentra activo.
  - Implementación de `Bounded Verify Lineage` en `sdd-verify`, acotando las re-verificaciones tras `sdd-apply` al chequeo dirigido de hallazgos congelados en `state.yaml` y marcando nuevos problemas como `late_observation` no bloqueantes.
  - Corrección de la estrategia de reglas del target Codex a `to-agents-md` acorde al ADR-001, sintetizando el archivo `AGENTS.md` a nivel raíz y manteniendo el orquestador por debajo de 500 líneas.

## [2.42.7] - 2026-08-10

### Fixed
- **Remediación de Preparación y Cierre de Contratos K3** (`k3-readiness-remediation`):
  - Alineación de la validación de Candidate v2 con el vocabulario fail-closed (`exact`, `changed`, `ambiguous` y `unknown`).
  - Definición explícita de la semántica predecesor/sucesor impidiendo que un Candidate modificado permanezca marcado como `exact`.
  - Inclusión de fixtures de prueba para enlaces simbólicos, rutas sensibles a mayúsculas/minúsculas, proyecciones y separación de identidades.
  - Verificación de la disponibilidad de esquemas y APIs K3 en todas las distribuciones en `dist/`.
  - Reconciliación transaccional de estados de archivo y promoción de decisiones arquitectónicas (`docs/adr/adr-20260809-001` a `004`).

## [2.42.6] - 2026-08-08

### Fixed
- **Endurecimiento de Tipo String en `freezeCandidate` diffText**:
  - Validación explícita de tipo `string` para la propiedad opcional `diffText` en `freezeCandidate`, rechazando valores no-string fail-closed con `TypeError`.
  - Cobertura de prueba unitaria verificando el rechazo de objetos o tipos no-string en `diffText`.

## [2.42.5] - 2026-08-08

### Fixed
- **Integridad de Autodeclaración de SourceSnapshot y Garantía de Esquema en freezeCandidate**:
  - Verificación en `validateWorkOrderBinding` de la autoconsistencia del `source_snapshot_id` declarado dentro del propio registro `sourceSnapshot` contra su digest recomputado, retornando el código de razón específico `SOURCE_SNAPSHOT_ID_MISMATCH` cuando difieren.
  - Validación de patrón `^sha256:[a-f0-9]{64}$` y `minLength: 1` en `schemas/kernel/source-snapshot/v1.schema.json`.
  - Validación estricta de elementos de `paths` (strings no vacíos) en `freezeCandidate` e inyección de un guard de invariante final (`validateCandidateV2`) garantizando que todo resultado de `freezeCandidate` sea siempre schema-valid Candidate v2.
  - Pruebas adversariales adicionales para verificación de autoconsistencia de SourceSnapshot e invariante de freezeCandidate.

## [2.42.4] - 2026-08-08

### Fixed
- **Corrección de Cierre Contractual de Validación de Schemas K3 y Endurecimiento de Candidates**:
  - Eliminación de la mutación/reparación previa de payloads en `validateSourceSnapshotV1`, `validateWorkOrderSchema` y `validateWorkResultV1`, garantizando validación pura sobre el objeto original recibido.
  - Ejecución incondicional de validación de esquema JSON en `validateIdentityKind` para las entidades primarias (`SourceSnapshot`, `WorkOrder`, `WorkResult` y `Candidate`), eliminando el bypass cuando la propiedad `kind` estaba presente.
  - Endurecimiento estricto de `computeCandidateId` para exigir propiedades canónicas K3 (`repository_id`, `projection` `workspace|staged`, `base_tree`, `candidate_tree`, `diff_hash`, `paths` arreglo de strings, `changed_paths_modes_digest`).
  - Cobertura de pruebas unitarias y adversariales adicionales verificando el comportamiento fail-closed ante payloads sin reparar.

## [2.42.3] - 2026-08-08

### Fixed
- **Remediación Acumulativa de Schemas y Bindings Criptográficos K3** (`k3-cumulative-schema-binding-remediation`):
  - Ejecución obligatoria de validación JSON Schema dentro de los gates de binding `validateWorkOrderBinding` (`SourceSnapshot` v1 y `WorkOrder` v2) y `validateWorkResultBinding` (`WorkOrder` v2 y `WorkResult` v1) previa a la recomputación criptográfica.
  - Validación estructural contra JSON Schema v1 en `validateIdentityKind` para objetos `SourceSnapshot` y `WorkResult` sin propiedad `kind` (v1 des-kinded), rechazando objetos vacíos o malformados como `{}` fail-closed.
  - Validación profunda de tipos y formatos de propiedades anidadas en `computeWorkOrderId` (`ownership` owner/mode, `budget` campos numéricos, `dependencies` ítems sha256) y `computeWorkResultId` (`patch` string, `commands` ítems, `logs` ítems, `filesystem_inventory` ítems).
  - Limpieza de la tabla `EXPECTED_KINDS` en `validateIdentityKind` para restricción estricta de `Candidate` a `"candidate/v2"` y `WorkOrder` a `"work-order/v2"`.
  - Inclusión de 58 pruebas TDD unitarias y adversariales garantizando 0 errores y 0 advertencias en todo el sistema.

## [2.42.2] - 2026-08-08

### Fixed
- **Remediación Estricta de Binding y Schemas K3** (`k3-strict-schema-binding-remediation`):
  - Validación de forma estricta sin coerción silenciosa a valores vacíos (`""`, `[]`, `{}`) en las funciones de cómputo de identidades K3 (`computeSourceSnapshotId`, `computeWorkOrderId`, `computeWorkResultId`).
  - Validación acumulativa de contrato y digest (`schema válido ∧ kind/version válido ∧ ID recomputado == ID declarado`) en las puertas de binding `validateWorkOrderBinding` y `validateWorkResultBinding`.
  - Discriminación coherente de tipos v1 permitiendo propiedad `kind` opcional en los schemas `source-snapshot/v1` y `work-result/v1`.
  - Refinamiento de la baseline de inventario `K1_SCHEMA_BASELINE` excluyendo manifiestos evolutivos de registro (`manifest.json` y `contract-claims.json`).
  - Cobertura completa de 10 pruebas adversariales TDD verificando el comportamiento fail-closed ante manipulación de datos o esquemas parciales.

## [2.42.1] - 2026-08-07

### Fixed
- **Cierre de Límites de Identidades K3 y Publicación Canónica v2** (`k3-identities-boundary-closure`):
  - Gate de congelado `INVALID_FROZEN_CANDIDATE` en `evaluateCandidateRelation` rechazando baselines o targets no congelados o inválidos antes de evaluar relación.
  - Discriminación positiva cerrada por tabla `EXPECTED_KINDS` en `validateIdentityKind` fallando ante kinds ausentes o incompatibles.
  - Recomputación criptográfica completa en `validateWorkOrderBinding` y `validateWorkResultBinding` verificando payloads declarados contra digests de origen.
  - Publicación de schemas v2 en rutas canónicas `schemas/kernel/candidate/v2.schema.json` y `schemas/kernel/work-order/v2.schema.json` con id estable `ospec://schemas/kernel/candidate/v2` y `ospec://schemas/kernel/work-order/v2`.
  - Restauración exacta de bytes y pins `K1_SCHEMA_BASELINE` era `02e97a5` para `candidate/v1` y `work-order/v1`.
  - Dominio digest `work-order/v2` para WorkOrder v2 con aislamiento respecto a `work-order/v1`.
  - Promoción de 5 Decisiones de Arquitectura (`ADR-001` a `ADR-005`) en `docs/adr/`.

## [2.42.0] - 2026-08-07

### Added
- **Remediación de Identidades de Ejecución K3 y Versionado de Schemas v2** (`k3-identities-remediation`):
  - Schemas JSON v2 con discriminador de tipo explícito (`kind` const): `schemas/kernel/candidate-v2/v2.schema.json` (`kind: "candidate/v2"`) y `schemas/kernel/work-order-v2/v2.schema.json` (`kind: "work-order/v2"`).
  - Inmutabilidad absoluta de la baseline K1 (`candidate/v1.schema.json`, `work-order/v1.schema.json` y `K1_SCHEMA_BASELINE` preservados al 100%).
  - Constructor exclusivo `freezeCandidate()` para `candidate/v2` con desambiguación estricta entre `diffText` (cadena cruda procesada como digest SHA-256) y `diff_hash` (digest verificado), rechazando valores vacíos o contradictorios.
  - Payloads canónicos completos en `computeWorkOrderId` (incluyendo `dependencies`, `ownership`, `required_evidence`).
  - Validaciones de binding fail-closed `validateWorkOrderBinding()` y `validateWorkResultBinding()`.
  - Recálculo determinista de digests en `evaluateCandidateRelation()`, ignorando el `candidate_id` declarado para detectar spoofing y retornar `DECLARED_ID_MISMATCH` (`relation: "unknown"`, `action: "stop"`).
  - Discriminación cerrada por schema/kind en `validateIdentityKind()` y regla positiva para `EvaluationAttestation` y `DeliveryAuthorization` (exigiendo `CandidateId` sintácticamente válido `sha256:<64 hex>`).
  - Suite de 14 pruebas adversariales verificando inmunidad ante suplantación de identidades, alteración de payloads congelados y alias de tipos.

## [2.41.0] - 2026-08-07

### Added
- **K3: Identidades de ejecución y Candidate freeze** (`k3-identities-candidate-freeze`):
  - Cuatro identidades de ejecución con digests SHA-256 domain-prefixed: `SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`.
  - Schemas JSON estables `source-snapshot/v1` y `work-result/v1` bajo `schemas/kernel/`.
  - Extensión de `candidate/v1.schema.json` con campos de freeze (modos, untracked, predecessor, relación).
  - Campo requerido `source_snapshot_id` en `work-order/v1.schema.json`.
  - Módulo `scripts/lib/execution-identities/index.js` con funciones `computeSourceSnapshotId`, `computeWorkOrderId`, `computeWorkResultId`, `computeCandidateId`, `freezeCandidate`, `evaluateCandidateRelation`, `validateIdentityKind`.
  - Candidate freeze restringido a proyecciones `workspace` | `staged` con digest de modos de archivo y untracked intencionados.
  - Evaluación fail-closed de relación inicial Candidate: `exact`, `changed`, `ambiguous`, `unknown`.
  - Guardas no-aliasing y rechazo de targets mutables para identidades de ejecución.
  - Validación de inputs null/undefined en todas las funciones compute (TypeError guards).
  - Validación de baseline ambiguo/unknown en `evaluateCandidateRelation`.
  - Familias `source-snapshot` y `work-result` registradas en `manifest.json` y `contract-claims.json`.
  - Fixtures de validación (válidos e inválidos) para los 4 schemas.
  - Suite de tests con Strict TDD: 8 tests de ejecución-identidades + fixtures de schema.

## [2.40.11] - 2026-08-07

### Fixed
- **Recuperación fail-closed ante candados stale (`stale-lock-recovery-required`)**: Eliminado el borrado/renombrado automático inseguro de candados caducados en `FileSystemStore.withFileLock`. Al detectar un `.lock` caducado perteneciente a un proceso extinto, `withFileLock` falla cerrado lanzando `stale-lock-recovery-required`.
- **Verificación determinista de exclusión mutua single-writer**: Añadida prueba determinista con barrera `Promise.all` verificando que el número máximo de ejecuciones concurrentes dentro de la sección crítica es estrictamente 1 (`maximumActive === 1`), garantizando la prevención de carreras TOCTOU y escrituras concurrentes.

## [2.40.10] - 2026-08-07

### Fixed
- **Eliminación del puente `setRunKernelOperation` / `runKernelOperation` de `internal/permit-authority.js`**: Removidas las funciones del export de `internal/permit-authority.js` y `index.js`. `runKernelOperation` permanece como función lexical y estrictamente privada dentro de `lifecycle-kernel/index.js`.
- **Eliminación de self-grant en `minimal-kernel-harness.js`**: Removido `runKernelOperation` aceptando `permitLedger` y sustituidas todas las llamadas en el harness por `createKernelRuntime` directo.
- **Estrategia atómica Quarantined Rename en `FileSystemStore`**: Reemplazada la reapertura `"r+"` por la operación atómica del sistema `fs.rename(lockPath, quarantinePath)`. En POSIX y Windows, exactamente un scavenger atómicamente renombra el candado caducado, eliminando completamente la corrupción de bytes nulos (`\0`) por desalineación de offset de archivo y resolviendo la condición de carrera TOCTOU.

## [2.40.9] - 2026-08-07

### Fixed
- **Encapsulación estricta de `permitIssuer` en `createKernelRuntime`**: Eliminada la opción `options.permitIssuer` y la propiedad accesor `permitIssuer` del runtime de producción en `lifecycle-kernel/index.js`. `createKernelRuntime` genera y mantiene `permitIssuer` dentro de su closure privada.
- **Remoción de bypass en `minimal-kernel-harness.js`**: El harness ya no inyecta `input.permitLedger` en `createKernelRuntime`.
- **Composición aislada para tests**: Creado `createTestKernelRuntime` en `scripts/lib/test-support/permit-test-helpers.js` para permitir la inyección controlada de issuers en suites de pruebas unitarias sin contaminar el runtime de producción.
- **Takeover atómico de candados stale**: `FileSystemStore.withFileLock` abre `.lock` en modo `"r+"`, verifica que `ownerToken` bajo el handle coincida con el token caducado del proceso extinto, trunca e instala el nuevo payload atómicamente antes de retornar el handle, eliminando la carrera TOCTOU.

## [2.40.8] - 2026-08-06

### Fixed
- **Aislamiento estricto de `permitIssuer` en `KernelRuntime`**: `KernelRuntime.runOperation` descarta incondicionalmente cualquier `permitLedger` proporcionado por el caller en los argumentos de entrada y utiliza exclusivamente su `permitIssuer` privado interno.
- **Propagación de fallo backend CAS en `AuthorityStore`**: `AuthorityStore.compareAndSwapLocked` inspecciona el resultado de `entry.inner.commit(...)` tanto en el flujo estándar como en el de curado convergente, propagando inmediatamente respuestas no exitosas (como `cas-conflict`) sin alterar el `authority` local ni los baselines.
- **Protección de liveness en stale lockfiles**: `FileSystemStore.withFileLock` verifica la actividad del proceso propietario (`isPidAlive`) antes de eliminar candados `.lock` por caducidad, evitando robo de candados activos en operaciones de larga duración.
- **Pruebas de concurrencia a nivel `AuthorityStore`**: Pruebas de integración con `Promise.all` sobre instancias de `AuthorityStore` compitiendo sobre un mismo `FileSystemStore`, verificando el comportamiento end-to-end de 1 ganador y 1 `cas-conflict`.

## [2.40.7] - 2026-08-06

### Fixed
- **Encapsulación completa de la superficie de autoridad**: Des-exportación de `_internalCreateIssuer`, `mintOperationPermit`, `issueOperationPermit`, `isPermitAuthorityIssuer` y `runKernelOperation` de las interfaces públicas de producción (`permits.js`, `lifecycle-kernel/index.js`). `createKernelRuntime(options)` es el único punto de entrada público. Las funciones internas de permit authority residen en `lifecycle-kernel/internal/permit-authority.js`.
- **Módulo de soporte de pruebas aislado**: Creación de `scripts/lib/test-support/permit-test-helpers.js` con helpers de minteo directo para suites de test, sin re-exportación en módulos de producción.
- **Verificación de `expectedRevision` en CAS backend**: `AuthorityStore.compareAndSwap` propaga `expectedRevision: currentRevision` a `entry.inner.commit(...)` tanto en la ruta CAS normal como en la ruta de curado convergente (heal). `FileSystemStore.commit(...)` verifica `expectedRevision === currentRevision` bajo `withFileLock` y retorna `{ ok: false, code: "cas-conflict" }` si no coincide.
- **Fail-closed en `FileSystemStore.load()`**: Cuando el archivo principal y el `.bak` están ausentes, lanza error con código `authority-head-not-found` en lugar de reinicializar silenciosamente, salvo que se proporcione explícitamente `initializeIfMissing: true`.
- **Lockfile con token de propietario JSON**: `withFileLock` escribe `{ ownerToken, pid, timestamp }` en el archivo `.lock` y solo lo desvincula en `finally` si el `ownerToken` coincide con el del proceso actual, previniendo la eliminación accidental de candados ajenos.
- **Suite adversarial y de concurrencia**: Tests de no-filtración de superficie pública, carrera concurrente con barrera de sincronización (`Promise.all`, 2 instancias leen R0 antes de commit), fail-closed sin archivos, y seguridad de token de propietario.
## [2.40.6] - 2026-08-06

### Fixed
- **Encapsulación total en Kernel Runtime**: Eliminación completa de accesores públicos (`getPrivateIssuer`, `_createPermitAuthorityIssuerInternal`). `createKernelRuntime(options)` actúa como el único punto de entrada con closure privado que protege la capacidad de emisión de permisos.
- **Sanación convergente CAS durable**: `AuthorityStore.compareAndSwap` invoca explícitamente `inner.commit(...)` al curar el authority bag en el camino convergente, garantizando que los permisos consumidos y receipts persistan en disco tras un reinicio.
- **CAS multi-instancia cruzado**: `FileSystemStore` implementa `withFileLock` (archivo `.lock` con reintentos y expiración de stale locks) y comprobación de revisión en disco antes del commit. Dos instancias concurrentes sobre la misma revisión resultan en exactamente un éxito y un conflicto `cas-conflict`.
- **Recuperación resiliente en Windows**: `FileSystemStore.load()` inspecciona y restaura automáticamente desde archivos de respaldo `.bak` cuando la ruta principal devuelva `ENOENT`, evitando reinicializaciones accidentales del lifecycle.
- **Vinculación de revisión post-CAS en Receipt**: `OperationReceipt.revision` se vincula a la revisión ganadora post-CAS `R1` (en lugar de la previa `R0`).

## [2.40.5] - 2026-08-06

### Fixed
- **Encapsulación estricta del Permit Issuer**: Eliminación de `getPermitIssuer()` de la interfaz pública de `AuthorityStore`. Remoción de `PERMIT_AUTHORITY_ISSUER` y `createPermitAuthorityIssuer` de las exportaciones públicas, y reemplazo del `Symbol.for` global por un `Symbol` privado a nivel de módulo (`STORE_ISSUERS` WeakMap), impidiendo que llamantes externos obtengan o falsifiquen la capacidad emisora.
- **Registro CAS atómico unificado y durabilidad crash-safe**: `AuthorityStore` persiste la tupla completa de 4 elementos `{ state, journal, authority, budgets }` como una sola unidad atómica durante el CAS. `FileSystemStore` implementa secuencia atómica en 4 pasos (escritura en archivo temporal -> `fsync` de archivo -> renombrado atómico `renameSync` -> `fsync` de directorio padre) garantizando recuperación consistente tras un reinicio de proceso sin requerir la invocación manual de `snapshot()`.
- **Cierre 4R auditable**: Re-certificación auditable de las 4 dimensiones de revisión (`risk`, `resilience`, `reliability`, `readability`) con estado `approved`.

## [2.40.4] - 2026-08-06

### Fixed
- **Issuer capability**: `createPermitLedger()` es reader-only; solo `createPermitAuthorityIssuer()` (propiedad del Authority Store) puede registrar offers/decisions y emitir permits. `runKernelOperation` rechaza ledgers ajenos (`issuer-capability-required`).
- **Replay ligado al intent persistido**: la authority bag guarda `operation_intent_digest` / digests completos; `findReplayReceipt` compara contra el registro almacenado, no contra el permit presentado por el caller.
- **IDs no reciclables**: `permit_id` / offer / decision usan UUID; restart no colisiona con IDs consumidos.
- **CAS atómico**: mutex por subject; authority bag se publica solo tras `inner.commit` exitoso; `computeRevision` incluye `authority_root_digest`.
- **Oráculos semánticos**: `enforced` exige marcadores por capability (`execution_id`, `worker_id`, `tool`, `answered`+correlation, `authorizes_delivery===false`); no-op/`{}` → `partial`.

### Docs
- Changelog de hardening durable-authority + semantic oracles (pre-K3).

## [2.40.3] - 2026-08-06

### Fixed
- **Issuer sin DTOs fabricados**: `issueOperationPermit` exige `offer_id` + `decision_id|rule_id` registrados en el ledger runtime (`registerTransitionOffer` / `registerPolicyDecision` / `registerHumanDecision` / `registerKernelRule`); DTOs inventados → `issuer-fabricated-decision`.
- **Probes ejecutados para `enforced`**: `createClaudeHostAdapter` es async y marca `enforced` solo tras observar un `TransportOutcome` real vía `invokeTransportAsync`; `liveProbes` declarativos ya no autorizan.
- **Promise anidada rechazada**: handlers Claude hacen `await` de primitives; `invokeTransportAsync` asienta thenables en `value` y clasifica rechazo como `ok:false` (sin falso éxito).

### Docs
- Changelog de hardening pre-K3 (authority provenance + live probes + async settlement).

## [2.40.2] - 2026-08-05

### Fixed
- **CapabilityProof live bind**: `verifyCapabilityProof` exige identidad viva (`expectedAdapterId/Version`, `expectedHostRuntimeVersion`, `expectedProbeDigest`); el headless ya no rellena el digest desde `proof.probe_digest`.
- **Claude `enforced` honesto**: solo con primitiva real + live probe + digest independiente; sin primitiva → `unavailable|instructional|partial`.
- **Transports async seguros**: `invokeTransportAsync` / `classifyTransportFailure` compartidos; rechazo de Promise → `ok:false`; settlement del invoke tras timeout/cancel (sin `unhandledRejection`).
- **Fault matrix vía ports**: fallos atraviesan el adapter con wrappers + invoke async (no solo inject sintético).
- **Deep-freeze de ports** en `createHostAdapter`; schemas aditivos `transport-request|outcome|failure` v1.
- **W4 harness-alone**: test negativo runtime de cobertura incompleta sin Headless peer.

### Docs
- Specs baseline deltas en capability-proof, host-capabilities-contract, reference-host-adapter, headless-conformance-host, kernel-contract-schemas, minimal-kernel-harness, lifecycle-kernel-runtime.
- ADRs `adr-20260805-007`…`009`; change archivado en `openspec/changes/archive/2026-08-05-k2a-1-live-capability-probes-async-transports/`.
- Roadmap: k2a-1 `done`; K3 `next-eligible`.

## [2.40.1] - 2026-08-05

### Fixed
- **K2.1b permit issuance**: `runKernelOperation` deja de auto-mintear (`mintPermit` default `false`); issuer controlado `issueOperationPermit` (TransitionOffer + PolicyDecision|HumanDecision|KernelRule + `expected_revision`).
- **Consume atómico**: permit consumed + `OperationReceipt` co-commiteados en la misma revisión CAS que state/journal (authority bag); sin receipt efímero post-CAS.
- **4R remediation**: CAS convergente co-escribe bag o fail-closed; bag materializado antes de `inner.commit` con rollback; `mintOperationPermit` fuera de la API pública; exact-replay liga `arguments_digest`; `permit-reuse` consulta bag; `persistJournal` respeta `commitJournal` `ok:false`.

### Docs
- Roadmap quick-path: deja de decir bare `Ejecutar K2a → K3` (WARNING5).
- Specs baseline deltas en `operation-permits`, `authority-store`, `lifecycle-kernel-runtime`, harness/model/canon.
- ADRs `adr-20260805-005`…`006`; change archivado en `openspec/changes/archive/2026-08-05-k2-1b-permit-issuance-atomic-consume/`.

## [2.40.0] - 2026-08-05

### Added
- **K2a Host Capabilities Contract**: `HostCapabilities` con estados cerrados `enforced|partial|instructional|unavailable` y cinco transports (`Execution`, `Question`, `Worker`, `ToolExecution`, `DeliveryGate`) sin autoridad de lifecycle/CAS/permit.
- **CapabilityProof**: prueba reproducible (`adapter_version`, `host_version`, `fixture`, `evidence_digest`) requerida antes de `enforced`; digests canónicos sin timestamps.
- **Headless Conformance Host**: peer del Minimal Kernel Harness con fault matrix (timeout/cancel/worker-fail/interrupt), rechazo de adapters que dupliquen lifecycle/Graph, y outcomes fail-closed.
- **Reference adapter Claude Code**: único adapter real activado; registry con stubs inactivos para el resto (expansión en K11a).
- **Schemas / model**: ocho familias JSON Schema K2a, `host-boundary` + scope-guard, seis checkers de modelo y peer wiring del harness.

### Fixed
- **4R remediation**: denylist de autoridad completa (aliases snake_case), `invokePort` con catch estructurado, `pass` exige `ok===true` sin fault, helper legible `selectEnforcementFailureReason`.

### Docs
- Specs baseline nuevas: `host-capabilities-contract`, `capability-proof`, `headless-conformance-host`, `reference-host-adapter` + deltas en runtime/harness/schemas/canon/model.
- ADRs `adr-20260805-001`…`004`; change archivado en `openspec/changes/archive/2026-08-04-k2a-headless-conformance-host/`.

## [2.39.0] - 2026-08-04

### Added
- **K2.1 Authority Store**: CAS obligatorio (`compareAndSwap`) con revisión `state+journal`, durabilidad mid-op vía `commitJournal` y ancla por-writer (`mid_op_ticket`) que cierra recycle S0→S1→S0 y forge ajeno.
- **OperationPermit / OperationReceipt**: ledger runtime-owned; `TransitionOffer` nunca autoriza; receipt distinto de `receipt/v1`; binding de operation/subject/args al ledger.
- **Effect semantics**: clases cerradas `pure|idempotent-keyed|probeable|compensatable|irreversible`; irreversible ambiguo → `decide|stop` sin retry ciego; interrupt en `executing` persiste `unknown`.
- **Harness / model / schemas**: fault matrix K2.1 (CAS/stale/reuse/irreversible), 7 checkers ejecutables, familias `operation-permit`, `operation-receipt`, `effect-class`.

### Fixed
- **4R remediation**: 8 hallazgos bloqueantes resueltos (ticket mid-op, authorize binding, interrupt unknown, tests mid-op, rename semántico, permit↔operation).

### Docs
- Specs baseline: `authority-store`, `operation-permits`, `effect-semantics` + deltas en runtime/harness/model/schemas/canon.
- ADRs `adr-20260804-001`…`004`; change archivado en `openspec/changes/archive/2026-08-04-k2-1-authority-store-permits/`.

## [2.38.0] - 2026-08-04

### Added
- **K2 Lifecycle Kernel**: núcleo funcional / shell imperativo con digest de estado, registro de operaciones, reducer puro, selector de transiciones, journal con idempotencia/reconciliación, eventos derivados no autoritativos y recovery honesty.
- **Minimal Kernel Harness**: API pública determinista con store/executor/clock inyectados, matriz de interrupción, snapshot round-trip y halt en `decide` sin auto-aprobación.
- **Model-based conformance**: exploración acotada en Node con 8 invariantes ejecutables, ports opacos (`SubjectId`/`AuthorityToken`/`BudgetRef`/`PolicyRef`), manifest diferido y replay de contraejemplos vía harness.
- **Parity de superficie runtime**: proyecciones humana/negociada derivadas de la misma transición K2; command honesty contra dead-ends.
- **Bridges de compatibilidad**: routing, review-lineage y archive consumen operaciones K2 sin segundo reducer ni romper historiales.

### Fixed
- **Fail-closed de effects**: `{ok:false}` y outcomes ambiguos no avanzan estado; journal `failed`/`unknown` con resume `reconciliation-required`; `started` solo reintenta con barrera pre-effect.
- **K1 scope-guard**: rutas sucesoras K2 excluidas del inventario congelado K1 sin debilitar el allowlist K1.
- **Durabilidad de journal**: `commitJournal` obligatorio en mutaciones; `effectExecutor` requerido salvo `status`.

### Docs
- Specs baseline: `lifecycle-kernel-runtime`, `minimal-kernel-harness`, `lifecycle-model-conformance` y delta `transition-surface-parity` (REQ-006/007).
- Change archivado en `openspec/changes/archive/2026-08-04-k2-lifecycle-kernel/`.

## [2.37.2] - 2026-08-03

### Fixed
- **Cursor hooks / Task**: el launcher degrada `permissionDecision: ask` a `allow` + mensaje advisory en hosts Cursor (`preToolUse`, `beforeShellExecution`, `beforeReadFile`, `subagentStart`), porque Cursor no implementa `ask` y abortaba el despacho de subagentes con error fatal.
- **Install Cursor**: al sincronizar `hooks.json`, cablea `preToolUse`/`subagentStart` (y `preCompact` cuando aplica) a partir de los eventos ya generados; `validate-cursor` acepta esos eventos.

## [2.37.1] - 2026-08-03

### Fixed
- **Instalación completa y rollback (Targets)**: Completa la sincronización de artefactos gestionados y aplica rollback transaccional ante fallos tardíos, restaurando bytes y permisos, retirando altas MCP parciales y limpiando directorios nuevos sin alterar archivos del usuario.
- **Validación binaria fail-closed (Copilot y Cursor)**: Distingue contenido binario real de texto por su contenido, exige el ejecutable nativo requerido y convierte errores, carreras y artefactos ilegibles del filesystem en fallos de validación explícitos.

### Changed
- **Idempotencia real (Codex y Cursor)**: Las reinstalaciones convergen sin duplicar agentes, hooks o MCP, preservan configuración y autenticación del usuario, y mantienen sin cambios los digests de los árboles gestionados.
- **Evidencia de verificación (Setup de targets)**: Valida 127 pruebas focales y una suite global con 1.734 pruebas aprobadas, 2 omitidas y 0 fallos; cobertura combinada de 89,41% en líneas, 84,64% en ramas y 95,35% en funciones.

## [2.37.0] - 2026-08-03

### Added
- **K1 contract suite**: Árbol `schemas/kernel/` versionado (`$id` `ospec://…/v1`) con 12 familias, fixtures válidos/inválidos, aliases de migración y emission claims.
- **Canon de autoridad y clasificación**: `authority-canon`, clasificador con hard floors por evidencia (migration/auth/API pública/Repair/Direct), fingerprint `stableSerialize`+SHA-256 y reasons estables; sin cablear routing fixed.
- **Transición y paridad de superficies**: `next_transition` (`execute|collect|decide|stop`) con tokens/`command` cuando aplica, y paridad material entre proyección humana y envelope negociado.
- **Checkers CI K1**: cuatro checkers en `contract-lint` (schema-compat, emission, prose-authority, maturity) registrados en `DEFAULT_REGISTRY`.
- **Baselines OpenSpec**: dominios `harness-authority-canon`, `kernel-contract-schemas`, `change-classification`, `transition-surface-parity` y delta `contract-lint` (REQ-008…011); ADRs 20260803-001…004.

### Fixed
- **Validador JSON Schema dep-free**: `schema===false` rechaza toda instancia; schemas no-objeto fallan cerrado (no false-valid).
- **Cobertura execute-token**: tests RED para argumentos `execute` sin `token` o solo whitespace.

### Docs
- Madurez `{implemented|target|experimental}` en arquitectura del harness; change archivado en `openspec/changes/archive/2026-08-03-k1-contract-suite/`.

## [2.36.0] - 2026-07-31

### Added
- **Baseline fixed-policy canónica (PR #74)**: Publica la política de referencia 9/9 con identidad, provenance y métricas comparables; la publicación es atómica y fail-closed, mientras el smoke 3/3 se mantiene como diagnóstico. Verificación: 68/68 focales, 17/17 ciclos y 34/34 bindings.

### Security
- **Receipts Strict TDD runtime autenticados por contenido (PR #73)**: Rechaza de forma fail-closed tampering, traversal y symlinks, y preserva los bytes raw en Windows. Verificación: 33/33 pruebas focales y suite global verde.

### Fixed
- **Cierre del gate 4R (Harness)**: Corrige los contratos de diffs Git canónicos para archivos vacíos y del envelope completo del generalista. Las pruebas focales y relacionadas, además de la suite global, quedaron verdes tras ambos fixes.

### Changed
- **Política agente→tier canónica (PR #72)**: Establece `models.yaml` como única fuente de política, conserva las invariantes estructurales del resolver, reasigna `sdd-propose` al tier `default` y alinea documentación, specs, fixtures y contratos.
- **Roadmap del harness**: Reorienta las prioridades hacia el kernel determinista y Graph IR.

### Docs
- **Trazabilidad SDD de fixed-policy**: El cambio, ejecutado con TDD estricto y gate 4R, cerró con PASS de 16/16 escenarios MUST; quedó archivado transaccionalmente en `openspec/changes/archive/2026-07-31-fixed-policy-reference-baseline/`, sincronizó `openspec/specs/orchestrator-evals/spec.md` y promovió `docs/adr/adr-20260731-001-publish-a-self-describing-fixed-policy-baseline.md`.

### Known limitations
- **Validación temporal del candidato**: Se conserva como advisory no bloqueante la falta de validación ISO-8601 de `candidate.generated_at`.

## [2.35.0] - 2026-07-26

### Added
- **Archive híbrido transaccional (O6A)**: `sdd-archive` emite `archive-plan.json` (Plan-and-Report); runtime determinista (`scripts/lib/archive-plan.js`, `scripts/lib/archive-transaction.js`, CLI `scripts/archive-transaction-run.js`) valida gates/fingerprints/hashes, stagea bajo `.ospec/archive-tx/{change}/`, compara bytes, hace commit atómico y borra el origen solo tras full match, con journal, rollback, recovery y receipt.
- **Baseline OpenSpec**: dominios nuevos `archive-plan-contract` y `archive-transaction-runtime`; deltas en `agents` (REQ-agents-008 → invocación de runtime con receipt) y `skills` (Plan-and-Report, Cost en receipt, fingerprints en preflight).
- **`renameWithFallback`**: export aditivo en `atomic-write.js` para rename de directorio con fallback Windows `EPERM`/`EEXIST`.

### Security
- **Path confinement fail-closed** en plan/CLI/runtime (`../`, absolutos, domain traversal).
- **Override de quality-gates** ligado al mismo approval o al subárbol `gates.quality-gates.override` (sin regex fail-open de documento completo).

### Changed
- Commit mid-flight con journal `committing`, retención de `.bak`/`created_by_tx` para rollback, `done` antes de `rm(origin)`, y fixtures FS de Compare A/B, kill/resume y rollback post-commit.
- Roadmap: O6A entregado; siguiente en ruta crítica **O2B** (baseline fixed-policy).

### Docs
- ADR `adr-20260726-001` … `adr-20260726-006` (staging/journal, validador puro, renameWithFallback, failure_reason vs plan codes, preflight runtime-owned, paridad Go N/A).
- Change archivado: `openspec/changes/archive/2026-07-26-hybrid-archive-transaction-runtime/`.

## [2.34.0] - 2026-07-25

### Added
- **Target nativo Cursor (sexto host)**: perfil `scripts/lib/target-profiles/cursor.js`, transform `to-mdc` / hooks camelCase / `readonly` en review-*, `toolMap` Cursor (`Read`, `Write`+`StrReplace`, `Grep`+`Glob`, `Shell`, `Task`) con degradación del ask-tool a chat estructurado.
- **Instalación generator-first**: `npm run build:cursor` → `dist/cursor`; `npm run setup:cursor` / `reload:cursor` → `scripts/configure/install-cursor.js` sincroniza `~/.cursor` expandiendo `__OSPEC_CURSOR_ROOT__`.
- **Validador y golden Cursor**: `validate-cursor.js`, fixtures `scripts/configure/__fixtures__/golden/cursor/`, matriz de seis targets en `check.js` / real-repo / parity.

### Changed
- **Baseline OpenSpec**: sincroniza deltas en `generator` (`REQ-generator-006`–`009`), `install` (`REQ-install-004`–`007`), `agents` (`REQ-agents-017`) y `hooks-runtime` (`REQ-hooks-runtime-001`).
- **Seguridad del instalador**: assert por destino (anti-symlink anidado), re-check pre-write, quote siempre en hooks, fail-closed si falta `hooks.json`, abort no-cero ante fallo parcial.

### Removed
- **`scripts/sync-cursor.js`**: retirado; `setup:cursor` ya no usa sync ad-hoc.

### Docs
- ADR `adr-20260725-006` … `adr-20260725-009` (to-mdc, sourceRoots AGENTS.md, frontmatter Cursor, instalador dedicado)
- Change archivado: `openspec/changes/archive/2026-07-25-cursor-native-target/`

## [2.33.0] - 2026-07-25

### Added
- **Fast path Strict TDD de evidencia (O4.2)**: reparación fail-closed limitada a gaps de formato con identidad de candidato congelada, allowlist de evidencia y un solo focal recheck.
- **Provenance histórica content-addressed**: modo `historical` autentica snapshots append-only bajo `.ospec/strict-tdd-historical/`; tampering, refs ausentes o corruptas fallan cerrado sin comparar bytes del working tree.
- **Política canónica de tiers en `models.yaml`**: partición SDD 5/6/6 y paridad de generación en los cinco targets; `enforceModelPolicy` deja de ser bypass público.

### Changed
- **Baseline OpenSpec**: sincroniza deltas en `agents` (`REQ-agents-016`), `routing` (`REQ-routing-006`), `skills` (`REQ-skills-008`), `generator` (`REQ-generator-005`) y `sdd-document` (`REQ-sdd-document-001`, tier `cheap`).
- **Cierre 4R remediation-v2**: el último slice `historical-provenance` de O4.2 pasa validación dirigida; lineage `approved` con `all-remediation-slices-passed`.

### Docs
- ADR `adr-20260725-003-structured-strict-tdd-evidence-is-authoritative`
- ADR `adr-20260725-004-freeze-evidence-remediation-in-independent-pure-reducer`
- ADR `adr-20260725-005-treat-models-yaml-as-canonical-model-tier-policy`
- Change archivado: `openspec/changes/archive/2026-07-25-strict-tdd-evidence-remediation-fast-path/`

## [2.32.0] - 2026-07-25

### Added
- **Remediación 4R por slices (remediation-v2)**: presupuestos y validación independientes por causa raíz; slices passed solo se reabren con evidencia de regresión atribuible (`impacted_slices`).
- **Migración determinista O4.2 / schema-v1**: partición aditiva e idempotente a slices; falla cerrada si `regression.detected: true` no trae impactos atribuibles.
- **Telemetría de phase-cost para 6 agentes review**: allowlist JS/Go alineada para el ciclo de revisión selectiva.

### Changed
- **`createSuccessor`**: exige `authority_kind` allowlisted (`new-candidate` | `new-scope` | `new-discovery-authority`) también sobre predecesores no migrados a v2.
- **`validateSliceCorrection`**: binding exclusivo al `active_slice_id` / `pending_correction.slice_id`; paridad fail-closed con v1 en outcomes y `regression.evidence`.
- **Baseline OpenSpec**: sincroniza deltas en `routing`, `agents`, `skills` y `hooks` tras archivar `review-remediation-slices`.

### Fixed
- Binding no acotado de `activeSlice` que permitía validar un slice ready no activo.
- Fail-open de validación v2 ante regression omitida o `detected:true` sin `impacted_slices`.

### Docs
- ADR `adr-20260725-001-independently-version-slice-remediation`
- ADR `adr-20260725-002-correction-authority-root-cause-slice-scoped`
- Change archivado: `openspec/changes/archive/2026-07-25-review-remediation-slices/`

## [2.31.0] - 2026-07-18

### Changed
- **[Escalado adaptativo de revisión] (Routing)**: Los cambios `normal` con 0 señales no despachan especialistas, con 1 o 2 ejecutan revisión dirigida y con 3 o 4 escalan a profundidad `strict` con cobertura 4R completa, sin descartar dimensiones positivas.
- **[Auditoría de profundidad y escalado] (Review gate)**: `scripts/lib/review-dimensions.js`, `scripts/lib/review-gate-state.js` y la baseline `openspec/specs/routing/spec.md` persisten la profundidad y el motivo determinista de escalado, conservando el generalista inicial, el fingerprint de evidencia y el linaje acotado.
- **[Trazabilidad SDD y verificación] (OpenSpec)**: El change archivado `review-signal-overflow-escalation`, ejecutado por la ruta `standard` con Strict TDD y compuerta 4R, sincroniza la baseline de routing y el ADR `adr-20260718-005-persist-explicit-review-depth-and-overflow-reason.md`; la verificación focal pasó 40/40 y la suite completa 1375/1377, con 2 skips ambientales y 0 fallos.

## [2.30.0] - 2026-07-18

### Added
- **Compuerta de revisión generalista (O5)**: Ejecuta una compuerta generalista de lectura exclusiva (`review-change`) antes de invocar a los especialistas, derivando la necesidad de despacho de forma estructurada.
- **Despacho selectivo de especialistas (O4)**: Limita la ejecución a un subconjunto de 0 a 2 dimensiones especialistas para cambios normales basándose en prioridades de evidencia deterministas, y los 4 especialistas para cambios de alto riesgo.
- **Máquinas de estado y linaje de revisión acotado (O4)**: Implementa reducciones puras en `review-gate-state.js` y `review-lineage.js` que congelan la génesis, el presupuesto de líneas y limitan las correcciones dirigidas a 3 intentos, previniendo bucles infinitos de revisión.
- **Paridad de targets en revisión**: Integra la compuerta generalista y validación de linaje en claude, vscode, github-copilot, opencode y codex.

### Fixed
- **Target VS Code**: el generador interpreta listas YAML multilínea y entradas estructuradas de `models.yaml`, incrustando los modelos configurados sin producir `[object Object]`.
- **Binding O1 en Windows**: las comprobaciones de identidad de archivos toleran la diferencia de `dev` entre `lstat` y `fstat`, manteniendo la validación del inode y del contenido del transcript `codex-events`.

### Tests
- **Verificación del hotfix y linaje**: `npm test` completó todos los checks con 0 errores y 0 warnings.

## [2.29.1] - 2026-07-15

### Fixed
- **Telemetría de costes por fase**: el runtime Go normaliza los eventos
  `token_count` del host, mantiene índices globales entre relanzamientos y
  evita ejecutar callbacks sin adquirir el lock.
- **Persistencia de artefactos**: la telemetría phase-cost se conserva durante
  las pruebas y el change archivado incluye el bloque Cost agregado por fase.

## [2.29.0] - 2026-07-15

### Added
- **Clarify condicional (O3)**: `sdd-spec` emite señales estructuradas de ambigüedad y el
  orquestador solo despacha `sdd-clarify` cuando alguna lo justifica; una spec estándar
  bien definida continúa directamente a diseño.
- **Envelopes fail-closed por fase**: la validación rechaza señales ausentes o mal tipadas
  en resultados exitosos de `sdd-spec` antes de persistir estado o despachar fases
  posteriores, sin romper el fallback de envelopes genéricos.

### Changed
- **Paridad del contrato en runtimes y targets**: JavaScript y Go aplican el mismo orden
  determinista de validación, y los cinco targets generados preservan la decisión
  condicional de clarify.
- **Trazabilidad SDD y remediación 4R acotada**: el change
  `make-clarify-conditional` cerró 20/20 tareas y 11/11 escenarios; los hallazgos de
  Reliability se corrigieron y revalidaron sin reabrir reviewers sin hallazgos.

### Tests
- **Verificación final**: `npm test` pasó 1306/1308 pruebas con 2 skips esperados y
  `go test -count=1 ./...` pasó los 9/9 paquetes.

## [2.28.0] - 2026-07-14

### Added
- **Configuración de agentes (Codex target)**: Soporte para la emisión del parámetro `model_verbosity` en los TOML de agentes de Codex, permitiendo el control fino de la verbosidad de salida de los modelos según la configuración de tiers en `models.yaml`.
- **Reconciliación global de especificaciones (SDD Reconcile)**: Ejecución de la fase de reconciliación global (`sdd-reconcile`) sobre los 8 dominios con desviaciones detectadas (`routing`, `skill-registry`, `install`, `generator`, `hooks`, `skills`, `agents`, `sdd-document`), sincronizando de forma aditiva las especificaciones con los cambios de código y actualizando el registro en `manifest.md`.

### Added
- **Benchmark de cambios de referencia (O2)**: catálogo canónico de nueve perfiles,
  runner con métricas run-level, identidad fuerte de cache, recuperación offline y
  publicación atómica de la baseline solo cuando existe evidencia comparable 3/3.
- **Evidencia diagnóstica y seguimiento operativo**: conserva observaciones no
  comparables fuera de la baseline y documenta la separación entre infraestructura
  verificable y ejecución live posterior.

## [2.26.0] - 2026-07-12

### Added
- **Telemetría de coste por dispatch (fase O1)**: Registro de métricas detalladas de tokens (prompt, artefactos, salidas de herramientas y salida de modelos), duración en milisegundos, tier del modelo, estado de relanzamiento y timestamp en `phase-costs.jsonl`. Garantiza paridad entre las implementaciones de JS y Go y aislamiento frente a fallos de I/O.
- **Visualización de costes en Archive**: Integración del bloque agregador `Cost` en `archive-report.md` para mostrar las invocaciones, relanzamientos, duración acumulada y consumo de tokens por categoría para cada fase del flujo SDD.

## [2.25.4] - 2026-07-11

### Fixed
- **Target Codex nativo y global**: `setup:codex` instala agentes, skills y hooks directamente en la configuración global de Codex, sin marketplace ni plugin residual. Los hooks de `SessionStart` y `PreToolUse` emiten ahora el protocolo nativo válido de Codex.
- **Sincronización idempotente de skills por agente**: cada agente instalado referencia exclusivamente su skill homónima; el instalador compara el contenido completo y solo actualiza las skills que difieren, conservando los recursos ajenos. El runtime ya no duplica skills y elimina el perfil TOML obsoleto del orquestador, cuya configuración pertenece a `AGENTS.md`.

## [2.25.3] - 2026-07-11

### Fixed
- **Instalación global de Codex adaptada a AGENTS.md**: corregida la ruta de destino global en el instalador para que apunte a `~/.codex/AGENTS.md` de acuerdo con la especificación oficial, manteniendo `agent.md` a nivel de proyecto local para el orquestador.

## [2.25.2] - 2026-07-11

### Fixed
- **[Límite de delegación generada] ([Agents])**: los perfiles de agentes generados emiten `[agents] max_depth = 1` desde `scripts/lib/target-profiles/codex.js` y `scripts/lib/target-transform.js`, evitando la delegación recursiva y preservando una capa coordinador-trabajador. Cambio guiado por SDD (ruta standard) con TDD estricto y gate 4R. Verificación: 120 pruebas enfocadas y `npm test` en PASS.

## [2.25.1] - 2026-07-10

### Fixed
- **Instalación Codex idempotente frente a MCPs y marketplaces preexistentes**: `setup:codex` reutiliza servidores con el mismo `command` + `args`, preserva colisiones de nombre y no intenta reemplazar un marketplace `ospec-tools` ya registrado desde otra fuente.
- **Payload MCP nativo para Codex**: el plugin Codex deja de empaquetar el `.mcp.json` camelCase heredado; Context7 y MarkItDown se registran una sola vez mediante `codex mcp` con IDs compatibles (`context7`, `markitdown`). El validador bloquea `.mcp.json`/`mcpServers` residuales y el generador elimina artefactos stale.
- **Setup local compatible con Codex 0.144.1 en Windows**: el catálogo se genera en `.agents/plugins/marketplace.json` con el schema documentado y los shims npm `.cmd` se ejecutan a través de Node sin habilitar shell.

## [2.25.0] - 2026-07-10

### Added
- **Contrato del payload publicado para Codex (change `codex-target-phase-2`)**: el manifiesto del target (`.codex-plugin/plugin.json`) retiene metadata (`name`/`version`/`description`) y emite todos los paths de componentes (`skills`, `mcpServers`, `hooks`) en forma segura relativa a `./`, rechazando traversal (`..`) y rutas absolutas en `target-transform.js`. `validate-codex.js` endurece el gate correspondiente y añade validación de ids de servidores MCP contra `^[a-zA-Z0-9_-]+$` como fallo duro de generación.
- **Wrapper de hooks de 5 eventos con adaptador POSIX/Windows**: `codexHooks` envuelve cada uno de los cinco eventos soportados (`SessionStart`, `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop`) en grupos `{matcher, hooks:[{command, commandWindows, timeout}]}`, con paridad Go/JS íntegra (`internal/hooks/pretooluse.go`, `internal/hooks/subagentstop.go`).
- **Alias de transcript y contrato de PreToolUse sin `ask`**: `SubagentStop` acepta `input.agent_transcript_path` como alias del campo estándar; `PreToolUse` degrada decisiones `ask` a `allow` + mensaje advisory cuando el wrapper generado señaliza el target mediante dos variables de invocación combinadas (ver *Security* abajo).
- **Instalación separada e idempotente de plugin y agentes TOML**, documentada en `docs/codex/README.md` (instalación/actualización, revisión y confianza de hooks vía `/hooks`, flujo de tarea nueva, rollback) y verificada con un smoke test end-to-end (`codex-smoke.test.js`) contra el payload generado e instalado en un directorio temporal.
- 10 nuevos requisitos + 1 modificado sincronizados a los dominios baseline `generator`, `hooks`, `install` y `agents` (18 escenarios), y 3 ADRs promovidas a `docs/adr/`.

### Security
- **Degradación ASK→allow ya no depende únicamente de una variable de entorno de sesión**: tras un hallazgo CRITICAL del gate de revisión (riesgo de fuga por variables de entorno residuales de shell/CI), la degradación exige ahora DOS señales por invocación — el selector de target y un marcador inline (`OSPEC_CODEX_WRAPPER=1`) que el propio wrapper generado inyecta en cada comando — aplicado en paralelo en el hook JS y su espejo Go.
- **Guard de atribución de IA en mensajes de commit portado al hook Go**: cerrado un hueco de paridad que permitía que un `git commit` con atribución de IA pasara sin bloqueo cuando se despachaba vía el binario Go (`internal/hooks/pretooluse.go`), en vez de solo vía el hook JS.

## [2.24.0] - 2026-07-09

### Added
- **Distribución de Marketplace para Codex (Marketplace)**: Nuevo flujo de empaquetado en `codex-marketplace.js` que aísla y ensambla el marketplace de Codex en `plugins/codex/ospec-workflow` de forma independiente a Claude. Verificación: tests unitarios en `codex-marketplace.test.js` y workflow de GitHub Actions actualizados.
- **Tiers y Modelos para Codex (Models)**: Actualización de `models.yaml` para incorporar la familia OpenAI GPT-5.6 (`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`) con inyección de `model_reasoning_effort` y `model_verbosity` según el tier. Verificación: test de contrato en `real-repo.test.js`.

### Fixed
- **Remoción de Configuración Automática de Codex (Configure)**: Eliminación de la creación y fusión destructiva de `.codex/config.toml` en `install-codex.js` para evitar colisiones con claves del usuario; el validador de Codex `validate-codex.js` ahora prohíbe explícitamente la presencia de este archivo. Ciclo SDD completo: change `fix-codex-config-toml` verificado con Strict TDD y suite de 106 tests integrados en verde.

## [2.23.0] - 2026-07-09

### Added
- **Soporte del target de Codex (Bloques 5.1 a 5.4)**: nuevo perfil de target `codex` en `target-profiles/codex.js` consumido por `target-transform.js`, que genera el bundle de plugin `.codex-plugin/plugin.json` y transforma los markdown de agentes a TOML en `.codex/agents/` con mapeos de tiers a modelos y sandbox_mode automático.
- **Puente de hooks para el target Codex (Bloque 5.2)**: transforma `hooks/hooks.json` a PascalCase y reescribe `${CLAUDE_PLUGIN_ROOT}` a `$PLUGIN_ROOT` en la invocación de los hooks.
- **Instalador y Distribución de Codex (Bloque 5.3)**: nuevos comandos de instalación local (`npm run install:codex`) e instalador global (`npm run setup:codex`), que compilan, copian los TOML de agentes a `~/.codex/agents/` y realizan la fusión no destructiva de la configuración en `.codex/config.toml`.
- **Columna de modelos en models.yaml (Bloque 5.4)**: añadida la columna `codex` que mapea la familia OpenAI GPT-5.6 (`premium: { model: gpt-5.6-sol, model_reasoning_effort: high }`, `default: gpt-5.6-terra`, `cheap: gpt-5.6-luna`), con soporte para parsear e inyectar `model_reasoning_effort`.
- **Robustez y legibilidad en transform**: validaciones explícitas de argumentos en `transform()`, aplanado de anidamientos condicionales a un nivel máximo de 3 en `handleAgentToml`, y ampliada la suite de pruebas unitarias cubriendo todos los flujos de error de formato y validaciones en `target-transform.test.js`.

### Fixed
- **Seguridad en la ejecución y rutas de Codex**: resolución absoluta de binarios mediante variables `PATH` en Windows (previniendo binary planting en CWD) y validación defensiva contra TOCTOU e infiltración por symlinks en la instalación a nivel de archivo de agente individual.
- **Cierre 4R del puente de hooks Codex**: endurecidos los caminos de error para evitar validaciones fail-open: `validate-codex` convierte archivos/directorios ilegibles y hooks malformados en errores de validación, el checker I3 reporta perfiles Codex inválidos o no cargables, `codexHooks()` valida entradas antes de transformar comandos, y `withFileLock()` falla en cerrado ante fallos persistentes de lock en Windows. Cobertura añadida para `scripts/check.js`, `validate-codex`, `i3-budget-constant`, `target-transform` y `ospec-state`.

## [2.22.0] - 2026-07-08

### Added
- **Suite de evals golden del orquestador (cierre del ítem 2.1 del roadmap, Bloque 2)**: nueva capability `orchestrator-evals` bajo `scripts/evals/` con 7 escenarios golden (4 del núcleo del orquestador — petición vaga → intent restatement, high-risk → clarify, verify FAIL spec-gap → ruta a sdd-spec, apply design-mismatch → blocked — y 3 de `sdd-document` — gate batcheado de idioma+scope, update sin cambios → no-op, write fuera de sandbox → blocked). Harness *agent-assisted*: Node (`run.js`, `lib/{fixtures,capture,assertions}.js`) resuelve setup/aserción/reporte, mientras un turno de agente real ejecuta el orquestador (nunca mock ni replay de transcript), habilitando subir de versión el modelo en `models.yaml` con evidencia objetiva. Aserciones exclusivamente estructurales (ruta, `blocker_type`, artefactos, campos de `state.yaml`, forma de `question_gate`) — nunca sobre prosa, para tolerar variación entre modelos. `run.js` queda fuera del glob `--test` de CI por diseño (ADR-004); solo la librería pura de aserciones/fixtures se ejecuta en `npm test`.
- Nuevo dominio baseline `openspec/specs/orchestrator-evals/spec.md` (4 requirements).

### Fixed
- **Reutilización silenciosa de fixtures corruptas a medias**: `materializeFixture`/`applyGitBaseline` ahora escriben un marcador de materialización completa (`.eval-capture/materialized.json`) solo tras un éxito íntegro; `run.js` lo exige antes de reutilizar un workspace, evitando puntuar contra un fixture a medio copiar o con el baseline de git a medias tras un fallo de disco/permiso.
- **Path traversal potencial en el marcador `GIT-BASELINE.json`**: guard de contención (`resolveContainedPath`) antes de consumir rutas relativas declaradas en `gitHead_files`/`post_baseline_untracked`.
- **Proxy débil en el escenario `document-update-noop`**: nuevo matcher `expect.fileTreeUnchanged`/`baselineFileTree` en `assertions.js`, que detecta aparición silenciosa de archivos de salida nuevos (antes solo se verificaba `state.last_updated`).

## [2.21.0] - 2026-07-07

### Added
- **Lint de contratos unificado (cierre del Bloque 1 del roadmap)**: nuevo `scripts/lib/contract-lint.js` (registro puro de checkers, sin cortocircuito) con tres checkers — `i1-manifest` (nuevo: cruza el manifiesto `runtime_capabilities:` del frontmatter de los 14 SKILL.md de fase SDD contra las `tools:` reales del agente vinculado en `agents/{nombre}.agent.md`, emitiendo un offender explícito si el agente vinculado a un phase skill no existe en disco), `j1-commands-agents` (extracción de `scripts/commands-agents-contract.test.js` preservando sus guards rel-1/rel-2) e `i3-budget-constant` (extracción/generalización de la coherencia hooks.json↔constantes de lock JS+Go de `scripts/lib/ospec-state.test.js`). Sin vía de invocación nueva: el arnés `scripts/contract-lint.test.js` queda recogido por el glob existente de `scripts/check.js` (pre-commit + CI ya cableados).
- **Manifiesto `runtime_capabilities:` en los 14 SKILL.md de fase SDD**: retrofit obligatorio para ese tier (1:1 vinculado a su agente), calibrado contra las tools reales (`REQ-skills-001`); utility/stack/`_shared` quedan `OPTIONAL` en este change (fallback ausente=false).
- **Categoría de evidencia `static-lint`** en la taxonomía de `sdd-verify` (`REQ-skills-002`), distinta de `runtime-test`, para que un contract test estático no cuente como evidencia de comportamiento cuando el spec exige ejecución real.
- Nuevo dominio baseline `openspec/specs/contract-lint/spec.md` (7 requirements).

## [2.20.3] - 2026-07-07

### Fixed
- **Coerción boolean-like residual en `matchConditions` (I2)**: nueva función pura exportada `detectResidualBooleanStrings(conditions)` en `route-dispatcher.js` para detectar valores `"true"`/`"false"` string que no pasaron por la coerción del parser (p.ej. tablas de routing construidas programáticamente en vez de parseadas desde YAML), evitando que condiciones `bugfix`/`refactor`/`hotfix` caigan silenciosamente al route `standard`. Test de regresión end-to-end contra la tabla real de `openspec/config.yaml`.
- **Desalineación entre el presupuesto de timeout del hook `SessionStart` y el `staleMs` del lock (I3)**: `staleMs`/`staleLockAge` bajado de 10s a 5s en ambos runtimes (`ospec-state.js` y `internal/store/store.go`, con constantes nombradas), y `hooks/hooks.json` ahora declara `timeout: 5` explícito para `SessionStart` (antes era el único hook sin timeout declarado). Nuevo test de coherencia hooks.json↔constantes de lock en JS y Go.

### Changed
- Sincronizados `openspec/specs/routing/spec.md`, `openspec/specs/hooks/spec.md` y `openspec/specs/hooks-runtime/spec.md` con el comportamiento anterior.

## [2.20.2] - 2026-07-07

### Added
- **Soporte de diagramas Mermaid en scaffold de Starlight (Opción D)**: Añadidas las dependencias `astro-mermaid` (v^2.1.0) y `mermaid` (v^11.16.0) al [package.json](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/skills/sdd-document/assets/web-doc-template/package.json) del scaffold y registrado el plugin `mermaid()` en su [astro.config.mjs](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/skills/sdd-document/assets/web-doc-template/astro.config.mjs) (posicionado antes de `starlight()`). Esto habilita el renderizado nativo client-side de diagramas en bloques de código ` ```mermaid ` para cualquier nueva inicialización de documentación con la Opción D, sincronizado con la instancia local de `web-doc/`. Tests: paso verde de la suite de contratos estáticos de `starlight-web-doc` y compilación local exitosa con empaquetado de chunks específicos de diagramas (stateDiagram, erDiagram, etc.).

### Fixed
- **Error de parseo got 'PS' en diagrama Mermaid**: Corregido error de sintaxis en el diagrama de arquitectura de [overview.md](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/openwiki/architecture/overview.md) envolviendo las etiquetas con caracteres especiales (paréntesis, comas, barras) entre comillas dobles, de modo que el motor de Mermaid no confunda la sintaxis del parser.

## [2.20.1] - 2026-07-07

### Fixed
- **Enlaces wiki-internos rotos en el sitio Starlight (Opción D)**: `sync-openwiki.mjs` copiaba los enlaces `.md` tal cual, pero Starlight sirve las páginas como slugs sin extensión, así que cada enlace interno (`architecture/overview.md`) devolvía 404. Ahora `rewriteLinks` los reescribe a URLs de slug locales (`/architecture/overview/`), resolviendo los relativos contra el directorio de la página contenedora, preservando fragmentos `#ancla` y dejando intactos los enlaces externos y los assets no-`.md`. Además, un enlace "bare" anclado a la raíz del wiki (`hooks-runtime/lifecycle.md` escrito dentro de `security/guardrails.md`) ya no se anida bajo el directorio de la página: el set de páginas fuente reales desambigua — si el candidato relativo a la página no existe pero el anclado a raíz sí, gana la raíz; si ambos existen, se mantiene la semántica markdown estándar. Tests: +7 casos runtime en `sync-openwiki.test.js` (slug local, `../` relativo, ancla, prefijo `/openwiki/`, fallback a raíz, preferencia por hermano existente, externos/assets intactos).

### Changed
- **Instancia local `web-doc/`**: sincronizada con el script corregido y con un logo (`src/assets/ospec-logo.png`) enganchado como `logo` y `favicon` de Starlight a la izquierda del título del sitio. El wiki `openwiki/` se regeneró en español (modo init, Opción D).

## [2.20.0] - 2026-07-07

### Added
- **Identidad del sitio y navegación ordenada en el template Opción D** (REQ-sdd-document-019, REQ-016 ampliado): `astro.config.mjs` deriva el título del sitio del `name` del `package.json` del repo padre (Title-Case por segmento, con fallback al nombre del directorio) en vez del placeholder "Project Documentation"; `sync-openwiki.mjs` recorta el H1 inicial del cuerpo transformado (Starlight ya renderiza el `title` del frontmatter como H1, que se veía duplicado en cada página) y emite `src/sidebar.generated.json` — quickstart siempre primero como enlace superior y un grupo por subdirectorio del wiki, ordenados por primera mención en los enlaces del propio quickstart (alfabético para los no mencionados) — que `astro.config.mjs` consume con fallback al sidebar autogenerado si falta. Tests: +3 casos runtime en `sync-openwiki.test.js` y +3 anclas en `starlight-web-doc-contract.test.js`.

### Fixed
- **Falsos positivos del chequeo de atribución AI con palabras en español**: el patrón de `commit-msg-hook.js` y `pre-tool-use.js` matcheaba nombres de vendor como subcadena, con lo que «coherente», «coherencia», «bombardeo» o «llaman» bloqueaban commits legítimos. Los nombres de vendor quedan anclados a límites de palabra (`\b`), con tests de regresión en ambos sentidos y el patrón documentado en `rules/no-model-attribution.instructions.md` actualizado.

## [2.19.1] - 2026-07-07

### Fixed
- **Template Opción D (`web-doc/`): scaffold generado crasheaba en runtime** (change `fix-web-doc-scaffold-paths`, ruta lite con Strict TDD): `content.config.ts` vivía en la raíz del template pero Astro 5 solo lee la config de colecciones desde `src/content.config.ts`, con lo que la colección `docs` cargaba sin el schema de Starlight y toda petición reventaba con `Cannot read properties of undefined (reading 'hidden')` en `utils/navigation.ts` (incluida la ruta 404). Además el import `@astrojs/starlight/loader` (singular) no existe en el paquete publicado — solo exporta `./loaders`. Se mueve el archivo a `src/`, se corrige el import y se añade `redirects: { "/": "/quickstart" }` en `astro.config.mjs` para que la raíz del sitio no dé 404. Sincronizados `option-d-starlight.md` §3, el baseline REQ-sdd-document-014 (delta MODIFIED archivado en `openspec/changes/archive/2026-07-07-fix-web-doc-scaffold-paths/`) y el test de contrato `scripts/starlight-web-doc-contract.test.js` (11 anclas: ruta `src/`, import plural obligatorio/singular prohibido, redirect raíz), con ciclo RED→GREEN verificado en runtime.

## [2.19.0] - 2026-07-06

### Added
- **Opción D "OpenWiki + Starlight web" en `sdd-document`** (change `starlight-web-doc`, ciclo SDD completo con gate 4R remediado): nueva opción de scope en el gate batcheado de idioma+scope que genera `web-doc/` en la raíz del repo objetivo como proyecto Starlight cascarón — scaffold estático copiado verbatim desde `skills/sdd-document/assets/web-doc-template/` (package.json, astro.config.mjs, content.config.ts, tsconfig.json, CSS custom), nunca ejecuta `npm create astro` ni instala dependencias (REQ-sdd-document-014). `openwiki/` permanece como única fuente de verdad: el script `web-doc/scripts/sync-openwiki.mjs` (Node ESM zero-dependency, cableado en `predev`/`prebuild`) transforma el wiki a `src/content/docs/` con inyección de frontmatter `title` (REQ-016), reescritura de enlaces fuente a la URL del remote `origin` sobre la rama por defecto (REQ-017) y paridad estricta 1:1 con poda de huérfanos (REQ-018). Sync incremental por mtime/hash con cache local git-ignored (REQ-015). Sandbox de escritura dual modelado como SET `{openwiki/, web-doc/}` con inventario post-run J5 del orquestador extendido a multi-directorio (REQ-sdd-document-002/006/011, REQ-agents-006). Degradaciones seguras endurecidas por el gate 4R: guard anti-poda-destructiva cuando `openwiki/` falta o está vacío, passthrough de frontmatter YAML anidado sin pérdida, try/catch por página/cache/poda con warnings (nunca tumba el build del usuario final) y fallbacks logueados. Procedimiento del ejecutor en `skills/sdd-document/references/option-d-starlight.md`; 3 ADRs promovidos a `docs/adr/`. Tests: `scripts/sync-openwiki.test.js` (18 casos runtime sobre proyecto materializado en temp dir) y `scripts/starlight-web-doc-contract.test.js` (9 anclas estáticas de contrato).
- **Skill `stack-starlight`**: base de conocimiento del framework Starlight (Astro) — setup, configuración, sidebar, frontmatter, componentes, theming e i18n — con 4 documentos de referencia; fuente técnica de la plantilla de la Opción D.

## [2.18.0] - 2026-07-06

### Added
- **Harden de archivado y baseline fingerprints (Bloque 1.2 / I1)**: formalización del contrato en el que la finalización y borrado del directorio de origen en `sdd-archive` es propiedad exclusiva del orquestador (REQ-agents-008). El executor de `sdd-archive` se limita a sincronizar specs, escribir el reporte de archivo y copiar los artefactos, retornando un inventario de copias detallado en su envelope. El orquestador realiza una verificación/diff recursivo de inventario (presencia y contenido por hash/bytes) contra el disco físico antes de proceder con el borrado. Asimismo, el cálculo y registro del SHA-256 de las especificaciones baseline touched (`touched_baseline_domains`) pasa a ser responsabilidad standing inline del orquestador inmediatamente después del éxito de `sdd-spec` (REQ-agents-009), eliminando el patrón manual de assumptions por fingerprints no registrados. Nuevo test de contrato `scripts/archive-move-fingerprint-contract.test.js` y extensión de sentinels de límites en `scripts/configure/real-repo.test.js` (manteniendo el guard del orquestador < 500 líneas en 497 líneas). Ciclo SDD completo: deltas de `agents` (2 ADDED) y `skills` (1 MODIFIED + 1 ADDED) sincronizados al baseline y change archivado en `openspec/changes/archive/2026-07-05-harden-archive-move-fingerprints/`.

## [2.17.0] - 2026-07-05

### Added
- **Cableado del orquestador para `sdd-document` (J1+J4+J5)**: el orquestador ahora enruta `/sdd-document` de punta a punta. Wiring mínimo inline (allowlist de `agents:`, bullet en el índice de comandos y fila en la Circumstantial Handler Pointer Table — bajo el guard de 500 líneas) con el protocolo completo en `skills/_shared/route-document.md`: gate único batcheado de idioma+alcance (J4) con persistencia en approval ledger (`gate: document-init`) y `.last-update.json` (incluye `doc_language`/`scope_choice`), pre-pregunta keep/change en modo update con regla de precedencia entre candidatos, resolución autoritativa del output dir por el orquestador (A→`openwiki/`, B→`docs/wiki/`, C→custom con rechazo de paths fuera del repo antes de delegar), y verificación de sandbox post-run propiedad del orquestador (J5) scoped por `git status`, con gate de halt abort/acknowledge y política de fallo inconcluso cuando `git status` falla. Nuevo test de contrato `scripts/commands-agents-contract.test.js` que parsea la tabla §3.2 Command Roster del spec de `agents` (flechas `→` y `->`), falla ante filas del roster faltantes o comandos sin fila, y asserta explícitamente la presencia de `sdd-document.prompt.md`. Gate 4R con remediación completa (1 CRITICAL + 6 WARNING + 2 SUGGESTION) y re-verificación PASS. Ciclo SDD completo: deltas de `agents` (3 ADDED) y `sdd-document` (3 MODIFIED) sincronizadas al baseline y change archivado en `openspec/changes/archive/2026-07-05-wire-sdd-document/`.

## [2.16.0] - 2026-07-05

### Added
- **Agente documentador `sdd-document`**: nuevo executor (`agents/sdd-document.agent.md` + `skills/sdd-document/SKILL.md` + comando `/sdd-document`) que compila arquitectura, specs y estado del repo en un wiki Markdown local. Gate interactivo de alcance al lanzar: Opción A — wiki técnico completo estilo OpenWiki (`quickstart.md` + `openwiki/` con subdirectorios temáticos y source maps), Opción B — estado SDD y specs bajo `docs/wiki/`, Opción C — ruta custom validada. Reglas de sandbox de escritura (paths relativos al output dir, sin escapes; excepciones declaradas para `/AGENTS.md` y `/CLAUDE.md` como archivos de instrucción raíz), registro en `models.yaml` (tier default) y suite de contrato `scripts/sdd-document.test.js`. Ciclo SDD completo (dogfooding): baseline nuevo `openspec/specs/sdd-document/spec.md` (13 REQs), delta de `agents` sincronizada y change archivado en `openspec/changes/archive/2026-07-05-add-documenter-agent/`. Nota: el cableado del orquestador (roster/route) llega en el change siguiente (J1).

## [2.15.0] - 2026-07-04

### Added
- **Telemetría de costo por fase (C3)**: el hook `SubagentStop` (JS y Go, paridad byte a byte) persiste una fila JSONL por dispatch de fase en `.ospec/session/{change}/phase-costs.jsonl` vía `appendPhaseCost`/`AppendPhaseCost` — `phase`, `status`, `est_tokens` (heurística `round(utf8ByteLength/4)`, idéntica cross-runtime, etiquetada como estimada) y timestamp — con escritura atómica fail-safe (lock con reclamación de stale-lock, probado con 40 escritores concurrentes). Familia nueva de fixtures de paridad `subagent-stop-phase-cost-*` (floor de SubagentStop 2→4: escenarios active-change y no-active-change). `sdd-archive` agrega un bloque **Cost** al `archive-report.md` (fases despachadas, re-launches derivados de las filas del JSONL, preguntas al usuario desde `state.yaml`, tokens estimados totales) con fallback explícito cuando el JSONL falta o está vacío (ADR-001: fuente de agregación, promovida a `docs/adr/adr-20260704-001`). Contrato del bloque asegurado por `scripts/cost-block-contract.test.js`. Ciclo SDD completo (dogfooding): specs delta de `hooks`/`agents` sincronizadas al baseline y change archivado en `openspec/changes/archive/2026-07-04-add-change-cost-telemetry/`.

## [2.14.2] - 2026-07-04

### Fixed
- **Falsos positivos del agent-shield en el escaneo de credenciales**: el regex genérico de `password/key/token = "..."` usaba `\s*`, que cruza saltos de línea, y matcheaba keywords como substring de otras palabras — un doc con "Key rule:" seguido párrafos después de un string entre comillas disparaba la advertencia de seguridad. El patrón endurecido exige que keyword y valor convivan en la misma línea (`[ \t]*` + `[^"'\n]`) y que la keyword no sea sufijo de otra palabra (`(?:^|[^a-z])`, compatible con RE2; se preservan prefijos legítimos como `db_password` y `api_key`).

### Changed
- **Escaneo de secretos desacoplado y espejado Go/JS**: la clasificación de archivos sensibles (deny/ask por nombre) y el escaneo de contenido salen de los handlers monolíticos hacia módulos dedicados — `scripts/hooks/lib/secret-scan.js` y `internal/hooks/secretscan.go` — con contrato de paridad documentado en `docs/harness-go-js-parity.md`, ids estables por patrón, límite de 1MB compartido y comportamiento fail-open ante errores de lectura. En Go los regexes ahora se precompilan a nivel de paquete (antes se recompilaban en cada invocación del hook) y el deny de `.git/config` se alinea al canon JS (cualquier path `.git/config`, sin scoping por workspace root). Suites table-driven espejadas: `secret-scan.test.js` (34 casos) y `secretscan_test.go`, incluyendo regresión de los falsos positivos multilínea y por substring.

## [2.14.1] - 2026-07-04

### Changed
- **Orquestador adelgazado a <500 líneas (C2)**: `sdd-orchestrator.agent.md` baja de 694 a 490 líneas. Extraídos vía pointer table on-demand: los shapes JSON de delivery-strategy, review-workload y blocked-envelope (`skills/_shared/question-shapes.md`), el manejo del gate de clarify — las condiciones RUNS/SKIP quedan inline (`skills/_shared/clarify-routing.md`) — y el handler de gaps resolution (`skills/_shared/gaps-resolution.md`). Secciones que duplicaban convenciones existentes ahora referencian `approval-ledger.md` y `skill-resolver.md` (Resolution Order y Stack-Skill Candidate Resolution) en vez de repetirlas. La Circumstantial Handler Pointer Table se movió al final del prompt (orden cache-aware: núcleo estable primero, material que crece entre versiones al final). El guard de `real-repo.test.js` ratchetea de 700 → 500 líneas y suma 5 sentinels de no-reinlining para los bloques extraídos.

## [2.14.0] - 2026-07-04

### Added
- **Contrato estricto de result-envelope (C5)**: las fases SDD emiten su envelope de retorno como bloque fenced `json:result-envelope` con JSON estricto directamente parseable (aditivo a la prosa existente, nunca la reemplaza); el hook `SubagentStop` lo parsea, lo valida con un validador dep-free compartido y persiste `summary`/`key_decisions` en `state.yaml` con merge fill-gap y escritura atómica; el orquestador consume los campos estructurados como fuente autoritativa (agents §6.1a). Paridad Go/JS byte a byte generalizada a `SubagentStop` con familia de fixtures propia (patrón E1) y truncado code-point-first antes del escape para seguridad YAML. Ciclo SDD completo (dogfooding): specs delta de `agents`/`hooks`/`skills` sincronizadas al baseline, 3 ADRs promovidas a `docs/adr/` (adr-20260704-001..003) y change archivado en `openspec/changes/archive/2026-07-04-strict-result-envelope/`.
- **Remediación del gate 4R sobre C5**: 8 tareas TDD RED-first cerrando 1 BLOCKER + 2 CRITICAL + 5 WARNINGs de paridad detectados por la revisión 4R post-verify; re-verificación PASS con `npm test` 914/914 y `go test` 8 paquetes en verde.

## [2.13.0] - 2026-07-03

### Added
- **Suite de contrato Go/JS ejecutable (E1)**: las golden fixtures de `internal/testdata/parity/` ahora se verifican en AMBOS runtimes — Go vía `TestPreToolUse_ParityFixtures` (byte a byte) y JS vía el nuevo `scripts/hooks/parity-contract.test.js`, que ejecuta el proceso real del hook contra cada fixture (con prefix-match documentado solo para el sufijo impl-specific del error de parseo JSON). Fixture nueva `pre-tool-use-bypass.json` cubre la degradación por `permission_mode`. Regla operativa en `docs/harness-go-js-parity.md`: ante un mismatch se corrige la implementación rezagada, nunca la fixture sola.
- **Matriz de capacidades y paridad por target (D1/D2)** — `docs/target-capabilities.md`: qué capacidad existe en cada host (preguntas estructuradas, sub-agentes paralelos, background tasks, lifecycle hooks, fallback de modelos), la degradación definida cuando falta (gates → pregunta de chat estructurada; 4R → secuencial), y la tabla de paridad de protecciones que deja explícito que los git hooks locales son la única capa universal — un usuario de vscode/copilot ya no puede asumir protecciones que su host no ejecuta.
- **Onboarding por rol (F2)** — `docs/onboarding/`: tres guías de 10 minutos — tech lead ("qué me garantiza esto", con tabla de garantías auditables), developer ("qué comandos me importan") y reviewer ("cómo leo un change", con orden de lectura y señales de alerta).
- **Punto de entrada en inglés (F1)** — `docs/en/README.md`: overview, garantías, instalación y comandos para evaluación por equipos mixtos; los docs canónicos siguen en español.
- **Test de contrato `scripts/eje-def-contract.test.js`** (7 landmarks de D/E/F).
- **Resúmenes de fase en `state.yaml` (C1)**: al completar cada fase, el agente extiende su entrada en `phases:` con `summary` (≤160 chars, factual, derivado del artefacto) y `key_decisions` (≤3). En continuaciones (`/sdd-continue`, post-compact, nueva sesión) el orquestador arma los prompts desde estos resúmenes en vez de releer artefactos completos — los sub-agentes siguen leyendo los artefactos que su fase exige como dependencia dura, y los changes pre-feature (sin bloque) caen al comportamiento anterior. Ahorro estimado: 60-80% del costo de contexto en resume.
- **Enforcement del presupuesto de compact rules (C4/E3)**: nuevo lint en `scripts/docs-lint.test.js` (corre en pre-commit) que mide los tokens estimados de las `compact_rules` de cada skill descubierta y falla sobre el cap duro de 500 — un skill nuevo con compact rules gordas ya no puede degradar silenciosamente todos los dispatches. `token-budget.md` documenta el cap y la regla de ratchet (solo baja, nunca sube). Estado actual: peor ofensor `tdd-workflow` ≈ 471 tokens.
- **Test de contrato `scripts/eje-c-contract.test.js`**: landmarks de C1/C4 + regeneración de targets en directorio temporal.

## [2.12.0] - 2026-07-03

### Added
- **Gate de colisión entre changes + ownership (B2)**: nuevo handler circunstancial `skills/_shared/gate-change-collision.md` (cableado en el pointer table del orquestador) que, antes de `sdd-apply` y cuando existe otro change activo, compara file scopes y dominios delta; en solape pregunta continuar / coordinar / re-scopear y persiste la decisión (`approvals` + bloque `collisions:`). Bloque opcional `ownership:` en config (dominios → team + globs, `codeowners_sync` advisory). El orquestador estampa `owner:` (autor + rama) en `state.yaml` al crear cada change. Guard de baseline: `sdd-spec` registra `baseline_fingerprints:` (SHA-256 por dominio) y `sdd-archive` bloquea con `blocker_type: stale-baseline` si el baseline se movió desde que se escribió el delta — nunca merge ciego.
- **Trazabilidad REQ → task → commit → test (B3)**: IDs estables `{#REQ-domain-NNN}` en los headings de requirements (`sdd-spec`); las tasks listan los REQs que cubren con tags `[REQ-...]` y todo MUST aparece en al menos una task (`sdd-tasks`); `sdd-apply` añade trailers `Ospec-Change:` / `Ospec-Task:` a los work-unit commits; el hook `commit-msg` los valida de forma advisory con un change activo (o bloquea con `traceability: { trailers: required }` en config); `sdd-verify` emite la **Traceability Matrix** (REQ → tasks → commits → tests) marcando WARNING los REQs sin test vinculado y `tasks-gap` los REQs fuera de toda task.
- **Presets por escala (B5)**: `sdd-init` pregunta la escala una sola vez (vía orquestador) — `solo` (lite-first, sin 4R), `team` (default: defaults actuales + colisión + trailers advisory), `enterprise` (strict TDD + trazabilidad required + mentorship balanced + 4R) — y escribe `scale:` + su preset en `config.yaml`; en re-init preserva el valor existente. Todo sigue siendo editable en config (el preset solo materializa bloques en init).
- **Tests**: `scripts/eje-b-contract.test.js` (14 landmarks + regeneración de targets en temp dir) y 6 tests nuevos del trailer check en `scripts/hooks/commit-msg-hook.test.js`.
- **Mentorship mode (A4)**: bloque opcional `mentorship:` en `openspec/config.yaml` (`mode: mentor | balanced | expert`, default `balanced`; `focus:` opcional). El orquestador lo resuelve una vez por sesión y lo inyecta como una línea por dispatch (`Mentorship mode: {mode}`); la semántica por modo vive en `sdd-phase-common.md` §F — `mentor` añade la sección "Por qué así" (alternativas descartadas + racional) y hasta 1 concepto aprendible; `balanced` da racional solo en decisiones arquitectónicas y gates; `expert` mantiene los resúmenes mínimos actuales. Afecta SOLO prosa hacia el usuario, nunca artefactos OpenSpec (misma frontera que Reply Language Forwarding). Ausencia del bloque = no-op estricto.
- **ADRs cableados al flujo (A5)**: `sdd-design` extrae las decisiones significativas (contrato público, modelo de datos, dependencia nueva o patrón transversal) a `openspec/changes/{name}/decisions/adr-NNN.md` en formato corto (Context / Decision / Alternatives / Consequences); `sdd-archive` promueve los ADRs aceptados a `docs/adr/adr-{YYYYMMDD}-{NNN}-{slug}.md` como memoria viva del proyecto antes del move, conservando las copias change-local en el archivo como rastro de auditoría.
- **Test de contrato `scripts/mentor-adr-contract.test.js`**: landmarks de prosa en orquestador, phase-common, config, design y archive, más regeneración de targets en directorio temporal.

### Fixed
- **Los advisories del hook PreToolUse ahora respetan `bypassPermissions`**: un `ask` devuelto por un hook tiene prioridad sobre el modo de permisos del host, así que AgentShield (contenido con pinta de credencial), el Token Budget Advisor (lecturas >50k y acumulado >150k), el Git Collaboration Guard (commit con árbol sucio o en rama default), el Spec Drift Advisory y las reglas ASK interrumpían al usuario incluso con permisos bypasseados — la razón por la que existían los kill-switches `DISABLE_*`. Ahora el hook lee `permission_mode` del input y, en `bypassPermissions`, degrada todo `ask` advisory a `allow` + `systemMessage` no bloqueante (prefijo `[ospec advisory]`); las reglas `deny` (rm -rf /, force push, atribución AI, claves SSH/.npmrc) nunca se degradan. Paridad Go/Node con tests espejo en ambos runtimes (`scripts/hooks/pre-tool-use.js`, `internal/hooks/pretooluse.go`). Spec: `openspec/specs/hooks/spec.md` §3.4.1.
- **`sdd-archive` Step 5 endurecido — move no es copy**: se explicita que tras el move la carpeta original del change NO debe existir (con procedimiento copy-verify-delete para toolsets sin move), tras detectarse un archive real que dejó ambas carpetas y corrompía el descubrimiento de changes activos.

## [2.11.0] - 2026-07-03

### Added
- **Contrato de recomendación (`openspec/specs/recommendation-contract/spec.md`)**: toda opción `recommended: true` en un `question_gate` DEBE incluir en su `description` el racional (1 línea), el trade-off principal frente a las alternativas y la reversibilidad de la decisión; el `reason` del gate DEBE declarar el costo de equivocarse. Un senior no dice "elegí A": dice por qué, qué se paga por B y si la decisión es reversible. Los ejemplos embebidos en el orquestador y las fases fueron actualizados al nuevo shape.
- **Detección de ambigüedad fuera de clarify (`openspec/specs/ambiguity-detection-boundaries/spec.md`)**: dos límites nuevos que adelantan y atrasan la detección respecto del gate de clarify. *Antes* — intent restatement en Change Classification: cuando la petición del usuario es vaga, el orquestador la reformula en 2-4 líneas y la valida vía `askQuestions` antes de clasificar, eliminando la clase de error más cara (construir lo que no se pidió). *Después* — `sdd-apply` devuelve `blocker_type: design-mismatch` cuando el código real contradice el design (API distinta, dependencia inexistente, patrón incompatible), ruteando de vuelta a `sdd-design` en vez de improvisar workarounds.
- **Formalización del enum `blocker_type`** en el Result Envelope y specs de `agents` (§6.7–§6.10): compliance del contrato de recomendación, intent restatement, design-mismatch.
- **Test de contrato `scripts/recommendation-ambiguity-contract.test.js`**: verifica que orquestador, fases y targets generados documentan el nuevo contrato (48/48 junto a los contratos existentes).

Cambio guiado por SDD (ruta `standard`) con TDD estricto y gate 4R. Verificación: PASS WITH WARNINGS con los 5 hallazgos WARNING del gate 4R corregidos y re-verificados. Rastro de auditoría en `openspec/changes/archive/2026-07-03-recommendation-contract-and-early-ambiguity-detection/`.

## [2.10.0] - 2026-07-02

### Added
- **Assumption Ledger (`openspec/specs/assumption-ledger/spec.md`)**: nueva capacidad que convierte las micro-decisiones silenciosas de los agentes de fase en un rastro auditable. Define el esquema `assumptions[]` (`id`, `phase`, `statement`, `reversibility`, `basis`), la regla de materialidad (solo impacto en comportamiento observable o contrato público bloquea con `question_gate`; una decisión interna nunca bloquea) y la persistencia en `state.yaml` bajo un nuevo bloque `assumptions:` que espeja el patrón existente de `approvals:`.
- **Campo `assumptions` opcional en el Result Envelope** (`skills/_shared/sdd-phase-common.md` §D): los agentes de fase pueden devolver entradas de assumption sin que esto afecte a los agentes que no lo usan (campo aditivo, retrocompatible).
- **Assumption Ledger Protocol en el orquestador** (`agents/sdd-orchestrator.agent.md`): el orquestador persiste cada `assumptions[]` recibido con semántica append/read-merge-update, y es la única autoridad que garantiza unicidad de `id` entre batches (renumera el `seq` local del phase agent al persistir si colisiona).
- **Assumption Reconciliation Pre-flight en `sdd-verify`** (`skills/sdd-verify/SKILL.md` Step 2a, `skills/sdd-verify/references/report-format.md`): re-presenta cada entrada `unresolved` agrupada por `reversibility`, ofreciendo `confirm`, `correct` o `promote-to-clarification` (esta última solo señaliza `status: promoted`, sin auto-disparar `sdd-clarify`). Las entradas `reversibility: low` que quedan sin resolver escalan a `WARNING` en `verify-report.md`; las `reversibility: high` no escalan.

### Fixed
- **Condición de carrera en `docs-lint.test.js`**: el escaneo recursivo en vivo del árbol del repo podía lanzar `ENOENT` cuando otra suite (`validate-phase.test.js`) creaba/borraba en paralelo un directorio real bajo `openspec/changes/`. Detectado en CI (`ubuntu-latest`) por la concurrencia real de `node --test`. Ahora `ENOENT` durante el listado o la lectura se trata como "ya no está" en vez de propagar el error.

Cambio guiado por SDD (ruta `standard`) con TDD estricto y gate 4R. Verificación: **PASS** (0 CRITICAL, 0 WARNING tras remediación de 2 hallazgos del gate 4R). Rastro de auditoría en `openspec/changes/archive/2026-07-02-add-assumption-ledger/`.

## [2.9.1] - 2026-07-02

### Changed
- **`git-collaboration-guard` ahora dispara solo en `git commit`**: antes, cualquier `Edit`/`Write` en la rama por defecto o con árbol sucio devolvía `ask`, generando fricción constante durante la edición normal. Ahora `isRiskyAction` (Node: `scripts/hooks/lib/git-state.js`; Go: `internal/hooks/pretooluse.go`) solo evalúa comandos que matchean `\bgit\s+commit\b` — el guard se comporta como un pre-commit check en vez de interrumpir cada edición. Paridad Go/Node preservada y verificada por tests dedicados.
- **Umbrales del Token Budget Advisor elevados**: límite por archivo individual `20,000 → 50,000` tokens y límite acumulado de sesión `90,000 → 150,000` tokens, en ambas implementaciones (`scripts/hooks/pre-tool-use.js`, `internal/hooks/pretooluse.go`), reduciendo falsos positivos en lecturas normales de archivos grandes.

Specs actualizados: `openspec/specs/git-collaboration-guard/spec.md`, `openspec/specs/token-budget-advisor/spec.md`, `openspec/specs/hooks/spec.md`. Verificación: `npm test` 774/774, `go test ./...` sin fallos.

## [2.9.0] - 2026-07-02

### Added
- **`spec-reconciliation` (drift detection + reconcile opt-in)**: nueva capacidad de conciencia continua sobre el desvío entre `openspec/specs/**` y el código. `detectSpecDrift` en `scripts/lib/ospec-state.js` compara el hash de manifest por dominio baseline contra HEAD, filtrando por los `sources:` globs del Domain Map — sin nuevo campo de manifest.
- **Resumen de drift en `SessionStart`**: nuevo campo aditivo `result.specDrift` (dominios desviados agregados), espejando los bloques existentes de seguridad/colaboración git. Se omite (no se fija a `undefined`) cuando no hay desvío.
- **Aviso de drift pre-commit** en `PreToolUse` (Step 5c): en `git commit`, `ask` (nunca `deny`) cuando los ficheros staged solapan con un dominio desviado. La regla DENY existente mantiene precedencia.
- **`/sdd-reconcile`** (comando + `skills/sdd-reconcile/SKILL.md` + `agents/sdd-reconcile.agent.md`): flujo opt-in que siembra deltas de spec retroactivos acotados a la ventana de diff desde el último hash de baseline registrado del dominio.
- **Gate de conciencia ambiental SDD** en `agents/sdd-orchestrator.agent.md`: regla always-on que dispara `AskUserQuestion` cuando una tarea no trivial solapa el alcance de un cambio activo o un dominio especificado — sin depender de que el usuario mencione "SDD".
- **Kill switch `DISABLE_SPEC_DRIFT_GUARD`**: neutraliza ambas rutas de hook nuevas sin efectos residuales.

### Changed
- **Contratos `hooks` y `agents`**: extendidos con los bloques aditivos de drift (`session-start`, `pre-tool-use`) y el gate de conciencia del orquestador, documentados en `openspec/specs/hooks/spec.md` y `openspec/specs/agents/spec.md`.

Cambio guiado por SDD con TDD estricto. Verificación: **PASS WITH WARNINGS** (776/776 tests, sin CRITICAL). Rastro de auditoría en `openspec/changes/archive/2026-07-02-sdd-context-awareness-reconciliation/`.

## [2.8.1] - 2026-06-29

### Fixed
- **Legibilidad del fallo del hook `pre-commit`**: el motivo del rechazo ya no queda enterrado bajo miles de líneas de salida de éxito. `scripts/hooks/pre-commit-hook.js` ahora invoca `scripts/check.js` con `stdio: "pipe"` (en vez de `"inherit"`): en éxito suprime la salida TAP y muestra solo una línea breve de progreso; en fallo vuelca la salida capturada y la cierra con un **banner `===`** que identifica el origen del fallo y los bypass disponibles, dejando el motivo como lo último y más visible. Los bypass existentes (`DISABLE_OSPEC_PRECOMMIT`, `DISABLE_OSPEC_ATTRIBUTION_CHECK`, `git --no-verify`) se preservan. Cambio guiado por SDD (ruta lite) con TDD estricto.

## [2.8.0] - 2026-06-29

### Added
- **`git-collaboration-guard` (advisory-first)**: nueva guarda en los hooks `PreToolUse` y `SessionStart` que prepara el harness para colaboración git multi-desarrollador. Detecta cuándo la sesión opera sobre la **rama por defecto** (resuelta vía `origin/HEAD`) y/o sobre un **árbol de trabajo sucio** (`git status --porcelain`), y al editar código o ejecutar `git commit` devuelve `ask` (nunca `deny` por defecto) con un aviso en español. `SessionStart` añade el aviso al iniciar en la rama por defecto.
- **Detección de árbol sucio**: tercer probe `git status --porcelain`; los ficheros sin trackear cuentan como sucio. El campo `dirtyTree` se **omite** (no se fija a `false`) cuando el probe falla, distinguiendo "limpio" (`false`) de "no se pudo determinar" (`null`).
- **Bypass por variable de entorno** `DISABLE_GIT_COLLABORATION_GUARD=true`: salta todas las llamadas a git y suprime los avisos.
- **Sanitización de nombre de rama anti prompt-injection**: `sanitizeBranchName` (paridad Go/Node) elimina caracteres de control, colapsa espacios y trunca a 120 caracteres antes de interpolar el nombre en el aviso visible por el modelo.
- **Recomendación "rama antes de código"**: el orquestador y las fases `sdd-propose`/`sdd-apply` recomiendan crear una rama antes de modificar código (advisory no bloqueante); la skill `branch-pr` documenta estrategias de colaboración multi-dev.

### Changed
- **Contratos de hooks `PreToolUse` y `SessionStart`**: se extienden para invocar la guarda de colaboración con *fail-open* por chequeo (si git no resuelve, cada campo falla abierto de forma independiente) y un **deadline compartido de 5 s** repartido entre los tres probes, con paridad estricta entre la implementación Go (`internal/hooks`) y el fallback Node (`scripts/hooks/*.js`). La regla DENY existente mantiene precedencia sobre la guarda (`ask`).
- **Propagación a los 4 targets**: las recomendaciones de prompts se regeneran en `claude`, `vscode`, `github-copilot` y `opencode` por el pipeline de build.

## [2.7.0] - 2026-06-27

### Added
- **Validación de fases con rutas declarativas**: nueva librería `flow-validator.js` y script `validate-phase.js` que validan transiciones de fase contra las rutas declaradas en `openspec/config.yaml`, bloqueando transiciones inválidas antes de ejecutarlas.
- **Ruta `bugfix`**: renombra la ruta `debug` a `bugfix` en la tabla de routing del orquestador, alineando la nomenclatura con Conventional Commits y añadiendo validaciones de transición al orquestador.
- **Propagación de campos `provides[]` en markers de federación**: `mergeMarkersIntoAtlas` copia campos no reservados (como `surface`) desde los `provides[]` entries del marker al contrato derivado del atlas, habilitando metadatos de contratos inter-miembro.
- **`SKILL_ENTRY_SCRIPTS` como roots del BFS de empaquetado**: los cuatro scripts de runtime de federación (`federation-marker.js`, `federation-explore.js`, `workspace-general-baseline.js`, `federation-baseline-orchestrator.js`) se añaden como roots explícitos del BFS en `gatherRuntimeScripts`, garantizando que el runtime de federación se empaquete en todos los targets.

### Changed
- **Eliminación de duplicación de prompts en agentes de fase**: refactorización de los agentes de fase para eliminar secciones de prompt duplicadas, consolidando la lógica en `sdd-phase-common.md`.
- **Extracción de referencias de habilidades grandes**: corrección de enlaces rotos en skills y extracción de contenido extenso a subdirectorios `references/` para cumplir el límite de 500 líneas de SKILL.md.
- **Relajación de deadlock en Strict TDD**: refinamiento de las reglas de mocks e higiene en el modo Strict TDD para evitar bloqueos cuando los tests requieren fixtures o mocks de infraestructura.
- **Documentación de convenciones**: limpieza de configuraciones muertas en `openspec/config.yaml` y documentación formal de convenciones del proyecto.

### Fixed
- **Bypass de capitalización en `install-target.js` en Windows**: canonicalización de rutas con `path.resolve` para evitar que diferencias de capitalización de letra de unidad (`C:` vs `c:`) eludan las guardas de seguridad de destino.
- **Paridad Go/JS en `session-start`**: corrección del bypass de `.gitignore` y alineación del comportamiento entre el binario Go y el fallback JS en el hook `session-start`.
- **Campo `capabilities` en `SkillEntry`**: añadido el campo faltante `capabilities` a la estructura `SkillEntry` para paridad entre las implementaciones Go y Node.
- **Propagación de errores de `fs.stat` en `cli.js`**: añadido `try-catch` para propagar correctamente errores de `fs.stat` en el pipeline de configuración.
- **Contradicción de permisos en `sdd-workspace`**: eliminada la contradicción entre la documentación y el comportamiento real respecto a permisos de escritura en repositorios miembro.
- **Approver neutral en `federation-baseline`**: neutralización del valor del approver a un valor target-agnóstico para evitar dependencias de plataforma en los gates de federación.

## [2.6.0] - 2026-06-22

### Added
- **Orchestrator Body Partitioning — CORE vs. circunstanciales**: Extracción de 5 bloques circunstanciales a archivos markdown puros de prosa bajo `skills/_shared/` (`route-brownfield.md`, `gate-4r-review.md`, `route-federation.md`, `dispatch-lifecycle-hooks.md`, `gate-archive-quality.md`) para optimizar el presupuesto de tokens.
- **Tabla de punteros en CORE**: Introducción de la sección `### Circumstantial Handler Pointer Table` en el orquestador (`agents/sdd-orchestrator.agent.md`) como punto único de resolución e importación bajo demanda para los handlers.
- **Test Estructural**: Incorporación del test estructural de integración `"real repo: orchestrator pointer-table refs resolve and handler sentinels absent from body"` en `scripts/configure/real-repo.test.js` para asegurar que el cuerpo del orquestador no exceda las 700 líneas y no contenga sentinelas inline de los handlers circunstanciales.

### Changed
- **Reducción de tamaño del CORE**: Reducción del cuerpo del orquestador en un **38% (de 986 a 607 líneas)**, cumpliendo con la meta de diseño.
- **Regeneración de Targets**: Actualización automática de los 4 targets generados (`claude`, `vscode`, `github-copilot`, `opencode`) propagando la tabla de punteros y los archivos `_shared/`.
- **Integración de Tests de Federation**: Adaptación de los tests de contrato de federación preexistentes para tolerar la distribución física de lógica en los archivos compartidos.

## [2.5.0] - 2026-06-21

### Added
- **Quality Gates declarativos** (`declarative-quality-gates`): nuevo bloque opcional `quality_gates:` en `openspec/config.yaml` evaluado por `sdd-verify` tras los pasos de test/build. Cuatro slots tipados (`tests`, `lint`, `architecture`, `security`) con campos `required`, `on_fail` (`advisory` por defecto | `halt`), `command` y `timeout_ms`. La ausencia del bloque es un no-op estricto: el comportamiento de verify es idéntico al baseline previo.
- **Núcleo de decisión puro `scripts/lib/quality-gates.js`** (sin I/O, espejo de `lifecycle-hooks.js`): `parseQualityGates`, `validateQualityGates`, `parseCoverage`, `classifyCoverage`, `classifyGate`, `enforceGate`, `aggregateStatus` y `buildAuditBlock`. Cubierto por 69 pruebas unitarias bajo TDD estricto.
- **Auditoría por gate en dos destinos**: tabla `## Quality Gates` en `verify-report.md` y bloque `gates.quality-gates` en `state.yaml` (hermano de `clarify` y `4r-review-gate`), escrito solo cuando hay política declarada.
- **Override de archivado con auditoría obligatoria**: el usuario puede forzar el archivado pasando un gate `halt` fallido mediante una justificación escrita, registrada en `state.yaml` (`gates.quality-gates.override`) y en `verify-report.md` con timestamp.
- **Migración de cobertura**: `quality_gates.tests.coverage.minimum` supersede a `rules.verify.coverage_threshold` cuando el bloque está declarado; al estar ausente, el campo legacy permanece activo (aditivo, retrocompatible).

### Changed
- **`sdd-verify` (SKILL + agente)**: nuevo paso 9a de evaluación de gates con ejecución acotada por `timeout_ms`, superficie de errores de validación, y escritura de auditoría *fail-closed* con read-back (envelope `blocked` ante fallo de persistencia).
- **`sdd-orchestrator`**: nuevo Archive Dispatch Guard *policy-aware* que lee config + `state.yaml` + envelope de verify, y confirmación de override en dos lugares antes de despachar `sdd-archive`.
- **`openspec-convention.md`**: documentación del bloque `gates.quality-gates`, el estado `error`, la asimetría de nombres `quality_gates`/`quality-gates` y el orden de las reglas de agregación.

### Security
- **Frontera de confianza de comandos de gate** (mirroring `run-command` de lifecycle hooks): los strings `command`/`coverage.command` se ejecutan con privilegio completo vía `sdd-verify` y fluyen por la evaluación `PreToolUse` DENY/ASK. Documentado que deben tratarse como configuración versionada y de confianza, sin secretos inline (usar variables de entorno o referencias a secret-manager).

### Fixed
- **Remediación 4R-CRITICAL** (cierre de bypass silencioso de archivado): una escritura de auditoría fallida en `state.yaml` con `sdd-verify` devolviendo `status: success` permitía al orquestador leer el gate como "ausente" y despachar el archivado saltándose un gate `halt` requerido. Cerrado por dos capas independientes — escritura *fail-closed* con read-back (H1) y guard *policy-aware* en el orquestador (H2) —; el override de medio escribir se cierra exigiendo confirmación en ambos destinos (H3). Estado `error` distinto para fallos de herramienta/timeout (H4/H5) y validación de rango de cobertura sin clamp (H6).

## [2.4.9] - 2026-06-21

### Added
- **Memoria Operativa del Proyecto** (`project-operative-memory`): se agrega soporte para la memoria operativa del proyecto en la carpeta `openspec/memory/` con contratos específicos de lectura y escritura por fase.
- **Stub de convenciones**: se crea `openspec/memory/conventions.md` con un preámbulo claro y un aviso de curación manual para los agentes.
- **Suite de pruebas estáticas**: se añade `scripts/operative-memory-contract.test.js` con 16 pruebas unitarias bajo TDD estricto que garantizan la integridad de las cláusulas y tablas de la memoria.

### Changed
- **`sdd-phase-common.md`**: se actualiza con un patrón de inicialización de 3 pasos (cargar skill, cargar protocolo compartido, leer ficheros de memoria operativa designados), la tabla de lectura por fase y la tabla de propiedad.
- **`sdd-archive`**: se añade el paso 4 para persistir decisiones resueltas (con estado `resolved`) desde `state.yaml` a `openspec/memory/decisions.md` (anteponiendo de forma reverse-chronological e implementando salvaguardas de sanitización/idempotencia).
- **`sdd-verify`**: se añade el paso 10b para persistir hallazgos mapeados como WARNING o BLOCKER en `openspec/memory/known-issues.md` (con sanitización/idempotencia).

## [2.4.8] - 2026-06-20

### Added
- **Sistema de capacidades tecnológicas** (`capability-stack-skills`): el harness ahora activa skills de stack de forma declarativa según el bloque `capabilities:` de `openspec/config.yaml`. El hook `session-start` lee las capacidades activas y las expone en su resultado; el registro de skills incluye el campo `capabilities` en cada entrada.
- **Nuevo módulo puro `capability-registry.js`**: parsea el bloque YAML de capacidades sin ningún efecto secundario (sin I/O, sin dependencias externas). Expone `parseCapabilities`, `capabilityNames` y `matchStackSkills` con validación exhaustiva de entradas y contrato de pureza formal documentado.
- **30+ nuevas skills tecnológicas** estandarizadas bajo la convención `stack-*` con frontmatter completo (`capabilities`, `license: Apache-2.0`, `metadata.author`, `metadata.version`):
  - Frontend: `stack-angular` (con 35 referencias completas de la API Angular 20), `stack-react`, `stack-react-testing`, `stack-react-performance`, `stack-vite`
  - Backend JVM: `stack-springboot`, `stack-springboot-security`, `stack-springboot-tdd`, `stack-springboot-verification`, `stack-kotlin`, `stack-kotlin-coroutines-flows`, `stack-kotlin-exposed-patterns`, `stack-kotlin-ktor-patterns`, `stack-kotlin-testing`, `stack-java`
  - Backend otros: `stack-go`, `stack-go-testing` (renombrado de `go-testing`), `stack-python`, `stack-python-testing`, `stack-dotnet`
  - Infraestructura/Datos: `stack-postgres`, `stack-sqlserver`, `stack-kafka`
  - Transversales: `accessibility`, `api-design`, `hexagonal-architecture`, `tdd-workflow`, `backend-patterns`, `frontend-patterns`, `design-system`, `ai-first-engineering`, `ai-regression-testing`, `architecture-decision-records`, `agent-harness-construction`, `agent-self-evaluation`

### Changed
- **`skill-registry.js`**: añade extracción del campo `capabilities` en cada entrada del registro mediante `extractCapabilities`; exporta `collectFiles` y `extractCapabilities` para facilitar las pruebas unitarias.
- **`session-start.js`**: integra `resolveWorkspaceCwd` de `pathsafe.js` para proteger contra path traversal en la resolución del workspace; aplana la lógica de seguridad del Agent Shield extrayendo `checkUnignoredEnvFiles` y `checkEmbeddedCredentials` como helpers independientes.

### Fixed
- **I/O resiliente en `skill-registry.js`**: lecturas asíncronas de archivos en `discoverSkills` y `calculateFingerprint` envueltas en `try/catch`; errores `ENOENT` se absorben con un warning en lugar de crashear (concurrencia segura ante archivos eliminados durante el escaneo).
- **Enmascaramiento de errores en `writeRegistryCache`**: introducido flag `writeFailed` para garantizar que las excepciones del bloque de limpieza `finally` no oculten el error original de escritura o renombrado.
- **Tolerancia a fallos de configuración en `artifact-store.js`**: la lectura inicial en `createArtifactStoreFromConfig` ahora captura errores de sistema de archivos (ej. `EISDIR`, `EACCES`) y degrada graciosamente al modo por defecto en lugar de propagar la excepción.
- **Control de excepciones de I/O en `session-start.js`**: las lecturas de `.gitignore` y `.git/config` absorben únicamente `ENOENT`; otros códigos de error (ej. `EACCES`) se loguean como warnings en lugar de ignorarse en silencio.

## [2.4.7] - 2026-06-20

### Security
- Integración de **AgentShield Security** en los hooks `SessionStart` y `PreToolUse`. Valida de forma proactiva archivos `.env*` y `.npmrc` sin ignorar en `.gitignore`, así como credenciales expuestas en `.git/config` (SessionStart). Bloquea accesos no permitidos a claves SSH, `.npmrc` y `.git/config` local, y consulta interactivamente sobre secretos o API keys en ficheros < 1MB (PreToolUse). Bypass vía `DISABLE_AGENT_SHIELD=true`.

### Added
- Integración de **Token Budget Advisor** en los hooks `PreToolUse` para controlar el volumen de tokens de la sesión (límite por fichero de 20k, límite acumulado de sesión de 90k en `.ospec/session/<changeName>/token-events.jsonl`). Bypass vía `DISABLE_TOKEN_ADVISOR=true`.
- Hook de Git `pre-commit` (instalable idempotentemente vía `npm run setup:git-hooks` usando `scripts/setup-git-hooks.js`) que valida la integridad del workspace corriendo `check.js` y bloquea commits que violen el ciclo **Strict TDD** (cambios de producción staged que carezcan de test o checklist staged). Bypass vía `DISABLE_OSPEC_PRECOMMIT=true`.
- Defensa en tres capas contra la **atribución de modelo/IA en commits**: regla `PreToolUse` DENY que intercepta `git commit` y escanea el mensaje antes de ejecutarse (sin bypass); hook de Git `commit-msg` (también instalado por `npm run setup:git-hooks`) que rechaza trailers de atribución y nombres de vendor/modelo, con bypass vía `DISABLE_OSPEC_ATTRIBUTION_CHECK=true`; y la capa pasiva de reglas existente.
- Diagrama arquitectónico de flujos del arnés en `docs/harness-runtime.md` y diagrama del ciclo y rutas de workflows en `docs/sdd-workflows.md` usando imágenes PNG.

### Fixed
- Frontmatter generado inválido: `setScalar` (`scripts/lib/frontmatter.js`) ahora entrecomilla los valores escalares que romperían el YAML plano (`: ` interno, indicadores iniciales, comentarios, etc.). El comando `sdd-workspace`, cuya `description` contiene `atlas: scaffold`, generaba frontmatter que el cargador descartaba en silencio (el comando se cargaba sin metadata); el target `github-copilot` ya no pre-entrecomilla `applyTo` para evitar doble comillado.
- Test de consumo acumulado en `pre-tool-use.test.js`: corregido mock de cambio activo temporal para evitar bypass de límites en entornos sin cambios activos en desarrollo.

### Changed
- Sincronización y auditoría de la documentación general (`README.md`, `harness-runtime.md`, `tdd-y-revision.md`, `comparacion-arneses.md`) eliminando las propuestas obsoletas de oportunidades de mejora técnica ya implementadas.

## [2.4.6] - 2026-06-19

### Security
- Paridad de validación de rutas entre el binario Go y los hooks JS: nuevo `scripts/lib/pathsafe.js` que replica `validatePath`/`resolveCwd`. Los hooks `subagent-stop`, `stop` y `pre-compact` ahora rechazan rutas relativas, con `..` o raíces del sistema de ficheros en `cwd` y `transcript_path`, evitando lectura fuera de límites y escritura dirigida a la raíz.

### Fixed
- Pérdida de datos en `caveman-compress`: la escritura del fichero comprimido es ahora atómica (`os.replace`); si falla, el original queda intacto y se elimina el backup para no bloquear un reintento.
- `federation-baseline-orchestrator`: `loadStatus` ya no convierte cualquier error de I/O en estado vacío (solo `ENOENT`), evitando reinicios silenciosos del progreso de baseline de todos los miembros.
- Iteración no determinista en `subagentstop.go`: las claves del map se ordenan antes de recorrerlas, garantizando una resolución de skill estable entre ejecuciones.
- Escrituras atómicas en `artifact-store.js` (`workspace.yaml`), `stop.js` (`latest.md`) y `federation-marker.js` (sin ficheros `.tmp` huérfanos en fallos de rename).
- `JSON.parse` con contexto de fichero en `target-transform.js` e instaladores globales (`install-global-opencode`, `install-global-copilot`), que ahora fallan con un mensaje accionable en vez de un `SyntaxError` opaco.
- `caveman-compress`: `call_claude` cae al CLI ante cualquier fallo del SDK (no solo `ImportError`) y trunca stderr; `validate` valida la existencia de los paths; salida forzada a UTF-8 para evitar `UnicodeEncodeError` en consolas Windows.

### Added
- Cobertura de tests para el paquete Python `caveman-compress` (`scripts/test_caveman.py`, 10 casos sobre backup-guard, retry-restore, escritura atómica, fallback del SDK y clasificación) y test de la rama de error de `jsonio.ReadInput`.

### Changed
- Refactor de legibilidad: extracción de helpers para aplanar el anidamiento en `route-dispatcher.js`, `store.go` y `ospec-state.js`; eliminación de variables muertas y de un IIFE en el código Go, y renombrados menores (`os2` → `goos`).

## [2.4.5] - 2026-06-19

### Added
- Ruteo de modelos para el target VS Code: habilitado el parámetro `model: true` en el perfil `vscode.js` para inyectar los modelos resueltos de `models.yaml` en el frontmatter de los agentes generados en `dist/vscode/`.
- Scripts de configuración automatizada: añadidos los comandos `"setup:vscode"`, `"setup:copilot"`, y `"setup:opencode"` para compilar y configurar automáticamente los targets locales y globales.
- Configuración automática de VS Code: el script `install-vscode.js` localiza y actualiza la ruta del plugin en el archivo `settings.json` del usuario (tanto para VS Code normal como Insiders), generando un backup previo.
- Robustez en instaladores globales: los instaladores de OpenCode y Copilot CLI ahora crean de forma recursiva sus directorios globales si no existen en el sistema.
- Comandos de recarga unificados: registrados `"reload:vscode"`, `"reload:copilot"` y `"reload:opencode"` para facilitar el ciclo de desarrollo.

## [2.4.4] - 2026-06-19

### Added
- Soporte para instalación global en `opencode`: añadido el script `npm run install:global:opencode` que compila el target, copia binarios, agentes, comandos, skills, instrucciones y plugins directamente en `~/.config/opencode/` e integra de forma automática los servidores MCP y reglas en `opencode.json`.
- Renombrado del agente en `opencode`: se traduce automáticamente `sdd-orchestrator` a `ospec-workflow` para mejorar la integración visual y el autocompletado con Tab en el cliente de OpenCode.
- Documentación detallada en el `README.md` y en `docs/plugin-installation.md` explicando las dos modalidades de instalación (local y global).

## [2.4.3] - 2026-06-19

### Fixed
- Claude agent visibility in VS Code: preserved `user-invocable: false` in the generated Claude agent frontmatter (previously stripped), preventing duplicate agent entries in VS Code and direct user-invocation in Claude Code.
- Setup tool resilience: updated `install-claude.js` and `cli.js` to fallback to Microsoft WinGet local package directories to find `claude.exe` when it is not present in the system PATH.
- Validator CLI compatibility: removed the unsupported `--strict` flag from the `claude plugin validate` command execution in `claude.js` profile, avoiding validation failures on standard installations.

## [2.4.2] - 2026-06-19

### Added
- Capability routing at launcher level (`ospec-hooks-launch.js`): Bypasses the Go binary and delegates to Node.js JS fallbacks for `session-start`, `pre-compact`, and `stop` hooks when running in `workspace-federated` backend mode.
- Hot path performance protection: skips configuration checks entirely for `pre-tool-use` and `subagent-stop` to avoid any I/O latency.
- Full unit test coverage in `ospec-hooks-launch.test.js` validating the routing logic and edge cases.

## [2.4.1] - 2026-06-16

### Fixed
- Hook runtime delivery: `hooks.json` invoked the compiled `ospec-hooks` binary
  directly, but that binary is gitignored and the publish workflow never built or
  bundled it, so it never reached the `release` branch — every install from
  `release` got a `hooks.json` pointing at a missing binary and all five hooks
  failed (`ospec-hooks: No such file or directory`). Hooks now run through
  `scripts/hooks/ospec-hooks-launch.js`, a Node launcher that prefers the
  per-platform Go binary and falls back to the Node hooks when none ships for the
  host. `publish-marketplace.yml` cross-compiles all four platform binaries
  (windows/amd64, darwin/arm64, darwin/amd64, linux/amd64) into the published tree.

## [2.4.0] - 2026-06-15

### Added
- `opencode` (opencode.ai / SST) target for the multi-target generator. Transforms
  the canonical source into opencode's native layout, verified against the official
  docs: agents to `.opencode/agents/*.md` (`mode: primary|subagent`, `tools:` as a
  map, `provider/model` slugs), commands to `.opencode/commands/*.md` (keep `agent:`
  routing; `${input:name}` → positional `$1`/`$2`, `${input}` → `$ARGUMENTS`), rules
  to `.opencode/instructions/*.md` referenced from `opencode.json`, and MCP folded
  into `opencode.json` (`mcp` with `type: local|remote`; VS Code `${input:NAME}`/
  `${NAME}` placeholders in env/header values rewritten to opencode's `{env:NAME}`).
  Because opencode has no
  shell-command hooks, the SDD runtime (`session-start` / `pre-tool-use`) is bridged
  through a JS plugin at `.opencode/plugins/ospec.js`. Gated by a dedicated Node
  validator (`scripts/configure/validate-opencode.js`) plus golden fixtures, wired
  into `node scripts/check.js`. Adds the `opencode` column to `models.yaml`.
- Phase `sdd-clarify` between `spec` and `design` to resolve design decisions early.
- GPT model routing tiers for `opencode` target in `models.yaml`.

### Changed
- Migrated the 5 hooks from JavaScript to a compiled Go binary (`ospec-hooks`), enhancing hook performance and robustness.
- Added path traversal validation for `transcript_path` and `cwd` inside the hooks runner.
- Handled hook event concurrency with file-based locking.
- Simplified installation with single commands per target (e.g. `npm run setup:claude`).
- Hardened multi-OS validation and workflow concurrency in CI.
- Unified routing dispatcher with intent-based routing and 4R review gate.

## [2.3.0] - 2026-06-12

### Fixed
- Claude target tool grants now match the official Claude Code tools reference.
  The `edit` abstract tool mapped only to `Edit` (modify-existing), so every phase
  agent was granted a toolset that could not create the artifacts its own prose
  tells it to `Write` (`proposal.md`, `design.md`, `tasks.md`, spec deltas, source
  and test files). `edit` now expands to `["Edit", "Write"]`, mirroring the existing
  `search → ["Grep", "Glob"]` one-to-many mapping.

### Changed
- `execute` maps to `["Bash", "PowerShell"]` for the Claude target so test and build
  commands run cross-OS: on Windows without Git Bash the `Bash` tool is unavailable
  and `PowerShell` is the native shell tool. Where one shell tool is absent it is
  simply not loaded, so the grant is harmless. Aligns the agent toolsets with the
  existing multi-OS validation workflow.

## [2.2.0] - 2026-06-12

### Added
- Multi-target plugin compatibility: a dependency-free generator
  (`scripts/configure/cli.js`) that transforms the canonical VS Code source into
  native trees for three targets — `claude` (a `.claude-plugin` bundle, gated by
  `claude plugin validate --strict`), `github-copilot` (the `.github/` layout:
  `agents/`, `prompts/`, `instructions/`), and `vscode` (identity). Includes a
  pure `target-transform` with declarative per-target profiles, context-aware
  tool-name substitution, path remapping and artifact drops, a tier-based
  `models.yaml` resolver, frontmatter helpers, the Claude orchestrator delivered
  as a skill, and committed golden fixtures. The source is never mutated; VS Code
  keeps loading it directly.
- YAML frontmatter (`name`, `description`) on the `agent-introspection` and
  `harness-audit` skills so the plugin validator stops warning.
- Brownfield bootstrap path: `sdd-baseline` agent, command, and skill to seed
  `openspec/specs/` with current-behavior specs in resumable per-domain batches.
- Baseline Advisory gate in the orchestrator for brownfield repos.
- Validation harness hardening: `node scripts/check.js` is now the single local
  and CI verification entry point, running native tests and generating GitHub
  Copilot output through the profile-level validator.
- GitHub Copilot distribution validator for required `.github/` layout, hook
  schema, frontmatter semantics, forbidden plugin residue, placeholder leaks,
  local absolute paths, and unexpected Markdown suffixes.
- Multi-OS GitHub Actions workflow (`validate-harness.yml`) covering Ubuntu,
  Windows, and macOS with Node.js 22.
- Canonical OSS files: `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, and this changelog.

### Fixed
- Installation docs drift: hooks are Node.js (not PowerShell) and the MCP
  surface documents both Context7 and MarkItDown.
- P0 harness safety: removed legacy `.atl` registry inheritance from runtime
  guidance, unified skill registry cache resolution, and hardened PreToolUse
  command inspection for unknown tools carrying command payloads.
- GitHub Copilot validation robustness: required paths now check file vs
  directory type before traversal, and residue checks catch case-insensitive
  `vscode` references.

## [2.1.0] - 2026-06-11

### Added
- Configurable model routing via `profiles/models/{default,cheap,premium}.yaml`;
  agents no longer hardcode a model name.
- Runtime lifecycle hooks (`SessionStart`, `PreToolUse`, `PreCompact`,
  `SubagentStop`, `Stop`) with a Node.js runtime under `scripts/hooks/` and a
  native `node --test` suite.
- Governance: blocking approvals persisted in `state.yaml` and delimited prompt
  boundaries separating intent, artifacts, standards, and approval context.
- Minimal default MCP policy (Context7 + MarkItDown), documented in
  `docs/mcp-policy.md`.

### Changed
- README documents the plugin runtime and standard/lite/fast-forward workflows.

## [2.0.0] - 2026-06-10

### Added
- Spec-Driven Development workflow as a VS Code Agent Plugin: `sdd-orchestrator`
  coordinator plus phase agents (`explore`, `propose`, `spec`, `design`, `tasks`,
  `apply`, `verify`, `archive`) and `sdd-foundation` for greenfield discovery.
- OpenSpec as the versionable source of truth for each change.
- Interactive workflow gates through `vscode/askQuestions`.
- Strict TDD mode when the project exposes a compatible test runner.

[Unreleased]: https://github.com/snakeblack/ospec-workflow/compare/v2.4.5...HEAD
[2.4.5]: https://github.com/snakeblack/ospec-workflow/compare/v2.4.4...v2.4.5
[2.4.4]: https://github.com/snakeblack/ospec-workflow/compare/v2.4.3...v2.4.4
[2.4.3]: https://github.com/snakeblack/ospec-workflow/compare/v2.4.2...v2.4.3
[2.4.2]: https://github.com/snakeblack/ospec-workflow/compare/v2.4.1...v2.4.2
[2.4.1]: https://github.com/snakeblack/ospec-workflow/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/snakeblack/ospec-workflow/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/snakeblack/ospec-workflow/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/snakeblack/ospec-workflow/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/snakeblack/ospec-workflow/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/snakeblack/ospec-workflow/releases/tag/v2.0.0
