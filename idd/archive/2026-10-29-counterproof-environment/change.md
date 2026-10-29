# counterproof-environment

## Intent and acceptance

Límite 3 de E1.48: si los tests necesitan un build (TS en dist/) o dependencias que el worktree no enlaza, la base falla al importar y eso cuenta como rojo válido sin que el test detecte nada

Acceptance: Cuando el control falla de otra forma que la contraprueba y los checks declarados también fallan sobre la base sola, la contraprueba no es concluyente: la pareja o boundary-tests se registran con counterproof_skipped, su motivo y un aviso; con los checks pasando sobre la base, el rojo vale; el worktree enlaza además deps, .tox, .nox, .dart_tool, Pods y bower_components ignorados

## Plan

<!-- ospec:plan:start -->
- Files: `CHANGELOG.md`, `openspec/specs/idd/spec.md`, `openwiki/testing-quality/verification.md`, `scripts/lib/idd-check.test.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-workspace.js`, `scripts/lib/idd-workspace.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El control de entorno son los controles de los checks declarados: el mismo run counterproof con control: true que el control de un check, reutilizado por base y comando; para boundary-tests, el control del check que falló de otra forma ya es uno de ellos y basta para no concluir
- Una contraprueba no concluyente registra sus runs, para reutilizarlos, y la evidencia lleva solo counterproof_skipped con un motivo que nombra el check que falla sobre la base
- validateState exige que una contraprueba cuyo control falló de otra forma vaya con al menos un control de otro comando, y que todos ellos pasaran
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-29T00:57:10.695Z)
- ev-2: repro-run-pair for repro-test (2026-10-29T00:57:31.894Z)
- ev-3: check-run for checks-pass (2026-10-29T00:58:38.597Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-10-29T00:58:38.597Z)
- ev-5: migration-test for migration-compat-and-test (2026-10-29T00:58:50.203Z)
- ev-6: check-run for checks-pass (2026-10-29T00:59:58.415Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-10-29T00:59:58.415Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-10-29T00:59:58.415Z)
- ev-9: living-doc-current for living-doc (2026-10-29T00:59:58.561Z)
<!-- ospec:evidence:end -->
