# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Plugin version tracks `.plugin.json` and `.claude-plugin/plugin.json`.

## [Unreleased]

### Added
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

[Unreleased]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.5...HEAD
[2.4.5]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.4...v2.4.5
[2.4.4]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.3...v2.4.4
[2.4.3]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.2...v2.4.3
[2.4.2]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.1...v2.4.2
[2.4.1]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/mretamozo-hiberuscom/ospec-workflow/releases/tag/v2.0.0
