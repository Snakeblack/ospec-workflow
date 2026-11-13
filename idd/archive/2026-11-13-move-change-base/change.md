# move-change-base

## Intent and acceptance

ospec record base adelanta la base de un cambio abierto a un commit descendiente, con la aprobación del usuario en un gate, para que check y close midan solo su trabajo cuando otro cambio ya archivado entró detrás de su apertura

Acceptance: Un cambio docs abierto en main antes de que entren los commits de otro cambio ya archivado: ospec close lo rechaza con kind-mismatch; tras ospec record base --to main, la aprobación del gate y un ospec check, ospec close lo cierra; una base que no desciende de la actual se rechaza y, sin la respuesta al gate, la base no se mueve y close sigue rechazando

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `docs/en/README.md`, `docs/onboarding/tech-lead.md`, `handbook/idd/flujo-idd.md`, `handbook/proteccion/hooks.md`, `internal/iddsession/catalog.json`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/idd-signals.js`, `scripts/lib/idd-workspace.js`, `scripts/ospec.js`, `scripts/ospec.test.js`, `skills/idd/SKILL.md`, `skills/idd/references/approvals.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- ospec record base no mueve la base: abre el gate base-moved con el movimiento leído de git (from, to, commits, rutas y cambios archivados del tramo) y la base se mueve al resolverlo el usuario. El archivo de un cambio no guarda las rutas ni el contenido de su diff, así que el CLI no puede probar por sí mismo que los commits del tramo son de otro cambio
- close no acepta la base de un check --base: un check --base HEAD cerraría con el diff vacío, que es lo que B2 y B3 impiden. close sigue derivando contra state.base, que solo cambia por base-moved
- La base nueva debe descender de la actual y ser HEAD o un antecesor suyo: el diff solo se estrecha y nunca lee un commit fuera de la rama. Una base null no se mueve y una base movida no vuelve atrás
- Al resolver base-moved solo checks-pass vuelve a pendiente: cada ospec check vuelve a asentar las demás obligaciones ligadas al árbol contra el diff nuevo, y close ya rechaza las que un diff más estrecho deja infladas (B3, E1.53). Un check con --base sigue admitido como antes; close deriva siempre contra la base del estado
- La guía para el agente va en el how de kind-mismatch y en references/approvals.md, no en SKILL.md: el protocolo está en su techo versionado de bytes (idd_protocol_bytes)
- Otro --to con el gate abierto sustituye la pregunta y se vuelve a sellar el turno; --cancel la retira sin dejar rastro en el estado
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-13T20:07:07.593Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-13T20:07:07.593Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-13T20:07:07.593Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-13T20:07:23.668Z)
- ev-5: living-doc-current for living-doc (2026-11-13T20:07:37.002Z)
<!-- ospec:evidence:end -->
