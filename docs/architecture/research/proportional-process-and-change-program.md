# Investigación: proporcionalidad de proceso y programa de changes

> **Estatus:** investigación tracked no normativa; no define estado, prioridad ni autorización de implementación.
> **Corte:** repositorio v2.49.0 inspeccionado el 2026-08-27.
> **Origen:** análisis de la tabla viva de routing, `sdd-continue`, `delivery_strategy` y el hueco entre recetas K10 y federación R4.
> **Autoridad vigente:** [`../harness-evolution.md`](../harness-evolution.md) para arquitectura y [`../../roadmaps/harness-evolution.md`](../../roadmaps/harness-evolution.md) para prioridad, estado y done criteria.
> **No sustituye** la investigación P0–P27 ([`harness-kernel-graph-evidence-roadmap-fusion.md`](harness-kernel-graph-evidence-roadmap-fusion.md)).

## Dictamen

Hay **dos escalas distintas**. Tratarlas como un solo problema (más fases, más agentes, más barato el modelo, o un orquestador nuevo) degrada la visión ya fijada.

| Escala | Pregunta | Primitiva correcta | Qué no es |
| --- | --- | --- | --- |
| Dentro de un change | Cuánto proceso y assurance merece **este** change | Receta compilada (Direct/Repair/Bounded/Planned/Critical) con hard floors | `delivery_strategy`, agentes espejo, baratear `sdd-apply` |
| Entre changes | Cómo partir un objetivo que no cabe en un change y seguirlo con contexto fresco | **Change Program**: lista persistida de children OpenSpec + cursor | Chained PRs, R4 epic/federation, pipeline Specifier/Coder/Cleaner |

La visión kernel **no cambia**: OpenSpec/Git mandan; Execution Graph ≠ Assurance Graph; cuatro identidades; K6b sigue siendo next-eligible; Direct productivo espera K10 tras K9. Esta nota nombra un defecto de compatibilidad del producto actual y un hueco innombrado; no abre un milestone paralelo.

## Fuera de alcance

- Implementar recetas K10, Nivel 0 de review, model routing por nodo o federación R4.
- Reabrir K2, K3, K4a, K5, K6a, K4b u otros slices `done`.
- Ampliar el alcance de K6b (verifier / evidence / Assurance Graph).
- Crear `architect-agent`, fase `architecture`, ruta rígida `epic`, segundo orquestador o agentes espejo `*-cheap`.
- Convertir mutation/CRAP o Quality Attributes en identidades o gates globales.
- Autorizar un change de código; la compatibilidad de first-match, si se aborda, es un change aparte.

## Hechos verificados

| Área | Hecho | Consecuencia |
| --- | --- | --- |
| Tabla viva | En `openspec/config.yaml`, `standard` coincide por `project.status: active` **antes** de `lite`. | `/sdd-new` en un repo active recorre el ciclo completo + clarify + 4R. Lite es opt-in (`/sdd-lite`) o inalcanzable por first-match. |
| Metadata vs matching | El array `classification:` de cada ruta no filtra. Lite exige `change.classification: small`; `trivial` no cumple. | Aunque se reordene, la condición de lite sigue mal alineada. |
| K1 | `scripts/lib/change-classification.js` publica `direct\|repair\|bounded\|planned\|critical` y hard floors. Comentario explícito: no cablea routing (K1 out of scope). | Correcto respecto a K10. No justifica el shadowing de lite. |
| 4R | `bugfix`/`refactor`/`standard` listan `4r-review-gate`; `lite`/`hotfix` no. Dentro de 4R, O4 ya selecciona 0–2 especialistas. | El coste dominante de un change fácil no son cuatro lenses: son spec+design+clarify+generalist. |
| Modelos | `models.yaml`: propose/design/verify/`review-change` = premium; apply = default; tasks/archive/explore = cheap. | Baratear apply rinde poco frente a no lanzar fases premium. K11b sigue siendo routing por nodo. |
| Continue | `/sdd-continue` avanza la **siguiente fase de un change**. Sin skill propio. Con varios activos, hooks toman el más reciente por mtime. | No hay cola de changes. |
| PRs vs changes | `delivery_strategy` + presupuesto ~400 líneas parten **un** change en PRs. | No parte un objetivo semántico. |
| `depends_on` | Aparece en `state.yaml` de programas federados históricos. Ningún script de `scripts/` lo consume como DAG entre changes. | Documental, no scheduler. |
| Persistencia | Invariante 3: reanudar desde filesystem. Agentes de fase ya son efímeros. El orquestador acumula el hilo. PreCompact escribe session-summary del change más reciente; no compacta en frontera de fase. | Reset seguro = sesión nueva + `/sdd-continue {nombre-exacto}`. Compact ingenuo puede elegir el change equivocado y no debe resetear lineage/budgets. |
| R4 | Subgraphs, provider→consumers, verify federado, archive coordinado. Prohíbe ruta `epic` y segundo coordinador. Posterior a K4a/K4b/K8/K12. | No es un mini-roadmap de `/sdd-new` concatenados. |
| K10 Planned | Dependencias **cross-module dentro de un change** compiladas a Execution Graph. | No es una lista de carpetas `openspec/changes/*`. |

## Tres capas que no se deben mezclar

```text
Change Program          → cuántos OpenSpec changes tiene un objetivo
  └── receta K10        → qué capacidades/fases merece cada change
        └── delivery    → cuántas PRs merece un change (400 líneas)
```

Uncle Bob (Specifier → Coder → Cleaner → Hardener → QA) describe **capacidades dentro de un change**, no children OpenSpec. El contrato semántico permanece; el prompt del worker es efímero; candidate, budgets, findings y evidencia no se resetean con el contexto.

## Compatibilidad de producto (no es K10)

La tabla `routing:` de `openspec/config.yaml` es el producto actual (foundation/federated/bugfix/brownfield/refactor/hotfix/standard/lite). Las recetas kernel son Direct/Repair/Bounded/Planned/Critical. P3 del análisis de fusión ya avisó que lite/standard/strict **mezclan** intención, topología y rigor.

Hasta K10, la tabla viva debe poder seleccionar un camino corto **sin** activar Direct productivo:

1. `project.status: active` no puede ser catch-all que impida evaluar clase.
2. Hard floors K1 clampan: auth/migración no bajan a lite; API pública no se trata como mecánico.
3. Eso es **compatibilidad** del default actual. No adelanta Repair/Direct, no cambia K9 y no sustituye recetas.

Un change de código sobre first-match, si se hace, es independiente de K6b y no altera la ruta crítica.

## Change Program (nombrado, sin slice)

Contrato mínimo hipotético — no autorizado:

```text
program.yaml
  goal: <intención humana>
  children:
    - id: change-a
      depends_on: []
    - id: change-b
      depends_on: [change-a]
  cursor: change-a | change-b | done
```

Cada child es un `openspec/changes/{id}/` normal. `/sdd-continue {id}` sigue significando “siguiente fase”. Continue a nivel de programa (si se introduce) solo avanza el cursor cuando el child está terminal, y recomienda **sesión fresca** por child.

Acceptance del programa ≠ archive de un child. El cursor vive en OpenSpec, no en el chat.

**Por qué no es un K nuevo ahora:** no introduce autoridad de lifecycle, no invalida K4a/K8/R4 y no desbloquea K6b. R4 podrá reutilizar children con identidad propia más adelante. Meterlo en K6b o en K10 Planned mezclaría verifier o grafo intra-change con orquestación inter-change.

## Relación con slices vigentes

| Hallazgo | Dueño | Qué hacer |
| --- | --- | --- |
| First-match sombra lite | Compatibilidad de producto (change aparte, opcional) | No esperar a K10 Direct; no meter en K6b |
| Recetas Direct/Repair/… | K10, una a una, tras K9 | Sin cambio de alcance |
| Nivel 0 sin modelo | K7 | Conservar O4; no omitir 4R por “parece small” sin floors |
| Model routing por complejidad | K11b | No duplicar roster con `*-cheap` |
| Evidence/QA/fitness/challenges | K6b → K6c (hilo distinto) | No mezclar con esta nota |
| Federación/epic | R4 | Una frase de exclusión: ≠ Change Program |
| Corpus 10–30 changes | K12 | Mide consecutivos; no los orquesta |
| Context reset seguro | Contrato de orquestador ya escrito | Forzar nombre exacto; no resetear lineage |

## Hipótesis (no defaults)

1. Reordenar/afilar la tabla viva reduce coste de changes mecánicos sin omitir hard floors.
2. Compactar o abrir sesión en frontera de **change** (y, de menor palanca, de fase) evita acumulación del orquestador; no sustituye persistencia OpenSpec.
3. Un `program.yaml` mínimo evita changes monolíticos mejor que chained PRs, sin segundo lifecycle.

Estas hipótesis no cambian defaults. K9 sigue gobernando cualquier promoción de receta o policy.

## Tensiones abiertas

1. ¿El arreglo de first-match es un change de compatibilidad ahora, o se espera a tocar routing en K10? (No bloquea K6b.)
2. ¿El schema de Change Program nace como artefacto de orquestador o espera a que R4 fije children con Candidate propio? (Recomendación: nombrarlo ahora, no implementarlo ahora.)
3. ¿`/sdd-continue` sin argumentos debe dejar de elegir por mtime cuando hay varios activos? (Compatibilidad; no es kernel.)
