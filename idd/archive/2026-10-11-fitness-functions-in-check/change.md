# fitness-functions-in-check

## Intent and acceptance

E3.3: los ADR y los escenarios de calidad declaran comprobaciones ejecutables (fitness functions) que ospec check ejecuta como evidencia; las no ejecutables quedan como checklist con evidencia manual

Acceptance: Un cambio que toca un componente gobernado por un ADR cuya fitness function ejecutable falla no puede cerrarse, y el motivo de ospec check y de ospec close cita el id del ADR

## Plan

1. **Contratos de la declaración.**
   - `parseFitnessChecks` (`decision-records.js`) lee las líneas `- Check: \`<orden>\`` de la sección `Fitness function` de un ADR (REQ-decision-records-008). La prosa sigue siendo `fitness_function` y el lint no cambia.
   - `ospec-knowledge-map/v2` (`schemas/foundation/knowledge-map/v2.schema.json`) añade a cada escenario de calidad un `fitness` con `checks` o `description`. `validateKnowledgeMap` ramifica por versión: v1 sigue validando y una versión desconocida se rechaza con la regla `schema` (REQ-knowledge-map-005).
2. **Fitness functions en IDD.**
   - `scripts/lib/idd-fitness.js` (puro) elige las fitness functions de las referencias de `impacts`, exime un ADR superseded o que el cambio enmienda, sustituye o contradice con el gate resuelto, y separa comprobaciones ejecutables de items manuales. También redacta el motivo que cita el ADR o el escenario.
   - `readFitnessSources` (`idd-workspace.js`) lee los ADR y el mapa de conocimiento de la base del cambio con `git ls-tree` y `git cat-file`, nunca del árbol de trabajo. Una base ilegible es un aviso.
   - `ospec check` ejecuta las comprobaciones tras los checks declarados y las registra como runs `fitness` con su `ref`. `settleImpacts` exige que todas pasen en el árbol actual y nombra esos runs en la evidencia (REQ-idd-022).
   - `ospec record fitness --evidence` guarda la evidencia manual en `attestations`. `next` y `check` muestran `fitness` (`checks` y `manual`), en JSON y en texto.
   - Contrato de estado: run `fitness`, campo opcional `attestations` y validación de la evidencia de impacto con fitness (REQ-idd-003, REQ-idd-014).
3. **Spec, skills y dogfooding.** REQ-idd-022 (y REQ-idd-003, 005, 011 y 014); skills `idd` y `foundation` y plantilla del ADR. Los ADR 0001, 0002, 0004, 0005, 0007, 0008, 0009, 0010 y 0011 declaran sus comprobaciones. 0006 gana `scripts/lib/memory-boundary.test.js` y 0003 queda en prosa. Roadmap.

## Decisions

- **Respuestas del gate open-facts (usuario, «si, las recomendadas»):**
  - La comprobación es una orden de shell; pasa con código 0. No hay reglas de dependencias integradas (ADR 0010).
  - En el ADR, una línea `- Check: \`<orden>\`` por comprobación dentro de `## Fitness function`.
  - Los escenarios declaran `fitness` en `ospec-knowledge-map/v2`; v1 se sigue leyendo (ADR 0009).
  - Solo corren las fitness functions de las referencias `current` de `impacts`. Queda exento el ADR que el cambio enmienda, sustituye o contradice con el gate resuelto.
  - Se leen de la base del cambio para que el cambio no pueda debilitarlas.
  - El veredicto lo lleva `adr-impact-declaration`, y el motivo cita el ADR.
  - Las no ejecutables son un checklist visible que no bloquea (ADR 0005); `ospec record fitness` guarda su evidencia.
  - Dogfooding: `Check:` en los ADR de ospec que ya son tests, regla de frontera real para 0006 y 0003 en prosa.
- **`fitness` con `checks` o `description`:** el validador del repo no soporta `minProperties`, así que el esquema v2 lo expresa con `if`/`else`.
- **Orden de los motivos:** un fallo de fitness se informa antes que un impacto sin declarar, porque es un hecho observado.
- **El mapa nuevo sigue naciendo en v1:** `ospec foundation next` escribe v1. La skill pide v2 cuando un escenario declare `fitness`, para que los proyectos actuales no cambien.
- **Frontera de 0006:** comprueba el grafo de `require` locales de los módulos `idd-*.js`; el doctor puede detectar la memoria porque diagnostica y no decide.
- **Evidencia `ruta:línea` desplazada:** las ediciones de `scripts/ospec.js` y de la skill `foundation` movieron líneas citadas por el mapa de componentes, el mapa de conocimiento y ADR-0003 (93→107, 643→701, 32→34, 50→62, 52→64, 53→65, 54→66 y `SKILL.md` 80→83). Se actualizan los números sin tocar el texto de la decisión, como en E3.1 y E3.2.
- **Impacto propio:** todas las referencias derivadas (ADR 0001, 0003, 0004, 0005, 0006, 0009, 0010 y 0011 y cuatro escenarios) son `conforms`. Como la base aún no tiene líneas `Check:`, este cambio las ve como checklist manual; se registra la evidencia de ADR 0003.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-11T19:44:02.884Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-11T19:44:02.884Z)
- ev-3: check-run for checks-pass (2026-10-11T19:45:03.718Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-10-11T19:45:03.718Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-11T19:45:03.718Z)
- ev-6: check-run for checks-pass (2026-10-11T19:45:33.678Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-10-11T19:45:33.678Z)
- ev-8: living-doc-current for living-doc (2026-10-11T19:45:35.647Z)
<!-- ospec:evidence:end -->
