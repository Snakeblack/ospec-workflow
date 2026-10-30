# delivery-integration-branch

## Intent and acceptance

delivery en idd/config.yaml puede declarar una rama de integración (dev) separada de producción (main): las ramas de trabajo salen de ella y sus PR van a ella, cada paso a producción es una versión con tag, release/x.y es una preproducción opcional que vuelve a la integración, y la versión se propone al promover, no en cada fusión (#458)

Acceptance: Con la rama de integración declarada, ospec next y ospec close dan su guía (rama de trabajo, destino del PR, cuándo se propone la versión, release/x.y y la fusión de vuelta); sin declararla, la salida de ospec next, ospec close y ospec team no cambia; un valor no válido (vacío o igual a la rama de producción) se rechaza al leer idd/config.yaml con config-invalid; tests del parser y de la guía, y docs/README.md con la estrategia

## Plan

<!-- ospec:plan:start -->
- Files: `docs/README.md`, `openspec/specs/idd/spec.md`, `scripts/fixtures/context-baseline.json`, `scripts/lib/idd-config.js`, `scripts/lib/idd-config.test.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-next.test.js`, `scripts/lib/team-profile.js`, `scripts/lib/team-profile.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`, `skills/idd/SKILL.md`
- Work units: 2
<!-- ospec:plan:end -->

Lo construido, en dos unidades:

1. Configuración y guía: `parseDelivery` (`scripts/lib/idd-config.js`) acepta `integration_branch` y `production_branch` y rechaza con `config-invalid` un nombre que git no aceptaría, la misma rama en las dos, `production_branch` sola y `release: per-change` con rama de integración. `resolveTeam` (`scripts/lib/team-profile.js`) nombra la rama de integración en las reglas del branching, resuelve `release` a `batched` con su propuesta al promover y añade `integration` con sus reglas solo cuando está declarada.
2. Salida, contrato y documentación: `scripts/ospec.js` saca `deliveryBlock`, que comparten `next` y `close`, devuelve `delivery` en `close` con rama de integración y describe `integration` en el texto de `next`, `close` y `team`. Actualiza REQ-idd-013, REQ-idd-023 (con un escenario nuevo) y REQ-idd-025 en `openspec/specs/idd/spec.md`, la sección de entrega de `docs/README.md` y una frase de `skills/idd/SKILL.md`, compactada para no pasar el presupuesto de contexto. `scripts/fixtures/context-baseline.json` baja sus techos a lo medido.

`scripts/lib/idd-next.js` no cambia: pasa tal cual el bloque `delivery` que recibe, y la sugerencia `release-undeclared` ya recomienda `batched` porque la toma del valor resuelto.

## Decisions

<!-- ospec:decisions:start -->
- delivery.integration_branch es una clave nueva, combinable con branching serial o parallel, y delivery.production_branch es opcional: sin ella la guía habla de la rama por defecto sin nombrarla (respuesta del usuario: «todas las recomendadas»)
- Un nombre de rama se acepta si no está vacío, es distinto de producción con comparación exacta y cumple las reglas de git check-ref-format, comprobadas sin ejecutar git
- Con rama de integración, release vale batched: la versión se propone al promover a producción o a release/x.y; release per-change junto a integration_branch se rechaza con config-invalid, y sin release declarado se recomienda batched
- ospec close no lee git; con integration_branch declarada devuelve el bloque delivery de ospec next (branching, changelog, release e integration) y sin ella su salida no cambia
- El how del branching nombra la rama de la que salen las ramas de trabajo: la rama de integración declarada, o la rama por defecto como hasta ahora
<!-- ospec:decisions:end -->

- Prior decision (memory): SDD no lee delivery (ADR 0011) -> openspec/specs/idd/spec.md (REQ-idd-023, «SDD MUST NOT read `delivery`»): current
- Prior decision (memory): A diferencia del branching, el perfil no basta para que close actúe -> openspec/specs/idd/spec.md (REQ-idd-023, «Only a declared value makes `ospec close` act»): current

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-10-30T12:12:13.158Z)
- ev-2: check-run for checks-pass (2026-10-30T12:14:06.927Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-30T12:14:06.927Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-30T12:14:06.927Z)
- ev-5: living-doc-current for living-doc (2026-10-30T12:14:20.798Z)
<!-- ospec:evidence:end -->
