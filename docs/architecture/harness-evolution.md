# Arquitectura objetivo — harness gobernado por kernel, grafo y evidencia

> **Autoridad:** referencia del kernel estable y de sus contratos; la dirección arquitectónica y el roadmap de Adaptive tienen su fuente canónica en [`ospec-adaptive-critical-design.md`](ospec-adaptive-critical-design.md). Este documento no introduce prioridades Adaptive independientes.
> **Corte documental:** v2.68.4, revisado el 2026-09-26 (estado alineado con la fuente canónica Adaptive; se explicita kernel estable y ejecución adaptable por capacidad observada).
> **Estado verificado:** O3, O4+O5/O4.1, O4.2, O6A, O2B, **K1**, **K2**, **K2.1**, **K2a**, **K3**, **`k3-readiness-remediation`**, **K4a**, **K5**, **K6a**, **K4b**, **K6b**, **K6c** y **K6d** están cerrados. K6d aporta evidencia advisory; OpenSpec/Git/Candidate siguen siendo la única autoridad semántica y K7–K9 permanecen como trabajo objetivo.
> **Roadmap operativo:** el backlog y los estados se proyectan en [`../roadmaps/harness-evolution.md`](../roadmaps/harness-evolution.md), que debe mantenerse alineado con la fuente canónica Adaptive y con código/OpenSpec.
> **Precedencia documental:** para decisiones Adaptive prevalece `ospec-adaptive-critical-design.md`; para hechos de implementación prevalecen código/OpenSpec; este documento describe el kernel que ambos consumen. Una diferencia debe reconciliarse antes de iniciar el slice.
> **Investigación no normativa:** la trazabilidad completa P0–P27 vive en [`research/harness-kernel-graph-evidence-roadmap-fusion.md`](research/harness-kernel-graph-evidence-roadmap-fusion.md). La proporcionalidad de proceso y el programa de changes viven en [`research/proportional-process-and-change-program.md`](research/proportional-process-and-change-program.md).

**Guía de lectura:** [modelo operativo](#modelo-operativo) para el flujo; [autoridad e invariantes](#modelo-de-autoridad) para límites no negociables; [contratos técnicos](#kernel-determinista-y-execution-graph) para runtime y grafo; [migración](#estrategia-de-migración) para la secuencia; y [proporcionalidad](harness-proportionality.md) para la aplicación práctica.

## Modelo operativo

`ospec-workflow` gobierna qué debe demostrarse para cerrar un change; no prescribe una disciplina interna fija para cada modelo. El flujo principal es:

```text
Intención + aceptación → garantías requeridas → obligaciones
  → ejecución flexible → Candidate + evidencia → verifier/autoridad
  → cerrar, recuperar o escalar
```

**Estado actual:** K1–K6d aportan contratos, lifecycle, CAS/permits, Candidate, Execution Graph/Obligation Manifest, budgets, ejecución aislada, verifier, provenance, Assurance Graph como proyección, challenges y complexity advisory. K7–K10-delivery siguen en la cadena de confianza; K10 se promueve receta a receta tras evaluación. `fixed` es el control hasta superar shadow/A-B y los gates aplicables.

**Arquitectura objetivo:** un kernel determinista compila intención y contratos en un Execution Graph, conserva una identidad inmutable de Candidate y consume evidencia mediante un verifier. El Assurance Graph liga evidencia, verify, challenge, findings y attestations como proyección verificable; no es una segunda autoridad. OpenSpec/Git siguen siendo la autoridad semántica y el runtime posee transiciones, CAS, permits, budgets, digests y efectos mecánicos. Ningún modelo se aprueba ni se concede permisos a sí mismo.

### Kernel estable y ejecución intercambiable

| Superficie | Kernel estable: autoridad y límite | Ejecución intercambiable: puede variar |
| --- | --- | --- |
| Intención y aceptación | Scope, restricciones, approvals y policy quedan recuperables. | Exploración, planificación y forma de expresar el contexto. |
| Obligaciones | Riesgo, incertidumbre, radio de impacto y reversibilidad fijan floors, evidencia y decisiones humanas. | Número de workers, fases combinadas y profundidad de descomposición. |
| Candidate y evidencia | Candidate, digests, receipts, provenance, budgets y lineage tienen bindings verificables. | Herramientas, secuencia interna y proyecciones de input. |
| Verificación y cierre | Verifier, review/challenges requeridos y delivery authority permanecen separados del productor. | Contexto por consumidor, renderers y artefactos derivados. |

La capacidad cambia el camino, no el listón: puede comprimir invocaciones o representación cuando las obligaciones siguen cubiertas. Nunca rebaja un floor, fusiona autoridad de productor/verifier/delivery ni reemplaza una decisión humana requerida por policy.

### De intención a obligaciones

La clasificación no elige agentes ni documentos. Recoge intención, aceptación, interfaces, scope, reversibilidad y desconocidos materiales; con esas señales deriva obligaciones de comportamiento, compatibilidad, rollback, evidence strategy, review o challenge. Auth, migración, contrato público y efectos destructivos elevan floors aunque el diff sea corto o urgente. Un desconocido material exige exploración focal o una decisión de alcance antes de admitir una ejecución segura.

Las recetas K10 (`Direct`, `Repair`, `Bounded`, `Planned`, `Critical`) no equivalen implícitamente a `trivial`/`small`/`normal`/`high-risk` del routing vigente. El mapeo de garantías debe validarse antes de promover cada receta. Direct sigue reservado a trabajo mecánico, reversible y sin cambio de comportamiento.

### Ejemplo: Bounded con la misma garantía

Una lista interna admite filtrar por estados. El alcance confirmado excluye API pública, migración y auth; el contrato de aceptación exige que un estado permitido aparezca, uno excluido no aparezca y que un filtro vacío conserve la lista. Se congelan los paths permitidos y el Candidate antes de verificar.

| Obligación ilustrativa | Evidencia requerida |
| --- | --- |
| O1: contrato de filtrado | Resultados registrados de checks positivo, negativo y filtro vacío, ligados al Candidate y a los casos de aceptación. |
| O2: scope | Diff y `allowed_paths` que demuestren que no toca API, migración ni auth. |
| O3: Candidate | Digest y receipt de freeze ligados al diff evaluado. |
| O4: independencia | Verifier que ejecuta checks contra el Candidate congelado y review requerida por la receta. |

| Forma de ejecutar | Trabajo flexible | Obligaciones que no cambian |
| --- | --- | --- |
| Varios workers | Descubrir/decomponer e implementar en unidades separadas. | O1–O4: contrato, scope, Candidate, evidencia, verifier independiente y review. |
| Un worker con perfil observado aplicable | Analizar e implementar dentro del scope permitido. | O1–O4: exactamente la misma evidencia, verifier independiente y review. |

La capacidad solo permite agrupar trabajo; no demuestra calidad por el nombre del modelo. El perfil debe cubrir modelo, versión y effort, junto con configuración de harness/herramientas, corpus, contexto, provenance, frescura, estado `unproven` y fallback. Si cambian esas condiciones, el perfil deja de ser aplicable a la nueva configuración hasta reevaluarlo; la evidencia histórica conserva sus bindings originales. En ambas formas, `freeze → verify → review` permanece cuando la receta o policy lo exige.

### Persistencia JIT, escalado y perfiles observados

Se persisten intención/aceptación/scope, policy y Candidate, evidence/receipts/provenance, approvals, decisiones de recovery y datos que un consumidor vigente necesita. Graphs, renderers y vistas pueden derivarse **solo** si conservan entradas canónicas, digests, replay y los artefactos contractuales requeridos. No se presume que un grafo persistido pueda desaparecer: antes se hace inventario de consumidores, compatibilidad, replay y fallback. Búsquedas, checklists y razonamiento de trabajo son efímeros salvo que cambien alcance, contrato o una decisión que otro actor deba recuperar.

Una señal de riesgo nueva —auth, migración, API, efecto irreversible o scope inesperado— pausa el trabajo afectado, añade obligaciones o un floor y recompila solo el subgrafo necesario. Un fallo de check o evidencia stale activa recovery con causa y presupuesto existentes, sin inventar un riesgo mayor. Reintentos idénticos llevan a diagnóstico acotado o estado terminal, sin reiniciar lineage, attempts ni budgets. Un cambio material de contrato o Candidate usa successor y aprobación cuando el protocolo vigente la exige.

Un perfil observado delimita modelo, versión, effort y configuración de harness/herramientas, además de corpus, tarea/contexto, provenance/cobertura, frescura, estado `unproven` y fallback. No es `CapabilityProof` del host, `PolicySnapshot`, profile de routing ni un store nuevo. K9 puede comprobarlo en shadow/A-B focal; K11b y K12 lo usan donde sus capacidades sean necesarias, sin imponer una cadena universal de hosts, scheduler o roles.

### Evidencia, TDD y criterio de simplificación

Strict TDD actual no se evade: RED/GREEN se conserva donde la policy vigente lo exige. Challenges, mutation focal y checks son evidencia discriminante bajo un corpus y no prueban corrección total; solo una equivalencia demostrada con provenance, comparación, rollback y fallback puede cambiar una policy futura.

Se conserva un planner, router, rol o mecanismo de contexto cuando protege autoridad, recovery, verificación independiente o un consumidor real. Se simplifica o retira cuando solo duplica representación o ritual interno y el corpus muestra igual cobertura de obligaciones, integridad, calidad, coste y resultados end-to-end. Esta es una evolución del kernel existente, no un subsistema nuevo.

<a id="propósito-del-producto"></a>

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
5. **Proporcionalidad por evidencia.** Las garantías responden a riesgo, incertidumbre, radio de impacto y reversibilidad demostrables; líneas y archivos son contexto de reviewability/delivery, nunca degradan un hard floor de riesgo.
6. **Capacidad cambia el camino, no el listón.** Una capacidad solo se activa por una obligación o riesgo demostrable. La capacidad observada puede reducir artefactos o invocaciones para cumplirla, nunca eliminar floors, autoridad independiente o decisiones humanas requeridas por policy.
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

- PP1 ya cableó los hard floors K1 y la elegibilidad al routing vivo; su archive conserva el contrato de compatibilidad. PP2 y CX1 están archivados y pasan a preflight de consumidores, migración y reconciliación; CX2 sigue condicionado a un consumidor concreto. Esto no se interpreta como recetas K10 ni como runtime Adaptive.
- Recetas Direct/Repair/Bounded/Planned/Critical no están activas (K10, una a una, tras K9).
- K6c ya entrega ChallengePlan/challenges proporcionales y K6d `complexity_delta` advisory; su integración con review/promoción K7/K9 permanece pendiente, sin reabrir esas primitivas.
- K6b ya materializa el Assurance Graph como proyección verificable y evidence-bound; sigue pendiente integrar/revalidar sus relaciones en K7–K9, sin convertirlo en autoridad independiente de lifecycle, approval o delivery.
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

`read`, `search`, `edit` y `test` no son nodos; son acciones internas de un worker. Un nodo existe porque tiene objetivo, invariantes, dependencias, ownership y evidencia. El **Obligation Manifest** es una vista determinista del mismo Graph (no un tercer grafo ni store independiente): cada obligación `MUST` conocida por el contrato está implementada por un nodo, tiene evidencia requerida, o está aplazada mediante decisión explícita. El Manifest expresa qué debe demostrarse dentro de las obligaciones conocidas; un evaluador independiente aún debe contrastar su completitud. El número de workers, pasos internos o documentos solo expresa cómo se obtiene esa demostración.

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

### Identificadores legacy y recipes composicionales

| Ruta | Uso | Receta mínima |
| --- | --- | --- |
| Direct | Mecánico, reversible, sin comportamiento | inspect → edit → deterministic validate |
| Repair | Defecto reproducible y localizado | localize → reproduce → repair → freeze → verify |
| Bounded | Feature/refactor contenido | compact contract → work units → freeze → verify → review |
| Planned | Dependencias cross-module | discover → contract → decisions → graph → execute → freeze → verify/review |
| Critical | Seguridad, auth, datos, concurrencia, contratos públicos, destrucción | planned + irreversible-decision gates + failure/threat model + rollback + adversarial verify + specialist review |

Los cinco nombres se conservan como identificadores legacy de compatibilidad y telemetría. No forman un enum de dimensiones homogéneas: cada profile futuro compone obligaciones, hard floors, capabilities y evidence strategies versionadas. Las recipes no son nuevos orquestadores y ninguna composición puede anular una obligación fuerte por elegir un profile barato.

La tabla `routing:` de `openspec/config.yaml` (foundation, federated, bugfix, brownfield, refactor, hotfix, standard, lite) es el **producto actual**, no esas recetas. PP1 archivado hizo admisible `lite` para `trivial`/`small` elegibles, conectó floors K1 y conservó precedencia contextual, orden declarado e invariancia de continuaciones. `project.status: active` no es clasificación de change. La urgencia de hotfix tampoco exime de garantías. Ese cierre no autoriza Direct productivo ni degrada auth/API a “small”.

La admisión combina riesgo, incertidumbre, radio de impacto e irreversibilidad antes de preferencias o coste. Después se ajustan por separado representación/contexto y modelo. Un desconocido material pide exploración focal o resolución de alcance, no un salto automático a standard ni permiso implícito para lite. Una continuación conserva ruta, lineage y budgets; el descubrimiento de riesgo eleva obligaciones de forma monótona y nunca causa downgrade silencioso ni reinicia evidence/attempts. La [matriz de proporcionalidad](harness-proportionality.md#matriz-de-aceptación-para-cambios-futuros) concreta ejemplos y compatibilidad custom/multi-target.

La admisión de efectos es continua dentro de la capacidad declarada: cada operación material y cada ampliación de alcance vuelve a comprobar permiso, identidad, límites y resultado reconciliable. Shell, conectores, red o APIs fuera de la mediación observada se declaran como `partial|instructional|unavailable`; no se afirma enforcement universal por una instrucción de prompt.

Las recetas K10 y el legacy `trivial`/`small`/`normal`/`high-risk` no son equivalencias implícitas. Hasta que un hito de compatibilidad publique el mapeo de garantías por dirección, ambos vocabularios coexisten: PP1 gobierna el routing actual y K10 solo se promueve receta a receta. Así se evita que menos invocaciones se interprete como la misma autoridad para quien produce, verifica o autoriza.

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

Proposal, spec, design y tasks conservan responsabilidades y formatos compatibles.

**Objetivo K10:** el compiler decidirá si requieren agente propio, invocación combinada o materialización compacta, tras contratos runtime y promoción de receta. Una Bounded puede cumplir las mismas obligaciones con un worker o varios, pero conserva `freeze → verify → review` cuando la receta lo exige.

**Perfil observado:** la decisión parte de evals/corpus y shadow runs por tarea, con provenance, frescura y fallback declarados; no usa identidad de modelo ni autoconfianza como assurance. Este perfil de ejecución no es `CapabilityProof` del host, `PolicySnapshot` ni un profile de routing, y no añade un schema o autoridad nueva.

**Compatibilidad PP2/CX1:** PP2 conserva proposal-lite, tasks, apply, verify y archive; CX1 conserva envelope/reducer, CAS/replay y fallback legacy. El trabajo vigente es auditar consumidores y reconciliar divergencias; no exige una segunda implementación, no crea otro estado canónico y no activa Adaptive. El siguiente change nuevo es `adaptive-operation-identity-binding`.

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

Strict TDD permanece activo mientras no exista equivalencia demostrada. La arquitectura objetivo separa la dirección futura —evidencia discriminante por obligación, por ejemplo challenges o mutation focal bajo un corpus aplicable— de los contratos actuales. Esa evidencia no prueba corrección total ni autoriza omitir RED/GREEN donde la policy strict vigente lo exige; solo puede informar una promoción posterior con comparación, provenance, rollback y fallback strict. La selección explícita no significa menos evidencia.

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
| Nivel 1 — generalista | Generalista read-only cuando la policy/obligación lo requiere para contrato, correctness, scope, evidencia, complejidad o regresiones | Puede recomendar Nivel 2; runtime valida la selección |
| Nivel 2 — especialistas | Lenses selectivas ligadas a riesgo/evidencia | Solo se ejecutan las necesarias; high-risk/overflow conserva full 4R |

Cuando la policy selecciona los niveles 1/2, se conserva el comportamiento entregado:

- generalista read-only primero si Nivel 1 fue seleccionado;
- cero a dos specialists targeted para normal;
- tres o más señales positivas y high-risk → full 4R;
- cada lens una vez;
- findings con IDs estables;
- correction/validation focal;
- budget y attempts inmutables;
- follow-ups no bloqueantes;
- successor explícito para nuevo scope/discovery.

`performance` y `compatibility-migration` se incorporan como señales y lenses condicionadas, no como reviewers permanentes. Antes de poder bloquear necesitan contract, budget, fixtures positivos/negativos y evals que prueben activación por cambio de rendimiento, API/formatos, migración o compatibilidad. La ausencia de señal persiste una razón de skip. Las cuatro lenses 4R actuales no se renombran ni se reescriben como stack paralelo.

K7 es el bridge mínimo de autoridad sobre lineage y reducer existentes; la refutación o corrección por closure siguen siendo opciones condicionadas por evidencia, no requisitos para habilitar garantías base:

- *precision gate* y Flag/Do-Not-Flag densos en las lentes;
- refutación acotada solo de BLOCKER/CRITICAL antes de freeze/corrección (techo 1|3 tasks; default `stands`);
- severity floor: WARNING/SUGGESTION quedan como follow-up por defecto; una WARNING material frente a una obligación se eleva con razón explícita antes de decidir si consume correction;
- lineage OpenSpec permanece el ledger canónico; no se adopta un store/CLI de review externo ni RDD de Gentle.

El cambio arquitectónico de input sigue siendo: el linaje consumirá Candidate ID universal, Graph/evidence digests y classification reasons. CX5b, **después de K7**, podrá derivar una proyección por lens y una proyección de correction limitada a findings, paths, hunks, obligations y evidencia congelados. Cada lens es one-shot dentro del lineage: invalidar inputs no relanza discovery; un nuevo scope o hallazgo bloqueante requiere successor autorizado. No crea `.review` ni otro ledger; el lineage OpenSpec y los budgets existentes siguen mandando.

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
13. K6d: complexity y architecture delta implementados como evidencia advisory Candidate-bound.
14. K7: ReviewAdapter + ReviewReducer + lineage; K8: CandidateEvaluationAttestation (emisión CAS).
14. K9: shadow/replay/A-B; promoción de **un** profile (checkpoints intermedios ya validados).
15. K10-delivery: DeliveryAuthorization **solo** del profile promovido; relación Candidate por etapas; resto fixed/deferred.
16. K10: expandir rutas una a una tras promoción.
17. K11a–K11d y K12 avanzan por dependencias de capability: model routing puede validarse en un host; scheduler solo depende de routing si lo usa; roles no requieren worktrees/concurrencia si no los ejercitan; corpus focal parte del runner K2 y de las capacidades que cubre.

Verbos por slice: K2.1 **autoriza mutaciones**, K4a **compila**, K6a **ejecuta**, K4b **orquesta**, K3 **identifica**.

### Gates

- O2B/K1/K2 cerrados (hecho); defaults siguen fijos hasta K9 y gates posteriores.
- Checkpoints intermedios (`continue`/`revise`/`reject`) tras K2.1, K2a, K3, K4a, K4b, K6b/K6c y K7; K9 sigue siendo el único gate que promociona `kernel-shadow → kernel`.
- Un target inicial antes de paridad multi-target.
- Repair shadow antes de cinco rutas.
- Candidate freeze antes de Evaluation Attestation / Delivery Authorization (no bloquea `ArchiveTransactionReceipt` de O6A).
- Work-order contracts antes de simplificar roles.
- Evidence equivalence antes de retirar Strict TDD universal.
- K6a→K6d y K11a–K11d se ejecutan como changes separados; sus dependencias siguen el DAG de capabilities y ningún slice hereda aprobación terminal de otro.
- `CandidateEvaluationAttestation` no habilita delivery; enforcement productivo solo después de shadow/A-B.
- Gate único para rebasar O13/O15/O18/O19/R1 sobre el kernel.
- Compatibilidad y fallback fixed probados antes de deprecación.

### Anti-big-bang

No se permite un change que combine kernel global, cinco rutas, seis targets, consolidación de agentes y worktrees. Cada slice debe preservar autoridad, rollback y un camino de comparación fixed.

<a id="ruta-rápida"></a>

## Orden recomendado de trabajo

El detalle operativo, estados y done criteria vive en el [roadmap](../roadmaps/harness-evolution.md#orden-recomendado-de-trabajo). Esta arquitectura solo fija la dependencia: la cadena de confianza es **K7 → K8 → K9 → K10-delivery**, con el baseline/oracle del K12 focal como prerequisito de evidencia antes de promocionar K9; K10 promueve cada recipe/profile por separado. K11a–K11d y el K12 longitudinal avanzan cuando sus capacidades lo permiten; no forman una cadena universal.

PP1 ya cerró el routing vivo y sus floors. PP2 y CX1 están archivados; su preflight de consumidores conserva fallback y no crea otra autoridad. CX2 y R2 pueden reducir repetición o incertidumbre, pero no adelantan una recipe K10, eliminan verificación independiente ni constituyen autorización de runtime. El siguiente change nuevo es `adaptive-operation-identity-binding`; K7 continúa técnicamente elegible y K12 focal puede avanzar en paralelo.

La aplicación de estas reglas está en [proporcionalidad](harness-proportionality.md); la base de conocimiento reutilizable, en [foundation holística](harness-foundation-holistic.md). Antes de declarar ahorro, se miden por cohortes coste, relecturas, latencia, rework y conservación de evidencia.

## Multi-target, conocimiento y federación

Los roadmaps de target siguen subordinados. Pueden mejorar capacidades independientes, pero la adopción del kernel se hace tras estabilidad core y de uno en uno.

R2 Foundation/OpenWiki permanece separado de evidencia de ejecución. Conserva siete slices: reparto normativo, consumo aguas abajo, ingesta resiliente, foundation por etapas, adopción brownfield, staleness/refresh y Starlight opcional. Cada slice tiene gate propio en el roadmap; puede consumir receipts/eventos como referencias, pero no gobernar transitions.

La [foundation holística](harness-foundation-holistic.md) concreta R2.1/R2.4: relacionar propósito y usuarios con capacidades, datos, interfaces, calidad, seguridad, operación, entrega, soporte y evolución del software; profundizar solo donde cambie una decisión. Sirve a web, API, CLI, librerías, mobile, desktop y embedded. R2.2 lleva referencias vigentes a planner/verifier; R2.3/R2.6 pueden alojar curación externa y una futura skill CNCF on-demand sin convertir un catálogo, OpenWiki o Starlight en prerrequisito.

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
- {implemented} Complexity/architecture delta Candidate-bound (K6d), evidencia advisory; cierre archivado en `2026-09-03-k6d-complexity-architecture-delta`.
- {implemented} CX0, instrumentación advisory; cobertura y limitación histórica de archive registradas en el roadmap, sin ahorro atribuido.

### Target arquitectónico aceptado

- {target} Runtime-owned lifecycle (ampliación post-K2.1 hacia Work Orders/Graph).
- {target} Schemas versionados y ausencia de fallback de autoridad a prosa (ampliación continua).
- {target} `status → next_transition` ejecutable (`execute|collect|decide|stop` con tokens/`command`) más allá del núcleo K2/K2.1.
- {target} Minimal Kernel Harness + model-based testing (invariantes por madurez adicional).
- {target} Paridad material entre proyección humana y envelope negociado.
- {target} Candidate freeze gobierna apply → verify → review → delivery (identidades y freeze básico ya en K3; attestation/authorization en K8/K10-delivery).
- {target} Consumo de Execution Graph + Obligation Manifest por recetas y federación (compiler/replay ya en K4a; no es autoridad independiente).
- {target} Integración y revalidación selectiva del Assurance Graph en K7–K9; K6b ya entrega la proyección content-addressed y evidence-bound, que nunca se convierte en autoridad independiente.
- {target} Clasificación por impacto + incertidumbre; hard floors no degradables por tamaño **y cableados a la ruta efectiva** (schema K1 hecho; enforcement de receta en K10; clamp de la tabla viva es compatibilidad).
- {target} Rutas como recetas y fases como capacidades (K10). La tabla lite/standard permanece como producto hasta promoción.
- {target} Clarify con invalidación parcial.
- {target} Presupuestos/failure/recovery consumidos por recetas y challenges (kernel K5 entregado; no reabrir el primitive).
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
16. Cuándo materializar Change Program (orquestador vs espera a R4) sigue abierto y sin slice. La prioridad de corregir first-match **antes** de K10 queda resuelta documentalmente mediante PP1; no implica implementación o aprobación y no amplía K6b.
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

<details>
<summary>Referencia histórica de reconciliación y cortes técnicos preservados</summary>

### Corte conceptual 2026-08-04 (reconciliación con roadmap)

K1–K6d están cerrados; K6d solo aporta evidencia advisory. Se consolidó la separación entre Execution Graph (trabajo) y Assurance Graph (proyección de evidencia), las identidades `SourceSnapshotId`/`WorkOrderId`/`WorkResultId`/`CandidateId`, y la autoridad CAS con `TransitionOffer`, `OperationPermit` y `OperationReceipt` distintos. `Candidate.projection` sigue limitado a `workspace|staged`; K4a compila, K6a ejecuta, K4b orquesta Repair y K3 identifica. Delivery productivo queda reservado al perfil promovido por K9.

```text
Change Contract → Execution Graph → Candidate → Assurance Graph → Attestation / Authorization
```

### Corte conceptual 2026-08-27 (proporcionalidad y programa)

El proceso intra-change (recetas/capacidades) no equivale a la descomposición inter-change. `lite`/`standard`/`hotfix` siguen siendo el producto actual y Direct/Repair/Bounded/Planned/Critical son recetas K10 sin promoción implícita. PP1 corrigió la elegibilidad legacy con hard floors; Change Program, cuando exista, será children OpenSpec con `depends_on` y cursor, sin segundo orquestador ni ruta `epic`.

### Corte correctivo 2026-08-28 (fronteras K6b)

`runner-receipt/v1` es evidence-bound y solo una capacidad opaca del runtime puede conceder autoridad. Replay exige igualdad de evidence, candidate, node y role, bytes resolubles y cronología; cualquier divergencia falla como `GRAPH_DIVERGENCE`. Los records viven en CAS `runner_receipts` y tras restart se reemite un canal opaco nuevo.

### Corte conceptual 2026-08-28 (K6c adversarial challenges)

`ChallengePlan` se selecciona por strategy y `PolicySnapshot`; sus resultados son evidencia complementaria, nunca autoridad de delivery. El presupuesto es monótono, las mutaciones son focales y el verifier exige bindings canónicos, aislamiento fail-closed y el conjunto exacto. K6c cerró sus remediaciones de integridad; K6d no promovió autoridad adicional.

### Corte propuesto 2026-08-31 (eficiencia de contexto, no bloqueante)

CX modifica transporte y proyecciones, no autoridad ni ruta crítica. K4a ya produce `capsule_inputs`; faltan proyección por consumidor, medición completa y reducción mecánica end-to-end. Los históricos de tokens confirman una patología de consumo, no una baseline causal ni una justificación para reducir assurance.

</details>
