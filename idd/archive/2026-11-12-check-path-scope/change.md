# check-path-scope

## Intent and acceptance

Un check de idd/config.yaml puede declarar sus rutas, y ospec check no lo ejecuta si el diff del cambio no toca ninguna (E1.67, #499)

Acceptance: Con un check acotado a src/**, un cambio que solo toca docs/** cierra sin ejecutarlo y el estado registra que se omitió y por qué; si después toca src/**, el siguiente ospec check lo ejecuta; añadir, quitar o cambiar las rutas de un check abre checks-changed; un idd/config.yaml sin rutas en ningún check se comporta como hoy

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-check.js`, `scripts/lib/idd-check.test.js`, `scripts/lib/idd-config.js`, `scripts/lib/idd-config.test.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`, `skills/idd/references/checks.md`, `web-doc/src/content/docs/idd/flujo-idd.md`
<!-- ospec:plan:end -->

`web-doc/src/content/docs/idd/flujo-idd.md` es la salida generada e ignorada del handbook: no se toca, y la página que cambia es su fuente, `handbook/idd/flujo-idd.md`.

## Decisions

<!-- ospec:decisions:start -->
- Un check acotado se escribe anidado bajo checks: (run: y paths:); paths admite lista en línea, en bloque o una sola ruta, y una lista vacía, una ruta absoluta o con .., una clave distinta de run y paths o un check sin run dan config-invalid (respuesta del usuario)
- Un check sin paths conserva la forma {name, command} en el estado y en la huella del árbol de checks, así que la evidencia y los checks-changed de los cambios abiertos antes de E1.67 siguen valiendo; solo un check acotado añade paths
- Una ruta toca un check cuando alguna ruta del diff del cambio contra su base (añadida, cambiada, borrada, los dos lados de un renombre o sin seguimiento) casa con sus paths, con la sintaxis glob de impact (respuesta del usuario)
- La omisión queda en la evidencia check-run como skipped, con el nombre y el motivo de cada check, en la salida de ospec check y en los avisos de ospec close; no se registra un run por check omitido (respuesta del usuario)
- Si todos los checks declaran paths, la configuración da config-invalid: al menos un check corre siempre, así que checks-pass nunca se queda sin ejecuciones (respuesta del usuario)
- Un check que el cambio añade o cambia respecto a la base (comando o paths) corre aunque el diff no toque sus rutas, para que el comando aprobado se ejecute al menos una vez (respuesta del usuario)
- La contraprueba de boundary-tests y sus controles de entorno usan solo los checks que corren en ese check: un check omitido no corre en ningún sitio de esa ejecución
- ospec run cuenta como el único check solo con un check declarado, como hasta ahora: con todos acotados prohibidos, ese check corre siempre
- El alcance sigue el diff del cambio contra su base aunque ospec check reciba --base, como checks-changed: un --base más estrecho no puede saltarse un check
- Los controles de entorno de la contraprueba de un par en ospec run también dejan fuera un check acotado que el diff del cambio no toca (readCheckScope), para que un e2e lento no corra en la base por un test unitario
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-11-12T14:05:03.028Z)
- ev-2: check-run for checks-pass (2026-11-12T14:07:20.609Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-12T14:07:20.609Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-12T14:07:20.609Z)
- ev-5: living-doc-current for living-doc (2026-11-12T14:07:20.764Z)
<!-- ospec:evidence:end -->
