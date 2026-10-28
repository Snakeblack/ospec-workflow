# cli-dropped-arguments

## Intent and acceptance

El CLI ospec descarta sin avisar los argumentos que no asigna: --path a b c guarda solo a, y un flag de un solo valor repetido se queda con el último; la skill idd, el next_step de declare-plan y el resumen de sesión enseñan --path <file>...

Acceptance: Una palabra que ningún subcomando toma y un flag de un solo valor repetido son un error de uso (código 2) que nombra el argumento y pide un flag por valor, y no escriben nada; las pistas y la documentación escriben [--path <file>]..., como el uso del CLI

## Plan

<!-- ospec:plan:start -->
- Files: `internal/iddsession/iddsession.go`, `internal/testdata/idd-session/many/expected/session/b-docs/session-summary.md`, `internal/testdata/idd-session/many/expected/session/latest.md`, `openspec/specs/idd/spec.md`, `openwiki/idd/flujo-idd.md`, `scripts/fixtures/context-baseline.json`, `scripts/lib/idd-next.js`, `scripts/lib/idd-next.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`, `skills/idd/SKILL.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El CLI rechaza como error de uso una palabra que ningún subcomando toma y un flag de un solo valor repetido; cuántas palabras toma cada comando sale de sus líneas de uso (record, review y foundation llevan subcomando)
- Un flag booleano repetido no se rechaza: no pierde nada
- Las pistas del CLI, el resumen de sesión y la documentación escriben un flag por valor, como el uso: [--path <file>]...
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-28T19:07:48.835Z)
- ev-2: check-run for checks-pass (2026-10-28T19:12:06.233Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-28T19:12:06.233Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-28T19:13:22.072Z)
- ev-5: check-run for checks-pass (2026-10-28T19:14:41.732Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-10-28T19:14:41.732Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-10-28T19:14:41.732Z)
- ev-8: living-doc-current for living-doc (2026-10-28T19:14:41.869Z)
<!-- ospec:evidence:end -->
