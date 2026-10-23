# cli-self-explaining-how

## Intent and acceptance

record intent y contract-spec-and-test se explican sin leer el código del CLI (#400.3)

Acceptance: ospec --help lista las categorías de una feature y la regla de al menos una pregunta; next_step.how de contract-spec-and-test nombra los patrones de documento de contrato y de test del proyecto y qué hacer si ninguno encaja

## Plan

- `scripts/ospec.js`: el uso añade, bajo `record intent` de una feature, la línea `categories: <las 7>; at least one is an --open-fact`, generada desde `CATEGORY_IDS`.
- `scripts/lib/idd-next.js`: el `how` de `contract-spec-and-test` lista los patrones resueltos de documento y de test cuando `next` recibe la configuración del proyecto. Si no, nombra `contracts.documents` y `contracts.tests` de `idd/config.yaml`.
- `openspec/specs/idd/spec.md`: REQ-idd-015 (el `how` de contrato) y REQ-idd-018 (el uso lista las categorías).
- Tests: `idd-next.test.js` (las dos formas del `how`) y `ospec.test.js` (`--help` y `record intent` incompleto).
- `internal/iddsession/iddsession.go` y sus fixtures `internal/testdata/idd-session/steps/expected/`: el hook de sesión en Go copia el `how` sin configuración, así que lleva el texto de reserva.
- La skill no cambia: ya manda seguir `next_step.how`, y está al límite de su techo.

## Decisions

- El usuario elige (2026-10-23) poner las categorías en el uso general, que también se imprime cuando `record intent` va incompleto, y no en una ayuda por subcomando. En agy, el agente lanzaba `record intent` vacío y, al no ver las categorías, leía `idd-facts.js`.
- El usuario elige (2026-10-23) que, si ningún fichero encaja con los patrones de contrato, el `how` proponga al usuario `contracts.documents` y que la configuración se edite solo con su aprobación, como con los checks. Descartado: mandar a crear un documento bajo `docs/api/`.
- Los patrones salen de `readProjectContext`, que `next`, `signals`, `check` y `run` ya leen. No se añade ninguna lectura nueva de disco.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: adr-impact-declaration for adr-impact-declaration (2026-10-23T10:32:52.979Z)
- ev-2: check-run for checks-pass (2026-10-23T10:34:25.131Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-23T10:34:25.131Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-23T10:34:25.131Z)
- ev-5: living-doc-current for living-doc (2026-10-23T10:34:30.642Z)
<!-- ospec:evidence:end -->
