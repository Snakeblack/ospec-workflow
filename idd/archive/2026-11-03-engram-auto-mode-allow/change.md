# engram-auto-mode-allow

## Intent and acceptance

Con Engram configurado por ospec, las escrituras de memoria (mem_save, mem_session_summary...) se deniegan en el modo auto de Claude Code (#475): el hook PreToolUse de engram@engram reescribe la entrada con updatedInput y la revisión del clasificador queda sin veredicto. setup:claude añadirá reglas permissions.allow para las herramientas de escritura no destructivas de engram, y ospec doctor avisará si faltan.

Acceptance: Tras npm run setup:claude con Engram configurado, el settings.json de Claude Code tiene en permissions.allow las 12 herramientas de escritura no destructivas de engram (no mem_delete ni mem_merge_projects), conserva el resto de ajustes, no duplica entradas al repetirse y no reescribe un fichero ilegible; ospec doctor informa en el check engram cuando faltan.

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `docs/plugin-installation.es.md`, `docs/plugin-installation.md`, `openspec/specs/idd/spec.md`, `openspec/specs/install/spec.md`, `openspec/specs/session-memory/spec.md`, `scripts/configure/engram-setup.js`, `scripts/configure/engram-setup.test.js`, `scripts/lib/engram-claude-allow.js`, `scripts/lib/engram-detect.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/lib/ospec-doctor.js`, `scripts/lib/ospec-doctor.test.js`, `scripts/session-memory-contract.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- La lista de herramientas y los prefijos viven en scripts/lib/engram-detect.js, que ya comparten setup y doctor: las 12 de escritura no destructivas del matcher PreToolUse de engram@engram (sin mem_delete ni mem_merge_projects), con los prefijos mcp__engram__ y mcp__plugin_engram_engram__.
- Las reglas se escriben en <CLAUDE_CONFIG_DIR o ~/.claude>/settings.json con claudeConfigDir de claude-router.js, como el doctor y el router, porque es el fichero que lee Claude Code.
- Una herramienta que el usuario ya tiene en permissions.ask o permissions.deny no recibe regla allow, y el doctor no la cuenta como ausente; --no-engram no escribe ni quita reglas.
- La lista de herramientas y missingEngramAllowRules pasan a scripts/lib/engram-claude-allow.js, un módulo de datos que no requiere, lee ni llama a nada: REQ-session-memory-002 prohíbe nombrar mem_* en engram-detect.js y ospec-doctor.js, y el test de contrato admite el módulo de forma explícita con una aserción que impide que haga E/S.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-03T22:24:49.729Z)
- ev-2: migration-test for migration-compat-and-test (2026-11-03T22:31:23.048Z)
- ev-3: check-run for checks-pass (2026-11-03T22:35:10.741Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-03T22:35:19.126Z)
- ev-5: check-run for checks-pass (2026-11-03T22:37:34.398Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-11-03T22:37:34.398Z)
- ev-7: migration-test for migration-compat-and-test (2026-11-03T22:37:48.038Z)
- ev-8: check-run for checks-pass (2026-11-03T22:39:01.656Z)
- ev-9: adr-impact-declaration for adr-impact-declaration (2026-11-03T22:39:01.656Z)
- ev-10: living-doc-current for living-doc (2026-11-03T22:39:01.791Z)
<!-- ospec:evidence:end -->
