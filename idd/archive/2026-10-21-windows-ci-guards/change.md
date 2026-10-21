# windows-ci-guards

## Intent and acceptance

El test de checks greenfield reintenta en Windows una página que no termina de cargar, y el test de presupuesto de la skill idd la mide en CRLF en todas las plataformas

Acceptance: INFRA_FAILURE reconoce 'the page did not finish loading' y un test fija qué errores se reintentan (nunca un fallo de aserción con veredicto); con la skill idd por encima de 12 KB en CRLF el test de presupuesto falla también en Linux

## Plan

1. `checks-greenfield.test.js` (OSP-022, #344, E1.30): `INFRA_FAILURE` añade `the page did not finish loading` (`browser.js` l.150). La condición de reintento pasa a un predicado `retriable(result)` y un test fija los cinco errores de infraestructura y que no se reintenta un fallo con veredicto, sin error o que ha pasado.
2. `idd-protocol.test.js` (OSP-028, #347): el presupuesto de 12 KB de la skill `idd` se mide con los finales de línea en CRLF (`protocolBytes`), como en un checkout de Windows. Un texto de 12 000 B en LF con 300 líneas lo supera.

## Decisions

- El predicado y la medición se quedan en sus ficheros de test: nadie más los usa, y exportarlos desde un fichero de test lo ejecutaría al importarlo.
- No se sube `LOAD_TIMEOUT_MS` ni se baja `CONCURRENCY`. Si se absorbe más de un reintento por semana, el siguiente paso es `CONCURRENCY = 2` en win32 (Fase B de la auditoría del 2026-10-21).
- No se recupera la frase de la skill `idd` perdida en los recortes: queda fuera de este cambio (margen de 52 B en CRLF).
- Comprobación manual con ediciones temporales ya revertidas (`INFRA_RETRIES = 1`): con `LOAD_TIMEOUT_MS = 30`, dos checks de `receta-spa` se reintentaron por `the page did not finish loading` y el test pasó; con `LOAD_TIMEOUT_MS = 1`, todos se reintentaron y el test siguió fallando.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-21T08:14:43.343Z)
- ev-2: check-run for checks-pass (2026-10-21T08:16:55.041Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-21T08:16:55.041Z)
- ev-4: living-doc-current for living-doc (2026-10-21T08:17:09.247Z)
<!-- ospec:evidence:end -->
