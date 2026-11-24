# agy-06-native-plugin

## Intent and acceptance

Empaquetar dist/antigravity como plugin nativo valido en agy plugin validate --strict, instalarlo en plugins/ospec-workflow con migracion atomica de legado y soporte --workspace, y detectar plugin/legado/duplicado en ospec doctor

Acceptance: dist/antigravity pasa agy plugin validate --strict --json con 0 hallazgos (.antigravity-plugin/plugin.json, assets/logo.svg, hooks.json relativo); setup:antigravity instala en ~/.gemini/config/plugins/ospec-workflow migrando archivos/hooks ospec-* legados con rollback journal y soporta --workspace <repo> en .agents/plugins/ospec-workflow; ospec doctor detecta plugin, legado y coexistencia; 0 bytes de diff en artefactos transformados de los otros 6 targets

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-24T15:16:55.465Z):

> PR 6 feat/agy-06-native-plugin: empaquetar target Antigravity como plugin nativo (.antigravity-plugin/plugin.json), migracion segura de instalacion global legada, scope --workspace y deteccion en ospec doctor

Answer 1 — open-facts, user, 2026-11-24T17:31:43.694Z:

> todas las recomendadas: (1A) emitir .antigravity-plugin/plugin.json + assets/logo.svg + hooks.json con ./scripts/hooks/ospec-antigravity-hook.js (agy plugin validate --strict: 0 hallazgos), manteniendo el router sin prefijo y 0 B en context-baseline.json; (2A) global en <configRoot>/plugins/ospec-workflow migrando con rollback journal solo archivos/hooks ospec-* legados y conservando SDD, --workspace <repo> en .agents/plugins/ospec-workflow con rutas relativas portables, --dest instala el plugin en <dir> y se actualiza bench/hosts/agy.js; (3A) ospec doctor detecta plugins/ospec-workflow como principal, emite warn antigravity/legacy-duplicate si coexiste legado e info si solo existe legado; (4A) entregar en PR 6a (generador/manifiesto/validador) + PR 6b (instalador/migracion/workspace/doctor/docs/cierre IDD) bajo <=400 lineas por PR
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `docs/plugin-installation.es.md`, `docs/plugin-installation.md`, `openspec/specs/generator/spec.md`, `openspec/specs/idd/spec.md`, `openspec/specs/install/spec.md`, `scripts/configure/install-antigravity.js`, `scripts/configure/install-antigravity.test.js`, `scripts/configure/validate-antigravity.js`, `scripts/configure/validate-antigravity.test.js`, `scripts/evals/bench/hosts/agy.js`, `scripts/lib/ospec-doctor-hosts.js`, `scripts/lib/ospec-doctor-hosts.test.js`, `scripts/lib/target-profiles/antigravity.js`, `scripts/lib/target-transform.js`, `scripts/lib/target-transform.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Usar rutas relativas ./scripts/hooks/ospec-antigravity-hook.js en hooks.json del plugin nativo y mantener sin prefijo las entradas idd/foundation del router, verificado en vivo en agy 1.5.15 (agy plugin validate --strict: 0 findings; agy plugin list: skills sin prefijo salvo colision)
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-24T17:47:30.901Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-24T17:47:30.901Z)
- ev-3: migration-test for migration-compat-and-test (2026-11-24T17:47:42.887Z)
- ev-4: living-doc-current for living-doc (2026-11-24T17:47:43.085Z)
<!-- ospec:evidence:end -->
