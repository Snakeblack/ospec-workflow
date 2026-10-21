# bench-persona-credentials

## Intent and acceptance

En Claude, el agente de los brazos ospec refresca la credencial OAuth en su copia de la configuración del banco y deja sin login a la persona, que sigue con el original; además, una persona que falla siempre deja la ejecución en «Continúa» hasta agotar los turnos

Acceptance: Tras refrescar el agente la credencial en su copia, la persona sigue autenticándose; y dos fallos seguidos de la persona detienen el banco sin registrar la ejecución, en vez de gastar los turnos

## Plan

1. `hosts/claude.js`: `shareLogin` copia la credencial con `expiresAt` más tardío sobre la otra (0600) antes de cada turno del agente ospec y de cada llamada a la persona; sin fichero no hace nada.
2. `driver.js`: dos fallos seguidos de la persona → `persona-error`, sin juzgar; `bench.js` sale con código 4 sin registrar la ejecución.
3. Spec del banco (REQ-bench-002 y 003) y README.

## Decisions

- Causa verificada en idd-7 (2026-10-21): el agente refrescó el token caducado en su copia de la configuración y rotó el refresh token; el original quedó sin `refreshToken` y las 29 llamadas a la persona fallaron con «OAuth session expired». El driver respondía «Continúa, por favor» y la ejecución gastó 30 turnos.
- Respuestas del usuario: gana el `expiresAt` más tardío y se sincroniza antes de cada llamada; dos fallos seguidos paran todo el banco sin registrar (código 4); sin `.credentials.json` no se hace nada.
- La persona sigue en la configuración original, sin el router de IDD, para que sea la misma en todos los brazos.
- El texto del error viaja en `persona_error` de la ejecución anulada, que nunca se registra, así que el schema del record no cambia.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-21T21:40:32.442Z)
- ev-2: check-run for checks-pass (2026-10-21T21:41:47.002Z)
- ev-3: migration-test for migration-compat-and-test (2026-10-21T21:41:57.495Z)
- ev-4: check-run for checks-pass (2026-10-21T21:42:55.457Z)
- ev-5: living-doc-current for living-doc (2026-10-21T21:42:58.119Z)
<!-- ospec:evidence:end -->
