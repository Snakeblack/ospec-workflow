# Proposal: Endurecer el contrato de `sdd-document` con enforcement verificable

## Intent

El generador de wiki (`skills/sdd-document/SKILL.md`) produce buena materia prima, pero sus reglas de calidad son declarativas: carecen de mecanismo de cumplimiento. La auditoría del 2026-08-22 (`docs/analysis/2026-08-22-openwiki-sdd-document-analysis.md`) evidenció obsolescencia sistémica en update mode (H1/M4), conceptos duplicados sin canonicidad (H2), errores factuales publicados (H3), páginas stub y metadatos incompletos (L8). Este cambio convierte las propuestas P1–P7 del análisis en requisitos normativos verificables del contrato.

## Scope

### In Scope
- P1: re-descubrimiento de dominios en update mode tras la ventana diff, registrado en `_plan.md`.
- P2: mapa de canonicidad `concepto -> pagina canonica` como parte obligatoria del plan (REQ-sdd-document-007).
- P3: paso de verificación factual obligatorio (grep/read de contraste por cifra e identificador citado) antes del cleanup.
- P4: checklist de salida medible en Step 6.5: sustancia >=30 líneas, grafo de enlaces, Mermaid en páginas de flujo, sintaxis Mermaid válida.
- P5: re-verificación de hechos volátiles (contadores, umbrales, versiones) en cada update aunque su fuente no cambie en la ventana.
- P6: `.last-update.json` completo: `sections` lista todas las páginas existentes; `filesSkipped` identifica cuáles y por qué (REQ-sdd-document-011).
- P7: QA de contenido post-generación orchestrator-owned (readability + fact-spot-check por revisor distinto del generador), análoga a la verificación de sandbox de REQ-agents-006; el generador no puede auto-certificar calidad de contenido.

### Out of Scope
- Remediación del wiki vivo `openwiki/` (§6 del análisis: errores H3, página kernel, targets nuevos, clústeres de duplicación); cambio separado.
- Modificaciones al scaffold/sync Starlight (REQ-sdd-document-014 a -019).
- Nuevos bloques `quality_gates:` u otros cambios en `openspec/config.yaml`.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `sdd-document`: deltas en REQ-sdd-document-007 (mapa de canonicidad), -008 (re-descubrimiento y frescura en update mode), -011 (metadatos completos) más nuevos requisitos de verificación factual, checklist verificable y no-auto-certificación de calidad.
- `agents`: nuevo requisito de verificación orchestrator-owned de contenido post-run para la ruta `/sdd-document`, hermano de REQ-agents-006.

## Approach

Modificar el contrato del executor en cinco puntos del SKILL.md: Step 5b (plan con canonicidad), sección Update Mode Behavior (re-descubrimiento + hechos volátiles), un nuevo paso entre redacción y cleanup (verificación factual), Step 6.5 (checklist medible) y Step 6.4/Return Summary (metadatos completos, sin auto-certificación). El punto orquestador de P7 vive en `skills/_shared/route-document.md` junto a J5, con su requisito normativo en el dominio `agents`. Los checks de P4/P6 deben ser automatizables en `scripts/sdd-document.test.js`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `skills/sdd-document/SKILL.md` | Modified | Steps 5b, 6.x, update mode, cleanup y return summary |
| `openspec/specs/sdd-document/spec.md` | Modified | Deltas REQ-007/-008/-011 y nuevos requisitos |
| `openspec/specs/agents/spec.md` | Modified | Requisito P7 de QA de contenido post-run |
| `skills/_shared/route-document.md` | Modified | Dispatch del QA antes de cerrar la ruta como success |
| `scripts/sdd-document.test.js` | Modified | Tests de contrato para checks medibles |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| El re-descubrimiento en update dispara regeneraciones amplias contrarias al espíritu quirúrgico | Med | P1 solo propone páginas nuevas/fusiones en `_plan.md`; presupuesto de diff se mantiene |
| La verificación factual encarece cada run | Med | Alcance limitado a cifras e identificadores efectivamente citados; agente en tier cheap |
| Falsos positivos del checklist (página legítima sin enlace entrante) | Low | Se admite justificación explícita registrada en el envelope |

## Rollback Plan

Revertir los commits del change (git revert). Todo es aditivo sobre SKILL.md, specs, handler y tests: sin migración de datos ni formato persistido nuevo; lectores previos ignoran campos extra de `.last-update.json`. Tras revertir, ejecutar `npm test`.

## Dependencies

- Fuente: `docs/analysis/2026-08-22-openwiki-sdd-document-analysis.md` (P1–P7).
- Sin dependencias externas ni de otros changes activos.

## Success Criteria

- [ ] Cada propuesta P1–P7 tiene requisito RFC 2119 con escenario Given/When/Then en los delta specs.
- [ ] Los checks de P4 y P6 son verificables automáticamente en `scripts/sdd-document.test.js`.
- [ ] La ruta `/sdd-document` no cierra como success sin pasada QA independiente documentada (P7).
- [ ] `npm test` en verde tras apply.
