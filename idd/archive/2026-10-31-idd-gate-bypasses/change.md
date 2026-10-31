# idd-gate-bypasses

## Intent and acceptance

Los gates de IDD dejan de poder saltarse: irreversible-operation pregunta por cada operación nueva, --operation rechaza ids desconocidos, la review de confianza ve lo commiteado con base null y check --base no se salta checks-changed

Acceptance: Tras aprobar una operación irreversible, otra distinta (declarada, abierta a mano o en el diff) vuelve a abrir el gate; un --operation fuera de los ids es error de uso que los lista; review start de un cambio con base null revisa también lo commiteado; check --base <ref> con config cambiada abre checks-changed sin ejecutar nada

## Plan

<!-- ospec:plan:start -->
- Files: `openspec/specs/idd/spec.md`, `openwiki/idd/flujo-idd.md`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-signals.js`, `scripts/lib/idd-signals.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`, `skills/idd/SKILL.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Una entrada de irreversible-operation lista en operations las operaciones por las que pregunta y su respuesta aprueba solo esas; una operación que ninguna entrada lista se une a la entrada abierta, que se vuelve a preguntar con todas, o abre otra (open facts 2A y 3A)
- Una operación es el motivo sin el prefijo irreversible operation: (las declaradas, cada sentencia destructiva por tipo y fichero, y el motivo de record gate --open), así que una entrada anterior sin operations pregunta por la operación de su motivo
- La skill idd no lista los ids de --operation: el techo de contexto es su tamaño actual en los 7 targets, y el error de uso, --help, el spec y la wiki ya los dan
- check contrasta idd/config.yaml siempre con la base del cambio; --base solo elige la base del diff
<!-- ospec:decisions:end -->

Es la PR2a de la review general del 2026-10-29: los cuatro gates que se podían saltar. La fricción del CLI (PR2b) va en otra PR. El usuario resolvió los open facts con las opciones recomendadas: un `--operation` desconocido es error de uso que lista los ids y remite a `record gate --open --reason`; varias operaciones nuevas van en una sola entrada; una operación nueva con la entrada abierta se une a ella; y cuentan todas las sentencias destructivas del diff, una por tipo y fichero. Antes, `record gate --open` devolvía «gate already recorded» para cualquier operación una vez resuelta la primera, y `--operation "delete user data"` no abría nada. La review de confianza usaba HEAD como base cuando el cambio se abrió sin commit, y `check --base` comparaba los checks con esa base.

El estado gana el campo opcional `operations` en las entradas de `irreversible-operation`. Un `state.yaml` anterior sigue siendo válido sin migrar, y una versión anterior lee las entradas nuevas porque `validateState` no rechaza claves desconocidas en un gate.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-31T17:50:44.441Z)
- ev-2: migration-test for migration-compat-and-test (2026-10-31T17:57:45.757Z)
- ev-3: check-run for checks-pass (2026-10-31T17:59:37.836Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-10-31T17:59:37.836Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-31T17:59:37.836Z)
- ev-6: living-doc-current for living-doc (2026-10-31T17:59:54.274Z)
<!-- ospec:evidence:end -->
