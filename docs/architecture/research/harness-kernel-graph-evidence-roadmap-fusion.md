# Análisis de fusión: kernel, grafo y evidencia

> **Estatus:** investigación tracked no normativa; no define estado, prioridad ni autorización de implementación.
> **Corte:** repositorio v2.35.0 inspeccionado el 2026-07-29.
> **Origen:** promoción tracked del análisis exhaustivo conservado en `analisis-fino/`; la copia local ignorada no es autoridad.
> **Fuentes:** propuesta P0–P27 adjunta, arquitectura y roadmap activos, investigación `proof-carrying-change-compiler` y estado/verify del change O2B.
> **Autoridad vigente:** [`../harness-evolution.md`](../harness-evolution.md) para arquitectura y [`../../roadmaps/harness-evolution.md`](../../roadmaps/harness-evolution.md) para prioridad, estado y done criteria.

## Dictamen

La nueva propuesta debe gobernar la evolución, pero no justifica un reemplazo total. La mejor ruta es convertir el experimento proof-carrying y las iniciativas adaptativas existentes en una sola línea evolutiva: **contratos versionados → kernel determinista → identidad universal de candidato → Graph IR semántico → ejecución y evidencia acotadas → receipts → rutas adaptativas**.

El proyecto ya tiene kernels reutilizables que resuelven partes difíciles: clarify condicional, review selectivo con linaje inmutable, remediación focal de evidencia, archive transaccional, adapters multi-target, resolución de modelos, observabilidad y evals. Reescribirlos aumentaría riesgo sin aportar una hipótesis nueva. Deben generalizarse detrás de contratos comunes.

La transición empieza por resolver O2B. El change `fixed-policy-reference-baseline` está `blocked`; `sdd-apply` terminó `partial` y `sdd-verify` terminó `done` con verdict `FAIL` y `next_recommended: none`. La funcionalidad cumple 16/16 MUST y recovery ya preserva `quality_evidence`; queda un único CRITICAL `tasks-gap` porque la cronología RED histórica de Strict TDD no puede autenticarse con la evidencia disponible. Hasta resolver ese gate humano/político no se cambian defaults, no se promueve adaptive y no se reinterpreta su implementación.

## Ruta rápida de lectura

1. Revisar [invariantes](#invariantes-de-la-fusión) y [estado real](#hechos-del-estado-actual).
2. Validar la [matriz P0–P27](#matriz-completa-p0p27).
3. Revisar qué se [conserva, fusiona, reformula, retira o pospone](#matriz-de-tratamiento).
4. Aprobar o corregir la [secuencia recomendada](#secuencia-recomendada).
5. Resolver las [tensiones abiertas](#tensiones-y-decisiones-abiertas) mediante changes posteriores; este análisis no las decide por sí solo.

## Fuera de alcance

- Implementar el kernel, Graph IR, receipts o rutas.
- Modificar OpenSpec, el change O2B o sus findings.
- Promover una policy adaptive o retirar Strict TDD.
- Elegir un runtime único, una base de datos, firmas o un broker de efectos.
- Declarar resultados de benchmarks que todavía no existen.

## Hechos del estado actual

| Área | Hecho observado | Consecuencia para la fusión |
| --- | --- | --- |
| Versión | `package.json`, `.plugin.json`, `.claude-plugin/plugin.json` y `openspec/config.yaml` indican v2.35.0. | Se corrige el drift documental v2.30.0 sin inferir capacidades nuevas. |
| O2B | `state.yaml` registra top-level `status: blocked`, `sdd-apply: partial` y `sdd-verify: done` con `FAIL`/`next_recommended: none`. | O2B sigue abierto y `blocked`, sin transición automática; requiere evidencia externa autenticada o una decisión explícita sobre la policy/spec. |
| O2B, calidad | Recovery offline ya preserva `quality_evidence`; 16/16 MUST, 67/67 tests focales y `npm test` están verdes. Queda un único CRITICAL `tasks-gap`: la cronología RED histórica de Strict TDD no está autenticada. | No se puede declarar O2B entregado ni usarlo como baseline de promoción, aunque el comportamiento funcional esté conforme. |
| Clarify | O3 ya convierte clarify en gate condicional posterior a spec, gobernado por envelope. | Se conserva y se generaliza como evento que invalida dependencias concretas. |
| Review | O4+O5 y O4.1 entregan generalist-first, selección determinista, full 4R por overflow/high-risk y reasons persistidos. | P10 no parte de cero; se rebasa sobre el selector actual. |
| Linaje | O4+O5 congela candidate/paths/findings, limita lenses a una ejecución y usa `review-correction` focal. | P11 está sustancialmente cubierto dentro de review; debe reutilizarse como kernel de adjudicación. |
| Evidencia focal | O4.2 repara solo evidence regions con identidad funcional estable y recheck focal. | Es una semilla para recovery causal, no un sustituto del evidence selector universal. |
| Archive | O6A separa plan semántico de transacción mecánica, usa staging, hashes, inventario, recovery y receipt de archive. | Es el patrón de efectos recuperables; no debe reescribirse como un archive nuevo. |
| Multi-target | Existen cinco targets y generación/adapters compartidos. | P20 se implementa como manifest de capabilities y adapter mínimo, subordinado al core. |
| Modelos | `models.yaml`/model resolver ya resuelven agent → tier → target. | P22 extiende el eje de decisión a node/work order; no crea otro catálogo. |
| Evals | Hay runner headless local, catálogo de nueve perfiles, smoke y benchmark O2A. | P26/P27 amplían cobertura y longitudinalidad; O2B fija primero el control. |
| Apply/verify | Son agentes y contratos separados. | P16 endurece independencia por Candidate ID y evidence inputs, no inventa la separación. |
| O20A | La vertical proof-carrying de verify está pendiente y explícitamente en shadow. | Se convierte en primer slice del kernel/Graph IR, no en un sistema paralelo. |

## Invariantes de la fusión

1. El runtime determina estados, transiciones válidas, budgets, identidades y permisos; los modelos aportan semántica y juicio.
2. OpenSpec y Git siguen siendo la autoridad del change. Graph IR, journals y vistas son proyecciones versionadas o artefactos gobernados, nunca una segunda verdad.
3. `status` debe producir `next_transition` estructurada; ninguna operación de autoridad depende de interpretar prosa.
4. El grafo es un DAG por defecto; los ciclos requieren allowlist, causa, presupuesto y estado terminal.
5. La unidad del grafo es semántica. Leer, buscar, editar y ejecutar tests son operaciones internas del worker.
6. La ruta se decide por impacto e incertidumbre con hard floors, no por líneas o archivos como señal principal.
7. Los cambios pequeños permanecen pequeños: capacidades y materialización se activan solo cuando aportan una garantía requerida.
8. Ningún implementador aprueba su propio candidato; verifier y reviewer consumen una identidad congelada.
9. Tests verdes son evidencia, no verdict. La estrategia depende del tipo de cambio y puede requerir challenges.
10. Toda abstracción nueva justifica alternativa local, consumidores, variabilidad y plan de retirada/migración.
11. Todo bloqueo devuelve `execute`, `collect`, `decide` o `stop`, con una transición ejecutable o una escalada honesta.
12. Defaults solo cambian después de baseline O2B, shadow/A-B y gates de calidad no inferior.
13. Los kernels entregados de review, recovery focal y archive se reutilizan; no se reinician sus linajes ni transacciones.
14. Compatibilidad y deprecación son explícitas; no se mantienen dos sistemas equivalentes de forma permanente.

## Cadena de autoridad propuesta

```text
intención + contexto
  → clasificación explicable
  → contrato semántico versionado
  → Graph IR compilado
  → work orders acotadas
  → raw evidence
  → candidate tree congelado
  → verify independiente sobre Candidate ID
  → evidencia/findings finalizados
  → review acotado
  → delivery receipt ligado a todos los digests
  → entrega o recovery ejecutable
```

La corrección frente al MVP del adjunto es deliberada: el árbol candidato se congela **antes** de verify. El implementador puede producir evidencia bruta, pero el verifier trabaja sobre `candidate_id`; solo después se finalizan los digests de evidencia y findings que alimentan review y receipt.

## Matriz completa P0–P27

| ID | Propuesta | Estado actual reconocido | Gap real | Acción de fusión | Destino |
| --- | --- | --- | --- | --- | --- |
| P0 | Principios invariantes | Existen principios de autoridad, fail-closed, garantías y compatibilidad. | Falta canon de lifecycle, independencia, complejidad y recovery ejecutable con conformance tests. | **Fusionar** y ampliar invariantes; versionarlos y probarlos. | K1 |
| P1 | Kernel determinista | Hay reducers/validadores aislados para routing, review, archive y hooks. | No existe un kernel global `status → next_transition` ni una taxonomy común. | **Priorizar** kernel mínimo y componer kernels existentes. | K2 |
| P2 | Grafo compilado | Existen DAG de fases, tasks, O20A Change IR y R4 subchanges. | Falta Graph IR semántico único, work units tipadas e invalidación causal. | **Reformular** O20A/O7/O9/R4 sobre el mismo IR. | K4 |
| P3 | Rutas Direct/Repair/Bounded/Planned/Critical | Hay aliases/rutas declarativas y presets lite/standard/strict. | Se mezclan intención, topología y rigor; no hay cinco recetas compiladas. | **Introducir** como recetas, no como programas duplicados. | K10 |
| P4 | Clasificación multidimensional | O13A propone perfil con riesgo, depth y sources. | Faltan incertidumbre/ejecución independientes, hard floors y explicación causal de ruta. | **Rebasar** O13A como clasificación de impacto + incertidumbre. | K1/K4 |
| P5 | Fases como capacidades | O7+O10 propone `sdd-plan` parametrizado y responsabilidades separadas. | Sigue expresado como fase compuesta y variantes por fase. | **Reformular** planning como capacidades activadas por compiler. | K10 |
| P6 | Clarify como evento | O3 ya es gate condicional con contrato validado. | No invalida/recompila todavía solo el subgrafo dependiente. | **Conservar y generalizar** O3 a evento tipado. | K4/K10 |
| P7 | Loops locales con budgets | Hay budgets de review/corrección, 400-line guard y límites parciales. | Faltan budgets uniformes por nodo: turnos, tiempo, comandos, patches y paths. | **Crear** contrato común y terminales de agotamiento. | K5 |
| P8 | Failure routing causal | Verify ya enruta `spec/design/tasks/code`; O4.2 distingue evidence-format. | Taxonomy incompleta y recovery no común a todos los nodos. | **Generalizar** sin perder tags actuales. | K5 |
| P9 | Candidate freeze universal | Review lineage congela candidate/path identity; archive usa fingerprints. | Apply/verify/delivery no comparten aún un Candidate ID universal. | **Extraer** primitive común antes de Graph execution extensa. | K3 |
| P10 | Review por niveles/selectivo | O4+O5/O4.1 ya entrega generalista + especialistas selectivos/full 4R. | Falta Nivel 0 determinista, performance/compatibility-migration como señales/lenses explícitas, y calidad de descubrimiento (precision gate, criterios densos, refutación acotada de findings). | **Conservar y adaptar** a Nivel 0/1/2; añadir lenses condicionadas con gate/evals; absorber solo ventajas de prompt/protocolo anti-FP en K7 sin portar CLI/ledger ajeno. | K7 |
| P11 | Review loops acotados | Linaje acotado, findings estables, correction focal, successor explícito ya entregados. | Falta integrarlo con candidate universal y receipt de entrega. | **Reutilizar** como kernel probado. | K7/K8 |
| P12 | Estrategias de evidencia por tipo | Strict TDD y evidencia de fase existen; O4.2 valida representación. | Política demasiado universal y sin selector bug/feature/refactor/migration/docs. | **Reformular** Strict TDD como estrategia seleccionable solo tras equivalencia demostrada. | K6b/K10 |
| P13 | Revert/mutation/independent acceptance | Evals/mutation aparecen en O20A; verify es separado. | No son gates normales ni existe challenge manifest. | **Añadir** gradualmente sobre evidencia (Repair shadow); refutación de findings de review → K7, no aquí. | K6c/K7/K9 |
| P14 | Gate contra sobreingeniería | Review/readability y diseño pueden detectar complejidad. | No hay contrato de alternativas ni enforcement/medición estructurada. | **Añadir** design decision + verifier challenge. | K6d |
| P15 | `architecture_delta` | Hay métricas de diff/coste parciales. | No existe delta arquitectónico canónico ni preguntas derivadas. | **Añadir** medición advisory ligada al candidato. | K6d |
| P16 | Independencia implementador/verifier | Apply y verify ya son roles/fases separados. | Verify todavía puede depender de narrativa y working tree mutable. | **Endurecer** capsule/aislamiento en K6a y verifier por Candidate ID/raw evidence en K6b. | K6a/K6b |
| P17 | Delivery receipts | O6A emite receipt de archive y usa fingerprints. | No existe receipt de aprobación productivo para commit/push/PR sobre candidato exacto. | **Generalizar** con primitives propias (threat/bypass/live re-derive); no consumir proveedor de review externo. Evaluación → K8; productivo → K10-delivery tras K9. | K8/K10-delivery |
| P18 | Recovery ejecutable | O4.2 y O6A contienen recoveries concretas; routing SDD devuelve siguiente fase. | No hay shape universal execute/collect/decide/stop ni E2E de cada recovery. | **Fusionar** kernels y probar transiciones anunciadas. | K2/K5 |
| P19 | Suite completa de schemas | Hay envelopes JSON, schemas y validadores parciales; O19A/B lo planea. | Faltan schemas versionados de state/classification/contract/graph/node/evidence/failure/recovery/receipt. | **Rebasar** O19A/B como contract suite del kernel. | K1 |
| P20 | Adapter mínimo por target | Ya hay cinco targets, profiles y transforms. | Capabilities no gobiernan aún cada degradación del kernel/nodo. | **Conservar** adapters; hacerlos consumidores del canon. | K11a |
| P21 | Catálogo de roles simplificado | Agentes por fase y wrappers target funcionan. | Duplicación/drift potencial; simplificación prematura rompería contratos. | **Posponer** consolidación hasta estabilizar work orders/scheduler y medir equivalencia. | K11d |
| P22 | Model routing por nodo | `models.yaml` y model resolver ya dan routing estático agent/tier/target. | Falta decisión por nodo, causa de escalado y audit trail requested/clamped/effective. | **Extender** O14 sobre work order; no crear resolver paralelo. | K11b |
| P23 | Paralelismo seguro/ownership | Hay detección de colisiones y algunos mecanismos de coordinación. | Falta ownership de paths/contract/state a nivel de nodo e integration node. | **Añadir** scheduler después de Graph IR/worker isolation estables. | K11c |
| P24 | Worktrees/sandboxes | Targets ofrecen capacidades desiguales; no hay aislamiento universal. | Falta worker isolation, captura de base/diff/logs/recursos e integración identificada. | **Experimentar** por capability; no activar cinco targets a la vez. | K11c |
| P25 | Eventos y observabilidad | Telemetría por fase, hooks y O1 ya capturan hechos parciales. | No hay event schema común ni separación completa entre semántica y telemetría. | **Reformular** sobre transiciones del kernel; eventos no son autoridad. | K2/K12 |
| P26 | Evals headless | O2A ofrece runner y benchmark; R1 planea CI/headless. | Cobertura insuficiente de recovery, stale receipts, conflicts, interrupted workers y adversarial evidence. | **Extender** R1 como consumidor del kernel/receipts. | K12 |
| P27 | Calidad longitudinal | No aparece una suite 10–30 cambios como capacidad vigente. | Falta medir degradación acumulada, compatibilidad legacy y tiempo de modificación. | **Añadir** tras driver headless y core estable. | K12 |

Cobertura: 28/28 prioridades del adjunto tienen estado, gap, acción y destino explícitos.

## Matriz de tratamiento

| Tratamiento | Elementos | Razón |
| --- | --- | --- |
| **Conservar** | O2A/O2B; O3; O4+O5/O4.1; O4.2; O6A; O8; O12; adapters de cinco targets; `models.yaml`/resolver; separación apply/verify | Ya aportan contratos o infraestructura útiles. Se integran sin reabrir trabajo entregado. |
| **Fusionar/rebasar** | O20A + O13A–C + O15 + O18 + O19A/B + R1 | Son distintas vistas de un mismo kernel proof-carrying. Deben compartir schemas, state reducer, Graph IR, evidencia y receipts. |
| **Reformular** | O7+O10; O9+O11; O14; R4 | Planning pasa a capacidades; reevaluación pasa a invalidación/recompilación; model routing pasa a node/work order; epic/federation consume el mismo Graph IR. |
| **Retirar como dirección** | Variantes permanentes por fase; dos kernels paralelos; journal como segunda autoridad; Strict TDD universal una vez probada equivalencia; lifecycle duplicado por target | Contradicen el canon nuevo o perpetúan duplicidad. Su retirada requiere compatibilidad y evidencia, no borrado inmediato. |
| **Posponer** | Consolidar a ocho roles; worktrees universales; cinco rutas activas a la vez; todos los targets simultáneos; firmas/attestations; broker de efectos; runtime único; R2 como parte del core | Dependen de contratos estables o no tienen evidencia de beneficio suficiente. |

## Mapa de iniciativas vigentes a la nueva línea

| Iniciativa vigente | Nuevo papel | Cambio de alcance |
| --- | --- | --- |
| O2B | Gate K0 | Terminar baseline fixed antes de cualquier promoción. |
| O20A | Slice shadow K1–K4 | De “kernel de verify” aislado a primer vertical del kernel/Graph IR, todavía sin cambiar defaults. |
| O13A | K1 clasificación | Añade impacto, incertidumbre, execution signals y hard floors. |
| O13B | K2/K4 compiler policy | Se convierte en decisión determinista ruta/capacidades/grafo. |
| O13C | K2 lifecycle kernel | `invokePhase()` se rebasa como `status/transition/dispatch`, no como kernel paralelo. |
| O13D | K10/K11a/K11d compatibilidad | Wrappers son bridge temporal; contratos de rol pueden sustituirlos tras medición. |
| O19A/B | K1/K2/K8/K10-delivery contract suite | Un único conjunto de schemas, repair codes y validadores productivos. |
| O7+O10 | K10 capacidades | Proposal/spec/design/tasks conservan responsabilidades, pero dejan de ser pasos obligatorios. |
| O9+O11 | K4 invalidación | Reevaluar significa invalidar nodos afectados y recompilar el subgrafo. |
| O8 | K9 promoción | Shadow/A-B/replay/revert gobiernan cualquier cambio de default. |
| O12 | K10 compatibilidad | Aliases y artefactos actuales se mantienen durante migración/deprecación. |
| O14 | K11b model routing | Decisión por node/work order, con target clamp y cause code. |
| O15 | K6b/K8/K10-delivery evidence | Evidence manifest, finalization, binding y enforcement. |
| O16+O17 | Vistas | Renderers humanos derivados; nunca autoridad. |
| O18 | K4/K6a work-order capsules | Contexto mínimo compilado desde dependencias del Graph IR. |
| R1 | K8/K10-delivery/K12 consumidor headless | Valida receipt/readiness productivo y ejecuta evals; nunca auto-aprueba. |
| R2 | R2.1–R2.7 subordinados | Reparto normativo, consumo, ingesta, foundation, brownfield, staleness y Starlight sin invadir autoridad semántica. |
| R4 | K4 extensión de Graph IR | Subchanges/federación amplían el mismo grafo con contratos compartidos. |
| Target roadmaps | Lane subordinada | Adoptan kernel/capabilities solo después de estabilidad core y de forma escalonada. |

## Secuencia recomendada

| Orden | Bloque | Resultado verificable |
| ---: | --- | --- |
| 0 | Reconciliación y O2B | Documentos coinciden con state actual; el gate de proveniencia se resuelve por evidencia externa o decisión explícita, sin cambiar defaults. |
| 1 | Invariantes, vocabulario y schemas | Contract suite mínima validada en CI; shapes y autoridades no ambiguos. |
| 2 | Kernel mínimo | Misma state input produce mismas transiciones; recovery shape ejecutable y eventos derivados. |
| 3 | Candidate freeze universal | Tree/diff/paths/base generan Candidate ID estable; cualquier byte crea successor. |
| 4 | Graph IR + compiler Repair | Un bug localizado compila work units semánticas e invalida solo dependencias afectadas. |
| 5 | Budgets y failure routing | Agotamiento termina o escala; cada cause code selecciona recovery válida. |
| 6a | Worker isolation/capsule | Work result e inventario aislado conformes. |
| 6b | Verifier/evidence strategies | Verify consume Candidate ID y evidence refs autenticables. |
| 6c | Challenges adversariales | Revert/mutation/acceptance/test inspection detectan defects sembrados. |
| 6d | Complexity/architecture delta | Report candidate-bound y alternativas de abstracción reproducibles. |
| 7 | Review lineage reutilizado | O4/O5 consume candidate universal sin resetear findings, attempts ni lenses. |
| 8 | Delivery receipt de evaluación | Receipt une contract/graph/candidate/evidence/findings; stale receipt bloquea. |
| 9 | Shadow, replay, revert y A/B | Mismos fixtures/modelo/presupuesto comparan fixed vs kernel; default permanece fixed. |
| 10-delivery | Enforcement productivo | Pre-commit/pre-push/pre-PR validan scope, expiry, replay y binding exacto fail-closed. |
| 10 | Cinco rutas, capacidades y evidence strategies | Direct/Repair/Bounded/Planned/Critical se compilan con hard floors probados. |
| 11a–11d | Plataforma por slices | Adapters → model routing → ownership/worktrees → roles/paridad, cada uno con gate terminal. |
| 12 | Headless y longitudinal | Recovery, interruptions y receipts se evalúan sin UI; fixtures de 10–30 cambios miden degradación acumulada. |

## Slices anti-big-bang y review por niveles

| Slice | Dependencia | Resultado/gate terminal |
| --- | --- | --- |
| K6a | K4/K5 | Worker aislado + capsule; work result e inventario conformes |
| K6b | K6a/K3 | Verifier independiente + strategies; conformance y evidence binding |
| K6c | K6b | Challenges; defects sembrados detectados dentro de budget |
| K6d | K6b/K6c | Complexity/architecture delta reproducible y candidate-bound |
| K11a | K10-delivery/K10 | Capability manifest + adapter mínimo sin lifecycle propio |
| K11b | K11a | Model routing por work order con requested/clamped/effective/reason |
| K11c | K11a/K6a | Ownership/worktree scheduler e integración sin writers solapados |
| K11d | K11a–K11c | Consolidación de roles y paridad target por target, con decisión promote/revise/reject |

P10 se resuelve con:

- **Nivel 0:** sin review de modelo solo para Direct mecánico con validación determinista suficiente y cero señales materiales;
- **Nivel 1:** generalista read-only;
- **Nivel 2:** especialistas selectivos.

`performance` y `compatibility-migration` se incorporan como señales/lenses condicionadas. No se convierten en reviewers permanentes: requieren contract, budget y evals antes de bloquear, y persisten razón de skip cuando no hay señal.

P17 tiene dos entregas distintas: K8 emite receipts `evaluation`; tras K9, K10-delivery añade threat model, scope exacto, expiry/invalidation/replay y validadores fail-closed `pre-commit`, `pre-push` y `pre-pr`.

## MVP Repair en shadow

### Alcance

Un único perfil: bug reproducible y localizado, sin migración, auth, contrato público ni operación destructiva.

```text
compact contract
  → classify: Repair
  → compile semantic work units
  → bounded worker in isolated workspace
  → capture raw evidence
  → freeze candidate tree + Candidate ID
  → independent verify bound to Candidate ID
  → finalize evidence/findings digests
  → reuse bounded review when signaled
  → issue evaluation-only delivery receipt
```

### Contratos mínimos

- `change-contract.v1`
- `classification.v1`
- `graph.v1` y `node.v1`
- `work-order.v1` / `work-result.v1`
- `candidate.v1`
- `evidence.v1`
- `failure.v1` / `recovery.v1`
- `verification.v1`
- `finding.v1`
- `receipt.v1`

### Límites

- Shadow only; no gobierna commit, push o PR.
- `state.yaml`/OpenSpec/Git siguen siendo autoridad.
- Un único target inicial con capability declarada.
- Sin simplificación de agentes ni retirada de Strict TDD.
- Sin paralelismo multi-worker.
- Journal, si existe, es observacional y reconstruible.
- Review actual se invoca solo por selector vigente; no se relanzan lenses.

### Gate del MVP

Promover solo si:

- replay produce el mismo state/next transition;
- mutation/revert detectan el defecto sembrado;
- Candidate ID impide verificar o aprobar bytes distintos;
- recovery anunciada es ejecutable y avanza o termina honestamente;
- verdict y obligaciones no son inferiores al verify vigente;
- coste, latencia y complejidad se publican aunque sean peores;
- no aparece una segunda fuente de verdad;
- el mismo fixture puede volver al flujo fixed.

## Tensiones y decisiones abiertas

| Tensión | Decisión requerida | Opción conservadora |
| --- | --- | --- |
| OpenSpec/state vs Graph IR | ¿IR canónico derivado o artefacto gobernado dentro del change? | Derivado/fingerprinted al inicio; promoción de autoridad solo con ADR y conformance. |
| Fases vs capacidades | ¿Qué responsabilidades mínimas son siempre obligatorias? | Mantener responsabilidades semánticas y hacer opcional su materialización/dispatch. |
| Strict TDD vs evidence strategies | ¿Cuándo existe equivalencia suficiente para retirar obligatoriedad? | Conservar Strict TDD como default hasta A/B por tipo de cambio. |
| Freeze vs evidencia | ¿Qué se congela antes y después de verify? | Candidate tree antes; raw evidence referenciada; evidence/findings finales después. |
| Receipts | ¿Cómo pasar de evaluación a pre-commit/push/PR? | K8 queda evaluation-only; K10-delivery añade scope/threat model/expiry/replay/binding fail-closed después de K9. |
| Review por niveles | ¿Cuándo puede omitirse modelo y qué lenses faltan? | Nivel 0 solo Direct determinista; Nivel 1 generalista; Nivel 2 selectivo. Performance y compatibility-migration se añaden condicionadas tras contract/budget/evals. |
| Graph granularity | ¿Cómo evitar nodos microscópicos o monolíticos? | Nodos por objetivo/invariantes/paths/evidence; lint semántico y examples. |
| Journal/eventos | ¿Observación o autoridad? | Observacional, append-only, reconciliable desde state. |
| Runtime/lenguaje | ¿Node, Go o híbrido? | Reutilizar Node/CommonJS y Go donde ya existe paridad; decidir tras métricas. |
| Worktrees | ¿Obligatorios para toda work unit? | Requeridos solo para unidades significativas y targets capaces. |
| Roles | ¿Ocho roles sustituyen fases? | No tocar catálogo hasta que work-order contracts demuestren sustitución segura. |
| Complejidad delta | ¿Gate rígido o señal? | Advisory con preguntas obligatorias ante umbrales, nunca métrica única de calidad. |
| Targets | ¿Cuándo expandir? | Uno primero; luego paridad escalonada, nunca cinco simultáneos. |

## Riesgos de transición

| Riesgo | Señal temprana | Control |
| --- | --- | --- |
| Big bang | Changes que tocan kernel, cinco targets, roles y worktrees juntos. | Slices verticales; un target y Repair shadow primero. |
| Segunda fuente de verdad | State y Graph IR permiten transiciones distintas. | Reducer único, fingerprints y fail-closed ante divergencia. |
| Perder baseline O2B | Se cambian fixtures/policy mientras su gate de proveniencia está bloqueado. | Resolver O2B intacto antes de K1 y conservar fixed como control. |
| Reescribir lineage/archive | Se crean nuevos reviews/receipts sin consumir los existentes. | Adapters sobre reducers actuales y pruebas de compatibilidad. |
| Simplificar agentes antes de contratos | Roles genéricos empiezan a interpretar lifecycle. | Primero work-order schemas; después consolidación medible. |
| Receipt sin freeze | Receipt se liga a branch/working tree mutable. | Candidate ID obligatorio y stale check por bytes. |
| Retirar Strict TDD pronto | Evidence strategy acepta tests complacientes. | Equivalence gate con revert/mutation y independent acceptance. |
| Dual stack permanente | O13/O20 y kernel nuevo evolucionan en paralelo. | Gate explícito de rebase; deprecación con fecha/criterio. |
| IR burocrático | Más nodos que objetivos y gasto mayor que fixed. | Granularidad semántica y complexity/cost budget del propio harness. |
| Capability aspiracional | Target declara enforcement que no puede ejecutar. | Estados `enforced|partial|instructional|unavailable` probados. |
| Telemetría como semántica | Replay depende de métricas no canónicas. | Event store separado; state reducer no consume observabilidad opcional. |

## Criterios de éxito del programa

### Determinismo

- El mismo estado y contratos producen las mismas transiciones válidas.
- Todo reducer y schema tiene protocol conformance y fixtures incompatibles.
- Ningún fallback a prosa concede autoridad.

### Integridad

- Verify, review y delivery rechazan candidatos con identidad distinta.
- Cada receipt liga contract, graph, candidate, evidence y findings.
- Recovery, interruption y replay no resucitan nodos cerrados ni reinician budgets.

### Calidad

- Revert/mutation challenge detectan defects sembrados en los perfiles aplicables.
- Independent acceptance parte de contrato/invariantes, no de la narrativa del worker.
- `complexity_delta` produce preguntas justificadas y detecta fixtures de sobreingeniería.

### Eficiencia

- Direct y Repair reducen invocaciones o latencia sin perder garantías.
- No hay loops ilimitados; todo budget agotado termina en una transición explícita.
- El coste propio de compilar/validar el grafo se mide y compara con fixed.

### Migración

- O2B permanece reproducible como control.
- Fixed sigue disponible hasta superar A/B.
- O4/O5, O4.2 y O6A conservan sus invariantes y evidencia histórica.
- Los cinco targets declaran degradación real antes de adoptar el kernel.

### Evaluación

- Headless cubre al menos los 14 escenarios propuestos: bug, feature, cross-module, migración, refactor, security, test complaciente, sobreingeniería, scope drift, worker interrumpido, receipt obsoleto, recovery inválida, conflicto y reanudación.
- Longitudinal ejecuta 10–30 cambios consecutivos y mide deuda acumulada.
- Los resultados estructurales, no la calidad de la prosa, deciden promoción.

## Cobertura del adjunto

| Elemento del adjunto | Cobertura |
| --- | --- |
| Diez invariantes iniciales | [Invariantes](#invariantes-de-la-fusión), P0 |
| Operaciones y `status → next_transition` | P1, K2 |
| Graph IR y ejemplo de nodo semántico | P2, K4 |
| Cinco rutas | P3, K10 |
| Clasificación y hard floors | P4, K1/K4 |
| Capacidades | P5, K10 |
| Clarify/event/invalidation | P6, K4/K10 |
| Budgets y loops | P7, K5 |
| Failure taxonomy | P8, K5 |
| Candidate freeze | P9, K3 |
| Review levels y bounded lineage | P10–P11, K7 |
| Evidence strategies | P12, K6b/K10 |
| Revert, mutation, acceptance e inspection | P13, K6c/K9 |
| Anti-overengineering | P14, K6d |
| Architecture delta | P15, K6d |
| Verifier independiente | P16, K6a/K6b |
| Delivery receipts | P17, K8/K10-delivery |
| Recovery ejecutable | P18, K2/K5 |
| Schemas versionados | P19, K1 |
| Target adapters | P20, K11a |
| Roles simplificados | P21, K11d |
| Model routing | P22, K11b |
| Ownership/paralelismo | P23, K11c |
| Worktrees/sandboxes | P24, K11c |
| Eventos/métricas | P25, K2/K12 |
| Evals headless | P26, K12 |
| Calidad longitudinal | P27, K12 |
| Bloques A–E y top ten | [Secuencia recomendada](#secuencia-recomendada) |
| MVP | [MVP Repair en shadow](#mvp-repair-en-shadow), con freeze corregido |

La propuesta queda cubierta al 100% sin convertir este análisis en una especificación ni en una autorización de implementación.
