# roadmap-handoff

## Intent and acceptance

Al cerrar un change en un proyecto con roadmap, el agente guarda un traspaso en la memoria entre sesiones y propone continuar el siguiente ítem del roadmap en una sesión nueva; vale para todo proyecto que use ospec

Acceptance: La regla del router generada para cada target indica, tras ospec close o el archive SDD y la entrega que pida el proyecto, leer el roadmap en disco, guardar el traspaso si hay herramientas de memoria y proponer el siguiente ítem en una sesión nueva sin empezarlo; un test de contrato lo fija en todos los targets

## Plan

1. Tests de contrato en rojo: `scripts/configure/idd-protocol.test.js` fija el traspaso en la skill `idd` de los siete targets y en `skills/_shared/gate-archive-quality.md`, y que el router no lo lleva; `scripts/session-memory-contract.test.js` exige `roadmap/next-change` en el addendum de memoria.
2. Sección "Roadmap hand-off" en `skills/idd/SKILL.md` y en `skills/_shared/gate-archive-quality.md` (tras el recibo del runtime de archivo), y una línea en `rules/engram-session-memory.instructions.md`. Tests en verde y sin superar los techos de contexto.

## Decisions

- Respuesta del usuario al gate open-facts: todas las recomendadas. Roadmap en `docs/roadmap.md` o `docs/roadmaps/*.md`; al final, tras cierre y entrega; sin memoria se propone igual; traspaso en `roadmap/next-change` (upsert por proyecto) con change cerrado, siguiente ítem, ruta del roadmap y estado de entrega; sin siguiente ítem o bloqueado se dice y no se propone; el agente elige leyendo el roadmap.
- Ubicación: primero en el router, pero costaba ~460 B siempre cargados por target, dejaba vscode a ~25 B del límite de 4 KB y superaba el techo de `measure-context-baseline.js`. El usuario eligió la opción 2: solo en lo que se carga bajo demanda (skill `idd` y gate de archivo SDD). El trabajo directo sin IDD ni SDD queda fuera.
- El texto no nombra ningún producto de memoria: `session-memory-contract.test.js` lo prohíbe fuera de su lista permitida y así vale con cualquier memoria.
- Conforme con ADR 0006 (memoria sin autoridad) y 0003: el formato del roadmap no es un contrato que el CLI pueda leer.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-11T16:06:30.675Z)
- ev-2: living-doc-current for living-doc (2026-10-11T16:06:32.595Z)
<!-- ospec:evidence:end -->
