# Roadmap — target Claude Code

> **Autoridad:** subroadmap específico de target. La prioridad transversal y las dependencias viven en [`../harness-evolution.md`](../harness-evolution.md).
> **Revalidación obligatoria:** antes de implementar un ítem, comprobar de nuevo la documentación oficial y la versión real del host; los hallazgos son snapshots fechados.

> Iniciativa: explotar al máximo las capacidades nativas de Claude Code para el
> harness `ospec-workflow` (gates SDD, TDD estricto, question_gate, orquestación,
> seguridad y coste). El target `claude` ya funciona (perfil
> `scripts/lib/target-profiles/claude.js`, instalador
> `scripts/configure/install-claude.js`); este roadmap cierra la brecha entre lo
> que emite hoy y lo que la plataforma soporta hoy.
>
> Investigación de documentación oficial hecha el **2026-07-10** sobre
> https://code.claude.com/docs (hooks, plugins-reference, skills, sub-agents,
> permissions, sandboxing, headless, model-config, agent-teams, mcp,
> scheduled-tasks) y el CHANGELOG de github.com/anthropics/claude-code
> (última versión observada: **v2.1.206**).
>
> **Protocolo de actualización**: igual que `../harness-evolution.md` y
> `codex.md` (checkboxes, puntero ▶ SIGUIENTE, gotchas acá y no
> en archivos aparte).

## Mapa: pieza ospec ↔ mecanismo nativo Claude Code

| Pieza ospec | Mecanismo nativo (verificado 2026-07-10) | Estado actual en el perfil | Oportunidad |
| --- | --- | --- | --- |
| `agents/*.agent.md` | Subagentes de plugin (`agents/*.md`). Frontmatter vigente: `name`, `description`, `tools`, `disallowedTools`, `model`, `effort`, `maxTurns`, `skills` (preload), `memory`, `background`, `isolation: worktree`, `color`, `initialPrompt`. Por seguridad los agentes de plugin **ignoran** `hooks`, `mcpServers` y `permissionMode`. | Emite `name/description/tools/model` + un campo `user-invocable: false` que **no está documentado para agentes** (inerte). | `effort` por tier, `maxTurns` en agentes cheap, `memory: project` en 4R/verify, `skills:` preload nativo, limpiar frontmatter inerte (6.2, 6.3, 6.4). |
| `commands/*.prompt.md` | Los custom commands **se fusionaron con skills**: mismo frontmatter (`description`, `argument-hint`, `arguments` nombrados, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `effort`, `context: fork`, `agent`, `hooks`, `paths`). Listado de skills con presupuesto de contexto (~1% de la ventana; descripción+`when_to_use` cap 1.536 chars). | Emite `name/description/arguments/argument-hint`; el perfil **stripea** `disable-model-invocation` y `agent` (decisión de una era en que eran inertes — hoy ambos son campos vivos). | `disable-model-invocation: true` en los 21 comandos `/sdd-*` → salen del listado en contexto (ahorro always-on) y quedan bajo control del usuario (6.2). |
| `skills/**/SKILL.md` | Agent Skills estándar + extensiones Claude: `allowed-tools` (pre-aprueba permisos mientras la skill está activa), `disallowed-tools`, hooks embebidos en frontmatter (con `once: true`), inyección dinámica `` !`cmd` ``, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`. | Passthrough tal cual (correcto). | `allowed-tools` en la skill del orquestador para reducir prompts sobre `openspec/**` (6.7); hooks `once` para el bootstrap del dispatch (6.6). |
| Orquestador (`sdd-orchestrator`) | Skill en hilo principal → tiene `AskUserQuestion` (los subagentes **no**: es tool de UI de sesión, no disponible en subagentes). | `emitAs: "skill"` ✓ — decisión validada por la doc actual. | Mantener. Nunca emitir `context: fork` para fases con gates (gotcha). |
| `rules/*.instructions.md` | El `CLAUDE.md` de un plugin **no se carga** como contexto; la doc dice explícitamente que las instrucciones de plugin van en skills. | `rules: inline-into-orchestrator` ✓. | Sin cambio; la estrategia queda ratificada por doc oficial. |
| `hooks/hooks.json` | ~30 eventos hoy (ver gap analysis), 5 tipos de handler (`command`, `http`, `mcp_tool`, `prompt`, `agent`), matchers por evento, filtro `if` con sintaxis de permission rules, `async`/`asyncRewake`, forma exec (`command` + `args`, sin shell), `statusMessage`, salida estructurada (`hookSpecificOutput`: `permissionDecision`, `updatedInput`, `updatedToolOutput`, `additionalContext`, `watchPaths`, `sessionTitle`…). | 5 eventos (`SessionStart`, `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop`), todos `command` en forma shell con `${CLAUDE_PLUGIN_ROOT}` **sin comillas**, sin matchers (PreToolUse dispara un proceso Node en CADA tool call). | Forma exec + matchers (6.1); `Stop` con `additionalContext` para el gate 4R post-verify (6.5); `watchPaths` + `FileChanged` para drift en vivo (6.5). |
| `.mcp.json` | Expansión `${VAR}` y `${VAR:-default}` en `command`, `args`, `env`, `url`, `headers` — confirmada vigente. Servers de plugin se nombran `mcp__plugin_<plugin>_<server>__<tool>`. | `mcpPlaceholders: env-expansion` ✓. | Sin cambio. |
| `models.yaml` (tiers) | Aliases vigentes: `opus` (→ Opus 4.8), `sonnet` (→ Sonnet 5, ventana 1M nativa), `haiku`, `fable` (Fable 5, requiere CC ≥ 2.1.170), `best`, `opus[1m]`, `sonnet[1m]`, `opusplan`. Niveles de `effort`: `low/medium/high/xhigh/max` (por skill, por agente o por sesión). | Columna `claude`: alias plano `opus/sonnet/haiku`; sin effort. | Columna `claude` a objeto `{model, effort}` como ya hace `codex`; evaluar `fable` para premium con la suite golden (6.3). |
| `.claude-plugin/plugin.json` | Schema completo: `$schema`, `displayName`, `version` (pin = updates solo al bump; sin version = SHA de commit), `defaultEnabled`, `homepage/repository/license/keywords`, `userConfig` (prompts al habilitar, `${user_config.KEY}`), `dependencies` entre plugins, `outputStyles`, `lspServers`, `experimental.{themes,monitors}`, `channels`, `bin/` (ejecutables en PATH del Bash tool), `settings.json` de plugin (solo claves `agent` y `subagentStatusLine`). Campos no reconocidos = warning (error con `--strict`). | Mínimo: `name/description/version/author` + paths omitidos por convención; `rules` (campo propio) se dropea para claude ✓. | Metadata completa + `$schema` + build con `validate --strict` (6.7). |
| Instalador / marketplace | Scopes `user/project/local`; `claude plugin details <name>` reporta inventario y **coste de tokens** always-on/on-invoke; cache de plugins con gracia de 7 días para versiones huérfanas. | Marketplace local + add/update idempotente ✓; `validate` sin `--strict`. | `--strict` en build; `plugin details` como métrica de presupuesto en harness-audit (6.7). |
| Gates SDD en CI | `claude -p --bare` (recomendado para CI; será default), `--output-format json` + `--json-schema` (salida en `structured_output`), `--permission-mode dontAsk`, `--plugin-dir` para cargar el plugin sin instalar, evento `system/init` con `plugins`/`plugin_errors` (falla CI si el plugin no cargó), hook `Setup` (`--init`/`--maintenance`). | No existe. | Workflow de verificación headless: `/sdd-verify` como gate de PR (6.8). |
| 4R paralelo / adversarial | Agent teams (**experimental**, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): teammates desde definiciones de subagente (respetan `tools`+`model`; **no** aplican `skills`/`mcpServers`), task list compartida con dependencias, hooks `TeammateIdle`/`TaskCreated`/`TaskCompleted` como quality gates. | No usado (4R corre como subagentes). | Exploratorio, gated por env var (6.9). |
| Tareas programadas | `CronCreate/CronList/CronDelete`, `/loop` (session-scoped, expiración 7 días); Routines en cloud. | No usado. | Bajo valor para el harness (los hooks cubren drift); no se propone change. |

## Qué no estamos aprovechando (gap analysis)

1. **25 de ~30 eventos de hooks sin usar.** Los relevantes al harness:
   `PostToolUse`/`PostToolUseFailure` (evidencia TDD y telemetría de fallos),
   `UserPromptSubmit` (contexto de change activo por prompt), `SessionEnd`
   (cierre limpio de `latest-session`), `PostCompact` (re-inyección post
   compactación — hoy solo preparamos en `PreCompact`), `SubagentStart`
   (marcar inicio de fase en `state.yaml`), `FileChanged` + `watchPaths`
   (drift de specs en vivo, no solo al inicio de sesión), `Setup` (bootstrap
   en CI), `TaskCreated`/`TaskCompleted`/`TeammateIdle` (gates si se adopta
   teams), `PermissionDenied` (`retry: true`).
2. **Cero decision control estructurado.** Nuestros hooks devuelven texto
   plano/exit codes. La plataforma ofrece `permissionDecision`
   (`allow/deny/ask/defer`), `updatedInput` (reescribir la tool call — p. ej.
   sanear un `git commit` con atribución antes de que corra, en vez de solo
   bloquear), `updatedToolOutput`, `additionalContext` tipado por evento, y en
   `SessionStart`: `sessionTitle`, `watchPaths`, `reloadSkills`.
3. **PreToolUse sin matcher = un proceso Node por CADA tool call** (también
   `Read`/`Glob`/etc. que `pre-tool-use.js` ni inspecciona). Con `matcher` y/o
   `if: "Bash(git *)"` el 90 % de los spawns desaparece. `SubagentStop` tampoco
   filtra: corre para subagentes ajenos al harness.
4. **Forma shell con `${CLAUDE_PLUGIN_ROOT}` sin comillas** en el
   `hooks/hooks.json` emitido: rompe con rutas con espacios (p. ej.
   `C:\Users\Juan Pérez\...`). La doc recomienda forma exec (`command` +
   `args`) precisamente para esto.
5. **Frontmatter de agentes desaprovechado**: sin `effort` (existe por agente y
   por tier de modelo), sin `maxTurns` (techo de coste), sin `memory`
   (aprendizaje entre sesiones para los 4R), sin `skills:` preload; y emitimos
   `user-invocable: false`, que no es campo documentado de agentes (ruido que
   `--strict` puede marcar).
6. **`disable-model-invocation` se stripea cuando hoy es exactamente el control
   deseado**: los 21 comandos `/sdd-*` son acciones que decide el usuario (el
   ruteo por lenguaje natural pasa por la skill del orquestador, no por los
   comandos). Hoy sus 21 descripciones compiten por el presupuesto de listado
   (~1 % del contexto) en cada sesión; con el flag salen del listado y ningún
   scheduled task ni auto-invocación puede dispararlos.
7. **Resolución de skills artesanal vs preload nativo**: cada agente de fase
   dice "Read `skills/sdd-<fase>/SKILL.md`" (ruta relativa al cwd del repo
   destino, mientras la skill vive en la cache del plugin) y sostenemos un
   `skill-resolver` + telemetría de degradación en `subagent-stop.js`. El campo
   `skills:` inyecta el contenido completo al arrancar el subagente.
8. **Sin gate SDD en CI** pese a que el envelope (`result-envelope.js`) es
   perfectamente parseable: `claude -p --bare --json-schema` devuelve salida
   estructurada y `system/init.plugin_errors` permite fallar el job si el
   plugin no cargó.
9. **Sin medición de coste de contexto del plugin**: `claude plugin details
   ospec-workflow` da tokens always-on y on-invoke por componente — insumo
   directo para `harness-audit` y para validar el punto 6.
10. **Manifest pobre y validación laxa**: sin `displayName/repository/license/
    keywords/$schema` en `plugin.json` (solo en la entrada del marketplace);
    el build valida sin `--strict`, así que campos mal escritos pasarían.

## Bloque 6 — Explotación nativa Claude Code (orden con dependencias)

### 6.1 `claude-hooks-exec-matchers` (S) — robustez y coste de los hooks  ▶ SIGUIENTE

- [ ] Emitir el `hooks/hooks.json` del target claude en **forma exec**:
      `{"type":"command","command":"node","args":["${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js","<evento>"]}`.
      QUÉ: transform de hooks en `scripts/lib/target-transform.js` gobernado
      por el perfil (`claude.js`, p. ej. `hooks.form: "exec"`); el
      `hooks/hooks.json` canónico no cambia (otros targets conservan su shape).
      POR QUÉ: la forma shell actual sin comillas rompe con espacios en la ruta
      de instalación; exec form es la recomendación oficial y evita depender
      del shell por defecto (bash) en Windows.
- [ ] Añadir **matchers**: `PreToolUse` limitado a las tools que
      `pre-tool-use.js` realmente inspecciona (`Bash|PowerShell|Write|Edit` —
      confirmar contra `SHELL_TOOL_NAMES` del script) y `SubagentStop`/futuros
      `SubagentStart` anclados al plugin (`^ospec-workflow:(sdd-|review-)` —
      los nombres con `:` se evalúan como regex sin anclar; anclar siempre).
      POR QUÉ: hoy se paga un spawn de Node por cada tool call de la sesión y
      por cada subagente ajeno al harness.
- [ ] CÓMO se valida: `claude plugin validate --strict` sobre `dist`; test de
      transform con fixture golden del JSON emitido; instalación real y
      disparo manual de un `git commit` con atribución (el bloqueo debe seguir
      funcionando) + verificación de que `Read` ya no lanza el launcher.

### 6.2 `claude-command-frontmatter` (S) — comandos fuera del presupuesto de contexto

- [ ] Dejar de stripear `disable-model-invocation` en `claude.js`
      (`frontmatter.stripKeys`) y emitir `disable-model-invocation: true` en
      los comandos `/sdd-*` (los 21). La skill del orquestador queda
      model-invocable (es el vehículo del ruteo por lenguaje natural).
      POR QUÉ: ahorro always-on de contexto (las descripciones salen del
      listado), control de timing en manos del usuario, y endurecimiento: ni
      scheduled tasks ni auto-invocación pueden disparar `/sdd-archive` o
      `/sdd-apply` (documentado en skills#control-who-invokes-a-skill).
- [ ] Revisar el strip de `agent:` en comandos: hoy `agent` + `context: fork`
      SÍ son campos vivos, pero un fork no tiene `AskUserQuestion` → mantener
      el strip para comandos con gates (todos los de fase) y documentar la
      razón actualizada en el comentario del perfil (ya no es "inert", es
      "incompatible con question_gate").
- [ ] Actualizar `openspec/specs/generator/spec.md` (escenarios de frontmatter
      claude) y fixtures.
- [ ] CÓMO se valida: `claude plugin details ospec-workflow` antes/después
      (debe caer el always-on); `/sdd-new` sigue invocable a mano; pedir
      "hazme un SDD para X" en sesión limpia y verificar que rutea por la
      skill del orquestador.

### 6.3 `claude-models-effort` (M) — tiers con effort y evaluación de fable

- [ ] Columna `claude` de `models.yaml` a objeto por tier:
      `premium: {model: opus, effort: high}`, `default: {model: sonnet,
      effort: medium}`, `cheap: {model: haiku, effort: low}`; el generador
      emite `model:` + `effort:` en el frontmatter del agente (campo
      documentado en sub-agents, valores `low/medium/high/xhigh/max`).
      POR QUÉ: mismo apalancamiento calidad/coste que ya explota la columna
      `codex` (`model_reasoning_effort`); hoy claude es el único target sin
      dial de razonamiento.
- [ ] `maxTurns` para agentes cheap (`sdd-explore`, `sdd-archive`) vía
      capacidad declarada en el perfil o en `models.yaml` — techo duro de
      coste ante loops.
- [ ] Dejar de emitir `user-invocable: false` en agentes (campo de skills, no
      documentado para agentes) o justificarlo si `--strict` lo acepta; añadir
      `color:` por familia (`sdd-*` azul, `review-*` rojo) — costo cero,
      legibilidad del task panel.
- [ ] **Gate obligatorio** (regla de `models.yaml`): correr la suite golden de
      `scripts/evals/` con la matriz nueva; evaluar además `fable` como
      premium (Fable 5, CC ≥ 2.1.170, pensado para tareas largas autónomas —
      candidato natural para `sdd-orchestrator`/`sdd-verify`) y adjuntar el
      N/7 al change. A confirmar: coste relativo de fable vs opus antes de
      promoverlo.
- [ ] CÓMO se valida: evals + `claude plugin validate --strict` + inspección
      del frontmatter emitido en dist regenerado (test golden).

### 6.4 `claude-skills-preload` (M) — preload nativo en vez de resolver artesanal [depende: 6.3 opcionalmente, ninguna dura]

- [ ] Emitir `skills: ["ospec-workflow:sdd-<fase>"]` en el frontmatter de cada
      agente de fase (y las `_shared` que el agente lista como lectura
      obligatoria, si son skills válidas). El contenido completo se inyecta al
      arrancar el subagente — sin `Read` de rutas relativas que apuntan al repo
      destino mientras la skill vive en la cache del plugin.
      POR QUÉ: elimina la clase entera de fallos que hoy mitigamos con
      `skill-resolver.md` + telemetría de degradación (`fallback-registry`,
      `fallback-path`, `none`) en `subagent-stop.js`; menos turnos por fase
      (no gasta un tool call en leer su propia skill).
- [ ] **A confirmar primero** (spike corto): que el campo `skills:` de un
      agente de plugin acepta nombres plugin-scoped (`plugin:skill`) — la doc
      confirma que los subagentes pueden invocar skills de plugin y que
      `skills:` preloada "skills", pero no muestra un ejemplo con namespace de
      plugin. Validar en instalación real antes de tocar el generador. Nota:
      las skills con `disable-model-invocation: true` NO se pueden preloadar —
      por eso 6.2 aplica el flag solo a comandos, nunca a `skills/sdd-*`.
- [ ] Mantener el resolver como fallback para los otros targets (el cambio es
      solo del perfil claude); registrar en el envelope una resolución
      `native-preload` para poder medir la mejora.
- [ ] CÓMO se valida: instalar, correr `/sdd-explore` y `/sdd-propose` reales
      y verificar en `openspec/.../runtime-events` que la resolución de skill
      ya no degrada; diff de turnos consumidos por fase antes/después.

### 6.5 `claude-hooks-gates` (M) — hooks nuevos al servicio de los gates [depende: 6.1]

- [ ] `Stop` hook: cuando `state.yaml` del change activo muestra `verify`
      completado con gates 4R pendientes, devolver
      `hookSpecificOutput.additionalContext` recordando el gate (la lección ya
      documentada en memoria "4R gate check after verify", ahora enforced
      determinísticamente). Empezar con contexto no bloqueante; evaluar
      `decision: "block"` recién con evidencia de falsos positivos cero
      (a confirmar el campo anti-loop del input de Stop antes de bloquear).
- [ ] `SessionStart`: emitir salida estructurada
      (`hookSpecificOutput.additionalContext` en vez de stdout plano) +
      `watchPaths` sobre `openspec/changes/*/state.yaml` y `openspec/specs/`;
      añadir handler `FileChanged` en el launcher para notificar drift de
      specs en vivo (hoy el advisory de drift solo corre al inicio y en
      pre-tool-use de commits).
- [ ] `SubagentStart` (matcher anclado al plugin): estampar inicio de fase en
      `state.yaml`/runtime-events — hoy solo tenemos el lado Stop, así que una
      fase colgada es indistinguible de una nunca lanzada.
- [ ] `PostToolUseFailure` (matcher `Bash|PowerShell`): registrar fallos de
      test en runtime-events como evidencia TDD (rojo→verde observable).
- [ ] CÓMO se valida: tests de paridad Go/JS existentes extendidos a los
      eventos nuevos; sesión real: editar un spec baseline fuera del flujo y
      ver la notificación FileChanged; matar una fase a mitad y ver el
      `phase-start` huérfano en runtime-events.

### 6.6 `claude-orchestrator-skill-polish` (S) — la skill del orquestador [depende: 6.2]

- [ ] `allowed-tools` en la SKILL.md emitida del orquestador para pre-aprobar
      lo inofensivo y frecuente (p. ej. `Read`, `Grep`, `Glob`,
      `Bash(git status *)`, `Bash(git branch *)`) — menos prompts de permiso
      durante la coordinación sin tocar settings del usuario. Nota: es el
      ÚNICO vehículo de pre-aprobación que un plugin puede empaquetar (el
      `settings.json` de plugin solo soporta `agent` y `subagentStatusLine`).
- [ ] Hook embebido en la skill con `once: true` para el bootstrap de
      `dispatch-lifecycle-hooks` (hoy prosa en `_shared`): se ejecuta una vez
      por sesión al activarse la skill, determinista.
- [ ] Revisar la `description` contra el cap de 1.536 chars y front-loadear
      triggers (`/sdd-*`, "spec-driven", "SDD") — la doc trunca
      `description+when_to_use` y dropea primero las skills menos usadas.
- [ ] CÓMO se valida: `claude plugin details` (delta on-invoke), sesión real
      con `/sdd-continue` y conteo de prompts de permiso antes/después.

### 6.7 `claude-manifest-strict` (S) — manifest y validación [sin dependencias]

- [ ] `plugin.json` fuente: añadir `$schema`
      (`https://json.schemastore.org/claude-code-plugin-manifest.json`),
      `displayName`, `homepage`, `repository`, `license`, `keywords`
      (hoy solo viven en la entrada del marketplace) — el generador ya los
      passthrough/omite según perfil; verificar que `rules` siga dropeado.
- [ ] Cambiar el validate del perfil a
      `["claude","plugin","validate","--strict","{out}"]` y arreglar cualquier
      warning que aflore (candidato conocido: `user-invocable` en agentes,
      ver 6.3).
- [ ] Incorporar `claude plugin details ospec-workflow` al skill
      `harness-audit` como métrica estándar de presupuesto de tokens del
      plugin (always-on y on-invoke por componente).
- [ ] CÓMO se valida: build limpio con `--strict`; `plugin details` corre y
      reporta; `install-claude.js` sigue siendo idempotente.

### 6.8 `claude-ci-verify-gate` (M) — gates SDD en CI headless [depende: 6.1, 6.7]

- [ ] Script `scripts/ci/sdd-verify-gate.(js|sh)` + workflow de ejemplo:
      `claude -p --bare --plugin-dir dist/claude-marketplace/plugins/ospec-workflow
      --permission-mode dontAsk --output-format json --json-schema <schema-envelope>
      "/ospec-workflow:sdd-verify <change>"` → parsear `structured_output.status`
      y fallar el job si no es aprobado. `--bare` garantiza reproducibilidad
      (no carga hooks/MCP/CLAUDE.md de la máquina del runner).
      POR QUÉ: el gate de verify deja de depender de que alguien lo corra en
      sesión; el envelope ya existe (`result-envelope.js`), solo falta el
      esquema JSON y el wiring.
- [ ] Consumir `system/init` (`--output-format stream-json`) para fallar
      explícitamente cuando `plugin_errors` no está vacío (plugin no cargó ≠
      verify pasó).
- [ ] Evaluar hook `Setup` (matcher `init`) para preparación one-shot en CI
      (`claude --init-only`), en lugar de pasos de shell previos.
- [ ] CÓMO se valida: GH Actions sobre un change fixture con verify verde y
      otro con verify rojo; el job debe reflejar exactamente el envelope.

### 6.9 `claude-agent-teams-4r` (L, exploratorio, **gated: experimental**) [depende: 6.3, 6.5]

- [ ] Spike (no producto): modo opcional de 4R sobre agent teams —
      los cuatro revisores como teammates que comparten task list y debaten
      hallazgos (patrón adversarial tipo `judgment-day`), con
      `TaskCompleted`/`TeammateIdle` como quality gates deterministas.
      Requiere `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; los teammates honran
      `tools`+`model` de la definición pero **no** `skills`/`mcpServers`;
      coste de tokens sensiblemente mayor; sin resume de teammates in-process.
      No comprometer nada del flujo estándar a esta base hasta que salga de
      experimental. Entregable del spike: nota en este archivo con
      viable/no-viable y coste medido.

**Dependencias**: 6.1 es la base de todo lo que toque hooks (6.5, 6.8). 6.2,
6.3, 6.7 pueden ir en paralelo desde ya. 6.4 arranca con su spike de
confirmación. 6.6 después de 6.2 (comparten transform de frontmatter de
skills). 6.9 al final y solo como spike.

## Gotchas registrados (de la investigación 2026-07-10)

- **`AskUserQuestion` no existe en subagentes** (tool de UI de sesión, junto a
  `EnterPlanMode`, `ScheduleWakeup`…). El `question_gate` DEBE resolverse en el
  hilo principal → el orquestador sigue siendo skill, y jamás emitir
  `context: fork` en comandos que puedan derivar en gate.
- **Los agentes de plugin ignoran `hooks`, `mcpServers` y `permissionMode`**
  (restricción de seguridad documentada). Todo control por-agente debe venir de
  `tools`/`disallowedTools`/`maxTurns`/`effort` o de hooks a nivel plugin.
- **Un plugin no puede pre-declarar permisos**: su `settings.json` solo soporta
  las claves `agent` y `subagentStatusLine`. El único vehículo de pre-aprobación
  empaquetable es `allowed-tools` en skills (y en repos ajenos requiere el
  trust dialog del workspace para skills de proyecto; las de plugin aplican al
  habilitar el plugin).
- **El `CLAUDE.md` del plugin no se carga** → `rules: inline-into-orchestrator`
  es correcto y debe mantenerse.
- **`version` en `plugin.json` pinea updates**: los usuarios solo reciben
  cambios al bump (nuestro release workflow ya sincroniza 5 archivos — no
  olvidar que publicar sin bump = no-op para instalados).
- **`${CLAUDE_PLUGIN_ROOT}` cambia con cada versión** (cache por versión,
  huérfanas se limpian a los ~7 días); estado persistente va a
  `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`). Tras un update
  mid-session, hooks/MCP siguen en la ruta vieja hasta `/reload-plugins`.
- **Forma shell de hooks exige comillas** alrededor de
  `"${CLAUDE_PLUGIN_ROOT}"`; la forma exec (`args`) lo evita por completo. El
  shell por defecto de hooks es bash incluso en Windows (existe
  `"shell": "powershell"` por handler).
- **Matchers de `SubagentStart/Stop` con nombres plugin-scoped** contienen `:`
  → se evalúan como regex sin anclar; anclar con `^...$` para no matchear de
  más.
- **`isolation: worktree` ramifica desde la rama default, no desde el HEAD de
  la sesión** → inservible para `sdd-apply` a mitad de un change en feature
  branch. No adoptarlo sin resolver la base del worktree (hook
  `WorktreeCreate` permite reemplazar el comportamiento, pero es más maquinaria
  que beneficio hoy).
- **Sandbox de Bash: macOS/Linux/WSL2 solamente; Windows nativo NO** (nuestro
  entorno primario de desarrollo). Cualquier recomendación de sandbox para
  repos destino debe ser condicional a plataforma; deny-first de permisos
  aplica siempre: un deny no se puede excepcionar con allow más específico, y
  un hook con exit 2 bloquea incluso lo allowed.
- **`disable-model-invocation: true` también impide** el preload vía `skills:`
  de subagentes y la ejecución desde scheduled tasks (v2.1.196+) → aplicarlo a
  comandos, nunca a las skills `sdd-*` que los agentes preloadan (6.4).
- **Presupuesto de listado de skills**: ~1 % de la ventana de contexto
  (`skillListingBudgetFraction`), cap de 1.536 chars por entrada
  (`description` + `when_to_use`), y se dropean primero las menos invocadas.
  Descripciones front-loaded con triggers al principio.
- **El contenido de una skill invocada queda en contexto toda la sesión**; tras
  compactación se re-adjunta con presupuesto (5k tokens por skill, 25k total).
  Cuerpos de skill concisos = coste recurrente menor.
- **Subagentes corren en background por defecto desde v2.1.198** y los prompts
  de permiso burbujean a la sesión principal; `Explore`/`Plan` no cargan
  CLAUDE.md y no son resumibles (los custom sí, vía `SendMessage`/ID).
- **`claude -p` sin `--bare` carga hooks/MCP/CLAUDE.md de la máquina** → CI no
  reproducible; `--bare` será default de `-p` en el futuro. En `-p` no hay
  trust dialog: las allow rules de proyecto no confiado se ignoran.
- **A confirmar** (pendientes de verificación práctica, no de doc):
  1) `skills:` con nombres plugin-scoped en agentes de plugin (spike 6.4);
  2) si `user-invocable` en frontmatter de agente dispara warning con
  `validate --strict` (6.3/6.7); 3) el campo anti-loop del input del hook
  `Stop` antes de usar `decision: "block"` (6.5); 4) coste/latencia de `fable`
  como premium frente a `opus` (gate de evals en 6.3); 5) semántica exacta de
  `strict` en entradas de `marketplace.json` (mensaje de error la referencia;
  no la usamos hoy).

## Fuentes

- https://code.claude.com/docs/en/hooks — eventos, tipos de handler, matchers, `if`, async, salida estructurada, timeouts.
- https://code.claude.com/docs/en/plugins-reference — schema de plugin.json, componentes, `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}`, cache, versioning, CLI (`validate --strict`, `details`), monitors, `bin/`, `settings.json` de plugin.
- https://code.claude.com/docs/en/skills — frontmatter completo de SKILL.md, fusión commands→skills, `disable-model-invocation`, `allowed-tools`, presupuesto de listado, `context: fork`, inyección dinámica.
- https://code.claude.com/docs/en/sub-agents — frontmatter completo de agentes, `memory`, `background`, `isolation`, `skills` preload, nested subagents, resume vía `SendMessage`, restricciones de agentes de plugin, tools no disponibles en subagentes.
- https://code.claude.com/docs/en/permissions — allow/ask/deny, sintaxis de reglas, precedencia, workspace trust, interacción con hooks.
- https://code.claude.com/docs/en/sandboxing — plataformas, modos, filesystem/network, credenciales, límites en Windows.
- https://code.claude.com/docs/en/headless — `claude -p`, `--bare`, `--json-schema`, `system/init` (`plugin_errors`), CI.
- https://code.claude.com/docs/en/model-config — aliases vigentes (`opus`→4.8, `sonnet`→Sonnet 5, `fable`), effort, `availableModels`.
- https://code.claude.com/docs/en/agent-teams — habilitación experimental, teammates desde definiciones de subagente, hooks de equipo, limitaciones.
- https://code.claude.com/docs/en/mcp — expansión `${VAR}`/`${VAR:-default}`, scopes, naming de servers de plugin.
- https://code.claude.com/docs/en/scheduled-tasks — CronCreate/`/loop`, alcance de sesión, expiración.
- https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md — v2.1.206 al 2026-07-10.
