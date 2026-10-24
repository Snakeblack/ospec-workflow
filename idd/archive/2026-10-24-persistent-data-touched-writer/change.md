# persistent-data-touched-writer

## Intent and acceptance

persistent-data no se deriva por editar cualquier línea de un archivo que ya escribía (#416)

Acceptance: Editar una constante de un archivo que ya escribía, sin tocar su escritura, no deriva persistent-data; un script que solo escribe en el directorio de build no la deriva o queda excluido por defecto de forma documentada; el escenario del import a un módulo que escribe sigue derivándola; un test reproduce el caso de #416

## Plan

1. Scripts de build: `idd-impact.js` añade `BUILD_SCRIPTS` (`**/{prebuild,postbuild}.*`, `build.*` en la raíz, `**/{scripts,tools}/**/build.*`, `**/scripts/build/**`, `**/{vite,astro,webpack,rollup}.config.*`) a los patrones por defecto, y `persistentHit` de `idd-signals.js` no los cuenta por contenido, ni como fichero tocado ni como módulo importado. Su ruta sigue contando para las señales por ruta.
2. Retirada con respuesta: `ospec record retract --signal persistent-data --answer <texto> --source user|user-unverified` retira la señal cuando solo la deriva el contenido del diff (ninguna ruta cambiada casa con un patrón de `persistent-data`). Guarda `confirmed_by`, `answer` y `answer_source` en `retracted`, y `deriveSignals` (con `retracted`) no la vuelve a añadir mientras la razón sea la misma. El rechazo de la retirada sin respuesta lo explica en `how`.
3. Spec REQ-idd-012 (lista de build y su escenario), REQ-idd-006 (retirada con respuesta y su escenario) y el esquema de `retracted`. El skill IDD dice que se pregunte al usuario.

## Decisions

- Se mantiene el salto 0 (el fichero ya escribía), por decisión del usuario del 2026-10-24: en un store, una constante de nivel superior (nombre del fichero, versión del esquema) sí cambia el formato. El criterio 1 de #416 se cumple para los scripts de build, y para el resto queda la retirada con respuesta.
- La exclusión de build es por ruta, no por destino. Detectar `dist/` en la llamada no vale: en `postbuild.mjs` el destino es una variable. `impact.defaults: false` la quita, igual que el resto de valores por defecto.
- La retirada con respuesta guarda en `hits` cada hit de contenido del diff (`<razón>: <línea>`, como multiconjunto) y se mantiene mientras el diff no tenga ninguno más. Una escritura nueva o cambiada, o una ruta, la devuelven, porque la respuesta del usuario cubría lo que vio. Ese fue el WARNING del trust-review: atarla solo a la primera razón escondía escrituras añadidas después; el usuario eligió atarla a todos los hits. Solo vale para `persistent-data` por contenido; lo que deriva una ruta nunca se retira con respuesta.
- `build.*` suelto solo cuenta como script de build en la raíz o bajo `scripts/` y `tools/`, por la SUGGESTION del trust-review: un módulo de producto `src/build.ts` que escribe sigue derivando la señal. `pre/postbuild.*` y `*.config.*` de bundler valen en cualquier sitio.
- `deriveSignals` recibe `retracted` en lugar de filtrar en `applyDerivation`. Así una ruta de migración enmascarada por la razón de contenido sigue devolviendo la señal, y `diffConfirmation` ve lo mismo que `check`.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-24T11:20:17.833Z)
- ev-2: check-run for checks-pass (2026-10-24T11:24:49.643Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-24T11:24:49.643Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-24T11:25:01.272Z)
- ev-5: check-run for checks-pass (2026-10-24T11:26:35.512Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-10-24T11:26:35.512Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-10-24T11:26:35.512Z)
- ev-8: frozen-review for trust-review (2026-10-24T11:37:02.276Z, subagent-stop)
- ev-9: check-run for checks-pass (2026-10-24T11:40:05.923Z)
- ev-10: contract-spec-and-test for contract-spec-and-test (2026-10-24T11:40:05.923Z)
- ev-11: adr-impact-declaration for adr-impact-declaration (2026-10-24T11:40:05.923Z)
- ev-12: migration-test for migration-compat-and-test (2026-10-24T11:40:11.389Z)
- ev-13: frozen-review for trust-review (2026-10-24T11:42:18.303Z, subagent-stop)
- ev-14: living-doc-current for living-doc (2026-10-24T13:40:35.935Z)
<!-- ospec:evidence:end -->
