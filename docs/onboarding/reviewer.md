# ospec-workflow en 10 minutos — para el reviewer

**La pregunta que respondes aquí: ¿cómo leo un change?**

## Orden de lectura de un change (5 archivos, en este orden)

1. **`proposal.md`** — intención, alcance y rollback. ¿El problema es el que
   crees que es? Si no, todo lo demás da igual.
2. **`specs/{dominio}/spec.md`** — el contrato: requirements con IDs estables
   (`{#REQ-dominio-NNN}`) y escenarios Given/When/Then. Esto es lo que el código
   promete; revísalo ANTES que el diff.
3. **`design.md` + `decisions/adr-*.md`** — el cómo y el porqué. Los ADRs traen
   alternativas descartadas y consecuencias: si una decisión te chirría, primero
   mira si ya está justificada.
4. **`verify-report.md`** — la Traceability Matrix (REQ → tasks → commits →
   tests) y el veredicto. Un REQ sin test vinculado ya viene marcado WARNING.
5. **El diff** — sólo aquí. Con specs y design leídos, el diff se revisa contra
   un contrato, no contra tu intuición.

## Lo que ya ha revisado la máquina (no lo repitas, verifícalo por muestreo)

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
  (busca `stale-baseline` en el estado — el harness lo bloquea, pero un override
  manual queda registrado).
