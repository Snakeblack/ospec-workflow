# idd-default-mode

## Intent and acceptance

IDD pasa a ser el modo por defecto: resolveMode devuelve idd sin modo declarado y el router manda los cambios de código a IDD salvo /sdd-*, petición explícita de SDD o mode: sdd

Acceptance: DEFAULT_MODE es idd con test de paridad; REQ-idd-001 y REQ-generator-024 dicen idd por defecto; el router generado en los 7 targets envía a IDD sin mode: idd y sigue nombrando /sdd-* y mode: sdd

## Plan

Roadmap E1.6 (d1), primer PR de tres (d2: SDD al paquete `--with-sdd`; d3: README y documentación de producto).

1. Tests en rojo: `DEFAULT_MODE` y `resolveMode({})` dan `idd` (`idd-contract.test.js`); el router generado en los 7 targets manda a IDD por defecto, no nombra `mode: idd`, nombra `mode: sdd` en `idd/config.yaml` y el trabajo directo solo a petición explícita (`idd-protocol.test.js`).
2. `scripts/lib/idd-contract.js`: `DEFAULT_MODE = "idd"`.
3. `rules/ospec-router.instructions.md`: sección «IDD by default»; SDD sigue solo bajo petición.
4. Specs: REQ-idd-001 (default `idd`, escenario sin configuración aunque exista `openspec/`), REQ-generator-022 y REQ-generator-024.
5. Skill `idd`: trigger y «When to Use» sin «IDD mode».
6. Techos de contexto (`--update`): *always-on* +117–140 B, listado +13 B.
7. `docs/CLAUDE.md`: los ítems del roadmap se hacen con IDD.

## Decisions

Respuestas del usuario al gate de hechos abiertos (2026-10-08):

- `mode: sdd` en `idd/config.yaml` solo apaga IDD: los cambios se hacen directos y SDD entra solo con `/sdd-*` o petición explícita, igual que antes de E1.6.
- Sin `mode` declarado el proyecto es IDD aunque tenga `openspec/`; quien quiera conservar el comportamiento anterior declara `mode: sdd` (aviso en el CHANGELOG). El router no infiere el modo de `openspec/` (REQ-idd-002: IDD no lee `openspec/`).
- Un cambio se hace directo solo si el usuario lo pide expresamente sin IDD; el agente nunca lo ofrece.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-07T22:19:30.419Z)
- ev-2: living-doc-current for living-doc (2026-10-07T22:19:40.932Z)
<!-- ospec:evidence:end -->
