# Arquitectura y evolución del harness — ospec-workflow

> **Autoridad:** fuente de verdad conceptual y estratégica del harness.
> **Corte documental:** v2.29.1, 2026-07-16.
> **Estado local conocido:** O4+O5 en implementación; no se consideran entregados hasta su verificación y archivo.
> **Alcance de esta reconciliación:** unifica los análisis históricos de `analisis-fino/`. El estado del código no ha sido auditado de nuevo en este documento; las capacidades entregadas se basan en el historial y los criterios registrados por el propio proyecto.
> **Ejecución:** el orden, estado y criterios de terminado viven exclusivamente en [`../roadmaps/harness-evolution.md`](../roadmaps/harness-evolution.md).

## 1. Propósito del producto

`ospec-workflow` es un harness Spec-Driven Development, multi-target y LLM-first para desarrollar cambios trazables con un modelo que actúa como un senior que acompaña:

- explicita intención, restricciones y decisiones materiales;
- recomienda con racional, consecuencias y reversibilidad;
- no sustituye decisiones de producto o arquitectura que requieren aprobación humana;
- conserva trazabilidad desde requisitos hasta implementación y evidencia;
- adapta la profundidad del proceso al riesgo real del cambio;
- utiliza código determinista para validación, estado, seguridad y operaciones mecánicas;
- explota las capacidades nativas de cada host sin romper el canon común.

La promesa no es «generar más documentación». Es **aplicar el grado correcto de especificación, diseño, verificación y revisión para cada cambio, dejando evidencia auditable**.

## 2. Autoridad documental

La documentación activa se divide por responsabilidad:

| Documento | Responde a | No debe contener |
| --- | --- | --- |
| Este análisis | Qué se construye, por qué, principios, arquitectura objetivo y problemas abiertos | Checkboxes operativos, puntero de siguiente tarea, crónica de sesiones |
| `docs/roadmaps/harness-evolution.md` | Qué se implementa ahora, dependencias, orden y done criteria | Nuevas decisiones arquitectónicas sin reflejarlas aquí |
| `docs/roadmaps/targets/*.md` | Cómo aprovechar un host concreto | Prioridad transversal independiente del roadmap general |
| `analisis-fino/archive/**` | Evidencia histórica y origen de decisiones | Estado vigente o trabajo nuevo |

Una fuente de verdad activa debe estar versionada. Por eso los documentos normativos salen de `analisis-fino/`, que estaba gitignoreado, y pasan a `docs/`.

## 3. Principios invariantes

1. **Aprobación humana para decisiones materiales.** Ningún modo, incluido CI, auto-aprueba un gate. La degradación no interactiva es `halt` con reporte.
2. **OpenSpec y Git son el estado canónico.** No se introduce una base de datos o servicio como autoridad paralela.
3. **Separación semántica, no burocracia física.** Proposal, comportamiento, diseño y tareas conservan responsabilidades distintas; no exigen necesariamente cuatro invocaciones ni cuatro archivos extensos.
4. **El modelo produce semántica; el runtime comprueba estructura.** Validaciones predecibles, transacciones de filesystem, fingerprints y evidencia mecánica pertenecen a código determinista.
5. **Fail-closed selectivo.** Seguridad, integridad contractual y operaciones destructivas fallan cerradas. Telemetría y ayudas puramente advisory pueden degradar de forma explícita.
6. **Adaptación continua.** La clasificación inicial es una hipótesis, no una sentencia. El perfil se recalcula al aparecer spec, diseño, diff y evidencia de verify.
7. **Degradación por target declarada.** Una garantía solo se anuncia cuando el host puede ejecutarla o existe una mitigación verificable.
8. **Runtime ligero y portable.** Se conserva la dirección CommonJS/Go, sin frameworks ni una cadena de build obligatoria para instalar el target.
9. **Una iniciativa, una autoridad.** Los roadmaps de target no duplican el backlog transversal; lo especializan.

## 4. Estado consolidado

### 4.1 Capacidades consideradas entregadas

Según el historial documental, el harness ya dispone de:

- orquestador coordinador y agentes de fase con contrato de resultado y `question_gate`;
- routing declarativo, persistencia por change y recuperación desde filesystem;
- assumption ledger, aprobación, intent restatement, mentor mode y ADRs integrados;
- ownership, detección de colisiones, presets de escala y trazabilidad REQ → task → commit → test;
- resúmenes de fase, compact rules, envelope JSON validable y telemetría de costes;
- multi-target con perfiles y routing de modelos por tiers;
- strict TDD con degradación en entornos sin runner;
- 4R existente, todavía pendiente de selectividad completa mientras O4+O5 no cierre;
- brownfield/reconcile, baseline por dominios y federación de lectura;
- contratos Go/JavaScript, prompt evals y lints transversales;
- correcciones históricas de seguridad, portabilidad, cache de skills, coherencia tools-vs-skill y movimientos de archive;
- target Codex fase inicial entregado; roadmaps específicos para Claude, VS Code y Codex.

Esta lista es una calibración de planificación, no una certificación independiente del repositorio actual.

### 4.2 Trabajo activo

- **O4 — revisión selectiva por dimensiones.** Determinar qué revisiones son obligatorias, candidatas o innecesarias a partir de señales deterministas, diseño, diff y verify.
- **O5 — revisor generalista.** Evaluar el cambio una vez y escalar a especialistas solo cuando exista señal, sin reemplazar triggers duros de seguridad o integridad.

O4+O5 son el primer caso real del modelo adaptativo: la revisión deja de ser una secuencia fija y pasa a ajustar profundidad durante el cambio.

### 4.3 Deuda estructural todavía abierta

1. Las rutas siguen mezclando intención, topología y nivel de rigor.
2. `sdd-plan` está concebido como una ruta optimizada, no como ejecutor parametrizado por profundidad.
3. El perfil de riesgo aparece demasiado tarde en el orden antiguo y no gobierna todavía planning, modelo, verify y review de forma unificada.
4. Archive conserva una operación mecánica compleja delegada parcialmente al modelo.
5. La evidencia sigue demasiado ligada a Markdown escrito por agentes.
6. Las garantías varían entre targets y no todas están implementadas o verificadas en runtime.
7. Foundation y OpenWiki tienen consumo y ciclo de vida incompletos.
8. La escritura coordinada multi-repo sigue pendiente.

## 5. Arquitectura objetivo

### 5.1 Flujo canónico

```text
Petición
  ↓
Comprender intención y contexto
  ↓
Construir perfil adaptativo
  ↓
Planificar con profundidad necesaria
  ↓
Aplicar
  ↓
Verificar
  ↓
Recalcular riesgo y revisión
  ↓
Revisar selectivamente
  ↓
Archivar mediante runtime determinista
```

No existen cuatro programas conceptualmente distintos. Existe un flujo canónico con diferentes mínimos de garantía y distintas profundidades.

### 5.2 Separar intención, topología y rigor

La clasificación deja de ser una etiqueta única:

```yaml
change_profile:
  intent: bugfix             # feature | bugfix | refactor | docs | migration | maintenance
  topology: single-repo      # foundation | brownfield | epic | federated
  preset: standard           # micro | lite | standard | strict

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
    verification: behavioral
    review: targeted
    memory: change
```

- **Intent** describe qué clase de trabajo se realiza.
- **Topología** describe dónde y con qué coordinación se realiza.
- **Preset** define mínimos de garantía y presupuesto inicial.
- **Risk** registra señales justificadas.
- **Depth** decide cuánto trabajo cognitivo y documental necesita cada dimensión.

### 5.3 Presets como suelos de garantía

| Preset | Significado | Regla principal |
| --- | --- | --- |
| `micro` | Operación mecánica, reversible y sin comportamiento nuevo | Cualquier señal material escala |
| `lite` | Cambio pequeño con contratos compactos | Ninguna dimensión se omite; algunas se materializan de forma ultraligera |
| `standard` | Perfil adaptativo habitual | Profundidad gobernada por señales y evidencia |
| `strict` | Máximo control | Define mínimos no reducibles de comportamiento, diseño, verify y review |

Los presets no son rutas inmutables. `bugfix`, `refactor`, `foundation` o `federated` tampoco compiten con ellos: pertenecen a otros ejes.

### 5.4 Puntos de reevaluación

El control plane recalcula el perfil en puntos explícitos:

1. **Entrada:** intención, alcance, proyecto, baseline y señales de riesgo.
2. **Después del contrato:** ambigüedad residual, contrato público, datos y reversibilidad.
3. **Después del diseño:** dependencias, privilegios, migraciones, blast radius y rollback.
4. **Después de apply:** diff real, archivos inesperados, desviaciones y nuevos riesgos.
5. **Después de verify:** fallos, gaps de tests, warnings y evidencia insuficiente.

Cada recalculo puede:

- aumentar profundidad;
- activar un gate;
- seleccionar especialistas;
- elevar el tier del modelo;
- solicitar una decisión humana;
- reducir prosa o reviewers no justificados;
- detener el flujo cuando el preset inicial dejó de ser seguro.

La desescalada solo reduce coste y presentación; nunca elimina evidencia o garantías ya exigidas por una señal material.

### 5.5 `sdd-plan` adaptativo

`sdd-plan` sigue siendo una inversión válida, pero no debe significar «genera siempre cuatro documentos en una llamada». Su contrato objetivo es:

```yaml
planning_request:
  profile_ref: state.yaml#change_profile
  required_outputs:
    proposal: compact
    behavior: full
    design: compact
    tasks: standard
```

Responsabilidades internas:

1. Scope.
2. Behavioral contract.
3. Architecture.
4. Reconciliation.
5. Decomposition.

La unidad de ejecución puede ser una sola invocación, pero mantiene checkpoints internos, cobertura cruzada y validadores deterministas.

### 5.6 Política de materialización de artefactos

- Las responsabilidades semánticas siempre existen.
- `standard` y `strict` materializan normalmente proposal/spec/design/tasks por separado.
- `micro` y `lite` pueden usar secciones estructuradas o artefactos compactos cuando no se pierde trazabilidad.
- La evidencia mecánica vive en JSON/JSONL y el Markdown es una vista renderizada.
- Ningún archivo se genera solo para satisfacer una ruta si no añade contrato, trazabilidad o comprensión humana.

### 5.7 Plano semántico y plano determinista

| Plano semántico — modelo | Plano determinista — runtime |
| --- | --- |
| Interpretar intención | Normalizar y persistir perfil |
| Redactar contratos y diseño | Validar schemas, IDs, cobertura y referencias |
| Explicar opciones y trade-offs | Aplicar policy y triggers duros |
| Proponer tareas | Comprobar trazabilidad y estados |
| Evaluar calidad no reducible a reglas | Ejecutar tests, capturar exit codes y fingerprints |
| Recomendar especialistas | Resolver reviewers obligatorios y permisos |
| Decidir readiness con evidencia | Archivar de forma atómica, verificable y reversible |

## 6. Revisión adaptativa

O4+O5 deben converger en un `review_plan`, no solo en booleanos:

```yaml
review_plan:
  risk:
    mode: required       # required | candidate | skip
    sources: [privileged_io, external_process]
    reason: "Writes global configuration and executes an external command."
  reliability:
    mode: candidate
    sources: [generalist]
    reason: "Touches fallback and recovery logic."
  resilience:
    mode: skip
    sources: [diff]
    reason: "No runtime or failure-path changes."
```

La autoridad final combina:

```text
triggers deterministas
+ evaluación generalista
+ riesgos del diseño
+ diff real
+ resultado de verify
= plan final de revisión
```

Reglas:

- auth, permisos, pagos, secretos, migraciones destructivas y operaciones privilegiadas pueden imponer reviewers;
- high-risk puede ir directamente a 4R sin pagar además un generalista redundante;
- el generalista tiene alta sensibilidad, pero no sustituye una revisión especializada;
- toda activación o exclusión registra motivo y fuente en `state.yaml`.

## 7. Runtime, evidencia y CI

La evolución del núcleo debe tender a:

1. Archive transaccional y determinista.
2. Validadores de proposal, spec, diseño, tasks, envelopes y evidencia.
3. Captura estructurada de tareas, tests, reviews y trazabilidad.
4. Markdown renderizado desde evidencia canónica.
5. Phase capsules compiladas y fingerprinted.
6. Subconjunto headless con exit codes y gates que degradan a `halt`.

Esto reduce tokens, evita éxitos parciales y convierte el harness en una base utilizable por CI y por todos los targets.

## 8. Multi-target

El canon común define comportamiento y garantías; cada target implementa un adapter de capacidades.

```yaml
target_capabilities:
  structured_questions: native | chat-fallback
  subagents: parallel | sequential | unavailable
  hooks: enforced | partial | instructional
  test_evidence: structured | process-output
  tool_permissions: structural | instructional
  plan_mode: native | emulated
```

El roadmap transversal solo contiene contratos compartidos. Las optimizaciones de Claude, VS Code y Codex viven en sus subroadmaps y se ejecutan cuando sus dependencias del núcleo están maduras.

Antes de implementar un change de target se debe revalidar la documentación del host; esos roadmaps son snapshots fechados, no estándares permanentes.

## 9. Capa de conocimiento

Foundation y OpenWiki deben formar un solo modelo sin duplicación:

- Foundation: qué queremos, por qué, alcance, principios y baseline previsto.
- OpenWiki: qué existe y cómo funciona el repositorio actual.
- Ambas capas se referencian, se consumen desde las fases y tienen staleness + refresh.
- Archive puede actualizar estado de roadmap/capabilities y sugerir refresh; nunca reescribir decisiones de producto automáticamente.

## 10. Escala y federación

La progresión correcta es:

1. Epic intra-repo con `sub_changes[]`, DAG y coordinación de colisiones.
2. Change coordinador multi-repo.
3. Contratos compartidos versionados.
4. Apply provider → consumers.
5. Verify federado y compatibilidad contractual.

No se crea una ruta `epic`; la topología se expresa como metadata y el perfil de cada hijo se calcula de forma independiente.

## 11. Métricas de éxito

### Adaptación

- porcentaje de fases/reviewers ejecutados con motivo registrado;
- escaladas y desescaladas por punto de reevaluación;
- decisiones materiales asumidas sin aprobación: objetivo 0;
- preguntas evitables frente a preguntas justificadas, sin cuota fija por route.

### Eficiencia

- tokens de entrada/salida por dimensión, fase y change;
- invocaciones y relecturas evitadas;
- tiempo hasta primera implementación y hasta verdict;
- relanzamientos completos frente a reparaciones dirigidas.

### Calidad y trazabilidad

- REQs con task, commit y test vinculados;
- defectos encontrados antes y después de verify;
- warnings aceptados con aprobación explícita;
- operaciones deterministas completadas o revertidas sin pérdida de inventario.

### Portabilidad

- garantías reales por target;
- degradaciones activadas;
- paridad de fixtures y validadores;
- coste añadido por adapters específicos.

## 12. Decisiones deliberadamente fuera de alcance

- No convertir el harness a TypeScript ni introducir frameworks como requisito del runtime.
- No mover el estado canónico fuera de OpenSpec/Git.
- No auto-aprobar gates.
- No importar catálogos masivos de skills sin resolución compacta y necesidad demostrada.
- No convertir cada intención, riesgo o topología en una ruta nueva.
- No mantener análisis activos dentro de una carpeta gitignoreada.

## 13. Relación con los análisis históricos

Los documentos anteriores quedan archivados como evidencia:

- auditoría de agentes, skills, infraestructura y 4R;
- análisis de coherencia de rutas y propuesta de validación;
- análisis por ejes de evolución;
- análisis de optimización del flujo SDD.

Sus hallazgos entregados no desaparecen: se resumen en el estado consolidado. Sus propuestas pendientes se han reconciliado en esta arquitectura y en el roadmap operativo.
