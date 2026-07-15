# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Plugin version tracks `.plugin.json` and `.claude-plugin/plugin.json`.

## [Unreleased]

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
