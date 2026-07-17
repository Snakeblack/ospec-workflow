# Roadmap — target VS Code (Copilot agent mode)

> **Autoridad:** subroadmap específico de target. La prioridad transversal y las dependencias viven en [`../harness-evolution.md`](../harness-evolution.md).
> **Revalidación obligatoria:** antes de implementar un ítem, comprobar de nuevo la documentación oficial y la versión real del host; los hallazgos son snapshots fechados.

> Iniciativa: explotar a fondo el target `vscode` del generador multi-target
> (`claude`, **`vscode`**, `github-copilot`, `opencode`, `codex`). Hoy es el
> target "identidad" (el source canónico ya es formato VS Code) y por eso el
> MENOS trabajado: perfil sin validador (`validate: null`), hooks empaquetados
> pero declarados como no ejecutables, y ninguna capacidad post-2025 aprovechada.
> Investigación de documentación oficial hecha el **2026-07-10** sobre
> https://code.visualstudio.com/docs/agent-customization/ (custom agents, hooks,
> skills, plugins, prompt files, instructions, MCP), docs de agents/approvals/
> subagents/cloud-agents y changelogs de GitHub Copilot en VS Code (mayo y
> junio 2026, v1.123–v1.127).
>
> **Protocolo de actualización**: igual que `../harness-evolution.md` y
> `codex.md` — checkboxes por item, puntero ▶ SIGUIENTE en el
> primer item ejecutable, gotchas en ESTE archivo (no en archivos aparte).

## Estado actual del target (auditado 2026-07-10)

- Perfil `scripts/lib/target-profiles/vscode.js`: transformación identidad
  (`.agent.md`→`.agent.md`, `.prompt.md`→`.prompt.md`) + **inyección de
  `model:` como array de fallback** desde la columna `vscode` de `models.yaml`
  (formato `"Nombre (vendor)"`). **`validate: null`** — único target sin validador.
- Instalador `scripts/configure/install-vscode.js`: compila a `dist/vscode`,
  copia el binario Go de hooks y hace **push a `chat.pluginLocations` como
  array** en el settings.json del usuario (stable + Insiders, 3 SOs). La doc
  vigente documenta ese setting como **objeto** `{ "ruta": true|false }`.
- Bundle emitido: `.claude-plugin/plugin.json` (formato Claude, soportado por
  VS Code) con `agents/`, `commands/`, `skills/`, `rules/`, `hooks/hooks.json`,
  `.mcp.json`, más `scripts/hooks/` (runtime Node) y `scripts/lib/`.
- Frontmatter que ya emite el source: agents con `name`, `description`,
  `tools: ['read','search','edit','execute','agent','vscode/askQuestions']`,
  `agents: [...]` (allowlist del orquestador), `user-invocable`, `target: vscode`;
  prompts con `agent: sdd-orchestrator` y `${input:...}`; rules con `applyTo`.
- `docs/target-capabilities.md` declara para vscode: hooks ❌, subagentes en
  paralelo ❌, background tasks ❌. **Las tres filas quedaron desactualizadas**
  (ver mapeo abajo): la doc oficial 2026 contradice las tres.

## Tabla de mapeo: pieza ospec ↔ mecanismo nativo VS Code

| Pieza ospec | Mecanismo nativo VS Code (estado oficial) | Estado en el perfil hoy | Oportunidad concreta |
| --- | --- | --- | --- |
| `agents/*.agent.md` | Custom agents `.agent.md` (estable). Frontmatter vigente: `name`, `description`, `argument-hint`, `tools`, `agents` (allowlist/`*`/`[]`), `model` (string o **array = orden de fallback**), `user-invocable`, `disable-model-invocation`, `target: vscode\|github-copilot`, `handoffs`, `hooks` (preview), `mcp-servers` (solo target github-copilot). `infer` está **deprecado**. Descubrimiento: `.github/agents`, `.claude/agents`, `~/.copilot/agents`, `chat.agentFilesLocations`, plugins. | ✅ Identidad + `model:` array inyectado. Usa `user-invocable` y `target`, no usa `handoffs` ni `disable-model-invocation` ni `argument-hint`. | `handoffs` para encadenar fases SDD con botones (V.6); `disable-model-invocation` fino por agente; hooks por agente (V.8). |
| `commands/*.prompt.md` | Prompt files (estable): `description`, `name`, `argument-hint`, `agent` (ask/agent/plan/custom), `model`, `tools`; `${input:var}` y `${input:var:placeholder}`; slash command por nombre. NO deprecados (conviven con skills, a diferencia de Codex). | ✅ Routing `agent: sdd-orchestrator` + `${input:...}` ya nativos. | Añadir `argument-hint` a los `/sdd-*` (V.7); no hay migración forzada a skills. |
| `skills/**/SKILL.md` | **Agent Skills nativas (estable)**, estándar agentskills.io. Discovery: `.github/skills/`, `.claude/skills/`, `.agents/skills/`, `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/`, `chat.agentSkillsLocations`, y `skills/` del plugin. Progressive disclosure en 3 niveles; invocación implícita por descripción o explícita `/nombre`; `context: fork` (experimental, `github.copilot.chat.skillTool.enabled`) corre la skill en subagente. | Parcial: las skills viajan en el plugin y los agentes las leen por instrucción explícita ("Read the matching skill file"). No se apoyan en disclosure nativo ni en invocación `/`. | Higiene de nombres (kebab-case sin prefijos — los inválidos **fallan silenciosamente**), `user-invocable`/`disable-model-invocation` por skill, evaluar `context: fork` para skills pesadas (V.7). |
| `hooks/hooks.json` + runtime Node/Go | **Agent hooks (Preview)** — la mina de oro. 8 eventos: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, `Stop`. Payload stdin JSON estilo Claude (`hook_event_name`, `tool_name`, `tool_input`, `session_id`, `transcript_path`, `cwd`). Exit 2 = bloqueo; stdout JSON con `permissionDecision: deny\|allow\|ask`. Hooks de plugin en `hooks/hooks.json` (formato Claude); VS Code **expande `${CLAUDE_PLUGIN_ROOT}` y setea esa env var**. Ubicaciones extra: `.github/hooks/*.json`, `.claude/settings.json`, `~/.copilot/hooks`, `chat.hookFilesLocations`. | ❌ El hooks.json viaja en dist pero `docs/target-capabilities.md` lo declara no ejecutado; nunca se probó paridad de payload. Los 5 eventos que usa el harness están TODOS soportados. | **V.1**: activar AgentShield, token advisor, git guard y session-state en vscode con el runtime existente. Gotcha crítico: VS Code **ignora los matchers** (parsea pero ejecuta todo) → el runtime debe filtrar por `tool_name` internamente. |
| `.mcp.json` | MCP estable: `.vscode/mcp.json` (clave `servers`) y formato Claude vía plugin (`.mcp.json` con `mcpServers`); `${input:}` nativo con prompt al usuario; gallery `@mcp` en Extensions; `chat.mcp.autoStart` (experimental); sandbox de servers (macOS/Linux). | ✅ El plugin lo lleva; `${input:CONTEXT7_API_KEY}` funciona nativo. | Nada urgente. Nota: los MCP de plugin quedan **implícitamente confiados** al instalar (documentarlo). |
| `models.yaml` (columna vscode, arrays) | `model` en frontmatter acepta array como **orden de fallback priorizado** (confirmado en doc de custom agents). Formato `"Nombre (vendor)"`; vendors BYOK: `anthropic`, `openai`, `azure`, `customendpoint` (Chat Completions/Responses/Messages), Ollama vía extensión oficial. BYOK funciona sin cuenta GitHub (air-gapped, mayo 2026). | ✅ Arrays inyectados; ya referencia `"Qwen 3.6 MSC1 (customendpoint)"` en cheap. | Documentar el requisito `chatLanguageModels.json` (`toolCalling: true` obligatorio para agentes) para el fallback customendpoint (V.9). Gotcha: el modelo de un subagente **no puede exceder el cost tier del modelo padre**. |
| `rules/*.instructions.md` | Instructions estables: `.github/instructions/` (recursivo), `.claude/rules/`, `AGENTS.md` (`chat.useAgentsMdFile`; anidados con `chat.useNestedAgentsMdFiles` experimental), `CLAUDE.md` (`chat.useClaudeMdFile`), `~/.copilot/instructions`, `chat.instructionsFilesLocations`. Frontmatter `applyTo` (globs), `description`, `name`. Precedencia: personales > repo > organización. | ⚠️ Viajan en el plugin bajo `"rules": "rules/"`, pero **plugin.json de VS Code NO documenta un campo `rules`** (solo `skills`, `agents`, `hooks`, `mcpServers`) → posiblemente peso muerto en este target. | V.3: instalar las rules en `.github/instructions/` del repo destino o en el perfil de usuario. **A confirmar** si el loader de plugins las carga pese a no estar documentado. |
| `question_gate` (`vscode/askQuestions`) | Tool nativa `ask_questions` (la usa el Plan agent); soporta múltiples preguntas estructuradas por llamada. | ✅ El orquestador ya la instruye. | Gotcha a documentar: con auto-approve global/YOLO la tool devuelve `{"skipped": true}` **sin mostrar UI** → el gate se saltea silenciosamente (V.9). |
| Orquestación (orquestador → fases) | Subagentes nativos: tool `agent`/`runSubagent`, allowlist `agents:`, contexto aislado, resultado colapsable en chat con transcript expandible. **Ejecución en paralelo soportada** ("run multiple subagents in parallel"). Anidamiento off por default (`chat.subagents.allowInvocationsFromSubagents`, máx. profundidad 5). Tracking de créditos por subagente (junio 2026, GA). | ✅ Allowlist y tool `agent` ya emitidos. ❌ La matriz de capacidades dice "secuencial" — desactualizado. | **V.5**: despachar los 4 reviewers 4R en paralelo también en vscode (~4x menos latencia en el gate más caro) y corregir la matriz. |
| Distribución / instalación | **Agent plugins (Preview)**: manifiesto en `.plugin/plugin.json`, `plugin.json` raíz, `.github/plugin/plugin.json` o `.claude-plugin/plugin.json`; marketplaces vía `chat.plugins.marketplaces` (formato `owner/repo`, HTTPS, SSH, `file://`); browsing con `@agentPlugins` en Extensions view; `Chat: Install Plugin From Source` (URL git); autodescubre plugins instalados con Copilot CLI. Un mismo repo de plugin sirve para VS Code + Copilot CLI + Claude Code. | Parcial: instalador local por `chat.pluginLocations` con **formato array desactualizado** (doc vigente: objeto ruta→bool). Sin entrada de marketplace para vscode. | V.3 (formato) + V.4 (marketplace propio reutilizando el branch `release` que ya publica el artefacto para codex/claude). |
| Validación del target | — | ❌ `validate: null`. | **V.2**: `scripts/configure/validate-vscode.js` + fixtures golden. |
| (sin pieza hoy) | **Plan agent** (`/plan`, `chat.planAgent.defaultModel`, `github.copilot.chat.implementAgent.model`), **todo list** (`chat.todoListTool.enabled`, `#todo`), **checkpoints** (`chat.checkpoints.enabled`), **cloud agents** (`/delegate`, "Continue in Cloud", sesiones Claude/Codex de terceros), **Agents window** (preview), sesiones múltiples en paralelo y multi-chat por sesión (GA junio 2026), sync de sesiones a GitHub + `/chronicle` (mayo 2026). | ❌ Nada del harness los usa. | V.10 exploratorio: mapear fases SDD largas (apply batcheado) a delegación cloud; `#todo` como espejo de `tasks.md` en vscode. |

## Qué no estamos aprovechando (gap analysis honesto)

1. **Hooks nativos ejecutándose y nadie los prendió.** El harness ya empaqueta
   `hooks/hooks.json` en formato exacto que VS Code hoy consume desde plugins
   (mismos nombres de evento PascalCase, `${CLAUDE_PLUGIN_ROOT}` expandido y
   exportado como env var, payload stdin estilo Claude, exit 2 bloqueante,
   `permissionDecision`). Los 5 eventos que usa el runtime (SessionStart,
   PreToolUse, PreCompact, SubagentStop, Stop) están los 5 soportados. Todo el
   stack de protecciones que `docs/target-capabilities.md` da por perdido en
   vscode (AgentShield, token advisor, git collaboration guard, session state)
   es potencialmente activable **sin escribir un runtime nuevo**. Único trabajo
   real: paridad de payload (nombres de `tool_name` de VS Code ≠ los de Claude)
   y filtrado interno porque VS Code ignora los matchers.
2. **Paralelismo de subagentes ya existe y seguimos degradando a secuencial.**
   La prosa de degradación de `gate-4r-review.md` y la matriz D1 penalizan a
   vscode con 4x de latencia en el gate 4R sin motivo vigente.
3. **`validate: null`**: el target con más superficie de frontmatter (tools,
   agents allowlist, model arrays, handoffs, applyTo) es el único que se emite
   sin validar. Un typo en un nombre de agente del allowlist o un nombre de
   skill con prefijo produce **fallas silenciosas** documentadas.
4. **Instalador desalineado con la doc vigente**: `chat.pluginLocations` como
   array (doc: objeto), sin ruta de marketplace, y las `rules/` viajando por un
   campo de manifiesto que VS Code no documenta.
5. **Skills como archivos pasivos**: funcionan (los agentes las leen), pero no
   usamos disclosure progresivo nativo, ni invocación `/skill`, ni
   `context: fork` para no inflar el contexto del orquestador — exactamente el
   problema que su Delegation Rules intenta mitigar a mano.
6. **`handoffs` sin usar**: transición natural post-fase (ej. verify OK →
   botón "Archive change") que hoy se resuelve con prosa.
7. **Cero integración con el ecosistema de sesiones 2026**: Plan agent, todo
   list, checkpoints, delegación cloud, Agents window, multi-sesión paralela.
   No todo aplica, pero apply batcheado + `/delegate` es background real que la
   matriz declara inexistente.
8. **Approvals sin guía**: no hay preset documentado de
   `chat.tools.terminal.autoApprove` para los comandos que el flujo SDD corre
   siempre (test runner, openspec CLI), y nadie advierte que YOLO mata el
   `question_gate` (ask_questions auto-skipped).

## Bloque 6 — Target VS Code (orden con dependencias)

### 6.1 `vscode-hooks-enable` (M) ▶ SIGUIENTE

Activar el runtime de hooks existente (Node `scripts/hooks/` + binario Go) bajo
los agent hooks de VS Code (Preview).

- [ ] **QUÉ**: probar en VS Code real el `dist/vscode/hooks/hooks.json` actual y
      medir paridad de payload: mapear los `tool_name`/`tool_input` que emite
      VS Code contra los que espera `scripts/hooks/ospec-hooks-launch.js` y sus
      handlers (`pre-tool-use.js`, etc.); añadir capa de normalización fail-soft
      si difieren. **POR QUÉ**: reactiva AgentShield (secretos), token advisor y
      git collaboration guard en vscode — hoy solo defensa instruccional pasiva.
      **CÓMO se valida**: fixtures de payload VS Code capturados en vivo + tests
      unitarios del adaptador (paridad Go/JS como los existentes); smoke manual
      documentado en el change.
- [ ] **QUÉ**: filtrado interno por `tool_name` en los handlers PreToolUse
      (VS Code parsea matchers tipo `"Edit|Write"` pero **no los aplica**: todo
      hook corre en todo evento). **POR QUÉ**: sin esto el guard corre en cada
      tool call y quema el timeout de 5s en llamadas irrelevantes. **CÓMO**:
      test que inyecta payloads de tools no vigiladas y asserta no-op rápido.
- [ ] **QUÉ**: actualizar `docs/target-capabilities.md` (fila hooks vscode:
      ✅ Preview con flag) y la sección de mitigaciones. **POR QUÉ**: la matriz
      es la fuente que consumen los prompts de degradación. **CÓMO**: el lint
      de contratos existente (I3) cruza hooks.json↔docs; extenderlo.
- [ ] Nota de alcance: es **Preview** ("configuration format and behavior might
      change") → feature-flag en el instalador y en README, no prometer paridad
      total con claude.

### 6.2 `validate-vscode` (S) — depende de nada; puede ir en paralelo con 6.1

- [ ] **QUÉ**: `scripts/configure/validate-vscode.js` + `validate` en el perfil.
      Chequear: (a) frontmatter de agents — `tools` conocidos, `agents`
      allowlist solo referencia agentes emitidos, `model` array con formato
      `"Nombre (vendor)"`, sin `infer` (deprecado); (b) prompts — `agent:`
      resuelve a agente existente; (c) `plugin.json` — `name` kebab-case ≤64
      chars sin `/` ni `:` (fallas silenciosas documentadas); (d) skills —
      `name` kebab-case sin prefijos de namespace; (e) `hooks.json` — solo los
      8 eventos soportados por VS Code; (f) rules — `applyTo` presente.
      **POR QUÉ**: es el único target sin validador y sus modos de falla son
      silenciosos por diseño del loader. **CÓMO**: fixtures golden en
      `scripts/configure/__fixtures__/` + cobertura en `e2e.test.js` /
      `real-repo.test.js` (mismo patrón que validate-codex).

### 6.3 `vscode-installer-modernize` (S) — depende de 6.2 (usa el validador)

- [ ] **QUÉ**: migrar `install-vscode.js` de push-array a **objeto**
      `"chat.pluginLocations": { "<ruta-dist>": true }`, con migración de
      entradas array preexistentes. **POR QUÉ**: es el formato documentado
      vigente; el array es legado (a confirmar si aún se acepta — no asumirlo).
      **CÓMO**: unit test del merge de settings.json (incluye JSONC) + smoke
      manual en stable e Insiders.
- [ ] **QUÉ**: instalar `rules/*.instructions.md` también en
      `.github/instructions/` del repo destino (o `~/.copilot/instructions` en
      modo global), merge no destructivo. **POR QUÉ**: `plugin.json` de VS Code
      no documenta el campo `rules` → riesgo de que las 4 reglas (strict-TDD,
      openspec, common, no-attribution) sean peso muerto. Si se confirma que el
      plugin sí las carga, este paso se vuelve no-op documentado. **CÓMO**:
      test del instalador + verificación manual en el editor de Customizations
      (`Chat: Open Customizations`).
- [ ] **QUÉ**: ofrecer ruta alternativa de instalación vía
      `Chat: Install Plugin From Source` (URL git) en docs. **POR QUÉ**: no toca
      settings.json del usuario y habilita updates. **CÓMO**: doc + prueba manual.

### 6.4 `vscode-marketplace-distribution` (M) — depende de 6.2 + 6.3

- [ ] **QUÉ**: exponer el branch `release` (ya publica artefacto para claude/
      codex) como marketplace consumible con
      `"chat.plugins.marketplaces": ["Snakeblack/ospec-workflow#release"]`
      (formatos aceptados: `owner/repo`, HTTPS, SSH, `file://`), y documentar el
      flujo Extensions view → `@agentPlugins`. **POR QUÉ**: distribución con
      updates y sin editar settings a mano; el mismo bundle sirve para VS Code,
      Copilot CLI y Claude Code (compat triple documentada). **CÓMO**: instalar
      desde el marketplace en un repo limpio y correr un `/sdd-explore` real;
      actualizar README (tabla de targets) y `docs/plugin-installation.md`.

### 6.5 `vscode-parallel-4r` (S) — independiente

- [ ] **QUÉ**: actualizar `docs/target-capabilities.md` (subagentes en paralelo
      vscode: ✅) y la prosa de dispatch de `skills/_shared/gate-4r-review.md`
      para que en vscode los 4 reviewers se despachen en paralelo; revisar
      también la fila "background tasks" a la luz de `/delegate` (6.8).
      **POR QUÉ**: el gate 4R es el más caro del flujo; la doc oficial de
      subagents describe ejecución paralela y el changelog de junio 2026 agrega
      tracking de créditos por subagente. **CÓMO**: corrida manual del gate 4R
      en vscode observando los 4 tool calls colapsables simultáneos + lint de
      docs.

### 6.6 `vscode-handoffs` (S) — depende de 6.2 (el validador chequea los targets)

- [ ] **QUÉ**: añadir `handoffs:` al frontmatter de los agentes user-invocables
      donde el siguiente paso es único y seguro (ej. sdd-verify OK →
      `{label: "Archive change", agent: sdd-archive, prompt: ..., send: false}`;
      sdd-tasks → sdd-apply). Emitirlo solo en el perfil vscode (los otros
      perfiles lo descartan en su transform). **POR QUÉ**: transición de fase
      con un click manteniendo al orquestador como dueño del flujo (`send:
      false` deja al usuario confirmar = gate implícito). **CÓMO**: fixtures del
      transform + prueba manual de los botones.

### 6.7 `vscode-skills-hygiene` (S/M) — depende de 6.2

- [ ] **QUÉ**: auditar `name:` de todas las SKILL.md emitidas (kebab-case puro,
      sin prefijos — los nombres inválidos fallan silenciosamente), añadir
      `user-invocable: false` a las skills internas de fase (sdd-apply, shared)
      y `disable-model-invocation` donde la carga implícita moleste; añadir
      `argument-hint` a los prompts `/sdd-*`. **POR QUÉ**: hoy el disclosure
      progresivo nativo trabaja en contra si una skill interna aparece en el
      menú `/` del usuario o se auto-carga fuera de fase. **CÓMO**: reglas
      nuevas en validate-vscode.js + revisión del menú `/` en vivo.
- [ ] **QUÉ** (opcional, experimental): evaluar `context: fork` (flag
      `github.copilot.chat.skillTool.enabled`) para skills de análisis pesado.
      **POR QUÉ**: aislar contexto sin pasar por el tool `agent`. **CÓMO**:
      experimento documentado; no cablearlo por default (experimental).

### 6.8 `vscode-sessions-integration` (M, exploratorio) — depende de 6.5

- [ ] **QUÉ**: diseñar el uso de delegación cloud/background para batches
      largos de apply: `/delegate` desde sesiones background, "Continue in
      Cloud" del Plan agent, sesiones Claude/Codex de terceros (requieren
      habilitación en la cuenta Copilot). Instruir `#todo`
      (`chat.todoListTool.enabled`) como espejo de `tasks.md` en vscode.
      **POR QUÉ**: la matriz declara "sin background tasks" y hoy es falso;
      apply batcheado es el candidato natural. Restricción dura: los cloud
      agents **no acceden a tools locales ni al runtime del editor** → solo
      fases puras de repo. **CÓMO**: spike con un change real chico; ADR con
      lo que queda dentro/fuera; actualización de la matriz.

### 6.9 `vscode-approvals-and-models-doc` (S) — independiente

- [ ] **QUÉ**: sección en `docs/model-routing.md` (o doc nueva corta) con:
      (a) preset recomendado de `chat.tools.terminal.autoApprove` para los
      comandos del flujo SDD (test runner, `openspec` CLI, git read-only) —
      documentado, NO escrito por el instalador; (b) advertencia explícita:
      con auto-approve global/YOLO (`chat.tools.global.autoApprove`, `/yolo`)
      la tool `ask_questions` devuelve `{"skipped": true}` sin UI → **el
      question_gate se saltea silenciosamente**; (c) requisitos BYOK del
      fallback `(customendpoint)` de models.yaml: entrada en
      `chatLanguageModels.json` con `toolCalling: true` (obligatorio para
      agentes); (d) nota del clamp de cost tier en subagentes. **POR QUÉ**:
      son los tres puntos donde la config del usuario rompe garantías del
      harness sin que nada lo avise. **CÓMO**: revisión doc + reproducción
      manual del skip de ask_questions bajo YOLO.

### 6.10 `vscode-agent-scoped-hooks` (S, gated Preview) — depende de 6.1

- [ ] **QUÉ**: usar el campo `hooks:` del frontmatter de `.agent.md` (preview,
      flag `chat.useCustomAgentHooks`) para acotar el guard de strict-TDD
      (PreToolUse sobre edits) a `sdd-apply`/`sdd-verify` en lugar de correr
      global. **POR QUÉ**: menos falsos positivos y menos latencia de hook en
      fases de solo lectura; hoy en claude el guard es global por diseño del
      hooks.json plano. **CÓMO**: fixtures del transform (inyección por perfil)
      + smoke con el flag activado; item explícitamente gated a que la feature
      salga de preview o se acepte el riesgo.

**Dependencias**: 6.1 y 6.2 son la base y van primero (paralelizables entre sí);
6.3→6.4 encadenan la distribución; 6.5, 6.6, 6.7 y 6.9 son independientes tras
6.2; 6.8 y 6.10 son los especulativos y cierran el bloque.

## Gotchas registrados (verificados 2026-07-10)

- **Hooks es Preview**: "Agent hooks are currently in Preview. The configuration
  format and behavior might change in future releases" (header de la doc).
  Feature-flag y tolerancia a cambio de formato.
- **Matchers ignorados**: VS Code parsea matchers estilo Claude (`"Edit|Write"`)
  pero "parsed but not applied. All hooks run on every matching event" → el
  filtrado por tool es responsabilidad del runtime del harness.
- **Eventos**: VS Code soporta los 8 (`SessionStart`, `UserPromptSubmit`,
  `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`,
  `Stop`). Tiene `SubagentStart` (Claude Code no); no tiene `Notification` ni
  `SessionEnd`. Los 5 que usa el harness están cubiertos.
- **`chat.pluginLocations` es objeto** ruta→bool en la doc vigente; el
  instalador escribe array (a confirmar si el array legado sigue aceptado).
- **Fallas silenciosas del loader de plugins**: nombre de plugin con `/`, `:` o
  caracteres especiales → no carga sin error; nombre de skill con prefijo de
  namespace → no carga sin error; MCP servers de plugin → confiados
  implícitamente al instalar (sin trust prompt).
- **`rules` no es campo documentado de plugin.json** (solo `skills`, `agents`,
  `hooks`, `mcpServers`; los slash commands se cargan pero sin campo propio
  documentado) → las instructions del plugin pueden no cargarse en vscode
  (mitigación 6.3; a confirmar contra el código del loader).
- **YOLO mata el question_gate**: con auto-approve global, `ask_questions`
  retorna `{"skipped": true}` sin mostrar UI (issue vscode-copilot-release
  #14123). No hay mitigación técnica hoy — solo advertencia (6.9).
- **Cost tier clamp**: "The requested model cannot exceed the cost tier of the
  main model" — si el usuario corre el orquestador en un modelo barato, los
  fallback premium de `models.yaml` para sdd-design/sdd-verify se degradan.
- **Anidamiento de subagentes off por default**
  (`chat.subagents.allowInvocationsFromSubagents`, máx. 5 niveles). No subirlo:
  el executor boundary del harness ya prohíbe anidar, y el orquestador como
  agente principal no lo necesita.
- **Límite de 128 tools por request**; con muchos MCP entra el agrupamiento de
  virtual tools (`github.copilot.chat.virtualTools.threshold`).
- **`infer` deprecado** en custom agents → no emitirlo; usar `user-invocable` +
  `disable-model-invocation`.
- **Cloud agents sin tools locales**: "cannot directly access VS Code built-in
  tools and run-time context"; agentes cloud de terceros (Claude/Codex)
  requieren habilitación en la cuenta Copilot.
- **Prompt files NO deprecados** (a diferencia de Codex, donde los custom
  prompts sí lo están): conviven con skills como slash commands.
- **Flags experimentales citados**: `chat.useCustomAgentHooks` (hooks por
  agente), `github.copilot.chat.skillTool.enabled` (`context: fork`),
  `chat.useNestedAgentsMdFiles` (AGENTS.md anidados),
  `chat.mcp.autoStart`, `chat.useCustomizationsInParentRepositories`
  (monorepos), sandbox de agente (`chat.agent.sandbox.*`, org-managed).
- **dist/vscode local puede quedar stale** (se vio `2.20.2` con arrays de
  modelos viejos frente a `models.yaml` actual): regenerar siempre antes de
  probar (regla de memoria: los tests de dist se auto-generan, nunca leen
  `ROOT/dist`).

### A confirmar (no verificable solo con la doc)

- Si `chat.pluginLocations` en formato array sigue siendo aceptado (la doc solo
  muestra objeto).
- Si el loader de plugins de VS Code carga `commands/` y `rules/` de un plugin
  formato Claude (los slash commands aparecen como contenido soportado en la
  intro de la doc de plugins, pero el manifiesto no documenta esos campos;
  `rules` no aparece en absoluto). Verificar contra el código de
  `vscode-copilot-chat` o empíricamente.
- El shape exacto de `tool_name`/`tool_input` que VS Code pasa por stdin a los
  hooks (¿ids de tool de VS Code como `read/problems` o nombres estilo Claude?)
  — bloqueante de diseño para 6.1, se resuelve capturando payloads en vivo.
- Si los hooks de plugin corren también para subagentes (la doc no lo niega;
  `SubagentStart`/`SubagentStop` existen como eventos, pero no se especifica el
  contexto de ejecución de PreToolUse dentro de un subagente).

## Fuentes (consultadas 2026-07-10)

Consultadas directamente:

- https://code.visualstudio.com/docs/copilot/customization/overview (índice de customización; estados estable/preview)
- https://code.visualstudio.com/docs/copilot/customization/custom-agents → canónica en /docs/agent-customization/custom-agents (frontmatter completo, handoffs, deprecación de infer, formato Claude en .claude/agents)
- https://code.visualstudio.com/docs/agent-customization/hooks (eventos, payload, exit codes, permissionDecision, plugins, matchers ignorados, Preview)
- https://code.visualstudio.com/docs/agent-customization/agent-skills (discovery, disclosure, context: fork, agentskills.io)
- https://code.visualstudio.com/docs/agent-customization/agent-plugins (manifiestos, chat.pluginLocations, marketplaces, ${CLAUDE_PLUGIN_ROOT}, fallas silenciosas)
- https://raw.githubusercontent.com/microsoft/vscode-docs/main/docs/agent-customization/agent-plugins.md (verificación de campos del manifiesto)
- https://code.visualstudio.com/docs/agent-customization/prompt-files (frontmatter, ${input:}, routing agent:)
- https://code.visualstudio.com/docs/agent-customization/custom-instructions (applyTo, AGENTS.md/CLAUDE.md, precedencia, settings)
- https://code.visualstudio.com/docs/agent-customization/mcp-servers (config, ${input:}, gallery, sandbox, trust)
- https://code.visualstudio.com/docs/copilot/agents/subagents (runSubagent, paralelo, aislamiento, cost tier, nesting)
- https://code.visualstudio.com/docs/agents/approvals (terminal/global/URL autoApprove, sandbox org-managed, comandos de gestión)
- https://code.visualstudio.com/docs/chat/chat-tools (tool sets .jsonc, #tools, límite 128, virtual tools)
- https://code.visualstudio.com/docs/copilot/customization/language-models (BYOK, vendors, chatLanguageModels.json, utility models)
- https://code.visualstudio.com/docs/copilot/agents/cloud-agents (/delegate, Continue in Cloud, límites de tools locales)
- https://code.visualstudio.com/docs/agents/planning (Plan agent, chat.planAgent.defaultModel, memoria de sesión)
- https://github.blog/changelog/2026-07-08-github-copilot-in-visual-studio-code-june-2026-releases/ (v1.123–v1.127: paralelo GA, multi-chat, créditos por subagente, browser tools GA)
- https://github.blog/changelog/2026-06-03-github-copilot-in-visual-studio-code-may-releases/ (Agents window, remote agents, AHP, session sync, /chronicle, BYOK air-gapped)

Vía resultados de búsqueda (citadas, no fetcheadas en full):

- https://code.visualstudio.com/docs/copilot/chat/chat-checkpoints (`chat.checkpoints.enabled`)
- https://code.visualstudio.com/updates/v1_103 (`chat.todoListTool.enabled`, #todo)
- https://github.com/microsoft/vscode-copilot-release/issues/14123 (ask_questions + auto-approve → skipped)
- https://code.visualstudio.com/blogs/2026/02/05/multi-agent-development y https://code.visualstudio.com/blogs/2025/11/03/unified-agent-experience (contexto multi-agente/Agent HQ)
