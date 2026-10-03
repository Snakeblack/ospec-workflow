# Roadmap único de ospec-workflow

> **Versión de referencia:** v2.81.1, 2026-10-03.
> **Autoridad:** este es el único documento que fija dirección, prioridad, estado y criterios de cierre del harness. `docs/architecture/` queda reservada para la arquitectura vigente de ospec (E2.6), el análisis fechado (`docs/analysis/`) es evidencia, y el roadmap K1–K12 y su [arquitectura objetivo](archive/2026-10-03-arquitectura/README.md) están archivados.
> **Origen:** [auditoría del 2026-10-03](../analysis/2026-10-03-auditoria-harness-y-gentle-ai.md) (skills, carga *lazy*, instrucciones por target, orquestador y comparación con gentle-ai).
> **Regla de estado:** los hechos se contrastan con código y OpenSpec. Este documento no cambia el estado de ningún change.

## Norte

**ospec debe ser el harness que entiende el proyecto: qué se construye, para quién, con qué equipo, bajo qué atributos de calidad y por qué está hecho así. Y debe aplicar ese conocimiento en cada change con el mínimo de ceremonia y con pruebas verificables.**

gentle-ai resuelve muy bien la memoria, el flujo orgánico de un solo documento y un binario que decide el siguiente paso. No tiene foundation, ni atributos de calidad, ni ADRs, ni specs de comportamiento. ospec tiene specs, verificación con evidencia y review con linaje, pero hoy paga demasiado contexto, le falla la carga de skills en proyectos consumidores y no ha convertido el conocimiento de ingeniería en un producto. Este roadmap convierte esas ventajas en algo que el usuario note y corrige lo que hoy lo frena.

Cuatro movimientos, en este orden:

1. **Base sana:** que todo funcione en cualquier proyecto y en los 7 targets, cargando solo lo necesario.
2. **Determinismo en código:** el orquestador conserva su autoridad, pero los algoritmos pasan a un CLI que le dice el siguiente paso válido.
3. **Conocimiento de primera clase:** una foundation que hace preguntas de proyecto serio y produce ADRs de arquitectura de verdad; y changes que leen ese conocimiento y registran sus propias decisiones de desarrollo.
4. **Proporcionalidad orgánica y medida:** la profundidad sale del impacto real del change, y la superioridad frente a gentle-ai se demuestra con escenarios comparables.

## Principios

1. **Conocimiento antes que ceremonia.** Cada pregunta, documento o gate debe cerrar un hueco de conocimiento o sostener una garantía. Si no hace ninguna de las dos cosas, se elimina.
2. **Algoritmos en código, juicio en el modelo.** Transiciones, validaciones, registros y presupuestos los decide el CLI `ospec`. El modelo decide el contenido: qué preguntar, cómo diseñar y qué código escribir.
3. **Profundidad por impacto, no por tamaño.** Un cambio de dos líneas que contradice un ADR pesa más que un refactor mecánico de 500.
4. **Carga bajo demanda por construcción.** Nada entra en contexto si la tarea no lo necesita, y el presupuesto de bytes por target se comprueba en CI.
5. **Multi-target honesto.** Los 7 targets (Claude Code, Codex, GitHub Copilot, VS Code, Cursor, OpenCode y Antigravity) comparten semántica; cada uno declara sus capacidades reales y degrada de forma explícita.
6. **Se construye con ospec.** Cada ítem se entrega como change OpenSpec con este mismo harness, y la foundation de ospec se regenera con su propio algoritmo.
7. **Las garantías vigentes se conservan:** Strict TDD con evidencia, verify independiente, review con hallazgos congelados y una corrección acotada, archive transaccional, aprobaciones solo desde respuestas explícitas, estado en disco, fallo cerrado ante identidad ambigua y memoria sin autoridad. Ninguna se retira sin una equivalencia medida.

## Objetivos medibles

| Métrica | Hoy (v2.81.0) | gentle-ai | Objetivo | Etapa |
| --- | --- | --- | --- | --- |
| Instrucciones cargadas siempre (peor target) | 63 KB (Codex); 23–26 KB en Cursor, Copilot, OpenCode y Antigravity | Orquestador de 17–24 KB | Router ≤ 4 KB; reglas acotadas por ruta o agente | E0.2 |
| Tamaño del orquestador | 44–63 KB | 17–24 KB | ≤ 15 KB | E1.3 |
| Protocolo leído por cada fase | 60–75 KB | — | ≤ 20 KB | E0.2 |
| Fases que cargan su skill en un proyecto consumidor | Parcial (`sdd-apply` y `sdd-clarify` sin skill) | — | 100 % | E0.1 |
| Pasos deterministas ejecutados de verdad | `validate-phase` en ~10 % de los despachos observados | Binario | 100 %, vía CLI | E1 |
| Preguntas antes de empezar un change | Hasta 4, por sesión | 0–1 | ≤ 1 gate agrupado; defaults por proyecto | E0.4 |
| Conocimiento capturado en foundation | 9 preguntas lineales | Ninguno | Mapa de conocimiento por perfil, con huecos explícitos | E2 |
| ADRs de arquitectura (agnósticos de tecnología) | 0: los ADRs actuales son decisiones de desarrollo | 0 | Desde foundation y desde changes significativos | E2–E3 |
| Skills instaladas por defecto | 82 | ~15 | 46 (+6 opcionales) | E0.3 |
| Escenarios comparados con gentle-ai | 0 | — | 6, publicados por release | E5 |

## Cómo se ejecuta este roadmap

- **Cada ítem es un change.** Se abre con `/sdd-new <nombre-del-change>` citando el ID (p. ej. `E0.1`) como intención y la ruta sugerida. Los ítems solo de documentación pueden ir por `lite`.
- **Tamaño.** Si el forecast supera unas 400 líneas, se entrega en PRs encadenados según la estrategia de entrega; el ítem no se parte artificialmente.
- **Al archivar:** actualizar la tabla de estado de este documento y la versión de referencia, y seguir el flujo de release de `AGENTS.md` (versión, changelog, PR, CI, merge y release).
- **Al cerrar cada etapa:** checkpoint `continue | revise` contra la tabla de objetivos medibles, con números.
- **Entrada de trabajo nuevo:** un ítem nuevo solo entra si dice qué fila de los objetivos mueve o qué garantía protege.
- **Lo aparcado** (al final) no se toca sin cumplir su criterio de reapertura.

<a id="orden-recomendado-de-trabajo"></a>

## Estado y orden

| Estado | ID | Change | Ruta sugerida |
| --- | --- | --- | --- |
| `next-eligible` | **E0.0** | `measure-context-baseline` | lite |
| `next-eligible` | **E0.1** | `fix-phase-agent-skill-loading` | bugfix |
| `pending` | **E0.2** | `scope-always-on-instructions` | refactor |
| `pending` | **E0.3** | `curate-skill-catalog` | standard |
| `pending` | **E0.4** | `thin-orchestrator-entry` | standard |
| `pending` | **E1.1** | `ospec-state-cli` | standard |
| `pending` | **E1.2** | `ospec-record-cli` | standard |
| `pending` | **E1.3** | `orchestrator-on-cli` | standard |
| `pending` | **E1.4** | `ospec-doctor` | standard |
| `pending` | **E1.5** | `kernel-wiring-inventory` | refactor |
| `pending` | **E2.1** | `knowledge-map-contract` | standard |
| `pending` | **E2.2** | `decision-gap-engine` | standard |
| `pending` | **E2.3** | `foundation-discovery-rounds` | standard |
| `pending` | **E2.4** | `decision-records-model` | standard |
| `pending` | **E2.5** | `brownfield-architecture-recovery` | standard |
| `pending` | **E2.6** | `dogfood-ospec-foundation` | standard |
| `pending` | **E3.1** | `change-decisions-and-adr-impact` | standard |
| `pending` | **E3.2** | `knowledge-by-reference` | standard |
| `pending` | **E3.3** | `fitness-functions-in-verify` | standard |
| `pending` | **E3.4** | `team-context-defaults` | standard |
| `pending` | **E3.5** | `knowledge-memory-loop` | standard |
| `pending` | **E4.1** | `impact-based-classification` | standard |
| `pending` | **E4.2** | `recipes-direct-and-repair` | standard |
| `pending` | **E4.3** | `review-depth-by-impact` | standard |
| `pending` | **E4.4** | `change-program` | standard |
| `pending` | **E5.1** | `bench-scenarios` | standard |
| `pending` | **E5.2** | `head-to-head-gentle-ai` | standard |
| `pending` | **E5.3** | `context-budget-ratchet` | lite |
| `pending` | **E6.x** | Plataforma por demanda | según ítem |

**▶ SIGUIENTE:** E0.0 y E0.1. E0.1 corrige un fallo que afecta a cualquier medición con agentes reales, así que va antes que todo lo demás, incluida la receta Repair (antes "K9 con un solo profile", ahora E4.2).

**Dependencias:**

```text
E0.0 ─┬─ E0.1 ─┬─ E0.2 ─┐
      │        └─ E0.3 ─┼─ E0.4 ─ E1.1 ─ E1.2 ─ E1.3 ─ E1.4
      │                 │                  │
      │                 │                  ├─ E2.1 ─ E2.2 ─ E2.3 ─ E2.4 ─ E2.5 ─ E2.6
      │                 │                  │                        │
      │                 │                  └──────────── E3.1 ─ E3.2 ─ E3.3 / E3.4 / E3.5
      │                 │                                  │
      │                 │                                  └─ E4.1 ─ E4.2 / E4.3 / E4.4
      └─────────────────┴─ E5.1 (línea base temprana) ─ E5.2 ─ E5.3
```

E1.5 puede ir en paralelo desde E1.1. E2.1–E2.2 pueden empezar tras E0.4 si E1 se retrasa, guardando su estado con escrituras atómicas propias hasta que E1.2 exista.

## Etapa 0 — Base sana: correcta, *lazy* y barata

**Resultado de la etapa:** ospec funciona igual en un proyecto consumidor que en este repositorio, en los 7 targets, y su coste fijo baja al nivel de gentle-ai o por debajo.

### E0.0 — `measure-context-baseline`

- **Objetivo:** fijar los números de partida antes de cambiar nada.
- **Alcance:** script que construye los 7 targets en un directorio temporal y emite, por target, los bytes cargados siempre, el tamaño del orquestador, los bytes por fase (agente, skill y `_shared` leídos) y el número de skills listadas. Fixture versionado con esos valores y test de CI que los usa como techo.
- **Hecho cuando:** el informe reproduce las cifras de la auditoría y el test falla si algún valor sube.

### E0.1 — `fix-phase-agent-skill-loading`

- **Problema:** los agentes de fase leen `skills/sdd-X/SKILL.md` con ruta relativa, que no existe en un proyecto consumidor. En una sesión real, `sdd-apply` y `sdd-clarify` trabajaron sin su skill. En este repo no se ve porque `skills/` está en la raíz.
- **Alcance:** el generador incrusta en cada agente de fase el cuerpo de su skill y las referencias de `_shared` que necesita, para los 7 targets. Desaparecen las rutas relativas a `skills/` en los agentes generados. Las referencias que una fase lee solo bajo condición se resuelven desde el directorio del agente o se incrustan.
- **Fuera de alcance:** trocear `_shared` (E0.2).
- **Hecho cuando:** (1) un test de build comprueba que ningún agente de fase generado contiene rutas `skills/` relativas; (2) un test por target comprueba que el agente incluye las reglas duras de su fase; (3) una ejecución real en un repositorio temporal sin `skills/` en la raíz completa `sdd-explore` y `sdd-apply` sin lecturas fallidas.

### E0.2 — `scope-always-on-instructions`

- **Problema:** Codex instala 63 KB en `~/.codex/AGENTS.md` (todas las sesiones de cualquier repo, y truncado a 32 KiB en instalación por repositorio). Cursor, Copilot, OpenCode y Antigravity convierten reglas acotadas en reglas para todo (`alwaysApply`, `applyTo: "**"` o instrucciones globales). Cada fase lee 60–75 KB de protocolo.
- **Alcance:**
  - El transform conserva el ámbito de la fuente con el mecanismo nativo de cada host: `paths` en Claude, `applyTo` en Copilot y VS Code, `globs` con `alwaysApply: false` en Cursor y el equivalente en OpenCode y Antigravity, revalidado con la documentación oficial al abrir el change.
  - Codex recibe como instrucciones globales solo el router de E0.4; el orquestador pasa a cargarse bajo demanda (skill o agente).
  - `sdd-phase-common.md` y `openspec-convention.md` se trocean por sección; cada fase declara los fragmentos que consume y el build incrusta solo esos.
- **Hecho cuando:** los techos de E0.0 bajan a ≤ 4 KB *always-on* por target y ≤ 20 KB de protocolo por fase, y una instalación por repositorio en Codex no supera el límite de `AGENTS.md`.

### E0.3 — `curate-skill-catalog`

- **Alcance:** aplicar el veredicto de la [auditoría §5](../analysis/2026-10-03-auditoria-harness-y-gentle-ai.md#5-catálogo-de-skills-puntos-1-y-2), con gate de confirmación de la lista:
  - Eliminar o fusionar 30 skills.
  - Crear un paquete opcional (`--with-extras`) con issue-creation, comment-writer, gh-release-notes, judgment-day, caveman-compress y stack-webmcp.
  - Consolidar las skills de stack con `references/` (24 → 13).
  - Retirar las lentes de review v1, con migración de linajes v1 → v2 y lectura compatible durante una versión menor.
  - Arreglar el extractor de *compact rules*: solo secciones `## Reglas`/`## Hard Rules` o `compact_rules:` explícito, nunca antipatrones ni "cuándo usar".
  - Lint de `Trigger:` obligatorio en las skills de conocimiento.
- **Entrega sugerida:** PRs encadenados: (a) extractor y lint, (b) eliminaciones y fusiones, (c) consolidación de stacks, (d) retirada de review v1.
- **Hecho cuando:** 46 skills por defecto; ninguna *compact rule* procede de un antipatrón (test); los consumidores con linaje v1 siguen funcionando durante la ventana de compatibilidad.

### E0.4 — `thin-orchestrator-entry`

- **Alcance:**
  - Cada `setup:<target>` instala el router de `global-instructions/` como bloque con marcadores, sin pisar contenido del usuario y reversible.
  - Un único gate de entrada agrupado (briefing de intención más ruta); modo de ejecución y estrategia de entrega pasan a ser **defaults del proyecto** en `openspec/config.yaml`, preguntados una sola vez.
  - `branch-pr`, `chained-pr` y `work-unit-commits` se cablean por nombre en tasks, apply y el workload guard.
  - La recuperación de ejecuciones descarriladas (antes `agent-introspection`) pasa al orquestador.
  - Evaluar `omitClaudeMd` en los agentes de fase de Claude.
  - El orquestador queda en ≤ 30 KB en esta etapa (≤ 15 KB tras E1).
- **Hecho cuando:** un change nuevo empieza con como mucho una pregunta agrupada en la primera sesión del proyecto y ninguna en sesiones posteriores, salvo gates de riesgo.

## Etapa 1 — Motor de estado `ospec`: determinismo sin quitarle autoridad al orquestador

**Resultado de la etapa:** el orquestador sigue siendo dueño de las preguntas, los gates, la delegación y el estado, pero ya no describe algoritmos: pregunta al CLI cuál es el siguiente paso válido, despacha y registra. Las garantías se ejecutan siempre, con la misma semántica en los 7 targets.

### E1.1 — `ospec-state-cli`

- **Alcance:** `ospec status --json` y `ospec next --json`. Devuelven change, ruta, siguiente fase o gate, pregunta pendiente y un *dispatch* completo: agente, rutas de artefactos, modo TDD y comando de test, idioma, mentoría, estándares inyectados y bloqueos. Se construye sobre `route-dispatcher`, `validate-phase`, `ospec-state`, `result-envelope` y `review-gate-state`, que ya existen.
- **Hecho cuando:** para cada fixture de ruta (lite, standard, bugfix, hotfix, foundation y brownfield) la salida de `next` coincide con la secuencia esperada, incluidos los casos bloqueados y los ambiguos.

### E1.2 — `ospec-record-cli`

- **Alcance:** `ospec record phase|approval|assumptions|fingerprints|route`, con escrituras atómicas e idempotentes. Sustituye los protocolos en prosa (ledger de aprobaciones, merge de supuestos, fingerprints de baseline y bloque `route:`).
- **Hecho cuando:** repetir un `record` no duplica entradas, un conflicto de identificadores se resuelve de forma determinista y un `record` interrumpido no corrompe `state.yaml`.

### E1.3 — `orchestrator-on-cli`

- **Alcance:** el orquestador de los 7 targets usa `next` y `record`; se elimina la prosa algorítmica y se mantienen los handlers bajo demanda.
- **Hecho cuando:** el orquestador ocupa ≤ 15 KB y en una evaluación con N despachos hay N validaciones de fase (100 %).

### E1.4 — `ospec-doctor`

- **Alcance:** diagnóstico de solo lectura por target: raíz del plugin, hooks, cache del registry, router instalado, Engram, desfase entre `dist/` e instalación y presupuestos de E0.0. Incluye recuperación guiada de un change interrumpido.
- **Hecho cuando:** cada fallo conocido de instalación y de la auditoría aparece con causa y acción.

### E1.5 — `kernel-wiring-inventory`

- **Problema:** de unas 50 k líneas de `scripts/lib`, solo unas 9 k son alcanzables desde los hooks y los comandos que se ejecutan en un proyecto consumidor.
- **Alcance:** inventario de cada módulo no cableado (Execution Graph, Authority Store, Assurance Graph, verifier independiente, Repair shadow, K12, attestation, lifecycle-model, worker-*), con una decisión por módulo: **cablear** (indicando la etapa que lo consume), **congelar** (se mantiene sin inversión) o **retirar** (se borra junto con sus tests).
- **Incluye** los tests y checkers que leen la [arquitectura archivada](archive/2026-10-03-arquitectura/harness-evolution.md) (`k1-maturity`, `k21-maturity-docs`, `k2a-maturity-docs`, `k3-readiness-reconciliation` y `roadmap-reconciliation`): como el documento ya no cambia, se retiran o se reescriben contra el código.
- **Hecho cuando:** ningún módulo queda sin etapa dueña o sin decisión explícita.

## Etapa 2 — Foundation de verdad: descubrimiento de arquitectura

**Resultado de la etapa:** al crear un proyecto, ospec hace las preguntas que haría un arquitecto con experiencia en proyectos serios. Captura la información funcional, el contexto del equipo, los atributos de calidad y las restricciones, y produce **ADRs de arquitectura agnósticos de tecnología**, separados de la selección tecnológica. Las preguntas no salen de un cuestionario fijo: salen de los huecos de conocimiento que más condicionan las decisiones pendientes.

### El algoritmo: ciclo de descubrimiento guiado por huecos de decisión

```text
fuentes ─► mapa de conocimiento ─► huecos que bloquean decisiones ─► ronda de preguntas (≤ 4)
   ▲                                                                         │
   └──────── registrar: confirmado | supuesto (con disparador) | N/A | diferido (con dueño)
                                   │
                                   ▼
         drivers (atributos de calidad) ─► ADR de arquitectura ─► registro tecnológico ─► herramientas ─► roadmap funcional
```

1. **Fuentes.** Ingerir lo que exista (documentos, repositorios, tickets o un repo brownfield) y marcar cada hecho con su procedencia.
2. **Mapa de conocimiento.** Ranuras agrupadas por dimensión:

   | Dimensión | Ejemplos de ranura |
   | --- | --- |
   | Negocio | Problema, objetivos medibles, restricciones comerciales y legales |
   | Funcional | Actores, journeys prioritarios, capacidades, exclusiones, criterios de aceptación |
   | Equipo | Tamaño, roles, competencias, quién opera en producción, cadencia, estándares y herramientas existentes, restricciones de la organización |
   | Calidad | Escenarios de atributos de calidad priorizados |
   | Arquitectura | Límites, integración, datos, despliegue y seguridad |
   | Tecnología | Stack, licencias y plataforma |
   | Operación | Observabilidad, soporte, backup y restauración |
   | Entrega | Entornos, CI y versionado |

   Cada ranura tiene estado (`desconocido | supuesto | confirmado | N/A | diferido`), fuente y la lista de decisiones que alimenta. El **perfil del proyecto** (prototipo, herramienta interna, producto, regulado o crítico, librería o CLI pública, embebido) decide qué ranuras son obligatorias.
3. **Selección de preguntas (determinista).** `prioridad = impacto en decisiones pendientes × incertidumbre × irreversibilidad × peso del perfil`. Las preguntas se agrupan por tema, como mucho 4 por ronda, cada una con una respuesta recomendada y la opción "no lo sé". "No lo sé" no bloquea: registra un supuesto explícito con su disparador de revisión. El modelo redacta las preguntas en el contexto del usuario (de forma orgánica) y el motor garantiza la cobertura.
4. **Drivers.** Escenarios de atributos de calidad en forma de árbol de utilidad (origen → estímulo → entorno → elemento → respuesta → medida), más restricciones.
5. **ADR de arquitectura.** Cada decisión estructural (descomposición del sistema, estilo de integración, propiedad y consistencia de datos, topología de despliegue, límites de confianza, multi-tenancy, política de evolución de contratos) se registra **sin nombres de productos**: drivers, al menos dos opciones, decisión, consecuencias, *fitness function* y disparador de revisión.
6. **Registro tecnológico.** La elección de stack, librerías y servicios **implementa** uno o más ADR y se justifica con el contexto del equipo, la madurez, la licencia, el coste y fuentes fechadas consultadas en vivo.
7. **Herramientas de calidad.** Estrategia de test, CI, linters y observabilidad, cada una ligada al atributo de calidad o *fitness function* que protege. Se vuelca en `openspec/config.yaml` (comandos y TDD).
8. **Roadmap funcional.** Esqueleto andante como primer slice, y decisiones diferidas con su "último momento responsable".

La foundation termina cuando todas las ranuras obligatorias que bloquean el primer slice están confirmadas o diferidas con dueño. No hace falta resolver el futuro entero.

### E2.1 — `knowledge-map-contract`

- **Alcance:** esquema del mapa de conocimiento (ranuras, dimensiones, estados, perfiles y relaciones ranura → decisión), su ubicación (estado de máquina en `openspec/`, documentos humanos en `docs/`) y el catálogo inicial de ranuras por perfil.
- **Hecho cuando:** los seis perfiles tienen su conjunto de ranuras obligatorias con un ejemplo, y "desconocido" se distingue de "N/A" en el esquema.

### E2.2 — `decision-gap-engine`

- **Alcance:** `ospec foundation next` aplica la fórmula de priorización, agrupa por tema y devuelve la siguiente ronda con recomendaciones; `record` persiste respuestas y supuestos.
- **Hecho cuando:** una CLI local, un SaaS pequeño y un producto regulado producen rondas distintas y deterministas a partir del mismo motor, y reanudar no repite preguntas ya respondidas.

### E2.3 — `foundation-discovery-rounds`

- **Alcance:** reescribir `sdd-foundation` sobre el ciclo descrito (rondas reanudables, ingestión de fuentes y documentos `docs/product/*`, `docs/architecture/*` y `docs/roadmap*.md` actualizados de forma incremental). Absorbe el diseño de [foundation holística](archive/2026-10-03-arquitectura/harness-foundation-holistic.md) (antes R2.1/R2.4, archivado como insumo).
- **Hecho cuando:** ningún scaffold ni código se genera sin aprobación, y los escenarios de aceptación de ese diseño (CLI local, SaaS pequeño, regulado, brownfield, fuente desactualizada y change pequeño posterior) se cumplen.

### E2.4 — `decision-records-model`

- **Alcance:** tres tipos de registro, cada uno con plantilla y lint:

  | Registro | Contenido | Dónde vive |
  | --- | --- | --- |
  | **ADR** de arquitectura | Agnóstico; drivers, opciones, consecuencias, *fitness function*, disparador | `docs/architecture/decisions/` |
  | **TSR** (registro tecnológico) | Implementa uno o más ADR; alternativas y fuentes fechadas | `docs/architecture/technology/` |
  | **DC** (decisión de change) | Decisión de desarrollo de un change | `design.md` del change |

  El lint avisa si la sección "Decisión" de un ADR nombra productos o librerías del stack detectado, o si un ADR no referencia ningún driver. Sustituye a la skill `architecture-decision-records`.
- **Hecho cuando:** los fixtures distinguen un ADR válido, un ADR "tecnológico" (aviso) y una decisión de desarrollo mal clasificada como ADR.

### E2.5 — `brownfield-architecture-recovery`

- **Alcance:** en la ruta brownfield y en `sdd-baseline`, inferir componentes, límites y dependencias a partir del código y la documentación existente; proponer **ADRs inferidos** (`status: inferred`) y pistas de atributos de calidad que el usuario confirma o corrige; registrar las divergencias sin sobrescribir.
- **Hecho cuando:** en un repositorio de ejemplo se obtiene un mapa de componentes y ADRs inferidos con evidencia `ruta:línea`.

### E2.6 — `dogfood-ospec-foundation`

- **Alcance:** ejecutar E2.3 y E2.5 sobre este repositorio para producir el brief, el contexto de equipo, los atributos de calidad y unos 10 ADRs de arquitectura de ospec (p. ej. generación multi-target desde una fuente única, OpenSpec en disco como autoridad de estado, algoritmos en runtime y no en prosa, aislamiento de fases en subagentes, verificación ligada a evidencia, memoria sin autoridad). Los 100+ registros actuales de `docs/adr/` se reclasifican como decisiones de change archivadas, con un índice.
- **Hecho cuando:** `docs/architecture/decisions/` contiene solo ADRs de arquitectura y cada uno pasa el lint de E2.4.

## Etapa 3 — Conocimiento vivo en cada change

**Resultado de la etapa:** cada change consume el conocimiento del proyecto por referencia y solo lo pertinente, registra sus decisiones de desarrollo donde corresponde y solo modifica la arquitectura cuando de verdad la toca.

### E3.1 — `change-decisions-and-adr-impact`

- **Alcance:** `sdd-design` escribe "Decisiones del change" (DC) y una declaración de **impacto arquitectónico**: `ninguno | conforma ADR-n | enmienda | sustituye | contradice`. "Contradice" bloquea con un gate. Archive deja de promover decisiones de desarrollo a `docs/adr/`. Una **comprobación de promoción** propone un ADR nuevo o enmendado, con gate del usuario, solo cuando el change toca un driver o atributo de calidad, una frontera, un patrón transversal o contradice un ADR.
- **Hecho cuando:** un change de librería interna no genera ningún ADR y un change que introduce mensajería asíncrona entre módulos propone una enmienda al ADR de integración.

### E3.2 — `knowledge-by-reference`

- **Alcance:** el *dispatch* de `ospec next` incluye referencias (identificadores de ADR, escenarios de calidad, términos de glosario y restricciones del equipo) de los componentes que toca el change, según un mapa componente → conocimiento. Nunca se pasan documentos completos. La vigencia es visible (actual, desactualizada o ausente). Absorbe el antiguo R2.2.
- **Hecho cuando:** una fase recibe solo las referencias pertinentes, y una referencia desactualizada produce un aviso en lugar de usarse como verdad.

### E3.3 — `fitness-functions-in-verify`

- **Alcance:** los ADR y escenarios de calidad declaran comprobaciones ejecutables (reglas de dependencias entre módulos, presupuestos de rendimiento, comprobaciones de seguridad) que `sdd-verify` ejecuta como evidencia. Las no ejecutables se tratan como checklist explícito con evidencia manual.
- **Hecho cuando:** una violación de frontera declarada en un ADR hace fallar verify con el identificador del ADR.

### E3.4 — `team-context-defaults`

- **Alcance:** el perfil de equipo de la foundation sustituye a la escala `solo | team | enterprise` y decide los defaults de estrategia de entrega, profundidad de review, mentoría y herramientas sugeridas.
- **Hecho cuando:** dos proyectos con equipos distintos obtienen defaults distintos sin preguntar de nuevo.

### E3.5 — `knowledge-memory-loop`

- **Alcance:** ADR, TSR, DC y aprendizajes se reflejan en Engram con procedencia y revisión. `sdd-explore` recupera decisiones previas relacionadas. La memoria nunca es autoridad y su caída no bloquea.
- **Hecho cuando:** un change nuevo cita una decisión previa relevante encontrada en memoria y la contrasta con el disco.

## Etapa 4 — Ejecución orgánica y proporcional

**Resultado de la etapa:** el harness decide la profundidad con señales reales y la explica. Lo pequeño se queda pequeño y lo arquitectónico recibe atención.

**Insumos archivados:** [proporcionalidad del harness](archive/2026-10-03-arquitectura/harness-proportionality.md) (E4.1–E4.3) y las guardas de la [revisión crítica de Adaptive](archive/2026-10-03-arquitectura/ospec-adaptive-critical-design.md) (E4.2).

### E4.1 — `impact-based-classification`

- **Alcance:** el CLI calcula señales (impacto en ADR, atributos de calidad tocados, contrato público, migración de datos, frontera de seguridad y tamaño previsto) y deriva la ruta con mínimos de riesgo. Sustituye la clasificación "trivial/small/normal/high-risk" hecha a ojo e incluye la razón en el gate.
- **Hecho cuando:** los fixtures de clasificación cubren los suelos actuales (auth, migración, API) y casos pequeños con impacto arquitectónico.

### E4.2 — `recipes-direct-and-repair`

- **Alcance:**
  - **Direct** para lo trivial: sin artefactos, con comprobaciones y relectura estructural.
  - **Repair** como forma opt-in de la ruta `bugfix`, con la evidencia del piloto (v2.79.0 y v2.80.0), el checkpoint como guarda de regresión y `fixed` como fallback. Es el antiguo "K9 con un solo profile".
  - **Critical**: standard más modelo de amenazas y revisión de ADR.
- **Hecho cuando:** Repair supera el checkpoint con agentes reales **después** de E0.1, y Direct no crea artefactos en cambios triviales.

### E4.3 — `review-depth-by-impact`

- **Alcance:** el gate de review elige 0, 1 o N lentes a partir de las señales de E4.1, manteniendo hallazgos congelados y una corrección acotada. Se mide la precisión de los hallazgos.
- **Hecho cuando:** un cambio de documentación pasiva no lanza revisores y uno de alto impacto lanza las cuatro lentes de calidad.

### E4.4 — `change-program`

- **Alcance:** un objetivo grande (como una etapa de este roadmap) se gestiona como programa con changes hijos y cursor; `/sdd-continue` reanuda el programa. Se basa en la investigación [proporcionalidad y Change Program](archive/2026-10-03-arquitectura/research/proportional-process-and-change-program.md).
- **Hecho cuando:** una etapa de este roadmap puede ejecutarse como programa de principio a fin.

## Etapa 5 — Demostrar que es mejor

### E5.1 — `bench-scenarios`

- **Alcance:** seis escenarios con agentes reales, reutilizando la infraestructura de registro de agentes de K12 (`worker-record`): CLI local, SaaS pequeño, producto regulado, brownfield, librería pública y bugfix. Métricas: preguntas (cuántas y cuántas cambian una decisión), cobertura del mapa, calidad de los ADR (rúbrica), defectos escapados, tokens, duración e intervenciones humanas. La línea base se toma **antes** de la Etapa 2.
- **Hecho cuando:** el informe es reproducible y los márgenes están declarados antes de ejecutar.

### E5.2 — `head-to-head-gentle-ai`

- **Alcance:** los mismos escenarios con gentle-ai (ODD y RDD), mismo host y mismo modelo. Tabla comparativa publicada en cada tren de releases.
- **Hecho cuando:** existe una comparación publicada con numeradores, denominadores y exclusiones.

### E5.3 — `context-budget-ratchet`

- **Alcance:** los techos de E0.0 bajan en cada release que reduce contexto, y nunca suben sin una justificación registrada.

## Etapa 6 — Plataforma por demanda

Ítems que se abren cuando hay demanda o evidencia, sin orden fijo:

- **E6.1 — `target-capability-matrix`:** matriz honesta de capacidades por target (7), revalidada con la documentación oficial; absorbe [`targets/`](targets/).
- **E6.2 — paquetes de conocimiento bajo demanda:** consulta curada de fuentes externas (incluido el catálogo CNCF) con fuentes y vigencia (antes R2.3/R2.6).
- **E6.3 — documentación y wiki:** `sdd-document` y la web Starlight consumen el mapa de conocimiento y los ADR (antes R2.7).
- **E6.4 — federación y workspace:** evolución de R4 cuando haya un caso real multi-repositorio.
- **E6.5 — deuda diferida H1–H7:** remediación del backlog de archive y runtime al terminar el roadmap (decisión del usuario del 2026-10-02).

## Aparcado (con criterio de reapertura)

Se conserva el código y la documentación; no recibe inversión mientras no se cumpla el criterio.

| Línea | Criterio de reapertura |
| --- | --- |
| K9 general (varios profiles) y K10 Bounded/Planned | Que E4.2 demuestre valor y un segundo profile tenga evidencia propia |
| K10-delivery (`DeliveryAuthorization` en pre-commit, pre-push y pre-pr) | Que un equipo usuario pida bloquear la entrega con evidencia y E1 esté cableado |
| K11a–K11d (expansión de adapters, routing de modelos, worktrees, consolidación de roles) | Que una etapa lo necesite como consumidor concreto |
| K12 longitudinal y multi-target | Que E5 necesite series largas |
| CX2–CX6 (vistas derivadas, proyección de contexto, deltas de spec) | Que E0.2 o E5.3 no alcancen sus techos con medios más simples |
| Dream-RSI y aprendizaje de políticas | Que exista una política fija con evaluador congelado y cohorte de holdout |

## Base entregada

Lo que ya existe y en qué etapa se aprovecha. El detalle de cada pieza está en el [roadmap archivado](archive/2026-10-03-harness-evolution-kernel.md).

| Estado | ID | Qué dejó | Uso en este roadmap |
| --- | --- | --- | --- |
| `done` | **O2B** | Baseline `fixed` de control (v2.36.0) | Control de E4 y E5 |
| `done` | **O3** | Clarify condicional | Se mantiene |
| `done` | **O4+O5** | Review selectivo y linaje acotado | Base de E4.3 |
| `done` | **O6A** | Archive híbrido transaccional | Se mantiene; deuda en E6.5 |
| `done` | **K1** | Contract suite, vocabulario y clasificación (v2.37.0) | Base de E4.1 |
| `done` | **K2** | Lifecycle, Minimal Kernel Harness e invariantes (v2.38.0) | E1.5 decide su cableado |
| `done` | **K2.1** | Authority Store (CAS), OperationPermit y semántica de efectos (v2.39.0) | E1.5 |
| `done` | **K2a** | Headless Conformance Host y adapter de referencia, implemented en v2.40.0 | E1.5 |
| `done` | **K3** | Identidades de ejecución y Candidate (v2.42.x) | E1.5 |
| `done` | **`k3-readiness-remediation`** | Relación, successor y empaquetado reconciliados; archivado | — |
| `done` | **K4a** | Execution Graph compiler, Obligation Manifest y replay (verificado en v2.45.7) | E1.5 |
| `done` | **K5** | Budgets, failures y recovery (v2.45.13) | E1.5 |
| `done` | **K6a** | Aislamiento de workers y cápsula de work order (v2.46.0–v2.47.2) | E1.5 |
| `done` | **K4b** | Repair shadow execution (v2.48.x) | E4.2 |
| `done` | **K6b** | Verifier independiente, provenance y Assurance Graph (v2.55.0) | E3.3 y E1.5 |
| `done` | **K6c** | Challenges adversariales por política (v2.56.x) | E1.5 |
| `done` | **K6d** | Delta de complejidad y arquitectura, advisory | E3.1 |
| `done` | **PP1/PP2** | Elegibilidad de rutas con suelos de riesgo; contrato lite compacto | Base de E4.1 |
| `done` | **CX0/CX1** | Medición de contexto; envelope y reducer de estado | Base de E0.0 y E1.2 |
| `done` | **Binding de identidad de operación** | Gate de ambigüedad en SubagentStop (v2.69.0) | Base de E1.1 |
| `done` | **K7 mínimo** | Binding de review con Candidate y Policy, lineage v3 (v2.70.0) | E4.3 |
| `done` | **K8 mínimo** | `CandidateEvaluationAttestation` (v2.71.0–v2.73.1) | Aparcado con K10-delivery |
| `done` | **K12 focal** | Oracle por fixture, campaña de maquinaria y cohorte de 22 tareas (v2.70.0–v2.78.0) | E5.1 |
| `done` | **Piloto Adaptive Repair** | Checkpoint determinista `continue` (v2.79.0) y calibración con agentes reales `continue` (v2.80.0) | E4.2 |
| `done` | **Engram por target** | Configuración automática en los 7 targets (v2.81.0) | E3.5 |

## Historial

- 2026-07-02 → 2026-10-03: programa K1–K12 y lanes O, PP, CX y R2 (ver el [roadmap archivado](archive/2026-10-03-harness-evolution-kernel.md#historial-consolidado)).
- 2026-10-03: auditoría de skills, carga *lazy*, instrucciones por target, orquestador y comparación con gentle-ai. El roadmap K1–K12 se archiva y se sustituye por este roadmap único en seis etapas. K9 con un solo profile pasa a E4.2, detrás de la corrección de carga de skills (E0.1). K10-delivery, K11, K12 longitudinal, CX2–CX6 y Dream-RSI quedan aparcados con criterio de reapertura.
- 2026-10-03: la arquitectura objetivo del kernel, Adaptive, proporcionalidad, foundation holística y la investigación salen de `docs/architecture/` hacia [`archive/2026-10-03-arquitectura/`](archive/2026-10-03-arquitectura/README.md). La carpeta queda reservada para la arquitectura vigente (E2.6) y `docs/README.md` vuelve a ser el índice de la documentación.
