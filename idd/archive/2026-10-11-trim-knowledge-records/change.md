# trim-knowledge-records

## Intent and acceptance

ospec close deja de devolver como records los impactos conforms: solo los que se apartan de una referencia (amends, supersedes, contradicts) y los ADR nuevos, para no llenar la memoria de entradas sin valor

Acceptance: Un cambio que declara conforms y none sobre sus referencias no produce records de impacto; uno que declara amends con ADR nuevo produce el impacto y el ADR; las decisiones de change.md siguen siendo records

## Plan

1. `knowledgeRecords` (`scripts/lib/idd-close.js`) solo convierte en record los impactos de `GATED_IMPACTS` (`amends`, `supersedes`, `contradicts`); los ADR nuevos siguen. Test unitario con `none`, `conforms`, `amends` con ADR y `contradicts`.
2. REQ-idd-024 y su escenario, `skills/idd/references/memory-loop.md` y el «Hecho» de E3.5 en el roadmap dicen lo mismo.

## Decisions

- **Decisión previa (memoria):** «Pendiente: reducir ruido de memoria en los records de close» (`followup/knowledge-records-noise`) -> `scripts/lib/idd-close.js:223`: current. El código excluía solo `none`, así que los `conforms` llegaban a la memoria.
- **Respuestas del gate open-facts (usuario, «vamos con todas las recomendaciones»):** records de impacto solo para `amends`, `supersedes` y `contradicts`, reutilizando `GATED_IMPACTS`; los `conforms` no se resumen en ningún record, porque el `state.yaml` archivado ya los guarda; las 12 entradas `conforms` que E3.5 guardó en memoria se dejan, porque son ciertas y la memoria no permite borrarlas; patch 2.131.1 y un PR.
- **Sin test de CLI nuevo:** el test de `ospec close` cubre la lectura del archivo y la salida; el filtro es la función pura, y su test cubre los cuatro impactos.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-11T23:11:31.247Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-10-11T23:11:31.247Z)
- ev-3: living-doc-current for living-doc (2026-10-11T23:11:34.697Z)
<!-- ospec:evidence:end -->
