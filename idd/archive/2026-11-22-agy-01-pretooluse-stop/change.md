# agy-01-pretooluse-stop

## Intent and acceptance

Cerrar bypass de PreToolUse en write_file/edit_file/read_file (AGY 1.5.14), respetar cwd nativo y evitar reanudacion en Stop cancelado o no ocioso, aislado al adaptador de Antigravity

Acceptance: En OSPEC_TARGET=antigravity, adaptAntigravityHookInput mapea Path/Content/Replacement de agy 1.5.14 para bloquear escrituras a ficheros del CLI y escanear secretos/marcadores [REDACTED:...] en Node y Go, prioriza parsed.cwd sobre workspacePaths, suprime stopNudge cuando fullyIdle es false o terminationReason difiere de NO_TOOL_CALL, y los demas targets permanecen sin cambios

## Request and answers

<!-- ospec:log:start -->
Answer 1 — open-facts, user, 2026-11-22T00:26:24.677Z:

> todas las recomendadas: (1) en edit_file escanear solo Content y Replacement sin Target; (2) emitir force_ask en todos los fallos de inspeccion de launcherFailure en OSPEC_TARGET=antigravity; (3) mantener ramas locales en el worktree hasta que PR #545 cierre
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `openspec/specs/hooks/spec.md`, `scripts/hooks/ospec-hooks-launch.js`, `scripts/hooks/ospec-hooks-launch.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Aislar el cambio integramente en el adaptador de Antigravity de scripts/hooks/ospec-hooks-launch.js (sin tocar pre-tool-use.js, pretooluse.go, idd-nudge.js ni iddnudge.go), cubriendo tanto el binario Go como el respaldo Node en Antigravity con cero impacto en los otros 6 targets
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-22T00:29:19.791Z)
- ev-2: check-run for checks-pass (2026-11-22T00:31:37.464Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-22T00:31:37.464Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-22T00:32:00.811Z)
- ev-5: frozen-review for trust-review (2026-11-22T00:43:24.136Z, relayed)
- ev-6: check-run for checks-pass (2026-11-22T00:48:10.143Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-22T00:48:10.143Z)
- ev-8: migration-test for migration-compat-and-test (2026-11-22T00:49:52.092Z)
- ev-9: check-run for checks-pass (2026-11-22T00:51:48.847Z)
- ev-10: adr-impact-declaration for adr-impact-declaration (2026-11-22T00:51:48.847Z)
- ev-11: frozen-review for trust-review (2026-11-22T01:00:58.143Z, relayed)
- ev-12: migration-test for migration-compat-and-test (2026-11-22T01:02:50.797Z)
- ev-13: check-run for checks-pass (2026-11-22T01:04:25.456Z)
- ev-14: adr-impact-declaration for adr-impact-declaration (2026-11-22T01:04:25.456Z)
- ev-15: frozen-review for trust-review (2026-11-22T01:08:08.796Z, relayed)
- ev-16: living-doc-current for living-doc (2026-11-22T01:08:09.002Z)
<!-- ospec:evidence:end -->
