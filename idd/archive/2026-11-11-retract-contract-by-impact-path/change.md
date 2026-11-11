# retract-contract-by-impact-path

## Intent and acceptance

public-contract derivada por una ruta de impact que no es documento de contrato no se puede retirar con la respuesta del usuario, aunque el diff no cambie el contrato (#496)

Acceptance: Con una ruta de impact.public_contract que no es documento de contrato, record retract --signal public-contract --answer … --source user retira la señal y contract-spec-and-test; sin respuesta se rechaza y su how ofrece la respuesta; si una ruta que deriva la señal es documento de contrato la respuesta se rechaza con el motivo; un check posterior no la vuelve a derivar por esas rutas y otra ruta de contrato la devuelve; persistent-data y security-boundary por ruta no cambian

## Plan

<!-- ospec:plan:start -->
- Files: `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/idd-signals.js`, `scripts/lib/idd-signals.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El hit de una ruta es '<ruta> changes: sha256:<hex>' (SHA-256 de las líneas que el diff añade y quita en ella), no una entrada por línea: el estado queda compacto y cualquier edición posterior devuelve la señal
- Una ruta sin líneas en el diff (renombrada o binaria) rechaza la respuesta: su huella no cambiaría con ediciones posteriores y un renombrado de una función sí cambia la ruta HTTP
- Una ruta ya respondida que se vuelve a planificar no devuelve la señal (el issue pide que solo otra ruta del diff o del plan la devuelva); la ruta se reconoce por el prefijo de su hit porque signals deriva sin leer el diff
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-11T18:38:14.040Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-11T18:40:27.197Z)
- ev-3: migration-test for migration-compat-and-test (2026-11-11T18:42:23.343Z)
- ev-4: check-run for checks-pass (2026-11-11T18:43:53.739Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-11-11T18:43:53.739Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-11-11T18:43:53.739Z)
- ev-7: living-doc-current for living-doc (2026-11-11T18:44:07.378Z)
<!-- ospec:evidence:end -->
