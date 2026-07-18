# Arquitectura y evolución del harness — ospec-workflow

> **Autoridad:** fuente de verdad conceptual y estratégica del harness.
> **Corte documental:** v2.30.0, 2026-07-18.
> **Estado verificado:** O4+O5 entregado y archivado; el review selectivo actual es generalist-first y conserva linajes acotados.
> **Alcance:** describe el estado implementado, la arquitectura objetivo y las restricciones de transición. El orden, estado y criterios de terminado viven exclusivamente en [`../roadmaps/harness-evolution.md`](../roadmaps/harness-evolution.md).
> **Precedencia:** código y OpenSpec baseline probados → este documento → roadmap general → roadmaps de target → documentos archivados.

## 1. Propósito del producto

`ospec-workflow` es un harness Spec-Driven Development, multi-target y LLM-first para ejecutar cambios de software con el grado correcto de especificación, diseño, implementación, verificación y revisión.

El harness debe comportarse como un senior técnico que acompaña:

- comprende intención, restricciones, contexto y riesgo;
- explicita decisiones materiales y solicita aprobación humana cuando corresponde;
- conserva trazabilidad desde requisitos hasta implementación y evidencia;
- adapta profundidad, coste y controles al cambio real;
- utiliza modelos para trabajo semántico y runtime determinista para estructura, políticas y operaciones mecánicas;
- explota capacidades nativas de cada host sin romper el canon común;
- puede explicar por qué ejecutó, omitió, escaló o degradó cada paso.

La promesa del producto no es «generar más documentación». Es **aplicar garantías proporcionales al riesgo sin perder auditabilidad ni convertir el proceso en una secuencia rígida**.

## 2. Autoridad documental

| Documento | Autoridad | No debe contener |
| --- | --- | --- |
| Este análisis | Arquitectura, principios, contratos objetivo, restricciones y problemas abiertos | Checkboxes operativos, puntero de siguiente tarea, crónica detallada de sesiones |
| `docs/roadmaps/harness-evolution.md` | Backlog transversal, dependencias, orden, estado y done criteria | Decisiones arquitectónicas nuevas no reflejadas aquí |
| `docs/roadmaps/targets/*.md` | Especialización y optimización de un host concreto | Prioridad transversal independiente del roadmap general |
| OpenSpec baseline y changes archivados | Contratos ejecutables, evidencia y decisiones de implementación | Visión de producto no reconciliada |
| `analisis-fino/archive/**` | Historia y origen de decisiones | Estado vigente o trabajo nuevo |

Cuando dos fuentes discrepan, se inspeccionan código y OpenSpec antes de actualizar la autoridad superior. No se corrige solo el roadmap para ocultar una divergencia.

## 3. Principios invariantes

1. **Aprobación humana para decisiones materiales.** Ningún modo, incluido CI, auto-aprueba un gate. En ejecución no interactiva, una decisión material pendiente degrada a `halt` con reporte.
2. **OpenSpec y Git son el estado canónico.** No se introduce una base de datos o servicio externo como autoridad paralela del change.
3. **Separación semántica, no burocracia física.** Intención, comportamiento, diseño y tareas conservan responsabilidades distintas, aunque puedan materializarse de forma compacta o producirse en una misma invocación.
4. **El modelo produce semántica; el runtime aplica estructura.** Interpretación, trade-offs y diseño pertenecen al modelo. Schemas, fingerprints, políticas, transacciones, inventarios, límites y estados pertenecen a código determinista.
5. **Fail-closed selectivo.** Seguridad, integridad contractual, pérdida de evidencia y operaciones destructivas fallan cerradas. Telemetría y ayudas puramente advisory pueden degradar de forma explícita.
6. **Adaptación continua.** La clasificación inicial es una hipótesis. El perfil se reevalúa cuando aparecen contrato, diseño, diff real y evidencia de verify.
7. **Garantías monotónicas.** Una señal material puede aumentar garantías. Una desescalada puede reducir coste, prosa o trabajo no justificado, pero no retirar evidencia o controles ya exigidos.
8. **Ninguna señal material se descarta por presupuesto.** Los límites de coste pueden provocar escalado, batching o intervención humana; nunca silencian un riesgo positivo.
9. **Degradación por target declarada.** Una garantía solo se anuncia como `enforced` cuando el host puede ejecutarla. En otro caso se registra como `partial`, `instructional` o `unavailable`.
10. **Runtime ligero y portable.** Se mantiene CommonJS/Node 22+ y Go donde aporta valor, sin frameworks ni una cadena de build obligatoria para consumir el target.
11. **Un concepto, una autoridad.** No se crean rutas, agentes o documentos paralelos para representar la misma decisión.
12. **Compatibilidad antes de retirada.** Los aliases y formatos actuales se conservan hasta que la política adaptativa demuestre calidad no inferior y exista una migración explícita.

## 4. Estado actual verificado

### 4.1 Capacidades entregadas

A fecha del corte, el harness dispone de:

- un orquestador coordinador y agentes de fase con contratos de resultado, bloqueos y `question_gate`;
- persistencia por change en OpenSpec, recuperación desde filesystem y resúmenes de fase;
- routing declarativo por tabla, clasificación inicial y aliases de flujo;
- approval ledger, assumption ledger, intent restatement, mentorship mode, ADRs y memoria de decisiones;
- strict TDD, verificación, quality gates, trazabilidad REQ → task → commit → test y detección de colisiones;
- reglas compactas, resolución de skills, envelopes JSON validables y telemetría de costes por fase;
- generación multi-target para Claude Code, VS Code, GitHub Copilot, OpenCode y Codex;
- resolución estática de modelos por `agent → tier → target`;
- foundation, baseline brownfield, reconcile, documentación técnica y federación de lectura;
- evals estructurales, benchmark local, lints contractuales y paridad de contratos;
- O3: clarify condicional como gate posterior a `sdd-spec`;
- O4+O5: review selectivo, generalista read-only, clasificación determinista, selección de especialistas y linaje acotado;
- runtime de review con reducers puros, findings congelados, validación dirigida y límite de intentos;
- archive endurecido con fingerprint de baseline, copia, inventario y verificación antes del borrado.

### 4.2 Contrato real de O4+O5

El comportamiento implementado y normativo es:

1. El gate 4R se ejecuta solo cuando la ruta activa lo declara y `sdd-verify` termina con `status: success`.
2. `review-change` se ejecuta primero para cambios normales y `high-risk`.
3. Su decisión estructurada se valida y se combina con evidencia determinista del diseño, diff y verify.
4. Un cambio normal selecciona actualmente de cero a dos especialistas.
5. Un cambio `high-risk` ejecuta los cuatro especialistas por override determinista.
6. Cada especialista seleccionado se ejecuta una sola vez dentro de un linaje.
7. Tras congelar findings, solo `review-correction` puede validar los IDs pendientes.
8. Los retries no reinician presupuesto, paths, reviewers ni findings.

El contrato persistido es una `review_decision` final con selección y razones. `required|candidate|skip` puede existir como lenguaje de diseño, pero no es el shape canónico implementado.

### 4.3 Limitación conocida del review actual

El límite de dos especialistas para un cambio normal puede excluir una tercera dimensión con señal positiva. Esto contradice el principio de no descartar riesgos por presupuesto.

La arquitectura objetivo corrige esta situación:

```text
0-2 dimensiones positivas
  → review targeted

3-4 dimensiones positivas
  → escalar depth.review a strict
  → recalcular perfil
  → full 4R
```

Hasta que se implemente esa regla, el comportamiento actual se considera una limitación conocida, no el estado objetivo.

### 4.4 Deuda estructural abierta

1. Las rutas mezclan intención, topología y rigor.
2. La selección de modelo es estática por nombre de agente, no por decisión de ejecución.
3. No existe un resolver único `perfil → policy → variante → target → invocación`.
4. El orquestador contiene demasiada política en prompt y está cerca de su guard de tamaño.
5. El generador transforma principalmente una fuente en un artefacto por target; no tiene expansión canónica one-to-many para variantes.
6. `state.yaml` acumula payloads grandes y no es una base adecuada para todo el perfil adaptativo.
7. Archive todavía delega al modelo interpretación de deltas Markdown y promoción de ADRs.
8. La infraestructura de benchmark está entregada, pero falta una baseline fija de control con los nueve perfiles.
9. La evidencia sigue demasiado ligada a Markdown producido por agentes.
10. Las capacidades reales difieren entre targets y algunos adapters no aprovechan campos nativos.
11. Foundation/OpenWiki tienen consumo y lifecycle incompletos.
12. La escritura coordinada multi-repo sigue pendiente.

## 5. Arquitectura objetivo

### 5.1 Flujo canónico

```text
Petición
  ↓
Comprender intención y contexto
  ↓
Construir perfil adaptativo
  ↓
Resolver policy de ejecución
  ↓
Planificar con profundidad necesaria
  ↓
Aplicar
  ↓
Verificar
  ↓
Reevaluar perfil y garantías
  ↓
Revisar selectivamente
  ↓
Preparar plan semántico de archive
  ↓
Ejecutar transacción determinista de archive
```

No existen programas conceptualmente separados para `lite`, `standard`, `strict`, bugfix, refactor o federated. Existe un flujo canónico con ejes independientes y distintas profundidades.

### 5.2 Ejes independientes

La decisión deja de comprimirse en una etiqueta única:

```yaml
execution_profile:
  schema_version: 1
  revision: 4

  intent: bugfix
  topology: single-repo
  preset: standard

  risk:
    public_contract: 0
    security: 0
    persistent_data: 0
    privileged_io: 1
    cross_module: 1
    ambiguity: 0
    rollback_cost: 0
    test_gap: 0

  depth:
    intent: compact
    behavior: full
    design: compact
    decomposition: standard
    implementation: standard
    verification: behavioral
    review: targeted
    memory: change

  sources:
    - code: diff-global-config-write
      origin: real-diff
      evidence_ref: evidence.json#facts/3
```

- **Intent**: qué clase de trabajo se realiza.
- **Topología**: dónde y con qué coordinación se realiza.
- **Preset**: suelo de garantías y presupuesto inicial.
- **Risk**: señales cuantificadas y justificadas.
- **Depth**: profundidad requerida por responsabilidad.
- **Sources**: procedencia auditable de cada señal.
- **Revision**: versión monotónica del perfil durante el change.

### 5.3 Presets como suelos de garantía

| Preset | Significado | Regla principal |
| --- | --- | --- |
| `micro` | Operación mecánica, reversible y sin comportamiento nuevo | Cualquier señal material escala |
| `lite` | Cambio pequeño con contratos compactos | No omite responsabilidades semánticas; reduce materialización y coste |
| `standard` | Perfil habitual | Profundidad gobernada por señales y evidencia |
| `strict` | Máximo control | Define mínimos no reducibles para comportamiento, diseño, verify y review |

Los presets no son rutas. `bugfix`, `refactor`, `foundation`, `brownfield`, `epic` y `federated` pertenecen a intención o topología.

### 5.4 Persistencia del perfil

`state.yaml` conserva una referencia compacta:

```yaml
execution_profile:
  revision: 4
  ref: execution-profile.json
  fingerprint: sha256:...
  evaluated_at: 2026-07-18T12:00:00Z
  reason: post-verify
```

El documento completo vive en:

```text
openspec/changes/<change>/execution-profile.json
```

La separación permite:

- validación por schema;
- fingerprints estables;
- historial de revisiones;
- diffs estructurados;
- evitar parsers YAML ad hoc para objetos crecientes;
- mantener OpenSpec/Git como autoridad.

### 5.5 Puntos de reevaluación

El perfil se recalcula en puntos explícitos:

1. **Entrada:** intención, alcance, proyecto, baseline, topología y señales iniciales.
2. **Después del contrato:** ambigüedad residual, API pública, datos, compatibilidad y reversibilidad.
3. **Después del diseño:** dependencias, privilegios, migraciones, blast radius y rollback.
4. **Después de apply:** diff real, archivos inesperados, operaciones, dependencias y desviaciones.
5. **Después de verify:** fallos, warnings, gaps de tests y evidencia insuficiente.
6. **Antes de review:** selección de dimensiones y clamps.
7. **Antes de archive:** readiness, riesgos aceptados e integridad de evidencia.

Cada reevaluación puede:

- aumentar `depth`;
- activar un gate;
- escalar preset;
- seleccionar especialistas;
- solicitar una decisión humana;
- recomendar un tier mayor;
- reducir prosa o trabajo no justificado;
- detener el flujo.

Una reducción de profundidad nunca invalida garantías ya materializadas.

## 6. Control plane adaptativo

### 6.1 Capas

```text
Signal Collector
  ↓
Profile Normalizer
  ↓
Execution Policy Resolver
  ↓
Variant Resolver
  ↓
Target Capability Adapter
  ↓
Invocation Kernel
  ↓
Result Validator
  ↓
State / Evidence Writer
```

#### Signal Collector

Recoge hechos, no decisiones:

- intención declarada;
- topología del workspace;
- baseline y ownership;
- contrato y diseño;
- diff real;
- verify findings;
- operaciones privilegiadas;
- dependencias y migraciones;
- capacidades del target.

#### Profile Normalizer

Normaliza señales, elimina duplicados, asigna fuentes y produce el `execution_profile` fingerprinted.

#### Execution Policy Resolver

Es una función determinista:

```js
resolveExecutionPolicy({
  phase,
  profile,
  projectPolicy,
  targetCapabilities,
  previousDecision
}) -> {
  variant,
  minimumGuarantees,
  modelTierIntent,
  effortIntent,
  gates,
  validators,
  materialization,
  reasons
}
```

El resolver no ejecuta modelos ni filesystem. Sus decisiones son auditables y testeables.

#### Variant Resolver

Traduce la policy a una variante canónica de fase:

```text
sdd-apply + depth.implementation=compact
  → sdd-apply-lite

sdd-verify + depth.verification=full-audit
  → sdd-verify-strict
```

Las variantes son wrappers generados, no skills independientes mantenidas a mano.

#### Target Capability Adapter

Aplica clamps y degradaciones del host:

```yaml
target_capabilities:
  structured_questions: native | chat-fallback
  subagents: parallel | sequential | unavailable
  hooks: enforced | partial | instructional
  model_selection: enforced | inherited | unavailable
  effort_selection: enforced | inherited | unavailable
  skills_preload: enforced | instructional | unavailable
  test_evidence: structured | process-output
  tool_permissions: structural | instructional
  plan_mode: native | emulated
```

#### Invocation Kernel

Centraliza la preparación y validación del dispatch:

```js
invokePhase({
  phase,
  change,
  profileRef,
  policy,
  target,
  artifactRefs
});
```

Responsabilidades:

- resolver variante;
- compilar contexto mínimo;
- aplicar capabilities y clamps;
- registrar decisión antes del dispatch;
- lanzar el agente;
- validar envelope;
- persistir resultado y telemetría;
- devolver la siguiente acción autorizada.

El kernel evita que la política adaptativa siga creciendo dentro del prompt del orquestador.

### 6.2 Orquestador fino

El orquestador conserva:

- conversación y comprensión inicial;
- ownership de preguntas al usuario;
- coordinación entre fases;
- aplicación de decisiones humanas;
- selección de la siguiente transición autorizada;
- síntesis de resultados.

El orquestador no debe:

- implementar parsers o reducers en prosa;
- decidir variantes por heurísticas libres;
- reinterpretar una policy determinista;
- reimplementar validadores;
- duplicar handlers circunstanciales;
- convertirse en una segunda fuente de verdad.

## 7. Agentes, skills y variantes

### 7.1 Un único concepto por fase

Para cada fase existe:

- una definición semántica canónica;
- una skill canónica;
- una familia de wrappers generados;
- adapters de target.

Ejemplo:

```text
skills/sdd-apply/SKILL.md
agents/sdd-apply.agent.md

generated:
  sdd-apply-lite
  sdd-apply-standard
  sdd-apply-strict
```

Las variantes solo cambian:

- profundidad;
- límites;
- materialización;
- modelo/effort solicitado;
- validators y gates;
- presupuesto de contexto.

No duplican la metodología.

### 7.2 Expansión del generador

El transform multi-target debe soportar salida one-to-many:

```js
handleFile(...) -> File | File[] | null
```

o una etapa explícita:

```text
canonical source
  → variant expansion
  → target transformation
  → validation
  → output
```

Toda variante debe conservar:

- nombre y propósito de fase;
- contrato de resultado;
- límites de herramientas;
- paridad semántica;
- fingerprint de fuente y policy.

### 7.3 `sdd-plan`

`sdd-plan` no es un segundo orquestador. Es una fase compuesta parametrizada por profundidad.

Contrato objetivo:

```yaml
planning_request:
  profile_ref: execution-profile.json
  required_outputs:
    proposal: compact
    behavior: full
    design: compact
    tasks: standard
```

Checkpoints internos:

1. Scope.
2. Behavioral contract.
3. Architecture.
4. Reconciliation.
5. Decomposition.

Una invocación puede cubrir varias responsabilidades, pero cada checkpoint conserva:

- contrato;
- validación;
- cobertura cruzada;
- reparación dirigida;
- evidencia de materialización.

## 8. Review adaptativo

### 8.1 Decisión final

La autoridad combina:

```text
evidencia determinista
+ generalist decision
+ riesgos del diseño
+ diff real
+ verify findings
+ clamps de policy
= review_decision final
```

Shape canónico:

```yaml
review_decision:
  schema_version: 1
  classification: normal
  depth:
    review: strict
  escalation_reason:
    code: normal-signal-overflow
    positive_dimensions: 3
    detail: "Normal review has 3 positive dimensions; strict full 4R required"
  selected_specialists: [risk, reliability, resilience, readability]
  dimensions:
    risk:
      selected: true
      reasons:
        - code: diff-auth-permission
          source: real-diff
    reliability:
      selected: true
      reasons:
        - code: generalist-escalation
          source: generalist
    resilience:
      selected: false
      reasons:
        - code: no-resilience-signal
          source: classifier
    readability:
      selected: false
      reasons:
        - code: no-readability-signal
          source: classifier
```

### 8.2 Política objetivo

- El generalista sigue siendo read-only y no reemplaza especialistas.
- `high-risk` conserva generalist-first mientras ese contrato siga aportando cobertura transversal.
- `high-risk` ejecuta full 4R.
- Cero a dos dimensiones positivas ejecutan review targeted.
- Tres o más dimensiones positivas escalan a full 4R; ninguna señal material se excluye por cap.
- Selección, exclusión, escalado y degradación registran razón y fuente.
- Los prompts no reinterpretan el ranking determinista.

### 8.3 Linaje acotado

Se mantiene el contrato entregado:

- identidad de candidato y paths de génesis congelados;
- cada lens se ejecuta una vez;
- findings reciben IDs estables;
- correcciones solo cubren IDs congelados;
- presupuesto de corrección inmutable;
- máximo de tres validaciones fallidas;
- observaciones tardías son follow-ups no bloqueantes;
- un nuevo discovery requiere un successor explícito;
- verify, delivery y archive son comprobaciones read-only del linaje.

## 9. Archive híbrido y transaccional

### 9.1 Límite semántico

Aplicar deltas Markdown y decidir la promoción de ADRs no es una operación puramente mecánica. El runtime no debe fingir determinismo mediante parsing heurístico de prosa.

La arquitectura separa:

#### Plano semántico

El agente `sdd-archive`:

- interpreta deltas;
- detecta conflictos semánticos;
- prepara contenido de specs resultantes;
- propone ADRs a promover;
- justifica warnings aceptados;
- produce un `archive-plan.json`;
- no borra el change activo.

#### Plano determinista

El runtime:

- valida verdict, gates, approvals y fingerprints;
- valida schema e integridad del plan;
- verifica que cada input referenciado coincide por hash;
- escribe resultados en staging;
- copia inventario completo;
- compara origen, staging y destino;
- realiza commit/rename atómico cuando el filesystem lo permite;
- borra el origen solo después de una verificación completa;
- conserva rollback y recovery;
- genera inventario, coste y receipt;
- deja el estado cerrado únicamente tras completar la transacción.

### 9.2 Contrato del plan

```json
{
  "schema_version": 1,
  "change": "example",
  "source_fingerprint": "sha256:...",
  "spec_writes": [
    {
      "domain": "routing",
      "source_delta": "specs/routing/spec.md",
      "target": "openspec/specs/routing/spec.md",
      "target_before_sha256": "sha256:...",
      "content_sha256": "sha256:..."
    }
  ],
  "adr_promotions": [],
  "archive_inventory": [],
  "accepted_warnings": [],
  "rollback": {
    "strategy": "staging-rename"
  }
}
```

El runtime valida bytes y referencias; no decide el significado del contenido.

## 10. Benchmark y promoción de adaptive

### 10.1 Estado

- **O2A, infraestructura:** entregada.
- **O2B, baseline fija de control:** pendiente.

La baseline de control debe usar policy fija y ejecutar los nueve perfiles canónicos:

1. docs de un archivo;
2. bugfix pequeño;
3. feature pequeña;
4. feature cross-module;
5. refactor behavior-preserving;
6. cambio de API pública;
7. cambio filesystem/config privilegiado;
8. cambio security-sensitive;
9. migración.

Los tres perfiles iniciales se conservan como smoke suite, no como evidencia suficiente para promover adaptive.

### 10.2 Gate de promoción

Adaptive puede convertirse en default solo cuando demuestre:

1. calidad no inferior frente a fixed en fixtures comparables;
2. ninguna pérdida de requisitos, evidencia o aprobación;
3. ninguna señal material descartada;
4. fallback a fixed/strict probado;
5. reducción demostrable de invocaciones, relecturas, latencia o coste;
6. audit trail suficiente para reproducir cada decisión;
7. paridad aceptable entre targets;
8. ausencia de deuda documental o de specs introducida.

## 11. Evidencia estructurada

Dirección objetivo:

```text
.ospec/evidence/<change>/tasks.jsonl
.ospec/evidence/<change>/tests.jsonl
.ospec/evidence/<change>/reviews.jsonl
.ospec/evidence/<change>/traceability.json
.ospec/evidence/<change>/decisions.jsonl
```

El runtime captura hechos mecánicos:

- dispatches;
- modelos y effort efectivos;
- exit codes;
- tests;
- hashes;
- findings;
- approvals;
- relaciones REQ/task/commit/test;
- transacciones de archive.

Markdown se convierte en una vista renderizada para humanos. El verdict y la evidencia canónica nunca dependen del nivel de presentación.

## 12. Multi-target

El canon común define semántica, garantías y contratos. Cada target implementa un adapter.

Reglas:

- revalidar documentación oficial antes de abrir un change específico de target;
- registrar capabilities efectivas, no aspiracionales;
- generar variantes desde la misma fuente;
- aplicar clamps explícitos;
- no emular silenciosamente una capacidad inexistente;
- ejecutar paridad estructural donde el host lo permita;
- mantener compatibilidad con la configuración local del usuario.

La existencia de cinco targets es parte del estado actual. Cualquier metadata que todavía indique cuatro es deuda documental/configurable y debe corregirse sin reinterpretar el producto.

## 13. Conocimiento y escala

### 13.1 Foundation + OpenWiki

- Foundation: intención del producto, alcance, principios y baseline prevista.
- OpenWiki: estado real y funcionamiento del repositorio.
- Ambas capas se referencian y se consumen aguas abajo.
- Staleness y refresh son explícitos.
- Archive puede sugerir actualización; nunca reescribe decisiones de producto automáticamente.

### 13.2 Epic y federación

Orden objetivo:

1. epic intra-repo con `sub_changes[]` y DAG;
2. change coordinador multi-repo;
3. contratos compartidos versionados;
4. apply provider → consumers;
5. verify federado y compatibilidad contractual.

Cada hijo recibe su propio perfil. No existe una ruta rígida `epic`.

## 14. Métricas de éxito

### Adaptación

- fases y reviewers ejecutados con razón registrada;
- escaladas y desescaladas por checkpoint;
- señales positivas descartadas: objetivo 0;
- decisiones materiales asumidas sin aprobación: objetivo 0;
- preguntas evitables frente a preguntas justificadas.

### Eficiencia

- tokens y duración por fase y change;
- invocaciones y relecturas;
- tiempo hasta primera implementación y verdict;
- relanzamientos completos frente a reparaciones dirigidas;
- coste de adapters y variantes.

### Calidad

- defectos antes y después de verify;
- requisitos con task, commit y test;
- warnings aceptados con aprobación;
- cobertura de validadores;
- operaciones transaccionales completadas o revertidas sin pérdida.

### Portabilidad

- garantías `enforced|partial|instructional|unavailable`;
- degradaciones activadas;
- paridad de fixtures;
- modelo/effort efectivo frente al solicitado;
- coste añadido por target.

## 15. Decisiones deliberadamente fuera de alcance

- Convertir el harness a TypeScript como requisito.
- Introducir frameworks de runtime.
- Mover el estado canónico fuera de OpenSpec/Git.
- Auto-aprobar gates.
- Crear un orquestador por preset o intención.
- Mantener skills duplicadas por variante.
- Convertir cada riesgo o topología en una ruta pública.
- Parsear Markdown libre como si fuera un contrato estructurado seguro.
- Importar catálogos masivos de skills sin resolución compacta y necesidad demostrada.
- Mantener análisis activos en carpetas gitignoreadas.
- Activar routing dinámico de modelos como default antes del A/B.

## 16. Problemas abiertos y decisiones pendientes

1. Confirmar mediante benchmark si el generalista aporta valor suficiente en `high-risk` para conservar generalist-first.
2. Definir el schema exacto de `execution-profile.json`.
3. Definir el contrato de `archive-plan.json` y su threat model.
4. Resolver cómo materializar variantes en cada target sin inflar el contexto always-on.
5. Definir el mínimo de evidencia estructurada necesario antes del shadow mode.
6. Establecer clamps por target para modelo, effort, permisos y paralelismo.
7. Determinar cuándo una reevaluación puede reducir profundidad de presentación sin cambiar garantías.
8. Definir compatibilidad y deprecación de aliases tras promover adaptive.
