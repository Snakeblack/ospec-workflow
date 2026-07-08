# Proposal: Codex target profile (Bloque 5.1)

## Intent

`ospec-workflow` genera cuatro targets (`claude`, `vscode`, `github-copilot`, `opencode`).
OpenAI Codex CLI convergió con el modelo de Claude Code (skills SKILL.md nativos, plugins
`.codex-plugin/`, `AGENTS.md` en capas, subagentes por nombre, hooks de lifecycle). Este
change agrega `codex` como quinto target: un perfil declarativo consumido por
`target-transform.js` con layout "codex-plugin", para que el harness completo se distribuya
como plugin de Codex. Es la base del Bloque 5 (5.2/5.3/5.4 dependen de este).

## Scope

### In Scope
- Perfil `scripts/lib/target-profiles/codex.js` (layout "codex-plugin", el más cercano a `claude`).
- Bundle de plugin: reshape del manifiesto canónico → `.codex-plugin/plugin.json` (solo `skills`/`mcpServers`/`apps`/`hooks`) + `skills/` + `.mcp.json`; metadata `interface`.
- Transform nuevo **markdown→TOML** para agentes: `agents/*.agent.md` → `.codex/agents/<name>.toml` (frontmatter→`name`/`description`, cuerpo→`developer_instructions`, `model`+`model_reasoning_effort` desde `models.yaml`, `sandbox_mode` por capacidad del agente). Los agentes salen FUERA del bundle (el plugin no los empaqueta).
- Commands → **skills** invocables `$sdd-*`: `commands/*.prompt.md` → `skills/<name>/SKILL.md`; routing `agent:` → instrucción explícita de spawn; args `${input:x}` → posicionales `$1`/`$ARGUMENTS` (estilo opencode).
- `question_gate` degradado a chat plano (Codex no tiene ask-tool estructurada), declarado en el perfil.
- Registro de `codex` como quinto target en `scripts/configure/cli.js` (registry/SOURCE_ROOTS).
- `scripts/configure/validate-codex.js` + fixtures golden en `scripts/configure/__fixtures__/` + cobertura en `e2e.test.js` / `real-repo.test.js`.

### Out of Scope
- 5.2 hooks bridge (`hooks/hooks.json` → hooks de Codex).
- 5.3 installer (`npm run setup:codex`, copia de TOML a `~/.codex/agents/`, marketplace).
- 5.4 columna `codex` en `models.yaml` (GPT-5.6, gated al release 2026-07-09).

## Capabilities

### New Capabilities
- `codex-target`: perfil declarativo + transforms nuevos (markdown→TOML de agentes, commands→skills, bundle `.codex-plugin`, degradación de `question_gate`, validador de salida).

### Modified Capabilities
- `generator`: el pipeline pasa de cuatro a cinco targets soportados; source files, escenarios de registro y validación amplían para incluir `codex`.

## Approach

Extender el motor declarativo `target-transform.js` con dos ramas de emisión nuevas que
hoy no existen (todo el output actual es markdown): (a) emisor de agentes a TOML con
`developer_instructions`, y (b) commands→`skills/<name>/SKILL.md`. El resto (manifest
reshape, mcp, tool-map, positional vars) reutiliza mecanismos existentes parametrizados
por el perfil. `opencode` es el precedente para el estilo de args posicionales.

## Decisión de diseño pendiente (para sdd-design)

`rules/*.instructions.md` en Codex: **fusionar en el `AGENTS.md` emitido** vs **inyectar en
`developer_instructions` de cada agente TOML**. NO se resuelve en propose; se documenta como
ADR en la fase de diseño (checkbox 5.1 "Rules").

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/target-profiles/codex.js` | New | Perfil declarativo del target |
| `scripts/lib/target-transform.js` | Modified | Ramas markdown→TOML y commands→skill |
| `scripts/configure/cli.js` | Modified | Registro del quinto target |
| `scripts/configure/validate-codex.js` | New | Validador de salida codex |
| `scripts/configure/__fixtures__/` | New | Fixtures golden codex |
| `scripts/configure/*e2e/real-repo*.test.js` | Modified | Cobertura codex |
| `openspec/specs/generator/spec.md` | Modified | Cuatro → cinco targets |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Schema exacto de `.codex-plugin/plugin.json` / TOML de agentes mal inferido | Med | Fixtures golden derivados de la doc oficial; validador estricto que falla temprano |
| Perfil referencia columna `codex` de `models.yaml` inexistente (5.4) | Med | `model-resolver` es fail-soft: OMITe `model` cuando falta la columna; 5.1 emite sin `model:` sin romper |
| Nuevas ramas de transform regresionan targets existentes | Med | Todo gated por perfil; ramas nuevas solo activas para `codex`; suite completa `npm test` |

## Rollback Plan

Cambio puramente aditivo. Revertir = borrar `codex.js`, `validate-codex.js`, fixtures codex y
quitar la entrada de `codex` del registry en `cli.js`; las ramas nuevas de `target-transform.js`
quedan inertes sin perfil que las active. `git revert` del commit/PR restaura los cuatro targets
originales sin tocar su output (verificable con fixtures golden existentes).

## Dependencies

- Ninguna bloqueante. 5.4 (columna models) es independiente por el fail-soft del resolver.

## Success Criteria

- [ ] `codex` genera un dist válido: `.codex-plugin/plugin.json`, `skills/`, `.mcp.json`, `.codex/agents/*.toml`.
- [ ] `validate-codex.js` pasa contra el dist generado y fixtures golden.
- [ ] Los cuatro targets existentes conservan output byte-idéntico (fixtures sin cambios).
- [ ] `npm test` verde, incluida la cobertura codex en `e2e.test.js` / `real-repo.test.js`.
- [ ] La decisión rules (AGENTS.md vs developer_instructions) queda registrada como ADR en design.
