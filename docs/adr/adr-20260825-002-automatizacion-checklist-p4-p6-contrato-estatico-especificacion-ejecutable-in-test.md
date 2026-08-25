# ADR-002: Automatización del checklist P4/P6 como contrato estático más especificación ejecutable in-test

- Status: proposed
- Change: harden-sdd-document-contract
- Date: 2026-08-25

## Context

Los success criteria exigen que los checks del checklist de salida (P4: >=30 líneas
sustanciales, grafo de enlaces in/out, Mermaid en páginas de flujo, sintaxis citada) y los de
metadata (P6: `sections` completo, `filesSkipped` con identidad y motivo) sean "verificables
automáticamente en `scripts/sdd-document.test.js`". El executor es un LLM siguiendo prosa:
ninguna función de producción invoca estos checks, y la suite eval live es manual y solo
estructural. Hay que decidir dónde vive la lógica verificable.

## Decision

Dos capas dentro de `scripts/sdd-document.test.js`, sin código runtime nuevo:

1. **L1 — contrato estático**: asserts `includes`/regex sobre `skills/sdd-document/SKILL.md` y
   `skills/_shared/route-document.md` que fijan que la prosa contractual documenta umbrales,
   orden de pasos, esquema de metadata y el procedimiento J6 (estilo ya establecido en ese
   archivo para el batched gate y la §3 rel-3).
2. **L2 — especificación ejecutable**: helpers puros definidos DENTRO del propio test file
   (conteo de líneas sustanciales excluyendo headings/blancos/source maps, grafo de enlaces
   internos relativos, detección de fences mermaid + heurística de labels citados, validación
   del schema `.last-update.json` contra el set real de `*.md`) ejercitados sobre mini-wikis
   construidos en tmpdir, con una variante válida y una variante violadora por regla.

## Alternatives

- *Librería runtime compartida* (`scripts/lib/document-checklist.js`): rechazada. Ningún camino
  de producción la invocaría (el enforcement real lo hace el LLM leyendo SKILL.md), convirtiéndola
  en superficie muerta con coste de mantenimiento; si en el futuro aparece un consumidor real,
  extraerla desde los helpers del test es mecánico.
- *Escenario golden eval nuevo* (`document-content-qa-*`): rechazado por ahora. Los evals son
  manuales/host-authorized y estructurales; no medirían prosa ni calidad factual, y ampliarían
  la superficie de mantenimiento live. Queda registrado como deuda futura en design.md.
- *Solo capa L1*: rechazada. Sin L2, los umbrales ("~30 líneas", "al menos 1 enlace") quedan con
  semántica ambigua y cada implementación futura podría interpretarlos distinto; L2 fija el
  significado exacto de "línea sustancial", "enlace interno" y "schema completo".

## Consequences

- El archivo de tests crece (~150-250 líneas) pero queda autocontenido y en CI (`npm test`),
  cumpliendo el success criterion sin dependencias nuevas.
- La heurística Mermaid de L2 es deliberadamente superficial (tipo de diagrama + labels citados);
  la validación profunda de renderizado se delega al spot-check J6, y esa limitación queda
  documentada en ambos sitios.
- Cero footprint en producción: reversible con revert de los commits del change.
