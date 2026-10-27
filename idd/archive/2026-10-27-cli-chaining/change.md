# cli-chaining

## Intent and acceptance

El CLI encadena lo que ya sabe: record intent declara el plan, cada comando que escribe da el next completo, check --close cierra si el veredicto es ready y un run verde con el comando del check cuenta como ese check

Acceptance: Un bugfix cierra con 4 llamadas al CLI (intent, run en rojo, run en verde y close) y una feature con una pregunta con 6; los tests de cada atajo fijan que la evidencia es la misma que por el camino largo

## Plan

1. `record intent` acepta los flags del plan de `signals` y registra intent y plan en la misma escritura (`planContext` y `declarePlan` en `scripts/ospec.js`, que comparte con `signals`).
2. `changeNext` da el `next` de `ospec next --change`, y lo devuelven `record`, `signals`, `run`, `check` y `review`.
3. Un `ospec run` del único check declarado cuenta como ese check: `check` se parte en `readCheckInputs`, `readCheckOutcome` y `settleCheck`, que `run` reutiliza; `deferImpacts` (`scripts/lib/idd-check.js`) deja los fitness checks a `ospec check`.
4. `check --close` (`checkAndClose`) cierra con `ready` y, si no, se rechaza como `close`, con el resultado del check; `next` propone `--close` cuando solo quedan obligaciones que asienta el check y el living-doc.
5. Contrato REQ-idd-011 y REQ-idd-014, skill `idd`, README y roadmap.

## Decisions

- Respuestas del usuario al gate `open-facts` (2026-10-27, las recomendadas):
  - Plan: `record intent` acepta todos los flags del plan de `signals` (`--path`, `--work-units`, `--decision`, `--operation`, `--adr`, `--quality`); con `--ambiguous`, un flag del plan es un error de uso, y la llamada que resuelve el intent sí los acepta.
  - Run = check: el `--command` coincide byte a byte, salvo los espacios de los extremos, con el comando de un check, y el proyecto declara solo ese check. Con varios checks el run no cuenta.
  - Rojo y fitness: un run rojo con el comando del check cuenta como un check fallido y devuelve `checks-pass` a `pending`; el verde asienta lo mismo que `check`, salvo los fitness checks de ADR, que solo corren en `ospec check`.
  - `--close`: con un veredicto distinto de `ready`, `check --close` sale con 1 y `close-refused`, como `close`, y el JSON lleva el resultado del check junto al error.
- El run que cuenta como check graba dos runs de la misma ejecución: el suyo (`repro-test`, `tdd-red-green` o `migration-test`, ligado al árbol de fuentes) y uno `checks` con el nombre y el comando declarados, ligado al árbol del check. Así la evidencia `check-run` tiene la forma y el árbol de la que deja `ospec check`, y `close` la revalida igual.
- Con fitness checks por correr, el run no llama a `settleImpacts`: con una lista de runs vacía la daría por satisfecha sin ejecutarlos. `deferImpacts` conserva la evidencia del árbol actual y, si no la hay, la devuelve a `pending` con un motivo que nombra `ospec check`.
- Lo que `check` rechaza antes de ejecutar (`kind-mismatch`, `cite-outside-plan`) no rechaza el run: queda como run de test, como antes, con un aviso que nombra el rechazo.
- `next` añade `--close` al comando del check, no al `how`: el `how` está en el catálogo que leen los hooks de Go, y cambiarlo obligaría a regenerar sus golden sin aportar nada. Los hooks de sesión usan el `how`, así que no cambian.
- Las demás órdenes `record` también devuelven ahora la sugerencia `foundation`, porque su `next` es el de `ospec next`. REQ-idd-011 decía que no; el contrato pasa a decir que la devuelven como `next`, y la skill sigue ofreciéndola una vez.
- La línea de uso de `ospec run` gana una tercera línea, así que el escenario «A usage error names only its subcommand» deja de contar dos.
- En los tests, el `node --test` de los proyectos temporales corre sin `NODE_TEST_CONTEXT`: heredado del runner, el proceso anidado informa al padre y sale con 0 aunque falle un test.
- La cita de `accessibility` del intent apunta a `scripts/ospec.js:146`, la línea de `--json` en la base; tras el cambio está en la 150.
- El diff deriva `persistent-data` porque `scripts/ospec.js` ya usa `writeFile`, aunque el cambio no toca ninguna escritura. Como en E4.10, `migration-compat-and-test` se cubre con los tests de `idd-store`, `idd-contract` y `ospec.test.js`: `idd-state/v1` no cambia y los estados guardados siguen validando.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-27T20:30:04.591Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-27T20:30:04.591Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-27T20:30:04.591Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-27T20:31:02.441Z)
- ev-5: living-doc-current for living-doc (2026-10-27T20:31:19.873Z)
<!-- ospec:evidence:end -->
