# knowledge-by-reference

## Intent and acceptance

E3.2: un mapa componente → conocimiento da a ospec next las referencias pertinentes (ADR, escenarios de calidad, glosario, restricciones) con su vigencia, y deriva la señal adr-or-quality-attribute de los componentes tocados

Acceptance: Un cambio que toca un componente recibe solo las referencias de ese componente, por id y con vigencia actual/desactualizada/ausente; una referencia desactualizada produce un aviso y no se usa como verdad; un proyecto sin mapa sigue funcionando sin referencias

## Plan

1. **Contrato del mapa.** `ospec-component-map/v2` (`schemas/foundation/component-map/v2.schema.json`) añade a cada componente `paths` (globs) y `knowledge` (`adrs`, `scenarios`, `terms`, `constraints`). `validateComponentMap` ramifica por versión: v1 sigue validando y una versión desconocida se rechaza con la regla `schema`. Fixture `recovery/component-map-v2.json` y REQ-component-map-004.
2. **Referencias en IDD.**
   - `scripts/lib/idd-knowledge.js` (puro) resuelve los componentes tocados, sus referencias por id y su vigencia (`current`, `stale`, `absent`), y un aviso por cada una no vigente. También lee los términos del glosario.
   - `readKnowledgeSources` (`idd-workspace.js`) lee el mapa, los ADR con su estado y la evidencia que ya no resuelve, los escenarios y slots del mapa de conocimiento y el glosario. Un documento roto da un aviso.
   - `deriveSignals` activa `adr-or-quality-attribute` con los ADR y escenarios vigentes de los componentes que tocan el plan (`signals`) y el diff (`check`), y los registra en `impacts`.
   - `ospec next` añade `references` y `warnings` (en JSON y en texto); `signals` y `check` muestran los avisos. `knowledge_refs` no cambia.
3. **Spec, skills y dogfooding.** REQ-idd-021, REQ-idd-011 y REQ-idd-020 en la spec IDD; skills `idd` y `foundation`; `docs/architecture/component-map.yaml` de ospec pasa a v2; roadmap.

## Decisions

- **Respuestas del gate open-facts (usuario, «voy con las recomendadas»):**
  - Mapa v2 que convive con v1 (ADR-0009) y globs explícitos.
  - La referencia derivada activa la señal y pide impacto.
  - Lo desactualizado o ausente avisa y no entra en `impacts`.
  - Vigencia por tipo:
    - ADR: ausente si no existe; desactualizado si está `superseded` o su evidencia no resuelve.
    - Escenario y término: ausentes si faltan.
    - Slot: `confirmed` o `n/a` vigente, `assumed` desactualizado, `unknown`, `deferred` o inexistente ausente.
  - Glosario: encabezados y primera columna de tabla de `docs/product/glossary.md`.
  - Salida aditiva.
  - `next` resuelve en vivo con plan y diff.
  - Un mapa inválido es un aviso.
  - Dogfooding del mapa de ospec.
- **Solo las referencias de componentes:** `references` no repite las referencias declaradas con `--adr`/`--quality`, que ya están en `impacts`.
- **Diff ilegible en `next`:** las referencias se resuelven solo con el plan y se añade un aviso; `next` no falla.
- **Avisos en `signals` y `check`:** aparecen solo si los hay, para no cambiar la salida de los proyectos sin mapa.
- **Evidencia `ruta:línea` desplazada:** las ediciones de `scripts/ospec.js` movieron las líneas que citan el mapa de componentes, el mapa de conocimiento y ADR-0003 (91→93, 611→643, 49→50, 51→52, 52→53, 53→54). Se actualizan los números sin tocar el texto de la decisión, como en E3.1.
- **Impacto propio:** el diff derivó ADR 0001, 0003, 0004, 0005, 0006, 0009, 0010 y 0011 y cuatro escenarios de los componentes tocados. Todos son `conforms`, salvo 0006 (`none`, la memoria no se toca).

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-11T18:35:35.482Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-11T18:35:35.482Z)
- ev-3: check-run for checks-pass (2026-10-11T18:36:31.447Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-10-11T18:36:31.447Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-11T18:36:31.447Z)
- ev-6: living-doc-current for living-doc (2026-10-11T18:36:38.614Z)
<!-- ospec:evidence:end -->
