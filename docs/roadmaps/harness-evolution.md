# Roadmap general — kernel, grafo y evidencia

> **Autoridad:** única fuente operativa del backlog transversal.
> **Versión de referencia:** v2.56.5, 2026-08-31.
> **Arquitectura:** [`../architecture/harness-evolution.md`](../architecture/harness-evolution.md).
> **Investigación no normativa:** [`../architecture/research/harness-kernel-graph-evidence-roadmap-fusion.md`](../architecture/research/harness-kernel-graph-evidence-roadmap-fusion.md) (P0–P27). Proporcionalidad de proceso y Change Program: [`../architecture/research/proportional-process-and-change-program.md`](../architecture/research/proportional-process-and-change-program.md).
> **Regla de estado:** los hechos se contrastan con código/OpenSpec; este roadmap no cambia el estado de un change ni sustituye sus artefactos.

## Decisión y ruta crítica

La nueva ruta crítica es:

```text
O2B fixed baseline
  → K1 contracts/invariants
  → K2 lifecycle kernel
  → K2.1 Authority Store / permits / effect semantics
  → K2a Headless Conformance Host + real adapter
  → K3 candidate freeze + basic relation
  → K4a Execution Graph compiler + Obligation Manifest + replay
  → K5 budgets/failure/recovery
  → K6a isolation/capsule
  → K4b Repair shadow execution
  → K6b verifier/evidence + provenance
  → K6c policy-selected challenges
  → K6d complexity delta
  → K7 review authority (adapter + reducer)
  → K8 Candidate Evaluation Attestation
  → K9 shadow/replay/A-B
  → K10-delivery DeliveryAuthorization
  → K10 routes/capabilities
  → K11a multi-target adapter expansion
  → K11b model routing
  → K11c ownership/worktrees
  → K11d roles/parity
  → K12 corpus/longitudinal evaluation
```

La columna vertebral se conserva: lifecycle (+ **Authority Store** + **Minimal Kernel Harness** + model-based invariants) → host contract → identidad → **compilar grafo** (con Obligation Manifest) → budgets → aislamiento → **ejecutar shadow** → evidencia con provenance → review → attestation → shadow/A-B → delivery/routing → plataforma → **corpus/longitudinal**. K4 se parte en K4a/K4b; K2 adelanta runner headless mínimo y model-based testing; **K2.1** endurece CAS, permits y semántica de efectos antes de Work Orders/Candidate/Graph; K12 conserva evaluación estructural a escala. K2a adelanta Headless Conformance Host + un adapter real de referencia (uno de **seis** targets); la expansión a los **cinco** restantes permanece en K11a.

Este programa **no** sustituye el roadmap por un “OSPEC v3” paralelo. Los deltas K2.1–K12 refuerzan la dirección ya fijada (runtime-owned lifecycle, Execution ≠ Assurance, cuatro identidades, separación worker/verifier/reviewer/delivery, Attestation ≠ Authorization, invalidación selectiva, shadow/A-B antes de defaults, rollout por perfil/target, rutas como recetas). OpenSpec y Git siguen siendo la autoridad semántica; el kernel posee transiciones, permisos, budgets, digests y efectos mecánicos; los modelos no se aprueban ni se conceden permisos a sí mismos.

O2B cerró el gate inicial. K1, K2, K2.1, K2a, K2.1b, k2a-1, K3, `k3-readiness-remediation` y **K4a** (reconciliado formalmente en v2.45.7) conservan sus cierres verificados y archivados. Fixed continúa como control/default hasta que los gates posteriores autoricen otro cambio.

Las iniciativas anteriores no se descartan. O20A, O13A–C, O15, O18, O19A/B y R1 se rebasan sobre un kernel común; O7+O10 se convierte en capacidades; O9+O11 en invalidación/recompilación; O14 en routing por nodo; R4 consume el mismo Execution Graph. O8 y O12 conservan shadow, compatibilidad y deprecación. Targets y R2 siguen subordinados a la estabilidad del core.

## Ruta rápida para ejecución

| Orden | Acción | Gate de salida |
| ---: | --- | --- |
| 1 | Ejecutar K6d | Complexity/architecture delta reproducible |
| 2 | Ejecutar K7 → K8 | Review authority + Candidate Evaluation Attestation |
| 3 | Ejecutar K9 | Calidad no inferior, replay y fallback fixed (checkpoints intermedios ya emitidos) |
| 4 | Ejecutar K10-delivery | `DeliveryAuthorization` **solo** del profile promovido por K9; relación Candidate por etapas; resto fixed/deferred |
| 5 | Expandir K10, K11a→K11d y K12 | Rutas/targets de uno en uno, luego corpus/longitudinal (runner mínimo ya en K2) |

La lane CX es subordinada y no aparece en este diagrama crítico: CX0 puede avanzar en paralelo a K6d, sin cambiar que `K6d → K7 → K8 → K9 → K10-delivery → K10 → K11a–d → K12` gobierna la promoción del harness.

## Estado ejecutivo

| Estado | ID | Resultado |
| --- | --- | --- |
| `done` | G0/G0.1 | Gobernanza y reconciliación documental |
| `done` | O2A | Infraestructura de benchmark y catálogo de nueve perfiles |
| `done` | O3 | Clarify condicional |
| `done` | O4+O5/O4.1 | Review selectivo/full 4R y linaje acotado |
| `done` | O4.2 | Recovery focal de evidencia Strict TDD |
| `done` | O6A | Archive híbrido transaccional |
| `done` | **O2B** | Verify `PASS`, gate 4R `approved`, archivado y publicado en v2.36.0 |
| `done` | **K1** | Contract suite, vocabulario, clasificación, paridad; archivado y publicado en v2.37.0 |
| `done` | **K2** | Lifecycle + Minimal Kernel Harness + model-based invariants; archivado y publicado en v2.38.0 |
| `done` | **K2.1** | Authority Store (CAS), OperationPermit/Receipt y semántica de efectos; archivado y publicado en v2.39.0 |
| `done` | **K2a** | Headless Conformance Host + Claude adapter + CapabilityProof; archivado y publicado en v2.40.0 |
| `done` | **K2.1b** | Controlled issuer + atomic CAS consume/receipt (corrective pre-K3); archivado y publicado en v2.40.1 |
| `done` | **k2a-1** | Live capability probes + async transports (corrective pre-K3); verify PASS WITH WARNINGS + 4R approved; archive plan emitido |
| `done` | **K3** | Cuatro identidades + Candidate freeze + relación básica; archivado y publicado en v2.42.3 (baseline estable congelada) |
| `done` | **`k3-readiness-remediation`** | Relación/successor/dist packaging reconciliado; archivado y publicado |
| `done` | **K4a** | Graph compiler + Obligation Manifest + deterministic replay (sin worker autoritativo); verificado y reconciliado en v2.45.7 |
| `done` | **K5** | Budgets (incl. autoridad/efectos), failures y recovery; remediaciones v2.45.7→v2.45.13 (authoritative enforcement, authority boundary/CAS concurrency, reconciliación, remediación técnica del núcleo y blindaje de concurrencia); archivado y publicado en v2.45.13 |
| `done` | **K6a** | Worker isolation y work-order capsule; primitivas de ejecución aislada, integración con WorkerTransport, contención de filesystem y WorkResult canónico; archivado en v2.46.0, frontera de procesos cerrada en v2.47.1 y endurecida en v2.47.2 |
| `done` | **K4b** | Repair shadow execution (WO→WR→integrate→Candidate); despacho exclusivo K6a, integración estricta, cápsula mínima, base derivada y registro 1:N; remediación de invariantes en v2.48.2 y cierre mode-only/baseline en v2.48.3 (`2026-08-26-k4b-mode-only-and-baseline-projection`) |
| `done` | **K6b** | Verifier + provenance + Assurance Graph; persistencia durable de `runner-receipt/v1` en CAS `runner_receipts`, canal reemitido tras restart y bind de role en replay; archivado y publicado en v2.55.0 |
| `done` | **K6c** | ChallengePlan policy-selected; catálogo de 9 tipos, mutaciones focales y control de budget (v2.56.0); integridad canónica/fail-closed cerrada en v2.56.1 (`k6c-integrity-remediation`); strategy binding, missing_tests/no-op y planner reject en v2.56.2 (`k6c-failclosed-integrity`); enforcement monotónico de mutation_budget en v2.56.4 (`k6c-budget-execution-failclosed`); restauración canónica de spec sin corrupción, validación fail-closed de integridad de archive y confinamiento estricto de runner sandboxed en v2.56.5 (`k6c-spec-integrity-and-runner-seam-remediation`) |
| `next-eligible` | **K6d** | Complexity delta; desbloqueado tras archive de `k6c-spec-integrity-and-runner-seam-remediation` |
| `pending` | K7–K8 | Review authority, **Evaluation Attestation** |
| `pending` | K9 | Gate de promoción shadow/replay/A-B (checkpoints intermedios ya validados) |
| `pending` | K10-delivery | `DeliveryAuthorization` **acotada al profile K9**; relación Candidate por etapas; fixed/deferred para el resto |
| `pending` | K10–K12 | Expansión adaptativa; K11a = multi-target; K12 = corpus/longitudinal (no el primer runner) |

No se modifica el estado de OpenSpec desde este documento. El cierre de O2B se toma de `openspec/changes/archive/2026-07-31-fixed-policy-reference-baseline/`; el de K1, de `openspec/changes/archive/2026-08-03-k1-contract-suite/` y v2.37.0; el de K2, de `openspec/changes/archive/2026-08-04-k2-lifecycle-kernel/` y v2.38.0; el de K2.1, de `openspec/changes/archive/2026-08-04-k2-1-authority-store-permits/` y v2.39.0; el de K2a, de `openspec/changes/archive/2026-08-04-k2a-headless-conformance-host/` y v2.40.0.

## Reglas del programa

1. Cada iniciativa se implementa como change OpenSpec cohesivo.
2. O2B es la baseline de control entregada; cualquier cambio de defaults o fixtures requiere los gates posteriores aplicables.
3. Cada slice introduce una sola autoridad; no se mantienen dos kernels equivalentes.
4. Toda policy nueva empieza en shadow.
5. Candidate freeze precede verify, review y attestations; `WorkResult ≠ Candidate ≠ EvaluationAttestation ≠ DeliveryAuthorization`.
6. Ninguna Evaluation Attestation se emite para un working tree mutable ni para un `WorkResult` no integrado.
7. Toda Evaluation Attestation liga un `PolicySnapshot` verificable; el mismo candidate puede aprobarse bajo una policy y rechazarse bajo otra.
8. El Assurance Graph es proyección content-addressed derivada; nunca autoridad ni “demostración formal”. Successor invalida aprobación/attestation y solo reejecuta el closure afectado.
9. O4/O5, O4.2 y O6A se adaptan; no se reescriben.
10. Strict TDD no se retira antes de probar una estrategia equivalente por tipo de cambio.
11. Primero un target, una ruta y un fixture; la paridad se expande después.
12. Un change no mezcla core, seis targets, roles y worktrees.
13. Ninguna optimización descarta señal, obligación, aprobación o evidencia material.
14. Target roadmaps no alteran prioridad transversal.
15. Cada failure tiene `execute`, `collect`, `decide` o `stop`.
16. Todo budget agotado termina; no reinicia un agente idéntico.
17. El roadmap registra propuesta y estado por separado; no inventa resultados.
18. Un slice solo merece identidad propia cuando introduce una autoridad, frontera de dependencia, primitive reusable o gate terminal distinto.
19. Ante diferencias de **orden o estado** con la arquitectura, prevalece este roadmap. Ante diferencias **conceptuales**, reconciliar antes de iniciar el slice.

Estados permitidos:

```text
pending · in-progress · blocked · done · superseded · rejected
```

`next-eligible` es una **etiqueta operativa** sobre `pending` (desbloqueado, sin change OpenSpec abierto). No es un estado OpenSpec distinto; no usar `in-progress` hasta crear el change.

## Glosario operativo (nombres = arquitectura)

### Dos grafos

| Nombre | Antes | Qué representa |
| --- | --- | --- |
| **Execution Graph** | Graph IR | Qué trabajo debe ejecutarse: nodos, dependencias, ownership, budgets, invariantes, Work Orders, invalidación/recompilación |
| **Assurance Graph** | Proof Graph | Por qué un resultado puede considerarse fiable (evidencia empírica/probabilística incluida): requirement → candidate → evidence → verification → challenge → finding → attestation → authorization |

```text
Change Contract
      │
      ▼
Execution Graph
      │ produces
      ▼
Candidate
      │ evaluated through
      ▼
Assurance Graph
      │ supports
      ▼
Attestation / Authorization
```

Schemas legacy (`graph-node/v1`, etc.) son el shape técnico del Execution Graph.

### Taxonomía de artefactos de cierre

| Artefacto | Qué demuestra | Qué autoriza |
| --- | --- | --- |
| `ArchiveTransactionReceipt` | La transacción de archive se completó sobre unos inputs determinados | Nada fuera del archive |
| `CandidateEvaluationAttestation` | Un candidate pasó una policy de evaluación concreta | Nada de delivery |
| `DeliveryAuthorization` | Un candidate exacto puede cruzar unos gates concretos | `pre-commit`, `pre-push`, `pre-pr`, etc. |

```text
Receipt       → registra una operación completada  (ArchiveTransactionReceipt; O6A)
Attestation   → declara una evaluación             (CandidateEvaluationAttestation; K8)
Authorization → concede una capacidad              (DeliveryAuthorization; K10-delivery)
```

**Nunca** llamar «Delivery Authorization Receipt» a la authorization: Receipt ≠ Authorization.

Taxonomía normativa **antes de K8**. No exige migrar bytes históricos de O6A de inmediato; sí deja de llamar “delivery receipt” a una attestation.

#### Compatibilidad `receipt/v1` (K1) — no reabrir

```text
schemas/kernel/receipt/v1
  = envelope legacy/genérico entregado por K1
  = exige candidate_id y kind genérico
  = no define la taxonomía semántica futura
  = permanece intacto por compatibilidad; no se muta en este corte

schemas/kernel/candidate-evaluation-attestation/v1
  = schema propio de K8

schemas/kernel/delivery-authorization/v1
  = schema propio de K10-delivery
```

Campo canónico de binding al candidato: **`candidate_id`** (no `candidate_digest`). Tanto `candidate/v1` como `receipt/v1` usan `candidate_id`; K8/K10-delivery heredan ese nombre.

## Dependencias

```text
Entregado:
G0/G0.1 ─ O2A ─ O3 ─ O4+O5/O4.1 ─ O4.2 ─ O6A ─ O2B → K1 → K2 → K2.1 → K2a → K3 → K4a → K5 → K6a → K4b
                                                                                                      ↓
Done:                                                                                                K6b → K6c
                                                                                                      ↓
Next-eligible:                                                                                       K6d
                                                                                                      ↓
Pending:     K7 → K8
                                                                   ↓
Promoción:                                                       K9
                                                                   ↓
Delivery:                                                   K10-delivery
                                                            (DeliveryAuthorization)
                                                                  ↓
Expansión:                          K10 → K11a → K11b → K11c → K11d → K12
```

K2.1 fija Authority Store (CAS), permits y effect semantics antes de identidades/Graph. K2a selecciona **un** host de referencia entre los seis targets (Headless Conformance Host + adapter real); K11a expande el mismo contrato a los **cinco** restantes. K4a compila/valida/replay **antes** de ejecutar (incluye Obligation Manifest); K4b ejecuta shadow solo tras K5+K6a.
Lanes R2 y targets solo avanzan en paralelo si no cambian control plane, contract suite, Execution Graph ni baseline.

## Bloque 0 — cerrar el control y preservar lo entregado

### G0/G0.1 — gobernanza documental — **done**

Entregado:

- arquitectura y roadmap activos;
- separación entre autoridad, targets y análisis;
- historial no normativo fuera de la ruta operativa.

La reconciliación vigente fija el corte post-k2a-1 (K1+K2+K2.1+K2a+K2.1b+k2a-1 `done`; K3 next-eligible) y conserva la dirección kernel/Execution Graph/Assurance Graph. No reabre los changes entregados.

### O2A — infraestructura de benchmark — **done**

Entregado:

- catálogo canónico de nueve perfiles;
- smoke de tres perfiles;
- runner headless local;
- cache con identidad;
- scoring estructural y publicación fail-closed.

O2A no entregó baseline fixed 9/9 ni promoción adaptive.

### O3 — clarify condicional — **done**

Clarify es gate condicional posterior a spec. K4a/K10 lo generalizarán como evento tipado con invalidación parcial; no se reimplementa como fase universal.

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
- **`ArchiveTransactionReceipt`** (históricamente llamado “archive receipt”; taxonomía normativa: Receipt de operación completada, no attestation ni delivery auth).

K2/K8 compartirán primitives de identidad/validación, sin sustituir este kernel ni confundir kinds.

<a id="o2b-baseline-fija-fixed-policy--done"></a>
<!-- legacy alias: research docs may still link the pending id -->
<a id="o2b-baseline-fija-fixed-policy--pending"></a>

### O2B — baseline fixed-policy — **done**

**Change archivado:** `openspec/changes/archive/2026-07-31-fixed-policy-reference-baseline/`.

**Estado factual al corte:**

- verify `PASS` para 16/16 escenarios MUST;
- replay limpio Strict TDD con 17/17 ciclos live y receipts RED/GREEN autenticados;
- 67/67 tests focales y 1537/1537 en `npm test`;
- gate 4R `approved`, con lineage terminal aprobado;
- archive completado el 2026-07-31;
- entrega publicada en v2.36.0;
- fixed permanece como baseline de control y default.

#### Resultado entregado

- baseline 9/9 versionada y reproducible;
- policy fixed, identidad/model/effort/provenance conocidos;
- publicación solo con 9/9 válidos;
- smoke 3/3 preservado;
- cero filas inventadas;
- recovery compatible;
- verify sin CRITICAL;
- lifecycle/review/archive completado conforme a su ruta.

#### Gate

Gate cerrado: K1 puede iniciar. El cierre de O2B no cambia por sí mismo defaults, fixtures de comparación, Strict TDD ni model routing; esas decisiones siguen sujetas a K1–K12 y a sus gates.

## Bloque 1 — invariantes y contratos

### K1 — contract suite, vocabulario y clasificación — **done**

**Absorbe/rebasa:** P0, P4, P19; O13A; O19A; foundations de O20A.

**Dependencia:** O2B completado. **Desbloquea:** K2.

**Cierre:** change `k1-contract-suite` con verify `PASS`, 4R `approved` (CRITICAL remediados), archive `2026-08-03-k1-contract-suite`, publicado en v2.37.0. Iniciativa terminal: `done`. K2 queda **next-eligible**.

#### Alcance

- canon de autoridad y lifecycle;
- schemas versionados para state/transition, classification, contract, graph/node, work order/result, candidate, evidence, verification, finding/review, failure/recovery, receipt y event;
- clasificación por riesgo, incertidumbre y ejecución con fingerprint y `reasons` estables;
- hard floors explicables por evidencia de impacto (no por tamaño de diff);
- shape de `next_transition` con `kind`, `operation`, `arguments[].token` y `command` cuando `kind=execute`;
- paridad material entre proyección humana y envelope negociado (código, causa, siguiente acción);
- aliases versionados para códigos actuales;
- ejemplos generados/validados; CI rechaza docs/contratos que nombren campo o comando no emitido por código.

#### Fuera de alcance

- ejecutar rutas adaptativas;
- cambiar fixed;
- elegir runtime nuevo;
- convertir Execution Graph en autoridad independiente;
- implementar el reducer/runtime de lifecycle (K2).

#### Done criteria

- todos los schemas tienen `$id`/versión y fixtures válidos/inválidos;
- `graph-node/v1` expresa objetivo/operation, dependencias, ownership, invariantes, paths, evidence refs y budget ref sin activar Execution Graph;
- `work-order/v1` expresa la capsule declarativa (operation/objetivo, dependencias, ownership, invariantes, paths, evidencia requerida y budget) sin ejecutar workers;
- `receipt/v1` / attestation shapes ligan outcomes canónicos a contract, graph, candidate, evidence y findings, preservando una ruta v1 legacy explícita; el binding de **policy** y el nombre **Evaluation Attestation** (≠ Delivery Authorization) se completan en K8;
- CI rechaza incompatibilidades y fallback de autoridad a prosa;
- la misma clasificación produce fingerprint y reasons estables;
- hard floors no se degradan por LOC/archivo; cubren migración, auth, API pública, Repair y Direct;
- `execute` exige `command` + tokens; `collect` no inventa comando sobre artefacto inexistente;
- fixtures de paridad prueban que la proyección humana y el envelope negociado recuperan los mismos discriminantes;
- migration rules preservan tags existentes;
- documentos distinguen implemented/target/experimental;
- el test focal de fixtures y la conformance K1 completa están verdes.

#### Alcance P0 sin reducción silenciosa

K1 entrega la **materialización declarativa** de las 15 invariantes P0: `state-transition`/`failure-recovery` (continuaciones y recovery), `classification` (proporcionalidad/hard floors), `contract` + canon (autoridad persistida), `graph-node` (DAG semántico), `work-order` + `candidate` (independencia e identidad), `evidence` + `verification` + `finding-review` + `receipt` (evidence ≠ verdict y binding), `event` (observabilidad no autoritativa), aliases/pinning (compatibilidad) y fixtures de paridad/fail-closed.

No entrega todavía el enforcement runtime correspondiente: reducer/replay/paridad E2E + Minimal Kernel Harness + model-based testing (K2), Authority Store/permits/effects (K2.1), Headless Conformance Host + adapter real (K2a), freeze universal (K3), Graph compiler/Obligation Manifest/replay (K4a), budgets/recovery (K5), aislamiento (K6a), shadow execution (K4b), verificación/provenance/challenges/complexity (K6b–K6d), review authority (K7), Candidate Evaluation Attestation (K8), promoción/fallback (K9), Delivery Authorization + rutas (K10), expansión multi-target/model routing/ownership/worktrees/roles (K11) ni corpus/evaluación longitudinal (K12). Esos slices siguen siendo obligatorios; los schemas K1 no los sustituyen.

#### Review path

Revisar primero autoridad/migración, después shapes, por último ejemplos y clasificación. Gate cumplido: desbloqueó K2.

## Bloque 2 — kernel de lifecycle

### K2 — state machine, transitions, recovery, eventos, Minimal Kernel Harness y model-based testing — **done**

**Absorbe/rebasa:** P1, P18, P25 (emisión); P26 (runner mínimo); O13B/O13C; parte de O19B; patrones O4.2/O6A.

**Dependencia:** K1 `done`. **Cierre:** change `k2-lifecycle-kernel` con verify `PASS`, 4R `approved` (CRITICAL remediados; WARNING follow-up), archive `2026-08-04-k2-lifecycle-kernel`, publicado en v2.38.0. Iniciativa terminal: `done`. K2.1 quedó **next-eligible** y posteriormente se cerró en v2.39.0.

**Motivación:** sin un runner headless temprano, K2 acaba probado solo con unidades aisladas y no como protocolo ejecutable. El corpus amplio y la evaluación longitudinal permanecen en K12. El model-based testing comprueba invariantes sobre un espacio de transiciones pequeño; TLA+ no es requisito de entrega de K2.

#### Alcance — lifecycle

- operaciones `status`, `start/complete/fail/invalidate-node`, `recover`;
- `status → next_transition` determinista;
- `execute|collect|decide|stop` con tokens/argv y `command` cuando aplique;
- invariante: un mensaje solo nombra un comando si ejecutarlo resuelve el bloqueo;
- reducer puro, idempotencia y reconciliación;
- event emission derivada;
- adapters hacia routing/review/archive existentes.

#### Alcance — Minimal Kernel Harness

Runner headless mínimo del protocolo (no el corpus K12):

- ejecutar reducers;
- aplicar comandos (`execute`/`recover` nombrados);
- simular interruption;
- reproducir transitions;
- verificar idempotencia;
- comprobar recoveries (avance o terminal);
- generar snapshots de state/digest.

#### Alcance — model-based testing

Cadena obligatoria sobre un **modelo reducido** del lifecycle (espacio acotado, exhaustivo o casi-exhaustivo):

```text
reduced lifecycle model
  → generate/explore transitions
  → check invariants
```

**No fingir enforcement** de superficies que aún no existen. Las invariantes se parten por madurez:

##### Ejecutables en K2 (enforcement real)

1. Same state → same ordered transitions.
2. Invalid transitions fail closed.
3. Replay does not duplicate effects.
4. Named recovery advances or terminates.
5. Models cannot directly mutate lifecycle state.
6. Terminal exhaustion cannot restart the same operation implicitly.
7. Events do not alter authoritative state.
8. A terminal state has no non-recovery execution transition.

##### Abstractas con puertos opacos (modelo, sin inventar Candidate/delivery)

Puertos: `SubjectId`, `AuthorityToken`, `BudgetRef`, `PolicyRef`.

Ejemplo:

```text
When the authoritative subject changes,
previous subject-bound decisions become stale.
```

K2 no necesita saber qué contiene un `CandidateId`; solo que un sujeto opaco cambió.

##### Diferidas (vocabulario reservado; enforcement en el slice dueño)

| Invariante | Primer enforcement |
| --- | --- |
| Candidate mutation invalidates verification | K3/K6b |
| Correction budget never increases silently | K5/K7 |
| No delivery without valid authorization | K10-delivery |
| Attestation/authorization invalidated by policy change | K8/K10-delivery |

Tabla de madurez (evita “el schema existe ⇒ la feature también”):

| Invariante | Primer contrato | Primer enforcement |
| --- | --- | --- |
| Deterministic transition | K1 | K2 |
| Subject-bound invalidation | K1/K2 abstracto | K3 |
| Budget monotonicity | K1 | K5 |
| Evidence-bound verdict | K1 | K6b |
| Finding correction bounds | O4/K1 | K7 |
| Delivery authorization | K1 | K10-delivery |

Se comienza con tests de modelo exhaustivos sobre el espacio pequeño vía Minimal Kernel Harness. TLA+ solo después, si scheduler/worktrees/federación lo exigen — no como excursión académica de K2.

#### Fuera de alcance (K2)

- TLA+/PlusCal/Alloy como entrega obligatoria;
- implementar Candidate freeze, correction budgets productivos o Delivery Authorization “de mentira”;
- 14+ fixtures de producto / journeys completos (K12);
- 10–30 cambios consecutivos longitudinales (K12);
- comparación A/B fixed/kernel a escala (K9/K12);
- métricas de deuda/complejidad acumulada multi-change (K12);
- evaluación multi-target (K11/K12);
- Execution Graph, worker aislado, attestations productivas;
- model checking del espacio completo de K11c/federación.

#### Done criteria

- mismo state digest → mismas transitions ordenadas;
- transición inválida falla cerrada con reason code;
- interruption/replay no duplica efectos;
- cada recovery anunciada tiene E2E de avance o terminal (el comando nombrado se ejecuta en el harness);
- proyección humana y envelope negociado no divergen en discriminantes materiales;
- eventos pueden reconstruirse desde state y no alteran decisiones;
- review/archive existentes pasan pruebas de no regresión;
- el orquestador deja de interpretar prosa para elegir una operación cubierta;
- el Minimal Kernel Harness ejecuta el protocolo sin intervención humana ni auto-approve;
- fixtures mínimos cubren interruption, replay, idempotencia, recovery y snapshot round-trip;
- ningún test de K2 depende solo de mocks del reducer sin pasar por el harness;
- existe un modelo reducido del lifecycle con generación/exploración de transiciones;
- las invariantes **ejecutables** tienen checkers en CI; las **abstractas** usan puertos opacos; las **diferidas** no fingen enforcement;
- un counterexample del modelo es reproducible en el harness (o documenta abstracción);
- CI de K2 ejecuta el suite model-based; no es manual ni opcional.

#### Gate

Lifecycle + harness mínimo + invariantes ejecutables/abstractas verdes. No compilar Execution Graph ni acoplar transports de host hasta entonces. Desbloquea K2.1 (Authority Store / permits / effects). K12 no es prerequisito del runner básico. TLA+ no bloquea el gate de K2.

### K2.1 — Authority Store, OperationPermit y semántica de efectos — **done**

**Dependencias:** K2 `done`.

**Absorbe/rebasa:** endurecimiento de P1/P18 (authority/effects); cierra la laguna de autorización mutante de K2 (token no vacío ≠ permiso).

**Motivación:** K2 entregó estado, journal, commits e idempotencia de efectos, pero no un contrato CAS que impida que dos writers avancen desde la misma revisión, ni permisos ligados al estado, ni semántica explícita de efectos. Eso era razonable en el alcance reducido de K2; debe resolverse **antes** de introducir Work Orders, Candidate y Graph. Sin K2.1, K3–K8 construirían identidad y attestation sobre una autoridad mutante débil.

**Change:** `k2-1-authority-store-permits` (ruta `critical`).

**Cierre:** verify `PASS`, 4R `approved` (8 bloqueantes remediados; 10 WARNING advisory), archive `2026-08-04-k2-1-authority-store-permits`, publicado en v2.39.0. Iniciativa terminal: `done`. K2a se cerró después en v2.40.0.

#### Alcance — Authority Store (CAS obligatorio)

El store debe exponer:

```ts
load(subjectId): { state; revision }

compareAndSwap(
  subjectId,
  expectedRevision,
  nextState
)
```

- un único writer gana por `expectedRevision`; conflicto CAS no reinicia el trabajo ni aumenta budgets;
- journal/commits existentes se conservan; CAS es el contrato de mutación concurrente;
- replay exacto sobre la misma revisión converge.

#### Alcance — permisos ligados al estado

Separar tres artefactos:

| Artefacto | Qué dice | Qué no es |
| --- | --- | --- |
| `TransitionOffer` | Qué operación *podría* realizarse | Autorización de mutación |
| `OperationPermit` | Autoriza una mutación concreta (single-use, revision-bound) | Attestation ni Delivery Authorization |
| `OperationReceipt` | Demuestra que la operación mecánica terminó | Evaluación ni pase de delivery |

Shape conceptual de `OperationPermit`:

```json
{
  "permit_id": "opaque:...",
  "domain": "execution",
  "operation": "submit-work-result",
  "subject_id": "wo:...",
  "expected_revision": "sha256:...",
  "arguments_digest": "sha256:...",
  "scope_digest": "sha256:...",
  "policy_digest": "sha256:...",
  "budget_ref": "budget:...",
  "single_use": true
}
```

Reglas:

- 0 mutaciones sin CAS;
- 0 permits stale aceptados (`expected_revision` distinto del head);
- 0 reutilizaciones de permits (`single_use`);
- un permit no equivale a attestation ni a authorization de delivery;
- modelos no emiten ni se conceden permits a sí mismos.

#### Alcance — semántica explícita de efectos

Cada efecto declara una clase:

```text
pure
idempotent-keyed
probeable
compensatable
irreversible
```

- un efecto `irreversible` con resultado ambiguo **no** se reintenta automáticamente; produce `decide` o `stop`;
- no se promete exactly-once falso sobre shell, Git, APIs o servicios externos;
- adapters direct-write quedan bloqueados: toda mutación pasa por permit + CAS + clase de efecto.

#### Fuera de alcance

- cuatro identidades / Candidate freeze (K3);
- HostCapabilities / transports de producto (K2a);
- Execution Graph / Obligation Manifest (K4a);
- Evaluation Attestation / Delivery Authorization (K8 / K10-delivery);
- firmas criptográficas sin trust root real;
- cambiar defaults globales.

#### Done criteria / gate terminal

- 0 mutaciones sin CAS;
- 0 permits stale aceptados;
- 0 reutilizaciones de permits;
- 0 efectos ambiguos reintentados a ciegas;
- replay exacto convergente;
- adapter direct-write bloqueado;
- fixed sin regresiones;
- fault matrix de CAS/conflict/stale/reuse/ambiguous-effect cubierta por fixtures.

#### Gate

Authority Store + permits + effect semantics conformes. Checkpoint: `continue` | `revise` | `reject`. Desbloquea K2a.

### K2a — Headless Conformance Host + adapter real de referencia — **done**

**Dependencias:** K2.1.

**Absorbe/rebasa:** P20 (contrato mínimo); bases de O13D; desacopla el core de cualquier target concreto.

**Motivación:** K4a/K4b (target inicial), K6a (workspace aislado), K10-delivery (hooks reales) y degradaciones por capability no pueden esperar a K11a. Un contrato “perfecto” solo headless es irreal; un adapter real sin fixture de conformance no permite fault injection. La opción sólida es **ambos**: Headless Conformance Host (faults, timeouts, cancelación, workers, conformance) **más** un adapter real de referencia. K2/K2.1 permanecen host-agnostic por diseño.

**Cierre:** change `k2a-headless-conformance-host` con verify `PASS WITH WARNINGS`, 4R `approved` (4 CRITICAL remediados; 11 WARNING advisory), archive `2026-08-04-k2a-headless-conformance-host`, publicado en v2.40.0. Iniciativa terminal: `done`. K3 queda **next-eligible**.

#### Alcance

Contrato host-agnostic consumido por el core; Headless Conformance Host + un único adapter real de referencia (el host con mayor capacidad reproducible al abrir el change):

- `HostCapabilities`
- `HostAdapter`
- `ExecutionTransport`
- `QuestionTransport`
- `WorkerTransport`
- `ToolExecutionTransport`
- `DeliveryGateTransport`
- **`CapabilityProof`:** una capability no se enforcea porque lo diga un JSON, sino porque exista una prueba reproducible con `adapter_version`, `host_version`, fixture y `evidence_digest`

Estados de capability:

```text
enforced · partial · instructional · unavailable
```

El fixture headless sirve para fault injection, timeouts, cancelación, workers y conformance. El adapter real evita definir un contrato perfecto pero irreal. K2a identifica los transports necesarios y evita expandir los seis targets antes de estabilizar uno.

#### Fuera de alcance

- expansión a un segundo target;
- paridad multi-host;
- fixtures de degradación cruzada entre hosts;
- model routing, ownership scheduler o consolidación de roles (K11b–K11d);
- cambiar defaults globales del harness.

#### Done criteria

- el core solo habla el contrato (`HostCapabilities` + transports); ningún módulo de lifecycle/Graph/receipt importa APIs de un host concreto;
- existe Headless Conformance Host con fault matrix (timeout, cancel, worker fail, interrupt);
- existe exactamente un adapter real de referencia cableado; los demás hosts no están activados;
- cada capability `enforced` tiene `CapabilityProof` reproducible (adapter/host version + fixture + evidence digest);
- degradación honesta: `unavailable`/`instructional` no se promocionan a `enforced` por fallback silencioso;
- `DeliveryGateTransport` y `WorkerTransport` permiten a K6a/K10-delivery ejercitar aislamiento y hooks sin policy propia del adapter;
- conformance rechaza adapters que dupliquen lifecycle o Graph semantics;
- el target de referencia se elige por evidencia de capacidad reproducible, no por preferencia de producto.

#### Gate

Core host-agnostic con Headless Conformance Host + un adapter real de referencia. Checkpoint: `continue` | `revise` | `reject`. Desbloquea K3/K4a sobre ese host; la paridad multi-target queda en K11a.

## Bloque 3 — identidad universal

### K3 — identidades de ejecución, Candidate ID y successor semantics — **SHIPPED (v2.42.0)**

**Absorbe/rebasa:** P9; identidad existente de O4/O5 y fingerprints de O6A.

**Dependencias:** K2a.

**Invariante de separación:** cuatro identidades distintas; no son alias ni etapas renombradas del mismo digest. No se añaden IDs nuevos en este slice.

| Identidad | Qué congela | No es |
| --- | --- | --- |
| `SourceSnapshotId` | Estado exacto del repo que recibió el worker | Candidate ni resultado del worker |
| `WorkOrderId` | Contrato de ejecución autorizado | Evidencia ni aprobación |
| `WorkResultId` | Resultado crudo no aprobado del worker | Candidate congelado |
| `CandidateId` | Contenido integrado y congelado a verificar | Evaluation Attestation ni Delivery Authorization |

Cadena obligatoria:

```text
SourceSnapshot → WorkOrder → WorkResult → integrate-on-authorized-base → Candidate freeze
                                                                    ↓
                              EvaluationAttestation ≠ DeliveryAuthorization
```

```text
WorkResult              ≠  Candidate
Candidate               ≠  EvaluationAttestation
EvaluationAttestation   ≠  DeliveryAuthorization
```

Vocabulario de prueba (nombres = arquitectura):

| Artefacto | Significado |
| --- | --- |
| Evidence | Observación |
| Verification | Verdict técnico |
| Evaluation Attestation (K8) | Ese candidate pasó la política de evaluación |
| Delivery Authorization (K10-delivery) | Ese candidate puede atravesar un gate concreto |

Un patch producido en un workspace aislado **no** es automáticamente el candidate: antes debe integrarse sobre la base autorizada y congelarse.

#### Source Snapshot

Estado exacto del repositorio que recibió el worker:

```ts
interface SourceSnapshot {
  repositoryId: string;
  baseTreeDigest: string;
  projection: "workspace" | "staged" | "commit";
  dependencyDigests: string[];
}
```

`SourceSnapshotId` digiere estos campos. La proyección del snapshot declara qué superficie de bytes recibió el worker. **No** autoriza verify ni delivery. Un `commit` puede origenar el snapshot; eso no añade una tercera proyección a Candidate.

#### Work Order

Contrato de ejecución (ligado a `SourceSnapshotId`):

- objetivo;
- allowed paths;
- invariantes;
- budget;
- source snapshot;
- evidencia requerida.

#### Work Result

Resultado **no aprobado** del worker (ligado a `WorkOrderId` + `SourceSnapshotId`):

- patch/commit;
- comandos;
- logs;
- exit codes;
- filesystem inventory.

#### Candidate

Contenido **integrado** sobre la base autorizada y **congelado** antes de verify/review/attestation/authorization. Incluye:

- canonicalización de paths (semántica canónica explícita);
- proyección **solo** `workspace|staged` (alineado con `candidate/v1`; un commit puede ser origen de `SourceSnapshot`, no de Candidate);
- `repository_id` (evita colisión entre repos con árboles iguales);
- base tree, candidate tree, diff hash, paths digest;
- `changed_paths_modes_digest` (detecta 100644→100755 y modos);
- `intended_untracked_digest` cuando aplique;
- cobertura de symlinks, case sensitivity y selectors ambiguos;
- freeze antes de verify;
- successor ante cualquier byte distinto;
- recovery hereda proyección del predecesor salvo successor explícito autorizado;
- adapters para lineage/archive.

La separación `WorkResult ≠ Candidate` se conserva: el resultado del worker solo se convierte en Candidate después de integrarse sobre la base autorizada y congelarse.

#### Relación inicial Candidate (fail-closed)

Primera versión (enforcement productivo acotado en K10-delivery; vocabulario y fixtures aquí):

| Relación | Significado | Acción inicial |
| --- | --- | --- |
| `exact` | Mismo candidate congelado | Validar |
| `changed` | Bytes distintos / successor | Nueva evaluación |
| `ambiguous` | Selector o proyección ambigua | `decide` / `stop` |
| `unknown` | Relación no determinable | `stop` |

- `compatible-base-advance` queda **experimental** hasta K9 (fixtures suficientes);
- `provable-contraction` se difiere hasta evidencia, findings y delivery completos;
- no se importa la relation algebra completa de Gentle-AI: empezar simple, fail-closed, promocionar relaciones avanzadas solo con fixtures.

#### Alcance adicional

- schemas/IDs estables para las cuatro identidades y sus bindings;
- rechazo fail-closed si un consumer trata `WorkResultId` como `CandidateId`, o `CandidateId` como attestation/delivery auth;
- ningún attestation/authorization puede apuntar solo a branch o working tree mutable;
- fixtures de ambigüedad de selector, modos, symlinks y case.

#### Done criteria

- las cuatro identidades tienen digests estables y fixtures de confusión negativa (alias/colisión rechazados);
- mismo Source Snapshot produce mismo `SourceSnapshotId`; cambio de un byte en base/deps/proyección produce ID distinto;
- mismo tree integrado produce mismo `CandidateId` en plataformas soportadas;
- cambio de un byte del candidate produce ID distinto;
- dirty/untracked/symlink/case edge cases están cubiertos;
- `repository_id`, modes digest y selector ambiguity tienen fixtures negativas;
- relación básica `exact|changed|ambiguous|unknown` es determinista y fail-closed;
- `workspace` y `staged` con el mismo contenido índice/árbol no se confunden cuando el worktree diverge;
- verify/review/delivery rechazan identidad distinta o un `WorkResult` no integrado;
- legacy review/archive conserva histories y no resetea lineage;
- ningún attestation/authorization puede apuntar solo a branch o working tree;
- fixtures demuestran `WorkResult ≠ Candidate`, `Candidate ≠ EvaluationAttestation`, `EvaluationAttestation ≠ DeliveryAuthorization`.

#### Gate

K3 bloquea **Evaluation Attestation** y **Delivery Authorization** (y la vertical Repair que las consume) hasta que las cuatro identidades y el freeze de Candidate estén conformes. Checkpoint: identidad y ambigüedad → `continue` | `revise` | `reject`. No bloquea `ArchiveTransactionReceipt` de O6A ni el envelope legacy `receipt/v1`.

## Bloque 4 — Execution Graph: compilar antes de ejecutar

<a id="k4-execution-graph-compile-before-execute"></a>
<!-- legacy alias: research docs may still link the O20A pending id -->
<a id="o20a-proof-carrying-verify-kernel--pending"></a>

K4 se parte porque el aislamiento real del worker llega en K6a. **Verbos:** K4a **compila**; K4b **orquesta**; K6a **ejecuta**; K3 **identifica**. Compilar y validar el grafo **no** implica ejecutar un worker nuevo con autoridad.

### K4a — Execution Graph compiler y replay — **done**

**Dependencias:** K2a + K3.

**Absorbe/rebasa:** P2, P6 (compiler); O20A (parte compile/replay); O9+O11; bases de O7+O10 y R4.

#### Alcance

- Execution Graph con nodos semánticos, dependencias, invariantes, ownership y evidence refs;
- **Obligation Manifest** como vista determinista **dentro** del propio Graph (no un tercer grafo ni store independiente):

```yaml
obligations:
  - id: req-session-rotation-001
    criticality: must
    implemented_by:
      - repair-auth-session
    required_evidence:
      - auth-contract-tests
```

  Cada obligación `MUST` → está implementada por un nodo → tiene evidencia requerida → o está aplazada mediante decisión explícita. Ventaja defendible: no solo demostrar que un candidato fue revisado, sino que ninguna obligación del contrato se perdió durante la compilación del trabajo;
- compile de Repair (bug reproducible/localizado);
- **`PolicySnapshot` de compile:** la decisión de policy usada para clasificar/compilar queda digesta y reproducible (bundle, classifier/compiler/runtime versions, `effectiveRules`);
- validación/conformance de Execution Graph;
- comparación shadow de **decisiones compiladas** contra el flujo fixed (inputs comparables; sin mutar el flujo vigente);
- replay con resultados fixture (sin worker runtime nuevo);
- clarify como evento tipado;
- invalidación/recompilación de subgrafo (re-emite/rebinding de policy digest cuando cambian reglas efectivas);
- shapes tipados de Work Order (declarativos; sin emitir/ejecutar autoridad);
- un target de referencia = adapter K2a (sin segundo host).

#### Cadena de este slice

```text
compact contract
  → classify Repair (PolicySnapshot.compile)
  → compile semantic graph
  → validate Execution Graph
  → compare compiled decisions vs fixed
  → replay with fixture results
  → invalidate / recompile subgraph
```

#### Fuera de alcance

- emitir Work Order con autoridad de ejecución;
- ejecutar worker nuevo (aislado o no);
- capturar Work Result vivo;
- integrar / producir Candidate;
- independent verify, review, receipt, delivery;
- gobernar delivery real; cinco rutas; multi-worker; simplificar agentes; journal autoritativo; cambiar defaults.

#### Done criteria

- nodos microscópicos `read/edit/test` son rechazados por contract/lint;
- Graph ID es estable y está ligado al contract digest **y** al `policyBundleDigest` efectivo de compile;
- el mismo contract bajo policies distintas produce Graph/policy digests distintos cuando las `effectiveRules` divergen;
- Obligation Manifest: toda obligación `MUST` tiene `implemented_by` + `required_evidence` o defer explícito auditado;
- clarify invalida solo descendants declarados;
- dependency desconocida impide reutilizar output;
- Work Order shape v2 valida en conformance con compilación determinista (sin ejecución);
- fixed y shadow-compile reciben inputs comparables;
- ninguna transición de compile/replay muta el flujo vigente;
- replay con fixtures no pierde obligaciones ni resucita nodos;
- ningún path de K4a invoca un worker runtime nuevo con autoridad.

#### Gate

Compile/replay + Obligation Manifest estables. Checkpoint: cobertura de obligaciones y calidad del Graph → `continue` | `revise` | `reject`. Rechazo conserva fixed. Promoción desbloquea K5 (luego K6a); **no** activa shadow execution (K4b) ni cambia default.

## Bloque 5 — ejecución acotada y causal

### K5 — budgets, failures y recovery común — **delivered**

**Dependencias:** K4a.

**Absorbe/rebasa:** P7, P8, P18; O4.2; routing de verify.

#### Alcance

- budgets por node: turns, patches, commands, wall time, changed lines, paths;
- budgets de **autoridad y efectos** (además de turns/patches/commands):

```yaml
budget:
  effect_attempts: 8
  authority_mutations: 12
  evidence_runs: 6
  review_sweeps: 1
```

- taxonomy causal;
- mapping de tags existentes;
- repair/replan/escalate/stop;
- no automatic reset;
- el budget **no** aumenta por retry; un CAS conflict no reinicia el trabajo; un efecto ambiguo no se etiqueta automáticamente como defecto de código.

#### Done criteria

- budget agotado nunca relanza worker idéntico;
- cada failure code tiene transition allowlisted;
- mixed failures respetan prioridad causal;
- repair limita node/paths/findings;
- zero-delta consume attempt cuando corresponde;
- environment/tool/external failures no se etiquetan como code defect;
- CAS conflict y efecto ambiguo no reinician budgets ni se reclasifican como code defect;
- recovery E2E prueba avance o stop;
- métricas de consumo quedan fuera del state semántico.

**Gate:** budgets/recovery listos para consumirse en K6a/K4b.

## Bloque 6 — independencia y evidencia por slices

K6 no se ejecuta como un change transversal. Cada slice tiene output terminal y bloquea al siguiente.

<a id="k6--isolated-worker-independent-verifier-y-evidence-strategies--pending"></a>

### K6a — worker isolation y work-order capsule — **done** (v2.46.0; frontera de procesos cerrada en v2.47.1; endurecida en v2.47.2)

**Dependencias:** K4a + K5 + K2a (`WorkerTransport` / aislamiento del host de referencia) + K3 (identidades como IDs opacos/shapes).

**Absorbe/rebasa:** P16 parcial; O18.

**Rol:** proveedor de **primitivas de ejecución** genéricas. No conoce Repair, compilación de Execution Graph ni comparación shadow.

```text
K4b → K6a
K6a ✕ K4b   (K6a no depende de K4b)
```

**Frontera de identidad (con K3):** el worker opera sobre un `SourceSnapshot`, recibe un `WorkOrder` y emite un `WorkResult`. Eso **no** crea un `CandidateId`. El candidate solo existe tras integrar + freeze (orquestación de K4b vía K3).

#### Primitivas que posee K6a

- `CreateWorkspace`
- `MaterializeSourceSnapshot`
- `ExecuteWorkOrder`
- `CaptureWorkResult`
- `ValidateAllowedPaths`
- `RecoverInterruptedExecution`
- `DisposeWorkspace`

#### Alcance

- capsule mínima derivada de dependencias del Execution Graph (compiladas en K4a; K6a las consume, no las compila);
- shapes/maquinaria de `WorkOrder` / `WorkResult` / `SourceSnapshot`;
- workspace aislado vía adapter de referencia (K2a);
- raw evidence ligada a `WorkOrderId` / `WorkResultId`, no a un candidate prematuro.

#### Fuera de alcance

- orquestar Repair shadow (K4b);
- compilar Execution Graph (K4a);
- freeze Candidate / verify / review / attestation / delivery;
- comparación fixed vs shadow;
- inventar `CandidateId` desde el workspace del worker.

#### Done criteria

- capsule fingerprint estable y sin artefactos no dependientes;
- ejecución conforme de `WorkOrder` a través de un `WorkerTransport` con aislamiento `enforced` no puede mutar rutas fuera de declared `allowed_paths` mediante la frontera soportada de K6a;
- interruption conserva raw evidence y recovery ejecutable;
- hand-off usa patch/commit identificado (`WorkResultId`), no conversación;
- fixture demuestra ejecución aislada sin verificar ni aprobar;
- fixtures rechazan que K6a emita `CandidateId`;
- el inventario del workspace aislado no es aceptado como candidate tree;
- fallback explícito si la capability de aislamiento del host de referencia es `partial|unavailable`;
- ninguna API de K6a menciona Repair/shadow/compiler.

**Gate terminal:** primitivas de ejecución conformes; ningún `CandidateId` emitido; desbloquea K4b como consumidor.

### K4b — Repair shadow execution — **done** (v2.48.0; corrección en v2.48.1; invariantes en v2.48.2; cierre mode-only/baseline en v2.48.3)

**Dependencias:** K4a + K5 + K6a + K3 + K2a.

**Estado:** `done`. Archivado `openspec/changes/archive/2026-08-26-k4b-mode-only-and-baseline-projection/` y publicado en v2.48.3.

**Absorbe/rebasa:** O20A (parte ejecución shadow); cierre del MVP Repair compile→execute.

**Rol:** **orquestador de dominio Repair**. Consumidor de K6a; no reimplementa aislamiento.

**Motivación:** K4a **compila**; K6a **ejecuta**; K4b **orquesta** la primera vertical shadow del runtime nuevo; K3 **identifica** el Candidate.

#### Alcance

```text
Take compiled Repair Execution Graph (K4a)
  → select executable node
  → ask K6a to ExecuteWorkOrder
  → receive WorkResult
  → integrate result on authorized base
  → freeze Candidate through K3
  → persist graph transition
  → compare shadow outcome vs fixed
```

- emitir `WorkOrder` con autoridad sobre el Execution Graph compilado y el `PolicySnapshot` de compile;
- delegar ejecución aislada exclusivamente a K6a;
- producir `CandidateId` congelado ligado al policy digest vigente;
- comparar shadow contra fixed **sin** mutar el flujo vigente ni cambiar defaults.

#### Fuera de alcance

- reimplementar CreateWorkspace / ExecuteWorkOrder / etc. (K6a);
- independent verify, challenges, complexity (K6b–K6d);
- review lineage (K7);
- CandidateEvaluationAttestation (K8);
- promoción A-B / cambio de defaults (K9);
- DeliveryAuthorization (K10-delivery).

#### Done criteria

- Work Order/Result vivos validan en conformance y ligan a Execution Graph + Source Snapshot;
- worker shadow solo corre vía K6a; no hay bypass al core;
- integrate + freeze producen `CandidateId`; `WorkResult` solo no basta;
- fixed permanece autoridad vigente; shadow no muta defaults;
- fixtures demuestran compile (K4a) ≠ execute-primitives (K6a) ≠ orchestrate (K4b) y `WorkResult ≠ Candidate`;
- replay de la vertical shadow no pierde obligaciones;
- dependencia unidireccional: K4b → K6a; tests fallan si K6a importa K4b.

#### Gate

Vertical Repair shadow produce Candidate congelado. Gate de invariantes cerrado en v2.48.3: mode-only exige path existente y `old mode` de la base; la comparación baseline es graph-bound sin préstamo del Graph shadow. Desbloquea K6b. El resultado de O20A decide **promover, revisar o rechazar** el kernel común solo tras K9; rechazo conserva fixed.

### K6b — verifier independiente, evidence strategies y Assurance Graph — **done**

**Dependencias:** K4b + K6a + K3.

**Estado:** `done`. Publicado inicialmente en v2.50.0 y endurecido hasta v2.54.0; cerrado en v2.55.0 (`k6b-durable-replay-receipt-authority`). Records `runner-receipt/v1` persisten en la bolsa CAS `runner_receipts` (distinta de `authority.receipts`); tras restart el runtime rehidrata, recomputa `receipt_id` y reemite un canal efímero **nuevo**. En replay, `normalizeRole(assessment.role)` debe coincidir con el del receipt. OpenSpec/Git/Candidate siguen siendo la única autoridad semántica; el grafo no concede lifecycle, approval ni delivery.

**Absorbe/rebasa:** P12/P16; O15; separación apply/verify vigente.

**Assurance Graph (proyección, no autoridad):** evidence refs con origin/hash/node son necesarias pero insuficientes para revalidación incremental. K6b materializa un **Assurance Graph** content-addressed y derivado del estado canónico (contract, Execution Graph, identidades, evidencia, verify). No concede lifecycle ni sustituye OpenSpec/Git.

Cadena de sujetos (proyección):

```text
Requirement
  → Graph Node
  → Work Order
  → Source/Patch
  → Candidate
  → Test Evidence
  → Verification Decision
  → Review Finding
  → Evaluation Attestation
  → Delivery Authorization
```

```ts
interface AssuranceEdge {
  from: EvidenceSubjectId;
  relation:
    | "implemented-by"
    | "verified-by"
    | "invalidates"
    | "reviewed-by"
    | "satisfies"
    | "derived-from";
  to: EvidenceSubjectId;
}
```

Invalidación selectiva ante Candidate successor:

```text
Candidate successor
  → calcular nodos/sujetos afectados (closure sobre AssuranceEdge)
  → invalidar evidencia dependiente
  → repetir verificaciones afectadas
  → conservar evidencia independiente
```

No se reejecuta “absolutamente todo” por defecto; tampoco se reutiliza evidencia transitivamente invalidada.

#### Alcance

- verifier consume contract, Execution Graph, **`CandidateId` (no `WorkResultId`)**, repo y raw evidence;
- strategies bug/feature/refactor/migration/config-docs;
- evidence refs con origin, hash y node binding **como nodos/edges del Assurance Graph**;
- `runner-receipt/v1` content-addressed, Evidence-bound y consumido exclusivamente desde una capacidad opaca de runtime;
- chronology temporal con un único `run_id`, ordinales estrictos y `previous_evidence_id` obligatorio en cada transición;
- replay Evidence bundle con bytes o `observation_blob_id` resoluble; ausencia de material implica `GRAPH_DIVERGENCE`;
- **provenance de evidencia** (obligatorio en cada evidence node):

```text
runtime-observed
host-attested
tool-produced
model-reported
human-decision
external-unverified
```

  Ejemplo: “tests passed” escrito por el worker (`model-reported`) ≠ resultado observado por el runtime (`runtime-observed`). La policy decide qué provenance puede satisfacer cada obligación;
- emisión/actualización de `AssuranceEdge` al verificar (`verified-by`, `satisfies`, `derived-from`, `invalidates`);
- closure de invalidación selectiva cuando aparece successor o cambia un sujeto fuente;
- fallback Strict TDD;
- rechazo si el input es un `WorkResult` no integrado o un candidate no congelado.

#### Fuera de alcance

- convertir el Assurance Graph en autoridad de lifecycle, approval o delivery;
- review lenses / findings (K7 consume y extiende edges `reviewed-by`);
- Evaluation Attestation de K8 (digiere roots de K6b, pero no redefine receipt authority ni el grafo);
- arreglar first-match de la tabla de routing de producto (`standard` sombreando `lite`); es compatibilidad viva, no verifier;
- introducir Change Program / cola de OpenSpec changes concatenados;
- Quality Attribute identities, gate Architecture Readiness o pipeline de cinco agentes.

#### Done criteria

- narrativa del worker no es input de autoridad;
- cada strategy declara evidencia mínima y negative cases;
- evidencia fabricada/stale/foreign falla cerrada;
- provenance insuficiente para una obligación falla cerrada según policy;
- cambio post-freeze crea successor;
- el Assurance Graph es reproducible desde inputs canónicos (mismo digest ⇒ mismos edges);
- fixtures de successor invalidan solo el closure afectado y **conservan** evidencia independiente;
- fixtures rechazan reusar evidencia bajo un edge `invalidates` transitivo;
- Strict TDD sigue disponible y por defecto;
- caller DTOs de receipts y matching posicional fallan cerrados;
- receipt `outcome: failed` no puede satisfacer tokens;
- chronology mixta, sin predecessor o con chain incorrecta falla cerrada;
- replay sin bytes/blob resoluble falla cerrado y el bundle completo conserva `graph_id`;
- records `runner-receipt/v1` persisten en CAS `runner_receipts` y, tras restart, se rehidratan y se reemite un canal opaco nuevo (el WeakMap no se serializa);
- bags `runner_receipts` con forma de array fallan cerrados y no emiten canal de confianza;
- replay exige `normalizeRole(assessment.role) === normalizeRole(receipt.role)` independiente de `assessment_id`;
- equivalence manifest queda listo para K9;
- ningún consumer trata el Assurance Graph como segunda fuente de verdad frente a OpenSpec/Git/Candidate.

**Gate terminal:** cerrado en v2.55.0. B1 persistencia durable + reemisión de canal, B2 chronology causal, B3 replay obligatorio y bind de role, H1 outcome. Residual aceptado: `ag-006-receipt-token-attestation` (WARNING, test dedicado opcional). Desbloquea K6c.

### K6c — adversarial challenges (policy-selected) — **done** (v2.56.0)

**Dependencias:** K6b (+ `PolicySnapshot` / strategy de evidencia).

**Absorbe/rebasa:** P13.

**Proporcionalidad:** revert, mutation, independent acceptance y test inspection son **tipos disponibles**, no cuatro pasos universales. La selección la hace un `ChallengePlan` derivado de policy + strategy + candidate; skipped queda auditado.

```ts
interface ChallengePlan {
  candidateId: string;
  selected: ChallengeType[];
  reasons: ReasonCode[];
  budget: ChallengeBudget;
  skipped: SkippedChallenge[];
}
```

Ejemplos de selección (illustrative; reasons estables en fixtures):

| Strategy / clase | `selected` típico | Evitar |
| --- | --- | --- |
| Bugfix | `revert` + regression acceptance | mutation absurda fuera de foco |
| Refactor | behavior equivalence + mutation focal | revert de “arreglar bug” irrelevante |
| Migration | rollback + compatibility acceptance | suite mutation genérica cara |
| Docs/config | structural validation / test inspection | mutation sin semántica de comportamiento |

```text
PolicySnapshot + evidence strategy + Candidate
  → ChallengePlan (selected | skipped | budget | reasons)
  → ejecutar solo selected
  → exhaustion / fail → transition tipada
```

K6c ataca la **evidencia/implementación** del candidato. La refutación adversaria de *findings de review* no vive aquí (K7). Patrones reutilizables (independent acceptance, envelope inválido = no-corroboración, budget de mutación) informan K7 sin fusionar scopes.

#### Alcance

- catálogo de `ChallengeType` (incl. revert, mutation focal, independent/regression/compatibility acceptance, test inspection, structural validation, behavior equivalence, rollback…);
- emisión determinista de `ChallengePlan` con `reasons` y `skipped` explicables;
- budgets por plan (`ChallengeBudget`); exhaustion produce transition, no relanzar idéntico;
- ligar plan y resultados a `CandidateId` / node / strategy / `policy_digest`;
- fixtures por strategy que demuestran selección distinta (no el mismo cuarteto siempre).

#### Fuera de alcance

- ejecutar siempre los cuatro challenges “clásicos” en todo candidate;
- challenge plan como segunda autoridad de lifecycle/delivery;
- refutación de findings de review (K7);
- quemar tokens con mutation/acceptance no justificados por policy.

#### Done criteria

- ningún candidate recibe por defecto el set universal de challenges;
- todo run materializa un `ChallengePlan` con `selected`, `skipped`, `reasons` y `budget`;
- fixtures: bugfix / refactor / migration / docs-config producen planes distintos y proporcionales;
- skipped tiene reason code estable (no silencio);
- defects sembrados **aplicables al plan** son detectados;
- test complaciente/tautológico se rechaza cuando el plan incluye inspection/acceptance pertinentes;
- challenges están ligados a Candidate ID/node/strategy/policy;
- mutation budget es acotado y exhaustion produce transition;
- challenge no muta el candidato aprobado;
- fallos se clasifican causalmente;
- no se introduce un segundo stack de “refuter de review” paralelo a K7;
- coste de challenges no crece por “correr todo el catálogo”.

**Gate terminal:** cerrado en v2.56.0 (`k6c-policy-selected-challenges`). Integridad canónica, ejecución aislada fail-closed, conjunto exacto en el verifier y proyección/replay no autoritativa cerradas en v2.56.1 (`k6c-integrity-remediation`). Binding de la strategy seleccionada, fail-closed de `missing_tests`/no-op y rechazo de estrategia desconocida en el planner cerrados en v2.56.2 (`k6c-failclosed-integrity`). Enforcement monotónico de `mutation_budget` con fallo causal y clasificación estricta de spawn/tooling errors cerrados en v2.56.4 (`k6c-budget-execution-failclosed`). Desbloquea K6d.

### K6d — complexity y architecture delta — **next-eligible**

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

### K7 — review authority (ReviewAdapter + ReviewReducer) — **pending**

**Absorbe/rebasa:** P10/P11; O4+O5/O4.1.

**Policy:** el selector de review consume un `PolicySnapshot` (reglas efectivas de clasificación/niveles/lenses). Cambiar policy puede exigir review donde antes bastaba Nivel 0, o al revés; el lineage registra el policy digest usado, no solo el candidate.

**Autoridad de review explícita:**

| Componente | Responsabilidad |
| --- | --- |
| `ReviewAdapter` | Invoca modelos y presenta decisiones; no congela tier/lenses ni concede aprobación |
| `ReviewReducer` | Congela tier y lenses; admite findings; consume correction budget; crea successor; finaliza review |

Corrección bounded ordinaria inicialmente. Una corrección por closure (estilo Gentle) puede evaluarse después en shadow; **no** entra como default (riesgo de reintroducir loops).

**Assurance Graph (con K6b):** el review **extiende** la proyección con edges `reviewed-by` / `invalidates` sobre findings y lenses; no inventa una segunda autoridad. Ante Candidate successor (o invalidación selectiva de evidencia):

```text
Candidate successor
  → nodos/sujetos afectados (Assurance Graph)
  → invalidar findings/lenses dependientes
  → re-ejecutar solo lenses afectadas (dentro de one-shot/budgets)
  → conservar findings/evidencia de review independientes
  → Evaluation Attestation / Delivery Authorization anteriores siguen inválidas hasta re-bind
```

Invalidar “todo el review anterior” sigue siendo correcto para el **receipt** y para findings ya aprobados como autoridad; la **re-ejecución** de trabajo de review/verify debe ser selectiva vía Assurance Graph, no un replay total por defecto.

**Ventaja absorbida (comparativo Gentle AI, 2026-08):** no se porta RDD/CLI/`review-integration` ni un ledger markdown paralelo. Se absorbe solo lo que mejora el kernel de review ya entregado: criterios de lente más densos, *precision gate*, y refutación acotada de findings severos. La machinery (selector determinista, lineage, remediation-v2, fail-closed) permanece la de ospec y se considera superior al triage 3-tier / convergence genérico de Gentle. No hace falta importar RDD.

**Interacción CX5b (no bloqueante):** K7 entrega primero la autoridad y el lineage. CX5b depende de K7 para proyectar inputs congelados por lens/correction; no reduce reviewers, no reabre discovery y no bloquea K7 ni K8.

#### Alcance

- separar `ReviewAdapter` (invocación/presentación) de `ReviewReducer` (congelación, findings, budget, successor, finalize);
- Nivel 0: sin review de modelo solo para candidatos Direct mecánicos cuya validación determinista sea suficiente y sin señales materiales;
- Nivel 1: generalista read-only para cumplimiento, correctness, scope, evidencia, complejidad, regresiones y coherencia;
- Nivel 2: especialistas selectivos activados por riesgo/evidencia;
- adaptar inputs del selector y lineage;
- mapear especialistas a signals del classifier/Graph **bajo el PolicySnapshot vigente**;
- persistir `policy_digest` / `effectiveRules` relevantes en el gate de review (auditoría; no segunda autoridad);
- consumir Assurance Graph de K6b; emitir `reviewed-by` / `invalidates` al congelar o invalidar findings;
- calcular lenses/findings afectados ante successor sin relanzar el conjunto completo si el closure lo permite;
- incorporar `performance` y `compatibility-migration` como señales/lenses condicionadas, no reviewers permanentes;
- conservar one-shot/frozen findings/correction budgets;
- impedir rediscovery y reset;
- **calidad de lente (prompt surgery):** enriquecer Flag/Do-Not-Flag de risk/reliability/resilience/readability con reglas concretas de alto valor (secrets hardcodeados, authz solo-frontend, sinks HTML, cookies de sesión, `forbidOnly`/`test.only`, tests behavior-first vs implementation-centric, dead code/magic numbers, rollback/observability cuando el stack lo soporte); filtrar reglas producto-específicas (p. ej. Sentry hardcode) para que queden stack-aware o gated por señal;
- **precision gate:** cada lente reporta solo defectos user-impacting defendibles con evidencia; en duda, silencio; estilo/preferencia no bloquea salvo que oculte un defecto; sweep budget alineado al one-shot existente (1 sweep targeted; ≤2 en full-4R/high-risk);
- **refutación de findings (opcional→gated):** antes de `freezeFindings` / corrección, un validador read-only batch-eado evalúa solo BLOCKER/CRITICAL; techo estructural 1 task (targeted) o 3 en paralelo con voto 2-of-3 (full-4R/high-risk); envelope inválido o ausente → `stands`; nunca 1 task por finding; no discovery, no nuevos IDs, no budget nuevo;
- **severity floor:** WARNING/SUGGESTION se registran como follow-up/info y nunca abren el loop de corrección; solo findings severos que sobrevivan refutación (cuando el gate esté activo) consumen correction budget.

#### Done criteria

- no se relanza generalist o lens ya ejecutada **salvo invalidación selectiva del closure** (successor/policy/evidence dependiente);
- Nivel 0 solo se selecciona cuando classifier y runtime prueban que no existe comportamiento/riesgo material y la validación determinista cubre el contrato **bajo el PolicySnapshot del change**;
- cualquier señal material escala al menos a Nivel 1;
- positive dimensions siguen sin descartarse;
- high-risk/overflow conserva full 4R;
- fixtures de performance y migration/compatibility activan sus lenses; ausencia de señal persiste razón de skip;
- esas dos lenses tienen contract, budget y evals antes de poder bloquear;
- finding IDs y attempts históricos sobreviven migración;
- correction solo toca paths/IDs autorizados;
- Candidate successor **o** policy digest distinto invalida Evaluation Attestation / review anterior como **aprobación**; no reutiliza findings aprobados;
- el mismo successor **no** obliga a re-ejecutar lenses cuyo sujeto Assurance Graph permanece independiente y no invalidado;
- late observations quedan follow-up;
- tests de compatibilidad cubren lineages v1;
- skills de lente incluyen precision gate + criterios enriquecidos sin duplicar el contrato de lineage en cada agent prompt (el protocolo compartido sigue en `gate-4r-review` / reducers);
- cuando la refutación esté habilitada: solo BLOCKER/CRITICAL entran; techo 1|3 respetado; findings `refuted` no consumen correction; `stands`/malformed default no inventa clean envelopes;
- no existe `review-ledger.md` ni store ajeno como segunda autoridad de findings; lineage en OpenSpec state permanece canónico;
- Judgment Day permanece skill on-demand y no se fusiona al gate 4R;
- fixtures demuestran que el mismo Candidate bajo policies distintas puede seleccionar niveles/lenses distintos;
- fixtures demuestran invalidación selectiva: evidencia/lenses independientes sobreviven; dependientes se regeneran;
- `ReviewAdapter` no puede congelar findings ni consumir correction budget; solo el reducer muta lineage;
- checkpoint precisión/coste de review → `continue` | `revise` | `reject`.

## Bloque 8 — attestation de evaluación

### K8 — Candidate Evaluation Attestation — **pending**

**Absorbe/rebasa:** P17 (slice de evaluación/attestation); O15/O19B; primitives de O6A; R1 como consumidor futuro.

**Nombre = arquitectura:** no se llama “delivery receipt”. Una Evaluation Attestation afirma que el candidate pasó la política de evaluación; **no** autoriza atravesar un gate de entrega.

| Artefacto | Significado | Slice |
| --- | --- | --- |
| Evidence | Observación | K6b |
| Verification | Verdict técnico | K6b |
| **Evaluation Attestation** | Ese candidate pasó la política de evaluación | **K8** |
| **Delivery Authorization** | Ese candidate puede atravesar un gate concreto | **K10-delivery** |

**Separación (K3):** la attestation liga un `CandidateId` congelado. `EvaluationAttestation ≠ DeliveryAuthorization`.

**Emisión mediante CAS:** la attestation se emite con `OperationPermit` + `compareAndSwap` sobre el subject de evaluación. Campos adicionales:

- `expected_revision` / `authority_revision`
- `issuer_version`
- `OperationPermit` single-use
- exact replay
- single writer

No se añaden firmas criptográficas sin un trust root real.

**Policy Snapshot:** el mismo candidate puede ser aprobado bajo una policy y rechazado bajo otra. La attestation **debe** ligar un `PolicySnapshot` verificable; sin ese digest, la revalidación en K10-delivery quedaría indirecta.

```ts
interface PolicySnapshot {
  policyBundleDigest: string;
  classifierVersion: string;
  compilerVersion: string;
  runtimeVersion: string;
  effectiveRules: PolicyDecision[];
}
```

Shape conceptual de la Candidate Evaluation Attestation:

```json
{
  "kind": "candidate-evaluation-attestation",
  "contract_digest": "sha256:...",
  "graph_digest": "sha256:...",
  "candidate_id": "sha256:...",
  "evidence_root_digest": "sha256:...",
  "findings_digest": "sha256:...",
  "policy_digest": "sha256:...",
  "expected_revision": "sha256:...",
  "authority_revision": "sha256:...",
  "issuer_version": "...",
  "runtime_version": "...",
  "outcome": "approved-for-evaluation"
}
```

`candidate_id` es el campo canónico (no `candidate_digest`). `policy_digest` digiere el `PolicySnapshot` efectivo (compile + review selection + runtime). `outcome: approved-for-evaluation` **no** es Delivery Authorization ni implica `isApproved` de delivery.

**Ventaja absorbida (comparativo Gentle AI):** el *qué* (attestation content-bound que gobierna confianza de evaluación, no la narración del agente) ya está en esta dirección vía O6A→K8. Se refuerza el *cómo* propio: threat model local, proyección `workspace|staged` de Candidate (`candidate/v1`), recovery nombrada solo si es ejecutable, y rechazo explícito a consumir `gentle-ai.review-integration` u otro binario ajeno como autoridad.

#### Alcance

- finalizar evidence/findings digests (root alineable al Assurance Graph; el grafo no es autoridad);
- Evaluation Attestation ligada a contract, graph, candidate, evidence, findings **y policy**;
- emisión vía CAS + `OperationPermit` (single writer, exact replay, single-use);
- materializar `PolicySnapshot` / `policy_digest` + `runtime_version` + `issuer_version` + revisions en el envelope;
- `kind` discriminante explícito (`candidate-evaluation-attestation`); nunca alias silencioso a delivery;
- outcome y `valid_for` (scope inicial `evaluation`);
- stale/foreign checks (incluye policy/runtime mismatch y revision stale);
- threat-model mínimo del store/emisión (corrupción accidental, writer stale, interrupción, identity mismatch) sin pretender autenticar actor malicioso same-user ni firmas sin trust root;
- decline/bypass auditado nunca reporta autorización de delivery ni fabrica attestation.

#### Done criteria

- attestation de otro candidato, contrato, grafo **o policy** se rechaza;
- mutar evidencia/findings **o** el PolicySnapshot invalida la attestation;
- emisión solo ocurre tras verify/review requeridos;
- la attestation no ejecuta reviewers;
- recovery de emisión es idempotente/reconciliable;
- archive receipt, Evaluation Attestation y Delivery Authorization mantienen scopes/kinds distintos;
- schema y conformance cubren tampering/corruption, ausencia de `policy_digest` y confusión de kind con delivery auth;
- no se habilita commit/push/PR todavía;
- proyección del candidato emitido coincide exactamente con la congelada en K3;
- ninguna superficie de evaluación depende de un proveedor de review externo;
- fixtures: mismo candidate + policies distintas → attestations distintas / no intercambiables;
- fixtures rechazan tratar `approved-for-evaluation` como pase de pre-commit/pre-push/pre-PR.

#### Gate

Extender `valid_for` requiere un change posterior con threat model y evidencia K9. K10-delivery emite/valida **`DeliveryAuthorization`** revalidando digests de policy vivos; no reutiliza el nombre, kind ni el envelope legacy `receipt/v1` de K8/K1.

## Bloque 9 — promoción controlada

### K9 — shadow, replay, revert y A/B — **pending**

**Conserva/rebasa:** P13/P26 parcial; O8; O2B como control.

K9 sigue siendo el **único gate que promociona** `kernel-shadow → kernel`. No desaparece. Pero no se espera hasta K9 para descubrir que una abstracción no funciona: los checkpoints intermedios ya habrán emitido `continue` | `revise` | `reject`.

#### Checkpoints previos (no sustituyen K9)

| Después de | Se valida |
| --- | --- |
| K2.1 | CAS, permits y fault matrix |
| K2a | Contrato real de host + CapabilityProof |
| K3 | Identidad y ambigüedad |
| K4a | Cobertura de obligaciones y calidad del Graph |
| K4b | Repair shadow sin bypass |
| K6b/K6c | Evidencia, provenance y challenges |
| K7 | Precisión y coste de review |
| **K9** | Perfil integrado completo |

Cada checkpoint puede emitir `continue` | `revise` | `reject`. Así no se arrastra una mala abstracción durante seis slices.

#### Policies

```text
fixed
kernel-shadow
kernel
```

`kernel-shadow` calcula decisiones y **Evaluation Attestations** sin gobernar delivery ni emitir Delivery Authorization. Cada brazo del A/B declara su `PolicySnapshot` (bundle/classifier/compiler/runtime).

#### Comparación

- mismos fixtures, harness, target, modelo/effort y budgets;
- **PolicySnapshot / `policy_digest`** por brazo (mismas rules ⇒ digests iguales; divergencia tipada);
- obligaciones/verdict/findings;
- evidence/challenges/provenance;
- invocaciones/tokens/duración;
- preguntas, retries y recovery;
- complexity delta;
- divergencias y fallback;
- evaluación experimental de `compatible-base-advance` **solo** si fixtures K3/K9 lo soportan; no entra como default.

#### Done criteria

- calidad no inferior;
- requisitos/evidencia/aprobaciones perdidos: 0;
- señales materiales descartadas: 0;
- replay determinista **bajo el mismo PolicySnapshot**;
- stale Evaluation Attestations / Delivery Authorizations e invalid recoveries bloqueados (incluye policy drift);
- defectos sembrados detectados;
- fallback fixed/strict probado;
- coste y complejidad neta publicados;
- ninguna segunda fuente de verdad;
- decisión explícita: promote, revise o reject;
- fixtures demuestran que comparar solo candidate/evidence sin policy digest es insuficiente.

Promoción no activa cinco rutas ni targets. Autoriza **solo** el perfil/ruta/target/configuración demostrados (p. ej. Repair en el host de referencia) para que K10-delivery pueda instalar enforcement productivo **acotado**. El resto permanece en `fixed` o `unmanaged/deferred` hasta promoción explícita posterior (K10 / cambios siguientes).

## Bloque 10 — enforcement productivo y rutas

### K10-delivery — DeliveryAuthorization — **pending**

**Dependencias:** K9 aprobado + K8 (Evaluation Attestation) + K3 + K2a (`DeliveryGateTransport` del host de referencia).

**Absorbe/rebasa:** P17 productivo (autorización de delivery); O19B/R1.

**Nombre = arquitectura:** emite/valida un **`DeliveryAuthorization`** por gate concreto (`pre-commit` / `pre-push` / `pre-pr`). Consume Evaluation Attestations de K8; **nunca** las renombra ni las trata como pase de delivery. **Nunca** se llama «Delivery Authorization Receipt» (Receipt ≠ Authorization). Schema propio: `schemas/kernel/delivery-authorization/v1` — no reutilizar `receipt/v1`.

**Alcance de promoción (obligatorio):** el primer enforcement productivo **solo** gobierna el **perfil promovido por K9** (ruta + target + configuración demostrados; típicamente Repair en el host de referencia). Es una decisión sólida del roadmap y se conserva.

```text
K9 demuestra Repair (perfil P)
  → K10-delivery enforcea solo P
  → otras rutas/perfiles: fixed | unmanaged/deferred
```

**Relación Candidate por etapas (primera versión):**

| Relación | Acción en delivery |
| --- | --- |
| `exact` | Validar |
| `changed` | Nueva evaluación |
| `ambiguous` | `decide` / `stop` |
| `unknown` | `stop` |

Después de pruebas en K9 podría incorporarse `compatible-base-advance`. No se copia la relation algebra completa de Gentle-AI: empezar simple, fail-closed, promocionar relaciones avanzadas solo con fixtures suficientes.
**Prohibido:**

```text
K9 demuestra Repair
  → K10-delivery instala un hook global
  → el hook bloquea Planned / Critical / Direct (u otros) no evaluados
```

**Ventaja absorbida (comparativo Gentle AI):** gates de delivery que re-derivan evidencia desde Git vivo (no espejos narrados), kill-switch/bypass que **aplaza** sin fabricar autorización, y la regla de fricción “solo nombrar un comando si ejecutarlo desbloquea”. Todo ello se implementa sobre attestation/authorization del kernel ospec; no se adopta el compact store ni el CLI de Gentle.

#### Scope inicial

- `pre-commit`;
- `pre-push`;
- `pre-pr`;
- **solo** sobre el route/profile digest promovido por K9.

#### Alcance

- threat model por hook/superficie;
- emitir/validar Delivery Authorization con `kind` discriminante distinto de Evaluation Attestation;
- ligar **route/profile digest** (ruta + target + config efectiva) al `DeliveryAuthorization`;
- binding exacto a contract/graph/candidate/evidence/findings/**policy** + Evaluation Attestation previa cuando aplique;
- enforcement productivo **solo** sobre profiles promovidos; profiles no promovidos no entran en el fail-closed del hook kernel;
- profile desconocido o no promovido → `fixed` o `unmanaged/deferred` (sin heredar autorización de otro profile);
- `fixed` permanece operativo y usable en paralelo;
- rollout **reversible** por profile y por target (desactivar P no exige retirar el harness entero);
- revalidación live del `PolicySnapshot`: recomputar `policy_digest` / versions vigentes y rechazar mismatch (no basta invalidación narrativa por “cambio de policy”);
- expiry e invalidación por successor, cambios de policy/schema o evidence;
- replay protection y reconciliation;
- validadores headless fail-closed **dentro del profile promovido**;
- degradación declarada por capability del host de referencia (K2a); no hardcode de un segundo target;
- re-derivación live del candidate/scope en el gate (worktree o index según proyección), rechazando drift;
- modo unmanaged/bypass: `allowed: false` o defer-a-policy del repo, nunca Delivery Authorization sintética;
- denegaciones con `next_action` ejecutable (`execute|collect|decide|stop`); un recovery nombrado debe desbloquear al correrse.

#### Fuera de alcance

- enforcement global multi-ruta en el primer corte;
- bloquear Planned/Critical/Direct/Bounded no promovidos;
- activar cinco rutas o varios targets de un golpe;
- cambiar defaults globales del harness más allá del profile promovido.

#### Done criteria

- Evaluation Attestation (`approved-for-evaluation`) **nunca** autoriza delivery por sí sola;
- **route/profile digest** ligado al `DeliveryAuthorization`;
- enforcement solo sobre profiles promovidos por K9;
- profile desconocido **no** hereda autorización de otro profile ni del hook “global”;
- `fixed` continúa operativo para lo no promovido;
- rollout reversible por profile y por target;
- fixtures demuestran el anti-patrón prohibido (Repair promovido ≠ bloqueo de Planned/Critical/Direct);
- stale, expired, replayed, foreign, byte-mismatched **o policy-mismatched** attestation/authorization bloquea **dentro del profile**;
- cada superficie valida `valid_for` exacto y no amplía scope ni profile;
- validator no relanza modelos/reviewers ni auto-aprueba;
- interruption/retry no duplica entrega;
- bypass requiere decisión humana persistida y auditable, nunca fallback silencioso;
- threat fixtures cubren tampering, rollback, rebase, successor **y policy bundle drift**;
- el host de referencia demuestra pre-commit/pre-push/pre-PR **para el profile promovido** antes de paridad multi-target (K11a);
- fixtures de scope-changed / projection-mismatched / policy-changed / profile-mismatched nombran recovery ejecutable o `stop` honesto;
- disable/bypass no destruye attestations/authorizations históricas válidas ni inventa autoridad;
- una Evaluation Attestation emitida bajo policy A no produce Delivery Authorization si el runtime vigente es policy B;
- fixtures rechazan APIs/booleanos del estilo `isApprovedButNotReallyApproved` / confusión de kinds.

**Gate terminal:** `DeliveryAuthorization` operativo **solo** para el profile promovido en el host de referencia; `fixed`/deferred intactos para el resto. K10 puede expandir rutas **una a una** con promoción explícita; no deja P17 productivo como fail-closed global prematuro.

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

#### Compatibilidad con el producto actual

Hasta promover recetas, la tabla `routing:` de `openspec/config.yaml` sigue siendo el default. Un arreglo de first-match (lite alcanzable + clamp de hard floors K1) es **compatibilidad**, no adelanta Direct/Repair ni cambia este slice. `project.status: active` no es clasificación de change.

#### Gate de rollout

Activar una ruta cada vez, empezando Repair. Cada ruta nueva exige promoción (K9 o equivalente) **antes** de que K10-delivery la enforcee. Direct solo después de demostrar que el coste reducido no omite garantías. Ningún hook de un profile promovido bloquea profiles no evaluados.

## Bloque 11 — plataforma por slices

<a id="k11--adapters-roles-models-ownership-y-worktrees--pending"></a>

### K11a — Multi-target adapter expansion — **pending**

**Dependencias:** K10-delivery + K10 + K2a (contrato y adapter de referencia ya estables).

**Absorbe/rebasa:** P20 (expansión); O13D restante; lanes de targets.

**No redefine el primer adapter:** el Headless Conformance Host + adapter real de referencia viven en K2a. K11a solo expande.

#### Alcance

- expansión a otros targets sobre el mismo contrato K2a;
- paridad de inputs/outputs entre hosts;
- degradación y compatibilidad por capability (`enforced|partial|instructional|unavailable`);
- fixtures por host;
- metadata de los **seis** targets; K2a ya activó el de referencia; K11a no activa los cinco restantes a la vez.

#### Fuera de alcance

- reinventar `HostCapabilities` / transports (pertenecen a K2a);
- mover lifecycle o Graph semantics al adapter;
- model routing (K11b), ownership/worktrees (K11c), consolidación de roles (K11d).

#### Done criteria

- lifecycle no está duplicado por target;
- un target nuevo no cambia Graph semantics ni el contrato K2a;
- cada host adicional declara capabilities reales y fixtures de degradación;
- paridad se valida host por host contra el adapter de referencia;
- metadata reconoce seis targets sin rollout conjunto de los cinco restantes;
- ningún target nuevo cambia defaults globales.

**Gate terminal:** al menos un segundo host consume el core vía el mismo contrato, sin policy propia; desbloquea K11b.

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

## Bloque 12 — corpus y evaluación longitudinal

### K12 — corpus, events de escala y calidad longitudinal — **pending**

**Dependencias:** Minimal Kernel Harness de K2 ya disponible; vertical K4a–K8 y promoción K9 según lo que el corpus ejercite.

**Absorbe/rebasa:** P25 (telemetría a escala), P27; resto de P26 (corpus/journeys); R1; O16+O17 como vistas.

**No redefine el primer runner:** el Minimal Kernel Harness vive en K2. K12 escala corpus, longitudinal y multi-target evaluation.

#### Corpus fixtures obligatorios (14+)

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

Sobre el harness de K2 (ampliado), fixtures reciben 10–30 cambios consecutivos y miden:

- duplicación;
- interfaces/config/compatibilidad acumuladas;
- dead code y acoplamiento;
- tests frágiles;
- tiempo de modificación;
- regresiones;
- coste por candidato aprobado;
- comparación fixed/kernel;
- deuda y complejidad acumulada.

#### Evaluación multi-target

Tras K11a (según readiness): mismos journeys sobre más de un host; degradaciones honestas; sin redefinir el core.

#### Fricción de bloqueos

Además del corpus, K12 mide cómo se atasca el operador, no solo si el kernel avanza:

| Clase | Significado |
| --- | --- |
| `in_band` | La negativa nombra una continuación ejecutable que desbloquea |
| `out_of_band` | Detiene sin nombrarla |
| `by_design` | Negativa correcta sin comando posible; exige vocabulario cerrado y texto verificable |
| `dead_end` | Nada la resuelve |
| `self_recovered` | El flujo continúa sin comando extra |

La evidencia mecánica (comando nombrado y ejecutable) prevalece sobre anotaciones del corpus. El objetivo es cero `dead_end` y minimizar `out_of_band`, no reducir el número bruto de bloqueos correctos.

#### Fuera de alcance

- inventar el primer driver headless (pertenece a K2);
- cambiar defaults del kernel sin gate K9;
- auto-approve decisiones humanas.

#### Done criteria

- corpus 14+ corre sobre kernel real vía harness (extensión del de K2), sin intervención;
- decisión humana pendiente devuelve `halt`, nunca auto-approve;
- assertions validan outputs estructurales;
- event schema cubre lifecycle y coste a escala sin persistir razonamiento;
- journeys de fricción clasifican cada bloqueo y fallan ante `dead_end` nuevo;
- dos repos longitudinales completan al menos 10 cambios cada uno;
- informes comparan fixed/kernel y versión del contract suite;
- métricas de deuda/complejidad acumulada publicadas;
- evaluación multi-target (cuando K11a listo) no redefine Graph/lifecycle;
- vistas Markdown se derivan de evidencia y no cambian verdict;
- CI templates no requieren secretos en artifacts.

**Gate terminal:** corpus + longitudinal verdes; el runner mínimo de K2 ya no es el cuello de botella.

## Mapa completo: iniciativas antiguas → línea nueva

| Iniciativa | Estado heredado | Destino | Tratamiento |
| --- | --- | --- | --- |
| G0/G0.1 | done | Bloque 0 | Conservar gobernanza; actualizar corte |
| O2A | done | O2B/K9/K12 | Conservar runner y catálogo |
| O2B | done | Baseline/control | Gate inicial cerrado; conservar fixed como control para K1–K12 |
| O3 | done | K4a/K10 | Generalizar como evento |
| O4+O5/O4.1 | done | K7 | Reutilizar selector/lineage; extender niveles/lenses; precision/refutación sin reescribir machinery |
| O4.2 | done | K5/K6b | Reutilizar recovery focal |
| O6A | done | K2/K8 | Reutilizar transacción/receipt primitives |
| O20A | pending | K4a + K4b | Compile/replay (K4a) + shadow execution (K4b); sin worker autoritativo antes de K6a |
| O13A | pending | K1 | Clasificación multidimensional |
| O13B | pending | K2/K4a | Policy/compiler determinista |
| O13C | pending | K2 | Lifecycle + Minimal Kernel Harness + model-based testing |
| O13D | pending | K2a/K11a/K11d | Bridge de compatibilidad; contrato en K2a, expansión en K11a; no fin en sí |
| O19A | pending | K1 | Contract suite core |
| O7+O10 | pending | K10 | Fases → capacidades |
| O9+O11 | pending | K4a/K10 | Invalidación y recompilación |
| O8 | pending | K9 | Conservar shadow/A-B |
| O12 | pending | K10 | Conservar compatibilidad/deprecación |
| O14 | pending | K11b | Model routing por nodo |
| O15 | pending | K6b/K8/K10-delivery | Evidence/Assurance Graph; Evaluation Attestation; Delivery Authorization |
| O16+O17 | pending | K12 | Vistas derivadas |
| O18 | pending | K4a/K6a/K4b | Capsules en K6a; emisión shadow en K4b |
| O19B | pending | K2/K8/K10-delivery/K12 | Validators completos |
| R1 | pending | K2 (runner) + K8/K10-delivery/K12 | Harness mínimo en K2; consume attestations/authorizations; corpus en K12 |
| R2 | pending | R2.1–R2.7 | Siete slices subordinados; no mezclar conocimiento y evidencia |
| R4 | pending | K4a, después federación | Mismo Execution Graph |
| Target roadmaps | activos/pending según host | K2a + K11a–K11d | Contrato de referencia temprano; expansión subordinada a core estable |

No queda ninguna iniciativa transversal anterior sin destino explícito.

## Cobertura operativa P0–P27

| Propuesta | Trabajo que la entrega | Gate principal |
| --- | --- | --- |
| P0 invariantes | K1 materializa contratos; K2–K12 consumen y hacen enforcement por slice | conformance K1 sin confundir schema materializado con runtime terminado |
| P1 kernel | K2 | deterministic transitions + Minimal Kernel Harness + model-based invariants |
| P2 Execution Graph | K4a (compile/replay) + K4b (shadow orchestration) | compile antes de execute; Repair shadow |
| P3 cinco rutas | K10 | rollout una a una |
| P4 clasificación | K1/K4a | hard floors |
| P5 capacidades | K10 | semantic responsibility coverage |
| P6 clarify evento | K4a/K10 | partial invalidation |
| P7 budgets | K5 | no implicit reset |
| P8 failure routing | K5 | causal recovery |
| P9 candidate freeze | K3 | byte-level successor; cuatro identidades (`SourceSnapshot`/`WorkOrder`/`WorkResult`/`Candidate`) |
| P10 review niveles | K7 | Nivel 0 determinista; Nivel 1 generalista; Nivel 2 specialists + precision gate/criterios densos + refutación acotada de findings; performance/compatibility conditional |
| P11 loops review | K7 | frozen lineage (machinery ospec; no ledger ajeno) |
| P12 evidence strategies | K6b/K10 | Strict TDD equivalence; Assurance Graph (proyección) + invalidación selectiva |
| P13 challenges | K6c/K9 | `ChallengePlan` policy-selected; seeded defects sobre evidencia; refutación de findings → K7 |
| P14 anti-overengineering | K6d | alternatives contract |
| P15 architecture delta | K6d/K12 | candidate-bound metrics |
| P16 independencia | K6a/K4b/K6b | worker isolation → shadow Candidate → verifier/Assurance Graph |
| P17 attestation + delivery auth | K8 + K10-delivery | kinds distintos; `policy_digest` + **route/profile digest**; enforcement solo profiles promovidos |
| P18 recovery | K2/K5 | E2E transition |
| P19 schemas | K1 | CI/version pinning |
| P20 adapters | K2a (Headless Conformance Host + adapter real + CapabilityProof); K11a (expansión multi-target) | core-owned lifecycle; un host antes que paridad |
| P21 roles | K11d | measured equivalence |
| P22 model routing | K11b | node cause + target clamp |
| P23 ownership | K11c | overlap guard |
| P24 worktrees | K11c | isolated integration |
| P25 events | K2/K12 | non-authoritative telemetry (emisión en K2; escala en K12) |
| P26 headless | K2 (Minimal Kernel Harness) + K12 (corpus/journeys) | protocolo ejecutable temprano; no auto-approve |
| P27 longitudinal | K12 | 10–30 sequential changes; deuda/complejidad acumulada |

Cobertura del adjunto: 28/28 prioridades explícitamente programadas.

## Gates de promoción

### Gate A — O2B — **passed**

- baseline fixed reproducible;
- verify sin CRITICAL;
- no synthetic rows;
- state/archive terminales.

Evidencia: verify `PASS`, gate 4R `approved` y archive `openspec/changes/archive/2026-07-31-fixed-policy-reference-baseline/`.

### Gate B — kernel core

- schemas y migrations conformes;
- same state → same transition;
- Minimal Kernel Harness ejecuta reducers/comandos/interruption/replay/idempotencia/recovery/snapshots;
- model-based testing: invariantes ejecutables + puertos opacos; diferidas sin fingir enforcement;
- Authority Store CAS + OperationPermit/Receipt + effect semantics (K2.1);
- Headless Conformance Host + adapter real + CapabilityProof (K2a);
- cuatro identidades + Candidate freeze + relación básica (K3);
- no segunda autoridad;
- fixtures de confusión: `WorkResult ≠ Candidate ≠ EvaluationAttestation ≠ DeliveryAuthorization`.

### Gate C — Repair MVP

- Graph compile/replay estable + Obligation Manifest (K4a);
- shadow execution produce Candidate tras K6a (K4b);
- independent verify;
- challenges detectan defects **según ChallengePlan** (no catálogo universal);
- Evaluation Attestation stale/foreign bloqueada;
- lineage/archive sin regresión;
- vertical ejercida solo sobre el host de referencia;
- ningún worker autoritativo nuevo antes de K6a.

### Gate D — adaptive

- calidad no inferior;
- cero obligaciones/evidencia/aprobaciones perdidas;
- cero señales materiales descartadas;
- fixed/strict fallback;
- coste/latencia/complexity publicados;
- capability honesta del host de referencia.

### Gate E — delivery real

- threat model;
- `valid_for` explícito;
- no reviewer relaunch;
- Candidate/evidence/findings/**policy** binding;
- Evaluation Attestation (K8) ≠ DeliveryAuthorization (K10-delivery);
- route/profile digest; enforcement **solo** profiles promovidos por K9;
- profiles no promovidos → `fixed` o `unmanaged/deferred` (sin herencia);
- rollout reversible por profile y target;
- revalidación live de `PolicySnapshot` / `policy_digest`;
- invalidación, expiry y replay protection;
- recovery/reconciliation;
- pre-commit/pre-push/pre-PR fail-closed vía `DeliveryGateTransport` **del profile promovido**.

### Gate F — expansión multi-target

- adapter de referencia ya estable (K2a);
- segundo host (y siguientes) sobre el mismo contrato;
- degradation semantics y fixtures de paridad;
- rollout secuencial; ningún host nuevo redefine el core.

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
| Host de referencia (K2a; uno de los seis) | Adapter único + transports; vertical K4a–K10 | Lifecycle/Graph/policy propia en el adapter |
| Claude Code | Revalidación oficial y fixes independientes | Lifecycle/Graph variants propias; segundo adapter antes de K11a |
| VS Code | Hooks/validators independientes | Kernel duplicado |
| Codex | Revalidar hooks/decision control | Evidence/authorization alternativo |
| GitHub Copilot | Investigar capacidades vigentes | Model routing propio |
| OpenCode | Migrar capabilities deprecadas | Worktree semantics propias |
| Cursor | Revalidación oficial y fixes independientes | Lifecycle/Graph variants propias; segundo adapter antes de K11a |

Reglas:

- El harness reconoce **seis** targets (Claude Code, VS Code, GitHub Copilot, OpenCode, Codex, Cursor);
- K2a elige **uno** como host de referencia por capacidad reproducible; K11a expande el mismo contrato a los **cinco** restantes;
- metadata reconoce seis targets;
- revalidación oficial al abrir change;
- capability real, no aspiracional;
- contrato común primero (K2a); expansión después (K11a);
- paridad con mismo input contra el adapter de referencia;
- ningún target cambia defaults globales.

### CX — eficiencia de contexto (no bloqueante)

Lane subordinada para reducir amplificación sin mover autoridades, defaults ni ruta crítica. K4a sigue siendo el único `ExecutionGraphCompiler`; `InputProjectionBuilder` solo deriva `ContextProjection` desde Graph/`capsule_inputs` y referencias canónicas. CX0 puede iniciar en paralelo a K6d.

| Slice | Estado / dependencia | Entrega y gate |
| --- | --- | --- |
| CX0 — medición | `pending`, elegible en paralelo a K6d | Tokens input/cached/uncached/output, artifact read/write, tool output, contexto único/duplicado, amplification y fallback; cada dato con schema/version, fuente y cobertura; P50/P90 por fase, clasificación, profile y host. |
| CX1 — envelope/state mecánico | `pending`, tras CX0 + K2/K2.1 | Migración gradual a envelope JSON-only + renderer humano y `PhaseCompletionReducer`; schemas versionados, legacy adapter, CAS/replay y fallback. Approvals, assumptions, gates, lineage y decisiones no se infieren ni cambian de autoridad. |
| CX2 — views/archive renderer | `pending`, tras CX0/CX1 | Reconciliation/compliance/traceability como vistas derivadas; inventario, hashes, fechas y status de archive desde `archive-plan` + receipt. El agente conserva summary, riesgos y decisiones semánticas. |
| CX3 — proyección shadow | `pending`, tras CX0 + K4a/K6a | `ContextProjection` content-addressed, reproducible, descartable y read-only; comparación `full` vs `compiled-shadow`, sin dispatch compacto todavía. |
| CX4 — protocolos/bootstrap | `pending`, tras CX3 | Reglas compactas y módulos on-demand validados contra la proyección; no retirar compatibilidad full hasta promoción por fase/profile. |
| CX5a — verify/evidence | `pending`, tras CX3/CX4 + K6b/K6c | Proyección para verify reutilizando collectors, receipts, provenance y Assurance Graph; ningún evidence store ni verdict nuevo. |
| CX5b — review | `pending`, **después de K7** + CX3/CX4 | Inputs por lens/correction sobre candidate/findings/paths/slices congelados; no reduce reviewers, no relanza discovery, no crea `.review`; no bloquea K7/K8. |
| CX6 — spec deltas | `pending` (deferred), tras IDs estables + evidencia de CX3–CX5 | `base_hash`, merge canónico, loss validation, round-trip y fallback full-copy antes de habilitar deltas quirúrgicos. |

#### Promoción, rollback y DoD

`full → compiled-shadow → compiled` es un modo de input por **fase/profile**, no una route nueva. `compiled-shadow` calcula y compara cobertura/digests pero despacha `full`; `compiled` despacha la proyección solo tras equivalencia. Cualquier mismatch, stale source, overflow sin partición dependency-closed o hard floor ausente revierte a `full` compatible o termina fail-closed con causa tipada; nunca trunca contexto. Los attempts/budgets K5 siguen siendo monótonos.

Done exige cero obligaciones o señales materiales perdidas, cero regresión de integridad/assurance/trazabilidad y ningún aumento demostrado de escaped defects en los fixtures aplicables. Todo fallback queda reason-coded y medido; rollback a `full` no altera state semántico, Candidate, evidence, review lineage ni delivery.

Encaje no bloqueante: K9 incorpora a su A/B las señales CX disponibles; K10 deriva budgets de classification/risk con hard floors; K11b puede comparar coste/calidad del model routing sobre la misma proyección; K12 valida amplification, fallback e integridad longitudinal. CX no adelanta ni se vuelve prerequisite de esos slices.

#### Hipótesis iniciales para CX0

No son compromisos ni evidencia actual: CX0 debe ratificarlas o corregirlas antes de convertirlas en gates.

| Cohorte/KPI | Hipótesis inicial |
| --- | ---: |
| Normal median / P90 input | `-45 %` / `-30 %` |
| Lite median | `-60 %` |
| High-risk median | `-25 %` |
| Bootstrap / duplicación / amplification / fallback full | `≤4k tokens` / `≤15 %` / `≤3x` / `≤10 %` |

El registro histórico de K4a (`5.478.420` prompt tokens; `70,9 %` en review registrado) sirve para detectar patología, no como baseline del 4R actual ni como prueba causal: `artifact_tokens` y `tool_output_tokens` aparecen a cero y la cobertura es insuficiente.

### R2 — Foundation + OpenWiki

R2 sigue subordinado al core. Puede avanzar por slice solo si no toca lifecycle, Execution Graph, Candidate/evidence authority ni defaults adaptive.

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

Es posterior a K4a/K4b/K8/K12 base:

1. subgraphs intra-repo;
2. contratos compartidos;
3. provider → consumers;
4. verify federado;
5. archive coordinado.

Cada child conserva clasificación, Candidate ID y receipt propios.

Un Change Program (objetivo → children OpenSpec + cursor, ver investigación `proportional-process-and-change-program`) **no es R4** y no adelanta este slice ni crea ruta `epic`. `/sdd-continue` sigue reanudando un change; chained PRs siguen siendo `delivery_strategy` intra-change.

## Métricas por bloque

- transitions deterministas y contract failures;
- obligaciones/requisitos perdidos;
- Candidate/receipt mismatches;
- recoveries ejecutadas, fallidas y terminales;
- budgets agotados;
- invocaciones, tokens input/cached/uncached/output, tools, tiempo y coste;
- artifact read/write y tool-output tokens con schema/version, fuente y cobertura;
- contexto único/duplicado, ratio de duplicación, amplification y fallback `compiled → full`;
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
| Perder la baseline O2B | Fixed publicado como control y protegido por gates posteriores |
| Reescribir lineage/archive | Compat adapters y regression fixtures |
| Portar RDD/CLI Gentle como 2ª autoridad | Absorber solo ventajas en K7/K8/K10-delivery; rechazar `review-integration` ajeno |
| Attestation sin freeze | K3 bloquea Evaluation Attestation (K8) |
| Attestation sin PolicySnapshot | K8 liga `policy_digest`; K10-delivery revalida live |
| “Delivery receipt” que no autoriza delivery | K8 = Evaluation Attestation; K10-delivery = `DeliveryAuthorization` (nunca «Receipt») |
| `isApprovedButNotReallyApproved` | Kinds discriminantes; prohibir booleanos ambiguos entre evaluación y delivery |
| Hook global tras promover Repair | K10-delivery solo enforcea el profile K9; resto fixed/deferred; no bloquear Planned/Critical/Direct |
| Challenges universales en K6c | `ChallengePlan` por policy/strategy; skipped auditado; no quemar tokens |
| Assurance Graph como autoridad | Proyección derivada en K6b/K7; OpenSpec/Git/Candidate mandan |
| Successor ⇒ reejecutar todo | Invalidación selectiva por closure de `AssuranceEdge`; conservar independiente |
| Overbuild de K2 | Solo invariantes ejecutables + puertos opacos; diferidas sin fingir enforcement |
| K6a conoce Repair | K6a = primitives; K4b = orchestrator; dependencia K4b→K6a solamente |
| Primer runner solo en K12 | Minimal Kernel Harness en K2; K12 = corpus/longitudinal/multi-target |
| TLA+ como gate de K2 | Model-based exhaustivo sobre espacio pequeño primero; TLA+ solo si scheduler/worktrees/federación lo exigen |
| Agentes simplificados prematuramente | P21 queda en K11d tras work orders, scheduler y adapters estables |
| Cinco targets/rutas/worktrees simultáneos | Rollout uno a uno; seis targets en metadata; primer adapter en K2a, cinco restantes en K11a |
| Adapter mínimo solo en K11a | Adelantar Headless Conformance Host + adapter real a K2a; Authority Store en K2.1; K11a = expansión |
| K4 compile+execute juntos | K4a compiler/replay; K4b shadow execution solo tras K5+K6a |
| Worker autoritativo antes de aislamiento | Ningún runtime nuevo con autoridad hasta K6a; K4a solo fixtures/replay |
| Retirar Strict TDD sin equivalencia | Gates K6b/K6c/K9 |
| Dos sistemas permanentes | Gate de rebase O20/O13/O15/O18/O19/R1 |
| Execution Graph burocrático | Nodos semánticos, lint y coste medido |
| Eventos como autoridad | Store separado y state-derived |
| Model escalation arbitraria | Cause code + clamp |
| Métricas como límites ciegos | Architecture delta advisory, riesgo por impacto |
| Proyección como segunda autoridad | `InputProjectionBuilder` read-only; source digests + cobertura; divergencia fail-closed; Graph/OpenSpec/state/Candidate/evidence/lineage/delivery conservan ownership |
| Budget recorta garantías | Cierre completo, partición dependency-closed o fallback/stop; nunca truncado; hard floors y attempts K5 intactos |
| Migrar envelope/state de golpe | CX1 versiona, ejecuta shadow, conserva legacy/CAS/replay y retira solo tras equivalencia |
| Optimizar desde telemetría histórica incompleta | CX0 separa observado/derivado/estimado y cobertura; targets numéricos permanecen hipótesis |
| First-match `active` = ciclo completo | Tabla viva: clase + hard floors antes que `project.status`; no esperar a Direct K10 ni meterlo en K6b |
| Objetivo grande = un change + PRs | Change Program (nombrado, sin slice); no R4, no `delivery_strategy`, no segundo orquestador |
| Compact resetea linaje | Sesión nueva + `/sdd-continue {nombre}`; candidate/budgets/findings persisten |

## Gotchas vigentes

- `analisis-fino/` no es autoridad.
- O2B está archivado con verify `PASS` y gate 4R `approved`; no reabrir el antecedente de proveniencia ya resuelto.
- Clarify es condicional y evolucionará a evento, no fase universal.
- No relanzar reviewers tras congelar findings.
- No resetear lineages, budgets o attempts por retry/interrupción.
- No emitir Evaluation Attestation ni Delivery Authorization para working tree mutable.
- No emitir Evaluation Attestation sin `policy_digest` / `PolicySnapshot` verificable.
- No llamar “delivery receipt” ni «Delivery Authorization Receipt» a la attestation de K8 ni a la authorization de K10-delivery; Receipt = `ArchiveTransactionReceipt` / envelope legacy `receipt/v1`.
- No introducir booleanos ambiguos entre evaluación y delivery.
- No instalar enforcement global en K10-delivery: solo el profile promovido por K9; el resto permanece fixed/deferred.
- No ejecutar el cuarteto de challenges de K6c como pasos universales; exigir `ChallengePlan` proporcional.
- No tratar el Assurance Graph como autoridad ni reejecutar verify/review completo si el closure selectivo basta.
- No aplazar el primer runner headless a K12; el Minimal Kernel Harness es obligación de K2.
- No exigir TLA+ en K2; sí exigir modelo reducido + exploración + siete invariantes mínimas en CI.
- No ejecutar worker runtime nuevo con autoridad en K4a; compile/replay primero, shadow execution en K4b tras K6a.
- No importar `gentle-ai.review-integration`, compact store ajeno ni `review-ledger.md` como autoridad paralela al lineage OpenSpec.
- No fusionar Judgment Day al gate 4R; permanece on-demand.
- No finalizar evidencia antes de identificar qué `candidate_id` fue verificado.
- No tratar Markdown libre como contract de autoridad.
- No activar routing dinámico de modelos antes de K9.
- No retirar fixed/aliases sin deprecación.
- No duplicar lifecycle en adapters.
- No mezclar R2 con evidence authority.
- No crear ruta rígida `epic`; R4 consume Execution Graph.
- No tratar Change Program como R4, K10 Planned o `delivery_strategy`.
- No absorber first-match ni Change Program en K6b.
- No resetear candidate, findings, budgets o attempts al compactar o abrir sesión.
- No usar `project.status: active` como catch-all permanente frente a lite/hotfix con floors.
- No atribuir modelos/herramientas en commits o PRs.
- No reabrir K1 ni mutar `receipt/v1` para expresar Attestation/Authorization; schemas propios en K8/K10-delivery.
- No inventar `candidate_digest`; el campo canónico es `candidate_id`.
- No tratar `commit` como `Candidate.projection`; solo `workspace|staged`.
- No introducir un segundo Context Compiler, evidence store o review ledger; CX solo deriva proyecciones.
- No crear rutas Nano/Lite/Medium/Full para budgets de contexto ni sacrificar hard floors por tokens.
- No activar CX6 sin stable IDs, `base_hash`, merge/loss validation, round-trip y fallback full-copy.

## Historial consolidado

- 2026-07-02/10: kernels iniciales, telemetría, integridad contractual, evals y target roadmaps.
- 2026-07-14/15: O2A y O3.
- 2026-07-17/18: G0/G0.1 y O4+O5.
- 2026-07-18/26: O4.1, O4.2 y O6A entregados; se formula O20A.
- 2026-07-28/29: O2B alcanza conformidad funcional y queda temporalmente `blocked` por un único CRITICAL de proveniencia Strict TDD histórica.
- 2026-07-29: la visión P0–P27 se fusiona con el programa: O2B → K1–K12, preservando kernels entregados y fixed como control.
- 2026-07-31: un replay limpio resuelve la proveniencia Strict TDD; O2B obtiene verify `PASS`, supera el gate 4R, se archiva y se publica en v2.36.0. K1 pasa a ser la iniciativa activa y bloquea K2.
- 2026-08-03: reconciliación documental post-O2B: se afilan K1–K3/K12 y la arquitectura (transición ejecutable, paridad de superficies, proyección de candidato, fricción de bloqueos) sin cambiar la ruta crítica.
- 2026-08-03: comparativo Gentle AI reviewers → ventajas absorbidas solo donde refuerzan la dirección existente: K7 (precision gate, criterios de lente, refutación acotada), K6c (límite de scope vs K7), K8/K10-delivery (threat/bypass/live re-derive propios). Sin iniciativas paralelas ni CLI/RDD ajeno.
- 2026-08-03: K1 (`k1-contract-suite`) cierra con verify PASS, 4R approved, archive transaccional y v2.37.0; K2 queda desbloqueado.
- 2026-08-04: reconciliación operativa del roadmap: versión de referencia → v2.37.2; K1 permanece `done`; K2 pasa a next-eligible (no “activo”/bloqueante); diagrama de dependencias alineado con la tabla ejecutiva.
- 2026-08-04: se adelanta el adapter de referencia: K2a Reference Host Contract tras K2; K11a pasa a Multi-target adapter expansion. Columna vertebral K2→K12 intacta.
- 2026-08-04: K3/K6a formalizan cuatro identidades distintas (`SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`) y la cadena WorkResult → integrate → Candidate; `EvaluationAttestation ≠ DeliveryAuthorization`.
- 2026-08-04: K4 se parte: K4a Graph compiler/replay (sin worker autoritativo) → K5 → K6a → K4b Repair shadow execution → K6b….
- 2026-08-04: se introduce `PolicySnapshot` verificable: produce/consume en K4a/K7, binding en K8 (`policy_digest`), comparación en K9, revalidación live en K10-delivery.
- 2026-08-04: Evidence Refs → Assurance Graph (proyección content-addressed) en K6b; K7 usa invalidación selectiva de evidencias/lenses ante successor.
- 2026-08-04: Minimal Kernel Harness adelantado a K2; K12 queda como corpus (14+), longitudinal (10–30) y evaluación multi-target.
- 2026-08-04: K2 incorpora model-based testing (modelo reducido + exploración + 7 invariantes); TLA+ diferido hasta complejidad de scheduler/worktrees/federación.
- 2026-08-04: K8 = CandidateEvaluationAttestation; K10-delivery = DeliveryAuthorization (kinds distintos; se abandona «Delivery Authorization Receipt»; `receipt/v1` permanece legacy K1).
- 2026-08-04: K10-delivery acotado al profile promovido por K9; route/profile digest; fixed/deferred para no promovidos; rollout reversible.
- 2026-08-04: K6c adopta `ChallengePlan` policy-selected (selected/skipped/reasons/budget); challenges dejan de ser cuatro pasos universales.
- 2026-08-04: precisión post-análisis: Execution Graph / Assurance Graph; taxonomía ArchiveTransactionReceipt / CandidateEvaluationAttestation / DeliveryAuthorization; invariantes K2 por madurez; ownership K6a primitives ↔ K4b orchestrator; regla de justificación de slices; sync con arquitectura.
- 2026-08-04: reconciliación pre-K2: `candidate_id` canónico; `Candidate.projection` = workspace|staged; seis targets (1 reference + 5 expansión); mapa operación→slice; nota de migración `receipt/v1` → schemas propios K8/K10-delivery; anchors legacy conservados como alias.
- 2026-08-04: K2 (`k2-lifecycle-kernel`) cierra con verify PASS, 4R approved, archive y v2.38.0; versión de referencia alineada a v2.38.0.
- 2026-08-04: reconciliación post-análisis Authority Store: se inserta **K2.1** (CAS / OperationPermit / effect semantics) entre K2 y K2a; K2a pasa a Headless Conformance Host + adapter real + CapabilityProof; deltas en K3 (relación básica), K4a (Obligation Manifest), K5 (budgets de autoridad/efectos), K6b (provenance), K7 (ReviewAdapter/Reducer), K8 (emisión CAS), K9 (checkpoints), K10-delivery (relación por etapas). Next-eligible: K2.1 (`k2-1-authority-store-permits`). No es un “OSPEC v3” paralelo.
- 2026-08-04: K2.1 (`k2-1-authority-store-permits`) cierra con verify PASS, 4R approved (8 bloqueantes remediados), archive y v2.39.0; K2a queda next-eligible; versión de referencia alineada a v2.39.0.
- 2026-08-05: K2a (`k2a-headless-conformance-host`) cierra con verify PASS WITH WARNINGS, 4R approved (4 CRITICAL remediados), archive y v2.40.0; versión de referencia alineada a v2.40.0.
- 2026-08-05: k2a-1 (`k2a-1-live-capability-probes-async-transports`) cierra con verify PASS WITH WARNINGS, 4R approved (4 CRITICAL remediados); plan archive emitido; K3 queda next-eligible; transacción runtime pendiente.
- 2026-08-25: K4b (`k4b-correctness-remediation`) permanece `in-progress` hasta archive; **no está `done`**. Tabla ejecutiva y sección detallada reconciliadas (antes: tabla `done` / sección `next-eligible`). K6b pasa a `blocked` y no es next-eligible.
- 2026-08-26: K4b (`k4b-correctness-remediation`) cierra con verify PASS WITH WARNINGS, 4R approved, archive transaccional y v2.48.1; K6b queda next-eligible.
- 2026-08-26: K4b (`k4b-integration-invariants-remediation`) cierra invariantes de integración (malformed diffs, cápsula mínima, DAG, store 1:N, proyección) con verify PASS, 4R approved y v2.48.2. K6b permanece next-eligible.
- 2026-08-26: K4b (`k4b-mode-only-and-baseline-projection`) cierra mode-only (path/`old mode`) y baseline graph-bound con verify PASS, 4R approved (0 hallazgos) y v2.48.3. K6b permanece next-eligible.
- 2026-08-27: el orquestador publica el briefing funcional D2 (`orchestrator-intent-briefing`) en v2.49.0; K10 sigue pendiente para generalizar `clarify-intent` como receta. K6b permanece next-eligible.
- 2026-08-27: reconciliación aditiva (sin mover ruta crítica ni next-eligible): se nombra la distinción proceso intra-change vs Change Program inter-change; first-match de la tabla viva es compatibilidad, no K10; K6b/R4/K10 no absorben ese hueco. Investigación no normativa `docs/architecture/research/proportional-process-and-change-program.md`. Arquitectura: corte conceptual de la misma fecha; deuda stale K3/K4a/K5/K6a/K4b reconciliada.
- 2026-08-27: K6b (`k6b-verifier-evidence-assurance-graph`) entra en apply: verifier independiente, evidence strategies/provenance y Assurance Graph proyección `implemented`; autoridad independiente del grafo, K6c/K7/K8 permanecen `target`. K6c queda next-eligible.
- 2026-08-27: K6b cierra con verify PASS, 4R approved y archive transaccional; publicado en v2.50.0. K6c queda next-eligible.
- 2026-08-27: K6b entra en `revise` (`k6b-verification-integrity-remediation`): cobertura MUST, assessments persistibles, provenance de collector, `graph_id` canónico y proyección fail-closed. K6c pasa a `blocked-by-K6b-remediation` hasta archive de esa remediación.
- 2026-08-27: K6b (`k6b-semantic-integrity-remediation`) entra en apply para remediar B1–B3/H1–H3; K6b queda `revise` y K6c `blocked-by-K6b-remediation` hasta archive.
- 2026-08-28: K6b (`k6b-semantic-integrity-remediation`) cierra con verify PASS, 4R approved y archive transaccional; publicado en v2.52.0. K6c queda next-eligible.
- 2026-08-28: review terminal del tag v2.53.1 reabre K6b como `revise`: RunnerReceipt no demuestra autoridad ni binding exacto, chronology no exige `run_id`/chain completos y replay permite omitir bytes. K6c vuelve a `blocked-by-K6b-terminal-review`.
- 2026-08-28: remediación focal publicada en v2.54.0: `runner-receipt/v1` por canal opaco con EvidenceId obligatorio y outcome coherente; causal chain completa; replay exige bytes o blob content-addressed. Dominios K6b enrolados y reconciliados. Pendiente terminal review, sin promover aún K6b ni iniciar K6c.
- 2026-08-28: `k6b-durable-replay-receipt-authority` aplica persistencia CAS `runner_receipts`, rehidratación/reemisión de canal y bind de role en replay. K6b sigue `revise`; K6c permanece `blocked` hasta archive de este change.
- 2026-08-28: K6b (`k6b-durable-replay-receipt-authority`) cierra con verify PASS WITH WARNINGS, 4R approved (CRITICAL de type-confusion remediado) y archive transaccional; publicado en v2.55.0. K6b pasa a `done`; K6c queda `next-eligible`.
- 2026-08-31: K6c (`k6c-integrity-remediation`) cierra con verify PASS, 4R approved (3 CRITICAL remediados) y archive transaccional; publicado en v2.56.1. K6c permanece `done` con integridad cerrada; K6d queda `next-eligible`.
- 2026-08-31: K6c (`k6c-failclosed-integrity`) cierra el NO-GO residual: strategy binding en verifier/projector, `missing_tests`/no-op fail-closed, planner TypeError y `required` único + metaschema. Verify PASS WITH WARNINGS; 4R approved. Publicado en v2.56.2. K6c permanece `done`; K6d sigue `next-eligible`.
- 2026-08-31: K6c (`k6c-budget-execution-failclosed`) remedia el enforcement de `mutation_budget` con consumo monotónico inline y causal failure `CHALLENGE_BUDGET_EXHAUSTED` inmediato, y clasifica estrictamente errores de spawn (`spawn_error`) y timeouts para impedir falsos positivos en `defects_detected`. Verify PASS; 4R approved. Publicado en v2.56.4. K6c queda cerrado en su totalidad; K6d permanece `next-eligible`.
- 2026-08-31: se añade la lane subordinada CX para medir y reducir amplificación de contexto mediante proyecciones derivadas, sin mover `K6d` ni la ruta crítica; targets numéricos quedan como hipótesis hasta CX0.
