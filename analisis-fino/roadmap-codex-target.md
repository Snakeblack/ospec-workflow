# Roadmap — target Codex (OpenAI Codex CLI)

> **Punto de entrada operativo:** antes de continuar este roadmap, leer
> [`docs/codex/README.md`](../docs/codex/README.md). Allí se separan los hechos
> confirmados en Codex CLI real, el orden mínimo de lectura y los criterios de
> aceptación de `codex-target-phase-2`. Este archivo conserva planificación,
> gaps e hipótesis; no es por sí solo el contrato de implementación.

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

## Fase 2 — Explotación profunda del target (investigación 2026-07-10)

> **Aviso previo**: la doc oficial se MUDÓ. Todas las URLs `developers.openai.com/codex/*`
> ahora responden **308 → `learn.chatgpt.com/docs/*`** (verificado 2026-07-10). Las
> fuentes del Bloque 5 siguen resolviendo por redirect, pero los links nuevos deben
> apuntar al host nuevo.

### Hallazgos nuevos (capacidad Codex ↔ estado en el harness ↔ oportunidad)

| Capacidad Codex (verificada) | Estado actual en el harness | Oportunidad |
| --- | --- | --- |
| **Hooks con decision control**: `PreToolUse` puede bloquear (`exit 2` + stderr, o JSON `"permissionDecision": "deny"`) y **reescribir** la tool call (`"permissionDecision": "allow"` + `"updatedInput"`). `PermissionRequest` auto-aprueba/deniega con `"behavior": "allow"/"deny"`. `PostToolUse` puede reemplazar el output (`"decision": "block"` + `"continue": false`). 11 eventos vigentes: SessionStart, SubagentStart, PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, UserPromptSubmit, SubagentStop, Stop. [hooks doc] | El bridge (5.2) puentea solo los 5 eventos del hooks.json canónico (SessionStart, PreToolUse, PreCompact, SubagentStop, Stop). El runtime `pre-tool-use.js` ya emite decisiones estilo Claude — la paridad de campos con Codex no está testeada contra este shape. | Deny-rules (rm -rf /, force-push, curl\|sh) y secret-scan funcionan como **bloqueo real** en Codex, no solo advisory. Sumar PermissionRequest para auto-denegar escalaciones fuera del sandbox del agente 4R. |
| **Schema de hooks.json con matcher anidado**: la doc actual muestra `{"hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [...]}]}}` — entrada envuelta en matcher con array `hooks` interno. [hooks doc] | `codexHooks` emite entradas **planas** (`{type, command, timeout}` directo en el array del evento), shape verificado el 2026-07-09. | Verificar si el shape plano sigue aceptado o si hubo cambio de schema entre 0.142 y 0.144; adaptar transform + validador si aplica. **A confirmar** con CLI real. |
| **`codex exec` (modo headless)**: `--json` (JSONL de eventos), `--output-schema <path>` (respuesta final validada contra JSON Schema), `--output-last-message/-o`, `--sandbox`, `--ephemeral` (no persiste sesión), `-m`, `--ignore-user-config`, `--ignore-rules`, `CODEX_API_KEY` inline. Resume headless: `codex exec resume --last "<task>"` o `codex exec resume <SESSION_ID>`. [non-interactive-mode] | Cero uso. El flujo release solo registra el marketplace en CI; ningún gate SDD corre headless. | **Gate sdd-verify/4R en CI**: correr verificación con `--output-schema` (veredicto estructurado parseable) sin depender de sesión interactiva. |
| **GitHub Action oficial `openai/codex-action@v1`**: inputs `prompt`/`prompt-file`, `openai-api-key`, `output-file`, `model`, `effort`, `sandbox`, `safety-strategy` (`drop-sudo`/`unprivileged-user`/`unsafe`), `codex-args`. Patrón documentado: review de PR con prompt-file + comment vía github-script. [github-action] | No usado. `publish-marketplace.yml` no ejecuta Codex. | Workflow de PR que corre el gate de verificación SDD como acción nativa. Si plugins/skills cargan en el action: **a confirmar** (la doc no lo dice). |
| **Config por agente ampliada** en `.codex/agents/*.toml`: además de `model`/`model_reasoning_effort`/`sandbox_mode`, acepta `model_verbosity` (`low\|medium\|high`), `approval_policy` (incl. forma granular `{ granular = { sandbox_approval, rules, mcp_elicitations, request_permissions, skill_approval } }`), tabla `mcp_servers`, tabla `tools`, y `sandbox_workspace_write.network_access` / `writable_roots`. `model_reasoning_effort` enum vigente: `minimal\|low\|medium\|high\|xhigh`. [config-reference] | `handleAgentToml` (target-transform.js:464-478) emite solo `model` + `model_reasoning_effort`. **`model_verbosity` está declarado en models.yaml (columna codex) pero nunca se emite** — gap real ya presente en el repo. | Emitir `model_verbosity`; endurecer agentes write-capable con `network_access = false` y `approval_policy`; recortar `mcp_servers`/`tools` por agente (los 4R no necesitan MCP de escritura). |
| **`[agents]` con claves reales**: `agents.max_depth`, `agents.max_threads`, `agents.<name>.config_file`, `agents.<name>.description`, `agents.<name>.nickname_candidates`, `agents.interrupt_message`. `skills.config` = **array de objetos** `{path, enabled}` (no string glob). [config-reference] | fix-codex-config-toml (PR #52) retiró el config generado porque usaba claves inexistentes (`max_output_tokens`, `max_tool_calls`) y `skills.config` como string. `dist/codex/.codex/config.toml` actual es residuo stale pre-fix (el generador ya no lo emite y el validador lo prohíbe). | Ahora sí hay claves soportadas para tunear el fan-out 4R (`max_threads ≥ 5`: orquestador + 4 reviewers). Reintroducir config de **proyecto** es viable pero requiere decisión de producto (ADR de PR #52 dice no tocar config del usuario — un `.codex/config.toml` de repo destino es distinto de `~/.codex/config.toml`). |
| **Marketplace npm + plugins remotos por defecto** (CLI 0.143.0, 2026-07-08): `marketplace.json` acepta `"source": "npm"` con `package`/`version`/`registry`, además de `local`, `url` y `git-subdir` (con `ref`/`sha`). Remote plugins habilitados por default. [changelog, build-plugins] | El marketplace release usa `source: local` + git sparse (`--ref release --sparse ...`), frágil y con paso manual `/plugins`. | Publicar el plugin como paquete npm: instalación en una línea sin sparse-checkout. |
| **`apps` = conectores, no UI**: `.app.json` en la raíz del plugin "apunta a uno o más connectors" (GitHub, Slack, Google Drive...) para leer/actuar en esas herramientas. Nuevo modo de aprobación `writes` para apps (CLI 0.144.0). [build-plugins, changelog] | Pasamos `apps` por el allowlist sin usarlo. | **Descartar la idea de "UI de estado SDD" vía apps** — no son superficies de UI. Uso plausible futuro: connector GitHub para el flujo de PRs del harness. Schema exacto de `.app.json`: **a confirmar**. |
| **`interface` enriquecido** en plugin.json: `shortDescription`, `longDescription`, `developerName`, `category`, `capabilities`, `defaultPrompt` (prompts de arranque), `brandColor`, `composerIcon`, `logo`, `screenshots`, URLs legales. Dark-mode logo (0.142.2). [build-plugins, changelog] | Solo emitimos `displayName` + `icon`. | Card de marketplace competitiva + `defaultPrompt` apuntando a `$sdd-new`/`$sdd-onboard` (onboarding de usuario nuevo gratis). |
| **Review nativo `/review`**: review de calidad completa sobre el trabajo actual; no steerable (sin focus text custom). Existe hasta plugin oficial para invocarlo desde Claude Code (`openai/codex-plugin-cc`). Codex Desktop (2026-07-09) integra review de PRs en sidebar. [changelog, github openai/codex-plugin-cc] | El gate 4R es nuestro; ninguna mención a `/review` en lo emitido. | No compite: `/review` es genérico y no steerable; el 4R es estructurado por dimensión con evidencia. Encaja como **pre-gate barato opcional** antes de gastar 4 subagentes. |
| **Sesiones**: resume headless (`codex exec resume`), `--ephemeral`, y fork de historia por turnos vía app-server (0.143.0: "inspect environments and fork history through specific turns"). [non-interactive-mode, changelog] | No documentado en nuestros docs de target. | Fases SDD largas: documentar resume por SESSION_ID para retomar apply/verify interrumpidos sin re-contexto. |
| **MCP ampliado**: `bearer_token_env_var`, `auth = "oauth"\|"chatgpt"`, `enabled_tools`/`disabled_tools`, `default_tools_approval_mode` (`auto\|prompt\|writes\|approve`), timeouts, `${VAR}`. MCP auth interactiva sin flag experimental (0.144.0). Tool search por default para MCP tools (0.143.0). [config-reference, changelog] | `.mcp.json` con env-expansion `${VAR}` ya alineado. | Bajo impacto inmediato; anotar `default_tools_approval_mode` como palanca si sumamos MCP servers de escritura. |
| **Modelos GPT-5.6**: el changelog 0.143.0 confirma la familia **Sol/Terra/Luna** (vía Bedrock) y soporte first-class de reasoning effort `max` allí; el config-reference lista el enum `...\|high\|xhigh`. [changelog, config-reference] | Columna codex fijada 2026-07-09: `gpt-5.6-sol/terra/luna` + efforts `high/medium/medium`. | Los nombres de familia siguen vigentes; los **slugs exactos** como valor de `model` en CLI directa (no Bedrock) siguen sin confirmación primaria hoy — **a confirmar** antes de tocar nada. La discrepancia `max` vs `xhigh` también. |

### Qué no estamos aprovechando

1. **Decision control de hooks** — la capa de seguridad (`DENY_RULES`, secret-scan, no-attribution) ya produce decisiones; en Codex serían bloqueo real vía `permissionDecision`, pero nunca validamos el contrato de campos contra el host Codex ni puenteamos `PermissionRequest`/`PostToolUse`/`UserPromptSubmit`.
2. **`model_verbosity`** — dato ya presente en `models.yaml` que el transform tira al piso (gap interno, cero riesgo).
3. **Headless total** — `codex exec --output-schema` + `openai/codex-action@v1` habilitan el gate sdd-verify en CI; hoy el target Codex es 100% interactivo.
4. **Sandbox de grano fino** — emitimos solo `sandbox_mode`; no usamos `network_access`, `writable_roots` ni `approval_policy` granular por agente (los 4R podrían auto-denegar toda escalación).
5. **Distribución npm** — seguimos en git sparse + `/plugins` manual cuando 0.143 habilitó marketplaces npm y plugins remotos por default.
6. **`interface` mínimo** — sin `defaultPrompt`, categoría ni branding; el plugin se ve pobre en el catálogo enriquecido de 0.143.
7. **`apps`** — evaluado y **descartado** para UI de estado SDD (son conectores a servicios externos, no superficies de render).

### Bloque 6 — Codex fase 2

**Dependencias**: 6.1 y 6.4 son independientes (solo generador). 6.2 requiere validación con CLI real (gotcha del schema). 6.3 depende de 6.2 solo si el gate CI usa hooks; si no, es independiente. 6.5 requiere decisión de producto previa. 6.6 y 6.7 son independientes; 6.8 cierra con docs.

- [ ] **6.1 (S) ▶ SIGUIENTE — Emitir `model_verbosity` en el TOML de agentes.**
      QUÉ: `scripts/lib/target-transform.js` (`handleAgentToml`, junto a la rama
      `model_reasoning_effort` de las líneas ~475-477) + golden fixtures de
      `scripts/configure/__fixtures__/golden/codex/`. POR QUÉ: clave documentada
      (`low|medium|high`, config-reference) ya declarada en la columna codex de
      `models.yaml` y silenciosamente descartada; `verbosity: low` en tier cheap
      recorta coste de output en explore/archive. CÓMO SE VALIDA: caso nuevo en
      `target-transform.test.js` (presente cuando la columna lo trae, ausente
      fail-soft cuando no) + regenerar goldens + `validate-codex.js` verde.
- [ ] **6.2 (M) — Hooks bridge fase 2: schema vigente + decision control.**
      QUÉ: `scripts/lib/target-transform.js` (`codexHooks`) y
      `scripts/configure/validate-codex.js` (validateHooks): confirmar contra CLI
      real (≥0.144) si el shape plano sigue aceptado o si el bundle exige el
      wrapper `{matcher, hooks:[...]}`; puentear `PostToolUse`, `UserPromptSubmit`
      y `PermissionRequest` (el runtime Node/Go ya tiene handlers equivalentes en
      `scripts/hooks/`); test de paridad del JSON de decisión
      (`permissionDecision`/`updatedInput`/`behavior`) contra el contrato Codex.
      POR QUÉ: convierte deny-rules y secret-scan en bloqueo real (hoy el bridge
      cubre 5/11 eventos y el decision control está sin verificar). CÓMO SE
      VALIDA: tests de paridad Go/JS existentes extendidos + sesión manual con
      `codex --version` ≥0.144 disparando una deny-rule y verificando el bloqueo.
- [ ] **6.3 (M) — Gate SDD headless en CI (`codex exec` + `openai/codex-action@v1`).**
      QUÉ: nuevo workflow `.github/workflows/sdd-verify-gate.yml` (o job en el
      existente) que corre el prompt de verificación con `--output-schema`
      (veredicto JSON: pass/fail + findings) y postea el resultado en el PR;
      prompt en `.github/codex/prompts/`. POR QUÉ: `codex exec --json
      --output-schema` y el action oficial existen justo para esto; hoy ningún
      gate SDD corre sin humano. CÓMO SE VALIDA: PR de prueba donde el gate falla
      con un finding sembrado y pasa tras corregirlo; **antes** confirmar si el
      action carga plugin/skills o si el prompt debe ser autocontenido (a
      confirmar, la doc no lo dice).
- [ ] **6.4 (S) — Sandbox de grano fino por capacidad de agente.**
      QUÉ: `scripts/lib/target-profiles/codex.js` (`sandboxByCapability` →
      extender el shape) + `handleAgentToml` para emitir en los 4R
      `approval_policy = "never"` (o granular con `request_permissions` denegado)
      y en apply/verify `sandbox_workspace_write.network_access = false`;
      actualizar `REQUIRED_TOML_KEYS`/checks en `validate-codex.js`. POR QUÉ:
      claves per-agent documentadas; los reviewers 4R son read-only por diseño y
      no deben poder escalar; apply/verify no necesitan red para TDD local.
      CÓMO SE VALIDA: unit tests del transform + goldens + validador; smoke
      manual con un 4R intentando escribir (debe fallar sin prompt de escalación).
- [ ] **6.5 (S) — Config de proyecto `.codex/config.toml` con claves soportadas [gated: decisión de producto].**
      QUÉ: reintroducir en `scripts/configure/install-codex.js` (solo modo
      repo-install) la escritura de un `.codex/config.toml` del repo destino con
      `agents.max_threads = 6` (fan-out 4R: orquestador + 4 reviewers + margen) y
      `agents.max_depth = 1`, con merge no destructivo; levantar la prohibición
      en `validate-codex.js` FORBIDDEN_PATHS solo para este artefacto. POR QUÉ:
      ahora existen claves reales (`max_threads`/`max_depth`, config-reference) —
      lo que PR #52 retiró eran claves inventadas; el ADR de "no tocar config del
      usuario" aplica a `~/.codex/config.toml`, no al del repo destino. CÓMO SE
      VALIDA: ADR nuevo que revise el de PR #52 + tests de merge idempotente +
      sesión Codex real confirmando que los 4 reviewers corren en paralelo.
- [ ] **6.6 (S) — Distribución npm del plugin.**
      QUÉ: `scripts/configure/codex-marketplace.js` + `publish-marketplace.yml`:
      entrada adicional (o alternativa) `"source": "npm"` con `package`/`version`
      publicando el payload como paquete; docs de instalación en una línea.
      POR QUÉ: 0.143.0 habilitó marketplaces npm y plugins remotos por default;
      elimina el sparse-checkout frágil de `--ref release`. CÓMO SE VALIDA:
      `codex plugin marketplace add` contra el paquete publicado en un home
      aislado + `/plugins` mostrando la card.
- [ ] **6.7 (S) — `interface` enriquecido + `defaultPrompt`.**
      QUÉ: bloque `manifest.interface` en `scripts/lib/target-profiles/codex.js`:
      `shortDescription`, `category`, `capabilities`, `defaultPrompt` (arranques
      `$sdd-onboard` / `$sdd-new`), `brandColor`, logo dark-mode. POR QUÉ: campos
      documentados en build-plugins; el catálogo 0.143 muestra rows enriquecidas
      y hoy nuestra card solo tiene displayName+icon; `defaultPrompt` es
      onboarding gratis hacia el flujo SDD. CÓMO SE VALIDA: golden del
      plugin.json + allowlist del validador (interface ya permitido) + card
      visible en `/plugins`.
- [ ] **6.8 (S) — Docs de operación: sesiones, review nativo y headless.**
      QUÉ: `docs/plugin-installation.md` (sección "Operar el target Codex"):
      `codex exec resume --last`/`<SESSION_ID>` para retomar fases largas,
      `--ephemeral` para corridas desechables, `/review` nativo como pre-gate
      barato ANTES del 4R (posicionamiento: no lo reemplaza — no es steerable),
      y actualización de TODAS las URLs de fuentes al host `learn.chatgpt.com`.
      POR QUÉ: capacidades verificadas sin superficie en nuestros docs; el
      redirect 308 deja las fuentes del Bloque 5 en estado frágil. CÓMO SE
      VALIDA: revisión de docs + links devolviendo 200 sin redirect.

### Gotchas nuevos (2026-07-10)

- **La doc se mudó de host**: `developers.openai.com/codex/*` → 308 →
  `learn.chatgpt.com/docs/*`. Los redirects hoy funcionan, pero cualquier
  fetch/lint de fuentes debe usar el host nuevo (rutas también renombradas, ej.
  `/codex/config-reference` → `/docs/config-file/config-reference`,
  `/codex/noninteractive` → `/docs/non-interactive-mode`).
- **Posible cambio de schema en hooks.json de plugin**: la doc vigente muestra
  entradas con wrapper `{"matcher": ..., "hooks": [...]}`; nuestro bridge emite
  el shape plano verificado el 2026-07-09. No asumir compatibilidad: probar con
  CLI ≥0.144 antes de tocar (o de no tocar) `codexHooks`.
- **`skills.config` es array de objetos** `{path, enabled}`, no string glob —
  el `dist/codex/.codex/config.toml` residual (build stale pre-PR #52) tiene el
  formato viejo e inválido; regenerar dist antes de cualquier smoke manual.
- **`apps` no es UI**: son conectores a servicios (GitHub/Slack/Drive). No
  invertir en "panel de estado SDD" por esa vía.
- **Enum de reasoning effort divergente**: config-reference lista
  `minimal|low|medium|high|xhigh`; el changelog 0.143 menciona effort `max`
  first-class en Bedrock. No emitir `xhigh`/`max` hasta confirmar cuál aplica a
  la CLI directa.
- **Slugs GPT-5.6 sin confirmación primaria**: la familia Sol/Terra/Luna sigue
  vigente (changelog 0.143), pero los strings exactos `gpt-5.6-sol/terra/luna`
  como valor de `model` en CLI directa no aparecen citados en las páginas
  fetcheadas hoy — mantener la regla del gate de evals antes de cualquier bump.
- **Instalación de plugins sigue interactiva**: ningún comando headless de
  install documentado (se mantiene el gotcha de PR #52); el action de GitHub no
  documenta carga de plugins — el gate CI (6.3) debe planear prompt
  autocontenido como fallback.

### Fuentes (fase 2)

Verificadas por fetch directo el 2026-07-10:

- https://learn.chatgpt.com/docs/config-file/config-reference — claves por
  agente (`model_verbosity`, `approval_policy` granular, `mcp_servers`, `tools`),
  `[agents]` (`max_depth`, `max_threads`, `config_file`, `nickname_candidates`,
  `interrupt_message`), sandbox (`network_access`, `writable_roots`),
  `skills.config` array, MCP (`bearer_token_env_var`, `auth`,
  `default_tools_approval_mode`, `${VAR}`).
- https://learn.chatgpt.com/docs/hooks — 11 eventos, decision control
  (`permissionDecision`, `updatedInput`, `behavior`, `decision: block`,
  exit code 2), shape TOML vs hooks.json, `PLUGIN_ROOT`/`PLUGIN_DATA`.
- https://learn.chatgpt.com/docs/changelog — CLI 0.143.0 (2026-07-08: plugins
  remotos default, marketplace npm, GPT-5.6 Sol/Terra/Luna en Bedrock, effort
  `max`, MCP tool-search default, fork de historia por turnos), 0.144.0
  (2026-07-09: modo `writes` para apps, MCP auth interactiva estable), Codex
  Desktop (2026-07-09).
- https://learn.chatgpt.com/docs/non-interactive-mode — `codex exec`: `--json`,
  `--output-schema`, `--output-last-message`, `--sandbox`, `--ephemeral`,
  `--ignore-user-config`, `--ignore-rules`, `CODEX_API_KEY`, `exec resume
  --last` / `<SESSION_ID>`.
- https://learn.chatgpt.com/docs/build-plugins — manifest completo (`interface`
  extendido, `defaultPrompt`, branding), `.app.json` como puntero a connectors,
  marketplace.json (`local`/`url`/`git-subdir`/`npm`), agentes NO empaquetables
  (sin cambio).
- https://learn.chatgpt.com/docs/github-action — `openai/codex-action@v1`:
  `prompt`/`prompt-file`, `openai-api-key`, `output-file`, `model`, `effort`,
  `sandbox`, `safety-strategy`, `codex-args`; patrón review-de-PR.
- https://github.com/openai/codex-plugin-cc — `/review` nativo (no steerable,
  sin focus text) expuesto como plugin para Claude Code.

A confirmar (sin fuente primaria fetcheada hoy): schema exacto de `.app.json`;
carga de plugins/skills dentro de `codex exec` y del GitHub Action; aceptación
del hooks.json plano en ≥0.144; slugs `gpt-5.6-*` en CLI directa y enum
`xhigh` vs `max`; Codex Cloud (delegación de tareas/environments — no llegó a
verificarse en esta pasada).
