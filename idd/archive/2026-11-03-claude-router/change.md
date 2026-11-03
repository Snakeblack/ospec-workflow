# claude-router

## Intent and acceptance

Router de Claude Code para quien instala desde el marketplace: fichero ~/.claude/rules/ospec-workflow.md, CLI ospec router, aviso en SessionStart y refresco tras actualizar el plugin

Acceptance: Con el plugin instalado desde el marketplace y sin router, el primer arranque muestra un aviso; ospec router install escribe ~/.claude/rules/ospec-workflow.md (o .claude/rules/ con --scope project), off/remove lo quitan, status lo informa; tras subir la versión del plugin el hook refresca el fichero que escribió ospec; setup:claude migra el bloque de ~/.claude/CLAUDE.md; ospec doctor apunta a ospec router; node scripts/check.js en verde

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `docs/roadmaps/harness-evolution.md`, `docs/target-capabilities.md`, `handbook/empezar/instalacion.md`, `handbook/proteccion/reglas.md`, `openspec/specs/generator/spec.md`, `openspec/specs/hooks-runtime/spec.md`, `openspec/specs/hooks/spec.md`, `openspec/specs/idd/spec.md`, `openspec/specs/install/spec.md`, `rules/ospec-router.instructions.md`, `scripts/configure/__fixtures__/golden/claude/hooks/hooks.json`, `scripts/configure/install-claude.js`, `scripts/configure/install-claude.test.js`, `scripts/configure/instruction-block.js`, `scripts/fixtures/context-baseline.json`, `scripts/hooks/ospec-hooks-launch.js`, `scripts/hooks/ospec-hooks-launch.test.js`, `scripts/lib/claude-router.js`, `scripts/lib/claude-router.test.js`, `scripts/lib/context-baseline.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/idd-refusals.test.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/lib/ospec-doctor.js`, `scripts/lib/ospec-doctor.test.js`, `scripts/lib/router-block.js`, `scripts/lib/target-profiles/claude.js`, `scripts/lib/target-transform.js`, `scripts/lib/target-transform.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
- Work units: 4
<!-- ospec:plan:end -->

### Verification outside the CLI

- Fase 0 (Claude Code 2.1.316, Haiku, plugin de prueba con `--plugin-dir`): `~/.claude/rules/*.md` sin `paths` entra como memoria `User` en el mismo bloque que `~/.claude/CLAUDE.md` y se recarga tras `/clear`; el modelo no ve el `systemMessage` de SessionStart y el usuario sí; `CLAUDE_CONFIG_DIR` mueve las reglas y `CLAUDE_PLUGIN_DATA`; el payload trae `source`; `bin/` del plugin está en el PATH de Bash y de `! cmd`.
- Prueba real con la build de este cambio y un `CLAUDE_CONFIG_DIR` temporal: aviso al arrancar, `! ospec router install` desde la sesión, el modelo cita el router tras `/clear`, refresco al subir la versión del plugin, un fichero editado no se refresca ni avisa, `off` sin `--force` se niega ante él, `off --force` calla el aviso y `remove` lo devuelve.
- Visto en la prueba: con otro `ospec` antes en el PATH (aquí, el de la build vieja de `dist/` que heredó tmux), `! ospec` ejecuta ese; en una instalación normal solo está el del plugin.

## Decisions

<!-- ospec:decisions:start -->
- El router de Claude pasa a ~/.claude/rules/ospec-workflow.md en vez del bloque de ~/.claude/CLAUDE.md: la Fase 0 comprobó que se carga como memoria User, en el mismo bloque y con la misma etiqueta
- Un único módulo scripts/lib/claude-router.js resuelve el directorio (CLAUDE_CONFIG_DIR o ~/.claude) y escribe, refresca y quita con escritura atómica; lo usan setup:claude, ospec router, ospec doctor y el hook
- El aviso sale de ospec-hooks-launch.js antes del hijo Go/Node, como systemMessage (lo ve el usuario, no el modelo), solo con source startup y solo en la build de Claude, que añade un flag en nestHooks
- El hook solo refresca el fichero que escribió ospec cuando la versión instalada es mayor y el hash coincide, nunca escribe en el repo, y DISABLE_ROUTER_NOTICE lo apaga
- ospec doctor sigue siendo de solo lectura (REQ-idd-019); la escritura va en ospec router install|off|remove|status
- El alcance de proyecto escribe .claude/rules/ospec-workflow.md y extraKnownMarketplaces/enabledPlugins en .claude/settings.json; cada compañero sigue instalando el plugin
- Las funciones puras del bloque del router pasan a scripts/lib/router-block.js, porque scripts/configure no se publica con el plugin y claude-router.js migra el bloque antiguo
- El estado del router vive en <config>/plugins/data/ospec-workflow-ospec-tools/router.json y todos lo calculan desde el directorio de configuración, porque el CLI no recibe CLAUDE_PLUGIN_DATA
- off quita el router y guarda el no; remove lo quita y borra el estado; quitar el router de equipo deja .claude/settings.json como está
- Un fichero de reglas que no es el router instalado ni lo que escribió ospec, y un router de equipo distinto, se rechazan con router-modified salvo --force
- Se quita la skill router del plan: ! ospec router funciona en la sesión y una skill solo de Claude pediría un mecanismo nuevo de exclusión por destino
- El CLI acepta OSPEC_PLUGIN_ROOT para nombrar la raíz del plugin, como ya hace el lanzador con los hooks; así las pruebas usan un plugin falso
- El doctor resuelve el directorio de Claude con CLAUDE_CONFIG_DIR en todas sus comprobaciones de Claude, igual que el router
- La URL del marketplace copiada al settings.json del equipo pierde la contraseña (cualquier esquema), el usuario de http(s) y la query string; el usuario ssh se conserva (hallazgo WARNING de la primera revisión de confianza)
- El mensaje de ospec router install dice que el router carga al siguiente arranque o tras /clear, comprobado en la prueba real
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: adr-impact-declaration for adr-impact-declaration (2026-11-03T12:23:12.785Z)
- ev-2: check-run for checks-pass (2026-11-03T12:25:14.355Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-03T12:25:14.355Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-03T12:25:33.962Z)
- ev-5: frozen-review for trust-review (2026-11-03T12:32:23.661Z, subagent-stop)
- ev-6: check-run for checks-pass (2026-11-03T12:34:13.113Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-11-03T12:34:13.113Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-11-03T12:34:13.113Z)
- ev-9: migration-test for migration-compat-and-test (2026-11-03T12:34:22.529Z)
- ev-10: frozen-review for trust-review (2026-11-03T12:37:43.117Z, subagent-stop)
- ev-11: living-doc-current for living-doc (2026-11-03T12:38:33.901Z)
<!-- ospec:evidence:end -->
