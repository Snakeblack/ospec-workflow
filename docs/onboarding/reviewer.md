# ospec-workflow en 10 minutos — para el reviewer

**La pregunta que respondés acá: ¿cómo leo un change?**

## Orden de lectura de un change (5 archivos, en este orden)

1. **`proposal.md`** — intención, alcance y rollback. ¿El problema es el que
   crees que es? Si no, todo lo demás da igual.
2. **`specs/{dominio}/spec.md`** — el contrato: requirements con IDs estables
   (`{#REQ-dominio-NNN}`) y escenarios Given/When/Then. Esto es lo que el código
   promete; revisalo ANTES que el diff.
3. **`design.md` + `decisions/adr-*.md`** — el cómo y el porqué. Los ADRs traen
   alternativas descartadas y consecuencias: si una decisión te chirría, primero
   mirá si ya está justificada.
4. **`verify-report.md`** — la Traceability Matrix (REQ → tasks → commits →
   tests) y el veredicto. Un REQ sin test vinculado ya viene marcado WARNING.
5. **El diff** — recién acá. Con specs y design leídos, el diff se revisa contra
   un contrato, no contra tu intuición.

## Qué ya revisó la máquina (no lo repitas, verificalo por muestreo)

- **Gate 4R**: cuatro reviewers read-only (risk, readability, reliability,
  resilience) con hallazgos y fix batch en `state.yaml` → `gates:`.
- **TDD estricto**: tabla de evidencia RED→GREEN por task en `apply-progress.md`.
- **Presupuesto de revisión**: los changes vienen troceados a ~400 líneas por
  PR; si ves uno gigante debe traer `size:exception` aprobado en el ledger.

## Dónde enfocar tu valor humano

- ¿El spec dice lo que el negocio necesita? (la máquina valida código↔spec, no
  spec↔realidad)
- ¿Las suposiciones del `assumptions:` ledger son aceptables o alguna debió ser
  pregunta?
- ¿Los trade-offs de los ADRs siguen valiendo en tu contexto?

## Señales de alerta

- `verify-report.md` con verdict `PASS WITH WARNINGS` sin aceptación explícita
  de los warnings.
- Commits sin trailers `Ospec-Change`/`Ospec-Task` en un repo con trazabilidad
  `required`.
- Un change archivado cuyo delta pisó un baseline que otro change movió
  (buscá `stale-baseline` en el estado — el harness lo bloquea, pero un override
  manual queda registrado).
