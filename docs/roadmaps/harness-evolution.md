# Roadmap general — evolución del harness

> **Autoridad:** única fuente operativa del backlog transversal.
> **Versión de referencia:** v2.29.1, 2026-07-17.
> **Arquitectura:** [`../architecture/harness-evolution.md`](../architecture/harness-evolution.md).
> **Estado local conocido:** O4+O5 en curso; no marcar como entregado hasta verify + archive.
> **Regla:** una decisión arquitectónica nueva se incorpora primero al análisis; este archivo solo deriva trabajo ejecutable.

## 1. Estado ejecutivo

| Estado | Iniciativa | Resultado esperado |
| --- | --- | --- |
| En curso local | O4+O5 — review adaptativo | `review_plan` selectivo, generalista y escalado a especialistas |
| ▶ Siguiente | O6 — archive determinista | Cierre transaccional sin depender del modelo para operaciones mecánicas |
| Ruta crítica | Perfil adaptativo + validadores + `sdd-plan` | Un flujo canónico con profundidad por dimensiones |
| Posterior | Evidencia + CI + adapters | Runtime estructurado, headless y optimizado por target |
| Largo plazo | Conocimiento + federación | Memoria viva y coordinación multi-repo |

## 2. Protocolo de actualización

Al cerrar cada change:

1. Marcar el ítem y sus done criteria.
2. Registrar change, release y evidencia en una línea.
3. Mover `▶ SIGUIENTE` al primer ítem ejecutable de la ruta crítica.
4. Actualizar el análisis solo si cambió arquitectura, principio o alcance.
5. Actualizar un roadmap de target solo cuando cambió ese adapter.
6. No crear planes paralelos ni `plan-siguiente-sesion.md`.

Estados permitidos:

```text
pending · in-progress · blocked · done · superseded · rejected
```

## 3. Dogfooding: cómo ejecutar este roadmap

- Cada iniciativa se implementa como un change OpenSpec con alcance cohesivo.
- No mezclar reorganización documental con cambios de runtime.
- Los cambios de comportamiento usan el flujo SDD completo disponible en ese momento.
- Refactors puramente editoriales pueden usar direct + reconcile, salvo que cambien autoridad o contrato.
- Cada change actualiza specs baseline, ADRs y este roadmap al archivar.
- Las métricas de O1/O2 se capturan, pero una baseline incompleta no bloquea mejoras cuya corrección pueda demostrarse con tests y evals.

## 4. Ruta crítica por olas

### Ola 0 — cerrar trabajo activo y gobernanza

#### O4+O5. Review adaptativo — **in-progress**

Objetivo:

- `review_dimensions` evoluciona a `review_plan` con `required|candidate|skip`;
- triggers duros + generalista + diff + verify producen el plan final;
- motivos y fuentes persisten en `state.yaml`;
- high-risk evita pagar un generalista redundante cuando 4R ya es obligatorio;
- cambios normales ejecutan cero o un generalista y solo los especialistas justificados.

Done criteria:

- fixtures de docs, estilos, instalador privilegiado y cambio high-risk;
- paridad entre targets y runtime donde aplique;
- review omitido o activado siempre con razón registrada;
- verify y archive completados.

#### G0. Gobernanza documental unificada — **done**

Estructura instalada manualmente: `docs/architecture/harness-evolution.md` (análisis), `docs/roadmaps/harness-evolution.md` (roadmap), `docs/roadmaps/README.md` (autoridad) y roadmaps de target en `docs/roadmaps/targets/`. Limpieza de `analisis-fino/` y `docs/roadmap.md` finalizada; enlaces verificados.

### Ola 1 — seguridad determinista y perfil adaptativo

#### O6. Archive como runtime determinista — **pending** ▶ SIGUIENTE

Change sugerido: `deterministic-archive-runtime`.

Responsabilidades:

- validar verdict y warnings aceptados;
- comprobar fingerprints;
- aplicar deltas y promover ADRs;
- generar coste e inventario;
- copiar, verificar y borrar de forma atómica;
- rollback comprobable.

Done criteria: el agente decide readiness; el runtime ejecuta la transacción completa.

#### O13A. Perfil de señales y riesgo — **pending**

Change sugerido: `adaptive-change-profile`.

Sustituye el enfoque de etiqueta única por:

- `intent`;
- `topology`;
- `preset`;
- `risk` con scores y sources;
- `depth` por dimensión.

Debe alimentar review, planning, verify, modelo y quality gates. No selecciona todavía una nueva ruta de producto.

#### O19A. Validadores contractuales mínimos — **pending**

Change sugerido: `planning-contract-validators-core`.

Incluye validadores deterministas para:

- proposal/intención;
- requirements y escenarios;
- asignación de diseño;
- trazabilidad de tasks;
- planning envelope.

Done criteria: errores concretos y reparación dirigida, no regeneración completa.

### Ola 2 — planificación adaptativa en paralelo seguro

#### O7+O10. `sdd-plan` parametrizado por profundidad — **pending**

Change sugerido: `adaptive-sdd-plan`.

Dependencias: O13A + O19A.

Requisitos:

- una invocación puede producir varias responsabilidades semánticas;
- checkpoints internos Scope → Behavior → Architecture → Reconciliation → Tasks;
- `planning_request` deriva del perfil;
- formatos actuales siguen soportados;
- materialización compacta permitida solo por policy explícita;
- envelope y validadores pasan antes de persistir.

#### O9+O11. Reevaluación y escalado continuo — **pending**

Change sugerido: `adaptive-depth-controller`.

Dependencias: O13A + O7/O10.

Recalcula el perfil después de contrato, diseño, apply y verify. Puede escalar a más profundidad o bloquear; conserva borradores y revalida antes de reutilizarlos.

#### O8. Shadow mode y A/B — **pending**

Change sugerido: `adaptive-flow-shadow-mode`.

No crear una ruta pública permanente `standard-optimized`. Introducir una policy experimental:

```text
--execution-policy=fixed
--execution-policy=adaptive
```

El modo adaptive se compara contra el flujo actual con changes de referencia. No sustituye defaults hasta demostrar calidad no inferior.

#### O12. Limpieza final de aliases — **pending, al final de la ola**

Reemplaza el antiguo “renombrado de rutas”. Solo después del A/B:

- documentar presets por garantías;
- conservar aliases de compatibilidad con deprecation explícita;
- separar intención/topología/preset en CLI y config;
- retirar nombres transicionales.

### Ola 3 — coste, evidencia y presentación

#### O14. Routing de modelos por decisión — **pending**

Change sugerido: `decision-aware-model-routing`.

Dependencias: O13A.

El tier se decide por dimensión, riesgo y operación; `state.yaml` registra modelo, effort y razón. Debe respetar clamps y capacidades del host.

#### O15. Evidencia estructurada — **pending**

Change sugerido: `structured-change-evidence`.

Canon:

```text
.ospec/evidence/<change>/tasks.jsonl
.ospec/evidence/<change>/tests.jsonl
.ospec/evidence/<change>/reviews.jsonl
.ospec/evidence/<change>/traceability.json
```

El runtime captura lo mecánico. Markdown se renderiza.

#### O16+O17. Vistas compactas y perfiles de informe — **pending**

Change sugerido: `evidence-report-views`.

- `apply-progress.md` pasa a índice breve;
- verify report: summary, behavioral o full-audit;
- el nivel deriva de `depth.verification`, no del nombre de una route;
- el verdict y los errores nunca cambian por presentación.

#### O18. Phase capsules compiladas — **pending**

Change sugerido: `compiled-phase-capsules`.

Dependencias: perfil adaptativo estable + adapters de capabilities.

Prompt mínimo por dispatch, fingerprinted y regenerado solo ante cambios relevantes.

#### O19B. Validadores completos — **pending**

Change sugerido: `complete-contract-evidence-validators`.

Amplía O19A a envelopes de resultado, workload, verify evidence, reviews y trazabilidad completa.

### Ola 4 — headless y CI

#### R1. Verify estructural no interactivo — **pending**

Change sugerido: `headless-sdd-verification`.

Dependencias: O6 + O15 + O19B.

- CLI con exit codes;
- validación de state, specs, deltas, trailers y evidencia;
- GitHub Action/plantillas;
- gates interactivos siempre `halt`, nunca auto-approve.

## 5. Lane de targets

Los subroadmaps no deciden prioridad global. Se ejecutan en paralelo solo cuando no interrumpen la ruta crítica y sus dependencias están disponibles.

| Target | Estado agregado | Próximo change | Dependencia transversal |
| --- | --- | --- | --- |
| Claude Code | Fase nativa pendiente | 6.1 hooks exec + matchers | Puede comenzar tras G0; O15/O18 para hooks/evidence/preload avanzados |
| VS Code | Fase nativa pendiente | 6.1 hooks enable; 6.2 validator puede ir en paralelo | G0; O4/O5 para paralelo selectivo |
| Codex | Bloque inicial completo; fase 2 parcial | 6.2 hooks decision control | Revalidar plataforma; O15/R1 para CI y evidencia |
| GitHub Copilot CLI | Sin roadmap vigente | Investigación + roadmap | Después de G0, sin bloquear core |
| OpenCode | Sin roadmap vigente | Investigación + roadmap | Después de G0, sin bloquear core |

Reglas:

- revalidar documentación oficial al abrir cada change;
- implementar primero capacidades transversales en el adapter común cuando sea posible;
- registrar `enforced|partial|instructional` por garantía;
- no duplicar en este archivo el checklist detallado del target.

## 6. Lane de conocimiento

Se ejecuta después de la Ola 2 o en paralelo sin tocar control plane.

### R2. Foundation + OpenWiki — **pending**

Orden:

1. reparto normativo foundation vs wiki;
2. consumo aguas abajo de brief, scope, baseline y glossary;
3. ingesta resiliente;
4. foundation por etapas y gates batcheados;
5. modo adopt para brownfield;
6. lifecycle, staleness y refresh;
7. Starlight como vista sincronizada opcional.

No mezclar este bloque con O15–O17: conocimiento del producto y evidencia de ejecución son capas diferentes.

## 7. Lane de escala

### R4. Epic intra-repo y federación write — **pending**

Dependencias: perfil adaptativo + archive determinista + validadores + CI base.

Orden:

1. `epic: true` + `sub_changes[]` y DAG intra-repo;
2. change coordinador multi-repo;
3. contratos compartidos;
4. apply provider → consumers;
5. verify federado.

Cada hijo recibe su propio `change_profile`; no una ruta sugerida rígida.

## 8. Completado consolidado

Se considera cerrado y se mantiene solo como baseline histórica:

- auditoría inicial de agentes, skills, infraestructura y 4R;
- fixes de seguridad, rutas y portabilidad del roadmap inicial;
- A1–A5, B2, B3, B5, C1–C5;
- paridad Go/JavaScript fase 1, evals y contract lint;
- sdd-document wiring e integridad de archive/fingerprints;
- telemetría O1;
- suite experimental O2, sin atribuir ahorros incompatibles;
- clarify condicional O3;
- target Codex bloque inicial;
- G0 gobernanza documental: estructura `docs/architecture/` + `docs/roadmaps/` instalada.

Los documentos que describían estos trabajos viven en `analisis-fino/archive/` y no generan backlog nuevo.

## 9. Métricas y gates de programa

Cada ola debe publicar:

- coste total e invocaciones;
- defectos antes/después de verify;
- escaladas y reviewers seleccionados con motivo;
- porcentaje de trazabilidad completa;
- reparaciones dirigidas frente a relanzamientos;
- paridad por target;
- deuda documental o de specs introducida: objetivo 0.

Para promover adaptive como default:

1. calidad no inferior al flujo fijo en fixtures comparables;
2. ninguna pérdida de requisitos, evidencia o aprobación;
3. reducción demostrable de invocaciones/relecturas o latencia;
4. fallback a strict probado;
5. audit trail suficiente para explicar cada decisión del control plane.

## 10. Gotchas operativos vigentes

- `analisis-fino/` estaba gitignoreado: no dejar fuentes activas allí.
- Guard del orquestador `< 500` líneas y sentinels de no-reinlining.
- Clarify es gate, no fase.
- Mantener paridad JavaScript/Go en contratos compartidos.
- Verificar inventario antes de cualquier borrado en archive/migraciones.
- Reintentar flakies conocidos solo después de confirmar que pasan aislados; no ocultar fallos reales.
- Los roadmaps de targets contienen snapshots fechados: revalidar antes de implementar.
- Sin atribución de IA en commits, según hooks del proyecto.

## 11. Historial resumido

- 2026-07-02/04: núcleos A–F y telemetría inicial entregados.
- 2026-07-05/07: integridad contractual, documentador, archive/fingerprints y contract lint entregados.
- 2026-07-07/10: evals, exploración epic y roadmaps por target.
- 2026-07-10: optimización del flujo adoptada como dirección.
- 2026-07-14/15: O2 cerrado experimentalmente y O3 entregado.
- 2026-07-16: reconciliación arquitectónica: rutas pasan a presets, perfil adaptativo precede a `sdd-plan`, documentos activos salen de `analisis-fino/`.
- 2026-07-17: G0 completado manualmente; estructura `docs/architecture/` y `docs/roadmaps/` instalada. ▶ SIGUIENTE pasa a O6.
