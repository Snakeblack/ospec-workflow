# Proposal: Contrato de recomendación y detección de ambigüedad temprana/tardía (A2 + A3)

## Intent

El harness deja demasiado al juicio implícito del modelo en dos puntos caros:

1. **A2 — Contrato de recomendación.** Los `question_gate` admiten `recommended: true`
   sobre una opción, pero nada obliga a explicar *por qué*, ni qué implica cada opción.
   Un senior no dice "elegí A"; dice "elegí A porque X, si elegís B pagás Y, y esto es
   reversible/irreversible". Falta esa disciplina forzada en el shape.
2. **A3 — Ambigüedad fuera de clarify.** `sdd-clarify` solo vive entre spec y design,
   pero la ambigüedad aparece antes (petición inicial vaga) y después (durante apply,
   cuando el código real contradice el design). Hoy nada la captura en esos bordes.

## Scope

### In Scope
- **A2**: extender el shape de preguntas en la orquestación y en
  `skills/_shared/sdd-phase-common.md` (Blocking Question Envelope): toda opción con
  `recommended: true` DEBE llevar `description` con racional (1 línea), trade-off
  principal frente a alternativas, y reversibilidad de la decisión. Las preguntas de
  gate DEBEN incluir en `reason` el costo de equivocarse.
- **A3 (antes)**: paso de *intent restatement* en la Change Classification del
  orquestador — reformular la petición en 2-4 líneas y validarla vía `AskUserQuestion`
  cuando la petición original es vaga.
- **A3 (después)**: regla explícita en `sdd-apply` — ante código existente que
  contradice el design, devolver `status: blocked` con `blocker_type: design-mismatch`
  (ruteo del orquestador a `sdd-design`), en vez de improvisar un workaround.
- Actualizar la doc de referencia embebida donde defina estos shapes.

### Out of Scope
- A1, C1, C4, E1 y A4/A5 (otros grupos del Horizon-1).
- **E3** (lint de prompts que verifique el shape): solo se documenta el shape requerido;
  no se implementa lint aquí.
- Cambiar la mecánica de `sdd-clarify` en sí.

## Capabilities

> Contrato con sdd-spec. Investigado contra `openspec/specs/`.

### New Capabilities
- `recommendation-contract`: shape obligatorio de opciones recomendadas (racional +
  trade-off + reversibilidad) y del `reason` de gate (costo de equivocarse).
- `ambiguity-detection-boundaries`: intent restatement pre-clasificación y blocker
  `design-mismatch` en apply, con su ruteo a `sdd-design`.

### Modified Capabilities
- `agents`: el envelope `question_gate` y las obligaciones del orquestador
  (Change Classification) y de `sdd-apply` viven en esta spec; se amplían con el nuevo
  `blocker_type: design-mismatch` y el paso de intent restatement.

## Approach

Cambios puramente documentales/normativos sobre plantillas de prompts y specs — no hay
código de runtime nuevo. Se editan el agent template del orquestador
(`agents/sdd-orchestrator.agent.md`), la plantilla de `sdd-apply`
(`agents/` + `skills/sdd-apply/SKILL.md`) y `skills/_shared/sdd-phase-common.md`. El
generador reconstruye los cuatro targets desde estas fuentes; la verificación es que los
ejemplos embebidos cumplan el shape y que los tests de generación/dist sigan verdes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `skills/_shared/sdd-phase-common.md` | Modified | Blocking Question Envelope: description obligatoria + reason con costo |
| `agents/sdd-orchestrator.agent.md` | Modified | Intent restatement en Change Classification; ruteo `design-mismatch` |
| `skills/sdd-apply/SKILL.md` | Modified | Regla de `blocker_type: design-mismatch` |
| `openspec/specs/agents/spec.md` (delta) | Modified | Requisitos normativos de envelope y bordes |
| `dist/**` | Regenerated | Salida de los 4 targets |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Estos ficheros compartidos afectan a todo cambio SDD futuro | Med | Cambios aditivos (nuevos campos/reglas), sin romper el shape previo; tests de generación |
| Intent restatement añade fricción en peticiones ya claras | Med | Solo se dispara cuando la petición es vaga; una sola pregunta |
| `design-mismatch` mal usado como escape de trabajo | Low | Spec define condiciones concretas (API distinta, dependencia inexistente, patrón incompatible) |
| Ejemplos embebidos quedan inconsistentes con el nuevo shape | Med | Revisar todos los ejemplos de `question_gate` en repo durante apply |

## Rollback Plan

Todos los cambios son ediciones de texto en fuentes versionadas más `dist/` regenerado;
no hay migración de datos ni estado persistente. Rollback = `git revert` del/los commit(s)
del cambio y regenerar `dist/` (`npm run build` o equivalente) para volver al shape previo.
Como los cambios son aditivos, revertir no deja artefactos huérfanos: los `question_gate`
existentes siguen siendo válidos con o sin los nuevos campos. Por precaución, dividir A2 y
A3 en commits separados para permitir revertir uno sin el otro.

## Dependencies

- Ninguna externa. E3 (lint) es dependiente aguas abajo pero fuera de alcance.

## Success Criteria

- [ ] `sdd-phase-common.md` exige `description` (racional + trade-off + reversibilidad) en
      toda opción `recommended: true` y `reason` con costo de equivocarse.
- [ ] El orquestador reformula peticiones vagas (intent restatement) y las valida.
- [ ] `sdd-apply` documenta y aplica `blocker_type: design-mismatch` con ruteo a design.
- [ ] Delta de spec `agents` y specs nuevas creadas; ejemplos embebidos consistentes.
- [ ] `npm test` verde y `dist/` regenerado sin diffs inesperados.

> **Branch advisory:** Antes de que arranque `sdd-apply`, SE DEBERÍA crear una rama de
> feature siguiendo la convención `<tipo>/<descripción>` del skill `branch-pr`
> (p. ej. `git checkout -b feat/recommendation-contract-ambiguity main`). Es SHOULD, no MUST.
