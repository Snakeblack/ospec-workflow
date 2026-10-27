# greenfield-foundation-hint

## Intent and acceptance

ospec next y record intent sugieren, sin bloquear, la skill foundation en un proyecto sin código fuente ni docs/product ni docs/architecture, y la skill idd se la ofrece al usuario como opción

Acceptance: En un proyecto sin código fuente (solo manifiestos, README u otra documentación) y sin docs/product ni docs/architecture, ospec next y la respuesta de record intent llevan la sugerencia foundation con su reason y su how, en JSON y en texto, y el paso siguiente y el código de salida son los mismos que sin ella; con código o con docs/product o docs/architecture no aparece; sobre los repos de los escenarios del banco aparece en todo-spa y receta-spa y no en los seis con código ni en salas; la skill idd la ofrece como opción

## Plan

1. `scripts/lib/idd-next.js`: `foundationSuggestion(files)` decide la sugerencia con la clasificación de rutas de las señales (`classifyPath`), y `nextForChange` y el paso `open-change` de `nextForProject` la añaden solo en `FOUNDATION_STEPS` (`open-change`, `resolve-gate`, `declare-plan`). Tests unitarios en `idd-next.test.js`, también sobre los repos de los escenarios del banco.
2. `scripts/lib/idd-workspace.js`: `readProjectFiles(root)` lista con `git ls-files` los ficheros versionados y sin versionar no ignorados bajo la raíz, sin `idd/` ni `.ospec/`, o null si git falla. `scripts/ospec.js` los lee en `next` solo en esos pasos y en `record intent`. Test de extremo a extremo en `ospec.test.js`; el de branching de REQ-idd-023 gana un `src/a.js` para no mezclar la sugerencia.
3. Contrato: REQ-idd-011 en `openspec/specs/idd/spec.md`, con su escenario.
4. Skill y documentación: `skills/idd/references/architecture.md` (y su test en `idd-protocol.test.js`), `README.md` y E4.10 en el roadmap, que sigue `pending` con una nota de avance.

## Decisions

- Respuestas del usuario al gate `open-facts` (2026-10-27, las recomendadas):
  - Código: cuentan los ficheros que git ve bajo la raíz del CLI (`--root` o el directorio actual), versionados y sin versionar no ignorados, sin `idd/` ni `.ospec/`. Es código lo que las señales clasifican como producto o test; manifiestos, lockfiles, documentación y el resto (`.gitignore`, `LICENSE`, `.github/`, configuración) no. Cualquier fichero bajo `docs/product/` o `docs/architecture/` apaga la sugerencia.
  - Repetición: sin estado nuevo. Sale en `ospec next` sin cambio abierto, en la respuesta de `record intent` y en `next` de un cambio mientras su paso es `resolve-gate` o `declare-plan`; con el plan declarado ya no sale, y desaparece en cuanto hay código. Su `how` la ofrece una vez; `ospec status` no la muestra.
  - Texto y fallos: id `foundation`, reason «the project has no source code and no docs/product or docs/architecture» y how «offer the user the foundation skill before the first change, as an option: it records the product docs, ADRs and idd/config.yaml and writes no code; if the user declines, go on with the change». Si git no puede listar los ficheros, no hay sugerencia ni error, y nunca cambia `next_step` ni el código de salida. `references/architecture.md` lo explica sin crecer `SKILL.md`.
  - Alcance: este cambio es la parte de producto. E4.10 sigue `pending` con una nota de avance hasta medirlo en el banco, en el bloque D, detrás de la corrida de validación de E4.6.
- La detección es una función pura de la lista de rutas, y `ospec.js` solo lee la lista con git en los pasos que ofrecen la sugerencia, para no pagar un `git ls-files` en cada `next`.
- El test sobre los repos del banco lee los ficheros con `fs`, no con git, porque esos repos no son work trees: comprueba la regla, no el listado.
- El diff deriva `persistent-data` porque `scripts/ospec.js` ya escribe ficheros, aunque el cambio no toca ninguna escritura. Como en E5.12, `migration-compat-and-test` se cubre con los tests de `idd-store`, `idd-next` y `ospec.test.js`: nada persistido cambia y los estados guardados siguen valiendo.
- La cita de `accessibility` del intent apunta a `scripts/ospec.js:1122`, la línea que imprime `suggestion <id>:` en la base; tras el cambio esa línea está en la 1127.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-27T16:12:22.424Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-27T16:12:22.424Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-27T16:12:22.424Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-27T16:13:23.948Z)
- ev-5: living-doc-current for living-doc (2026-10-27T16:13:32.499Z)
<!-- ospec:evidence:end -->
