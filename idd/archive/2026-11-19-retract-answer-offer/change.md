# retract-answer-offer

## Intent and acceptance

ospec next y los hooks ofrecen retirar con la respuesta del usuario la señal por contenido que esa respuesta admite, en vez de empujar solo a su obligación

Acceptance: Cuando la obligación pendiente viene de persistent-data, public-contract o security-boundary que record retract --answer aceptaría, ospec next y el next de cada comando que escribe ofrecen ese retract con lo que el usuario confirma y los hits que cubre; la línea del paso en los hooks (Stop, SessionStart, PreCompact, en Node y en Go) deja de decir que no necesita respuesta del usuario y nombra la alternativa; si la respuesta no aplica, no se ofrece nada; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-18T23:47:35.047Z):

> resolvamos el fallo antes, por supuesto, debe funcionar perfecto, lo hacemos en la siguiente sesion

Answer 1 — open-facts, user, 2026-11-18T23:48:15.232Z:

> todas las recomendadas

Answer 2 — retract persistent-data, user, 2026-11-19T01:01:34.582Z:

> las recomendadas
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `README.md`, `docs/README.md`, `docs/en/README.md`, `docs/roadmaps/harness-evolution.md`, `handbook/idd/flujo-idd.md`, `internal/hooks/iddnudge.go`, `internal/hooks/iddnudge_test.go`, `internal/hooks/stop.go`, `internal/iddsession/catalog.json`, `internal/iddsession/iddsession.go`, `internal/iddsession/iddsession_test.go`, `internal/testdata/idd-nudge/README.md`, `internal/testdata/idd-nudge/case.json`, `internal/testdata/idd-session/steps/expected/session/latest.md`, `internal/testdata/idd-session/steps/expected/session/s-contract/session-summary.md`, `internal/testdata/idd-session/steps/expected/session/s-migration/session-summary.md`, `internal/testdata/idd-session/steps/expected/session/s-review/session-summary.md`, `openspec/specs/hooks/spec.md`, `openspec/specs/idd/spec.md`, `scripts/hooks/idd-session.test.js`, `scripts/hooks/lib/idd-nudge.js`, `scripts/hooks/lib/idd-nudge.parity.test.js`, `scripts/hooks/lib/idd-session.js`, `scripts/hooks/stop.js`, `scripts/hooks/stop.test.js`, `scripts/lib/idd-catalog.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-next.test.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-store.js`, `scripts/lib/turn-fence.js`, `scripts/lib/turn-fence.test.js`, `scripts/ospec.close.test.js`, `scripts/ospec.js`, `scripts/ospec.lifecycle.test.js`, `skills/idd/references/approvals.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- **Los hooks remiten a ospec next:** la línea del paso de los hooks (Node y Go) solo lee state.yaml, así que, cuando la obligación pendiente viene de una señal activa que la respuesta del usuario puede retirar (persistent-data, public-contract, security-boundary), nombra la alternativa y remite a ospec next, que decide con el diff si la respuesta aplica.
- **Una sola regla para la oferta:** ospec next ofrece la retirada con la respuesta del usuario exactamente cuando record retract --answer la aceptaría: las dos leen diffConfirmation, para las tres señales.
- **La obligación sigue siendo el paso:** next_step.command sigue siendo el comando de la obligación; la retirada va como alternativa en next_step.retract (señal, lo que el usuario confirma, hits y comando), en el how y en la salida de texto con los hits, para preguntar al usuario por esas líneas.
- **Sin diff legible no hay oferta:** si git no puede leer el diff al calcular la oferta, ospec next la omite sin fallar; record retract dará el error si se intenta.
- **La cabecera del Stop no promete que no haga falta el usuario:** la razón del Stop deja de decir que el paso no necesita respuesta del usuario, porque la alternativa sí la necesita.
- **La valla de turnos cubre la retirada con respuesta:** cada señal guarda en recorded_turn el turno en que se registró, y una retirada con --answer y --source user sin un fin de turno desde entonces queda user-unverified, con declared_source y la razón; record retract avisa y close la lista con la señal y la obligación que retiró. Una señal registrada antes no tiene recorded_turn y su retirada conserva su fuente. Revierte la decisión de E1.49 porque next ofrece ahora la retirada en cada paso.
- **Un Stop que pide seguir no cuenta un fin de turno:** el Stop (Node y Go) cuenta el turno después de la traza y solo cuando deja terminar el turno; uno que responde decision block para pedir al agente que siga (E1.51) no lo cuenta, porque el agente continúa sin respuesta del usuario, así que una respuesta registrada en esa continuación sigue vallada.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-18T23:53:05.441Z)
- ev-2: check-run for checks-pass (2026-11-18T23:59:08.419Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-18T23:59:08.419Z)
- ev-4: frozen-review for trust-review (2026-11-19T00:06:23.630Z, subagent-stop)
- ev-5: migration-test for migration-compat-and-test (2026-11-19T01:10:16.179Z)
- ev-6: check-run for checks-pass (2026-11-19T01:12:16.911Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-11-19T01:12:16.911Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-11-19T01:12:16.911Z)
- ev-9: check-run for checks-pass (2026-11-19T01:14:02.117Z)
- ev-10: contract-spec-and-test for contract-spec-and-test (2026-11-19T01:14:02.117Z)
- ev-11: adr-impact-declaration for adr-impact-declaration (2026-11-19T01:14:02.117Z)
- ev-12: frozen-review for trust-review (2026-11-19T01:22:49.093Z, subagent-stop)
- ev-13: check-run for checks-pass (2026-11-19T01:27:38.291Z)
- ev-14: contract-spec-and-test for contract-spec-and-test (2026-11-19T01:27:38.291Z)
- ev-15: adr-impact-declaration for adr-impact-declaration (2026-11-19T01:27:38.291Z)
- ev-16: migration-test for migration-compat-and-test (2026-11-19T01:27:47.909Z)
- ev-17: frozen-review for trust-review (2026-11-19T01:37:15.481Z, subagent-stop)
- ev-18: living-doc-current for living-doc (2026-11-19T01:37:31.097Z)
<!-- ospec:evidence:end -->
