# turn-fence-worktree

## Intent and acceptance

En un git worktree fuera del directorio del proyecto, la respuesta a un gate queda user-unverified: el hook de fin de turno cuenta en .ospec/turns del repositorio del cwd de la sesión y el CLI lee la cuenta del worktree, que no existe

Acceptance: Una respuesta --source user registrada en un worktree tras un fin de turno contado en el repositorio principal queda user; una registrada antes de que acabe el turno sigue user-unverified

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/hooks/spec.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-store.js`, `scripts/lib/turn-fence.js`, `scripts/lib/turn-fence.test.js`, `scripts/ospec.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- En un worktree enlazado, el CLI cuenta los fines de turno como la suma de .ospec/turns del propio worktree y la del repositorio principal, que localiza siguiendo .git, gitdir y commondir sin lanzar git; los hooks de Node y Go no cambian
- Solo cuentan el propio worktree y el principal, no los worktrees hermanos; un repositorio principal desnudo no aporta cuenta
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-06T10:44:05.208Z)
- ev-2: migration-test for migration-compat-and-test (2026-11-06T10:44:23.650Z)
- ev-3: check-run for checks-pass (2026-11-06T10:47:06.217Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-06T10:47:06.217Z)
- ev-5: migration-test for migration-compat-and-test (2026-11-06T10:47:14.577Z)
- ev-6: check-run for checks-pass (2026-11-06T10:48:28.617Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-06T10:48:28.617Z)
- ev-8: living-doc-current for living-doc (2026-11-06T10:48:43.723Z)
<!-- ospec:evidence:end -->
