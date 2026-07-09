# Roadmap — target Codex (OpenAI Codex CLI)

> Iniciativa: que `ospec-workflow` funcione como quinto target del generador
> multi-target (`claude`, `vscode`, `github-copilot`, `opencode`, **`codex`**).
> Investigación de documentación oficial hecha el 2026-07-08 sobre
> https://developers.openai.com/codex (config-reference, skills, subagents,
> plugins/build, custom-prompts).
>
> **Protocolo de actualización**: igual que `roadmap-evolucion-harness.md`
> (checkboxes, puntero ▶ SIGUIENTE, gotchas acá y no en archivos aparte).

## Por qué Codex es un target natural (hallazgos clave)

Codex CLI convergió fuertemente con el modelo de Claude Code; casi todo el
harness tiene equivalente directo:

| Pieza ospec | Equivalente Codex | Notas |
| --- | --- | --- |
| `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` | Manifiesto casi isomorfo: campos `skills`, `mcpServers`, `hooks`, `apps`, `interface`. Marketplace propio: `codex plugin marketplace add <git>#branch`. |
| `skills/` (SKILL.md) | Agent Skills nativos | Mismo estándar SKILL.md (`name` + `description`). Invocación explícita `$skill-name` o implícita por descripción. Progressive disclosure: solo nombre+descripción en contexto (~2% cap). |
| `commands/*.prompt.md` | **Skills** (no prompts) | Los custom prompts (`~/.codex/prompts/`) están **deprecados**; OpenAI recomienda skills para prompts reutilizables. Cada `/sdd-*` se emite como skill invocable `$sdd-*`. |
| `agents/*.agent.md` | `.codex/agents/<name>.toml` (repo) o `~/.codex/agents/` (global) | TOML con `name`, `description`, `developer_instructions` + cualquier clave de config.toml (`model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config`). **El plugin NO puede empaquetar agentes** → van aparte vía instalador. |
| Subagentes / Task tool | Subagent workflows nativos | El padre invoca agentes por nombre; `agents.max_depth = 1` (default) basta para orquestador→fase; `agents.max_threads = 6`. Codex solo spawnea subagentes cuando se le pide explícitamente → las instrucciones del orquestador deben pedirlo. |
| `hooks/hooks.json` | Hooks de lifecycle | Eventos casi idénticos a Claude: `PreToolUse`, `PostToolUse`, `SessionStart`, `SubagentStart`, `SubagentStop`, `UserPromptSubmit`, `Stop`, `PreCompact`, `PostCompact`, `PermissionRequest`. Config en TOML (`[[hooks.X]]`) o bundle de plugin (`hooks/hooks.json`). Env vars del plugin: `PLUGIN_ROOT`, `PLUGIN_DATA`. |
| `.mcp.json` | `[mcp_servers.<id>]` / `.mcp.json` de plugin | El manifiesto de plugin apunta a `.mcp.json` directamente. |
| `CLAUDE.md` / `AGENTS.md` | `AGENTS.md` nativo | Codex lee `AGENTS.md` en capas (global → repo → subcarpeta) sin configuración. La plantilla agnóstica ya existe en el repo. |
| `models.yaml` (tiers) | `model` + `model_reasoning_effort` por agente | Encaja con la familia GPT-5.6 (Sol/Terra/Luna, release 2026-07-09): Sol→premium, Terra→default, Luna→cheap. |
| `rules/*.instructions.md` | Sin array "instructions" nativo | Decisión de diseño en 5.1: fusionar en `AGENTS.md` emitido, o inyectar en `developer_instructions` de cada agente. |
| `AskUserQuestion` / `question` | **Sin tool estructurada de preguntas** | El `question_gate` degrada a protocolo de chat (texto numerado), como ya se contempla para hosts sin ask-tool. |

## Bloque 5 — Target Codex (4 changes, orden con dependencias)

### 5.1 `codex-target-profile` (L) — el generador

Nuevo perfil declarativo `scripts/lib/target-profiles/codex.js` consumido por
`target-transform.js`, layout "codex-plugin" (el más cercano a `claude`):

- [x] Bundle de plugin: `.codex-plugin/plugin.json` (generado desde el manifiesto
      canónico) + `skills/` + `.mcp.json`; metadata `interface` (displayName, icons).
- [x] Agents: transform nuevo **markdown→TOML** (`agents/*.agent.md` →
      `.codex/agents/<name>.toml`): frontmatter → `name`/`description`, cuerpo →
      `developer_instructions`, modelo/tier desde `models.yaml` (columna `codex`,
      ver 5.4) + `model_reasoning_effort`, `sandbox_mode` según capacidades del
      agente (read-only para reviewers 4R, workspace-write para apply/verify).
- [x] Commands: cada `commands/*.prompt.md` → skill `skills/commands/<name>/SKILL.md`
      invocable `$sdd-*` (prompts deprecados — no invertir ahí). El routing
      `agent:` se traduce a instrucción explícita de spawn del agente de fase.
      Args nombrados `${input:x}` → posicionales `$1`/`$ARGUMENTS` (mismo estilo
      que opencode).
- [x] Rules: decisión de diseño (AGENTS.md emitido vs `developer_instructions`);
      documentarla como ADR del change (ADR-001).
- [x] `question_gate` degradado a chat (sin ask-tool en Codex): reusar el patrón
      de degradación existente, declarado en el perfil.
- [x] `scripts/configure/validate-codex.js` + fixtures golden en
      `scripts/configure/__fixtures__/` + cobertura en `e2e.test.js` /
      `real-repo.test.js`.

### 5.2 `codex-hooks-bridge` (M) — runtime de hooks

- [x] Conversión `hooks/hooks.json` → formato de hooks de Codex (verificar en
      diseño el schema exacto del bundle de plugin `hooks/hooks.json` vs el TOML
      `[[hooks.X]]` de config — la doc muestra ambos). Mapeo de eventos ~1:1
      (mismos nombres PascalCase que Claude); `${CLAUDE_PLUGIN_ROOT}` → `$PLUGIN_ROOT`.
- [x] Adaptar el runtime (Node `scripts/hooks/` + binario Go) al shape del
      payload stdin de Codex; tests de paridad Go/JS como los existentes.
- [x] Presupuestos/timeouts coherentes (el lint de contratos I3 ya cruza
      hooks.json↔constantes; extenderlo al artefacto codex).

### 5.3 `codex-installer` (M) — instalación y distribución

- [x] `npm run setup:codex` / `install:codex -- <repo>`: compila a `dist/codex`,
      instala el plugin (marketplace local o `codex plugin marketplace add`),
      y copia los TOML de agentes a `~/.codex/agents/` (global) o `.codex/agents/`
      (local) — paso separado porque el plugin no los empaqueta.
- [x] Merge no destructivo de `.codex/config.toml` del repo destino (límites
      `[agents]`, `skills.config`) sin pisar config del usuario (mismo criterio
      que el merge de `mcp-config.json` de copilot).
- [x] Entrada de marketplace en el branch `release` + docs: README (tabla de
      targets) y `docs/plugin-installation.md`.

### 5.4 `codex-models-column` (S) — modelos GPT-5.6 [gated: release del 2026-07-09]

- [x] Columna `codex` en `models.yaml`: `premium: gpt-5.6-sol`,
      `default: gpt-5.6-terra`, `cheap: gpt-5.6-luna` (slugs exactos a confirmar
      el día del release) + `model_reasoning_effort` por tier.
- [x] **Gate obligatorio** (regla ya declarada en `models.yaml`): correr la suite
      golden de `scripts/evals/` contra los candidatos y adjuntar el resultado
      N/7 al change (tests unitarios/assertions de la suite validados).

**Dependencias**: 5.1 es la base; 5.2 y 5.4 pueden ir en paralelo tras 5.1;
5.3 cierra (necesita 5.1+5.2 para tener algo instalable). 5.4 está gateado por
la disponibilidad real de GPT-5.6. (Bloque 5 Completado de manera exitosa).

## Gotchas registrados (de la investigación 2026-07-08)

- **Custom prompts deprecados** en Codex — el vehículo de comandos son skills
  (`$name`); no emitir a `~/.codex/prompts/`.
- **El plugin no empaqueta agentes**: `.codex-plugin/plugin.json` solo acepta
  `skills`/`mcpServers`/`apps`/`hooks`. Los agentes viven en `.codex/agents/`
  (repo) o `~/.codex/agents/` (usuario) → responsabilidad del instalador (5.3).
- **Codex no spawnea subagentes proactivamente**: solo cuando se le pide. Las
  instrucciones del orquestador deben ordenar el spawn por nombre de agente.
- **`agents.max_depth = 1`** (default) es suficiente y no debe subirse (la doc
  advierte fan-out repetido de tokens).
- **Progressive disclosure de skills**: con muchas skills instaladas las
  descripciones se recortan (~2% del contexto) → descripciones front-loaded con
  trigger words al principio.
- **Discovery de skills**: repo-level en `.agents/skills/` (no `.codex/skills/`);
  user-level en `~/.agents/skills/`. El plugin las lleva dentro de su bundle.
- **Sin ask-tool estructurada**: `question_gate` degrada a chat plano en este
  target.
- Schema exacto del `hooks/hooks.json` de plugin: verificado y archivado en
  `openspec/changes/archive/2026-07-09-codex-hooks-bridge/`; el target emite
  eventos PascalCase y rutas `$PLUGIN_ROOT` entrecomilladas.

## Fuentes

- https://developers.openai.com/codex/config-reference
- https://developers.openai.com/codex/skills
- https://developers.openai.com/codex/subagents
- https://developers.openai.com/codex/plugins/build
- https://developers.openai.com/codex/custom-prompts (deprecación)
- https://developers.openai.com/codex/guides/agents-md
