# gate-turn-fence

## Intent and acceptance

Un gate resuelto con --source user sin un fin de turno posterior a su apertura queda user-unverified: el hook de fin de turno de cada host incrementa un contador local en .ospec/, el gate guarda el turno en que se abrió y close muestra las respuestas no verificadas

Acceptance: En cada target con fin de turno cableado, un gate resuelto con --source user en el mismo turno en que se abrió queda user-unverified con aviso en record y en close, y uno resuelto después de un fin de turno queda user; ningún caso bloquea

## Plan

<!-- ospec:plan:start -->
- Files: `internal/hooks/pretooluse.go`, `internal/hooks/stop.go`, `openspec/specs/idd/spec.md`, `scripts/configure/validate-opencode.js`, `scripts/hooks/pre-tool-use.js`, `scripts/hooks/stop.js`, `scripts/lib/idd-check.js`, `scripts/lib/idd-checks-config.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-review.js`, `scripts/lib/idd-signals.js`, `scripts/lib/target-profiles/opencode-plugin.js`, `scripts/ospec.js`, `skills/idd/SKILL.md`, `skills/idd/references/approvals.md`, `skills/idd/references/checks.md`
- Work units: 3
<!-- ospec:plan:end -->

Lo construido, en tres unidades:

1. Contador de turnos: `scripts/lib/turn-fence.js` (`countTurnEnd`) y `internal/hooks/stop.go` suman uno a `.ospec/turns` en cada Stop, antes de la traza; `scripts/hooks/pre-tool-use.js` e `internal/hooks/pretooluse.go` niegan escribirlo, con fixture de paridad.
2. Valla en el CLI: `fenceGates` se aplica en `mutateChange` (`scripts/lib/idd-store.js`), el único punto por el que pasa toda escritura del estado, así que los gates que abren `record`, `check`, `review` y `signals` quedan cubiertos sin tocar `idd-check.js`, `idd-review.js` ni `idd-signals.js`. `validateState` (`idd-contract.js`) comprueba los campos nuevos, `recordGate` (`idd-record.js`) sigue siendo idempotente con la fuente declarada, `scripts/ospec.js` avisa en `record` y en `close`, e `idd-workspace.js` deja `.ospec/turns` fuera de todo diff y snapshot.
3. Targets y documentación: el plugin de OpenCode (`opencode-plugin.js`, validado por `validate-opencode.js`) llama al Stop al terminar el turno de la sesión raíz; la skill, `approvals.md`, las specs de IDD y de hooks (REQ-hooks-030) y la documentación de usuario.

Dentro de la segunda unidad, por las respuestas «A» y «A2», la aprobación de los checks pasa al gate: `ospec check` no ejecuta checks ni ajustes sin aprobar (`idd-check.js`, `scripts/ospec.js`), el paso `configure-checks` y el `how` de los contratos piden escribir y preguntar en `checks-changed` (`idd-checks-config.js`, `idd-next.js`), y `references/checks.md` lo explica.

## Decisions

<!-- ospec:decisions:start -->
- Los gates se piden terminando el turno, nunca con la herramienta de pregunta del host; una respuesta --source user dentro del mismo turno en que se abrió el gate queda user-unverified (respuesta del usuario: «todas las recomendadas»)
- Sin contador legible, una respuesta --source user queda user-unverified con aviso; no bloquea
- record gate avisa al degradar, con el gate y el motivo; close lista todos los gates user-unverified, declarados o degradados, con el motivo de los degradados
- El contador vive en .ospec/turns, compartido por workspace; las herramientas de escritura no lo tocan, como los recibos de review; un gate abierto antes de E1.49, sin turno guardado, conserva la fuente declarada
- La valla cubre los seis gates, ambiguous-intent incluido; record retract --answer queda fuera porque no abre gate; un checks-changed reabierto con otros checks guarda el turno de su nueva apertura
- checks-changed se pregunta en el gate: el agente escribe el check propuesto en idd/config.yaml, ospec check abre checks-changed con los valores exactos y el agente termina el turno preguntando; si el usuario lo rechaza, restaura el fichero. Desaparece la aprobación previa a escribir, que dejaba el gate respondido en el mismo turno en que se abría (respuesta del usuario: «A»)
- ospec check no ejecuta checks ni ajustes sin aprobar: con checks o ajustes de ceremonia distintos de la base y sin una entrada resuelta que los apruebe, abre checks-changed con esos valores y para sin correr checks, fitness ni contraprueba; el siguiente check, ya aprobado, los ejecuta. Así ningún comando escrito en idd/config.yaml corre antes del sí del usuario (respuesta del usuario: «A2»)
- Una respuesta a checks-changed que la valla deja user-unverified, o una reenviada, sigue aprobando los checks, con el aviso de la valla: el CLI no puede verificar quién respondió y bloquearla no protegería (el agente declara la fuente) y dejaría sin checks un workspace sin hooks. La spec, approvals.md y checks.md lo dicen y un test lo fija (respuesta del usuario: «la recomendada», al WARNING F-2f3f984d8324eff0 de la review 2)
<!-- ospec:decisions:end -->

Decisiones de desarrollo:

- La valla vive en `mutateChange` y no en cada camino que abre un gate: un gate abierto o cambiado mientras está abierto (comparado sin sus turnos con el estado anterior) toma el turno; uno resuelto con `opened_turn` toma `resolved_turn` y, si la respuesta es `user` sin un fin de turno en medio, queda `user-unverified` con `declared_source` y `unverified_reason`.
- `.ospec/turns` se excluye de los diffs como los recibos: si no, cada fin de turno cambiaría la huella del árbol y dejaría la evidencia obsoleta (`close` fallaba con `evidence-stale` sin la exclusión).
- OpenCode no tiene `session.idle` en 2.x: el fin de turno es `session.execution.succeeded` (visto en vivo), y se cuentan también `failed` e `interrupted`, de la misma familia de eventos y no observados; en 1.x es `session.idle`. Un subagente emite su propio fin de turno con `parentID`, así que solo cuenta la sesión raíz, leída con `ctx.session.get` o `client.session.get`; verificado en vivo en 1.18.35 y 2.0.32 (un turno con subagente deja la cuenta en 1).
- `persistent-data` lo deriva el contenido del diff y se cumple con un test de compatibilidad: los campos nuevos de `idd-state/v1` son opcionales y un estado anterior sigue valiendo.
- Con checks o ajustes sin aprobar, `check` para antes de ejecutar checks, fitness o contraprueba (`checksApproved` en `idd-check.js`, `awaitChecksApproval` en `scripts/ospec.js`) y solo abre o actualiza `checks-changed`. Responde `missing`, con `checks-pass` pendiente y la decisión del gate, y no `needs-decision`: es la regla general de `checkVerdict`, que antepone lo que falta. El paso `configure-checks` apunta ahora a `ospec check`. El `how` de `contract-spec-and-test` que pedía aprobar `contracts.documents` antes de escribirlo sigue el mismo camino, porque `contracts` es un ajuste de `checks-changed`.
- `ospec run` con el comando del único check no se para: ese comando lo escribe el agente en la llamada, como cualquier otro que pueda ejecutar, y no lo lee de `idd/config.yaml`.
- Verificado antes del cambio, en un proyecto temporal: `ospec check` ejecutaba un check sin aprobar (creaba un fichero marcador y registraba `run-1`) y solo después abría `checks-changed`.
- La review de confianza sugirió vallar también `record retract --answer`; queda fuera por la respuesta del usuario (los seis gates, sin retract).
- Seguimiento fuera del cambio: `scripts/evals/bench/arms.js` cuenta como autorrespondidos solo los gates con `source` `user`; un gate vallado pasa a `user-unverified` y el banco debería leer también `declared_source` cuando E4.6 lo mida.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-10-29T11:02:17.330Z)
- ev-2: frozen-review for trust-review (2026-10-29T11:06:55.196Z, subagent-stop)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-29T11:08:38.540Z)
- ev-4: check-run for checks-pass (2026-10-29T14:44:36.610Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-10-29T14:44:36.610Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-29T14:44:36.610Z)
- ev-7: migration-test for migration-compat-and-test (2026-10-29T14:44:56.656Z)
- ev-8: frozen-review for trust-review (2026-10-29T14:48:30.185Z, subagent-stop)
- ev-9: check-run for checks-pass (2026-10-29T15:02:53.767Z)
- ev-10: contract-spec-and-test for contract-spec-and-test (2026-10-29T15:02:53.767Z)
- ev-11: adr-impact-declaration for adr-impact-declaration (2026-10-29T15:02:53.767Z)
- ev-12: migration-test for migration-compat-and-test (2026-10-29T15:03:04.172Z)
- ev-13: frozen-review for trust-review (2026-10-29T15:06:05.821Z, subagent-stop)
- ev-14: living-doc-current for living-doc (2026-10-29T15:06:16.098Z)
<!-- ospec:evidence:end -->
