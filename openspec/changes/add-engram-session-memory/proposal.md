# Proposal: Add Engram Session Memory (Claude Code first)

## Intent

ospec-workflow "olvida entre sesiones": `openspec/memory/*.md` guarda decisiones normativas del repo, no contexto de trabajo (qué se intentó, qué falló, dónde se quedó). Además hay deriva documental: `project-memory` spec (l.5, l.14), `skills/_shared/sdd-phase-common.md:52` y `docs/comparacion-arneses.md:70` afirman una integración con Engram que no existe. Se integra Engram como memoria de sesión **opcional, prescindible y no autoritativa** (restricción vinculante: `docs/architecture/ospec-adaptive-critical-design.md` §G; `docs/roadmaps/harness-evolution.md` ~2158/2229/2273).

Decisión de arquitectura (`approvals.architecture-001`: `compose-with-official-engram-plugin`): ospec **compone** con el plugin oficial de Engram para Claude Code (marketplace upstream, plugin `engram`, `./plugin/claude-code`) en lugar de reimplementar MCP y hooks. Engram aporta registro MCP (`engram setup claude-code`) y hooks; ospec aporta solo la capa SDD.

## Scope

### In Scope
- Instalador `setup:claude`: detectar binario + `engram doctor`, detectar si el plugin/MCP `engram` ya está registrado y guiar (`engram setup claude-code` + instalar plugin `engram` desde su marketplace). Nunca obligatorio, nunca descarga, fail-open; ejecución de comandos solo con opt-in explícito (forma en design).
- Addendum de reglas solo para Claude: Engram = recall no confiable (procedencia, contraste con OpenSpec/git live, nunca permiso/policy/verdict/aprobación, contradicciones como conflicto investigable, sin secretos ni payloads).
- Punteros de fase SDD: `mem_save` con `topic_key` `sdd/{change}/{phase}`, resumen + rutas relativas al repo, `capture_prompt:false`, sin copiar artefactos.
- Recall del orquestador en `/sdd-continue` y tras compactación, solo como pista; `state.yaml` sigue siendo canónico.
- Todo condicionado a la presencia de las tools MCP de Engram (ausencia = comportamiento actual).
- Corrección de la deriva documental (3 archivos).

### Out of Scope
- Entrada de Engram en `.mcp.json` y hooks de memoria propios de ospec (evita doble registro y fuga a otros targets).
- Targets Copilot/opencode/Codex/Cursor/VS Code (fases posteriores; Engram ya ofrece `setup codex`/`setup opencode`).
- Descarga del binario, Engram Cloud, sync; modificar el plugin upstream.
- Cualquier uso como autoridad (permisos, policy, verdict, aprobación, gates, estado de change).

## Capabilities

### New Capabilities
- `session-memory`: contrato de composición con Engram — opcionalidad y ausencia elegante, no-autoridad, observaciones no confiables con procedencia/contraste live, conflictos investigables, exclusión de secretos, convención `topic_key` `sdd/{change}/{phase}`, recall del orquestador como pista, y prohibición de registrar MCP/hooks Engram propios.

### Modified Capabilities
- `project-memory`: fila "Session memory" del Ownership Boundary pasa de "engram plugin" a adaptador opcional definido en `session-memory`; frontera de no-duplicación con `openspec/memory/`.
- `install`: `setup:claude` detecta Engram (binario, `doctor`, plugin/MCP registrado) y guía o, con opt-in, ejecuta el setup upstream; idempotente y fail-open.
- `generator`: el addendum Engram se confina al target Claude (excluido de los perfiles copilot/opencode/codex/cursor/vscode).
- `skills`: `sdd-phase-common` corrige la tabla de memoria con texto neutral al host y remite a `session-memory`.

`hooks` y `agents`: sin cambio de requisitos (no hay hooks ospec nuevos; el recall vive en el addendum Claude).

## Approach

Composición, no reimplementación: el plugin upstream inyecta memoria automáticamente vía sus hooks (SessionStart, post-compaction, UserPromptSubmit, SubagentStop, SessionEnd). ospec añade un addendum Claude-only (`rules/`, excluido de los demás perfiles vía `drop`) con el protocolo SDD y la frontera de confianza. Las fases y el orquestador solo usan Engram si sus tools existen.

**Trade-off aceptado**: como los hooks upstream inyectan memoria sin pasar por ospec, la no-autoridad se impone por **reglas y contrato**, no por mecanismo. El riesgo residual de memory poisoning queda documentado; la defensa decisiva sigue siendo que ningún gate, aprobación ni `state.yaml` lee Engram.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/configure/install-claude.js` | Modified | Detección, `doctor`, guía/opt-in |
| `rules/engram-session-memory.instructions.md` (nombre en design) | New | Addendum Claude-only |
| `scripts/lib/target-profiles/*.js` | Modified | Excluir addendum en targets no-Claude |
| `skills/_shared/sdd-phase-common.md` | Modified | Tabla de memoria neutral |
| `openspec/specs/project-memory/spec.md` | Modified | Deriva documental (vía delta) |
| `docs/comparacion-arneses.md` | Modified | Eliminar "integración nativa" falsa |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Memory poisoning vía inyección automática upstream (residual, aceptado) | Med | Addendum: datos no confiables, contraste live, conflicto investigable; test de contrato: gates/aprobaciones/`state.yaml` no leen Engram |
| Interacción hooks upstream ↔ hooks ospec (PreToolUse sobre `mcp__engram__*`, doble SessionStart) | Med | Verificar en design; sin cambios de hooks ospec |
| Plugin upstream depende de bash (Git Bash en Windows) | Med | Guía del instalador lo advierte; ausencia = fail-open |
| Fuga de secretos/payloads | Med | Prohibido por addendum; punteros, no contenido; `capture_prompt:false` |
| Deriva de versión upstream (plugin v0.1.5, CLI 2.2.1) | Med | Detección por capacidad, no por versión; `doctor --json` |
| Duplicación con `openspec/memory/` | Low | Engram guarda punteros, no contenido normativo |

## Rollback Plan

Revertir el merge: elimina addendum, detección y correcciones. La integración upstream es independiente: `claude plugin uninstall engram` / `claude mcp remove engram` la retiran si el usuario lo desea. Ningún estado OpenSpec depende de Engram; no hay migración y la base local de Engram queda fuera del repo.

## Dependencies

- Opcionales: binario Engram (local 2.2.1) y plugin `engram` del marketplace upstream (v0.1.5).
- Contrato MCP `mem_*` verificado contra la versión instalada en design.

## Success Criteria

- [ ] Sin Engram: `npm test` verde; `setup:claude` solo emite guía informativa; ninguna sesión ni fase falla.
- [ ] Con Engram: detección y `doctor` correctos; plugin/MCP ya registrado no se registra de nuevo.
- [ ] Salida generada de copilot/opencode/codex/cursor/vscode sin addendum, MCP ni hooks Engram (solo cambia la tabla neutral de `sdd-phase-common`).
- [ ] Engram caído a mitad de sesión: trabajo y gates continúan sin bloqueo.
- [ ] Ningún gate, aprobación ni `state.yaml` lee Engram (test de contrato).
- [ ] Sin afirmaciones falsas de integración en los 3 archivos con deriva.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/add-engram-session-memory main`). This note is SHOULD, not MUST.
