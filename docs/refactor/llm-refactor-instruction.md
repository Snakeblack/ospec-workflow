# Roadmap LLM-first para refactor de `ospec-workflow` como VS Code Agent Plugin

> Objetivo: convertir/reforzar `ospec-workflow` como **VS Code Agent Plugin declarativo**, no como extensión de VS Code.
>
> Este documento está escrito como instrucciones para un modelo AI/LLM executor, no como guía manual para humanos.

---

## Contexto y decisión arquitectónica

El objetivo **no** es crear una extensión de VS Code.

Por tanto, quedan descartados:

- `src/extension.ts`
- `package.json` con contribution points de extensión
- `vscode.lm.registerTool`
- `ChatParticipant`
- `contributes.languageModelTools`
- empaquetado VSIX
- lógica TypeScript de extensión

El objetivo correcto es usar el sistema oficial de **VS Code Agent Customization / Agent Plugins**, basado en artefactos declarativos:

- `plugin.json`
- custom agents
- agent skills
- instruction files
- lifecycle hooks
- MCP servers
- slash commands / prompt files cuando aporten valor

Documentación oficial base:

- <https://code.visualstudio.com/docs/agent-customization/agent-plugins>
- <https://code.visualstudio.com/docs/agent-customization/overview>
- <https://code.visualstudio.com/docs/agent-customization/custom-agents>
- <https://code.visualstudio.com/docs/agent-customization/skills>
- <https://code.visualstudio.com/docs/agent-customization/custom-instructions>
- <https://code.visualstudio.com/docs/agent-customization/hooks>

---

## Principios no negociables

1. **No crear extensión VS Code.**

   Prohibido generar:

   - `src/extension.ts`
   - `package.json` con `contributes.*`
   - `vscode.lm`
   - `registerTool`
   - `ChatParticipant`
   - `contributes.languageModelTools`

2. **Mantener formato Agent Plugin.**

   Tratar `.plugin/plugin.json` como entrypoint existente del plugin salvo que el refactor decida explícitamente migrar a un `plugin.json` raíz compatible.

3. **Agentes para roles persistentes.**

   `sdd-orchestrator` debe ser el único agente invocable por usuario.

   Los agentes de fase deben seguir siendo subagentes no invocables directamente.

4. **Skills para capacidades portables.**

   Cada fase compleja debe cargar su skill específico bajo:

   ```text
   skills/{skill-name}/SKILL.md
   ```

   No duplicar el protocolo completo dentro de cada agente.

5. **Hooks solo para automatización determinista.**

   Usar únicamente eventos oficiales:

   - `SessionStart`
   - `UserPromptSubmit`
   - `PreToolUse`
   - `PostToolUse`
   - `PreCompact`
   - `SubagentStart`
   - `SubagentStop`
   - `Stop`

   No inventar eventos como `PrePromptHook`.

6. **MCP se conserva si aporta valor.**

   No eliminar `.mcp.json` por dogma. Mantenerlo si aporta contexto externo, documentación o herramientas reutilizables que no conviene convertir en lógica propia.

7. **OpenSpec es la fuente de verdad.**

   No depender de memoria conversacional como estado autoritativo.

   El estado canónico debe estar en:

   ```text
   openspec/
   ```

8. **No hardcodear stack global salvo decisión explícita.**

   No imponer globalmente `.NET 8`, `Angular 21`, `pnpm` u otro stack si el plugin pretende ser reutilizable para múltiples proyectos.

   El stack debe venir de:

   - `openspec/config.yaml`
   - detección real del repo
   - instrucciones del proyecto consumidor

---

# Roadmap recomendado

Ejecutar en este orden:

1. `TASK 0 — audit-agent-plugin-shape`
2. `TASK 1 — normalize-plugin-manifest`
3. `TASK 2 — harden-agent-topology`
4. `TASK 4 — normalize-agent-skills`
5. `TASK 8 — enforce-openspec-state-source-of-truth`
6. `TASK 5 — normalize-instruction-files`
7. `TASK 7 — rationalize-mcp-configuration`
8. `TASK 6 — add-agent-plugin-hooks`
9. `TASK 3 — extract-prompt-files-for-entrypoints`
10. `TASK 9 — document-agent-plugin-installation`
11. `TASK 10 — add-plugin-self-validation`

La razón del orden:

- primero se estabiliza la forma del plugin;
- luego agentes, skills y estado;
- después automatización;
- finalmente ergonomía, documentación y validación.

No meter hooks ni prompt files antes de sanear agentes y skills.

---

# TASK 0 — Audit plugin shape

```md
# TASK: audit-agent-plugin-shape

## Role
You are an Agent Plugin refactoring auditor.

## Objective
Inspect the repository and classify every existing customization artifact as one of:
- plugin manifest
- custom agent
- agent skill
- instruction file
- prompt file / slash command candidate
- hook candidate
- MCP configuration
- documentation only
- deprecated or misplaced artifact

## Hard constraints
- Do not create a VS Code extension.
- Do not generate TypeScript extension APIs.
- Do not introduce `vscode.lm`, `registerTool`, `ChatParticipant`, or `contributes.languageModelTools`.
- Treat `.plugin/plugin.json` as the plugin entrypoint unless a root `plugin.json` migration is explicitly required.

## Required reads
- `.plugin/plugin.json`
- `README.md`
- all `agents/*.agent.md`
- all `skills/**/SKILL.md`
- all `rules/*.instructions.md`
- `.mcp.json`
- `.atl/skill-registry.md`

## Output
Create `docs/refactor/plugin-audit.md` with:
1. Current structure map
2. Valid Agent Plugin assets
3. Assets that need relocation or normalization
4. Assets that must stay unchanged
5. Risks and unknowns

## Acceptance criteria
- The audit explicitly says this is an Agent Plugin refactor, not a VS Code extension refactor.
- Every existing agent is classified.
- Every existing skill is classified.
- `.mcp.json` is either justified as retained or marked for removal with a concrete reason.
```

---

# TASK 1 — Normalize `plugin.json`

```md
# TASK: normalize-plugin-manifest

## Role
You are an Agent Plugin manifest compiler.

## Objective
Update the plugin manifest so VS Code can reliably discover the plugin and its components.

## Constraints
- Keep Agent Plugin format.
- Do not create an extension `package.json`.
- Do not add extension contribution points.
- The plugin name must be kebab-case, lowercase, and stable.
- Prefer `.plugin/plugin.json` because the repository already uses OpenPlugin-style layout.

## Required action
Update `.plugin/plugin.json` to include:
- name
- description
- version
- author, if known
- agents
- skills
- mcpServers, if `.mcp.json` remains
- hooks, only after hooks are actually added

## Suggested target
```json
{
  "name": "ospec-workflow",
  "description": "Spec-Driven Development workflow for VS Code Agent Customization with OpenSpec, strict TDD, phase agents, skills, and verification contracts.",
  "version": "1.1.0",
  "author": {
    "name": "Michael Retamozo"
  },
  "agents": "agents/",
  "skills": "skills/",
  "mcpServers": ".mcp.json"
}
```

## Acceptance criteria
- Manifest remains valid JSON.
- No extension-only fields are introduced.
- The manifest references only existing paths.
- Plugin can still be installed from source by VS Code Agent Plugins.
```

---

# TASK 2 — Preserve and harden the orchestrator/subagent model

```md
# TASK: harden-agent-topology

## Role
You are an Agent Customization architect.

## Objective
Refactor agent frontmatter and instructions so the topology is explicit:
- `sdd-orchestrator` is the only user-invocable agent.
- phase agents are subagents only.
- phase agents do not delegate further.
- orchestration rules live in the orchestrator.
- execution rules live in phase skills.

## Constraints
- Do not convert phase agents into prompt files.
- Do not remove `agents:` from `sdd-orchestrator`.
- Do not make phase agents user-invocable.
- Do not duplicate full skill content inside agents.

## Required actions
1. Review every `agents/*.agent.md`.
2. Ensure only `sdd-orchestrator.agent.md` has `user-invocable: true`.
3. Ensure every phase agent has `user-invocable: false`.
4. Ensure every phase agent has a short executor boundary.
5. Move oversized procedural content from agents into the matching `skills/{phase}/SKILL.md`.
6. Keep agents thin:
   - identity
   - boundary
   - required skill
   - required artifacts
   - result contract

## Output
Update agent files in place.
Create `docs/refactor/agent-topology.md` summarizing final topology.

## Acceptance criteria
- There is exactly one user-invocable SDD agent.
- `sdd-orchestrator` lists allowed subagents.
- No phase agent contains orchestration decisions.
- No phase agent tells itself to launch subagents.
```

---

# TASK 3 — Convert slash-like commands into prompt files only where useful

```md
# TASK: extract-prompt-files-for-entrypoints

## Role
You are a prompt-file compiler for VS Code Agent Customization.

## Objective
Create prompt files only for user-facing entrypoints that improve discoverability and invocation ergonomics.

## Constraints
- Prompt files must not replace custom agents.
- Prompt files must route to `sdd-orchestrator`.
- Prompt files must not contain full phase protocol.
- Prompt files must not contain large embedded specs or skill bodies.

## Candidate prompt files
Create only these if they add value:
- `sdd-new.prompt.md`
- `sdd-lite.prompt.md`
- `sdd-continue.prompt.md`
- `sdd-apply.prompt.md`
- `sdd-verify.prompt.md`
- `sdd-archive.prompt.md`

## Required target directory
Use a plugin-compatible prompt location only if supported by the current plugin format.
If prompt files are not formally bundled by plugin manifest, document them as optional workspace assets and do not pretend they are guaranteed plugin-provided commands.

## Prompt shape
Each prompt file must:
- name the command
- describe the command
- route to `sdd-orchestrator`
- pass user intent and change name
- avoid implementation details

## Example
```md
---
name: sdd-apply
description: Continue or run the apply phase for an OpenSpec change.
agent: sdd-orchestrator
---

Run SDD apply for `${input:changeName}`.

Use the existing OpenSpec state and follow the orchestrator routing rules.
Do not implement inline unless the orchestrator explicitly classifies the change as trivial and safe.
```

## Acceptance criteria
- Prompt files are thin wrappers.
- Prompt files do not duplicate agent or skill logic.
- Prompt files do not turn phase agents into direct user entrypoints.
```

---

# TASK 4 — Normalize skills as the execution core

```md
# TASK: normalize-agent-skills

## Role
You are an Agent Skill maintainer.

## Objective
Make `skills/` the canonical location for reusable phase execution logic.

## Constraints
- Every skill directory must match its `SKILL.md` frontmatter name.
- Skill names must be plain kebab-case.
- Do not use namespace prefixes.
- Do not duplicate full phase logic in agents and skills.
- Skills must be portable and readable by subagents.

## Required actions
1. Audit each `skills/*/SKILL.md`.
2. Ensure every phase agent points to its corresponding skill.
3. Ensure shared rules live in `skills/_shared/`.
4. Move duplicated phase procedures from agents into skills.
5. Keep result contracts consistent across skills and agents.

## Required skill directories
- `skills/sdd-init/`
- `skills/sdd-foundation/`
- `skills/sdd-explore/`
- `skills/sdd-propose/`
- `skills/sdd-spec/`
- `skills/sdd-design/`
- `skills/sdd-tasks/`
- `skills/sdd-apply/`
- `skills/sdd-verify/`
- `skills/sdd-archive/`
- `skills/_shared/`

## Acceptance criteria
- Every skill directory has a `SKILL.md`.
- Every skill name matches its folder.
- Phase agents only reference skills, not copy them.
- Shared protocol files are not duplicated.
```

---

# TASK 5 — Replace broad `rules/` with official instruction files

```md
# TASK: normalize-instruction-files

## Role
You are an Agent Customization instruction-file refactoring model.

## Objective
Move reusable coding and workflow instructions into official instruction-file structure without over-applying them.

## Constraints
- Do not use deprecated or invented settings like `copilot.instructions.directories`.
- Do not apply Strict TDD globally.
- Do not hardcode project-specific stack rules globally unless the plugin is intentionally stack-specific.
- Keep workflow-level rules separate from implementation-stack rules.

## Required actions
1. Create `.github/instructions/` if the repository chooses workspace-compatible instruction files.
2. Move or mirror `rules/sdd-strict-tdd.instructions.md` into `.github/instructions/sdd-strict-tdd.instructions.md`.
3. Narrow `applyTo`.
4. Keep Strict TDD activation conditional on `openspec/config.yaml`.
5. Keep global policy in `.github/copilot-instructions.md` only if it applies to all projects.

## Suggested Strict TDD frontmatter
```md
---
name: sdd-strict-tdd
description: Strict TDD evidence rules for SDD apply and verify phases.
applyTo: "**/*.{spec.ts,test.ts,cs}"
---
```

## Required content rule
The instruction must say:
- Load these rules only when `openspec/config.yaml` enables `strict_tdd: true`.
- If command execution is unavailable, report blocked instead of faking GREEN evidence.
- Runtime test evidence beats static inspection.

## Acceptance criteria
- No instruction file has `applyTo: '**'` unless it is truly global.
- Strict TDD does not activate for every file blindly.
- The orchestrator still forwards Strict TDD explicitly to `sdd-apply` and `sdd-verify`.
```

---

# TASK 6 — Add plugin hooks only for safety gates

```md
# TASK: add-agent-plugin-hooks

## Role
You are an Agent Plugin lifecycle automation engineer.

## Objective
Add hooks only where deterministic automation improves safety.

## Constraints
- Do not invent lifecycle events.
- Use only official events:
  - SessionStart
  - UserPromptSubmit
  - PreToolUse
  - PostToolUse
  - PreCompact
  - SubagentStart
  - SubagentStop
  - Stop
- Do not rely on matcher filtering in VS Code.
- If filtering is needed, implement filtering inside the script.

## Hook candidates
1. `SessionStart`
   - validate plugin layout
   - warn if `openspec/config.yaml` is missing only when SDD command is detected later

2. `UserPromptSubmit`
   - detect `/sdd-*` command intent
   - optionally write a lightweight session marker

3. `PreToolUse`
   - block dangerous writes outside workspace
   - block production-code edits by `sdd-verify`
   - block spec edits by `sdd-apply`

4. `PostToolUse`
   - after edits, run lightweight artifact validation
   - validate `state.yaml` if touched

5. `PreCompact`
   - persist compact SDD state snapshot
   - never rely only on chat memory

## Required files
- `hooks.json` or plugin-format-compatible hook file
- `scripts/hooks/validate-tool-use.*`
- `scripts/hooks/persist-session-state.*`
- `scripts/hooks/validate-openspec-artifacts.*`

## Acceptance criteria
- Hooks do not require a VS Code extension.
- Hooks are documented as plugin lifecycle automation.
- Hooks fail safely.
- Hooks do not run expensive tests on every edit.
```

---

# TASK 7 — Keep MCP as optional external context provider

```md
# TASK: rationalize-mcp-configuration

## Role
You are an MCP configuration reviewer.

## Objective
Decide whether `.mcp.json` should remain in the plugin and document its purpose.

## Constraints
- Do not delete `.mcp.json` just because Language Model Tools exist.
- Do not migrate MCP to VS Code extension APIs.
- Keep MCP only if it adds external context or tools that the plugin cannot provide declaratively.

## Required analysis
Review `.mcp.json` and classify each server:
- required
- optional
- development-only
- remove

## Current known server
- `io.github.upstash/context7`

## Output
Create `docs/refactor/mcp-decision.md`.

## Acceptance criteria
- `.mcp.json` is either retained with a clear reason or removed with a clear reason.
- If retained, `.plugin/plugin.json` references it through `mcpServers`.
- Environment variables are documented.
```

---

# TASK 8 — Make OpenSpec state the source of truth

```md
# TASK: enforce-openspec-state-source-of-truth

## Role
You are an SDD workflow consistency refactoring model.

## Objective
Ensure all agents and skills treat OpenSpec files as the canonical workflow state.

## Constraints
- Do not use chat memory as authoritative state.
- Do not create `.vscode/context-summary.json` as a required invariant.
- Do not inline large artifacts into prompts.
- Use artifact paths whenever the subagent can read files.

## Required canonical paths
- `openspec/config.yaml`
- `openspec/changes/{change-name}/state.yaml`
- `openspec/changes/{change-name}/proposal.md`
- `openspec/changes/{change-name}/proposal-lite.md`
- `openspec/changes/{change-name}/design.md`
- `openspec/changes/{change-name}/tasks.md`
- `openspec/changes/{change-name}/apply-progress.md`
- `openspec/changes/{change-name}/verify-report.md`
- `openspec/changes/{change-name}/archive-report.md`
- `openspec/changes/{change-name}/specs/**/spec.md`

## Required actions
1. Audit all agents and skills for state assumptions.
2. Replace chat-memory dependencies with OpenSpec path reads.
3. Ensure every phase writes its artifact and updates `state.yaml`.
4. Ensure continuation uses `state.yaml`, not conversation history.

## Acceptance criteria
- Every persisted phase updates OpenSpec state.
- Every continuation path can recover from files alone.
- No agent requires prior chat context to know the current SDD phase.
```

---

# TASK 9 — Add plugin install and compatibility docs

```md
# TASK: document-agent-plugin-installation

## Role
You are a technical documentation model.

## Objective
Document how to install, enable, test, and update the plugin in VS Code Agent Plugins.

## Constraints
- Do not document extension installation.
- Do not mention `vsce package`.
- Do not instruct users to build a VSIX.
- Document preview status and trust implications.

## Required sections
Create `docs/plugin-installation.md` with:
1. What this plugin provides
2. How to install from source
3. How to enable locally with `chat.pluginLocations`
4. How to verify that agents and skills loaded
5. How to verify MCP server availability
6. How to disable hooks if needed
7. Troubleshooting
8. Update/version bump policy

## Required facts
- Agent Plugins are preview.
- Plugins can be installed from a Git repository URL.
- Local plugins can be registered with `chat.pluginLocations`.
- Plugins can include hooks and MCP servers that execute code locally; users must review them before installing.

## Acceptance criteria
- No extension workflow appears in the docs.
- The docs explain that plugin support can be disabled by org policy.
- The docs include a minimal `settings.json` example for local plugin loading.
```

---

# TASK 10 — Add self-validation checklist for AI agents

```md
# TASK: add-plugin-self-validation

## Role
You are a plugin QA model.

## Objective
Create a machine-readable validation checklist for future AI agents that modify this plugin.

## Required file
Create `docs/refactor/plugin-validation-checklist.md`.

## Required checks
- `plugin.json` exists in a recognized location.
- plugin name is kebab-case.
- `agents/` path exists.
- `skills/` path exists.
- every `*.agent.md` has valid frontmatter.
- exactly one SDD agent is user-invocable.
- phase agents are not user-invocable.
- every skill directory has `SKILL.md`.
- skill folder name matches skill name.
- `.mcp.json`, if present, has top-level `mcpServers`.
- hooks, if present, use supported lifecycle events.
- no VS Code extension APIs are present.
- no generated `package.json` extension manifest exists unless explicitly justified.

## Acceptance criteria
- Checklist is specific enough for another AI agent to run.
- Checklist blocks accidental migration to extension architecture.
```

---

# Decisiones técnicas concretas

## Mantener

```text
.plugin/plugin.json
agents/
skills/
.mcp.json
.atl/skill-registry.md
openspec/ como estado canónico
sdd-orchestrator como único agente invocable
```

## Añadir

```text
hooks.json                     # solo si se añaden hooks reales
scripts/hooks/                 # scripts llamados por hooks
docs/refactor/plugin-audit.md
docs/refactor/agent-topology.md
docs/refactor/mcp-decision.md
docs/refactor/plugin-validation-checklist.md
docs/plugin-installation.md
```

## Evitar

```text
src/extension.ts
package.json con contributes.*
vscode.lm.registerTool
ChatParticipant
contributes.languageModelTools
copilot.instructions.directories
.vscode/context-summary.json como pieza central
```

---

# Prompt maestro para lanzar el refactor con Copilot / Agent

```md
You are refactoring `ospec-workflow` as a VS Code Agent Plugin, not as a VS Code extension.

Follow the official VS Code Agent Customization model:
- plugin manifest
- custom agents
- agent skills
- instruction files
- lifecycle hooks
- MCP servers

Do not use VS Code Extension APIs.
Do not generate `vscode.lm.registerTool`.
Do not generate `ChatParticipant`.
Do not generate `contributes.languageModelTools`.
Do not create a VSIX extension structure.

The plugin must remain declarative and installable as an Agent Plugin.

Execute the roadmap tasks in order:
1. audit-agent-plugin-shape
2. normalize-plugin-manifest
3. harden-agent-topology
4. normalize-agent-skills
5. enforce-openspec-state-source-of-truth
6. normalize-instruction-files
7. rationalize-mcp-configuration
8. add-agent-plugin-hooks
9. extract-prompt-files-for-entrypoints
10. document-agent-plugin-installation
11. add-plugin-self-validation

After each task:
- write changed files
- summarize changes
- list validation evidence
- stop if a task would require VS Code extension APIs
- prefer preserving existing working architecture over speculative migration
```

---

# Checklist rápida de validación final

Antes de aceptar el refactor, verificar:

```text
[ ] No existe `src/extension.ts`
[ ] No se creó un `package.json` de extensión VS Code
[ ] No aparece `vscode.lm.registerTool`
[ ] No aparece `ChatParticipant`
[ ] No aparece `contributes.languageModelTools`
[ ] `.plugin/plugin.json` sigue siendo válido
[ ] `agents/` sigue existiendo
[ ] `skills/` sigue existiendo
[ ] `sdd-orchestrator` es el único agente user-invocable
[ ] Los agentes de fase son user-invocable: false
[ ] Los agentes de fase no delegan
[ ] Las skills tienen `SKILL.md`
[ ] OpenSpec sigue siendo la fuente de verdad
[ ] `.mcp.json` se mantiene o elimina con justificación documentada
[ ] Los hooks, si existen, usan eventos oficiales
[ ] No se usa `copilot.instructions.directories`
[ ] No se crea `.vscode/context-summary.json` como pieza central obligatoria
```

---

# Recomendación final

No ejecutar todo el roadmap de golpe.

Primera iteración recomendada:

1. `TASK 0`
2. `TASK 1`
3. `TASK 2`
4. `TASK 4`
5. `TASK 8`

Con eso queda saneado el núcleo del Agent Plugin.

Después, en una segunda iteración:

1. `TASK 5`
2. `TASK 7`
3. `TASK 6`
4. `TASK 3`
5. `TASK 9`
6. `TASK 10`

Motivo: primero estructura; después automatización y ergonomía. Meter hooks antes de limpiar agentes y skills sería ponerle turbo a una lavadora con ladrillos dentro.
