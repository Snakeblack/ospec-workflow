# idd-feature-asks-once

## Intent and acceptance

Una feature abre open-facts con al menos una pregunta (#390)

Acceptance: record intent de una feature que cubre las 7 categorías solo con --cite y --quote se rechaza con facts-undeclared y el comando; con al menos un --open-fact se abre el gate open-facts; los estados ya guardados siguen siendo válidos

## Plan

- `scripts/lib/idd-facts.js`: `resolveFeatureCoverage` rechaza con `facts-undeclared` una cobertura sin ningún `--open-fact`; el `how` lo dice.
- `openspec/specs/idd/spec.md` (REQ-idd-018): la regla y su escenario.
- `skills/idd/SKILL.md`: «a question (at least one)», dentro del techo de 12 KiB.
- Tests: `idd-facts.test.js` (rechazo, aceptación con una pregunta, estado antiguo válido) y `ospec.test.js` (`FEATURE_COVER` pregunta una categoría y `openFeature` resuelve el gate).

## Decisions

- La regla está en la entrada del CLI (`resolveFeatureCoverage`) y no en `factsFromCoverage`, que también valida los estados guardados: un estado antiguo con todo citado sigue siendo válido.
- Con una pregunta basta: el usuario elige (2026-10-23) «al menos un `--open-fact`; el resto puede seguir citado». Datos de `idd-7` e `idd-agy-6`: las features sin preguntas escapan en 10 de 17 ejecuciones y las que preguntan, en 1 de 21. Las citas no se distinguen entre las que escapan y las que no, así que no se filtran por su texto.
- Coste aceptado: como mucho un turno más de la persona por feature. Cambia el criterio de aceptación de #390.
- Observación sin arreglar: en este mismo cambio, `url-state` y `accessibility` no aplican y hubo que citarlas con líneas que no deciden nada. Una categoría «no aplica» queda fuera de alcance.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-23T10:19:25.266Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-10-23T10:19:25.266Z)
- ev-3: living-doc-current for living-doc (2026-10-23T10:19:44.395Z)
<!-- ospec:evidence:end -->
