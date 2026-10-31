# idd-cli-friction

## Intent and acceptance

Cerrar la fricción del CLI de IDD: flags aceptados y descartados, bucle del intent ambiguo, isTestPath que toma producto por test, signals registradas sin listado de solo lectura, review sin candidateCommand, CHANGELOG escrito antes de guardar el estado en close, salida obsoleta de idd-next y configure-checks, y el arreglo que solo toca tests sin kind que le encaje

Acceptance: Cada caso de los hallazgos 5-11 de la review (engram #1482) y del pendiente (f) de PR1c tiene un test que fallaba en la base y pasa: un flag que el comando no toma da exit 2; --ambiguous con campos de resolución da exit 2 y la skill remite al record intent de next; Latest.java, Contest.java, Contests.cs y src/spec/openapi.js son producto; las signals registradas se listan sin escribir; review propone el candidateCommand; un close cuyo estado no se guarda deja el CHANGELOG intacto; next imprime la forma vigente de --open-fact; un bug que solo toca tests puede cerrar

## Plan

<!-- ospec:plan:start -->
- Files: `openspec/specs/idd/spec.md`, `scripts/lib/idd-check.js`, `scripts/lib/idd-checks-config.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-next.test.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/idd-signals.js`, `scripts/lib/idd-signals.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`, `skills/idd/SKILL.md`, `skills/idd/references/checks.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Pendiente (f), opción A' (respuesta del usuario «si», que sustituye la omisión incondicional): un par cuyo diff no cambia código de producto omite la contraprueba, y check reabre repro-test o tdd-red-green si el diff cambia producto después, porque sin esa regla un test débil registrado antes del arreglo de producto cerraría el par (el agujero de E1.48)
- Hallazgo 11, opción 6A (respuesta del usuario «si», que sustituye quitar command): configure-checks mantiene command ospec check --change <id>, como exige REQ-idd-011 y eligió E1.49; se corrige el texto obsoleto de la spec y references/checks.md dice que se ejecuta una vez escrita la configuración
- record intent rechaza --answer y --source solo cuando el cambio no tiene gate ambiguous-intent: repetir la resolución sigue siendo idempotente
- close comprueba la configuración de entrega antes de guardar el estado, así que una configuración ilegible sigue rechazando el primer close sin escribir nada
<!-- ospec:decisions:end -->

Notas:

- El gate `open-facts` se resolvió con «todo lo recomendado»: exit 2 para un flag que el uso del comando no nombra y para las respuestas sin nada que resolver; `--ambiguous` solo con `--request`; nombres de test de Java y .NET con sus mayúsculas, `*Tests.java` incluido, y `spec/` bajo la raíz solo para Ruby; `status` lista las signals; el CHANGELOG después del estado cerrado; una sola PR con release patch.
- Dos recomendaciones se replantearon al implementarlas, y el usuario eligió las nuevas (las dos primeras decisiones). Omitir la contraprueba sin más dejaba cerrar un test débil registrado antes del arreglo: lo destapó el test de E1.48 del test que ya pasa en la base. Quitar `command` de `configure-checks` contradecía REQ-idd-011.
- El hallazgo 8 era parcial: `ospec signals --change <id> --json` sin flags ya listaba las signals registradas, pero pasando por el lock de escritura.
- Fuera del plan: `scripts/lib/idd-workspace.js` (`onlyTestsAndDocs`), los techos de contexto de `scripts/fixtures/context-baseline.json` (la skill baja 7 B), el openwiki de verificación y el onboarding de desarrollo. `idd-record.js` e `idd-checks-config.js` estaban en el plan y no cambian.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-31T23:13:44.429Z)
- ev-2: check-run for checks-pass (2026-10-31T23:17:01.503Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-31T23:17:01.503Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-31T23:17:01.503Z)
- ev-5: migration-test for migration-compat-and-test (2026-10-31T23:18:52.206Z)
- ev-6: living-doc-current for living-doc (2026-10-31T23:19:13.664Z)
<!-- ospec:evidence:end -->
