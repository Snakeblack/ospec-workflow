# Arquitectura objetivo — harness gobernado por kernel, grafo y evidencia

> **Autoridad:** fuente conceptual y estratégica del harness (responsabilidades y límites).
> **Corte documental:** v2.56.4, 2026-08-31 (estado alineado al roadmap; la dirección conceptual no cambia).
> **Estado verificado:** O3, O4+O5/O4.1, O4.2, O6A, O2B, **K1**, **K2**, **K2.1**, **K2a**, **K3**, **`k3-readiness-remediation`**, **K4a**, **K5**, **K6a**, **K4b**, **K6b** y **K6c** están cerrados. **K6d** es `next-eligible`. OpenSpec/Git/Candidate siguen siendo la única autoridad semántica; el Assurance Graph es proyección.
> **Roadmap:** orden, estado operativo y done criteria viven en [`../roadmaps/harness-evolution.md`](../roadmaps/harness-evolution.md).
> **Precedencia documental:** ante diferencias de **orden o estado**, prevalece el roadmap; ante diferencias **conceptuales**, reconciliar antes de iniciar el slice.
> **Investigación no normativa:** la trazabilidad completa P0–P27 vive en [`research/harness-kernel-graph-evidence-roadmap-fusion.md`](research/harness-kernel-graph-evidence-roadmap-fusion.md). La proporcionalidad de proceso y el programa de changes viven en [`research/proportional-process-and-change-program.md`](research/proportional-process-and-change-program.md).

## Decisión

El harness evoluciona hacia un **kernel determinista que compila intención y contratos semánticos en un Execution Graph**, autoriza transiciones tipadas y liga verificación, review y entrega a un **Assurance Graph** (proyección de evidencia) y a una identidad inmutable de candidato.

Esta dirección no es una reescritura ni un “OSPEC v3” paralelo. Se construye generalizando los kernels ya entregados de clarify, review/linaje, recovery focal y archive transaccional, con deltas concretos sobre K2–K12. OpenSpec y Git siguen siendo la autoridad del change; el runtime gobierna lifecycle, **Authority Store (CAS)**, permisos, budgets, digests y efectos mecánicos; los modelos conservan el trabajo semántico y **no** se aprueban ni se conceden permisos a sí mismos.

O2B cerró la baseline fixed-policy de control. K1 materializó la contract suite declarativa. K2 materializó lifecycle + Minimal Kernel Harness. El cambio de defaults sigue bloqueado hasta superar shadow/A-B (K9) y los gates posteriores. Fixed permanece control/default.

### Corte conceptual 2026-08-04 (reconciliación con roadmap)

Sin duplicar el backlog: solo responsabilidades y límites alineados al roadmap operativo.

| Tema | Decisión arquitectónica |
| --- | --- |
| Estado | K1+K2+K2.1+K2a+K3+`k3-readiness-remediation`+K4a+K5+K6a+K4b+K6b+**K6c** `done`; **K6d** `next-eligible` |
| Dos grafos | **Execution Graph** (trabajo) ≠ **Assurance Graph** (fiabilidad / evidencia; no “prueba formal”) |
| Identidades | `SourceSnapshotId` / `WorkOrderId` / `WorkResultId` / `CandidateId` (sin IDs nuevos por ahora) |
| Relación Candidate | Inicial: `exact` / `changed` / `ambiguous` / `unknown`; `compatible-base-advance` experimental hasta K9 |
| Authority | **K2.1:** CAS obligatorio, `TransitionOffer` ≠ `OperationPermit` ≠ `OperationReceipt`, clases de efecto |
| Proyección | `Candidate.projection` solo `workspace\|staged` (`candidate/v1`); un commit puede origenar `SourceSnapshot`, no es tercera proyección de Candidate |
| Policy | `PolicySnapshot` digiere bundle/classifier/compiler/runtime/`effectiveRules` |
| Cierre | `ArchiveTransactionReceipt` ≠ `CandidateEvaluationAttestation` ≠ `DeliveryAuthorization` |
| Schemas de cierre | `receipt/v1` (K1, envelope legacy genérico) permanece; K8 y K10-delivery introducen schemas propios — no reutilizar `receipt/v1` como contrato canónico |
| Receipt de ejecución | K6b usa `runner-receipt/v1`, content-addressed y Evidence-bound; records persisten en CAS `runner_receipts`; solo un canal opaco de runtime (reemitido tras restart) concede autoridad. Strings issuer/transport no bastan. |
| Host | Seis targets; **K2a** = Headless Conformance Host + un adapter real + CapabilityProof; **K11a** expande a los cinco restantes |
| Obligations | **K4a:** Obligation Manifest como vista determinista del Graph (no tercer grafo) |
| Compile vs execute | **K4a** compila; **K6a** ejecuta (primitives); **K4b** orquesta Repair shadow; **K3** identifica |
| Runner | Minimal Kernel Harness + model-based (invariantes por madurez) en **K2**; corpus/longitudinal en **K12** |
| Delivery | Primer enforcement productivo solo del **profile promovido por K9**; resto `fixed` / unmanaged |

```text
Change Contract → Execution Graph → Candidate → Assurance Graph → Attestation / Authorization
```

### Corte conceptual 2026-08-27 (proporcionalidad y programa)

Añade límites; **no** mueve next-eligible, no reabre `done` y no crea un slice nuevo. Argumentación en la [investigación no normativa](research/proportional-process-and-change-program.md).

| Tema | Decisión arquitectónica |
| --- | --- |
| Dos escalas | **Proceso intra-change** (receta/capacidades) ≠ **descomposición inter-change** (lista de OpenSpec changes). No se resuelven con el mismo mecanismo. |
| Tabla viva vs K10 | `lite`/`standard`/`hotfix`/… son el producto actual. Direct/Repair/Bounded/Planned/Critical siguen siendo recetas K10. No se fusionan ni se adelanta Direct. |
| First-match | `project.status: active` no puede impedir evaluar clase. Eso es **compatibilidad del default actual**, no activación de recetas ni cambio de K9. Hard floors K1 clampan: auth/migración/API no bajan a lite. |
| Change Program | Nombre del hueco: children OpenSpec + `depends_on` + cursor persistido. No es `delivery_strategy`, no es K10 Planned (grafo intra-change) y no es R4 (federación/epic). **Sin slice y sin segundo orquestador.** |
| K6b | Alcance intacto: verifier, strategies, provenance, Assurance Graph. No absorbe first-match ni Change Program. |
| Contexto | Prompt de worker/fase efímero; contrato, candidate, budgets, findings y evidencia persistentes. Compact/sesión nueva no resetea linaje. `/sdd-continue {nombre}` reanuda un change; no una cola. |
| Rechazado | `architect-agent`, fase `architecture`, ruta `epic`, pipeline de cinco agentes, agentes espejo `*-cheap`, milestone paralelo. |

### Corte correctivo 2026-08-28 (fronteras K6b)

El review terminal de v2.53.1 no cambia la dirección del kernel, pero obliga a materializar dos interfaces que antes eran solo intención arquitectónica.

| Tema | Decisión arquitectónica |
| --- | --- |
| RunnerReceipt | DTO caller-owned ≠ autoridad. `runner-receipt/v1` requiere EvidenceId y receipt_id; el verifier solo lo acepta desde una capacidad opaca registrada por el runtime. |
| Matching | Solo igualdad de `evidence_id`, `candidate_id` y `node_id`; no posición, no nodo como fallback, no `node.kind` como role. |
| Outcome | Un receipt fallido puede probar RED, pero no declarar `satisfied_tokens`. |
| Chronology | Un run no vacío, ordinales únicos y cada transición enlaza el EvidenceId inmediatamente anterior. |
| Replay | Cada Evidence lleva bytes inline o blob CAS resoluble. Sin material no hay recomputación criptográfica y el replay falla con `GRAPH_DIVERGENCE`. |
| Persistencia | Records `runner-receipt/v1` viven en CAS `runner_receipts` (raíz del registro). Tras restart se rehidratan y se reemite un canal opaco **nuevo**. El WeakMap no se serializa. |
| Role en replay | `normalizeRole(assessment.role)` debe coincidir con el del receipt; mismatch → `GRAPH_DIVERGENCE` aunque `assessment_id` se recalcule. |
| Gate | K6b `done` en v2.55.0 (persistencia durable + bind de role en replay). K6c es next-eligible. |

### Corte conceptual 2026-08-28 (K6c adversarial challenges)

| Tema | Decisión arquitectónica |
| --- | --- |
| Selección | `ChallengePlan` proporcional por estrategia y `PolicySnapshot` con fingerprint SHA-256; sin suite universal. |
| Evidencia | Resultados de challenges (`challenge-result/v1`) como evidencia complementaria en `verifyCandidate`; nunca autoridad de delivery. |
| Presupuesto | `ChallengeBudget` monótono; agotamiento produce `causal-failure/v1` con `CHALLENGE_BUDGET_EXHAUSTED` (validation_gap) sin reintentos idénticos. |
| Complacencia | Mutaciones focales y rechazo estricto de tests complacientes (`COMPLACENT_TEST_DETECTED`) y tautológicos (`TAUTOLOGICAL_TEST_DETECTED`). |
| Integridad | Plan y resultados se ligan canónicamente a Candidate, nodo, estrategia y PolicySnapshot; la ejecución es aislada y fail-closed; el verifier exige el conjunto exacto; la proyección/replay no es autoridad. |
| Gate | K6c `done` en v2.56.0; integridad cerrada en v2.56.1 (`k6c-integrity-remediation`); fail-closed residual cerrado en v2.56.2 (`k6c-failclosed-integrity`). K6d es `next-eligible`. |

### Corte propuesto 2026-08-31 (eficiencia de contexto, no bloqueante)

El diagnóstico cambia el **transporte y la proyección** del contexto, no las autoridades ni la ruta crítica. La ejecución se planifica en la [lane CX del roadmap](../roadmaps/harness-evolution.md#cx--eficiencia-de-contexto-no-bloqueante).

| Madurez | Conclusión |
| --- | --- |
| Confirmado | Existe amplificación por relectura de contexto, la telemetría no separa con cobertura fiable tokens cached/uncached, artefactos y tools, y los contratos actuales repiten salida humana/JSON y matrices equivalentes como vistas. |
| Capacidad parcial | K4a ya aporta el único `ExecutionGraphCompiler` autoritativo y produce `capsule_inputs`; K6a los materializa. K6b/K6c ya aportan collectors, receipts, provenance y Assurance Graph. Faltan proyección por consumidor, medición completa y reducción mecánica de salida/state end-to-end. |
| Hipótesis | Los porcentajes de ahorro y umbrales de contexto propuestos son objetivos iniciales que CX0 debe ratificar o corregir; no son resultados demostrados ni justifican reducir assurance. |

El histórico de K4a registró `5.478.420` prompt tokens y `3.883.947` en la familia review/4R/correction (`70,9 %`). Confirma una **patología histórica** de consumo, no una baseline del protocolo 4R actual: con `artifact_tokens` y `tool_output_tokens` registrados como cero no permite atribuir causalidad ni cuantificar ahorro por intervención.

## Ruta rápida

1. [Modelo de autoridad](#modelo-de-autoridad).
2. [Cadena canónica](#cadena-canónica-del-change).
3. [Kernel y Execution Graph](#kernel-determinista-y-execution-graph).
4. [Proyecciones y budgets de contexto](#proyecciones-de-entrada-y-budgets-de-contexto-propuesta-cx).
5. [Rutas y capacidades](#clasificación-rutas-y-capacidades).
6. [Migración sin big bang](#estrategia-de-migración).
7. [Qué es hecho, target o hipótesis](#registro-de-madurez).

## Propósito del producto

`ospec-workflow` es un harness Spec-Driven Development multi-target para ejecutar cambios con garantías proporcionales a impacto e incertidumbre.

Debe:

- comprender intención, restricciones, contexto y riesgo;
- conservar trazabilidad entre contrato, grafo, diff, evidencia, findings y entrega;
- pedir decisiones humanas solo cuando sean materiales;
- mantener cambios simples pequeños;
- adaptar profundidad sin omitir garantías necesarias;
- recuperar fallos mediante transiciones ejecutables;
- declarar qué garantiza cada target;
- explicar por qué ejecutó, omitió, escaló o detuvo cada unidad.

La promesa no es producir más fases o documentos. Es **compilar el mínimo trabajo que demuestre el cambio correcto y gobernarlo con contratos verificables**.

## Modelo de autoridad

### Precedencia

```text
código + OpenSpec baseline/changes + Git
  → arquitectura activa
  → roadmap general
  → roadmaps de target
  → análisis e investigación
```

| Superficie | Autoridad | Restricción |
| --- | --- | --- |
| OpenSpec + Git | Estado semántico y bytes del change | Ninguna proyección puede contradecirlos. |
| Kernel runtime | Transiciones, **Authority Store (CAS)**, budgets, permisos (`OperationPermit`), digests y efectos mecánicos tipados | No interpreta semántica libre. Modelos no emiten permits. |
| Modelos | Descubrimiento, contrato, diseño, implementación, diagnóstico y review | No se conceden aprobación ni siguiente transición. |
| Execution Graph | Plan ejecutable fingerprinted del change (legado: Graph IR) | Debe derivarse o reconciliarse con la autoridad canónica. No es autoridad independiente. |
| Assurance Graph | Proyección content-addressed de evidencia/verify/challenge/finding/attestation | Derivada; nunca segunda autoridad ni “demostración formal”. |
| Evidence/event stores | Hechos y telemetría | No sustituyen estado ni verdict. |
| Markdown | Vista humana y semántica revisable | No concede autoridad mecánica mediante parsing ambiguo. |
| Adapters | Traducción al host | No duplican lifecycle ni relajan garantías silenciosamente. |

<a id="3-principios-invariantes"></a>

### Invariantes

1. **Runtime-owned lifecycle.** El mismo estado y contratos producen las mismas transiciones válidas, con independencia del modelo o target.
2. **Modelos sin auto-autoridad.** Un modelo puede proponer y ejecutar trabajo autorizado; no aprueba su candidato ni crea permisos.
3. **Estado persistido sobre conversación.** Reanudar parte de filesystem, no de memoria conversacional.
4. **DAG por defecto.** Un ciclo requiere allowlist, causa, presupuesto e interruptor terminal.
5. **Proporcionalidad por evidencia.** Las garantías responden a impacto e incertidumbre demostrables; líneas y archivos son contexto de reviewability/delivery, nunca degradan un hard floor de riesgo.
6. **Cambio pequeño, proceso pequeño.** Una capacidad solo se activa por una obligación o riesgo demostrable.
7. **Independencia.** Implementación, verificación y aprobación consumen contratos distintos y una identidad común.
8. **Evidencia no equivale a verdict.** Tests verdes son una entrada; contrato, invariantes y challenges determinan suficiencia.
9. **Complejidad justificada.** Toda abstracción nueva compara no hacer nada, cambio local, patrón existente y nueva abstracción.
10. **Recovery ejecutable.** Todo bloqueo termina en `execute`, `collect`, `decide` o `stop`. Una superficie humana o negociada solo nombra un comando cuando ejecutarlo resuelve el bloqueo; nombrar un callejón sin salida es peor que no nombrar nada.
11. **Fail-closed selectivo.** Identidad, permisos, evidencia requerida, seguridad y efectos destructivos fallan cerrados.
12. **Compatibilidad antes de retirada.** Fixed, aliases y artefactos actuales se mantienen hasta que una migración probada los sustituya.
13. **Una responsabilidad, un kernel.** Review, archive, evidence y routing no tendrán implementaciones paralelas permanentes.
14. **Observabilidad separada.** Los eventos registran hechos y coste; no son razonamiento interno ni estado canónico.
15. **Paridad de superficies.** Para la misma condición, la proyección humana y el envelope negociado/máquina llevan al menos la misma especificidad (código, causa y siguiente acción); no divergen en datos materiales.

Estas invariantes deberán tener schemas y tests de conformance. Su redacción no basta como enforcement.

#### Materialización P0: contrato ahora, enforcement después

P0 no termina en una lista de principios ni queda íntegramente ejecutado por K1. K1 materializa el vocabulario y las restricciones declarativas que pueden verificarse sin activar lifecycle; los slices posteriores deben consumir esos contratos y demostrar el comportamiento runtime indicado en la última columna.

| # | Invariante P0 | Materialización contractual en K1 | Enforcement que permanece en K2+ |
| ---: | --- | --- | --- |
| 1 | Runtime-owned lifecycle | `state-transition/v1` fija `execute\|collect\|decide\|stop`, `operation`, tokens y condiciones de `command`. | K2 implementa el reducer determinista, replay e idempotencia; **K2.1** añade CAS y permits. |
| 2 | Modelos sin auto-autoridad | El canon de autoridad y los contratos `verification`, `finding-review` y `receipt` separan propuesta, verdict y binding. | K2.1/K7/K8 impiden auto-aprobación y mutación de permisos/candidato en runtime. |
| 3 | Estado persistido sobre conversación | `contract` y el canon declaran OpenSpec/Git como autoridad; Execution Graph no puede sobrescribirlos. | K2 reconcilia state y recuperación desde filesystem; K12 lo prueba a escala. |
| 4 | DAG por defecto | `graph-node/v1` publica `dependencies`, objetivo, invariantes, ownership, paths, evidence refs y `budget_ref`. | K4 compila/invalida el DAG; K5 aplica budgets y terminalidad de ciclos. |
| 5 | Proporcionalidad por evidencia | `classification/v1` fija ejes, `reasons`, fingerprint y hard floors no degradables por tamaño. | K4/K9 prueban selección y no-regresión en shadow/replay. |
| 6 | Cambio pequeño, proceso pequeño | Clasificación y contratos permiten expresar Direct/Repair sin convertirlos en rutas activas. | K10 activa recetas/capacidades una a una y mide que no omitan garantías. |
| 7 | Independencia | Las familias `work-order`, `candidate`, `evidence`, `verification`, `finding-review` y `receipt` separan identidades e inputs. | K3/K6/K7/K8 hacen cumplir worker/verifier/reviewer/delivery sobre el mismo candidato. |
| 8 | Evidencia no equivale a verdict | `evidence/v1` y `verification/v1` son contratos distintos; receipt enlaza evidence y findings además del candidato. | K6b/K6c seleccionan evidencia y challenges; K7 adjudica findings. |
| 9 | Complejidad justificada | K1 conserva la obligación en el canon, pero no inventa un schema de `complexity_delta` fuera de su slice. | K6d materializa alternatives/complexity delta; K12 mide evolución longitudinal. |
| 10 | Recovery ejecutable | `state-transition/v1`, `failure-recovery/v1` y fixtures de paridad fijan continuación y causa estructuradas. | K2/K5 prueban que cada transición avanza o termina y que un budget no se reinicia. |
| 11 | Fail-closed selectivo | Schemas cerrados, fixtures negativos, pinning y ausencia de fallback a prosa rechazan shapes incompletos. | K2.1+ aplican los rechazos a identidad, permisos, seguridad y efectos reales. |
| 12 | Compatibilidad antes de retirada | Aliases/version pinning y perfiles v1 compatibles preservan tags y receipts/nodos legacy mientras el perfil canónico es completo. | K9–K11 gobiernan deprecación, fallback y rollout por target. |
| 13 | Una responsabilidad, un kernel | El canon separa familias y prohíbe que K1 introduzca reducer, routing o segunda autoridad. | K2/K7/K8 reutilizan y consolidan lifecycle, lineage y receipts existentes. |
| 14 | Observabilidad separada | `event/v1` es un contrato no autoritativo separado de state/verdict. | K2 deriva emisiones; K12 valida replay y coste sin convertir eventos en autoridad. |
| 15 | Paridad de superficies | `state-transition/v1` y fixtures human/envelope conservan código, causa y siguiente acción. | K2 ejecuta y prueba paridad E2E; Headless Conformance Host + adapter real en K2a; expansión en K11. |

Por tanto, “P0 → K1” significa **contrato/conformance declarativa de todas las invariantes**, no que K1 implemente por adelantado los reducers, compilers, budgets, aislamiento, review o delivery de K2–K12.

## Estado implementado reconocido

### Capacidades fuertes reutilizables

| Capacidad | Estado implementado | Papel en la arquitectura objetivo |
| --- | --- | --- |
| OpenSpec state/recovery | Persistencia por change, resúmenes de fase, ledgers y recuperación desde filesystem. | Autoridad semántica que el kernel consume y reconcilia. |
| O3 clarify | Gate condicional después de spec, gobernado por envelope validado. | Semilla de `clarification.required/resolved` con invalidación parcial. |
| O4+O5/O4.1 | Generalist-first, selección determinista, full 4R por high-risk/overflow y reasons persistidos. | Selector/reviewer reusable; no se reescribe. |
| Review lineage | Candidate/paths/findings congelados, lenses one-shot, correction focal y límites de intentos. | Kernel de adjudicación acotada ligado al Candidate ID universal. |
| O4.2 | Recovery focal para drift de evidencia, con invariancia funcional y recheck. | Patrón de remediation tipada y bounded recovery. |
| O6A archive | Plan semántico + transacción runtime, staging, hashes, inventario, rollback/recovery y **ArchiveTransactionReceipt**. | Kernel reusable de efectos recuperables; Receipt ≠ Attestation ≠ Authorization. |
| Multi-target | Generación y adapters para Claude Code, VS Code, GitHub Copilot, OpenCode, Codex y Cursor. | Headless Conformance Host + adapter real en K2a; expansión/paridad en K11a–K11d. |
| Model resolver | Catálogo y resolución estática agent → tier → target (`models.yaml` canónico). | Base para routing por work order/nodo con clamps. |
| O2A evals | Catálogo de nueve perfiles, smoke, runner local y scoring estructural. | Base de shadow/headless; control fixed fijado por O2B. |
| O2B fixed baseline | Baseline 9/9 versionada, verify `PASS`, gate 4R `approved`, publicada en v2.36.0. | Control/default hasta que K9 y gates posteriores autoricen otro cambio. |
| Apply/verify | Roles y contratos separados. | Se endurece su independencia por Candidate ID y evidence manifest. |
| Telemetría/hooks | Costes, lifecycle hints y resultados parciales. | Productores de eventos normalizados, no nueva autoridad. |

### Estado inmediato

O2B está cerrado y archivado (`openspec/changes/archive/2026-07-31-fixed-policy-reference-baseline/`). Hechos al corte:

- verify `PASS` para 16/16 escenarios MUST;
- gate 4R `approved` con lineage terminal;
- fixed permanece como baseline de control y default;
- el change histórico `k1-contract-suite` completó archive, verify PASS, 4R approved y publicación v2.37.0; K1 está **done**;
- el change `k2-lifecycle-kernel` completó archive, verify PASS, 4R approved y publicación v2.38.0; K2 está **done**;
- el change `k2-1-authority-store-permits` completó archive, verify PASS, 4R approved y publicación v2.39.0; K2.1 está **done**;
- el change `k2a-headless-conformance-host` completó archive, verify PASS WITH WARNINGS, 4R approved y publicación v2.40.0; K2a está **done**.

El programa no cambia defaults por el solo hecho de cerrar O2B/K1/K2/K2.1/K2a: cualquier promoción de policy, fixtures o routing exige los gates posteriores aplicables.

### Deuda real

**Entregado — no reabrir como si faltara el primitive:** K3 (identidades + freeze básico), K4a (compiler + Obligation Manifest + replay), K5 (budgets/failure/recovery), K6a (isolation/capsule), K4b (Repair shadow), K6b (verifier independiente, strategies/provenance, Assurance Graph proyección).

**Sigue siendo deuda (dueños sin cambio):**

- Hard floors K1 no cablean la tabla de routing de producto; first-match de `standard` por `project.status: active` deja `lite` inalcanzable en repos active (compatibilidad; no es K10).
- Recetas Direct/Repair/Bounded/Planned/Critical no están activas (K10, una a una, tras K9).
- ChallengePlan / challenges proporcionales y `complexity_delta` no son gates reutilizables (K6c/K6d).
- El Assurance Graph no es autoridad independiente de lifecycle, approval o delivery (sigue `target`; K6b solo materializa la proyección).
- ReviewAdapter / Nivel 0 determinista no sustituyen el generalist de O4 (K7).
- No hay CandidateEvaluationAttestation ni DeliveryAuthorization productivos (K8 / K10-delivery).
- Model routing por nodo no sustituye el catálogo estático agent → tier (K11b).
- Change Program (lista concatenada de OpenSpec changes + cursor) está **nombrado** y **sin slice**; no adelanta R4.

### Frontera de aislamiento y Threat Model de K6a

K6a define una **frontera de integridad de ejecución** (*execution-integrity boundary*), no un sandbox de seguridad contra código hostil (*hostile-code security sandbox*).

`isolationReported = "enforced"` significa que un `WorkerTransport` conforme ejecuta un `WorkOrder` bajo los controles de runtime definidos por la especificación `worker-isolation`, incluyendo:

- Captura inmutable de la política del sandbox al cargar el preload;
- Confinamiento de mutaciones estrictamente dentro de las `allowed_paths` declaradas;
- Confinamiento forzado de procesos Node descendientes (`spawn`, `execFile`, `fork`) y `worker_threads.Worker`;
- Vinculación viva entre la prueba de `WorkerIsolation` y el `WorkerTransport` exacto usado para la ejecución;
- Probes de contención end-to-end (tres operaciones reales PASS / BLOCKED / BLOCKED) a través de dicho transporte;
- Ejecución de comandos fail-closed salvo cuando el aislamiento `enforced` está verificado;
- Validación postflight del inventario de mutaciones y captura fidedigna de evidencia.

K6a no pretende ofrecer contención frente a código nativo hostil (e.g. C++ addons maliciosos), explotación del runtime V8, compromiso del kernel del sistema operativo o bypasses arbitrarios del runtime del host. Dichos escenarios quedan fuera del threat model de K6a y requieren aislamiento a nivel de host u OS fuera del alcance del harness de referencia.

## Cadena canónica del change

```text
petición
  → intención y contexto
  → clasificación explicable
  → contrato semántico versionado
  → compilación de Execution Graph
  → SourceSnapshot + WorkOrder → WorkResult (K6a)
  → integrate + freeze Candidate (K3/K4b)
  → verify / challenges / Assurance Graph (K6b–K6c)
  → review acotado cuando aplique (K7)
  → CandidateEvaluationAttestation (K8)
  → DeliveryAuthorization por gate/profile (K10-delivery) o recovery tipada
```

### Orden de freeze

El árbol de código se congela antes de verify:

1. El worker entrega diff, comandos, resultados, supuestos y riesgos como evidencia bruta.
2. El runtime canonicaliza paths y calcula base tree, candidate tree, diff y digests.
3. El verifier recibe contrato, Execution Graph, `candidate_id`, repositorio y evidencia bruta.
4. Tras verify se finalizan evidence/findings digests.
5. Review consume la misma identidad y findings congelados.
6. `CandidateEvaluationAttestation` (K8) liga contract/graph/candidate/evidence/findings/policy; `DeliveryAuthorization` (K10-delivery) añade gate + route/profile digest cuando aplique.

Cualquier byte distinto crea un candidato sucesor. Verify, review y delivery anteriores dejan de aplicar; no se “actualiza” una attestation ni una authorization existente.

### Candidate identity

Alineado con `schemas/kernel/candidate/v1` (campo canónico `candidate_id`); K3 amplía digests de modos, untracked, `repository_id` y ambigüedad de selector:

```yaml
candidate:
  schema_version: 1
  candidate_id: sha256:...
  repository_id: ...
  projection: workspace # solo workspace | staged — no commit
  base_tree: ...
  candidate_tree: ...
  diff_hash: ...
  paths_digest: ...
  changed_paths_modes_digest: ...
  intended_untracked_digest: null
  changed_paths: []
  predecessor_id: null
  relation: exact # exact | changed | ambiguous | unknown
```

La identidad es universal, pero no sustituye Git. Es una representación canónica y verificable de sus bytes y relaciones. `Candidate.projection` solo puede ser `workspace|staged`. Un commit puede ser el origen de un `SourceSnapshot`, pero no constituye una tercera proyección de Candidate. Recovery hereda la proyección del predecesor salvo successor explícito autorizado; ni attestation ni authorization pueden apuntar solo a branch o working tree mutable. `WorkResult` solo se convierte en Candidate tras integración sobre la base autorizada y freeze.

### Delivery: attestation vs authorization

```yaml
# CandidateEvaluationAttestation (K8) — NO autoriza delivery
kind: candidate-evaluation-attestation
candidate_id: sha256:...
contract_digest: sha256:...
graph_digest: sha256:...
evidence_root_digest: sha256:...
findings_digest: sha256:...
policy_digest: sha256:...
expected_revision: sha256:...
authority_revision: sha256:...
issuer_version: ...
outcome: approved-for-evaluation
valid_for: [evaluation]

# DeliveryAuthorization (K10-delivery) — por gate + profile promovido
# Nunca “Delivery Authorization Receipt”: Receipt ≠ Authorization
kind: delivery-authorization
candidate_id: sha256:...
route_profile_digest: sha256:...
valid_for: [pre-commit]   # o pre-push / pre-pr
```

`ArchiveTransactionReceipt` (O6A) registra solo la transacción de archive (operación mecánica).

Regla: Receipt registra operación; Attestation declara evaluación; Authorization concede capacidad. El primer enforcement productivo solo gobierna el profile promovido por K9; el resto permanece `fixed` o unmanaged/deferred.

#### Migración de schemas de cierre (no reabrir K1)

```text
schemas/kernel/receipt/v1
  = envelope legacy/genérico entregado por K1
  = exige candidate_id y kind genérico
  = no define la taxonomía semántica futura
  = permanece intacto por compatibilidad

schemas/kernel/candidate-evaluation-attestation/v1
  = schema propio introducido en K8

schemas/kernel/delivery-authorization/v1
  = schema propio introducido en K10-delivery
```

K8 y K10-delivery **no** reutilizan `receipt/v1` como contrato canónico. Pueden convivir bindings/adapters de compatibilidad hacia el envelope legacy, pero kinds y scopes nuevos viven en schemas propios.

#### Enforcement productivo

Cada superficie:

- valida `valid_for` exacto y el route/profile digest promovido;
- exige binding de contract, graph, candidate, evidence, findings y policy;
- aplica expiry e invalidación por successor, cambios de schema/policy o evidencia;
- rechaza replay, foreign/stale y byte mismatch;
- falla cerrada **dentro del profile**; no bloquea rutas no promovidas;
- no relanza modelos/reviewers ni infiere autorización desde prosa;
- declara degradación por capability del host.

Una Evaluation Attestation nunca autoriza delivery. Bypass/unmanaged aplaza a la policy del repo sin fabricar autorización.

## Kernel determinista y Execution Graph

<a id="kernel-determinista-y-execution-graph"></a>
<a id="kernel-determinista-y-graph-ir"></a>

### Superficie del kernel

Lista objetivo del kernel completo (no es la API que K2 implementa íntegra):

```text
status
classify
compile
start-node
complete-node
fail-node
invalidate-node
freeze-candidate
record-evidence
start-review
capture-review
finalize-review
validate-delivery
recover
```

| Operación o capacidad | Primer slice propietario |
| --- | --- |
| `status`, `next_transition`, `recover`, eventos derivados | K2 |
| Authority Store (`load`/`compareAndSwap`), `OperationPermit`/`Receipt`, clases de efecto | K2.1 |
| `HostCapabilities`, transports, Headless Conformance Host, adapter real, CapabilityProof | K2a |
| `freeze-candidate`, successor, identidad y relación básica | K3 |
| clasificación runtime, `compile`, Obligation Manifest | K4a |
| presupuestos (incl. autoridad/efectos) y failure routing | K5 |
| execute-work-order y captura de `WorkResult` | K6a |
| verificación, provenance y Assurance Graph | K6b |
| adjudicación / `ReviewAdapter` + `ReviewReducer` | K7 |
| attest-candidate (`CandidateEvaluationAttestation`, emisión CAS) | K8 |
| `authorize-delivery` / `validate-delivery` (`DeliveryAuthorization`) | K10-delivery |

K2 solo materializa lifecycle (`status` / node lifecycle / `recover` / eventos). **K2.1** endurece la autoridad mutante antes de identidades/Graph. El resto permanece target hasta su slice.
Cada operación devuelve estado estructurado y siguiente transición:

```json
{
  "status": "blocked",
  "reason_code": "verification_failed",
  "next_transition": {
    "kind": "execute",
    "operation": "repair-node",
    "command": "ospec kernel repair-node --node-id=repair-auth-session",
    "arguments": [
      {
        "name": "node_id",
        "value": "repair-auth-session",
        "token": "--node-id=repair-auth-session"
      }
    ]
  }
}
```

Los cuatro tipos de continuación son:

- `execute`: el runtime puede ejecutar una operación autorizada; lleva `command` completo y `arguments` con `token` exactos;
- `collect`: falta un resultado externo o de un modelo; puede llevar tokens de admisión, pero no un `command` que presuponga un artefacto aún inexistente;
- `decide`: se necesita una decisión humana;
- `stop`: no existe continuación segura.

La proyección humana y el envelope negociado de la misma condición deben ser recuperables entre sí: el código, la causa y la siguiente acción no se pierden al cruzar de prosa a JSON.

### Kernel compuesto, no reemplazo

El kernel global reutiliza:

- reducers y lineages de review;
- invariance/recheck de O4.2;
- staging/receipt/recovery de O6A;
- route/envelope validators existentes;
- model resolver y target profiles;
- runners y scoring de O2A.

La integración se hace con adapters y schemas compartidos. No se vuelve a implementar review ni archive bajo nombres nuevos.

### Execution Graph

El Execution Graph (legado documental: Graph IR) representa unidades semánticas de **trabajo**:

```yaml
graph:
  schema_version: 1
  graph_id: sha256:...
  contract_digest: sha256:...
  route: repair
  nodes:
    - id: repair-auth-session
      objective: Admitir tokens rotados sin romper sesiones existentes
      dependencies: [localize-auth-flow]
      allowed_paths: [src/auth/**, tests/auth/**]
      invariants:
        - Existing valid sessions remain valid
        - Expired tokens remain rejected
      required_evidence:
        - regression-reproduction
        - auth-contract-tests
      budget_ref: repair-default
  obligations:
    - id: req-session-rotation-001
      criticality: must
      implemented_by:
        - repair-auth-session
      required_evidence:
        - auth-contract-tests
```

`read`, `search`, `edit` y `test` no son nodos; son acciones internas de un worker. Un nodo existe porque tiene objetivo, invariantes, dependencias, ownership y evidencia. El **Obligation Manifest** es una vista determinista del mismo Graph (no un tercer grafo ni store independiente): cada obligación `MUST` está implementada por un nodo, tiene evidencia requerida, o está aplazada mediante decisión explícita.

### Compilación e invalidación

```text
intención + clasificación + contrato + capabilities
  → receta de ruta
  → selección de capacidades
  → Execution Graph
  → work orders
```

Cuando una aclaración o fallo cambia una premisa:

1. se persiste la decisión o failure;
2. se identifican dependencias afectadas;
3. se invalidan solo nodos descendientes;
4. se recompila el subgrafo;
5. se preservan outputs todavía válidos por digest.

No se reinicia el workflow completo ni se reutiliza evidencia cuya dependencia sea desconocida.

### Proyecciones de entrada y budgets de contexto (propuesta CX)

K4a conserva el **único compilador autoritativo**. `InputProjectionBuilder` no es un segundo “Context Compiler”: deriva una `ContextProjection` desde el Execution Graph, sus `capsule_inputs` y referencias canónicas para un consumidor concreto.

```text
ExecutionGraphCompiler (K4a; graph + capsule_inputs)
  → InputProjectionBuilder (ContextProjection derivada)
  → Phase Agent (trabajo semántico; K6a materializa la cápsula aplicable)
  → PhaseCompletionReducer (migración contractual gradual)
  → renderers humanos + telemetría no autoritativa
```

| Componente | Posee | No posee |
| --- | --- | --- |
| `ExecutionGraphCompiler` | Graph, obligations, dependencias y `capsule_inputs` | state, Candidate, evidencia o review lineage |
| `InputProjectionBuilder` | Selección reproducible, digest y cobertura por fase/profile/lens | Obligaciones, decisiones, budgets, evidence store ni transiciones |
| Phase Agent | Juicio semántico y artefacto/envelope de su fase | Actualización mecánica de state una vez migrada |
| `PhaseCompletionReducer` | Validación de envelope, CAS/replay y actualización mecánica versionada | Inferir approvals, assumptions, gates, lineage o decisiones semánticas |
| Renderers/telemetría | Vistas humanas y medición | Autoridad de transición o delivery |

La `ContextProjection` es **content-addressed, reproducible, descartable y read-only**. Declara schema/version, fase/profile, source digests, selección y cobertura de obligations/hard floors. OpenSpec/Git/state, Execution Graph, Candidate/WorkOrder, Assurance Graph/evidence, review lineage y delivery conservan sus autoridades actuales. Si una proyección diverge, queda stale o no demuestra cierre de dependencias, el runtime falla cerrado; nunca “arregla” la divergencia aceptando la vista.

La proyección de evidencia reutiliza collectors K6b/K6c, `runner-receipt/v1`, provenance y Assurance Graph. No crea otro evidence store ni otra fuente de verdict. De igual modo, las tablas de reconciliación, compliance, traceability y archive pasan gradualmente a ser renderers de relaciones estructuradas, no nuevos ledgers.

#### Budgets y overflow seguro

Los budgets de contexto son policies derivadas de la clasificación y del riesgo existentes, sujetas a los hard floors K1. No crean rutas `Nano`/`Lite`/`Medium`/`Full` ni reducen reviewers o evidencia obligatoria para cumplir un número de tokens.

Ante overflow:

1. construir el cierre completo de obligations, decisiones, dependencias y evidencia requeridas;
2. si no cabe, particionar únicamente en unidades **dependency-closed** con identidad y cobertura explícitas;
3. si la partición no conserva garantías, usar fallback al input `full` compatible o detener con causa tipada;
4. nunca truncar silenciosamente ni reiniciar los intentos monótonos de K5.

#### Salida y estado: migración contractual, no quick win

El envelope JSON-only con renderer humano y `PhaseCompletionReducer` runtime-owned son targets graduales. Requieren schema/versionado, compatibilidad con envelopes legacy, CAS/replay, shadow y fallback antes de retirar la doble emisión o la escritura de state por fase. Approvals, assumptions, gates, lineage y decisiones mantienen autoridad explícita; el reducer solo persiste transiciones mecánicas validadas y nunca las infiere de prosa.

### Schemas versionados

La suite objetivo cubre:

- state y transition;
- classification;
- change contract;
- graph y node;
- work order/result;
- candidate;
- evidence y challenge;
- verification;
- finding/review/lineage;
- failure/recovery;
- receipt;
- event.

Reglas:

- validación en CI;
- ejemplos generados o validados;
- consumidores pinnean versión;
- migraciones explícitas;
- ninguna operación de autoridad tiene fallback silencioso a prosa;
- docs y fixtures no pueden nombrar campo, operación o comando que el código no emita;
- proyección humana y envelope negociado de la misma condición preservan código, causa y siguiente acción.

#### Deltas quirúrgicos de specs (diferidos)

Los deltas de escenario/requisito no se habilitan hasta disponer de IDs estables, `base_hash`, merge canónico determinista, validación de pérdida, round-trip y fallback a copia canónica completa. La optimización puede reducir transporte; no rebaja la semántica fail-closed de `MODIFIED` ni cambia la autoridad de las specs.

## Clasificación, rutas y capacidades

### Clasificación multidimensional

```yaml
classification:
  schema_version: 1
  risk:
    security: 0
    data_integrity: 0
    public_contract: 1
    concurrency: 0
    irreversibility: 0
    blast_radius: 2
  uncertainty:
    requirements: 0
    architecture: 1
    repository_knowledge: 0
    external_dependencies: 0
  execution:
    dependency_depth: 2
    ownership_domains: 2
    expected_work_units: 3
    parallelizable: false
  route: planned
  reasons: []
```

Hard floors iniciales:

- migración de datos o autenticación → `critical`;
- API pública → al menos `planned`;
- bug reproducible localizado → `repair`;
- cambio mecánico sin comportamiento → `direct`.

La clasificación nombra sus `reasons` y produce fingerprint estable. El tier de review y la ruta salen de qué se tocó y con qué incertidumbre, no del tamaño del diff: un cambio documental masivo puede permanecer en Nivel 0; dos líneas sobre autenticación activan hard floor `critical`. Los conteos de líneas/archivos informan reviewability y delivery, pero no degradan un hard floor de riesgo.

### Cinco rutas como recetas

| Ruta | Uso | Receta mínima |
| --- | --- | --- |
| Direct | Mecánico, reversible, sin comportamiento | inspect → edit → deterministic validate |
| Repair | Defecto reproducible y localizado | localize → reproduce → repair → freeze → verify |
| Bounded | Feature/refactor contenido | compact contract → work units → freeze → verify → review |
| Planned | Dependencias cross-module | discover → contract → decisions → graph → execute → freeze → verify/review |
| Critical | Seguridad, auth, datos, concurrencia, contratos públicos, destrucción | planned + irreversible-decision gates + failure/threat model + rollback + adversarial verify + specialist review |

Las rutas no son nuevos orquestadores. Son recetas de compilación con hard floors, capabilities y evidence strategies.

La tabla `routing:` de `openspec/config.yaml` (foundation, federated, bugfix, brownfield, refactor, hotfix, standard, lite) es el **producto actual**, no esas recetas. Hasta que K10 active una receta promovida, un camino corto válido es lite/hotfix **con clamp de hard floors**. `project.status: active` no es clasificación de change y no debe sombrear esa selección. Eso no autoriza Direct productivo ni degrada auth/API a “small”.

### Capacidades, no fases obligatorias

- `clarify-intent` (K10). El briefing funcional D2 del orquestador ya es obligatorio en CORE desde v2.49.0; K10 lo generaliza como receta de grafo, no lo introduce.
- `discover-system`
- `define-contract`
- `analyze-impact`
- `evaluate-design-options`
- `record-decision`
- `decompose-work`
- `estimate-reviewability`
- `freeze-candidate`
- `verify-independently`
- `review-selectively`
- `validate-delivery`

Proposal, spec, design y tasks conservan responsabilidades y formatos compatibles. El compiler decide si requieren agente propio, invocación combinada o materialización compacta.

### Clarify como evento

O3 se generaliza:

```yaml
ambiguity:
  decision: Session migration strategy
  why_blocking: Determines whether existing users are logged out
  options: [migrate-existing-sessions, invalidate-existing-sessions]
  recommended: migrate-existing-sessions
  affected_nodes: [design-session-transition, implement-session-migration]
```

Resolver la pregunta persiste aprobación, invalida `affected_nodes` y recompila descendientes. Clarify sigue siendo condicional y no se convierte otra vez en fase universal.

## Ejecución acotada y recovery causal (K5)

### Budgets por nodo y autoridad

```yaml
budget:
  turns: 3
  patches: 3
  commands: 10
  wall_time_minutes: 15
  changed_lines: 300
  allowed_paths:
    - "src/**"
```

Y para autoridad/efectos:
```yaml
authority_budget:
  effect_attempts: 8
  authority_mutations: 12
  evidence_runs: 6
  review_sweeps: 1
```

Se aplican `allowed_paths`, objetivo, finding y permisos (`OperationPermit`).
- **Monotonicidad estricta:** el decremento es no creciente; ni retries ni reconciliaciones CAS reinician ni inflan presupuestos.
- **Mutaciones zero-delta:** pasos que declaran intención de mutación sin producir avance semántico consumen un intento del budget.
- **Terminalidad:** agotar presupuesto no relanza workers en loops infinitos; fuerza transiciones terminales a `decide` o `stop`.
- **Aislamiento de telemetría:** contadores volátiles y telemetría de consumo no forman parte del digest semántico.

### Taxonomía causal y prioridad (K5)

La taxonomía unificada clasifica fallos en 5 categorías jerárquicas con precedencia determinista (1 = mayor prioridad):

1. **`environment_tooling` (Prioridad 1):** fallos de infraestructura, timeouts de red o herramientas ausentes.
2. **`cas_conflict` (Prioridad 2):** carreras de concurrencia en permisos/store que requieren re-sincronización de estado.
3. **`ambiguous_effect` (Prioridad 3):** resultados indeterminados de efectos que exigen reconciliación obligatoria antes de cualquier mutación.
4. **`validation_gap` (Prioridad 4):** discrepancias de lint/contrato o cobertura faltante que requieren replanificación.
5. **`code_defect` (Prioridad 5):** fallos reproducibles de implementación o asserts en tests.

Los tags históricos (`code-bug`, `tasks-gap`, `design-gap`, `spec-gap`) se mapean deterministamente mediante `mapLegacyRoutingTag`.

### Matriz de recuperación allowlisted y honesty (K5)

Las transiciones de recuperación se restringen según la categoría causal primaria:
- `code_defect`: `["repair", "replan", "escalate", "stop"]` (la operación `repair` solo está permitida si `remainingAttempts > 0`).
- `validation_gap`: `["replan", "escalate", "stop"]`.
- `ambiguous_effect`: `["escalate", "stop"]` (prohíbe reparación o reintento a ciegas sin reconciliación).
- `cas_conflict`: `["replan", "escalate", "stop"]` (requiere re-sincronizar el estado del CAS).
- `environment_tooling`: `["replan", "escalate", "stop"]`.

Cada recuperación acota el ámbito (`node_ids`, `allowed_paths`, `finding_ids`) y verifica honestidad mediante el avance del `blockingFingerprint` (`FP_after != FP_before`). Si el fingerprint permanece estancado, el ciclo termina en `stop`/`escalate`.

## Evidencia, challenges e independencia

### Evidence strategies

| Cambio | Evidencia mínima candidata |
| --- | --- |
| Bug | reproducción roja → patch → reproducción verde |
| Feature | acceptance examples, negativos, invariantes, contract/integration tests |
| Refactor | characterization y comparación antes/después sin cambio observable |
| Migración | dry run, rollback, incompatibles, idempotencia y reejecución |
| Config/docs | schema/parser real, smoke e instalación/consumo |

Strict TDD permanece activo mientras no exista equivalencia demostrada. La arquitectura objetivo sustituye universalidad por selección explícita, no por menos evidencia.

#### Provenance

Cada evidencia declara procedencia; la policy decide qué provenance puede satisfacer cada obligación:

```text
runtime-observed
host-attested
tool-produced
model-reported
human-decision
external-unverified
```

“Tests passed” escrito por el worker (`model-reported`) ≠ resultado observado por el runtime (`runtime-observed`).

### Challenges

- **Revert:** al revertir producción, la prueba relevante falla.
- **Mutation:** mutaciones focalizadas invalidan evidencia complaciente.
- **Independent acceptance:** el verifier deriva checks de contrato e invariantes.
- **Test inspection:** rechaza tautologías, mocks del comportamiento objetivo y snapshots autocreados.

Cada challenge se liga a candidate, node y evidence strategy.

### Complexity delta

```yaml
architecture_delta:
  files_added: 0
  files_deleted: 0
  modules_added: 0
  interfaces_added: 0
  dependencies_added: 0
  config_keys_added: 0
  states_added: 0
  compatibility_paths_added: 0
  duplicated_blocks: 0
  dead_code: 0
  public_api_delta: none
```

Es una señal para formular preguntas, no un límite rígido. Una abstracción nueva documenta problema, consumidores actuales, variabilidad, boundary, alternativa simple rechazada y plan de retirada.

### Independencia de roles

| Rol | Puede | No puede |
| --- | --- | --- |
| Worker | inspeccionar, modificar paths permitidos, ejecutar checks y emitir raw evidence | aprobar, alterar budgets o verificar otro candidato |
| Verifier | comprobar contrato, Candidate ID, diff, repo y raw evidence; generar acceptance independiente | depender de la narrativa del worker o editar producción |
| Reviewer | evaluar candidate/evidence/findings congelados | relanzarse desde cero o mutar candidate |
| Runtime | validar hashes, schemas, exit codes, permisos, budgets y estado | resolver ambigüedad semántica |

## Review y archive como kernels reutilizables

### Review

Autoridad de review explícita:

| Componente | Responsabilidad |
| --- | --- |
| `ReviewAdapter` | Invoca modelos y presenta decisiones |
| `ReviewReducer` | Congela tier/lenses, admite findings, consume correction budget, crea successor, finaliza review |

Corrección bounded ordinaria inicialmente; corrección por closure solo como experimento shadow (no default).

La arquitectura objetivo usa tres niveles:

| Nivel | Política | Gate |
| --- | --- | --- |
| Nivel 0 — determinista | Sin review de modelo para Direct mecánico, reversible, sin comportamiento ni señales materiales y con validación determinista suficiente | Cualquier señal material escala a Nivel 1 |
| Nivel 1 — generalista | Generalista read-only para contrato, correctness, scope, evidencia, complejidad, regresiones y coherencia | Puede recomendar Nivel 2; runtime valida la selección |
| Nivel 2 — especialistas | Lenses selectivas ligadas a riesgo/evidencia | Solo se ejecutan las necesarias; high-risk/overflow conserva full 4R |

Se conserva el comportamiento entregado de los niveles 1/2:

- generalista read-only primero;
- cero a dos specialists targeted para normal;
- tres o más señales positivas y high-risk → full 4R;
- cada lens una vez;
- findings con IDs estables;
- correction/validation focal;
- budget y attempts inmutables;
- follow-ups no bloqueantes;
- successor explícito para nuevo scope/discovery.

`performance` y `compatibility-migration` se incorporan como señales y lenses condicionadas, no como reviewers permanentes. Antes de poder bloquear necesitan contract, budget, fixtures positivos/negativos y evals que prueben activación por cambio de rendimiento, API/formatos, migración o compatibilidad. La ausencia de señal persiste una razón de skip. Las cuatro lenses 4R actuales no se renombran ni se reescriben como stack paralelo.

Calidad de descubrimiento (roadmap K7), sin cambiar la machinery:

- *precision gate* y Flag/Do-Not-Flag densos en las lentes;
- refutación acotada solo de BLOCKER/CRITICAL antes de freeze/corrección (techo 1|3 tasks; default `stands`);
- severity floor: WARNING/SUGGESTION no abren correction;
- lineage OpenSpec permanece el ledger canónico; no se adopta un store/CLI de review externo ni RDD de Gentle.

El cambio arquitectónico de input sigue siendo: el linaje consumirá Candidate ID universal, Graph/evidence digests y classification reasons. CX5b, **después de K7**, podrá derivar una proyección por lens y una proyección de correction limitada a findings, paths, hunks, obligations y evidencia congelados. No reduce reviewers, no reabre discovery y no crea `.review` ni otro ledger; el lineage OpenSpec y los budgets existentes siguen mandando.

### Archive

O6A sigue separando:

- agente: summary, riesgos, decisiones semánticas, specs resultantes, ADRs, warnings y `archive-plan`;
- runtime: hashes, staging, inventario, comparación de bytes, commit/rename, rollback, recovery y receipt;
- renderer derivado: fechas, status, hashes e inventario a partir de `archive-plan` + `ArchiveTransactionReceipt`, sin pedir al agente que los reconstruya.

El DeliveryAuthorization no sustituye el ArchiveTransactionReceipt ni la CandidateEvaluationAttestation. Comparten primitives de identidad/validación, pero kinds y scopes distintos.

## Adapters, modelos, ownership y aislamiento

### Adapter mínimo

```yaml
target: vscode
capabilities:
  structured_questions: enforced
  subagents: enforced
  parallel_agents: unavailable
  lifecycle_hooks: unavailable
  background_tasks: unavailable
  model_routing: per_agent
  native_sandbox: unavailable
capability_proof:
  adapter_version: ...
  host_version: ...
  fixture: ...
  evidence_digest: sha256:...
```

Los valores efectivos son `enforced|partial|instructional|unavailable` cuando corresponda. Una capability `enforced` exige **CapabilityProof** reproducible (adapter/host version + fixture + evidence digest); no basta con declararla en JSON. K2a entrega Headless Conformance Host (fault injection, timeouts, cancelación, workers) **más** un adapter real de referencia. El adapter traduce tools, frontmatter, UX, delegación, modelos y hooks; no decide lifecycle ni relaja CAS/permits.

### Model routing por nodo

El resolver existente se amplía:

```text
node activity + risk + uncertainty + context + failure cause
  → model tier intent
  → target clamp
  → effective model/effort + reason
```

Persistencia, hashes y routing determinista no usan modelos. La escalada responde a cause code, no a “no funcionó”.

### Ownership y worktrees

Solo se paralelizan nodos sin overlap de paths, contratos ni estado mutable. Si hay overlap:

- se serializa;
- se recompila;
- o se añade un integration node.

Worktrees/sandboxes capturan base, diff, comandos, artifacts, logs, exit codes y recursos. La integración usa patches/commits identificados. Su obligatoriedad universal es experimental hasta medir capacidades y coste por target.

### Roles

La simplificación a `orchestrator/explorer/planner/worker/verifier/reviewer/specialist/judge` es una hipótesis de mantenimiento. No se retiran agentes de fase antes de que work-order schemas y target adapters demuestren equivalencia.

## Eventos y evaluación

### Eventos

```text
change.classified
graph.compiled
node.started
node.completed
node.failed
candidate.frozen
verification.completed
review.finding_recorded
correction.started
receipt.issued
delivery.blocked
recovery.executed
```

Los eventos registran IDs, timestamps, digests, target, costes y outcomes. Para contexto incluyen, cuando el host lo permita, tokens input/cached/uncached/output, lecturas y escrituras de artefactos, output de tools, contexto único/duplicado, amplification y fallback. Cada medida declara versión de schema, fuente (`host-observed|runtime-derived|estimated`) y cobertura; un cero sin cobertura no prueba ausencia. La telemetría vive fuera de los artefactos semánticos y puede reconstruirse/reconciliarse; no decide transiciones.

### Headless

R1 será consumidor del kernel, attestations y authorizations. Evalúa resultados estructurales, nunca auto-aprueba, y devuelve `halt` ante decisión humana pendiente.

Fixtures mínimos:

- bug pequeño;
- feature contenida;
- cross-module;
- migración;
- refactor;
- security fix;
- test complaciente;
- sobreingeniería;
- scope drift;
- worker interrumpido;
- receipt obsoleto;
- recovery inválida;
- conflicto entre agentes;
- reanudación.

### Longitudinal

Repositorios fixture reciben 10–30 cambios consecutivos. Se miden duplicación, interfaces/config acumuladas, dead code, acoplamiento, tests frágiles, tiempo de modificación, regresiones y compatibilidad legacy no retirada.

## Estrategia de migración

### Orden

1. ~~Resolver O2B~~ — hecho: baseline fixed publicada en v2.36.0; fixed permanece como control.
2. ~~K1 contract suite~~ — hecho: archivado y publicado en v2.37.0.
3. ~~K2: lifecycle + Minimal Kernel Harness + model-based~~ — hecho: archivado y publicado en v2.38.0.
4. ~~K2.1: Authority Store (CAS) + OperationPermit/Receipt + semántica de efectos~~ — hecho: archivado y publicado en v2.39.0.
5. ~~K2a: Headless Conformance Host + adapter real de referencia + CapabilityProof~~ — hecho: archivado y publicado en v2.40.0.
6. ~~K3: cuatro identidades + Candidate freeze + relación básica (`exact`/`changed`/`ambiguous`/`unknown`)~~ — hecho: archivado y publicado en v2.42.3 (baseline estable congelada).
7. ~~K4a: Execution Graph compiler + Obligation Manifest + replay (sin worker autoritativo)~~ — hecho: verificado y reconciliado en v2.45.7.
8. ~~K5: budgets (incl. autoridad/efectos) / failure / recovery~~ — hecho: archivado y publicado en v2.45.13 (remediaciones v2.45.7→v2.45.13).
9. ~~K6a: primitivas de ejecución aislada (`CreateWorkspace`…`DisposeWorkspace`); no conoce Repair~~ — hecho: archivado y publicado en v2.46.7; frontera de procesos cerrada en v2.47.1; endurecimiento de frontera (política inmutable, fs mutante, live-identity, `worker_threads`) en v2.47.2.
10. ~~K4b: orquesta Repair shadow (consume K6a; freeze Candidate vía K3)~~ — hecho: publicado en v2.48.0; corrección en v2.48.1; invariantes de integración en v2.48.2; cierre mode-only/baseline en v2.48.3.
11. ~~K6b: verifier + provenance + Assurance Graph (proyección)~~ — hecho: publicado desde v2.50.0, endurecido hasta v2.54.0 y cerrado en v2.55.0 (`runner-receipt/v1` durable en CAS, canal reemitido tras restart, bind de role en replay).
12. ~~K6c: ChallengePlan policy-selected~~ — hecho: publicado en v2.56.0; integridad (bindings canónicos, ejecución aislada fail-closed, conjunto exacto y proyección/replay) cerrada en v2.56.1; strategy binding + missing_tests/no-op fail-closed en v2.56.2.
13. K6d: complexity y architecture delta (next-eligible).
14. K7: ReviewAdapter + ReviewReducer + lineage; K8: CandidateEvaluationAttestation (emisión CAS).
14. K9: shadow/replay/A-B; promoción de **un** profile (checkpoints intermedios ya validados).
15. K10-delivery: DeliveryAuthorization **solo** del profile promovido; relación Candidate por etapas; resto fixed/deferred.
16. K10: expandir rutas una a una tras promoción.
17. K11a multi-target expansion → K11b model routing → K11c ownership/worktrees → K11d roles/paridad.
18. K12: corpus 14+, longitudinal 10–30, multi-target eval (runner mínimo ya en K2).

Verbos por slice: K2.1 **autoriza mutaciones**, K4a **compila**, K6a **ejecuta**, K4b **orquesta**, K3 **identifica**.

### Gates

- O2B/K1/K2 cerrados (hecho); defaults siguen fijos hasta K9 y gates posteriores.
- Checkpoints intermedios (`continue`/`revise`/`reject`) tras K2.1, K2a, K3, K4a, K4b, K6b/K6c y K7; K9 sigue siendo el único gate que promociona `kernel-shadow → kernel`.
- Un target inicial antes de paridad multi-target.
- Repair shadow antes de cinco rutas.
- Candidate freeze antes de Evaluation Attestation / Delivery Authorization (no bloquea `ArchiveTransactionReceipt` de O6A).
- Work-order contracts antes de simplificar roles.
- Evidence equivalence antes de retirar Strict TDD universal.
- K6a→K6d y K11a→K11d se ejecutan como changes separados; ningún slice hereda aprobación terminal del anterior.
- `CandidateEvaluationAttestation` no habilita delivery; enforcement productivo solo después de shadow/A-B.
- Gate único para rebasar O13/O15/O18/O19/R1 sobre el kernel.
- Compatibilidad y fallback fixed probados antes de deprecación.

### Anti-big-bang

No se permite un change que combine kernel global, cinco rutas, seis targets, consolidación de agentes y worktrees. Cada slice debe preservar autoridad, rollback y un camino de comparación fixed.

## Multi-target, conocimiento y federación

Los roadmaps de target siguen subordinados. Pueden mejorar capacidades independientes, pero la adopción del kernel se hace tras estabilidad core y de uno en uno.

R2 Foundation/OpenWiki permanece separado de evidencia de ejecución. Conserva siete slices: reparto normativo, consumo aguas abajo, ingesta resiliente, foundation por etapas, adopción brownfield, staleness/refresh y Starlight opcional. Cada slice tiene gate propio en el roadmap; puede consumir receipts/eventos como referencias, pero no gobernar transitions.

R4 epic/federation extiende el mismo Execution Graph:

1. subgraphs intra-repo;
2. contratos compartidos versionados;
3. provider → consumers;
4. verify federado;
5. archive coordinado.

No se crea una ruta rígida `epic` ni un segundo coordinador de lifecycle.

Un **Change Program** (objetivo humano → children OpenSpec con `depends_on` y cursor) no es R4. R4 no se adelanta para cubrir `/sdd-continue` multi-change; si el programa se materializa, R4 podrá reutilizar children con Candidate/receipt propios. `delivery_strategy` sigue partiendo PRs **dentro** de un change.

## Registro de madurez

### Implementado y reusable

- {implemented} OpenSpec/Git como autoridad.
- {implemented} Clarify condicional.
- {implemented} Review selectivo/full 4R y linaje acotado.
- {implemented} Recovery focal O4.2.
- {implemented} Archive híbrido/transaccional O6A.
- {implemented} Seis adapters/targets (incluye Cursor).
- {implemented} Model resolver estático (`models.yaml` canónico).
- {implemented} Evals/benchmark O2A y baseline fixed O2B.
- {implemented} Separación apply/verify.
- {implemented} Observabilidad parcial.
- {implemented} K1 contract suite (vocabulario, schemas, clasificación, paridad; publicado v2.37.0).
- {implemented} K2 lifecycle + Minimal Kernel Harness + model-based invariants (publicado v2.38.0).
- {implemented} K2.1 Authority Store (`load`/`compareAndSwap`), OperationPermit/Receipt y clases de efecto (publicado v2.39.0).
- {implemented} K2.1b controlled permit issuance (TransitionOffer + PolicyDecision|HumanDecision|KernelRule + expected_revision).
- {implemented} K2.1b atomic CAS consume of permit status + OperationReceipt with next_state/next_journal.
- {implemented} HostCapabilities + five transports (K2a).
- {implemented} CapabilityProof (K2a).
- {implemented} Headless Conformance Host (K2a).
- {implemented} Claude Code reference adapter (`claude`) (K2a; adapters are not semantic authority).
- {implemented} K3 cuatro identidades + Candidate freeze básico y relación `exact\|changed\|ambiguous\|unknown` (v2.42.3; gobernar apply→verify→review→delivery completo sigue en slices posteriores).
- {implemented} K4a Execution Graph compiler + Obligation Manifest + replay determinista (reconciliado v2.45.7).
- {implemented} K4a produce `capsule_inputs`; K6a materializa la cápsula aplicable. No existe ni se necesita un segundo compilador autoritativo.
- {implemented} K5 budgets (incl. autoridad/efectos), failures y recovery; no se reinician budgets por retry (v2.45.13).
- {implemented} K6a worker isolation y work-order capsule (v2.46.0–v2.47.2).
- {implemented} K4b Repair shadow execution (v2.48.0–v2.48.3).
- {implemented} Independent verifier over frozen CandidateId (K6b).
- {implemented} Evidence strategies with provenance and Strict TDD fallback (K6b).
- {implemented} Assurance Graph as derived content-addressed projection with selective invalidation (K6b); OpenSpec/Git/Candidate remain sole semantic authority.
- {implemented} ChallengePlan policy-selected y suite proporcional de challenges adversariales (K6c).

### Target arquitectónico aceptado

- {target} Runtime-owned lifecycle (ampliación post-K2.1 hacia Work Orders/Graph).
- {target} Schemas versionados y ausencia de fallback de autoridad a prosa (ampliación continua).
- {target} `status → next_transition` ejecutable (`execute|collect|decide|stop` con tokens/`command`) más allá del núcleo K2/K2.1.
- {target} Minimal Kernel Harness + model-based testing (invariantes por madurez adicional).
- {target} Paridad material entre proyección humana y envelope negociado.
- {target} Candidate freeze gobierna apply → verify → review → delivery (identidades y freeze básico ya en K3; attestation/authorization en K8/K10-delivery).
- {target} Consumo de Execution Graph + Obligation Manifest por recetas y federación (compiler/replay ya en K4a; no es autoridad independiente).
- {target} Assurance Graph as independent authority (never implemented by K6b; projection only). CX lo consume como proyección derivada content-addressed, nunca como autoridad independiente.
- {target} Clasificación por impacto + incertidumbre; hard floors no degradables por tamaño **y cableados a la ruta efectiva** (schema K1 hecho; enforcement de receta en K10; clamp de la tabla viva es compatibilidad).
- {target} Rutas como recetas y fases como capacidades (K10). La tabla lite/standard permanece como producto hasta promoción.
- {target} Clarify con invalidación parcial.
- {target} Presupuestos/failure/recovery consumidos por recetas y challenges (kernel K5 entregado; no reabrir el primitive).
- {target} Complexity delta (K6d).
- {target} ReviewAdapter + ReviewReducer + reutilización de lineage.
- {target} CandidateEvaluationAttestation (emisión CAS) y DeliveryAuthorization (kinds distintos; profile-scoped).
- {target} Eventos estructurados.
- {target} Medición de fricción de bloqueos (`in_band`/`out_of_band`/`dead_end`/…).
- {target} Shadow/A-B antes de promoción; checkpoints intermedios `continue|revise|reject`.
- {target} Corpus/longitudinal (K12) sobre runner mínimo de K2.
- {target} `InputProjectionBuilder`/`ContextProjection` derivado, content-addressed, reproducible, descartable y read-only, promovido por fase/profile con fallback `full`.
- {target} `PhaseCompletionReducer`, envelope JSON-only y renderers humanos como migración contractual versionada con CAS/replay y compatibilidad legacy.
- {target} Vistas de trazabilidad/archive derivadas de relaciones y receipts canónicos, conservando en el agente summary, riesgos y decisiones semánticas.

### Hipótesis experimentales

- {experimental} Shape exacto del Execution Graph respecto a state/OpenSpec.
- {experimental} Journal append-only y replay más allá de observabilidad.
- {experimental} Umbrales exactos de rutas/hard floors.
- {experimental} Retirada de Strict TDD universal.
- {experimental} Simplificación a ocho roles.
- {experimental} Worktrees obligatorios para toda unidad.
- {experimental} Paralelismo seguro multi-target.
- {experimental} Threat-model y políticas exactas de expiry por target para DeliveryAuthorization; la necesidad de enforcement pre-commit/pre-push/pre-PR ya es target aceptado.
- {experimental} Runtime/lenguaje final del kernel.
- {experimental} Firmas criptográficas o broker de efectos.
- {experimental} Beneficio neto de model routing por nodo.
- {experimental} Compact/sesión nueva forzada en frontera de change (sin resetear lineage/budgets).
- {experimental} Change Program (`program.yaml` + cursor) frente a partición humana de changes.
- {experimental} Relación `compatible-base-advance` (tras fixtures K9; no default).
- {experimental} Corrección por closure en review (solo shadow; no default — riesgo de loops).
- {experimental} `provable-contraction` (diferida hasta evidencia/findings/delivery completos).
- {experimental} Objetivos de reducción, bootstrap, duplicación, amplification y fallback; CX0 debe ratificarlos o corregirlos antes de usarlos como gate.
- {experimental} Deltas quirúrgicos de specs; diferidos hasta IDs estables, `base_hash`, merge canónico, loss validation, round-trip y fallback full-copy.

## Métricas de éxito

### Determinismo e integridad

- misma entrada → mismas transitions;
- divergencia state/Execution Graph falla cerrada;
- bytes distintos → successor;
- stale `CandidateEvaluationAttestation` / `DeliveryAuthorization` bloqueados;
- recovery no reinicia budgets ni findings;
- comando nombrado en un bloqueo, al ejecutarse, avanza o termina de forma honestamente terminal;
- proyección humana y envelope negociado no divergen en código, causa ni siguiente acción.

### Fricción de bloqueos

Cada bloqueo se clasifica en exactamente una clase:

- `in_band`: la negativa nombra una continuación ejecutable que desbloquea;
- `out_of_band`: detiene sin nombrarla;
- `by_design`: negativa correcta sin comando posible, acotada a vocabulario cerrado;
- `dead_end`: nada la resuelve;
- `self_recovered`: el flujo continúa sin comando extra.

La métrica privilegia reducir `dead_end` y `out_of_band`, no “parar menos”.

### Calidad

- obligaciones perdidas: 0;
- señales materiales descartadas: 0;
- defectos sembrados detectados por challenges aplicables;
- verifier no depende de narrativa del worker;
- complexity questions trazables.

### Eficiencia

- tokens input, cached, uncached y output por fase/profile/candidato;
- tokens leídos/escritos de artefactos y output de tools, con fuente y cobertura;
- contexto único/duplicado, ratio de duplicación y Artifact Amplification Factor;
- frecuencia y causa de fallback `compiled → full`;
- coste, tiempo, tools y retries por nodo/candidato;
- reparaciones dirigidas frente a reruns completos;
- tiempo hasta candidate/verdicto;
- coste del propio compiler/kernel;
- Direct/Repair no más caros sin justificación.

### Portabilidad

- capabilities reales por target;
- degradaciones explícitas;
- modelo/effort solicitado, clamped y efectivo;
- paridad estructural sobre fixtures comunes.

### Longitudinal

- deuda acumulada y compatibilidad legacy;
- tiempo de modificación entre cambios consecutivos;
- regresiones y fragilidad de tests;
- coste por candidato aprobado.

## Decisiones abiertas

1. Autoridad exacta del Execution Graph respecto a state/OpenSpec.
2. Granularidad y lint de nodos semánticos / Obligation Manifest.
3. ~~Schema y migración de la contract suite~~ — **parcial:** K1 delivered (`receipt/v1` legacy intacto); evolución futura = schemas propios en K8/K10-delivery (ver migración de cierre).
4. Taxonomy/versionado de failure codes existentes.
5. Estrategias de evidencia mínimas por clasificación / ChallengePlan / provenance admisible por obligación.
6. ~~Orden de finalización de evidence/findings alrededor de review~~ — **parcial:** K7/K8 acotan freeze → verify → review → attestation; detalles de digest final siguen en esos slices.
7. ~~Scope inicial de DeliveryAuthorization~~ — **resuelto:** solo el profile promovido por K9; resto `fixed`/unmanaged.
8. Clamps por target para worktrees, paralelismo y modelos.
9. Umbral para consolidar agentes sin perder contratos.
10. Semántica de replay y reconciliación de eventos.
11. Criterios de equivalencia para retirar universalidad de Strict TDD.
12. Lenguaje/runtime tras medir portabilidad, no antes.
13. Elección del host de referencia (K2a) por capacidad reproducible.
14. ~~CAS / permits / effect semantics~~ — **cerrado en K2.1** (v2.39.0); no reabrir como decisión abierta de diseño.
15. Cuándo promocionar `compatible-base-advance` tras fixtures K9 (experimental hasta entonces).
16. Cuándo materializar Change Program (orquestador vs espera a R4) y si el first-match de la tabla viva se corrige como change de compatibilidad **antes** de K10. No bloquea K6b. No es un slice nuevo.
17. Schema y granularidad de `ContextProjection`, más criterios de promoción `full → compiled-shadow → compiled` por fase/profile.
18. Cobertura mínima de telemetría para convertir los objetivos CX en gates, sin confundir estimaciones con observaciones del host.
19. Orden de retirada del envelope/prose legacy y de la escritura de state por agentes tras probar `PhaseCompletionReducer` con CAS/replay.

## Decisiones fuera de alcance

- Mover la autoridad fuera de OpenSpec/Git.
- Auto-aprobar gates.
- Adoptar TypeScript, Go, SQLite, OTLP, firmas o un framework como requisito global.
- Duplicar lifecycle por target.
- Mantener O20A y O13/O15/O18/O19/R1 como stacks equivalentes permanentes.
- Reescribir review lineage o archive transaccional.
- Adoptar el CLI/RDD/`review-integration` de Gentle AI (u otro arnés) como segunda autoridad de review o delivery.
- Copiar la relation algebra completa de Gentle como default; empezar con `exact|changed|ambiguous|unknown`.
- Activar seis targets/worktrees/rutas en un solo change.
- Retirar formatos actuales sin deprecación y fallback.
- Reabrir K1 o mutar `receipt/v1` para expresar la taxonomía Attestation/Authorization.
- Sustituir el roadmap por un “OSPEC v3” paralelo.
- Crear `architect-agent`, fase `architecture`, ruta rígida `epic`, pipeline de cinco agentes u orquestador paralelo para “changes fáciles” o “epics”.
- Introducir agentes espejo `*-cheap` en lugar de omitir capacidades no obligadas o usar K11b.
- Meter first-match, Change Program o Quality Attributes como identidades dentro de K6b.
- Resetear candidate, findings, budgets o attempts al compactar o abrir sesión.
- Introducir un segundo compiler, evidence store, review ledger o state semántico bajo el nombre de optimización de contexto.
- Crear rutas `Nano`/`Medium`/`Full`; los budgets de contexto son policy derivada de clasificación/riesgo con hard floors.
- Truncar obligations, evidence, approvals o dependencias para cumplir un budget.
- Activar deltas quirúrgicos de specs sin IDs estables, merge/loss validation, round-trip y fallback full-copy.
