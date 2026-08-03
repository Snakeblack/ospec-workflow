# Arquitectura objetivo — harness gobernado por kernel, grafo y evidencia

> **Autoridad:** fuente conceptual y estratégica del harness.
> **Corte documental:** v2.36.0, 2026-08-03.
> **Estado verificado:** O3, O4+O5/O4.1, O4.2, O6A y O2B están entregados; K1 es la siguiente iniciativa activa del roadmap.
> **Roadmap:** el estado operativo, orden y done criteria viven en [`../roadmaps/harness-evolution.md`](../roadmaps/harness-evolution.md).
> **Investigación no normativa:** la trazabilidad completa P0–P27 vive en [`research/harness-kernel-graph-evidence-roadmap-fusion.md`](research/harness-kernel-graph-evidence-roadmap-fusion.md).

## Decisión

El harness evoluciona hacia un **kernel determinista que compila intención y contratos semánticos en un Graph IR**, autoriza transiciones tipadas y liga verificación, review y entrega a evidencia y a una identidad inmutable de candidato.

Esta dirección no es una reescritura. Se construye generalizando los kernels ya entregados de clarify, review/linaje, recovery focal y archive transaccional. OpenSpec y Git siguen siendo la autoridad del change; el runtime gobierna lifecycle y efectos mecánicos; los modelos conservan el trabajo semántico.

O2B cerró la baseline fixed-policy de control. El cambio de defaults sigue bloqueado hasta superar shadow/A-B (K9) y los gates posteriores. La arquitectura objetivo es aceptada como dirección; sus contratos concretos se implementan por slices (K1 en adelante) y conservan compatibilidad con el flujo fixed.

## Ruta rápida

1. [Modelo de autoridad](#modelo-de-autoridad).
2. [Cadena canónica](#cadena-canónica-del-change).
3. [Kernel y Graph IR](#kernel-determinista-y-graph-ir).
4. [Rutas y capacidades](#clasificación-rutas-y-capacidades).
5. [Migración sin big bang](#estrategia-de-migración).
6. [Qué es hecho, target o hipótesis](#registro-de-madurez).

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
| Kernel runtime | Transiciones, budgets, permisos, digests y efectos mecánicos | No interpreta semántica libre. |
| Modelos | Descubrimiento, contrato, diseño, implementación, diagnóstico y review | No se conceden aprobación ni siguiente transición. |
| Graph IR | Plan ejecutable fingerprinted del change | Debe derivarse o reconciliarse con la autoridad canónica. |
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

## Estado implementado reconocido

### Capacidades fuertes reutilizables

| Capacidad | Estado implementado | Papel en la arquitectura objetivo |
| --- | --- | --- |
| OpenSpec state/recovery | Persistencia por change, resúmenes de fase, ledgers y recuperación desde filesystem. | Autoridad semántica que el kernel consume y reconcilia. |
| O3 clarify | Gate condicional después de spec, gobernado por envelope validado. | Semilla de `clarification.required/resolved` con invalidación parcial. |
| O4+O5/O4.1 | Generalist-first, selección determinista, full 4R por high-risk/overflow y reasons persistidos. | Selector/reviewer reusable; no se reescribe. |
| Review lineage | Candidate/paths/findings congelados, lenses one-shot, correction focal y límites de intentos. | Kernel de adjudicación acotada ligado al Candidate ID universal. |
| O4.2 | Recovery focal para drift de evidencia, con invariancia funcional y recheck. | Patrón de remediation tipada y bounded recovery. |
| O6A archive | Plan semántico + transacción runtime, staging, hashes, inventario, rollback/recovery y receipt. | Kernel reusable de efectos recuperables y receipts mecánicos. |
| Multi-target | Generación y adapters para Claude Code, VS Code, GitHub Copilot, OpenCode, Codex y Cursor. | Adapters mínimos consumidores de capability manifests. |
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
- K1 (contract suite, vocabulario y clasificación) es la siguiente iniciativa activa y bloquea K2.

El programa no cambia defaults por el solo hecho de cerrar O2B: cualquier promoción de policy, fixtures o routing exige los gates K1–K12 aplicables.

### Deuda real

- No existe un kernel global `status → next_transition` ejecutable.
- No existe Graph IR semántico común a Repair, planificación, invalidación y federación.
- La clasificación no separa completamente impacto, incertidumbre y ejecución ni fija hard floors por evidencia en runtime.
- Los budgets no son uniformes por nodo.
- Failure/recovery no comparten taxonomy y shape universales; las continuaciones anunciadas no siempre se ejercen E2E.
- Candidate freeze no gobierna todavía apply → verify → review → delivery ni declara proyección `workspace|staged`.
- No hay delivery receipt ligado a contract/graph/candidate/evidence/findings.
- No hay selector de estrategia de evidencia por tipo de cambio.
- Revert/mutation challenges y `complexity_delta` no son gates reutilizables.
- Worker isolation y ownership son parciales.
- Falta la suite completa de schemas, event contracts, paridad de superficies y evals longitudinales/fricción.

## Cadena canónica del change

```text
petición
  → intención y contexto
  → clasificación explicable
  → contrato semántico versionado
  → compilación de Graph IR
  → ejecución de work orders acotadas
  → captura de evidencia bruta
  → freeze del candidate tree
  → verify independiente sobre Candidate ID
  → finalización de evidencia y findings
  → review acotado cuando aplique
  → delivery receipt
  → entrega o recovery tipada
```

### Orden de freeze

El árbol de código se congela antes de verify:

1. El worker entrega diff, comandos, resultados, supuestos y riesgos como evidencia bruta.
2. El runtime canonicaliza paths y calcula base tree, candidate tree, diff y digests.
3. El verifier recibe contrato, Graph IR, `candidate_id`, repositorio y evidencia bruta.
4. Tras verify se finalizan evidence/findings digests.
5. Review consume la misma identidad y findings congelados.
6. El receipt liga todos los digests.

Cualquier byte distinto crea un candidato sucesor. Verify, review y delivery anteriores dejan de aplicar; no se “actualiza” un receipt existente.

### Candidate identity

```yaml
candidate:
  schema_version: 1
  id: sha256:...
  projection: workspace # workspace | staged
  base_tree: ...
  candidate_tree: ...
  diff_hash: ...
  paths_digest: ...
  changed_paths: []
  predecessor_id: null
```

La identidad es universal, pero no sustituye Git. Es una representación canónica y verificable de sus bytes y relaciones. `projection` declara qué superficie de bytes se congela: el working tree (`workspace`) o exactamente el índice Git (`staged`). Recovery hereda la proyección del predecesor salvo successor explícito autorizado; un receipt no puede apuntar solo a branch o working tree mutable.

### Delivery receipt

```yaml
receipt:
  schema_version: 1
  candidate_id: sha256:...
  contract_digest: sha256:...
  graph_digest: sha256:...
  evidence_digest: sha256:...
  findings_digest: sha256:...
  outcome: approved
  valid_for: [evaluation]
```

El primer receipt será de evaluación. Tras superar shadow/A-B, una iniciativa productiva separada implementará validadores `pre-commit`, `pre-push` y `pre-pr`.

#### Enforcement productivo

Cada superficie:

- valida `valid_for` exacto;
- exige binding de contract, graph, candidate, evidence y findings;
- aplica expiry e invalidación por successor, cambios de schema/policy o evidencia;
- rechaza replay, receipt foreign/stale y byte mismatch;
- falla cerrada;
- no relanza modelos/reviewers ni infiere aprobación desde prosa;
- declara degradación por target.

El rollout requiere threat model, recovery/reconciliation y fixtures de tampering, rebase, rollback y successor. Un receipt `evaluation` nunca autoriza delivery. Bypass/unmanaged aplaza a la policy del repo sin fabricar `approved`. Las denegaciones solo nombran un comando cuando ejecutarlo desbloquea. No se consume un proveedor de review externo (`gentle-ai.review-integration` u equivalente) como autoridad.

## Kernel determinista y Graph IR

### Superficie del kernel

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

### Graph IR

El Graph IR representa unidades semánticas:

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
```

`read`, `search`, `edit` y `test` no son nodos; son acciones internas de un worker. Un nodo existe porque tiene objetivo, invariantes, dependencias, ownership y evidencia.

### Compilación e invalidación

```text
intención + clasificación + contrato + capabilities
  → receta de ruta
  → selección de capacidades
  → Graph IR
  → work orders
```

Cuando una aclaración o fallo cambia una premisa:

1. se persiste la decisión o failure;
2. se identifican dependencias afectadas;
3. se invalidan solo nodos descendientes;
4. se recompila el subgrafo;
5. se preservan outputs todavía válidos por digest.

No se reinicia el workflow completo ni se reutiliza evidencia cuya dependencia sea desconocida.

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

### Capacidades, no fases obligatorias

- `clarify-intent`
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

## Ejecución acotada y recovery causal

### Budgets por nodo

```yaml
budget:
  model_turns: 12
  patches: 2
  commands: 20
  wall_time_minutes: 15
  changed_lines: 150
```

También se aplican `allowed_paths`, objetivo, finding y permisos. Agotar presupuesto no reinicia el mismo agente: produce failure tipada y transition de escalado, replanning, decisión o stop.

### Failure taxonomy

```text
implementation-defect
test-defect
specification-gap
design-gap
task-decomposition-gap
environment-failure
tool-failure
scope-drift
external-dependency
evidence-gap
unknown
```

Los tags actuales `code-bug`, `tasks-gap`, `design-gap` y `spec-gap` se migran con aliases/versionado; no se descartan histories existentes.

### Recovery

Cada recovery:

- declara causa, operación, argumentos y precondiciones;
- limita nodos y paths;
- consume budget;
- es idempotente o tiene reconciliación;
- tiene test E2E que demuestra avance, resolución o terminal honesto.

O4.2 es el patrón para remediación focal; O6A es el patrón para efectos interrumpidos.

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
- lineage OpenSpec permanece el ledger canónico; no se adopta un store/CLI de review externo.

El cambio arquitectónico de input sigue siendo: el linaje consumirá Candidate ID universal, Graph/evidence digests y classification reasons.

### Archive

O6A sigue separando:

- agente: interpretación semántica, specs resultantes, ADRs, warnings y `archive-plan`;
- runtime: hashes, staging, inventario, comparación de bytes, commit/rename, rollback, recovery y receipt.

El delivery receipt no sustituye el archive receipt. Ambos comparten primitives de identidad y validación, pero atestiguan scopes distintos.

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
```

Los valores efectivos son `enforced|partial|instructional|unavailable` cuando corresponda. El adapter traduce tools, frontmatter, UX, delegación, modelos y hooks; no decide lifecycle.

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

Los eventos registran IDs, timestamps, digests, target, costes y outcomes. La telemetría vive fuera de los artefactos semánticos y puede reconstruirse/reconciliarse; no decide transiciones.

### Headless

R1 será consumidor del kernel y receipts. Evalúa resultados estructurales, nunca auto-aprueba, y devuelve `halt` ante decisión humana pendiente.

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
2. Definir invariantes, vocabulario y contract suite mínima (K1), incluyendo shapes de transición ejecutable y paridad de superficies.
3. Implementar kernel `status/next_transition/recovery/events` (K2) con continuaciones que desbloquean al ejecutarse.
4. Extraer Candidate ID universal con proyección `workspace|staged` (K3).
5. Probar Graph IR + Repair compiler en shadow.
6. Añadir budgets/failure routing.
7. K6a: aislar worker y compilar capsule; gate por work result/inventory.
8. K6b: verifier independiente y strategies; gate por conformance/equivalence manifest.
9. K6c: challenges adversariales; gate por seeded defects.
10. K6d: complexity/architecture delta; gate por report reproducible.
11. Conectar review lineage existente y emitir receipt de evaluación.
12. Ejecutar shadow/replay/revert/A-B contra fixed.
13. Implementar enforcement productivo de receipt para pre-commit/pre-push/pre-PR.
14. Expandir rutas/capacidades.
15. K11a adapters → K11b model routing → K11c ownership/worktrees → K11d roles/paridad, cada uno con gate terminal.
16. Añadir headless, longitudinal y medición de fricción de bloqueos.

### Gates

- O2B cerrado (hecho); defaults siguen fijos hasta K9 y gates posteriores.
- Un target inicial antes de paridad multi-target.
- Repair shadow antes de cinco rutas.
- Candidate freeze antes de receipts.
- Work-order contracts antes de simplificar roles.
- Evidence equivalence antes de retirar Strict TDD universal.
- K6a→K6d y K11a→K11d se ejecutan como changes separados; ningún slice hereda aprobación terminal del anterior.
- Receipt de evaluación no habilita delivery; enforcement productivo solo después de shadow/A-B.
- Gate único para rebasar O13/O15/O18/O19/R1 sobre el kernel.
- Compatibilidad y fallback fixed probados antes de deprecación.

### Anti-big-bang

No se permite un change que combine kernel global, cinco rutas, cinco targets, consolidación de agentes y worktrees. Cada slice debe preservar autoridad, rollback y un camino de comparación fixed.

## Multi-target, conocimiento y federación

Los roadmaps de target siguen subordinados. Pueden mejorar capacidades independientes, pero la adopción del kernel se hace tras estabilidad core y de uno en uno.

R2 Foundation/OpenWiki permanece separado de evidencia de ejecución. Conserva siete slices: reparto normativo, consumo aguas abajo, ingesta resiliente, foundation por etapas, adopción brownfield, staleness/refresh y Starlight opcional. Cada slice tiene gate propio en el roadmap; puede consumir receipts/eventos como referencias, pero no gobernar transitions.

R4 epic/federation extiende el mismo Graph IR:

1. subgraphs intra-repo;
2. contratos compartidos versionados;
3. provider → consumers;
4. verify federado;
5. archive coordinado.

No se crea una ruta rígida `epic` ni un segundo coordinador de lifecycle.

## Registro de madurez

### Implementado y reusable

- OpenSpec/Git como autoridad.
- Clarify condicional.
- Review selectivo/full 4R y linaje acotado.
- Recovery focal O4.2.
- Archive híbrido/transaccional O6A.
- Seis adapters/targets (incluye Cursor).
- Model resolver estático (`models.yaml` canónico).
- Evals/benchmark O2A y baseline fixed O2B.
- Separación apply/verify.
- Observabilidad parcial.

### Target arquitectónico aceptado

- Runtime-owned lifecycle.
- Schemas versionados y ausencia de fallback de autoridad a prosa.
- `status → next_transition` ejecutable (`execute|collect|decide|stop` con tokens/`command`).
- Paridad material entre proyección humana y envelope negociado.
- Candidate freeze universal con proyección `workspace|staged`.
- Graph IR semántico.
- Clasificación por impacto + incertidumbre; hard floors no degradables por tamaño.
- Rutas como recetas y fases como capacidades.
- Clarify con invalidación parcial.
- Budgets/failure/recovery comunes.
- Verifier independiente.
- Evidence strategies/challenges/complexity delta.
- Reutilización de lineage.
- Delivery receipt de evaluación y enforcement productivo posterior ligado al candidato.
- Adapters mínimos.
- Eventos estructurados.
- Medición de fricción de bloqueos (`in_band`/`out_of_band`/`dead_end`/…).
- Shadow/A-B antes de promoción.

### Hipótesis experimentales

- Shape exacto y autoridad futura del Graph IR.
- Journal append-only y replay más allá de observabilidad.
- Umbrales exactos de rutas/hard floors.
- Retirada de Strict TDD universal.
- Simplificación a ocho roles.
- Worktrees obligatorios para toda unidad.
- Paralelismo seguro multi-target.
- Threat-model y políticas exactas de expiry por target para receipts productivos; la necesidad de enforcement pre-commit/pre-push/pre-PR ya es target aceptado.
- Runtime/lenguaje final del kernel.
- Firmas, attestations o broker de efectos.
- Beneficio neto de model routing por nodo.

## Métricas de éxito

### Determinismo e integridad

- misma entrada → mismas transitions;
- divergencia state/IR falla cerrada;
- bytes distintos → successor;
- stale receipt bloqueado;
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

- coste, tokens, tiempo, tools y retries por nodo/candidato;
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

1. Autoridad exacta del Graph IR respecto a state/OpenSpec.
2. Granularidad y lint de nodos semánticos.
3. Schema y migración de la contract suite.
4. Taxonomy/versionado de failure codes existentes.
5. Estrategias de evidencia mínimas por clasificación.
6. Orden de finalización de evidence/findings alrededor de review.
7. Scope inicial de delivery receipts.
8. Clamps por target para worktrees, paralelismo y modelos.
9. Umbral para consolidar agentes sin perder contratos.
10. Semántica de replay y reconciliación de eventos.
11. Criterios de equivalencia para retirar universalidad de Strict TDD.
12. Lenguaje/runtime tras medir portabilidad, no antes.

## Decisiones fuera de alcance

- Mover la autoridad fuera de OpenSpec/Git.
- Auto-aprobar gates.
- Adoptar TypeScript, Go, SQLite, OTLP, firmas o un framework como requisito global.
- Duplicar lifecycle por target.
- Mantener O20A y O13/O15/O18/O19/R1 como stacks equivalentes permanentes.
- Reescribir review lineage o archive transaccional.
- Adoptar el CLI/RDD/`review-integration` de Gentle AI (u otro arnés) como segunda autoridad de review o delivery.
- Activar cinco targets/worktrees/rutas en un solo change.
- Retirar formatos actuales sin deprecación y fallback.
