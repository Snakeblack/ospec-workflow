# Auditoría del harness y comparación con gentle-ai

**Fecha:** 2026-10-03 · **Base auditada:** ospec-workflow v2.81.0 (`71a982b9`) · **Referencia externa:** gentle-ai `main` en `f4d3f3e` (documentación v4.0.0).

Este informe sustenta el [roadmap único](../roadmaps/harness-evolution.md). Responde a cinco preguntas: qué skills sobran, cómo hacer que las skills funcionen bien y bajo demanda, cómo mejorar el `AGENTS.md`/`CLAUDE.md` recomendado, si el orquestador carga demasiado (y cuántas veces) y qué hace falta para superar a gentle-ai.

## Resumen

1. **Hay un defecto de corrección que afecta a todos los usuarios.** Los agentes de fase piden leer `skills/sdd-X/SKILL.md` con ruta relativa. En un proyecto consumidor esa ruta no existe. En una sesión real, `sdd-apply` y `sdd-clarify` trabajaron sin cargar su skill y el resto la buscó con `Glob` por el disco. En este repositorio no se ve porque `skills/` está en la raíz: el dogfooding oculta el fallo.
2. **El coste fijo de instrucciones es de 2 a 3 veces el de gentle-ai, y en varios targets se paga en cada petición.** Codex carga 63 KB de orquestador en cada sesión de cualquier repositorio. Cursor, Copilot, OpenCode y Antigravity inyectan unos 23–26 KB de reglas en cada petición y en cada subagente. Cada fase lee además 60–75 KB de protocolo compartido.
3. **El orquestador no se recarga en cada fase (en Claude se carga una vez por sesión), pero describe en prosa un algoritmo que el modelo no ejecuta con fiabilidad.** En los transcripts de app-restaurante hay unos 20 despachos de fase y solo 2 ejecuciones del `validate-phase` "obligatorio".
4. **El catálogo de skills tiene ruido y reglas mal extraídas.** De 82 skills, 30 sobran o deben fusionarse. Además, el extractor de *compact rules* inyecta antipatrones y listas de "cuándo usar" como si fueran reglas.
5. **La inversión de los últimos meses fue sobre todo a un kernel de garantías que el flujo real aún no usa.** De unas 50 k líneas de `scripts/lib`, solo unas 9 k son alcanzables desde los hooks y los comandos que se ejecutan en un proyecto consumidor. Execution Graph, Authority Store, Assurance Graph, verifier, Repair shadow, K12 y attestation viven en tests y campañas.
6. **gentle-ai no tiene foundation, ADRs, atributos de calidad ni specs.** Su fuerza es la memoria, un flujo orgánico de un solo documento y un binario determinista que decide el siguiente paso. Ahí está el hueco que ospec puede ocupar: **el conocimiento de ingeniería del proyecto** (producto, equipo, drivers de arquitectura, decisiones) con un flujo proporcional y un motor de estado determinista.

## 1. Método y evidencia

| Fuente | Uso |
| --- | --- |
| Repositorio en v2.81.0 | Inventario de skills, agentes, reglas, comandos y `scripts/lib` |
| Builds frescos de los 7 targets en un directorio temporal | Medición de lo que realmente se instala; los `dist/` locales estaban desfasados (algunos de septiembre) |
| Transcripts reales de Claude Code en app-restaurante (plugin v2.73.1) y en este repo | Comprobar cuántas veces se carga el orquestador, qué leen los subagentes y qué preguntas se hacen |
| Clon de gentle-ai `f4d3f3e` | README, `docs/usage.md` (ODD), orquestadores por target, registry de skills y testing determinista |
| Documentación oficial vía Context7 | Frontmatter de subagentes y skills en Claude Code; límites de `AGENTS.md` en Codex (`agents_md.rs`) |
| Análisis de alcanzabilidad de `require` | Qué módulos de `scripts/lib` se ejecutan desde hooks, `validate-phase`, `route-dispatch-run` y `archive-transaction-run` |

## 2. Hallazgos críticos

### F1 — Las skills de fase no se cargan en proyectos consumidores

- **Dónde:** sección "Required skill" de `agents/sdd-*.agent.md`, que se copia tal cual a los 7 targets (comprobado en el build actual de Claude: `agents/sdd-apply.md`, líneas 17–18).
- **Evidencia:** sesión `322bdd17` de app-restaurante. Todos los subagentes de fase intentan leer `app-restaurante/skills/sdd-X/SKILL.md` y reciben "File does not exist".

| Subagente | Resultado |
| --- | --- |
| `sdd-apply`, `sdd-clarify` | No vuelven a buscar: ejecutan la fase **sin su skill** (sin reglas de TDD, remediación ni contrato de fase) |
| `sdd-tasks`, `sdd-propose`, `sdd-spec`, `sdd-design` | Recuperan con `Glob` sobre `~/.claude` o `~/.claude/plugins` |
| `sdd-explore` | Recupera con `Glob` sobre todo `C:\Users\sn4ke` |

- **Por qué no se veía:** en este repositorio la ruta relativa coincide con la raíz del plugin.
- **Restricción del host:** Claude Code permite precargar skills en un subagente con `skills:`, pero no las que tienen `disable-model-invocation: true` (todas las de fase).
- **Corrección propuesta:** compilar en build el cuerpo de la skill de fase y el fragmento de `_shared` que necesita dentro del propio agente de fase. El agente solo se carga al despacharse, así que sigue siendo *lazy*. Vale para los 7 targets y elimina la dependencia de rutas.

### F2 — Las *compact rules* inyectadas en los subagentes son a veces erróneas

`scripts/lib/skill-registry.js` (`extractCompactRules`) toma como reglas las viñetas de cualquier encabezado que contenga `rules|patterns|constraints|gates`. "Anti-Patterns" también encaja, y por eso:

| Skill | Lo que se inyecta como "regla" |
| --- | --- |
| `hexagonal-architecture` | "Domain entities importing ORM models, web framework types, or SDK clients." (un antipatrón, presentado como instrucción) |
| `agent-harness-construction` | "Too many tools with overlapping semantics." |
| `backend-patterns`, `frontend-patterns` | La lista "When to activate" ("Designing REST or GraphQL API endpoints"…) |
| `tdd-workflow` | Reglas sobre ficheros `/plan` y "80 % coverage", ajenas al Strict TDD del harness |

Además, 48 de las 65 entradas del registry no declaran `Trigger:` y su único trigger es su propio nombre. Las de review y stack se resuelven por otros mecanismos (nombre del gate y capacidad detectada), pero quedan 14 skills de conocimiento (accessibility, api-design, hexagonal-architecture, tdd-workflow…) cuyo emparejamiento por tarea depende solo del juicio del modelo.

### F3 — Codex: orquestador completo en cada sesión y truncado en instalación por repositorio

- `setup:codex` copia el `AGENTS.md` generado (63 KB: orquestador más reglas) a `~/.codex/AGENTS.md`. Codex lo carga en **todas** las sesiones de **cualquier** repositorio, incluidas las que no tienen nada que ver con SDD.
- En instalación por repositorio el destino es `AGENTS.md` del proyecto. Ahí aplica `project_doc_max_bytes`, 32 KiB por defecto, que corta la cola del fichero (`agents_md.rs`: `data.truncate(remaining)`). Se perderían TDD forwarding, rutas de artefactos, la tabla de handlers, la regla de recuperación y todas las reglas añadidas.

### F4 — Los pasos "MANDATORY" en prosa no se ejecutan con fiabilidad

En los transcripts de app-restaurante hay 3 sesiones con orquestador y unos 20 despachos de fase, pero solo 2 ejecuciones de `validate-phase`, ambas para `sdd-explore`. Lo mismo vale para el resto de los algoritmos descritos en prosa (ledger de supuestos, fingerprints, bloque `route:`). Si una garantía es determinista, debe vivir en código que el orquestador invoque y del que reciba el siguiente paso, no en un párrafo.

## 3. Carga de instrucciones por target (punto 4)

Medido sobre builds frescos de v2.81.0.

| Target | Orquestador | Se carga siempre (fuera de SDD y en cada subagente) | Comentario |
| --- | ---: | --- | --- |
| Claude Code | 63 KB (skill) | Unos 3 k tokens de listado de skills y comandos | El orquestador se carga **una vez por sesión** al entrar en SDD; en 9 sesiones medidas, `inv=1` (una sesión con 2 inyecciones tras compactar) |
| Codex | 63 KB (`~/.codex/AGENTS.md`) | **63 KB en cada sesión** | Ver F3 |
| Cursor | 48 KB | **26 KB** de reglas con `alwaysApply: true` y `globs: ["*"]` | Las reglas fuente tenían `applyTo` acotado; el transform lo pierde |
| GitHub Copilot | 44 KB | **23 KB** de instrucciones con `applyTo: "**"` | Igual |
| OpenCode | 43,5 KB | **23 KB** vía `"instructions": [".opencode/instructions/*.md"]` | Las instrucciones globales llegan a todos los agentes |
| Antigravity | 44 KB | **23 KB** con `applyTo: "**"` | Igual |
| VS Code | 44 KB | Una regla `**` (no-model-attribution); el resto acotado | Es el target mejor resuelto |
| *gentle-ai (referencia)* | *16,7–24 KB* | — | Orquestador por target con secciones compartidas |

**Por fase (todos los targets):** agente (unos 3 KB), `SKILL.md` de la fase (8–22 KB), `sdd-phase-common.md` (23,7 KB), `openspec-convention.md` (24,5 KB) y `engineering-judgment.md` (3,5 KB). En total, **60–75 KB, entre 15 y 19 k tokens de protocolo antes de leer un solo artefacto**. Un change estándar (7 fases más review) consume unos 120 k tokens solo en protocolo. Buena parte no aplica a la fase que lo lee: `openspec-convention.md` incluye el esquema del cache del registry, los campos de `runSessionStart` y los bloques `gates`/`lifecycle_hooks`, que `sdd-explore` o `sdd-propose` no necesitan.

**Respuesta directa a la sospecha:** el orquestador no se re-inyecta en cada fase en Claude. Lo que sí se repite es (a) el protocolo compartido en **cada** subagente y (b) las reglas *always-on* de Cursor, Copilot, OpenCode y Antigravity, que entran en cada petición y en cada subagente. Además, (c) Codex carga el orquestador completo en todas sus sesiones.

## 4. El orquestador (punto 4)

**Lo que debe conservar (su propiedad):** ser el único que pregunta al usuario, el dueño de los gates, de la delegación y de la escritura del estado del change. El roadmap no le quita nada de eso.

**Problemas:**

| Problema | Evidencia | Propuesta |
| --- | --- | --- |
| 63 KB de prosa con algoritmos (ledger de supuestos, fingerprints, bloque `route:`, validación de fase, lineage de review) | Ver F4 | Mover los algoritmos al CLI `ospec` (`status`, `next`, `record`) y dejar en el orquestador un núcleo de unos 15 KB: rol, gates, bucle "preguntar al CLI → despachar → registrar" y recuperación |
| Hasta 4 preguntas antes de empezar (briefing de intención, ruta advisory, modo de ejecución, estrategia de entrega), y modo y estrategia se repiten **por sesión** | Sesiones con 10 `AskUserQuestion` | Un único gate agrupado; modo y estrategia como **defaults del proyecto** en `config.yaml`, preguntados una sola vez |
| Las reglas añadidas (`no-model-attribution`, `sdd-common`, `sdd-openspec`) duplican contenido del orquestador | 63 KB frente a 44 KB del agente | El build compone sin duplicar; las reglas solo van donde el host no tiene otro mecanismo |
| `branch-pr`, `chained-pr` y `work-unit-commits` no se resuelven por nombre | `chained-pr` y `work-unit-commits` no tienen referencias en agentes ni en `_shared` | El Review Workload Guard y `sdd-apply` los nombran explícitamente |

## 5. Catálogo de skills (puntos 1 y 2)

El criterio fue el beneficio para el harness. Una skill se conserva si un flujo del harness la consume, si aporta conocimiento que el modelo no trae o si el usuario la invoca con una intención clara. Se retira si duplica una garantía del harness o la contradice, si no tiene reglas accionables o si solo sirve para desarrollar este repositorio.

### 5.1 Veredicto por skill

| Grupo | Skills | Veredicto |
| --- | --- | --- |
| Fases SDD (16) | init, foundation, baseline, workspace, explore, propose, spec, clarify, design, tasks, apply, verify, archive, reconcile, onboard, document | **Conservar**; compilarlas en su agente de fase (F1). `sdd-foundation` se rehace (Etapa 2) y `sdd-design` cambia su modelo de decisiones (Etapa 3) |
| Review v2 (6) | review-trust, -runtime, -evolution, -efficiency, -change, -correction | **Conservar** |
| Review v1 (4) | review-risk, -reliability, -resilience, -readability | **Retirar** tras migrar los linajes v1 (risk→trust, reliability/resilience→runtime, readability→evolution); compatibilidad de lectura durante una versión menor |
| Entrega (3) | branch-pr, chained-pr, work-unit-commits | **Conservar y cablear** por nombre en tasks, apply y el workload guard |
| Colaboración (4) | issue-creation, comment-writer, gh-release-notes, judgment-day | **Paquete opcional** (`--with-extras`); no se instalan por defecto |
| Comunicación (5) | caveman, caveman-commit, caveman-review, caveman-help, caveman-compress | **Fusionar** en una sola `caveman` con modos commit y review; eliminar `caveman-help`; `caveman-compress` al paquete opcional |
| Meta del harness (9) | skill-registry, skill-creator | **Conservar** |
| | harness-audit | **Mover** a skill local del repositorio (solo sirve para desarrollar ospec) y actualizarla |
| | agent-introspection | **Fusionar** en la recuperación del orquestador y en `ospec doctor` |
| | agent-harness-construction, ai-first-engineering | **Eliminar**: no aportan al usuario del harness (la segunda es un ensayo sin reglas accionables) |
| | agent-self-evaluation | **Eliminar**: la autoevaluación 1–5 contradice la regla de que un modelo no aprueba su propio trabajo y nada la consume |
| | ai-regression-testing | **Fusionar** su checklist de puntos ciegos en una referencia de `sdd-verify` |
| | token-budget-advisor | **Eliminar**: su descripción de 816 caracteres se carga siempre y su valor es marginal; retirar el dominio de spec con un change |
| Conocimiento (10) | api-design, hexagonal-architecture, design-system, accessibility | **Conservar como paquetes de conocimiento** activados por interfaz o atributo de calidad (API, estilo arquitectónico, UI, accesibilidad); corregir sus antipatrones (F2) |
| | cognitive-doc-design | **Conservar** (la consume `sdd-document`) |
| | architecture-decision-records (ECC) | **Reemplazar** por el modelo de decisiones propio (ADR de arquitectura, registro tecnológico y decisiones de change; Etapa 2) |
| | tdd-workflow (ECC) | **Eliminar**: duplica y contradice el Strict TDD del harness |
| | context7-mcp | **Eliminar**: el host ya ofrece documentación, la skill da por hecho nombres de herramientas y la consulta de fuentes externas se integra en explore y foundation |
| | backend-patterns, frontend-patterns | **Eliminar**: son genéricos de Node y React y solapan las skills de stack |
| Stack (24) | angular, dotnet, java, kafka, postgres, sqlserver, vite, starlight | **Conservar** |
| | go(+testing), python(+testing), react(+performance, +testing), springboot(+security, +tdd, +verification), kotlin(+coroutines, +exposed, +ktor, +testing) | **Consolidar** en una skill por stack con `references/` que se cargan bajo demanda (24 → 13); hoy kotlin solo ya agota el tope de 5 bloques |
| | webmcp | **Paquete opcional** |

**Resultado:** de 82 skills se pasa a **46 por defecto y 6 opcionales**; 30 se eliminan o se fusionan.

### 5.2 Cómo hacerlas funcionar y que sean *lazy*

| Mecanismo | Hoy | Propuesta |
| --- | --- | --- |
| Skill de fase | Ruta relativa, rota en consumidores | Compilada en el agente de fase en build, con su fragmento de `_shared` |
| Protocolo compartido | Dos ficheros de 24 KB leídos completos por cada fase | Trocear por sección y declarar en cada fase los fragmentos que necesita; el build los incrusta |
| *Compact rules* | Extracción heurística por encabezado | Sección explícita `## Reglas` (o `compact_rules:` en frontmatter), excluir antipatrones y "cuándo usar", y un test que lo garantice |
| Triggers | 14 skills de conocimiento con el nombre como único trigger | `Trigger:` obligatorio en la descripción (lint) |
| Skills de stack | Inyección por capacidad detectada (bien), pero fragmentadas | Una por stack con `references/` y, donde el host lo soporte, activación por ruta (`paths` en Claude, `applyTo` en Copilot y VS Code, `globs` con `alwaysApply: false` en Cursor) |
| Reglas *always-on* | Inyectadas en cada petición en 4 targets | Acotadas por ruta o por agente; presupuesto de bytes por target comprobado en CI |
| Subagentes de Claude | Reciben el `CLAUDE.md` del usuario | Valorar `omitClaudeMd: true` en agentes de fase (campo soportado en agentes de plugin) |

## 6. `AGENTS.md` y `CLAUDE.md` recomendados (punto 3)

Hoy `global-instructions/` es un directorio huérfano: ningún instalador lo usa (ya lo señalaba el análisis del 2026-08-22). El contenido es idéntico para ambos hosts, usa jerga del kernel (Candidate, attestation, successor) que un modelo sin el orquestador cargado no puede aplicar, y no dice **cuándo** ni **cómo** entrar en el flujo. Mientras tanto, Codex instala 63 KB en su lugar.

La propuesta, ya aplicada a `global-instructions/` en este corte, es un **router fino** (menos de 3 KB) con:

1. Cuándo usar ospec y cuándo no (trabajo ordinario directo).
2. Cómo entrar (comandos `/sdd-*` o lenguaje natural) y qué cargar: la skill o el agente orquestador, solo al entrar.
3. Dónde está el estado (`openspec/changes/*/state.yaml`) y la regla de recuperar desde disco.
4. Cuatro reglas que no dependen del orquestador: no fabricar estado, no atribuir a modelos, idioma del usuario y memoria opcional sin autoridad.
5. Variante por host: Claude carga la skill `ospec-workflow:sdd-orchestrator`; Codex, Copilot, Cursor, OpenCode, Antigravity y VS Code apuntan a su agente o modo orquestador.

La Etapa 0 del roadmap hace que `setup:<target>` instale este router (con marcadores y sin pisar contenido del usuario) y deje de instalar el orquestador completo como instrucciones globales. La fila de Codex del router (skill `sdd-orchestrator`) describe el estado posterior a E0.2: hasta entonces, `setup:codex` sigue instalando el orquestador completo como `AGENTS.md`.

## 7. Comparación con gentle-ai (punto 5)

### 7.1 Qué hace gentle-ai hoy

| Pieza | Descripción (fuente: README y `docs/usage.md`) |
| --- | --- |
| Engram | Memoria persistente entre sesiones; parte central de la propuesta |
| ODD | Flujo por defecto en cada petición: autorizar → explorar → resolver incertidumbre → clasificar → **un único documento** `odd/tasks/<feature>.md` con espejo en Engram → implementar por tareas con commits de unidad de trabajo → cerrar. Sin fases ni specs. Unas 400 líneas como heurística orientativa |
| RDD | Review sobre un candidato congelado; profundidad por riesgo (pasivo: 0 lentes; medio: 1; alto: 4R); como máximo una corrección acotada; la entrega la decide la persona |
| Binario determinista | `gentle-ai` lee el estado del disco y devuelve **la única transición válida**. Cuatro estados públicos: Working, Checking, Ready, Needs your decision. "La ceremonia que vivía en los prompts se movió al CLI" |
| Testing de agentes | Agentes reales con el razonamiento sustituido, en CI, sin claves ni coste |
| Plataforma | 17 integraciones, instalador TUI, `doctor`, backups antes de cada escritura, lista de rutas denegadas, CodeGraph, personas, Context7 opcional y asignación de modelos |
| Registry de skills | Índice con rutas exactas a `SKILL.md`; el subagente lee la skill completa |

**Lo que no tiene:** foundation de proyecto, descubrimiento funcional, contexto de equipo, escenarios de atributos de calidad, ADRs, selección tecnológica razonada ni specs de comportamiento. Las únicas menciones a ADR o atributos de calidad están en personas y auditorías internas.

### 7.2 Dónde está ospec

| Dimensión | ospec v2.81.0 | gentle-ai | Lectura |
| --- | --- | --- | --- |
| Conocimiento de producto y arquitectura | Foundation básica (9 preguntas lineales); diseño holístico R2 sin implementar | Ninguno | **Hueco de mercado**: es donde ospec puede ser claramente mejor |
| Contratos de comportamiento | Specs OpenSpec con deltas, baseline y reconcile | Ninguno | Ventaja de ospec |
| Decisiones | ADRs por change que en la práctica son decisiones de desarrollo (los 100+ de `docs/adr/` de este repo lo muestran) | Justificación breve en el documento de la feature | Ventaja potencial, hoy mal enfocada |
| Determinismo del siguiente paso | Librerías deterministas, pero el orquestador las describe en prosa (F4) | Binario que decide | gentle-ai por delante |
| Coste de contexto | 44–63 KB de orquestador más 23–26 KB *always-on* en 4 targets | 17–24 KB | gentle-ai por delante |
| Proporcionalidad | Rutas lite/standard/bugfix/hotfix y más preguntas de entrada | ODD orgánico por defecto | gentle-ai por delante en fricción |
| Verificación | Strict TDD con evidencia, verify independiente, review selectivo con linaje y archive transaccional | Strict TDD y RDD | Paridad, con ospec más profundo en verify |
| Memoria | Engram automático en 7 targets (v2.81.0) | Engram nativo | Paridad |
| Amplitud de hosts | 7 | 17 | gentle-ai por delante; ospec debe competir en profundidad por host, no en número |
| Corrección en consumidores | F1, F3 | — | Arreglo urgente |

### 7.3 ¿Es el roadmap actual lo bastante ambicioso?

Es ambicioso en **maquinaria de garantías** (K1–K12: CAS, permits, identidades, grafo, attestation, piloto Adaptive), pero **poco ambicioso en valor percibido**. Unas 20 k líneas de kernel no están cableadas al flujo de un usuario. Lo que el usuario nota (preguntas, conocimiento, coste, corrección) quedó en *lanes* subordinadas: R2 se diseñó en septiembre y no se implementó. Para superar a gentle-ai no hace falta otro kernel: hace falta **conocimiento de ingeniería de primera clase**, un **motor de estado determinista** que adelgace el orquestador y **corrección y coste competitivos**. Eso es lo que reordena el roadmap único.

## 8. Decisiones que este informe deja al usuario

| Decisión | Recomendación | Dónde se ejecuta |
| --- | --- | --- |
| Lista de skills a retirar o fusionar | La de §5.1 | Change `curate-skill-catalog` (E0.3), con gate de confirmación |
| Aparcar K10-delivery, K11, K12 longitudinal y CX3–CX6 | Aparcar con criterio de reapertura; conservar el código | Roadmap único, sección "Aparcado" |
| K9 con un solo profile (aprobado el 2026-10-03) | Reformular como receta Repair opt-in en la Etapa 4, después de corregir F1 (que afecta a cualquier medición con agentes reales) | E4.2 |
| Destino de los 100+ ADRs de desarrollo de este repo | Reclasificarlos como decisiones de change archivadas y generar unos 10 ADRs de arquitectura reales con el nuevo foundation | E2.6 (dogfooding) |
