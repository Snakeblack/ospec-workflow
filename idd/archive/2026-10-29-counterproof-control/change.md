# counterproof-control

## Intent and acceptance

Límite 1 de E1.48: un test de relleno junto a test -f marker cierra la pareja, porque la contraprueba falla al faltar marker en la base y no porque el test detecte el cambio

Acceptance: Con test -f marker y un test de relleno en test/, la pareja no cierra y el motivo nombra la contraprueba y su control, que falló igual sobre la base sin los tests del diff; un repro en un fichero nuevo lanzado por su ruta y un check que corre el test nuevo siguen cerrando

## Plan

<!-- ospec:plan:start -->
- Files: `CHANGELOG.md`, `openspec/specs/idd/spec.md`, `openwiki/testing-quality/verification.md`, `scripts/lib/idd-check.js`, `scripts/lib/idd-check.test.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-exec.js`, `scripts/lib/idd-exec.test.js`, `scripts/lib/idd-workspace.js`, `scripts/lib/idd-workspace.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El control corre en un worktree aparte de la base pura, montado solo cuando una contraprueba falla y no hay control previo del mismo comando sobre la misma base; la ruta del worktree se enmascara como <worktree> en la salida de los dos, para que la comparación no dependa de dónde se montó
- El control es un run counterproof con control: true y el mount de nada; la evidencia lo nombra junto a la contraprueba, y vale la contraprueba que falló si su control pasó, o falló con otro exit o con otra salida
- Para boundary-tests, una contraprueba que falla igual que su control no corta: siguen los checks declarados hasta uno cuyo rojo venga de los tests
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-29T00:48:18.242Z)
- ev-2: check-run for checks-pass (2026-10-29T00:49:44.052Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-29T00:49:44.052Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-29T00:49:57.487Z)
- ev-5: check-run for checks-pass (2026-10-29T00:51:06.542Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-10-29T00:51:06.542Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-10-29T00:51:06.542Z)
- ev-8: living-doc-current for living-doc (2026-10-29T00:51:06.693Z)
<!-- ospec:evidence:end -->
