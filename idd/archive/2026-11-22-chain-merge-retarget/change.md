# chain-merge-retarget

## Intent and acceptance

En una cadena de PR, reapuntar la PR siguiente antes de fusionar la anterior con borrado de rama

Acceptance: chained-pr (SKILL.md y chain-playbook.md) y el paso 6 de AGENTS.md mandan reapuntar la PR siguiente a la base o al tracker antes de fusionar con --delete-branch, en las dos formas de cadena; el playbook dice cómo recuperar una PR hija que se cerró; el Post-Archive Flow de AGENTS.md nombra la línea de Verificación directa que lee manifest-sync.test.js; el roadmap anota el arreglo por delante de E1.106; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-21T23:44:22.904Z):

> arreglo idd en la proxima sesion, por delante del 1.106

Answer 1 — open-facts, user, 2026-11-22T00:06:23.198Z:

> todas las recomendadas: (1) solo en chained-pr y AGENTS.md; (2) sí, la recuperación como fila de la tabla de reparaciones del playbook; (3) reapuntar la PR n+1 y luego gh pr merge <n> --merge --delete-branch
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `AGENTS.md`, `docs/roadmaps/harness-evolution.md`, `skills/chained-pr/SKILL.md`, `skills/chained-pr/references/chain-playbook.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- La regla de reapuntar va solo en chained-pr y AGENTS.md: el how de branching de ospec team (delete the branch after its merge) vale para cualquier PR y sigue siendo cierto si la siguiente se reapunta antes
- En las dos formas de cadena se reapunta la PR siguiente a la base de la que se fusiona antes de gh pr merge --delete-branch, sin contar con que el host la reapunte
- El playbook añade una sección para reabrir una PR cerrada por un merge: restaurar la rama desde el headRefOid, reabrir, reapuntar, borrar otra vez la rama y esperar su CI
<!-- ospec:decisions:end -->

La recuperación va en una sección propia del playbook y no como fila de la tabla de reparaciones: esa tabla trata de diffs que enseñan otro tramo, y una PR cerrada no enseña ninguno.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-22T00:09:38.393Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-22T00:09:38.393Z)
- ev-3: living-doc-current for living-doc (2026-11-22T00:09:55.889Z)
<!-- ospec:evidence:end -->
