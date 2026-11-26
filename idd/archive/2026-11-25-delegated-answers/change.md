# delegated-answers

## Intent and acceptance

Respuestas delegadas (E1.107): cada pregunta de un gate guarda la recomendación del modelo, y una ejecución automática autorizada puede resolver con la fuente delegated los gates que no son bloqueantes

Acceptance: Un gate open-facts con recomendación en todas sus preguntas se resuelve con la fuente delegated dentro de una ejecución autorizada y close lo lista; el mismo intento fuera de una ejecución, sobre un gate bloqueante o con una pregunta sin recomendación se rechaza con su causa; el corpus compartido lo fija en JS y en Go; el ADR está aceptado

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-25T20:55:50.585Z):

> continua

Answer 1 — open-facts, user, 2026-11-25T22:26:54.714Z:

> todas las recomendadas
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `docs/README.md`, `docs/architecture/component-map.yaml`, `docs/architecture/decisions/0013-respuestas-delegadas.md`, `docs/en/README.md`, `docs/roadmaps/harness-evolution.md`, `handbook/idd/flujo-idd.md`, `internal/testdata/idd-session/steps/expected/session/latest.md`, `openspec/specs/idd/spec.md`, `scripts/hooks/idd-session.test.js`, `scripts/lib/idd-close.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/turn-fence.js`, `scripts/lib/turn-fence.test.js`, `scripts/ospec.js`, `scripts/ospec.lifecycle.test.js`, `scripts/ospec.test.js`, `skills/idd/references/approvals.md`
<!-- ospec:plan:end -->

`scripts/lib/idd-close.js` y `scripts/ospec.test.js` quedaron sin tocar: `close` arma su resultado en `scripts/ospec.js`, y la prueba de punta a punta fue a `scripts/ospec.lifecycle.test.js`, junto a las de la valla de turnos. El corpus compartido suma `s-delegated` y `s-recommended` al caso `steps` de `internal/testdata/idd-session/`, que los hooks de Node y de Go leen igual.

## Decisions

<!-- ospec:decisions:start -->
- La recomendación de cada pregunta se registra con la orden nueva ospec record recommendation --gate <id> --question <n> (--answer | --none), válida en cualquier gate abierto, y se guarda en la entrada del gate como recommendations; repetirla con el gate abierto la sustituye y con el gate resuelto se rechaza
- La fuente delegated no admite --answer: el CLI compone la respuesta con las recomendaciones guardadas, así lo registrado es la recomendación literal
- La ejecución autorizada se identifica con OSPEC_AUTO_RUN=<id> (kebab-case, hasta 64 caracteres), que queda en el gate como run; delegated exige un turno terminado desde la apertura del gate y se rechaza sin contador de turnos. El registro en .ospec/auto/ queda para E1.108
- Solo open-facts admite delegated en esta versión; el resto de gates, la retracción con respuesta del usuario y un gate con alguna pregunta sin recomendación se rechazan con delegation-refused y su causa
- El estado crece de forma aditiva sin subir idd-state/v1: un CLI anterior lo sigue leyendo
- next muestra las recomendaciones en pending_decision; status y close devuelven delegated_answers, que no es un aviso; change.md marca la respuesta como delegated, run <id>
<!-- ospec:decisions:end -->

La revisión de confianza pidió dejar escrito dónde va la marca de la ejecución: el conductor pone `OSPEC_AUTO_RUN` solo en el entorno de su propia llamada a ospec que registra la respuesta, nunca en el de la sesión del modelo, que si no la heredaría en cada orden y podría aprobarse solo. Está en el ADR 0013, en REQ-idd-030 y en el límite declarado de E1.107, y E1.108 lo construye así.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-25T22:48:07.179Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-25T22:48:07.179Z)
- ev-3: migration-test for migration-compat-and-test (2026-11-25T22:48:47.253Z)
- ev-4: frozen-review for trust-review (2026-11-25T22:57:01.415Z, subagent-stop)
- ev-5: frozen-review for trust-review (2026-11-25T22:59:39.270Z, subagent-stop)
- ev-6: check-run for checks-pass (2026-11-25T23:01:27.850Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-11-25T23:01:27.850Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-11-25T23:01:27.850Z)
- ev-9: migration-test for migration-compat-and-test (2026-11-25T23:01:43.535Z)
- ev-10: living-doc-current for living-doc (2026-11-25T23:02:03.006Z)
<!-- ospec:evidence:end -->
