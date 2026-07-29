# Roadmap general — kernel, grafo y evidencia

> **Autoridad:** única fuente operativa del backlog transversal.
> **Versión de referencia:** v2.35.0, 2026-07-29.
> **Arquitectura:** [`../architecture/harness-evolution.md`](../architecture/harness-evolution.md).
> **Investigación no normativa:** [`../architecture/research/harness-kernel-graph-evidence-roadmap-fusion.md`](../architecture/research/harness-kernel-graph-evidence-roadmap-fusion.md).
> **Regla de estado:** los hechos se contrastan con código/OpenSpec; este roadmap no cambia el estado de un change ni sustituye sus artefactos.

## Decisión y ruta crítica

La nueva ruta crítica es:

```text
O2B fixed baseline
  → K1 contracts/invariants
  → K2 lifecycle kernel
  → K3 candidate freeze
  → K4 Graph IR + Repair shadow
  → K5 budgets/failure/recovery
  → K6a isolation/capsule
  → K6b verifier/evidence
  → K6c adversarial challenges
  → K6d complexity delta
  → K7 reuse review lineage
  → K8 delivery receipt
  → K9 shadow/replay/A-B
  → K10-delivery productive enforcement
  → K10 routes/capabilities
  → K11a adapters
  → K11b model routing
  → K11c ownership/worktrees
  → K11d roles/parity
  → K12 headless/longitudinal
```

O2B permanece el gate inmediato. El change `fixed-policy-reference-baseline` está `blocked`: `sdd-apply` terminó `partial`; `sdd-verify` terminó `done` con verdict `FAIL` y `next_recommended: none`. La funcionalidad cumple 16/16 MUST y recovery ya preserva `quality_evidence`; el único CRITICAL es un `tasks-gap` de proveniencia Strict TDD RED histórica no autenticada. No se inicia K1 ni se cambia un default hasta que evidencia externa o una decisión humana explícita sobre policy/spec resuelva el bloqueo.

Las iniciativas anteriores no se descartan. O20A, O13A–C, O15, O18, O19A/B y R1 se rebasan sobre un kernel común; O7+O10 se convierte en capacidades; O9+O11 en invalidación/recompilación; O14 en routing por nodo; R4 consume el mismo Graph IR. O8 y O12 conservan shadow, compatibilidad y deprecación. Targets y R2 siguen subordinados a la estabilidad del core.

## Ruta rápida para ejecución

| Orden | Acción | Gate de salida |
| ---: | --- | --- |
| 1 | Completar O2B sin mezclar kernel nuevo | Verify no `FAIL`; baseline fixed reproducible según su spec |
| 2 | Ejecutar K1–K3 | Contracts, transitions y Candidate ID conformes |
| 3 | Ejecutar K4–K8 sobre Repair shadow, respetando K6a→K6d | Vertical end-to-end con receipt de evaluación |
| 4 | Ejecutar K9 | Calidad no inferior, replay y fallback fixed |
| 5 | Ejecutar K10-delivery | Pre-commit/pre-push/pre-PR validan receipts productivos |
| 6 | Expandir K10, K11a→K11d y K12 | Rutas/targets de uno en uno, luego headless/longitudinal |

## Estado ejecutivo

| Estado | ID | Resultado |
| --- | --- | --- |
| `done` | G0/G0.1 | Gobernanza y reconciliación documental |
| `done` | O2A | Infraestructura de benchmark y catálogo de nueve perfiles |
| `done` | O3 | Clarify condicional |
| `done` | O4+O5/O4.1 | Review selectivo/full 4R y linaje acotado |
| `done` | O4.2 | Recovery focal de evidencia Strict TDD |
| `done` | O6A | Archive híbrido transaccional |
| `blocked` | **O2B** | Funcionalmente conforme; verify `FAIL` por un único tasks-gap de proveniencia Strict TDD |
| `pending` | K1–K3 | Fundamentos del kernel y Candidate ID |
| `pending` | K4–K8 | MVP Repair proof-carrying; K6 se entrega en cuatro slices terminales |
| `pending` | K9 | Gate de promoción shadow/replay/A-B |
| `pending` | K10-delivery | Enforcement productivo de receipts |
| `pending` | K10–K12 | Expansión adaptativa, plataforma en cuatro slices y evaluación longitudinal |

No se modifica el estado de OpenSpec desde este documento. `blocked` refleja el top-level autoritativo; las fases y el bloqueo exacto se toman de `openspec/changes/fixed-policy-reference-baseline/state.yaml`.

## Reglas del programa

1. Cada iniciativa se implementa como change OpenSpec cohesivo.
2. O2B es gate antes de cambiar defaults o fixtures del control.
3. Cada slice introduce una sola autoridad; no se mantienen dos kernels equivalentes.
4. Toda policy nueva empieza en shadow.
5. Candidate freeze precede verify, review y receipts.
6. Ningún receipt se emite para un working tree mutable.
7. O4/O5, O4.2 y O6A se adaptan; no se reescriben.
8. Strict TDD no se retira antes de probar una estrategia equivalente por tipo de cambio.
9. Primero un target, una ruta y un fixture; la paridad se expande después.
10. Un change no mezcla core, cinco targets, roles y worktrees.
11. Ninguna optimización descarta señal, obligación, aprobación o evidencia material.
12. Target roadmaps no alteran prioridad transversal.
13. Cada failure tiene `execute`, `collect`, `decide` o `stop`.
14. Todo budget agotado termina; no reinicia un agente idéntico.
15. El roadmap registra propuesta y estado por separado; no inventa resultados.

Estados permitidos:

```text
pending · in-progress · blocked · done · superseded · rejected
```

## Dependencias

```text
Entregado:
G0/G0.1 ─ O2A ─ O3 ─ O4+O5/O4.1 ─ O4.2 ─ O6A
                                                  ↓
Activo:                                         O2B
                                                  ↓
Core:           K1 → K2 → K3 → K4 → K5
                                    ↓
              K6a → K6b → K6c → K6d → K7 → K8
                                                  ↓
Promoción:                                       K9
                                                  ↓
Delivery:                                  K10-delivery
                                                  ↓
Expansión:             K10 → K11a → K11b → K11c → K11d → K12
```

Lanes R2 y targets solo avanzan en paralelo si no cambian control plane, contract suite, Graph IR ni baseline.

## Bloque 0 — cerrar el control y preservar lo entregado

### G0/G0.1 — gobernanza documental — **done**

Entregado:

- arquitectura y roadmap activos;
- separación entre autoridad, targets y análisis;
- historial no normativo fuera de la ruta operativa.

La reconciliación de esta edición actualiza el corte a v2.35.0 y fusiona la dirección kernel/Graph/evidence. No reabre los changes entregados.

### O2A — infraestructura de benchmark — **done**

Entregado:

- catálogo canónico de nueve perfiles;
- smoke de tres perfiles;
- runner headless local;
- cache con identidad;
- scoring estructural y publicación fail-closed.

O2A no entregó baseline fixed 9/9 ni promoción adaptive.

### O3 — clarify condicional — **done**

Clarify es gate condicional posterior a spec. K4/K10 lo generalizarán como evento tipado con invalidación parcial; no se reimplementa como fase universal.

### O4+O5/O4.1 — review selectivo y linaje acotado — **done**

Entregado:

- generalista read-only primero;
- selección determinista;
- cero a dos especialistas en normal;
- full 4R para high-risk y overflow de tres o más dimensiones;
- findings y candidate/paths de génesis congelados;
- lenses one-shot;
- correction focal y límite de intentos;
- successor explícito.

K7 solo cambia su integración con Candidate ID/Graph/evidence universales.

### O4.2 — recovery focal de evidencia — **done**

Entregado:

- clasificación diferenciada de drift mecánico;
- identidad funcional estable;
- evidence-region repair acotado;
- recheck focal;
- fallback al routing ordinario ante delta material.

K5/K6b reutilizarán este patrón.

### O6A — archive híbrido transaccional — **done**

Entregado:

- plan semántico separado de la transacción;
- hashes, staging, inventario y comparación de bytes;
- commit/rename, rollback y recovery;
- receipt de archive.

K2/K8 compartirán primitives, sin sustituir este kernel.

<a id="o2b-baseline-fija-fixed-policy--pending"></a>

### O2B — baseline fixed-policy — **in-progress**

**Change activo:** `fixed-policy-reference-baseline`.

**Estado factual al corte:**

- top-level `status: blocked`;
- `sdd-apply: partial`;
- `sdd-verify: done`, verdict `FAIL`, `next_recommended: none`;
- 16/16 MUST, 67/67 tests focales y `npm test` pasan;
- recovery offline preserva `quality_evidence`;
- queda un único CRITICAL `tasks-gap`: no existe proveniencia autenticada de la cronología RED-before-GREEN histórica;
- la baseline live 9/9 sigue ausente como estaba previsto y esa ausencia no causa el `FAIL`.

#### Próxima acción

Resolver el gate bloqueante según `blocking_questions`: aportar snapshots/receipts autenticados o aprobar por separado un cambio de policy/spec que haga explícitamente no bloqueante la limitación histórica. No existe reroute automático ni se incorpora K1–K12 dentro de O2B.

#### Done criteria heredados

- baseline 9/9 versionada y reproducible;
- policy fixed, identidad/model/effort/provenance conocidos;
- publicación solo con 9/9 válidos;
- smoke 3/3 preservado;
- cero filas inventadas;
- recovery compatible;
- verify sin CRITICAL;
- lifecycle/review/archive completado conforme a su ruta.

#### Gate

Hasta `done`:

- fixed sigue siendo default;
- no se cambian fixtures de comparación;
- no se promueve O20A/kernel;
- no se retira Strict TDD;
- no se activa model routing dinámico.

## Bloque 1 — invariantes y contratos

### K1 — contract suite, vocabulario y clasificación — **pending**

**Absorbe/rebasa:** P0, P4, P19; O13A; O19A; foundations de O20A.

#### Alcance

- canon de autoridad y lifecycle;
- schemas versionados para state/transition, classification, contract, graph/node, work order/result, candidate, evidence, verification, finding/review, failure/recovery, receipt y event;
- clasificación por riesgo, incertidumbre y ejecución;
- hard floors explicables;
- aliases versionados para códigos actuales;
- ejemplos generados/validados.

#### Fuera de alcance

- ejecutar rutas adaptativas;
- cambiar fixed;
- elegir runtime nuevo;
- convertir Graph IR en autoridad independiente.

#### Done criteria

- todos los schemas tienen `$id`/versión y fixtures válidos/inválidos;
- CI rechaza incompatibilidades y fallback de autoridad a prosa;
- la misma clasificación produce fingerprint y reasons estables;
- migration rules preservan tags existentes;
- hard floors cubren migración, auth, API pública, Repair y Direct;
- documentos distinguen implemented/target/experimental.

#### Review path

Revisar primero autoridad/migración, después shapes, por último ejemplos y clasificación. Bloquea K2.

## Bloque 2 — kernel de lifecycle

### K2 — state machine, transitions, recovery y eventos — **pending**

**Absorbe/rebasa:** P1, P18, P25; O13B/O13C; parte de O19B; patrones O4.2/O6A.

#### Alcance

- operaciones `status`, `start/complete/fail/invalidate-node`, `recover`;
- `status → next_transition` determinista;
- `execute|collect|decide|stop`;
- reducer puro, idempotencia y reconciliación;
- event emission derivada;
- adapters hacia routing/review/archive existentes.

#### Done criteria

- mismo state digest → mismas transitions ordenadas;
- transición inválida falla cerrada con reason code;
- interruption/replay no duplica efectos;
- cada recovery anunciada tiene E2E de avance o terminal;
- eventos pueden reconstruirse desde state y no alteran decisiones;
- review/archive existentes pasan pruebas de no regresión;
- el orquestador deja de interpretar prosa para elegir una operación cubierta.

#### Gate

No compilar Graph IR hasta que state/recovery contracts sean estables.

## Bloque 3 — identidad universal

### K3 — Candidate ID y successor semantics — **pending**

**Absorbe/rebasa:** P9; identidad existente de O4/O5 y fingerprints de O6A.

#### Alcance

- canonicalización de paths;
- base tree, candidate tree, diff hash, paths digest;
- freeze antes de verify;
- successor ante cualquier byte distinto;
- adapters para lineage/archive.

#### Done criteria

- mismo tree produce mismo Candidate ID en plataformas soportadas;
- cambio de un byte produce ID distinto;
- dirty/untracked/symlink/case edge cases están cubiertos;
- verify/review/delivery rechazan identidad distinta;
- legacy review/archive conserva histories y no resetea lineage;
- ningún receipt puede apuntar solo a branch o working tree.

#### Gate

K3 bloquea receipts y la vertical Repair.

## Bloque 4 — MVP Repair proof-carrying

<a id="o20a-proof-carrying-verify-kernel--pending"></a>

### K4 — Graph IR y compiler Repair en shadow — **pending**

**Absorbe/rebasa:** P2, P6; O20A; O9+O11; bases de O7+O10 y R4.

#### Alcance

- Graph IR con nodos semánticos, dependencias, invariantes, ownership y evidence refs;
- compile de bug reproducible/localizado;
- work orders tipadas;
- clarify como evento;
- invalidación/recompilación de subgrafo;
- shadow contra el flujo fixed;
- un target inicial.

#### MVP

```text
compact contract
  → classify Repair
  → compile semantic graph
  → bounded worker
  → raw evidence
  → freeze Candidate ID
  → independent verify
  → finalize evidence/findings
  → bounded review if signaled
  → evaluation receipt
```

#### Fuera de alcance

- gobernar delivery real;
- cinco rutas;
- multi-worker;
- simplificar agentes;
- journal autoritativo;
- cambiar defaults.

#### Done criteria

- nodos microscópicos `read/edit/test` son rechazados por contract/lint;
- Graph ID es estable y está ligado al contract digest;
- clarify invalida solo descendants declarados;
- dependency desconocida impide reutilizar output;
- Work Order/Result v1 valida en conformance;
- fixed y shadow reciben inputs comparables;
- ninguna transición shadow muta el flujo vigente;
- replay no pierde obligaciones ni resucita nodos.

#### Gate

El resultado de O20A ya no decide entre dos stacks permanentes: decide **promover, revisar o rechazar** el kernel común. Rechazo conserva fixed; promoción sigue a K5, no cambia default.

## Bloque 5 — ejecución acotada y causal

### K5 — budgets, failures y recovery común — **pending**

**Absorbe/rebasa:** P7, P8, P18; O4.2; routing de verify.

#### Alcance

- budgets por node: turns, patches, commands, wall time, changed lines, paths;
- taxonomy causal;
- mapping de tags existentes;
- repair/replan/escalate/stop;
- no automatic reset.

#### Done criteria

- budget agotado nunca relanza worker idéntico;
- cada failure code tiene transition allowlisted;
- mixed failures respetan prioridad causal;
- repair limita node/paths/findings;
- zero-delta consume attempt cuando corresponde;
- environment/tool/external failures no se etiquetan como code defect;
- recovery E2E prueba avance o stop;
- métricas de consumo quedan fuera del state semántico.

## Bloque 6 — independencia y evidencia por slices

K6 no se ejecuta como un change transversal. Cada slice tiene output terminal y bloquea al siguiente.

<a id="k6--isolated-worker-independent-verifier-y-evidence-strategies--pending"></a>

### K6a — worker isolation y work-order capsule — **pending**

**Dependencias:** K4 + K5.

**Absorbe/rebasa:** P16 parcial; O18.

#### Alcance

- capsule mínima derivada de Graph dependencies;
- worker contract con objetivo, paths, budgets y raw evidence;
- workspace aislado para el target inicial;
- captura de base, diff, comandos, logs y exit codes.

#### Done criteria

- capsule fingerprint estable y sin artefactos no dependientes;
- worker no puede escribir fuera de `allowed_paths`;
- interruption conserva raw evidence y recovery ejecutable;
- integración usa patch/commit identificado, no conversación;
- fixture Repair completa ejecución aislada sin verificar ni aprobar;
- fallback explícito si el target no puede aislar.

**Gate terminal:** work result y workspace inventory conformes; K6b no empieza antes.

### K6b — verifier independiente y evidence strategies — **pending**

**Dependencias:** K6a + K3.

**Absorbe/rebasa:** P12/P16; O15; separación apply/verify vigente.

#### Alcance

- verifier consume contract, Graph IR, Candidate ID, repo y raw evidence;
- strategies bug/feature/refactor/migration/config-docs;
- evidence refs con origin, hash y node binding;
- fallback Strict TDD.

#### Done criteria

- narrativa del worker no es input de autoridad;
- cada strategy declara evidencia mínima y negative cases;
- evidencia fabricada/stale/foreign falla cerrada;
- cambio post-freeze crea successor;
- Strict TDD sigue disponible y por defecto;
- equivalence manifest queda listo para K9.

**Gate terminal:** verifier y strategy selector conformes; K6c no empieza antes.

### K6c — adversarial challenges — **pending**

**Dependencias:** K6b.

**Absorbe/rebasa:** P13.

#### Alcance

- revert challenge;
- mutation challenge focal;
- independent acceptance;
- test inspection.

#### Done criteria

- defects sembrados aplicables son detectados;
- test complaciente/tautológico se rechaza;
- challenges están ligados a Candidate ID/node/strategy;
- mutation budget es acotado y exhaustion produce transition;
- challenge no muta el candidato aprobado;
- fallos se clasifican causalmente.

**Gate terminal:** suite adversarial verde; K6d no empieza antes.

### K6d — complexity y architecture delta — **pending**

**Dependencias:** K6b; K6c para promotion evidence.

**Absorbe/rebasa:** P14/P15.

#### Alcance

- `architecture_delta` candidate-bound;
- contrato de alternativas `no-op|local|extend-pattern|new-abstraction`;
- preguntas/gate anti-overengineering.

#### Done criteria

- delta incluye módulos, interfaces, dependencies, config, states, compatibility, duplication y dead code;
- nueva abstracción justifica consumidor, variabilidad, opción simple y retirada;
- métricas son advisory y no sustituyen impacto/riesgo;
- fixtures de sobreingeniería disparan pregunta o finding;
- output queda disponible para review y K9;
- no se crean límites rígidos por líneas/archivos.

**Gate terminal:** complexity report reproducible; K7 puede integrar el conjunto K6.

### Gate de equivalencia de evidencia

No retirar universalidad de Strict TDD hasta que K6b/K6c/K9 demuestren que cada strategy:

- detecta defects equivalentes o adicionales;
- preserva RED/GREEN cuando es semánticamente requerido;
- rechaza evidencia fabricada;
- conserva fallback strict;
- supera A/B.

## Bloque 7 — review reusable

### K7 — integrar Candidate/Graph/evidence con lineage — **pending**

**Absorbe/rebasa:** P10/P11; O4+O5/O4.1.

#### Alcance

- Nivel 0: sin review de modelo solo para candidatos Direct mecánicos cuya validación determinista sea suficiente y sin señales materiales;
- Nivel 1: generalista read-only para cumplimiento, correctness, scope, evidencia, complejidad, regresiones y coherencia;
- Nivel 2: especialistas selectivos activados por riesgo/evidencia;
- adaptar inputs del selector y lineage;
- mapear especialistas a signals del classifier/Graph;
- incorporar `performance` y `compatibility-migration` como señales/lenses condicionadas, no reviewers permanentes;
- conservar one-shot/frozen findings/correction budgets;
- impedir rediscovery y reset.

#### Done criteria

- no se relanza generalist o lens ya ejecutada;
- Nivel 0 solo se selecciona cuando classifier y runtime prueban que no existe comportamiento/riesgo material y la validación determinista cubre el contrato;
- cualquier señal material escala al menos a Nivel 1;
- positive dimensions siguen sin descartarse;
- high-risk/overflow conserva full 4R;
- fixtures de performance y migration/compatibility activan sus lenses; ausencia de señal persiste razón de skip;
- esas dos lenses tienen contract, budget y evals antes de poder bloquear;
- finding IDs y attempts históricos sobreviven migración;
- correction solo toca paths/IDs autorizados;
- Candidate successor invalida receipt/review anterior sin reusar findings como aprobados;
- late observations quedan follow-up;
- tests de compatibilidad cubren lineages v1.

## Bloque 8 — entrega ligada a prueba

### K8 — delivery receipt de evaluación — **pending**

**Absorbe/rebasa:** P17, slice de evaluación; O15/O19B; primitives de O6A; R1 como consumidor futuro.

#### Alcance

- finalizar evidence/findings digests;
- receipt ligado a contract, graph, candidate, evidence y findings;
- outcome y `valid_for`;
- stale/foreign receipt checks;
- scope inicial `evaluation`.

#### Done criteria

- receipt de otro candidato, contrato o grafo se rechaza;
- mutar evidencia/findings invalida receipt;
- emisión solo ocurre tras verify/review requeridos;
- receipt no ejecuta reviewers;
- recovery de emisión es idempotente/reconciliable;
- archive receipt y delivery receipt mantienen scopes distintos;
- schema y conformance cubren tampering/corruption;
- no se habilita commit/push/PR todavía.

#### Gate

Extender `valid_for` requiere un change posterior con threat model y evidencia K9.

## Bloque 9 — promoción controlada

### K9 — shadow, replay, revert y A/B — **pending**

**Conserva/rebasa:** P13/P26 parcial; O8; O2B como control.

#### Policies

```text
fixed
kernel-shadow
kernel
```

`kernel-shadow` calcula decisiones y receipts de evaluación sin gobernar delivery.

#### Comparación

- mismos fixtures, harness, target, modelo/effort y budgets;
- obligaciones/verdict/findings;
- evidence/challenges;
- invocaciones/tokens/duración;
- preguntas, retries y recovery;
- complexity delta;
- divergencias y fallback.

#### Done criteria

- calidad no inferior;
- requisitos/evidencia/aprobaciones perdidos: 0;
- señales materiales descartadas: 0;
- replay determinista;
- stale receipts y invalid recoveries bloqueados;
- defectos sembrados detectados;
- fallback fixed/strict probado;
- coste y complejidad neta publicados;
- ninguna segunda fuente de verdad;
- decisión explícita: promote, revise o reject.

Promoción no activa cinco rutas ni targets; autoriza primero K10-delivery y después K10.

## Bloque 10 — enforcement productivo y rutas

### K10-delivery — validadores productivos de receipt — **pending**

**Dependencias:** K9 aprobado + K8 + K3.

**Absorbe/rebasa:** P17 productivo; O19B/R1.

#### Scope inicial

- `pre-commit`;
- `pre-push`;
- `pre-pr`.

#### Alcance

- threat model por hook/superficie;
- binding exacto a contract/graph/candidate/evidence/findings;
- expiry e invalidación por successor, cambios de policy/schema o evidence;
- replay protection y reconciliation;
- validadores headless fail-closed;
- degradación declarada por target.

#### Done criteria

- receipt de evaluación nunca autoriza delivery;
- stale, expired, replayed, foreign o byte-mismatched receipt bloquea;
- cada superficie valida `valid_for` exacto y no amplía scope;
- validator no relanza modelos/reviewers ni auto-aprueba;
- interruption/retry no duplica entrega;
- bypass requiere decisión humana persistida y auditable, nunca fallback silencioso;
- threat fixtures cubren tampering, rollback, rebase y successor;
- un target inicial demuestra pre-commit/pre-push/pre-PR antes de paridad.

**Gate terminal:** enforcement productivo aprobado; K10 puede expandir rutas sin dejar P17 en estado experimental.

### K10 — Direct/Repair/Bounded/Planned/Critical — **pending**

**Absorbe/rebasa:** P3–P6/P12; O7+O10; O9+O11; O12.

#### Alcance

- recetas de cinco rutas;
- capabilities semánticas;
- selector de evidence strategy;
- hard floors y clamps;
- compatibilidad con proposal/spec/design/tasks y aliases;
- materialización proporcional.

#### Done criteria

- Direct no persiste artifacts innecesarios;
- Repair conserva reproducción y Candidate-bound verify;
- Bounded conserva contract/decomposition/review;
- Planned cubre dependencies cross-module;
- Critical exige irreversible decision, failure/threat model, rollback, adversarial verify y specialists;
- capacidades omitidas tienen reason verificable;
- responsabilidades semánticas no desaparecen al combinar invocaciones;
- clarify recompila subgrafo, no workflow completo;
- aliases tienen deprecation y fallback;
- cada ruta supera fixtures propios y cross-route floors.

#### Gate de rollout

Activar una ruta cada vez, empezando Repair. Direct solo después de demostrar que el coste reducido no omite garantías.

## Bloque 11 — plataforma por slices

<a id="k11--adapters-roles-models-ownership-y-worktrees--pending"></a>

### K11a — capability manifests y adapters mínimos — **pending**

**Dependencias:** K10-delivery + K10.

**Absorbe/rebasa:** P20; O13D parcial.

#### Done criteria

- lifecycle no está duplicado por target;
- capabilities usan `enforced|partial|instructional|unavailable`;
- schema y conformance cubren degradaciones;
- un target nuevo no cambia Graph semantics;
- adapter inicial y fallback pasan fixtures;
- metadata reconoce cinco targets sin activarlos a la vez.

**Gate terminal:** un adapter consume el core sin policy propia; desbloquea K11b.

### K11b — model routing por work order — **pending**

**Dependencias:** K11a.

**Absorbe/rebasa:** P22; O14.

#### Done criteria

- requested/clamped/effective model y cause code son auditables;
- persistencia, hashes y routing no invocan modelos;
- failure history solo escala por causa tipada;
- unavailable model degrada o bloquea según policy;
- golden evals comparan tiers antes de cambiar defaults;
- configuración local sigue siendo respetada.

**Gate terminal:** routing estable en un target; desbloquea K11c.

### K11c — ownership, worktree scheduler e integración — **pending**

**Dependencias:** K11a + K6a; K11b solo si el scheduler selecciona modelo.

**Absorbe/rebasa:** P23/P24.

#### Done criteria

- overlap de paths/contract/state serializa o crea integration node;
- scheduler nunca asigna dos writers al mismo mutable state;
- worktree captura base/diff/commands/logs/exit codes/resources;
- integración usa patch/commit identificado;
- conflicto produce failure/recovery tipada;
- parallel fixture y conflict fixture son reproducibles.

**Gate terminal:** aislamiento e integración deterministas en un target; desbloquea K11d.

### K11d — consolidación de roles y paridad multi-target — **pending**

**Dependencias:** K11a–K11c.

**Absorbe/rebasa:** P21; O13D; lanes de targets.

#### Done criteria

- consolidar roles demuestra menor prompt drift y mantenimiento;
- ningún contrato de fase/work order se pierde;
- judge permanece condicional;
- paridad se valida target por target, no en un rollout conjunto;
- cada degradación tiene reason y fixture;
- aliases/agentes anteriores tienen deprecation y rollback.

**Gate terminal:** decisión explícita consolidate/revise/reject. Ocho roles no son una migración obligatoria sin evidencia.

## Bloque 12 — evaluación estructural y longitudinal

### K12 — headless, events y calidad longitudinal — **pending**

**Absorbe/rebasa:** P25–P27; R1; O16+O17 como vistas.

#### Headless fixtures obligatorios

1. bug pequeño;
2. feature contenida;
3. cross-module;
4. migración;
5. refactor;
6. security fix;
7. test complaciente;
8. sobreingeniería;
9. scope drift;
10. worker interrumpido;
11. receipt obsoleto;
12. recovery inválida;
13. conflicto entre agentes;
14. reanudación.

#### Longitudinal

Fixtures reciben 10–30 cambios consecutivos y miden:

- duplicación;
- interfaces/config/compatibilidad acumuladas;
- dead code y acoplamiento;
- tests frágiles;
- tiempo de modificación;
- regresiones;
- coste por candidato aprobado.

#### Done criteria

- driver ejecuta kernel real sin intervención;
- decisión humana pendiente devuelve `halt`, nunca auto-approve;
- assertions validan outputs estructurales;
- event schema cubre lifecycle y coste sin persistir razonamiento;
- replay/recovery/interruption tienen fixtures;
- dos repos longitudinales completan al menos 10 cambios cada uno;
- informes comparan fixed/kernel y versión del contract suite;
- vistas Markdown se derivan de evidencia y no cambian verdict;
- CI templates no requieren secretos en artifacts.

## Mapa completo: iniciativas antiguas → línea nueva

| Iniciativa | Estado heredado | Destino | Tratamiento |
| --- | --- | --- | --- |
| G0/G0.1 | done | Bloque 0 | Conservar gobernanza; actualizar corte |
| O2A | done | O2B/K9/K12 | Conservar runner y catálogo |
| O2B | in-progress | Gate inicial | Terminar antes del kernel |
| O3 | done | K4/K10 | Generalizar como evento |
| O4+O5/O4.1 | done | K7 | Reutilizar selector/lineage y extender niveles/lenses con gates |
| O4.2 | done | K5/K6b | Reutilizar recovery focal |
| O6A | done | K2/K8 | Reutilizar transacción/receipt primitives |
| O20A | pending | K1–K4 | Rebasar como vertical Repair shadow |
| O13A | pending | K1 | Clasificación multidimensional |
| O13B | pending | K2/K4 | Policy/compiler determinista |
| O13C | pending | K2 | Lifecycle kernel |
| O13D | pending | K10/K11a/K11d | Bridge de compatibilidad; no fin en sí |
| O19A | pending | K1 | Contract suite core |
| O7+O10 | pending | K10 | Fases → capacidades |
| O9+O11 | pending | K4/K10 | Invalidación y recompilación |
| O8 | pending | K9 | Conservar shadow/A-B |
| O12 | pending | K10 | Conservar compatibilidad/deprecación |
| O14 | pending | K11b | Model routing por nodo |
| O15 | pending | K6b/K8/K10-delivery | Evidence manifest, receipt y enforcement |
| O16+O17 | pending | K12 | Vistas derivadas |
| O18 | pending | K4/K6a | Work-order capsules |
| O19B | pending | K2/K8/K10-delivery/K12 | Validators completos |
| R1 | pending | K8/K10-delivery/K12 | Consumidor headless/receipt |
| R2 | pending | R2.1–R2.7 | Siete slices subordinados; no mezclar conocimiento y evidencia |
| R4 | pending | K4, después federación | Mismo Graph IR |
| Target roadmaps | activos/pending según host | K11a–K11d | Subordinados a core estable |

No queda ninguna iniciativa transversal anterior sin destino explícito.

## Cobertura operativa P0–P27

| Propuesta | Trabajo que la entrega | Gate principal |
| --- | --- | --- |
| P0 invariantes | K1 | conformance |
| P1 kernel | K2 | deterministic transitions |
| P2 Graph IR | K4 | Repair shadow/replay |
| P3 cinco rutas | K10 | rollout una a una |
| P4 clasificación | K1/K4 | hard floors |
| P5 capacidades | K10 | semantic responsibility coverage |
| P6 clarify evento | K4/K10 | partial invalidation |
| P7 budgets | K5 | no implicit reset |
| P8 failure routing | K5 | causal recovery |
| P9 candidate freeze | K3 | byte-level successor |
| P10 review niveles | K7 | Nivel 0 determinista; Nivel 1 generalista; Nivel 2 specialists con performance/compatibility conditional |
| P11 loops review | K7 | frozen lineage |
| P12 evidence strategies | K6b/K10 | Strict TDD equivalence |
| P13 challenges | K6c/K9 | seeded defects |
| P14 anti-overengineering | K6d | alternatives contract |
| P15 architecture delta | K6d/K12 | candidate-bound metrics |
| P16 independencia | K6a/K6b | worker/verifier boundary |
| P17 delivery receipt | K8 + K10-delivery | evaluation binding + productivo pre-commit/pre-push/pre-PR |
| P18 recovery | K2/K5 | E2E transition |
| P19 schemas | K1 | CI/version pinning |
| P20 adapters | K11a | core-owned lifecycle |
| P21 roles | K11d | measured equivalence |
| P22 model routing | K11b | node cause + target clamp |
| P23 ownership | K11c | overlap guard |
| P24 worktrees | K11c | isolated integration |
| P25 events | K2/K12 | non-authoritative telemetry |
| P26 headless | K12 | real harness, no auto-approve |
| P27 longitudinal | K12 | 10–30 sequential changes |

Cobertura del adjunto: 28/28 prioridades explícitamente programadas.

## Gates de promoción

### Gate A — O2B

- baseline fixed reproducible;
- verify sin CRITICAL;
- no synthetic rows;
- state/archive terminales.

### Gate B — kernel core

- schemas y migrations conformes;
- same state → same transition;
- Candidate ID universal;
- no segunda autoridad.

### Gate C — Repair MVP

- Graph/replay estable;
- independent verify;
- challenges detectan defects;
- receipt stale/foreign bloqueado;
- lineage/archive sin regresión.

### Gate D — adaptive

- calidad no inferior;
- cero obligaciones/evidencia/aprobaciones perdidas;
- cero señales materiales descartadas;
- fixed/strict fallback;
- coste/latencia/complexity publicados;
- target capability honesta.

### Gate E — delivery real

- threat model;
- `valid_for` explícito;
- no reviewer relaunch;
- Candidate/evidence/findings binding;
- invalidación, expiry y replay protection;
- recovery/reconciliation;
- pre-commit/pre-push/pre-PR fail-closed en el target inicial.

### Gate F — expansión multi-target

- un target estable;
- adapter mínimo;
- degradation semantics;
- fixtures de paridad;
- rollout secuencial.

## Review path del programa

Para cada change:

1. **Autoridad:** ¿crea una segunda verdad o concede lifecycle al modelo?
2. **Identidad:** ¿qué digest/candidate gobierna el output?
3. **Recovery:** ¿qué ocurre ante interrupción, stale state o budget agotado?
4. **Compatibilidad:** ¿qué artefacto/alias/lineage antiguo consume?
5. **Evidencia:** ¿cómo se prueba sin usar la narrativa del implementador?
6. **Costo:** ¿qué invocaciones, tokens, tiempo y complejidad añade?
7. **Portabilidad:** ¿qué target enforcea o degrada?
8. **Retirada:** ¿qué implementación anterior queda deprecada y cuándo?

Un reviewer no debe reconstruir estas respuestas desde el diff; cada change las expone en proposal/design/tasks y reports.

## Lanes subordinadas

### Targets

| Target | Trabajo permitido antes de K11a | Trabajo bloqueado |
| --- | --- | --- |
| Claude Code | Revalidación oficial y fixes independientes | Lifecycle/Graph variants propias |
| VS Code | Hooks/validators independientes | Kernel duplicado |
| Codex | Revalidar hooks/decision control | Evidence/receipt alternativo |
| GitHub Copilot | Investigar capacidades vigentes | Model routing propio |
| OpenCode | Migrar capabilities deprecadas | Worktree semantics propias |

Reglas:

- metadata reconoce cinco targets;
- revalidación oficial al abrir change;
- capability real, no aspiracional;
- adapter común primero;
- paridad con mismo input;
- ningún target cambia defaults globales.

### R2 — Foundation + OpenWiki

R2 sigue subordinado al core. Puede avanzar por slice solo si no toca lifecycle, Graph IR, Candidate/evidence authority ni defaults adaptive.

| Slice | Destino | Dependencia/gate | Done criteria |
| --- | --- | --- | --- |
| R2.1 | Reparto normativo | Puede iniciar tras K1 si solo referencia contracts | Autoridad de foundation/wiki/change delimitada; ninguna duplicación normativa |
| R2.2 | Consumo aguas abajo | R2.1 | Planner/verifier/documentación consumen referencias con staleness visible y sin convertir wiki en authority |
| R2.3 | Ingesta resiliente | R2.1 | Inputs corruptos/parciales fallan o degradan explícitamente; provenance y retry acotados |
| R2.4 | Foundation por etapas | R2.1 + gates humanos vigentes | Etapas reanudables, preguntas batcheadas y ningún scaffold/apply implícito |
| R2.5 | Adopción brownfield | R2.2–R2.4 | Reconcile/adopt preserva baseline y produce gaps trazables sin sobrescritura silenciosa |
| R2.6 | Staleness y refresh | R2.2/R2.3 | Fingerprint, owner y refresh policy; stale content nunca se presenta como actual |
| R2.7 | Starlight opcional | R2.2 + R2.6 | Vista reproducible y descartable; build web no modifica fuentes ni se vuelve requisito del core |

**Gate de promoción R2:** los siete slices conservan separación producto/conocimiento/evidencia, recovery comprobable y compatibilidad con repos sin OpenWiki. Un slice puede cerrarse individualmente; ninguno desbloquea defaults del kernel.

### R4 — epic/federation

Es posterior a K4/K8/K12 base:

1. subgraphs intra-repo;
2. contratos compartidos;
3. provider → consumers;
4. verify federado;
5. archive coordinado.

Cada child conserva clasificación, Candidate ID y receipt propios.

## Métricas por bloque

- transitions deterministas y contract failures;
- obligaciones/requisitos perdidos;
- Candidate/receipt mismatches;
- recoveries ejecutadas, fallidas y terminales;
- budgets agotados;
- invocaciones, tokens, tools, tiempo y coste;
- defectos antes/después de verify;
- challenges y mutantes detectados;
- findings/correcciones/retries;
- complexity delta;
- señales descartadas: objetivo 0;
- deprecations/compatibility paths activos;
- guarantees por target;
- deuda longitudinal.

## Riesgos y guardas

| Riesgo | Guarda |
| --- | --- |
| Segunda fuente de verdad | Reducer único, reconciliation y fail-closed |
| Perder O2B | Gate inicial y fixed intacto |
| Reescribir lineage/archive | Compat adapters y regression fixtures |
| Receipt sin freeze | K3 bloquea K8 |
| Agentes simplificados prematuramente | P21 queda en K11d tras work orders, scheduler y adapters estables |
| Cinco targets/rutas/worktrees simultáneos | Rollout uno a uno |
| Retirar Strict TDD sin equivalencia | Gates K6b/K6c/K9 |
| Dos sistemas permanentes | Gate de rebase O20/O13/O15/O18/O19/R1 |
| Graph IR burocrático | Nodos semánticos, lint y coste medido |
| Eventos como autoridad | Store separado y state-derived |
| Model escalation arbitraria | Cause code + clamp |
| Métricas como límites ciegos | Architecture delta advisory, riesgo por impacto |

## Gotchas vigentes

- `analisis-fino/` no es autoridad.
- O2B está `blocked`; `sdd-verify` terminó `done` con `FAIL` y no existe reroute automático.
- Clarify es condicional y evolucionará a evento, no fase universal.
- No relanzar reviewers tras congelar findings.
- No resetear lineages, budgets o attempts por retry/interrupción.
- No emitir receipt para working tree mutable.
- No finalizar evidencia antes de identificar qué Candidate ID fue verificado.
- No tratar Markdown libre como contract de autoridad.
- No activar routing dinámico de modelos antes de K9.
- No retirar fixed/aliases sin deprecación.
- No duplicar lifecycle en adapters.
- No mezclar R2 con evidence authority.
- No crear ruta rígida `epic`; R4 consume Graph IR.
- No atribuir modelos/herramientas en commits o PRs.

## Historial consolidado

- 2026-07-02/10: kernels iniciales, telemetría, integridad contractual, evals y target roadmaps.
- 2026-07-14/15: O2A y O3.
- 2026-07-17/18: G0/G0.1 y O4+O5.
- 2026-07-18/26: O4.1, O4.2 y O6A entregados; se formula O20A.
- 2026-07-28/29: O2B termina funcionalmente conforme, pero queda `blocked` por un único CRITICAL de proveniencia Strict TDD histórica.
- 2026-07-29: la visión P0–P27 se fusiona con el programa: O2B → K1–K12, preservando kernels entregados y fixed como control.
