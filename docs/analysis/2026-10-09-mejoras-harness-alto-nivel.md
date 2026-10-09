# Mejoras del harness para desarrollo de alto nivel

> **Fecha:** 2026-10-09 · **Base:** analizado sobre `main` v2.117.18 y reconciliado con v2.118.0 (ver «Reconciliación con v2.118.0») · **Estado:** completo; pendiente de decisión del usuario (sección 12) antes de pasar al roadmap.
> **Pedido del usuario:** puntos de mejora detallados para que el harness sirva a desarrollo de alto nivel: cambios pequeños y grandes, contexto de varios microservicios y servicios, workspace federado que funcione bien con IDD, y una foundation con visión real de arquitecto (holística, sin sobrearquitectura), con un aplicador IDD que haga desarrollos justificados, simples y suficientes.
> **Alcance:** análisis. No implementa nada ni cambia prioridades; lo que se acepte entra después en el [roadmap](../roadmaps/harness-evolution.md).

## Índice

0. [Reconciliación con v2.118.0](#reconciliación-con-v21180)
1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Método y fuentes](#2-método-y-fuentes)
3. [Estado actual verificado](#3-estado-actual-verificado)
4. [Principios de diseño para las mejoras](#4-principios-de-diseño-para-las-mejoras)
5. [Escala del cambio: de lo trivial a lo grande](#5-escala-del-cambio-de-lo-trivial-a-lo-grande)
6. [IDD: aplicador justificado y simple](#6-idd-aplicador-justificado-y-simple)
7. [Foundation con visión de arquitecto](#7-foundation-con-visión-de-arquitecto)
8. [Workspace federado y multi-servicio](#8-workspace-federado-y-multi-servicio)
9. [Antisobreingeniería como garantía verificable](#9-antisobreingeniería-como-garantía-verificable)
10. [Medición y evaluación](#10-medición-y-evaluación)
11. [Priorización y secuencia propuesta](#11-priorización-y-secuencia-propuesta)
12. [Riesgos, límites y decisiones abiertas](#12-riesgos-límites-y-decisiones-abiertas)

## Reconciliación con v2.118.0

Este análisis se escribió sobre v2.117.18, en paralelo a la entrega v2.118.0 («auditoría del harness», hecha en otra sesión). v2.118.0 resuelve parte de lo que aquí se propone. El estado de cada mejora tras ella:

| Mejora | Estado tras v2.118.0 | Qué queda |
| --- | --- | --- |
| M5 reglas de diseño | **Hecha:** sección «Build it simply» del protocolo `idd` (cambio mínimo, reutilizar, capa o dependencia solo por necesidad presente, no arreglar lo ajeno de paso) | Nada en la instrucción; la detección y la auditoría siguen en M7–M9 |
| M10 tests proporcionados | **Hecha:** «Tests by risk» (reglas de negocio, validación, contratos, bordes y errores; tests que fallen si el comportamiento es incorrecto; sin porcentaje de cobertura; refactor con red registrada por `ospec check`) | Medir en el banco los mutantes de frontera (sección 10) |
| M12 foundation fuera de SDD | **Parcial:** la skill `foundation` se instala en todos los targets, el router le envía los proyectos sin código, pregunta en rondas de ≤ 4 con recomendación y supuestos, registra ADR agnósticos y escenarios, y propone `idd/config.yaml` con aprobación | Motor determinista `ospec foundation next/record` (E2.2) y esquema de máquina del mapa (E2.1): hoy el mapa es Markdown (`docs/roadmap-gaps.md`) y la selección de preguntas la hace el modelo |
| Reglas de arquitecto (7.2) | **Hechas como instrucción** en «Think like an architect» de la skill `foundation` | El lint de M13 que las haga visibles |
| M3 reglas de corte / M22 multi-repo | **Parcial, como instrucción:** «Several services or repositories»: un cambio IDD por repositorio y *expand → migrate → contract* | Cortes verticales y esqueleto andante en IDD; programa con cursor (M2) y coordinación por CLI (M22) |
| H11 conocimiento consumido | **Parcial:** el protocolo lee `docs/architecture/decisions/` para abrir el gate `adr-amend-or-contradict` | `knowledge_refs` sigue devolviendo solo el documento vivo (M11, M17) |
| H4 monorepos | **Parcial:** el protocolo pide proponer entradas de `impact:` (incluido `stack`, que ya existía: REQ-idd-012) cuando los manifiestos están bajo la raíz | Unidades con checks propios y `check` selectivo (M18) |

El resto (M1, M2, M4, M6–M9, M11, M13–M23) sigue pendiente. Las secciones siguientes conservan el diagnóstico original sobre v2.117.18; donde v2.118.0 lo cambia, la fila o el párrafo lo indica.

## 1. Resumen ejecutivo

IDD ya resuelve bien el centro del problema: ceremonia por impacto calculada por código, cierre por evidencia y un coste del 4,7 % del modo SDD sin más defectos escapados. Para desarrollo de alto nivel le faltan cuatro cosas, todas verificadas en el código:

1. **Conocimiento.** En v2.117.18 no había foundation, ni recuperación brownfield, ni federación con la instalación por defecto (H1); v2.118.0 trae la foundation, pero brownfield y federación siguen siendo fases SDD. Y aunque existieran, `ospec next` no entrega ninguna referencia de conocimiento salvo el propio documento del cambio (H11). **Hay que cablear el consumo antes de producir más documentos.**
2. **Criterio de diseño garantizado.** La simplicidad que muestra IDD en el banco (−32 % de código, preferido por alcance) era emergente. v2.118.0 añade la instrucción («Build it simply», «Tests by risk»), pero nada en el cierre detecta dependencias nuevas, superficie añadida ni trabajo fuera del plan (H2, H3, H7, H8). **Hay que repartir «simple y suficiente» entre instrucción, detección por el CLI y una revisión independiente acotada que ya existe pero IDD no usa.**
3. **Multi-servicio.** Las señales no ven servicios dentro de un monorepo (stack solo en la raíz), ignoran los contratos asíncronos y no leen el atlas federado, que ya sabe qué servicios consumen cada contrato (H4, H5, H6). **Hay que introducir un modelo único de unidades y contratos que sirva igual para un servicio, un monorepo y varios repos.**
4. **Escala.** Un objetivo grande no tiene forma propia más allá de `--work-units` (H9). **Hace falta un programa mínimo (objetivo, hijos, dependencias y cursor) que reanude desde disco, con reglas de corte vertical y *expand → migrate → contract*.**

Se proponen 23 mejoras (M1–M23) en cuatro fases: **A** reglas y detecciones baratas del aplicador; **B** conocimiento consumido (mapa de componentes, señal de superficie nueva, lente de simplicidad); **C** foundation de arquitecto independiente del modo (Etapa 2 reordenada, con reglas contra la sobrearquitectura y *fitness functions* como checks normales); **D** unidades, federación con obligación de compatibilidad de consumidores y programa de cambios. Cada fase llega con su escenario de medición (multi-servicio, programa grande y foundation greenfield) y sus márgenes. Ninguna añade gates: añaden obligaciones con evidencia. Seis decisiones (sección 12) son del usuario, entre ellas adelantar federación y programa, que hoy están «por demanda».

## 2. Método y fuentes

Lectura directa del repositorio en `main` (v2.117.16 y posteriores): roadmap único, skill `idd`, módulos `scripts/lib/idd-*.js`, catálogo de señales y obligaciones, paquete opcional SDD (`scripts/lib/skill-extras.js`), foundation (`skills/sdd-foundation`), recuperación brownfield (`skills/sdd-baseline`), federación (`skills/sdd-workspace`, `scripts/lib/workspace-atlas.js`, `federation-*.js`) y el diseño archivado de foundation holística. Cada afirmación del estado actual cita `fichero` o `fichero:línea`; lo que no se pudo comprobar se marca como hipótesis. Las cifras de coste y calidad vienen de los informes del banco ya publicados (`docs/analysis/2026-10-07-bench-idd-2.md`).

## 3. Estado actual verificado

### 3.1 Lo que ya funciona y conviene conservar

- **Ceremonia por impacto, decidida por código.** `scripts/lib/idd-contract.js:60-70` mapea 8 señales a 8 obligaciones; cada obligación solo se satisface con evidencia que registra el CLI (`validateState`, l.207-229). Un typo cierra con los checks; un bug, con su test de reproducción.
- **Recalcular con el diff real.** `ospec check` deriva señales del diff, y desde E1.11 `next` exige declarar el plan (`declare-plan`) y `record retract` corrige un plan sobredeclarado.
- **Coste bajo.** En el banco, IDD gastó el 4,7 % de los tokens del modo SDD (3,06 M frente a 65,7 M) con 0 defectos escapados y 43/43 checks (`idd-2`); un juez a ciegas prefirió IDD en 5 de 6 por alcance, y SDD ganó en tests.
- **Gates mínimos.** Cuatro: intención ambigua, hechos abiertos (un solo lote), operación irreversible y ADR enmendado o contradicho (este último aún inactivo).

### 3.2 Huecos estructurales

| # | Hueco | Evidencia | Consecuencia |
| --- | --- | --- | --- |
| H1 | **IDD no tiene foundation, ni brownfield, ni federación.** Las tres capacidades existen solo como fases SDD, y el paquete SDD es opcional | `scripts/lib/skill-extras.js:29-34` excluye `skills/sdd-*`, `agents/sdd-*` y `commands/sdd-*` de la instalación por defecto; `sdd-foundation` exige `openspec/config.yaml` y recomienda `/sdd-new` (`skills/sdd-foundation/SKILL.md:29,109`) | Con la instalación por defecto, un proyecto nuevo, un repo heredado o un sistema de varios servicios no reciben conocimiento de arquitectura: IDD trabaja solo con el diff. **v2.118.0:** la foundation ya se instala siempre (skill `foundation`); brownfield y federación siguen en el paquete SDD |
| H2 | **El aplicador no tiene criterio de diseño.** La skill `idd` dice qué evidencia registrar, pero no cómo decidir la solución | `skills/idd/SKILL.md` (132 líneas): reglas de hechos abiertos, plan, obligaciones, codificación y gates; ninguna sobre simplicidad, reutilización, alcance o justificación | La calidad del diseño depende del modelo; nada impide añadir capas, abstracciones o dependencias que el cambio no necesita, ni lo hace visible. **v2.118.0:** la instrucción existe («Build it simply», «Tests by risk»); siguen faltando la detección y la auditoría |
| H3 | **El documento vivo no exige justificación.** Secciones fijas: «Intent and acceptance», «Plan», «Decisions», «Evidence» | `scripts/lib/idd-contract.js:17`; `idd-close.js:84-88` solo comprueba que el documento sea legible y esté al día | Un cambio grande puede cerrar con un plan sin alternativas ni razones, y un cambio pequeño no necesita nada de eso: falta proporcionalidad dentro del documento |
| H4 | **Las señales no entienden monorepos ni servicios.** El stack se detecta por los ficheros de la raíz | `scripts/lib/idd-workspace.js:43` llama a `detectStacks(fs.readdirSync(root))`; `STACK_MARKERS` en `scripts/lib/idd-impact.js:69` | En `services/orders/pom.xml` + `services/web/package.json` sin manifiesto en la raíz no se aplica ningún patrón de stack: solo los patrones base (`**/api/**`, `*.proto`…), así que un `*Controller.java` de un servicio no activa `public-contract`. `impact.stack` (REQ-idd-012) permite declararlo a mano, pero para todo el repo, no por servicio; **v2.118.0** pide al agente proponer esas entradas |
| H5 | **Los contratos asíncronos no son contrato público.** Los patrones base cubren REST, OpenAPI, proto y GraphQL | `scripts/lib/idd-impact.js:17-24` | Cambiar un esquema de evento (AsyncAPI, Avro, JSON Schema de un topic) no pide actualizar contrato ni test: es el modo de rotura más habitual entre microservicios |
| H6 | **IDD ignora el atlas federado.** El atlas ya calcula el conjunto de impacto de un proveedor (proveedor ∪ consumidores) | `scripts/lib/workspace-atlas.js:190-215`; ningún `scripts/lib/idd-*.js` lee `workspace.yaml` | Un cambio en el proveedor no sabe qué servicios consumen su contrato, ni pide evidencia de compatibilidad para ellos |
| H7 | **El alcance no se vigila.** Las rutas del plan y las del diff solo alimentan señales | `scripts/lib/idd-signals.js:130-134` recorre `declaration.paths` y `diff.paths` por separado para derivar señales; no encontré ninguna comparación entre ambos conjuntos | Un cambio puede crecer fuera de lo planificado (refactors oportunistas, «ya que estoy») sin que el cierre lo note |
| H8 | **El revisor de mantenibilidad no es alcanzable desde IDD.** IDD solo abre la lente `trust` | `scripts/lib/idd-review.js:26-28` fija `trust-review`, lente `trust` y revisor `review-trust`; `review-evolution` («complejidad estructural y deriva de contrato», `agents/review-evolution.agent.md:3`) solo lo usa el gate 4R del modo SDD | La sobreingeniería no tiene ninguna revisión independiente en el flujo por defecto, aunque el revisor ya existe |
| H9 | **Un cambio grande no tiene forma propia.** `--work-units` solo activa el documento vivo | `scripts/lib/idd-contract.js:65`; el *Change Program* (objetivo → cambios hijos con cursor) está aparcado como E5.5 | Un objetivo de varias semanas o varios servicios cabe en un único cambio IDD sin cortes entregables, o se trocea a mano sin continuidad entre sesiones |
| H10 | **La foundation actual es un cuestionario de 9 preguntas, una por turno.** | `skills/sdd-foundation/SKILL.md:30` («una pregunta bloqueante cada vez»); fila «Conocimiento capturado en foundation» del roadmap: «9 preguntas lineales» | No razona desde huecos de decisión ni separa arquitectura de tecnología; E2.1–E2.6 lo resuelven en el papel, pero sin empezar. **v2.118.0:** rondas de ≤ 4 con recomendación, ADR agnósticos y criterio de arquitecto, guiados por el modelo (sin motor determinista) |
| H11 | **El conocimiento escrito no llega al cambio.** `knowledge_refs` solo contiene el documento vivo del propio cambio | `scripts/lib/idd-next.js:116`; ni `skills/idd` ni los revisores mencionan `docs/product/*` ni `docs/architecture/*`. Ya en julio se detectó que ninguna fase SDD leía los documentos de foundation (memoria «Eje G», G4) | Aunque exista una foundation excelente, IDD no la consulta: sería papel muerto. Cualquier inversión en foundation sin consumo aguas abajo no cambia ningún resultado. **v2.118.0:** el protocolo lee los ADR solo para decidir el gate `adr-amend-or-contradict` |

### 3.3 Lo que ya existe y se puede reutilizar

- **Motor de descubrimiento diseñado, no construido:** el ciclo de E2 (mapa de conocimiento → huecos → rondas de ≤ 4 preguntas → drivers → ADR agnóstico → registro tecnológico) y la tabla de profundidad según la decisión del [diseño archivado](../roadmaps/archive/2026-10-03-arquitectura/harness-foundation-holistic.md#profundidad-según-la-decisión).
- **Federación de solo lectura:** marcadores `openspec/federation.member.yaml`, atlas derivado con `members`, `provides` y `contracts`, y cálculo del conjunto de impacto (`scripts/lib/workspace-atlas.js`, ~900 líneas con tests). Hoy cuelga de `openspec/` y del modo SDD.
- **Revisión acotada genérica:** `review-lineage` (candidato congelado, hallazgos inmutables, una corrección acotada) ya sirve a IDD para `trust`; aceptar otra lente es reutilizar el mismo linaje.
- **Delta de complejidad K6d** (`openspec/specs/complexity-architecture-delta/`): delta reproducible y ligado al candidato, solo como evidencia consultiva; congelado con dueño E3.1.
- **Banco de escenarios y juez de calidad** (`scripts/evals/bench/`, `scripts/evals/quality/`): seis perfiles, checks ocultos, persona simulada, mutation testing y revisión a ciegas por pares.

## 4. Principios de diseño para las mejoras

Las mejoras deben obedecer la misma regla que piden al aplicador: **lo mínimo que resuelve el problema, justificado y medible.** Un harness que exige simplicidad no puede crecer con capas especulativas.

1. **Primero consumir, después producir.** Ningún artefacto de conocimiento nuevo (mapa, ADR, atlas) se construye antes de que un consumidor concreto lo lea: `ospec next`, una señal, un check o un revisor (H11). Orden: cablear la lectura, luego enriquecer la escritura.
2. **El tamaño no decide la ceremonia; el impacto sí. Pero la forma de entrega sí depende del tamaño.** Se mantiene el principio 2 del roadmap para las obligaciones. Lo que cambia con el tamaño es *cómo se corta* el trabajo (un cambio, un cambio con unidades, o un programa de cambios), no cuántos documentos se escriben.
3. **Algoritmo en el CLI, juicio en el modelo.** Lo verificable (rutas fuera del plan, dependencias nuevas, contratos tocados, consumidores afectados) lo calcula el CLI. Lo que requiere criterio (si una abstracción está justificada) lo decide el modelo, pero dejando rastro que un revisor pueda auditar.
4. **Arquitectura agnóstica, proporcional y reversible.** La foundation decide lo que bloquea el primer *slice* y difiere el resto con su «último momento responsable». La arquitectura por defecto es la más simple que satisface los drivers confirmados; cada pieza estructural adicional cita el driver que la exige.
5. **Mono-repo, multi-repo y servicio único con el mismo modelo.** Un servicio es una unidad con raíz, stack, checks y contratos; el workspace es un conjunto de unidades con aristas proveedor → consumidor. No hay un «modo federado» distinto del normal.
6. **Ningún gate nuevo salvo necesidad demostrada.** Los cuatro gates siguen siendo cuatro. Las mejoras añaden obligaciones con evidencia (que el CLI comprueba) en lugar de preguntas.
7. **Presupuesto de contexto como restricción dura.** Router ≤ 4 KB y protocolo IDD ≤ 16 KB (fila del roadmap). Las reglas nuevas del aplicador caben en ≤ 1,5 KB; el conocimiento entra por referencia, nunca como documento completo.

## 5. Escala del cambio: de lo trivial a lo grande

### 5.1 Diagnóstico

Hoy IDD tiene dos formas: sin documento (checks, y como mucho repro) y con documento vivo (`--work-units` o `--decision`). Funciona bien de un typo a una feature de un par de días en un solo servicio. Falla en dos extremos:

- **Arriba:** un objetivo de varias semanas, que cruza servicios o que debe entregarse en incrementos (H9). El modelo lo mete en un único cambio enorme o lo trocea a mano sin estado compartido.
- **Al medio:** un cambio de tamaño medio no tiene criterio sobre *cuándo* partir: la única referencia son las ~400 líneas por PR, que miden revisión, no riesgo de diseño.

### 5.2 Mejoras propuestas

**M1 — Tres formas de entrega derivadas, no elegidas.** El CLI propone la forma a partir de hechos que ya calcula; el modelo puede subir de forma, nunca bajarla sin razón registrada.

| Forma | Cuándo (calculado) | Qué añade | Qué no añade |
| --- | --- | --- | --- |
| **Cambio simple** | 1 unidad de trabajo, 1 componente o servicio, sin decisión no obvia | Nada: obligaciones por señal | Documento, plan, preguntas |
| **Cambio con plan** | > 1 unidad, decisión no obvia, o contrato público | Documento vivo con plan y decisiones justificadas (M6) | Fases, propuesta, specs previas |
| **Programa** | Toca > 1 servicio o repo con contrato entre ellos, o > N unidades (N configurable, p. ej. 5), o el usuario lo pide | `idd/programs/<id>/program.yaml` con objetivo, hijos, `depends_on` y cursor; cada hijo es un cambio IDD normal | Orquestador nuevo, agentes por fase, scheduler |

**M2 — Programa IDD mínimo (adelanta E5.5 en versión reducida).** Contrato tomado de la investigación archivada, adaptado a IDD:

```yaml
# idd/programs/<id>/program.yaml (lo escribe solo el CLI)
goal: "<intención humana>"
acceptance: "<resultado observable del programa completo>"
children:
  - id: orders-event-v2          # cambio IDD normal en idd/<id>/
    unit: orders                  # id de la unidad: servicio o repo (sección 8)
    depends_on: []
  - id: billing-consume-v2
    unit: billing
    depends_on: [orders-event-v2]
cursor: orders-event-v2
```

- `ospec program next` devuelve el siguiente hijo elegible y recomienda **sesión nueva por hijo** (contexto fresco; el estado vive en disco, ya lo garantiza E1.12).
- El programa cierra cuando todos los hijos están cerrados y se registra la evidencia de su aceptación global (un check o una ejecución observada, no una afirmación).
- Hecho cuando: un objetivo de dos servicios se completa en tres hijos en sesiones distintas, el cursor nunca salta un hijo con dependencias abiertas y reanudar no repite trabajo.
- Alternativa descartada: reutilizar `openspec/changes` y el modo SDD (acopla IDD a SDD); un DAG con paralelismo y scheduler (no hay demanda medida).

**M3 — Reglas de corte en la skill (≤ 400 bytes).** Cada hijo o unidad debe ser **entregable e independientemente verificable**: *slices* verticales (de punta a punta, finos) antes que capas horizontales; primero el esqueleto andante; para contratos entre servicios, *expand → migrate → contract* (añadir sin romper, migrar consumidores, retirar lo viejo). Un corte que deja el sistema roto entre hijos no es válido.

**M4 — Umbral de partición basado en riesgo, no en líneas.** `ospec signals` sugiere pasar a «programa» cuando el plan declara más de un servicio con contrato entre ellos, o una operación irreversible combinada con más de una unidad. Las 400 líneas siguen siendo el criterio de PR (revisión), separado del criterio de cambio (riesgo).

## 6. IDD: aplicador justificado y simple

### 6.1 Diagnóstico

El banco ya muestra el patrón que hay que proteger y el que hay que corregir (`docs/analysis/2026-10-07-bench-idd-2.md`, l.61-84):

- **A favor de la simplicidad:** IDD entregó un 32 % menos de código (125 frente a 184 líneas) con el mismo resultado en los 43 checks ocultos, y el juez a ciegas lo prefirió en alcance, legibilidad y diseño. El reproche principal al modo con más ceremonia fue **comportamiento no pedido**: validación estricta que rompía llamadas existentes en `public-library` y coerción de parámetros en `bugfix`. Más proceso no produjo mejor diseño; produjo más superficie.
- **En contra:** IDD escribió un 69 % menos de tests con un *mutation score* equivalente (83,1 % frente a 81,8 %), pero los dos modos dejaron vivos mutantes de frontera (`< 1` por `<= 1`): nadie probó el valor exacto del límite.
- **Causa:** la buena conducta de IDD hoy es **emergente**, no garantizada. La skill no contiene ninguna regla de diseño (H2) y nada en el cierre la comprueba (H3, H7, H8). Con otro modelo, otro prompt o un cambio más grande, nada impide la sobreingeniería.

### 6.2 Mejoras propuestas

**M5 — Reglas de diseño del aplicador en la skill `idd` (≤ 1,5 KB, siempre cargadas con el protocolo).** Texto propuesto, en el estilo de la skill:

> **Design rules.** Make the smallest change that satisfies the acceptance. Reuse the patterns, modules and libraries the code already has; follow the surrounding code's conventions. Do not add a layer, abstraction, interface, configuration option, dependency or extension point unless the current acceptance needs it; when you think one is needed, record why in the living document. Do not change behavior the request did not ask for (validation, defaults, error handling, output). Keep refactors out unless the change cannot be done without them, and then declare them in the plan. Test the behavior the acceptance names, including the exact boundary values and the error paths it implies; do not test what the change does not do.

Justificación de cada frase con evidencia: «comportamiento no pedido» viene del juez del banco (validación y coerción no pedidas, ADR y tests duplicados dentro del diff); «valores exactos del límite», de los mutantes supervivientes; «refactors fuera del plan» es el riesgo que M9 hace detectable (no lo midió el banco, que usa cambios pequeños); «dependencia o capa sin necesidad presente» es el modo de sobreingeniería que M7 hace detectable. Coste: ~1 KB de contexto, dentro del presupuesto (router + protocolo hoy 8,6–9,0 KB, objetivo ≤ 16 KB).

**M6 — Justificación proporcional en el documento vivo.** Cuando el documento vivo está activo, cada entrada de «Decisions» sigue una forma mínima de tres partes: **decisión · porque (driver, requisito o restricción) · alternativa más simple descartada y por qué**. Un lint en `ospec close` (no un gate) rechaza el cierre si «Decisions» está vacío habiendo declarado `--decision`, o si una entrada no cita un porqué. Un cambio simple no tiene documento y no paga nada.

- Alternativa descartada: plantilla ADR completa por cambio (es lo que hizo el modo SDD: ADR dentro del diff, criticado por el juez).
- Hecho cuando: un fixture con una decisión sin justificar no cierra y otro con la forma mínima sí; un cambio simple sigue cerrando sin documento.

**M7 — Señal `new-surface` (sobreingeniería detectable por código).** El CLI ya lee el diff; puede detectar sin modelo cuándo un cambio **añade superficie estructural**:

| Detección (diff) | Ejemplo |
| --- | --- |
| Dependencia nueva en un manifiesto | Línea añadida en `dependencies` de `package.json`, `<dependency>` en `pom.xml`, `require` en `go.mod`, `PackageReference` en `.csproj`, `pyproject.toml` |
| Módulo, paquete o servicio nuevo | Directorio nuevo con manifiesto propio, o nueva carpeta de primer nivel bajo `src/`, `services/`, `packages/` |
| Superficie de configuración nueva | Clave nueva en ficheros de configuración declarados en `idd/config.yaml` |

Obligación derivada: `justify-new-surface`, satisfecha por una entrada de «Decisions» (forma de M6) que nombra la superficie añadida, y, si además se activa `multi-unit-or-decision`, por la revisión de M8. No es un gate ni prohíbe nada: obliga a que la complejidad nueva quede explicada y sea auditable.

- Hecho cuando: un diff que añade `lodash` para una función de dos líneas no cierra sin justificación; un diff que solo cambia código existente no activa la señal.
- Alternativa descartada: medir complejidad ciclomática o LOC (ruidoso, castiga código legítimo, depende del lenguaje).

**M8 — Revisión de simplicidad acotada, reutilizando `review-evolution`.** Igual que `trust-review`, pero con la lente `evolution` y solo cuando coinciden `new-surface` y un cambio con plan. El revisor recibe la aceptación, el plan y el diff, y responde una pregunta: *¿hay algo en el diff que la aceptación no necesita?* Hallazgos congelados, una corrección acotada, máx. 3 revisiones: el linaje ya existe (`scripts/lib/review-lineage.js`), solo cambia la lente (H8).

- Coste: una llamada a un subagente en los cambios que añaden superficie con plan; cero en el resto.
- Alternativa descartada: revisión de simplicidad en todos los cambios (coste fijo sin evidencia de beneficio en cambios pequeños).

**M9 — Vigilancia de alcance (`scope-drift`).** En `ospec check`, comparar las rutas del diff con las declaradas en el plan (H7). Las rutas no declaradas aparecen en la salida como `undeclared_paths`; para cerrar hay que declararlas (`ospec signals --path`, que recalcula señales) o revertirlas. Es barato (diferencia de conjuntos), objetivo, y ataca la causa más frecuente de sobreingeniería en cambios medianos: el «ya que estoy».

- Hecho cuando: tocar un fichero fuera del plan impide cerrar hasta declararlo, y declararlo puede activar señales nuevas (por ejemplo, `public-contract`).
- Riesgo: ficheros generados o lockfiles; se excluyen con los mismos patrones de `impact.exclude`.

**M10 — Tests proporcionados a la aceptación.** Reforzar en la skill (dentro de M5) dos reglas: probar los valores exactos de frontera y las rutas de error que la aceptación implica; no probar comportamiento que el cambio no introduce. A medio plazo, el banco (sección 10) mide *mutation score* de frontera para comprobar que la regla funciona.

## 7. Foundation con visión de arquitecto

### 7.1 Diagnóstico

- **No existía para el flujo por defecto** (H1): en v2.117.18, la foundation, la recuperación brownfield y el workspace eran fases SDD del paquete opcional. v2.118.0 saca la foundation (skill `foundation`, instalada siempre); brownfield y workspace siguen en SDD.
- **Lo que existe es un cuestionario** (H10): 9 preguntas, una por turno, que producen `brief`, `functional-scope`, `technical-baseline` y un índice de decisiones. Marca los desconocidos, pero no razona desde decisiones pendientes ni separa arquitectura de tecnología.
- **Lo que produce no se consume** (H11): ningún paso posterior lee esos documentos. Ya se detectó en julio y sigue igual en IDD.
- **El diseño correcto ya existe en el papel:** el ciclo de E2 (mapa de conocimiento por perfil → huecos que bloquean decisiones → rondas de ≤ 4 preguntas → drivers → ADR agnóstico → registro tecnológico → herramientas → primer *slice*) y la tabla de profundidad del diseño archivado. El problema no es de visión, sino de **orden de construcción y de cableado**.
- **`docs/adr/` tiene 277 registros** que son decisiones de desarrollo, no de arquitectura (E2.6 ya lo prevé). Mientras tanto, cualquier consumidor de «ADRs» leería ruido.

### 7.2 Qué significa «visión de arquitecto» sin sobrearquitectura

Un arquitecto con experiencia no empieza por el estilo (microservicios, eventos, hexagonal), sino por **qué tiene que ser verdad** para que el sistema sirva: drivers de negocio, atributos de calidad medibles, restricciones del equipo y de la organización. Después decide **solo lo que es caro de cambiar y bloquea el primer incremento**, y deja escritas las decisiones diferidas con el momento en que habrá que tomarlas. Las reglas operativas que la foundation debe aplicar (y que un lint puede comprobar). v2.118.0 ya las incluye como instrucción en «Think like an architect»; lo que falta es comprobarlas (M13):

1. **Sin driver no hay decisión estructural.** Cada ADR cita al menos un escenario de calidad, restricción o requisito confirmado (o un supuesto con disparador). Un ADR sin driver es un aviso del lint de E2.4.
2. **La opción más simple viable es el punto de partida.** Por defecto, una unidad desplegable con módulos de límites claros (monolito modular). Distribuir (servicios, colas, bases de datos separadas) exige un driver explícito: escalado independiente medido, equipos autónomos con cadencias distintas, aislamiento de fallos o regulatorio, o tecnología incompatible. La alternativa simple aparece siempre entre las opciones comparadas del ADR.
3. **Decidir lo irreversible, diferir lo reversible.** Decisiones de puerta de dos sentidos (librería interna, estructura de carpetas, nombre de un endpoint privado) son una nota en el registro, no un ADR. Las de una sola dirección (modelo de datos persistente, contrato público, límites de confianza, topología de despliegue) llevan ADR.
4. **Último momento responsable.** Lo que no bloquea el primer *slice* queda `diferido`, con dueño y disparador (por ejemplo: «elegir broker cuando haya un segundo consumidor del evento»).
5. **Cobertura holística como lista de comprobación, no como documentos.** Las 12 dimensiones del diseño archivado (funcional, dominio, calidad, contratos, datos y privacidad, despliegue, seguridad, operación, experiencia de desarrollo, test y entrega, coste y competencias, evolución) se recorren todas, pero cada una puede cerrarse con `N/A` y su razón. Ninguna genera un fichero por sí sola.
6. **Arquitectura antes que tecnología.** El ADR no nombra productos; el registro tecnológico (TSR) implementa ADRs y compara 2–3 candidatos incluyendo «lo que ya hay» con fuentes fechadas.
7. **Cifras solo si alguien las ha dado.** No se inventan SLO, RTO/RPO ni presupuestos de rendimiento: si condicionan el diseño, quedan como supuesto o hueco.

### 7.3 Mejoras propuestas

**M11 — Cablear el consumo antes que la producción (mapa de componentes mínimo).** Antes de construir el motor de E2, crear un fichero pequeño que IDD **lee**: `docs/architecture/components.yaml`, una entrada por componente o servicio con `paths` (globs), `owner`, `contracts` (ficheros que lo definen), `adrs` (ids) y `quality` (ids de escenarios). Consumidores inmediatos:

- `ospec next` devuelve en `knowledge_refs` los ids pertinentes de los componentes que toca el plan (H11), nunca documentos completos.
- `ospec signals` usa los `contracts` del componente para `public-contract` y su raíz para el stack (H4).
- La señal de ADR (E3.1) se activa al tocar un componente con `adrs`.

Fuente del primer mapa: el mapa de dominios que `sdd-baseline` ya obtiene y el usuario ya aprueba (nombre, alcance y globs), migrado fuera de `openspec/`. Esto adelanta el núcleo de E3.2 y le da a E2 un consumidor desde el primer día.

- Alternativa descartada: construir primero el mapa de conocimiento completo de E2.1 (riesgo de repetir el «papel muerto» de julio).
- Hecho cuando: en un repo con dos componentes, un cambio en uno recibe solo sus referencias; borrar el fichero no rompe nada (IDD sigue funcionando como hoy).

**M12 — Foundation independiente del modo e instalada por defecto.** Sacar la foundation del paquete SDD: una skill `foundation` ligera (instrucciones de juicio) más `ospec foundation next|record` (algoritmo de E2.2: prioridad = impacto en decisiones × incertidumbre × irreversibilidad × peso del perfil; rondas de ≤ 4 preguntas con respuesta recomendada y «no lo sé»). Se ejecuta bajo demanda (`/ospec-workflow:foundation` o una petición explícita), nunca automáticamente en un cambio. El estado de máquina vive fuera de `openspec/` (decisión pendiente en E2.1: `idd/foundation/` o `.ospec/`); los documentos humanos, en `docs/`.

- Hecho cuando: con la instalación por defecto, un proyecto vacío completa la foundation sin `openspec/` ni `--with-sdd`, y el resultado alimenta `components.yaml`, `idd/config.yaml` (checks, TDD, patrones de impacto) y los ADR.
- Coste de contexto: la skill solo se carga al invocarla; el router no crece.

**M13 — Reglas de arquitecto como contrato verificable (amplía E2.4).** Las reglas 1–7 de 7.2 viven en la skill `foundation`, y las comprobables pasan a un lint de registros:

| Regla | Comprobación del lint |
| --- | --- |
| Sin driver no hay decisión | ADR sin referencia a escenario, restricción o supuesto → aviso |
| Opción simple considerada | ADR estructural con < 2 opciones, o sin la opción «una unidad desplegable / lo existente» cuando introduce distribución → aviso |
| Arquitectura antes que tecnología | Sección «Decisión» que nombra productos del stack detectado → aviso (ya previsto en E2.4) |
| Diferir con dueño | Ranura `diferido` sin dueño o disparador → error de esquema (E2.1) |
| Sin cifras inventadas | Escenario de calidad con medida sin fuente → aviso |

Avisos, no errores: el juicio sigue siendo humano, pero la desviación queda visible.

**M14 — Profundidad según perfil y decisión (incorpora la tabla archivada).** El perfil (prototipo, herramienta interna, producto, regulado o crítico, librería o CLI pública, embebido) decide qué ranuras son obligatorias, y la naturaleza de cada decisión decide su profundidad: nota (reversible y bajo riesgo), comparación breve (incertidumbre que cambia la elección), escenarios detallados y revisión (datos sensibles, contrato público, migración o fallo costoso), `N/A` con razón (dimensión ajena). Un prototipo termina la foundation en una ronda; un producto regulado, en varias.

**M15 — Brownfield para IDD (E2.5 sobre M11).** Al adoptar un repo existente, inferir con análisis estático barato (manifiestos, estructura de directorios, imports entre módulos, ficheros de contrato) un `components.yaml` propuesto y **ADRs inferidos** (`status: inferred`) con evidencia `ruta:línea`, y presentarlos en un único lote para confirmar o corregir. Las divergencias se registran, no se sobrescriben. Coste acotado: una pasada, sin especificar el comportamiento de cada dominio (eso era el *baseline* SDD, mucho más caro).

**M16 — *Fitness functions* sin motor nuevo (E3.3 mínimo).** Las reglas de arquitectura ejecutables se declaran como checks normales en `idd/config.yaml`, con el id del ADR que protegen:

```yaml
checks:
  test: npm test
  arch-boundaries:            # ADR-0003: el dominio no depende de infraestructura
    command: npx depcruise src --config .dependency-cruiser.cjs
    adr: ADR-0003
```

`ospec check` ya ejecuta y registra checks: basta con aceptar, además de la cadena actual, la forma `{ command, adr }` para que el fallo cite la decisión. Herramientas existentes por stack (dependency-cruiser, ArchUnit, import-linter, `depguard` de golangci-lint) en lugar de un motor propio.

**M17 — Vigencia del conocimiento.** Cada referencia del mapa registra el commit en que se confirmó. `ospec doctor` y `ospec next` marcan como `desactualizada` una referencia cuyo componente cambió mucho desde entonces (por ejemplo, más de N commits que tocan sus `paths`), en lugar de usarla como verdad (E3.2). Barato y evita el modo de fallo «documento viejo tratado como hecho».

## 8. Workspace federado y multi-servicio

### 8.1 Diagnóstico

- **La federación existe, pero solo para SDD** (H1, H6): marcadores `openspec/federation.member.yaml` en cada repo miembro, atlas derivado `openspec/workspace.yaml` y la skill `sdd-workspace` (`init`, `enroll`, `explore`, `status`, `impact`). Es de solo lectura salvo `enroll`, y eso es un acierto que conviene conservar.
- **El modelo de contrato es correcto pero incompleto.** Cada `provides` tiene `id`, `consumers` y `surface` (`openapi`, eventos…; `openspec/specs/federation-markers/spec.md:40-45`), pero **no dice qué ficheros lo definen**: con un diff no se puede saber qué contrato se ha tocado. `computeImpact` calcula proveedor ∪ consumidores directos (un salto; `workspace-atlas.js:199-213`).
- **Dentro de un monorepo no hay unidades** (H4): ni stack, ni checks, ni contratos por servicio. Hoy `ospec check` ejecuta todos los checks declarados en cada cambio: en un monorepo de 10 servicios cuyo check es el test de todo el repo, cambiar uno ejecuta los tests de los diez.
- **Los contratos asíncronos no cuentan** (H5), que es justo donde más se rompe la integración entre microservicios.
- **No hay cambio multi-repo** (H9): un cambio que debe tocar proveedor y consumidores no tiene forma de coordinarse entre repos.

### 8.2 Modelo propuesto: unidades y aristas

Un único modelo para servicio único, monorepo y multi-repo (principio 5):

```text
unidad  = { id, root, stack (detectado en root), checks, contracts[] }
contrato = { id, surface (openapi|asyncapi|proto|graphql|avro|jsonschema|lib), files (globs), provider, consumers[] }
workspace = unidades + contratos (aristas proveedor → consumidor)
```

- **Servicio único:** una unidad implícita en la raíz. Nada cambia respecto a hoy.
- **Monorepo:** lo operativo de cada unidad (raíz y checks) se declara en `idd/config.yaml` (`units:`, M18), porque IDD lo necesita aunque no haya foundation; el conocimiento (dueño, ADR, escenarios de calidad y contratos) vive en `docs/architecture/components.yaml` (M11), con el mismo id de unidad.
- **Multi-repo:** cada repo es una unidad; su marcador de miembro lleva sus `provides` (con `files`) y el atlas los agrega, como hoy.

### 8.3 Mejoras propuestas

**M18 — Detección de stack y checks por unidad.** Detectar el stack en la raíz de cada unidad (no solo en la raíz del repo; corrige H4), y permitir checks por unidad:

```yaml
# idd/config.yaml
checks:
  lint: npm run lint            # global
units:
  orders:  { root: services/orders,  checks: { test: "mvn -q test" } }
  billing: { root: services/billing, checks: { test: "npm test" } }
```

`ospec check` ejecuta los checks globales y **solo los de las unidades que toca el diff** (más las consumidoras de un contrato tocado, ver M21). Reduce coste y ruido en monorepos sin cambiar la garantía: la evidencia sigue siendo una ejecución observada de cada check exigido.

- Hecho cuando: en un monorepo de dos servicios, un cambio en `orders` ejecuta y registra solo los checks de `orders` y los globales; tocar ambos ejecuta los dos.
- Riesgo: dependencias internas entre unidades (librería compartida). Mitigación: una unidad puede declarar `depends_on`, y tocar una unidad de la que otras dependen incluye sus checks.

**M19 — Contratos asíncronos y de esquema en los patrones base (corrige H5).** Añadir a `public-contract`: `**/asyncapi*.{yaml,yml,json}`, `**/*.avsc`, `**/*.avdl`, `**/*.schema.json` en carpetas de eventos o mensajes, y los ficheros declarados en `contracts[].files`. Cambio pequeño, test de patrones existente, impacto alto en microservicios.

**M20 — Federación independiente del modo.** Mover marcadores y atlas fuera de `openspec/` (por ejemplo, `.ospec/federation.member.yaml` y `.ospec/workspace.yaml`, leyendo también la ubicación antigua), y exponer en el CLI `ospec workspace status|impact` para IDD. Añadir `files` a cada `provides`. La skill `sdd-workspace` pasa a usar el mismo módulo; no se duplica lógica.

- Hecho cuando: con la instalación por defecto, `ospec workspace impact --path services/orders/api/openapi.yaml` devuelve el contrato y sus consumidores, sin `openspec/`.

**M21 — Obligación `consumer-compatibility`.** Cuando el diff toca los `files` de un contrato con consumidores, el CLI deriva una obligación nueva, satisfecha por **una** de estas evidencias, registradas por el CLI:

| Evidencia | Cuándo usarla | Cómo se registra |
| --- | --- | --- |
| Check de compatibilidad del contrato | Hay herramienta para la superficie (por ejemplo, `buf breaking` para proto, `oasdiff breaking` para OpenAPI, diff de AsyncAPI o de esquema Avro) | Check declarado para la superficie, ejecutado por `ospec check` |
| Tests de contrato de los consumidores | Los consumidores tienen tests de contrato o *consumer-driven contracts* | `ospec run` del comando en el consumidor, sin modificar sus ficheros versionados (opt-in, ver D4) |
| Plan *expand → migrate → contract* | El cambio es incompatible a propósito | Programa (M2) con un hijo por consumidor y la retirada al final |

El conjunto de consumidores sale del atlas (un salto). El impacto transitivo (un consumidor que reexpone el contrato) queda fuera hasta que haya un caso real: un salto cubre el modo de rotura habitual y mantiene el cálculo simple.

**M22 — Cambio multi-repo como programa.** Un objetivo que toca proveedor y consumidores en repos distintos es un programa (M2) cuyo `program.yaml` vive en el repo coordinador del workspace; cada hijo es un cambio IDD normal en el `idd/` de su repo, con su propia evidencia y su propio cierre. El cursor respeta el orden *expand → migrate → contract*. Ningún repo escribe en otro: el agente abre el hijo en la sesión de ese repo. Se conserva la regla de seguridad actual (solo `enroll` escribe en un miembro).

**M23 — Contexto acotado por unidad.** `ospec next` devuelve referencias de la unidad tocada y, si hay contrato tocado, el contrato y la lista de consumidores, nunca código de otros servicios. Para entender un consumidor concreto, el aplicador usa un subagente de exploración de solo lectura (ya lo permite el ciclo IDD). Así el contexto no crece con el número de servicios.

## 9. Antisobreingeniería como garantía verificable

«Simple pero suficiente» no puede quedarse en una frase del prompt: debe repartirse entre **instrucción** (lo que el modelo decide), **detección** (lo que el CLI calcula) y **auditoría** (lo que un revisor independiente comprueba), igual que el resto de garantías de IDD.

| Riesgo de sobreingeniería | Instrucción (modelo) | Detección (CLI) | Auditoría (revisor) | Mejora |
| --- | --- | --- | --- | --- |
| Comportamiento no pedido | Regla «no cambiar lo que la petición no pide» | Hechos abiertos antes de editar (ya existe) | Lente `evolution`: «¿qué no necesita la aceptación?» | M5, M8 |
| Dependencia, capa o módulo especulativo | Regla «sin necesidad presente no se añade» | Señal `new-surface` sobre el diff | Lente `evolution` cuando hay plan | M5, M7, M8 |
| Crecimiento fuera del plan | Regla «refactors fuera, salvo que sean imprescindibles y declarados» | `undeclared_paths` en `check` | — | M5, M9 |
| Decisiones sin porqué | Forma decisión · porque · alternativa simple | Lint de «Decisions» en `close` | Lente `evolution` | M6 |
| Arquitectura distribuida sin driver | Reglas de arquitecto 1–4 | Lint de ADR (driver, opción simple) | Revisión humana en el gate de ADR | M13 |
| Tests que no protegen nada / faltan fronteras | Regla de tests proporcionados | *Mutation score* de frontera en el banco | Juez a ciegas del banco | M10, sección 10 |
| Ceremonia innecesaria del propio harness | Principios de la sección 4 | Techos de contexto en CI (E0.0/E4.3) | Checkpoint de etapa con números | — |

**Lo que no se hace:** ni métricas de complejidad ciclomática como gate, ni límites de líneas, ni un «arquitecto» en cada cambio. Son ruidosos o caros y castigan cambios legítimos; las detecciones de la tabla son objetivas (diferencias de conjuntos y manifiestos) y solo piden explicar, no prohibir.

**Aplicado al propio harness.** Cada mejora de este documento declara su alternativa más simple descartada y su coste de contexto. Las que no demuestren valor en el banco (sección 10) se retiran, igual que el roadmap retiró K2–K12.

## 10. Medición y evaluación

El banco actual (`scripts/evals/bench/`) cubre seis perfiles de un solo servicio. Para validar este documento hacen falta tres escenarios nuevos y dos métricas nuevas, reutilizando el mismo driver, persona simulada, checks ocultos y juez:

| Escenario nuevo | Qué demuestra | Checks ocultos clave |
| --- | --- | --- |
| **`multi-service-event`**: monorepo con dos servicios (proveedor y consumidor de un evento); la petición añade un campo obligatorio al evento | M18–M21: checks por unidad, contrato asíncrono detectado, compatibilidad con el consumidor | El consumidor sigue funcionando; el esquema evoluciona de forma compatible o con *expand/contract*; no se ejecutan checks de unidades no tocadas |
| **`large-feature-program`**: objetivo que requiere 3–4 incrementos entregables | M1–M4: programa, cortes verticales, reanudación entre sesiones | Cada hijo cierra con el sistema funcionando; ningún hijo deja el build roto; el cursor no salta dependencias |
| **`greenfield-foundation`**: producto pequeño con drivers ocultos (un equipo de 3, sin necesidad de escalado independiente) | M11–M14: foundation con visión de arquitecto sin sobrearquitectura | ADR con drivers; la opción simple (una unidad desplegable) elegida salvo driver oculto que la descarte; ningún servicio o broker sin driver; primer *slice* definido |

| Métrica nueva | Cómo se mide | Por qué |
| --- | --- | --- |
| **Superficie añadida no requerida** | Dependencias, módulos y opciones de configuración nuevas en el diff que no aparecen en la entrega de referencia del escenario | Mide sobreingeniería objetivamente, frente a una solución de referencia que ya existe en cada escenario |
| **Fronteras protegidas** | *Mutation score* restringido a mutantes de operadores de comparación | Valida M10 sobre el hueco observado en `idd-2` |

Las métricas existentes (defectos escapados, tokens, preguntas, intervenciones, juez a ciegas) se mantienen. Márgenes declarados antes de correr, como en E4.1: ninguna mejora puede aumentar los escapados; las reglas de M5–M10 deben reducir la superficie no requerida sin subir los tokens más de un 10 %.

## 11. Priorización y secuencia propuesta

Criterio: valor por unidad de coste, **consumir antes que producir** (principio 1) y no abrir una fase sin su escenario de medición. Tamaños: S ≈ 1 PR pequeño; M ≈ 1–2 PR; L ≈ varios PR encadenados.

### Fase A — Aplicador más disciplinado (rápida, sin dependencias)

| Orden | Mejora | Tamaño | Encaje en el roadmap |
| --- | --- | --- | --- |
| A1 | ~~M5 + M10: reglas de diseño y de tests en la skill `idd`~~ | — | **Hecho en v2.118.0** |
| A2 | M19: contratos asíncronos en los patrones base | S | Ítem nuevo; amplía REQ-idd-012 |
| A3 | M9: `undeclared_paths` en `check` | S–M | Ítem nuevo; amplía REQ-idd-014 |
| A4 | M6: forma mínima de «Decisions» y su lint en `close` | S | Ítem nuevo; amplía REQ-idd-017 |

### Fase B — Conocimiento que se consume

| Orden | Mejora | Tamaño | Encaje |
| --- | --- | --- | --- |
| B1 | M11: `components.yaml` mínimo, `knowledge_refs` reales y stack por componente (parte de H4) | M | Adelanta el núcleo de E3.2 y le da consumidor a E2 |
| B2 | M7: señal `new-surface` y su obligación | M | Ítem nuevo; nueva fila del catálogo de señales |
| B3 | M8: lente `evolution` acotada en IDD | M | Ítem nuevo; reutiliza `review-lineage` |
| B0 | Escenarios `greenfield-foundation` y medición de superficie no requerida (antes de B y C) | M | Amplía E4.1 |

### Fase C — Foundation de arquitecto (Etapa 2 reordenada)

| Orden | Mejora | Tamaño | Encaje |
| --- | --- | --- | --- |
| C1 | E2.1 con la ubicación decidida y el esquema que alimenta `components.yaml` | M | E2.1 (next-eligible) |
| C2 | M12: `ospec foundation next/record` (la skill `foundation` instalada por defecto ya llegó en v2.118.0) | M | E2.2 + resto de E2.3 |
| C3 | M13 + M14: reglas de arquitecto, lint de ADR/TSR y profundidad por perfil | M | E2.4 |
| C4 | M15: brownfield ligero que propone `components.yaml` y ADRs inferidos | M | E2.5 |
| C5 | M16 + M17: *fitness functions* como checks con `adr` y vigencia de referencias | S–M | E3.3 mínimo + E3.2 |
| C6 | Dogfooding sobre ospec (≈10 ADR de arquitectura; reclasificar los 277 de `docs/adr/`) | M | E2.6 |

### Fase D — Multi-servicio, federación y cambios grandes

| Orden | Mejora | Tamaño | Encaje |
| --- | --- | --- | --- |
| D0 | Escenarios `multi-service-event` y `large-feature-program` (línea base antes de D1) | M | Amplía E4.1 |
| D1 | M18: unidades con stack y checks propios; `check` selectivo | M | Adelanta E5.4 (parte monorepo) |
| D2 | M20: federación fuera de `openspec/`, `files` en `provides`, `ospec workspace` | M | E5.4 |
| D3 | M21: obligación `consumer-compatibility` | M | E5.4 |
| D4 | M1 + M2 + M3 + M4: formas de entrega y programa IDD | L | Adelanta E5.5 (`change-program`) |
| D5 | M22 + M23: programa multi-repo y contexto por unidad | M | E5.4 + E5.5 |

**Secuencia recomendada:** A → B0 → B → C → D0 → D, con la Fase A en paralelo a E2.1. La Fase D puede adelantarse a C si el uso real es mayoritariamente de microservicios existentes (brownfield) y no de proyectos nuevos: en ese caso C4 (brownfield) va con D1.

## 12. Riesgos, límites y decisiones abiertas

### Decisiones que corresponden al usuario

| # | Decisión | Opciones | Recomendación |
| --- | --- | --- | --- |
| D1 | ¿Adelantar E5.4 (federación) y E5.5 (programa), hoy «por demanda»? | Mantener por demanda · Adelantar tras la Etapa 2 · Adelantar antes | Tras la Fase B; antes de C si el uso dominante es multi-servicio |
| D2 | Ubicación del estado de máquina de foundation, mapa y federación | `idd/…` (ya ignorado por las señales) · `.ospec/…` (independiente del modo) · `docs/architecture/` para lo humano | `docs/architecture/` para lo que lee una persona (`components.yaml`, ADR) y `.ospec/` para estado de máquina |
| D3 | ¿`new-surface` (M7) y `undeclared_paths` (M9) bloquean el cierre o solo avisan? | Bloquear hasta justificar/declarar · Avisar | Bloquear con salida barata (justificar o declarar): un aviso se ignora |
| D4 | ¿`consumer-compatibility` puede ejecutar comandos en repos consumidores? | Solo checks de compatibilidad en el proveedor · También tests del consumidor | Empezar solo con checks en el proveedor; los del consumidor, opt-in |
| D5 | ¿Foundation instalada por defecto? | Sí (skill bajo demanda, sin coste fijo) · Solo con `--with-foundation` | Sí: sin foundation, IDD no tiene conocimiento que consumir |
| D6 | Umbral N de unidades para sugerir programa (M4) | Fijo (5) · Configurable en `idd/config.yaml` | Configurable con valor por defecto 5 |

### Riesgos

- **Que el harness se sobreingenierice a sí mismo.** Mitigación: cada fase con su escenario y márgenes; retirar lo que no mueva una métrica.
- **Falsos positivos de `new-surface`.** Cambios en `devDependencies`, lockfiles o actualizaciones de versión. Mitigación: contar solo dependencias de producción nuevas (no actualizaciones) y respetar `impact.exclude`.
- **Coste de la lente `evolution`.** Un subagente más en cambios con superficie nueva. Mitigación: solo con plan y `new-surface`; máx. 3 revisiones como `trust`.
- **Multi-target.** El programa, las unidades y la federación son CLI y ficheros: funcionan igual en los 7 targets. Las preguntas de foundation dependen de la herramienta de preguntas de cada host; ya existe la degradación «terminar el turno con las preguntas».
- **Determinismo de la foundation.** El motor de huecos (E2.2) debe dar rondas deterministas a igual entrada; el modelo solo redacta. Sin eso, la reanudación repetiría preguntas.
- **Cuota del banco.** Tres escenarios nuevos cuestan corridas reales; empezar con una repetición, como en `idd-2`, y declarar la comparación como exploratoria.

### Límites de este análisis

- No se ejecutó ningún escenario nuevo: las propuestas se apoyan en el código actual y en el banco existente (`idd-2`).
- Las herramientas citadas para compatibilidad de contratos (`buf breaking`, `oasdiff`) y para reglas de arquitectura (dependency-cruiser, ArchUnit, import-linter) son ejemplos; su elección concreta corresponde al registro tecnológico de cada proyecto, no al harness.
- Las cifras de tamaño (S/M/L) son estimaciones, no mediciones.
