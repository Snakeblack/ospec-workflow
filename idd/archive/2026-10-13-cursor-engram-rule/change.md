# cursor-engram-rule

## Intent and acceptance

setup:cursor proyecta el protocolo de Engram a una regla global alwaysApply y deja de pedir pegarlo a mano

Acceptance: Con Engram configurado, el paso escribe ~/.cursor/rules/engram-memory-protocol.mdc con description corta, alwaysApply true y el cuerpo del protocolo, no imprime el aviso de User Rules, y la documentación describe esa regla.

## Plan

- Proyectar `~/.cursor/engram-memory-protocol.md` a `~/.cursor/rules/engram-memory-protocol.mdc` con una `description` de una línea y `alwaysApply: true`, y dejar de pedir el pegado manual.
- Conservar el markdown como pieza de detección (REQ-install-028). No escribir la regla si el protocolo está vacío o no se puede leer, ni con `--no-engram`. Una pasada posterior con el mismo cuerpo no reescribe el fichero.
- Actualizar README, la guía de instalación y REQ-install-044, con los tests de `engram-setup.test.js`.

## Decisions

- Prior decision (memory): Cursor /rule carga ~/.cursor/rules si el .mdc es válido -> `~/.cursor/rules/ospec-router.mdc` y `~/.cursor/rules/no-model-attribution.mdc`: current. Esas dos reglas tienen `description` corta y `alwaysApply: true`, y `/rule` las lista.
- El cuerpo se copia del fichero que escribe `engram setup cursor`. No entra en el generador ni en el manifiesto de propiedad de `setup:cursor`: es un efecto del paso Engram, igual que el MCP.
- `docs/adr/adr-20261003-001` dice en el contexto que Cursor ignora las reglas globales. `/rule` y las dos reglas ya instaladas lo contradicen. Ese ADR aceptado no se reescribe; la corrección queda en este cambio y en REQ-install-044.
- El diff también incluye `scripts/lib/idd-workspace.test.js`, del cambio cerrado `dangling-symlink-rm`. Ese archivo no cambia el motor IDD.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-13T18:47:09.773Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-10-13T18:50:22.405Z)
- ev-3: check-run for checks-pass (2026-10-13T19:10:07.391Z)
- ev-4: check-run for checks-pass (2026-10-13T19:12:08.153Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-13T19:12:08.153Z)
- ev-6: living-doc-current for living-doc (2026-10-13T19:12:15.010Z)
<!-- ospec:evidence:end -->
