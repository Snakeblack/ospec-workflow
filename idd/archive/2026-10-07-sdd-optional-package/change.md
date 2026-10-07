# sdd-optional-package

## Intent and acceptance

Las fases SDD (skills sdd-*, agentes sdd-* con el orquestador y comandos /sdd-*) salen de la instalación por defecto y se instalan con --with-sdd en los 7 targets; los review-* y _shared se quedan porque IDD los usa

Acceptance: Una build por defecto de cada target no trae ninguna skill, agente ni comando sdd-* ni el orquestador; con --with-sdd los trae todos; los 7 instaladores e install-target aceptan --with-sdd; el router dice cómo instalar SDD si falta; techos de contexto bajan; specs REQ-generator e install actualizadas

## Plan

Roadmap E1.6 (d2). Cuatro unidades, cada una con su test en rojo primero:

1. **Generador** (REQ-generator-025): `isSddPackagePath` en `scripts/lib/skill-extras.js` (skills, agentes, comandos y reglas `sdd-*`); `transform` y `runConfigure` reciben `withSdd`; la CLI acepta `--with-sdd`. Los tests que comprueban contenido SDD construyen con `withSdd: true`; `with-sdd.test.js` cubre la build por defecto y con SDD en los 7 targets, y que cada validador acepta la build por defecto.
2. **Instaladores** (REQ-install-036): `scripts/configure/sdd-package.js` con `--with-sdd`, `--no-sdd` y la conservación al reinstalar (manifiesto de propiedad o directorio de agentes instalado), en los 7 instaladores e `install-target`; nota cuando se conserva sin pedirlo.
3. **Banco** (REQ-bench-005): `hosts/claude.js` construye con `--with-sdd`; `bench-margins-5` (esquema 4) con `candidate_digests` (huella de `idd-1`/`idd-2` y la actual) y `hosts/claude.js` exceptuado; copias en `__fixtures__/harness-baseline/hosts/` y `__fixtures__/harness-idd-2/`.
4. **TUI** (REQ-install-021/022): el plan del adaptador publica los paquetes `sdd` y `extras`; la revisión los alterna con 1–9; la petición los envía en `packages` y el adaptador los convierte en flags.

Además: el router pide reinstalar con `--with-sdd` si falta SDD (REQ-generator-022) y los techos de contexto se actualizan.

## Decisions

Respuestas del usuario al gate de hechos abiertos (2026-10-08):

- El banco construye siempre con `--with-sdd` en los dos brazos; `bench-margins-5` acepta la huella de `idd-1`/`idd-2` y la actual frente a `sdd-baseline-3`, y el checkpoint de `idd-2` sigue dando `continue`.
- El TUI expone el paquete SDD en este cambio, y de paso los extras.
- Reinstalar conserva SDD si la instalación anterior lo traía; `--no-sdd` lo quita. Consecuencia: quien instaló antes de v2.113.0 conserva SDD al actualizar.

Hallazgos durante el cambio:

- Las reglas `rules/sdd-*` también son del paquete: sin él, la de Strict TDD de SDD se cargaría al editar tests en una sesión IDD.
- Los validadores de Cursor, Antigravity, Copilot y OpenCode exigían el directorio de comandos o prompts, que una build sin SDD no tiene; dejan de exigirlo.
- Los revisores `review-*` incrustan `_shared/sdd-phase-common.md`, que citaba `skills/sdd-verify/SKILL.md`; se quita la ruta para que no apunte a un fichero ausente.
- El plan (`ospec signals`) se declaró después de empezar a editar, no antes como pide el protocolo.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-07T22:59:01.755Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-07T22:59:01.755Z)
- ev-3: check-run for checks-pass (2026-10-07T23:03:04.786Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-10-07T23:03:04.786Z)
- ev-5: living-doc-current for living-doc (2026-10-07T23:03:08.837Z)
<!-- ospec:evidence:end -->
