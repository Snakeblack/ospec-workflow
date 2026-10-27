# cli-terse-output

## Intent and acceptance

El CLI ahorra tokens al abrir y al cerrar: el next de un cambio nuevo imprime la plantilla de categorías según el perfil del proyecto, el CLI escribe Plan y Decisions del living-doc desde --path y --decision "<texto>", y cada orden que escribe imprime una línea de estado y otra de next, con --json sin campos vacíos

Acceptance: Los rechazos de record intent reproducidos de idd-7 reciben la plantilla antes de fallar, y los de url-state y accessibility en proyectos sin UI dejan de fallar; un cambio con decisión cierra sin editar change.md a mano; los techos de bytes de las salidas quedan fijados en tests

## Plan

1. Plantilla por perfil: `projectCategories`, `featureCommand` y `featureCoverageHow` (`scripts/lib/idd-facts.js`); `next` sin cambio abierto devuelve `next_step.feature`, y `record intent` y su rechazo usan las categorías del proyecto. La cobertura guardada exige las cinco categorías base (`idd-contract.js`).
2. Living-doc escrito por el CLI: `--decision "<texto>"` repetible, `plan.decisions` (`idd-record.js`, `idd-contract.js` y el `validPlan` de Go), bloques entre marcadores en `idd-store.js`, y `livingDocStatus` y `decisionBullets` que ignoran los marcadores (`idd-close.js`).
3. Salida mínima: `describeStep` y las descripciones de las órdenes que escriben, `nextAfterWrite` sin `intent` y `--json` compacto (`scripts/ospec.js`), con techos de bytes en `scripts/ospec.test.js`.
4. Contrato REQ-idd-003, 004, 011, 012 y 018, skill `idd`, `references/open-facts.md`, README y golden de `idd-session`.

<!-- ospec:plan:start -->
- Files: `CHANGELOG.md`, `README.es.md`, `README.md`, `docs/roadmaps/harness-evolution.md`, `internal/iddsession/catalog.json`, `internal/iddsession/iddsession.go`, `internal/iddsession/iddsession_test.go`, `internal/testdata/idd-session/many/expected/session/b-docs/session-summary.md`, `internal/testdata/idd-session/many/expected/session/latest.md`, `internal/testdata/idd-session/steps/expected/session/latest.md`, `internal/testdata/idd-session/steps/expected/session/s-living/session-summary.md`, `openspec/specs/idd/spec.md`, `scripts/configure/idd-protocol.test.js`, `scripts/lib/idd-close.js`, `scripts/lib/idd-close.test.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-facts.js`, `scripts/lib/idd-facts.test.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-next.test.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-store.js`, `scripts/lib/idd-store.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`, `skills/idd/SKILL.md`, `skills/idd/references/open-facts.md`
- Work units: 3
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Respuestas del usuario al gate open-facts (2026-10-27, «todas las recomendadas»): un proyecto con código y sin fichero de UI no recibe url-state ni accessibility, sin código recibe las 7 y un --path de UI las devuelve; --decision lleva texto, repetible, y sin él es un error de uso; el mismo texto se guarda una vez; el CLI escribe Plan y Decisions entre marcadores y Decisions puede quedar vacía sin decisión declarada; las órdenes que escriben imprimen una línea de estado y su next; --json omite null, [] y {}, y el next anidado no repite el intent.
- La compactación del JSON se aplica solo a las órdenes del bucle IDD (status, next, record, signals, check, run, review y close); doctor, team, foundation y snapshot conservan su forma porque sus consumidores leen campos vacíos.
- El texto terso solo imprime el how de una obligación que no es un run: el comando de repro-test, tdd-red-green o migration-compat-and-test ya es la acción. check conserva sus líneas missing con el motivo, porque son su veredicto, e imprime una línea ran: con el código de cada check y fitness y la salida solo de los que fallan.
- El hook de Go valida el plan con un número exacto de campos, así que validPlan (internal/iddsession) acepta plan.decisions como validatePlan, y el how de declare-plan, que Go copia, cambia en los dos lados con sus golden de idd-session. El how de living-doc vive en catalog.json, regenerado.
- Este change se abrió con el --decision booleano de la base, así que su change.md no tenía marcadores: se añadieron a mano y las decisiones se declararon después con ospec signals --decision.
- ADR 0009: plan.decisions y la cobertura de cinco categorías son aditivos dentro de idd-state/v1 y los estados anteriores siguen validando; la salida --json no es un contrato persistido con esquema y su forma la fija REQ-idd-011. Un CLI anterior rechaza con state-invalid un estado con plan.decisions.
- Medido en el flujo de un bugfix frente a v2.161.0: el texto de intent, signals, assumption, run verde y check baja de 518, 500, 347, 2380 y 2308 bytes a 190, 180, 124, 872 y 830, y el JSON entre un 10 y un 20 %. Los techos del test son unas 1,3 veces lo medido.
- La skill idd queda a 74 B de su techo de 12 KiB medido en CRLF (antes 153 B): E4.3 debe contar con ese margen.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-27T21:30:19.217Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-27T21:30:19.217Z)
- ev-3: migration-test for migration-compat-and-test (2026-10-27T21:30:34.335Z)
- ev-4: check-run for checks-pass (2026-10-27T21:32:04.588Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-10-27T21:32:04.588Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-27T21:32:04.588Z)
- ev-7: living-doc-current for living-doc (2026-10-27T21:32:04.735Z)
<!-- ospec:evidence:end -->
