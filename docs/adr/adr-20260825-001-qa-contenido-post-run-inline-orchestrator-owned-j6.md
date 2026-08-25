# ADR-001: QA de contenido post-run como pass inline orchestrator-owned (J6)

- Status: proposed
- Change: harden-sdd-document-contract
- Date: 2026-08-25

## Context

La propuesta P7 exige que la calidad de contenido del wiki (readability + spot-check factual)
sea verificada por un revisor DISTINTO de la ejecución del generador, y que el generador no
pueda auto-certificarla (hermano de REQ-agents-006, que ya normaliza la verificación
orchestrator-owned del sandbox como J5). Hay tres mecanismos candidatos para materializar ese
revisor independiente.

## Decision

El QA de contenido lo ejecuta el PROPIO orquestador, inline, como nueva sección §7 ("J6") del
route handler `skills/_shared/route-document.md`, con procedimiento documentado: readability
sobre todas las páginas tocadas + spot-check factual muestreado (`max(3, ceil(0.2 * claims))`) contrastado contra el repo), veredicto `pass|findings` registrado en `state.yaml` bajo
`gates.content-qa` (mínimo `status` + `summary`), y halt con `question_gate` de dos opciones
ante hallazgo confirmado. La independencia se satisface estructuralmente: el orquestador es una
delegación distinta del dispatch del sub-agente `sdd-document` que produjo el contenido.

## Alternatives

- *Sub-agente revisor dedicado* (nuevo `sdd-content-reviewer`): rechazado. Exige superficie de
  registro nueva (agents catalog, models.yaml tier, command roster, transforms de los cuatro
  targets) fuera de proporción para un pass post-run; J5 demuestra que el patrón
  orchestrator-owned es suficiente para esta ruta.
- *Reutilizar `review-change` / lineage 4R*: rechazado. Ese contrato está acoplado a revisiones
  de diffs de código con finding IDs inmutables y presupuesto de corrección; instrumento
  equivocado para prosa de wiki y acoplamiento innecesario entre la ruta documental y el
  ciclo de review selectivo.

## Consequences

- Cero superficies nuevas: solo prosa contractual en route-document.md y un requisito en el
  dominio agents.
- El QA comparte contexto con el orquestador del run (posible sesgo de contexto); se mitiga con
  registro obligatorio del veredicto en `state.yaml` y con el gate explícito ante hallazgos,
  igual que el riesgo aceptado en J5.
- El bucle hallazgo → re-despacho quirúrgico → nuevo J6 queda acotado por la exigencia de
  elección de usuario en cada halt, sin maquinaria de lineage adicional.
- Reversible con revert de los commits del change.
