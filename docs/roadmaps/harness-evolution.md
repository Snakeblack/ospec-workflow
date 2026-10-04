# Roadmap único de ospec-workflow

> **Versión de referencia:** v2.90.0, 2026-10-04.
> **Autoridad:** este es el único documento que fija dirección, prioridad, estado y criterios de cierre del harness. `docs/architecture/` queda reservada para la arquitectura vigente de ospec (E2.6), el análisis fechado (`docs/analysis/`) es evidencia, y el roadmap K1–K12 y su [arquitectura objetivo](archive/2026-10-03-arquitectura/README.md) están archivados.
> **Origen:** [auditoría del 2026-10-03](../analysis/2026-10-03-auditoria-harness-y-gentle-ai.md) y la decisión del mismo día de que SDD deje de ser el flujo por defecto.
> **Regla de estado:** los hechos se contrastan con código y OpenSpec. Este documento no cambia el estado de ningún change.

## Norte

**ospec debe ser el harness que entiende el proyecto: qué se construye, para quién, con qué equipo, bajo qué atributos de calidad y por qué está hecho así. Debe aplicar ese conocimiento en cada cambio con la ceremonia que justifica su impacto, ni más ni menos, y cerrar cada cambio con evidencia comprobada por código.**

SDD resolvió un problema real: que el modelo construyera sin entender lo que hacía. Hoy cobra demasiado: 44–63 KB de orquestador, 60–75 KB de protocolo y un subagente por fase. Además, buena parte de esa ceremonia ni siquiera se cumple: `validate-phase` se ejecutó en ~10 % de los despachos observados. Los modelos actuales no necesitan que el proceso les dicte cada paso; necesitan saber qué importa en este proyecto y qué deben demostrar. ODD (gentle-ai) lo resuelve con un único documento por feature, pero sin conocimiento del proyecto: clasifica por tamaño y cierra cuando las tareas están hechas.

ospec adopta un flujo propio por defecto: **IDD, desarrollo guiado por impacto.** El impacto del cambio sobre lo que el proyecto sabe decide cuánta ceremonia merece, y la evidencia decide cuándo está terminado. SDD se mantiene como **modo opcional** para quien lo pida.

Cuatro movimientos, en este orden:

1. **Base sana:** que todo funcione en cualquier proyecto y en los 7 targets, cargando solo lo necesario.
2. **IDD como flujo por defecto:** obligaciones derivadas del impacto y comprobadas por el CLI `ospec`. SDD pasa a ser opcional.
3. **Conocimiento de primera clase:** una foundation que hace las preguntas de un proyecto serio y produce ADRs de arquitectura de verdad, que cada cambio consume por referencia.
4. **Demostración:** IDD se mide contra el modo SDD y contra gentle-ai con escenarios comparables.

## Principios

1. **Conocimiento antes que ceremonia.** Cada pregunta, documento o gate debe cerrar un hueco de conocimiento o sostener una garantía. Si no hace ninguna de las dos cosas, se elimina.
2. **Profundidad por impacto, no por tamaño.** Un cambio de dos líneas que contradice un ADR pesa más que un refactor mecánico de 500.
3. **Cierre por evidencia, no por documentos.** Un cambio está terminado cuando cada obligación tiene evidencia registrada por el CLI. No basta con que existan artefactos ni con que el modelo diga que funciona.
4. **Algoritmos en código, juicio en el modelo.** Señales, obligaciones, transiciones y registros los decide el CLI `ospec`. El modelo decide el contenido: qué preguntar, cómo diseñar y qué código escribir.
5. **Carga bajo demanda por construcción.** Nada entra en contexto si la tarea no lo necesita, y el presupuesto de bytes por target se comprueba en CI.
6. **Multi-target honesto.** Los 7 targets (Claude Code, Codex, GitHub Copilot, VS Code, Cursor, OpenCode y Antigravity) comparten semántica; cada uno declara sus capacidades reales y degrada de forma explícita.
7. **SDD es una opción, no el camino.** Sigue operativo para quien lo pida y comparte foundation, garantías y CLI, pero no recibe capacidades nuevas sin demanda.
8. **Las garantías vigentes se conservan como obligaciones:** Strict TDD con evidencia cuando el proyecto lo declara, review independiente con hallazgos congelados y una corrección acotada cuando el impacto lo pide, cierre transaccional, aprobaciones solo desde respuestas explícitas, estado en disco, fallo cerrado ante identidad ambigua y memoria sin autoridad. Ninguna se retira sin una equivalencia medida.
9. **Se construye con ospec.** En cuanto IDD sea el flujo por defecto (E1.6), los ítems de este roadmap se ejecutan con IDD y E4 mide el resultado.

## IDD: desarrollo guiado por impacto

| | SDD (modo opcional) | ODD (gentle-ai) | IDD (por defecto) |
| --- | --- | --- | --- |
| Unidad de trabajo | Fases con artefactos: proposal, spec, design, tasks, apply, verify y archive | Un documento por feature | Ninguno o un documento vivo, según las obligaciones del cambio |
| Qué decide la profundidad | La ruta elegida al inicio | Una clasificación inicial, con unas 400 líneas como heurística | Señales de impacto que calcula el CLI y recalcula con el diff real |
| Conocimiento del proyecto | Specs de comportamiento | Memoria | Foundation, ADR, atributos de calidad y equipo por referencia, más memoria |
| Cuándo está terminado | Verify contra los artefactos | Tareas completadas y review por riesgo | Cada obligación tiene evidencia registrada por el CLI |
| Coste fijo | Orquestador de 44–63 KB y un subagente por fase | Orquestador de 17–24 KB | Router de ≤ 4 KB y protocolo de ≤ 12 KB, en el hilo principal |

### El ciclo

```text
intención ─► ospec next ─► señales ─► obligaciones ─► el modelo trabaja
                 ▲                                           │
                 └───── ospec check (recalcula con el diff) ◄┘
                                     │
          listo · falta <obligación> · necesita tu decisión ─► ospec close
```

1. **Intención.** El modelo resume en una o dos frases qué se pide (bug, feature, refactor o documentación) y cómo se sabrá que está hecho. Solo pregunta si la intención es materialmente ambigua.
2. **Señales.** El CLI las calcula con esa declaración, las rutas que se van a tocar y, después, el diff real. Cada proyecto declara una vez en `openspec/config.yaml` qué rutas corresponden a cada señal, con valores por defecto según el stack. Desde E3.2 también salen del mapa componente → conocimiento.
3. **Obligaciones.** Cada señal añade obligaciones concretas, cada una con su evidencia (tabla siguiente). No hay rutas ni recetas: la profundidad es la suma de lo que el cambio debe demostrar.
4. **Trabajo.** El modelo trabaja en el hilo principal con las referencias de conocimiento que le pasa `ospec next`. Usa subagentes solo para explorar código grande o cuando una obligación exige independencia, como un review.
5. **Comprobación.** `ospec check` ejecuta los checks, lee la evidencia y recalcula las señales con el diff real. Una obligación nueva aparece en cuanto el diff la provoca; ninguna desaparece sin una decisión explícita.
6. **Cierre.** `ospec close` archiva de forma transaccional cuando no queda ninguna obligación pendiente. La entrega (PR y merge) la decide la persona.

### Señales y obligaciones

| Señal | Obligación | Evidencia que la cierra |
| --- | --- | --- |
| Siempre | Los checks que declara el proyecto (tests, lint y build) pasan | Ejecución registrada por el CLI, nunca la afirmación del modelo |
| El proyecto declara Strict TDD | Test en rojo antes del código en cada unidad de trabajo | Evidencia RED → GREEN estructurada (ya existe) |
| Corrección de un bug | Test de reproducción que falla antes del arreglo y pasa después | Las dos ejecuciones (receta Repair, piloto de v2.79.0–v2.80.0) |
| Más de una unidad de trabajo o una decisión no obvia | Documento vivo con el plan y las decisiones del cambio | El documento, al día en el cierre |
| Cambia un contrato público (API, CLI, esquema o formato de fichero) | Contrato de comportamiento actualizado y su test | Spec del contrato en `openspec/specs/` y el test |
| Datos o estado persistente (migración o formato en disco) | Compatibilidad o reversión declarada y test de migración | El test |
| Frontera de seguridad (autenticación, secretos, permisos o entrada externa) | Review independiente de confianza | Hallazgos congelados y, como mucho, una corrección acotada |
| Toca un componente con ADR o atributo de calidad (desde E3) | Declaración de impacto: ninguno, conforma, enmienda o contradice | *Fitness functions* del ADR (E3.3). Enmendar o contradecir requiere tu decisión |

**Cuándo pregunta IDD.** Solo en tres casos: si la intención es materialmente ambigua, si el cambio enmienda o contradice un ADR, o si hay una operación destructiva o irreversible. En todo lo demás avanza sin gate.

**Cómo se ve.** Un typo cierra sin documento ni preguntas, solo con los checks. Un bug cierra con su test de reproducción. Un cambio de API pública abre un documento vivo y actualiza el contrato y su test. Un cambio que contradice el ADR de integración se detiene hasta que decides.

**Qué reutiliza:** los suelos de riesgo de PP1/PP2 para las señales, la evidencia estructurada de Strict TDD, el gate de review selectivo con linaje acotado, la receta Repair del piloto, el archive transaccional y `ospec-state` y `result-envelope` para el estado. **Qué no usa:** Execution Graph, Authority Store, permits ni attestations; E1.5 decide su destino.

**Hipótesis que E4 debe demostrar.** Frente al modo SDD, IDD gasta menos tokens sin dejar escapar más defectos. Frente a ODD, deja escapar menos defectos en los cambios que tocan contratos, datos, seguridad o arquitectura, con un coste comparable.

## Objetivos medibles

| Métrica | Hoy (v2.81.3) | gentle-ai | Objetivo | Etapa |
| --- | --- | --- | --- | --- |
| Instrucciones cargadas siempre (peor target) | 2,7–3,0 KB en los 7 targets desde v2.88.0, router incluido (antes, 63 KB en Codex y 23–26 KB en Cursor, Copilot, OpenCode y Antigravity) | Orquestador de 17–24 KB | Router de ≤ 4 KB | E0.2 ✅, E0.4 ✅ |
| Contexto del flujo por defecto | Orquestador SDD de 44–63 KB más 60–75 KB por fase | 17–24 KB | Router más protocolo IDD ≤ 16 KB | E1.6 |
| Agentes que cargan su skill en un proyecto consumidor | 100 % desde v2.83.0 (antes, parcial: `sdd-apply` y `sdd-clarify` sin skill) | — | 100 % | E0.1 ✅ |
| Obligaciones comprobadas por código | `validate-phase` en ~10 % de los despachos observados | Binario | 100 %, vía `ospec check` | E1.4 |
| Documentos creados en un cambio trivial | Los de la ruta lite | 1 | 0 | E1.6 |
| Preguntas antes de empezar un cambio | Hasta 4 por sesión | 0–1 | 0, salvo los tres casos de gate | E1 |
| Conocimiento capturado en foundation | 9 preguntas lineales | Ninguno | Mapa de conocimiento por perfil, con huecos explícitos | E2 |
| ADRs de arquitectura (agnósticos de tecnología) | 0: los ADRs actuales son decisiones de desarrollo | 0 | Desde foundation y desde los cambios que tocan arquitectura | E2–E3 |
| Skills instaladas por defecto | 82; 50 (+6 opcionales) desde v2.90.0 | ~15 | 46 (+6 opcionales); las de fase SDD, en el paquete opcional | E0.3, E1.6 |
| Escenarios comparados | 0 | — | 6, contra el modo SDD y contra gentle-ai, publicados por release | E4 |

## Cómo se ejecuta este roadmap

- **Hasta E1.6,** cada ítem es un cambio directo en su rama, con el flujo de release de `AGENTS.md`, como v2.81.1–v2.81.3. Si cambia código, el test en rojo va primero. Si toca comportamiento especificado, actualiza la spec canónica de `openspec/specs/` en el mismo PR. No se usa SDD salvo que el ítem lo pida.
- **Desde E1.6,** cada ítem se ejecuta con IDD y E4 registra su coste.
- **Tamaño.** Si un ítem supera unas 400 líneas, se entrega en PRs encadenados; el ítem no se parte artificialmente.
- **Al cerrar un ítem:** actualizar la tabla de estado y la versión de referencia, y seguir el flujo de release.
- **Al cerrar cada etapa:** checkpoint `continue | revise` contra la tabla de objetivos, con números.
- **Entrada de trabajo nuevo:** un ítem nuevo solo entra si dice qué fila de los objetivos mueve o qué garantía protege.
- **Lo aparcado** (al final) no se toca sin cumplir su criterio de reapertura.

<a id="orden-recomendado-de-trabajo"></a>

## Estado y orden

| Estado | ID | Change | Tipo |
| --- | --- | --- | --- |
| `done` | **E0.0** | `measure-context-baseline` | medición |
| `done` | **E0.1** | `fix-phase-agent-skill-loading` | bugfix |
| `done` | **E0.2** | `scope-always-on-instructions` | refactor |
| `next-eligible` | **E0.3** | `curate-skill-catalog` | refactor |
| `done` | **E0.4** | `router-and-sdd-on-demand` | feature |
| `next-eligible` | **E1.1** | `idd-contract` | contrato |
| `pending` | **E1.2** | `ospec-cli-core` | feature |
| `pending` | **E1.3** | `impact-signals` | feature |
| `pending` | **E1.4** | `ospec-check-and-close` | feature |
| `pending` | **E1.5** | `kernel-wiring-inventory` | refactor |
| `pending` | **E1.6** | `idd-default-entry` | feature |
| `pending` | **E1.7** | `ospec-doctor` | feature |
| `pending` | **E2.1** | `knowledge-map-contract` | contrato |
| `pending` | **E2.2** | `decision-gap-engine` | feature |
| `pending` | **E2.3** | `foundation-discovery-rounds` | feature |
| `pending` | **E2.4** | `decision-records-model` | feature |
| `pending` | **E2.5** | `brownfield-architecture-recovery` | feature |
| `pending` | **E2.6** | `dogfood-ospec-foundation` | dogfooding |
| `pending` | **E3.1** | `change-decisions-and-adr-impact` | feature |
| `pending` | **E3.2** | `knowledge-by-reference` | feature |
| `pending` | **E3.3** | `fitness-functions-in-check` | feature |
| `pending` | **E3.4** | `team-context-defaults` | feature |
| `pending` | **E3.5** | `knowledge-memory-loop` | feature |
| `pending` | **E4.1** | `bench-scenarios` | medición |
| `pending` | **E4.2** | `head-to-head-gentle-ai` | medición |
| `pending` | **E4.3** | `context-budget-ratchet` | medición |
| `pending` | **E5.x** | Plataforma por demanda | según ítem |

**▶ SIGUIENTE:** el PR (d) de E0.3 (retirada de review v1), que cierra la etapa 0. El (c) quedó entregado en v2.90.0: una skill de stack por tecnología, 13 en total. E0.4 quedó terminado en v2.89.0: el *always-on* es de 2,7–3,0 KB en los 7 targets y el orquestador encuentra sus ficheros `_shared` desde la instalación. E1.1 también puede empezar ya.

**Dependencias:**

```text
E0.0 ─ E0.1 ─┬─ E0.2 ─┬─ E0.4 ──────────────────────┐
             ├─ E0.3 ─┘                             │
             └─ E4.1 (línea base: modo SDD y ODD) ──┤
                                                    ▼
E1.1 ─ E1.2 ─┬─ E1.3 ─ E1.4 ───────────────────── E1.6 ─ E1.7
             └─ E1.5 (en paralelo)

E1.2 ─ E2.1 ─ E2.2 ─ E2.3 ─ E2.4 ─ E2.5 ─ E2.6
E1.4 y E2.4 ─ E3.1 ─ E3.2 ─ E3.3 / E3.4 / E3.5
E1.6 ─ E4.2 ─ E4.3
```

E2.1 y E2.2 pueden empezar antes de E1.2 si E1 se retrasa, guardando su estado con escrituras atómicas propias hasta que `record` exista.

## Etapa 0 — Base sana: correcta, *lazy* y barata

**Resultado de la etapa:** ospec funciona igual en un proyecto consumidor que en este repositorio, en los 7 targets, y su coste fijo baja al nivel de gentle-ai o por debajo.

### E0.0 — `measure-context-baseline`

- **Objetivo:** fijar los números de partida antes de cambiar nada.
- **Alcance:** script que construye los 7 targets en un directorio temporal y emite, por target, los bytes cargados siempre, el tamaño del orquestador, los bytes que lee cada fase o agente (agente, skill y `_shared`) y el número de skills listadas. Fixture versionado con esos valores y test de CI que los usa como techo.
- **Hecho cuando:** el informe reproduce las cifras de la auditoría y el test falla si algún valor sube.
- **Entregado en v2.82.0:** `node scripts/measure-context-baseline.js` mide en memoria, con techos en `scripts/fixtures/context-baseline.json` comprobados por `scripts/lib/context-baseline.test.js`. Línea base y método en [target-capabilities §7](../target-capabilities.md#7-coste-de-contexto-por-target-e00).

### E0.1 — `fix-phase-agent-skill-loading`

- **Problema:** los agentes leen `skills/<skill>/SKILL.md` con ruta relativa, que no existe en un proyecto consumidor. En una sesión real, `sdd-apply` y `sdd-clarify` trabajaron sin su skill. En este repositorio no se ve porque `skills/` está en la raíz.
- **Alcance:** el generador incrusta en cada agente generado (fases SDD y revisores) el cuerpo de su skill y las referencias de `_shared` que necesita, en los 7 targets. Las referencias que un agente lee solo bajo condición se resuelven desde su propio directorio o se incrustan.
- **Hecho cuando:** (1) un test de build comprueba que ningún agente generado contiene rutas `skills/` relativas; (2) un test por target comprueba que cada agente incluye sus reglas duras; (3) una ejecución real en un repositorio temporal sin `skills/` en la raíz completa una exploración y un review sin lecturas fallidas.
- **Entregado en v2.83.0:** `scripts/lib/agent-embed.js` incrusta en cada agente de trabajo una sección `## Embedded references` con su skill, los módulos de su directorio y los `_shared` que nombra, y reescribe las referencias como marcadores `«id»` (REQ-generator-019). `scripts/lib/agent-embed.test.js` cubre (1) y (2) en los 7 targets. Para (3), `sdd-explore` y `review-trust` de un build de Claude cargado con `--plugin-dir` completaron su trabajo en un repositorio temporal sin `skills/`, sin ninguna llamada fallida. Coste: `sdd-apply` y `sdd-verify` suben unos 20 KB porque ahora cargan los módulos de Strict TDD que antes se perdían ([target-capabilities §7](../target-capabilities.md#7-coste-de-contexto-por-target-e00)). El orquestador sigue leyendo `skills/_shared/` con rutas relativas; eso pertenece a E0.4.

### E0.2 — `scope-always-on-instructions`

- **Problema:** Cursor, Copilot, OpenCode y Antigravity convierten reglas acotadas en reglas para todo (`alwaysApply`, `applyTo: "**"` o instrucciones globales). Además, Cursor instala como regla `alwaysApply` el `AGENTS.md` de este repositorio, con el flujo de release propio de ospec, en todos los proyectos consumidores.
- **Alcance:**
  - El transform conserva el ámbito de la fuente con el mecanismo nativo de cada host: `paths` en Claude, `applyTo` en Copilot y VS Code, `globs` con `alwaysApply: false` en Cursor, y el equivalente en OpenCode y Antigravity, revalidado con la documentación oficial al abrir el change.
  - Lo que es de este repositorio (release, versión y changelog) se separa de lo que es del producto (ciclo de review acotado) y deja de distribuirse.
- **Hecho cuando:** ninguna regla acotada en la fuente se instala como global en ningún target (test por target), ningún target distribuye el flujo de release de este repositorio y los techos de E0.0 bajan.
- **Entregado en v2.84.0:** `scripts/lib/rule-scope.js` clasifica cada regla por su `applyTo` de origen (REQ-generator-020). Las globales siguen siendo *always-on*. Las de `agents/**` (protocolo SDD común y Engram) se incrustan en el orquestador, como ya hacía Claude. Las de ruta usan el mecanismo nativo, comprobado en la documentación oficial: `globs` con `alwaysApply: false` en Cursor, `applyTo` en Copilot, y `trigger: glob` con `globs` en Antigravity, que no lee `applyTo`. Las llaves se expanden porque Copilot y Antigravity separan patrones por comas. OpenCode no tiene ámbito por ruta: la regla de OpenSpec pasa al orquestador y la de Strict TDD no se carga, como en Claude. Cursor deja de sintetizar `agents-protocol.mdc`, porque el ciclo de review acotado ya está en `sdd-common`. `scripts/lib/rule-scope.test.js` cubre los tres criterios en los 7 targets. Resultado: *always-on* de 22–26 KB a 2,3–2,4 KB, y el orquestador sube unos 11 KB, solo en sesiones SDD ([target-capabilities §7](../target-capabilities.md#7-coste-de-contexto-por-target-e00)). Codex sigue cargando su `AGENTS.md`, que es el orquestador; eso pertenece a E0.4.

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
- **Avance:** lista de la auditoría confirmada el 2026-10-04, incluida la retirada de review v1.
  - **(a) entregado en v2.85.0:** el extractor (JS y Go, con test de paridad sobre las skills reales) solo lee encabezados de reglas explícitos (`… Rules`, `Reglas …`) y ya no recoge todas las viñetas cuando no los hay. El test recorre las skills publicadas y falla si una *compact rule* sale de un antipatrón o de una lista de activación. El lint exige `Trigger:` a toda skill de conocimiento, con exención temporal de las que (b) elimina o fusiona. `accessibility`, `api-design` y `hexagonal-architecture` ganan una sección `## Rules` breve, porque antes inyectaban sus antipatrones.
  - **(b) entregado en v2.86.0:** se eliminan `agent-harness-construction`, `ai-first-engineering`, `agent-self-evaluation`, `token-budget-advisor`, `tdd-workflow`, `context7-mcp`, `backend-patterns`, `frontend-patterns`, `architecture-decision-records` y `caveman-help`. `caveman-commit` y `caveman-review` pasan a ser modos de `caveman`; `agent-introspection`, a la regla de recuperación del orquestador; `ai-regression-testing`, a `sdd-verify/references/ai-blind-spots.md`; `harness-audit`, a skill local del repositorio (`.agents/skills/`). El dominio de spec `token-budget-advisor` se conserva: describe el hook de `PreToolUse`, no la skill. El lint de `Trigger:` ya no tiene exenciones y el tope de *compact rules* baja de 500 a 450 tokens.
  - **(b2) entregado en v2.87.0:** `scripts/lib/skill-extras.js` define el paquete opcional (`issue-creation`, `comment-writer`, `gh-release-notes`, `judgment-day`, `caveman-compress`, `stack-webmcp`). El generador lo deja fuera salvo con `withExtras` (REQ-generator-021), y los 7 instaladores y `install-target` aceptan `--with-extras` (REQ-install-032). Reinstalar sin el flag las desinstala, porque la poda por manifiesto quita lo que la build ya no trae. Por target quedan 61 skills instaladas (62 en Claude) y el listado baja unos 0,95 KB. El instalador TUI (Go) no expone todavía el paquete.
  - **(c) entregado en v2.90.0:** una skill de stack por tecnología (REQ-skills-021). Las 11 sub-skills de Go, Kotlin, Python, React y Spring Boot (testing, rendimiento, seguridad, TDD, verificación, corrutinas, Ktor y Exposed) pasan a `references/` de su skill, que gana una regla condensada por sub-área con el nombre del fichero que hay que leer. React y Spring Boot no tenían sección de reglas y no inyectaban nada; ahora inyectan sus reglas. Un test exige capacidades únicas, 13 skills de stack y enlaces resolubles (había cuatro enlaces rotos en React). Quedan 50 skills instaladas por target (51 en Claude) y el listado baja unos 0,93 KB.
  - **Pendiente:** (d) retirada de review v1.

### E0.4 — `router-and-sdd-on-demand`

- **Alcance:**
  - Cada `setup:<target>` instala el router de `global-instructions/` como bloque con marcadores, sin pisar contenido del usuario y de forma reversible. En Codex, `~/.codex/AGENTS.md` recibe solo el router (hoy son 63 KB) y la instalación por repositorio cabe en el límite de `AGENTS.md`.
  - El router se reescribe: SDD solo cuando el usuario lo pide de forma explícita (`/sdd-*` o "hazme un SDD"). Hasta E1.6, el resto del trabajo se hace de forma directa.
  - El orquestador SDD y sus agentes de fase se cargan solo bajo demanda en los 7 targets.
- **Hecho cuando:** el informe de E0.0 da ≤ 4 KB *always-on* por target, y una sesión sin `/sdd-*` no carga nada del protocolo SDD.
- **Entrega:** PRs encadenados: (a) router e instalación, (b) rutas `_shared` del orquestador resolubles desde la instalación.
- **Avance:**
  - **(a) entregado en v2.88.0:** el router pasa a ser la regla global `rules/ospec-router.instructions.md` (REQ-generator-022): SDD solo con `/sdd-*` o una petición explícita, y el orquestador del host nombrado con un marcador que el generador resuelve. `global-instructions/` se retira. Claude y Codex sacan sus reglas globales a un fichero propio (`global-instructions/CLAUDE.md` y `AGENTS.md`); en Codex el orquestador pasa a la skill `sdd-orchestrator`, y sus comandos `$sdd-*` la cargan. `setup:claude` y `setup:codex` (global y por repositorio) escriben el router como bloque con marcadores sin tocar el texto del usuario; el `AGENTS.md` de 63 KB que la instalación anterior poseía entero se sustituye, y `--no-router` quita el bloque (REQ-install-033). La regla de atribución se compacta para que router y regla quepan en 4 KB. Resultado: *always-on* de 2,7–3,0 KB en los 7 targets ([target-capabilities §7](../target-capabilities.md#7-coste-de-contexto-por-target-e00)).
  - **(b) entregado en v2.89.0:** el generador apunta las referencias `_shared` del orquestador a la copia instalada (REQ-generator-023). En Claude usa `${CLAUDE_SKILL_DIR}/../_shared`, que Claude Code sustituye en el cuerpo de la skill. En los demás targets deja el marcador `__OSPEC_SHARED_DIR__`, y cada instalador lo cambia por el directorio donde deja `skills/_shared/` (REQ-install-034, `scripts/configure/shared-dir.js`): ruta absoluta en las instalaciones globales (Antigravity, una por raíz, y una raíz WSL con su ruta de Windows), `dist/vscode` en VS Code y ruta relativa al repositorio en las instalaciones por repo. `install:codex -- <repo>` instala ahora también `.agents/skills/_shared`. El marcador se restaura en `dist/` tras sincronizar, salvo en VS Code, que carga `dist/vscode` directamente: tras un `build:vscode` suelto hay que volver a ejecutar `setup:vscode`. Una prueba real con `claude -p --plugin-dir`, lanzada desde un repositorio vacío, leyó `skill-resolver.md` por esa ruta. El orquestador crece 175–490 B por las rutas más largas.

## Etapa 1 — IDD como flujo por defecto

**Resultado de la etapa:** un cambio sigue IDD en cualquier target sin que nadie lo pida: el CLI calcula las obligaciones, el modelo trabaja y el CLI decide cuándo está terminado. SDD queda como modo opcional.

### E1.1 — `idd-contract`

- **Alcance:** spec canónica de IDD con:
  - El documento vivo del change, con una plantilla mínima: intención y aceptación, plan, decisiones y la evidencia que rellena el CLI.
  - El `state.yaml` mínimo, que solo escribe el CLI.
  - El catálogo señal → obligación → evidencia y los tres gates.
  - La convivencia con el modo SDD en el mismo repositorio, con `mode` por proyecto y por change.
- **Hecho cuando:** seis cambios tipo (typo, bug, feature interna, API pública, migración y autenticación) tienen fixtures con sus obligaciones y gates esperados, y ningún requisito de SDD cambia.

### E1.2 — `ospec-cli-core`

- **Alcance:**
  - `ospec status`, `ospec next` y `ospec record`, con salida `--json`.
  - `next` devuelve el cambio activo, las obligaciones pendientes, el siguiente paso, la decisión pendiente y las referencias de conocimiento.
  - `record` hace escrituras atómicas e idempotentes.
  - Se construye sobre `ospec-state`, `result-envelope`, `validate-phase` y la detección de ambigüedad de clarify (O3), que ya existen.
- **Hecho cuando:** repetir un `record` no duplica entradas, un `record` interrumpido no corrompe el estado y `next` es determinista para los fixtures de E1.1, incluidos los casos ambiguos.

### E1.3 — `impact-signals`

- **Alcance:**
  - Calcula las señales con la declaración inicial y el diff.
  - Añade una sección `impact:` a `openspec/config.yaml`, con valores por defecto según el stack.
  - Reutiliza los suelos de riesgo de PP1/PP2 y la clasificación de K1.
  - Cada señal muestra su razón (por ejemplo, "contrato público: toca `src/api/**`").
- **Hecho cuando:** los fixtures cubren los suelos de riesgo actuales (autenticación, migración y API), un cambio de dos líneas en un contrato público recibe su obligación y un refactor mecánico grande no recibe ningún gate.

### E1.4 — `ospec-check-and-close`

- **Alcance:**
  - `ospec check` ejecuta los checks declarados y registra su salida, lee la evidencia de TDD y de reproducción, y recalcula las señales con el diff.
  - Cuando una obligación lo pide, lanza un review independiente con el gate selectivo existente: 0, 1 o N lentes, hallazgos congelados y una corrección acotada.
  - Responde `listo`, `falta <obligación>` o `necesita tu decisión`.
  - `ospec close` archiva con el archive transaccional (O6A).
- **Hecho cuando:**
  - No se puede cerrar con una obligación sin evidencia.
  - La afirmación del modelo "los tests pasan", sin ejecución registrada, no cierra nada.
  - Un cambio solo de documentación cierra sin review.
  - Un diff que empieza a tocar una migración añade su obligación.

### E1.5 — `kernel-wiring-inventory`

- **Problema:** de unas 50 k líneas de `scripts/lib`, solo unas 9 k son alcanzables desde los hooks y los comandos que se ejecutan en un proyecto consumidor.
- **Alcance:**
  - Inventario de cada módulo no cableado (Execution Graph, Authority Store, Assurance Graph, verifier independiente, Repair shadow, K12, attestation, lifecycle-model, worker-*). Para cada uno se decide si se **cablea** (indicando qué ítem lo consume, empezando por E1.4), se **congela** (se mantiene sin inversión) o se **retira** (se borra junto con sus tests).
  - También entran los tests y checkers que leen la [arquitectura archivada](archive/2026-10-03-arquitectura/harness-evolution.md): `k1-maturity`, `k21-maturity-docs`, `k2a-maturity-docs`, `k3-readiness-reconciliation` y `roadmap-reconciliation`.
- **Hecho cuando:** ningún módulo queda sin ítem dueño o sin decisión explícita.

### E1.6 — `idd-default-entry`

- **Alcance:**
  - Protocolo IDD para los 7 targets: ≤ 12 KB, cargado bajo demanda donde el host lo permita. El router lo convierte en el flujo por defecto.
  - SDD se activa con `/sdd-*` o con `mode: sdd` en `openspec/config.yaml`. Los changes SDD en curso terminan en SDD.
  - Las skills y los agentes de fase SDD pasan al paquete opcional.
  - `branch-pr`, `chained-pr` y `work-unit-commits` se cablean por nombre en el protocolo IDD.
  - El README y la documentación de producto presentan IDD como flujo por defecto y SDD como modo.
- **Gate:** el checkpoint de E4.1, que compara IDD con el modo SDD. IDD no puede dejar escapar más defectos y debe gastar menos tokens. Si no lo cumple, `revise` antes de cambiar el default.
- **Hecho cuando:** una instalación limpia en cada target crea y cierra un cambio con documento vivo sin cargar nada de SDD, y un proyecto con `mode: sdd` funciona igual que hoy.

### E1.7 — `ospec-doctor`

- **Alcance:** diagnóstico de solo lectura por target: raíz del plugin, hooks, router instalado, modo activo, Engram, desfase entre `dist/` e instalación y presupuestos de E0.0. Incluye recuperación guiada de un cambio interrumpido.
- **Hecho cuando:** cada fallo conocido de instalación y de la auditoría aparece con causa y acción.

## Etapa 2 — Foundation de verdad: descubrimiento de arquitectura

**Resultado de la etapa:** al crear un proyecto, ospec hace las preguntas que haría un arquitecto con experiencia en proyectos serios. Captura la información funcional, el contexto del equipo, los atributos de calidad y las restricciones, y produce **ADRs de arquitectura agnósticos de tecnología**, separados de la selección tecnológica. Las preguntas no salen de un cuestionario fijo: salen de los huecos de conocimiento que más condicionan las decisiones pendientes. La foundation sirve igual a IDD y al modo SDD.

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
7. **Herramientas de calidad.** Estrategia de test, CI, linters y observabilidad, cada una ligada al atributo de calidad o *fitness function* que protege. Se vuelca en `openspec/config.yaml`: comandos, TDD y rutas de las señales de impacto.
8. **Roadmap funcional.** Esqueleto andante como primer slice, y decisiones diferidas con su "último momento responsable".

La foundation termina cuando todas las ranuras obligatorias que bloquean el primer slice están confirmadas o diferidas con dueño. No hace falta resolver el futuro entero.

### E2.1 — `knowledge-map-contract`

- **Alcance:** esquema del mapa de conocimiento (ranuras, dimensiones, estados, perfiles y relaciones ranura → decisión), su ubicación (estado de máquina en `openspec/`, documentos humanos en `docs/`) y el catálogo inicial de ranuras por perfil.
- **Hecho cuando:** los seis perfiles tienen su conjunto de ranuras obligatorias con un ejemplo, y "desconocido" se distingue de "N/A" en el esquema.

### E2.2 — `decision-gap-engine`

- **Alcance:** `ospec foundation next` aplica la fórmula de priorización, agrupa por tema y devuelve la siguiente ronda con recomendaciones; `record` persiste respuestas y supuestos.
- **Hecho cuando:** una CLI local, un SaaS pequeño y un producto regulado producen rondas distintas y deterministas a partir del mismo motor, y reanudar no repite preguntas ya respondidas.

### E2.3 — `foundation-discovery-rounds`

- **Alcance:** reescribir la foundation (hoy `sdd-foundation`) como capacidad propia, independiente del modo, sobre el ciclo descrito: rondas reanudables, ingestión de fuentes y documentos `docs/product/*`, `docs/architecture/*` y `docs/roadmap*.md` actualizados de forma incremental. Absorbe el diseño de [foundation holística](archive/2026-10-03-arquitectura/harness-foundation-holistic.md) (antes R2.1/R2.4, archivado como insumo).
- **Hecho cuando:** ningún scaffold ni código se genera sin aprobación, y se cumplen los escenarios de aceptación de ese diseño (CLI local, SaaS pequeño, regulado, brownfield, fuente desactualizada y cambio pequeño posterior).

### E2.4 — `decision-records-model`

- **Alcance:** tres tipos de registro, cada uno con plantilla y lint:

  | Registro | Contenido | Dónde vive |
  | --- | --- | --- |
  | **ADR** de arquitectura | Agnóstico; drivers, opciones, consecuencias, *fitness function*, disparador | `docs/architecture/decisions/` |
  | **TSR** (registro tecnológico) | Implementa uno o más ADR; alternativas y fuentes fechadas | `docs/architecture/technology/` |
  | **DC** (decisión de change) | Decisión de desarrollo de un cambio | Documento vivo del cambio (`design.md` en modo SDD) |

  El lint avisa si la sección "Decisión" de un ADR nombra productos o librerías del stack detectado, o si un ADR no referencia ningún driver. Ocupa el lugar de la skill `architecture-decision-records`, retirada en v2.86.0.
- **Hecho cuando:** los fixtures distinguen un ADR válido, un ADR "tecnológico" (aviso) y una decisión de desarrollo mal clasificada como ADR.

### E2.5 — `brownfield-architecture-recovery`

- **Alcance:** al adoptar un repositorio existente (hoy `sdd-baseline`), inferir componentes, límites y dependencias a partir del código y la documentación; proponer **ADRs inferidos** (`status: inferred`) y pistas de atributos de calidad que el usuario confirma o corrige; registrar las divergencias sin sobrescribir.
- **Hecho cuando:** en un repositorio de ejemplo se obtiene un mapa de componentes y ADRs inferidos con evidencia `ruta:línea`.

### E2.6 — `dogfood-ospec-foundation`

- **Alcance:** ejecutar E2.3 y E2.5 sobre este repositorio para producir el brief, el contexto de equipo, los atributos de calidad y unos 10 ADRs de arquitectura de ospec (p. ej. generación multi-target desde una fuente única, OpenSpec en disco como autoridad de estado, algoritmos en el CLI y no en prosa, ceremonia por impacto, cierre ligado a evidencia, memoria sin autoridad). Los 100+ registros actuales de `docs/adr/` se reclasifican como decisiones de change archivadas, con un índice.
- **Hecho cuando:** `docs/architecture/decisions/` contiene solo ADRs de arquitectura y cada uno pasa el lint de E2.4.

## Etapa 3 — Conocimiento vivo en cada cambio

**Resultado de la etapa:** cada cambio recibe por referencia solo el conocimiento pertinente, registra sus decisiones de desarrollo donde corresponde y solo modifica la arquitectura cuando de verdad la toca. Es lo que ODD no tiene.

### E3.1 — `change-decisions-and-adr-impact`

- **Alcance:**
  - El documento vivo registra las decisiones del cambio (DC).
  - Cuando la señal de ADR está activa, incluye la declaración de **impacto arquitectónico**: `ninguno | conforma ADR-n | enmienda | sustituye | contradice`. Enmendar, sustituir o contradecir es un gate.
  - El cierre deja de promover decisiones de desarrollo a `docs/adr/`.
  - Una **comprobación de promoción** propone un ADR nuevo o enmendado, con gate del usuario, solo cuando el cambio toca un driver o atributo de calidad, una frontera, un patrón transversal o contradice un ADR. Aprovecha el delta de complejidad de K6d.
- **Hecho cuando:** un cambio en una librería interna no genera ningún ADR, y un cambio que introduce mensajería asíncrona entre módulos propone una enmienda al ADR de integración.

### E3.2 — `knowledge-by-reference`

- **Alcance:** un mapa componente → conocimiento alimenta dos cosas: las referencias que entrega `ospec next` (identificadores de ADR, escenarios de calidad, términos de glosario y restricciones del equipo de los componentes que toca el cambio) y la señal de ADR de E1.3. Nunca se pasan documentos completos. La vigencia de cada referencia es visible: actual, desactualizada o ausente. Absorbe el antiguo R2.2.
- **Hecho cuando:** el cambio recibe solo las referencias pertinentes, y una referencia desactualizada produce un aviso en lugar de usarse como verdad.

### E3.3 — `fitness-functions-in-check`

- **Alcance:** los ADR y los escenarios de calidad declaran comprobaciones ejecutables (reglas de dependencias entre módulos, presupuestos de rendimiento, comprobaciones de seguridad) que `ospec check` ejecuta como evidencia. Las que no son ejecutables se tratan como checklist explícito con evidencia manual.
- **Hecho cuando:** una violación de frontera declarada en un ADR impide cerrar el cambio, y el error cita el identificador del ADR.

### E3.4 — `team-context-defaults`

- **Alcance:** el perfil de equipo de la foundation sustituye a la escala `solo | team | enterprise` y decide los defaults de entrega, el umbral de review, Strict TDD y la mentoría.
- **Hecho cuando:** dos proyectos con equipos distintos obtienen defaults distintos sin preguntar de nuevo.

### E3.5 — `knowledge-memory-loop`

- **Alcance:** ADR, TSR, DC y aprendizajes se reflejan en Engram con procedencia y revisión. Al empezar un cambio se recuperan las decisiones previas relacionadas. La memoria nunca es autoridad y su caída no bloquea.
- **Hecho cuando:** un cambio nuevo cita una decisión previa relevante encontrada en memoria y la contrasta con el disco.

## Etapa 4 — Demostrar que es mejor

### E4.1 — `bench-scenarios`

- **Alcance:**
  - Seis escenarios con agentes reales, reutilizando la infraestructura de registro de agentes de K12 (`worker-record`): CLI local, SaaS pequeño, producto regulado, brownfield, librería pública y bugfix.
  - Brazos: el modo SDD actual (línea base, medida antes de E1.6) e IDD.
  - Métricas: defectos escapados, tokens, duración, preguntas (cuántas y cuántas cambian una decisión) e intervenciones humanas. Desde E2 se añaden la cobertura del mapa y la calidad de los ADR, con rúbrica.
  - Los márgenes se declaran antes de ejecutar.
- **Hecho cuando:** el informe es reproducible y su checkpoint habilita o frena E1.6.

### E4.2 — `head-to-head-gentle-ai`

- **Alcance:** los mismos escenarios con gentle-ai (ODD y RDD), mismo host y mismo modelo. Tabla comparativa publicada en cada tren de releases.
- **Hecho cuando:** existe una comparación publicada con numeradores, denominadores y exclusiones.

### E4.3 — `context-budget-ratchet`

- **Alcance:** los techos de E0.0 bajan en cada release que reduce contexto, y nunca suben sin una justificación registrada.

## Etapa 5 — Plataforma por demanda

Ítems que se abren cuando hay demanda o evidencia, sin orden fijo:

- **E5.1 — `target-capability-matrix`:** matriz honesta de capacidades por target (7), revalidada con la documentación oficial; absorbe [`targets/`](targets/).
- **E5.2 — paquetes de conocimiento bajo demanda:** consulta curada de fuentes externas (incluido el catálogo CNCF) con fuentes y vigencia (antes R2.3/R2.6).
- **E5.3 — documentación y wiki:** `sdd-document` y la web Starlight consumen el mapa de conocimiento y los ADR (antes R2.7). Regenera `openwiki/`, que aún describe la dirección del kernel.
- **E5.4 — federación y workspace:** evolución de R4 cuando haya un caso real multi-repositorio.
- **E5.5 — `change-program`:** objetivos grandes gestionados como programa, con cambios hijos y un cursor que retoma el siguiente. Insumo: [proporcionalidad y Change Program](archive/2026-10-03-arquitectura/research/proportional-process-and-change-program.md).
- **E5.6 — deuda diferida H1–H7:** remediación del backlog de archive y runtime al terminar el roadmap (decisión del usuario del 2026-10-02).

## Aparcado (con criterio de reapertura)

Se conserva el código y la documentación; no recibe inversión mientras no se cumpla el criterio.

| Línea | Criterio de reapertura |
| --- | --- |
| Recetas K9/K10 (Direct, Repair, Bounded, Planned y Critical, y profiles múltiples) | IDD las sustituye por obligaciones; solo vuelven si E4 muestra un caso que las obligaciones no cubren |
| K10-delivery (`DeliveryAuthorization` en pre-commit, pre-push y pre-pr) | Que un equipo usuario pida bloquear la entrega con evidencia y E1.4 esté cableado |
| K11a–K11d (expansión de adapters, routing de modelos, worktrees, consolidación de roles) | Que un ítem lo necesite como consumidor concreto |
| K12 longitudinal y multi-target | Que E4 necesite series largas |
| CX2–CX6 (vistas derivadas, proyección de contexto, deltas de spec) | Que E0 o E4.3 no alcancen sus techos con medios más simples |
| Capacidades nuevas del modo SDD (migrarlo al CLI, trocear su protocolo, gate de entrada agrupado) | Que usuarios del modo SDD lo pidan con un caso concreto |
| Dream-RSI y aprendizaje de políticas | Que exista una política fija con evaluador congelado y cohorte de holdout |

## Base entregada

Lo que ya existe y en qué ítem se aprovecha. El detalle de cada pieza está en el [roadmap archivado](archive/2026-10-03-harness-evolution-kernel.md).

| Estado | ID | Qué dejó | Uso en este roadmap |
| --- | --- | --- | --- |
| `done` | **O2B** | Baseline `fixed` de control (v2.36.0) | Brazo de control de E4.1 |
| `done` | **O3** | Clarify condicional | Gate de ambigüedad de IDD (E1.2) |
| `done` | **O4+O5** | Review selectivo y linaje acotado | Review por obligación (E1.4) |
| `done` | **O6A** | Archive híbrido transaccional | `ospec close` (E1.4); deuda en E5.6 |
| `done` | **K1** | Contract suite, vocabulario y clasificación (v2.37.0) | Señales de impacto (E1.3) |
| `done` | **K2** | Lifecycle, Minimal Kernel Harness e invariantes (v2.38.0) | E1.5 decide su cableado |
| `done` | **K2.1** | Authority Store (CAS), OperationPermit y semántica de efectos (v2.39.0) | E1.5 |
| `done` | **K2a** | Headless Conformance Host y adapter de referencia, implemented en v2.40.0 | E1.5 |
| `done` | **K3** | Identidades de ejecución y Candidate (v2.42.x) | E1.5 |
| `done` | **`k3-readiness-remediation`** | Relación, successor y empaquetado reconciliados; archivado | — |
| `done` | **K4a** | Execution Graph compiler, Obligation Manifest y replay (verificado en v2.45.7) | E1.5 |
| `done` | **K5** | Budgets, failures y recovery (v2.45.13) | E1.5 |
| `done` | **K6a** | Aislamiento de workers y cápsula de work order (v2.46.0–v2.47.2) | E1.5 |
| `done` | **K4b** | Repair shadow execution (v2.48.x) | Obligación de reproducción (E1.4) |
| `done` | **K6b** | Verifier independiente, provenance y Assurance Graph (v2.55.0) | E1.4 y E1.5 |
| `done` | **K6c** | Challenges adversariales por política (v2.56.x) | E1.5 |
| `done` | **K6d** | Delta de complejidad y arquitectura, advisory | E3.1 |
| `done` | **PP1/PP2** | Elegibilidad de rutas con suelos de riesgo; contrato lite compacto | Señales de impacto (E1.3) |
| `done` | **CX0/CX1** | Medición de contexto; envelope y reducer de estado | E0.0 y E1.2 |
| `done` | **Binding de identidad de operación** | Gate de ambigüedad en SubagentStop (v2.69.0) | E1.2 |
| `done` | **K7 mínimo** | Binding de review con Candidate y Policy, lineage v3 (v2.70.0) | E1.4 |
| `done` | **K8 mínimo** | `CandidateEvaluationAttestation` (v2.71.0–v2.73.1) | Aparcado con K10-delivery |
| `done` | **K12 focal** | Oracle por fixture, campaña de maquinaria y cohorte de 22 tareas (v2.70.0–v2.78.0) | E4.1 |
| `done` | **Piloto Adaptive Repair** | Checkpoint determinista `continue` (v2.79.0) y calibración con agentes reales `continue` (v2.80.0) | Obligación de reproducción (E1.4) |
| `done` | **Engram por target** | Configuración automática en los 7 targets (v2.81.0) | E3.5 |

## Historial

- 2026-07-02 → 2026-10-03: programa K1–K12 y lanes O, PP, CX y R2 (ver el [roadmap archivado](archive/2026-10-03-harness-evolution-kernel.md#historial-consolidado)).
- 2026-10-03: auditoría de skills, carga *lazy*, instrucciones por target, orquestador y comparación con gentle-ai. El roadmap K1–K12 se archiva y se sustituye por este roadmap único. K10-delivery, K11, K12 longitudinal, CX2–CX6 y Dream-RSI quedan aparcados con criterio de reapertura.
- 2026-10-03: la arquitectura objetivo del kernel, Adaptive, proporcionalidad, foundation holística y la investigación salen de `docs/architecture/` hacia [`archive/2026-10-03-arquitectura/`](archive/2026-10-03-arquitectura/README.md). La carpeta queda reservada para la arquitectura vigente (E2.6) y `docs/README.md` vuelve a ser el índice de la documentación.
- 2026-10-03: SDD deja de ser el flujo por defecto. El roadmap se reorienta a **IDD** (profundidad por impacto, cierre por evidencia) como flujo propio, con SDD como modo opcional. Las recetas Direct, Repair y Critical (antes E4.2) y la clasificación por impacto (antes E4.1) pasan a ser señales y obligaciones de la Etapa 1. El motor de estado se reorienta a IDD, y migrar el orquestador SDD al CLI queda aparcado. Change Program pasa a la plataforma por demanda.
