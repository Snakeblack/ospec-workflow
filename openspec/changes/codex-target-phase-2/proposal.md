# Proposal: Codex Target Phase 2

## Intent

Convertir la reparación de Codex CLI 0.144.1 en un producto instalable sin parches manuales. Un change cubre generación y smoke en tarea nueva.

## Scope

### In Scope
- Emitir metadata y paths `./` seguros; validar el payload publicado y los IDs MCP con `^[a-zA-Z0-9_-]+$`.
- Generar wrapper `matcher` + `hooks` para los cinco eventos actuales, con adapter POSIX/Windows y `PLUGIN_DATA`.
- Probar `PreToolUse` deny/allow/advisory sin `ask`, `SubagentStop.agent_transcript_path` y contexto `SessionStart`.
- Instalar/actualizar plugin y agentes TOML por canales separados e idempotentes, sin tocar configuración del usuario.
- Documentar instalación, `/hooks`, tarea nueva, actualización y rollback; ejecutar el smoke mínimo skill → orquestador → `SessionStart` sobre el payload publicado.

### Out of Scope
- `model_verbosity`, sandbox granular y expansión de cinco a once eventos.
- CI headless, generación/merge de `.codex/config.toml`, distribución npm, branding o `defaultPrompt`.
- Review nativo/headless general y E2E completo apply/verify/4R/resume.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `generator`: bundle Codex, manifiesto/MCP y validación del payload publicado conformes al host.
- `hooks`: registro y adaptación probada de los cinco eventos Codex soportados.
- `install`: instalación idempotente de plugin y agentes separados, con smoke documentado.
- `agents`: TOML válidos y autodetectables que permiten invocar el orquestador en una tarea nueva.

## Approach

Tratar el payload publicado como frontera contractual. Probar por capas generación → publicación → instalación plugin+agentes → carga hooks/MCP → tarea nueva. Dividir la entrega en work units/PRs, no en changes por componente.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `scripts/lib/target-profiles/codex.js`, `target-transform.js` | Modified | Manifiesto, hooks y MCP. |
| `scripts/hooks/**`, `hooks/hooks.json` | Modified | Adapter Codex. |
| `scripts/configure/{validate-codex,install-codex,codex-marketplace}.js` | Modified | Validación e instalación. |
| Workflow, tests/fixtures y docs Codex | Modified | Evidencia y operación. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Deriva del host Codex | High | Fixtures versionados y smoke con CLI soportado. |
| Instalación parcial/caché obsoleta | Med | Validación por capas y tarea nueva. |

## Rollback Plan

Revertir work units en orden inverso, republicar el último payload válido y restaurar agentes TOML gestionados. No editar `.codex/config.toml`.

## Dependencies

- `fix-codex-config-toml` fija catálogo, `--ref release`, sparse paths, `/plugins` y preservación de config. Debe verificarse/archivarse o transferir sus pendientes antes de `sdd-apply`.

## Success Criteria

- [ ] El payload publicado valida paths `./`, IDs MCP, wrapper y cinco contratos hook.
- [ ] Reinstalar/actualizar deja plugin habilitado y agentes autodetectables sin parches manuales.
- [ ] Una tarea nueva ve `sdd-propose`, invoca `sdd-orchestrator`, recibe `SessionStart` y no muestra warnings de manifiesto/MCP/hooks.
- [ ] `/hooks` permite revisar/confiar el hash; docs cubren update y rollback.
