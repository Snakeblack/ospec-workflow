# Roadmap general — evolución del harness

> **Autoridad:** única fuente operativa del backlog transversal.
> **Versión de referencia:** v2.30.0, 2026-07-18.
> **Arquitectura:** [`../architecture/harness-evolution.md`](../architecture/harness-evolution.md).
> **Estado verificado:** O4+O5 entregado y archivado; infraestructura O2A entregada; baseline fija O2B pendiente.
> **Regla:** una decisión arquitectónica nueva se incorpora primero al análisis. Este archivo solo deriva trabajo ejecutable.

## 1. Estado ejecutivo

| Estado | Iniciativa | Resultado esperado |
| --- | --- | --- |
| Completado | G0/G0.1 — gobernanza y reconciliación documental | Arquitectura y roadmap activos, sin estado O4+O5 obsoleto |
| Completado | O4+O5 — review selectivo y linaje acotado | Generalist-first, selección determinista y corrección dirigida |
| ▶ Siguiente | O4.1 — overflow de señales de review | Ninguna dimensión positiva descartada por el cap normal |
| Después | O6A — archive híbrido transaccional | Semántica en agente; transacción mecánica en runtime |
| Gate previo a adaptive | O2B — baseline fixed-policy | Nueve perfiles comparables y reproducibles |
| Ruta crítica adaptive | O13A–D + O19A | Perfil, policy resolver, kernel, variantes y validadores |
| Planificación | O7+O10 + O9+O11 | `sdd-plan` parametrizado y reevaluación continua |
| Promoción | O8 | Shadow mode y A/B antes de cambiar defaults |
| Posterior | O14–O19B + R1 | Routing dinámico, evidencia, capsules y CI |
| Largo plazo | R2 + R4 | Conocimiento vivo y federación write |

### Preflight inmediato

Antes o dentro de O4.1:

- corregir metadata que todavía describa cuatro targets cuando existen cinco;
- comprobar enlaces de `docs/architecture/` y `docs/roadmaps/`;
- ejecutar contract lint, paridad de targets y `npm test`;
- no mezclar esta limpieza con cambios no relacionados.

## 2. Protocolo de actualización

Al cerrar cada change:

1. Marcar estado y done criteria.
2. Registrar change, release y evidencia.
3. Mover `▶ SIGUIENTE` al primer ítem ejecutable de la ruta crítica.
4. Actualizar la arquitectura solo si cambió un principio, contrato o alcance.
5. Actualizar un roadmap de target solo si cambió ese adapter.
6. Actualizar OpenSpec baseline cuando cambie comportamiento.
7. Registrar divergencias detectadas; no corregir solo la narrativa.
8. No crear planes paralelos ni `plan-siguiente-sesion.md`.

Estados permitidos:

```text
pending · in-progress · blocked · done · superseded · rejected
```

## 3. Reglas de ejecución del programa

- Cada iniciativa se implementa como un change OpenSpec cohesivo.
- Un change no mezcla reorganización documental, refactor de runtime y optimización de target salvo dependencia inseparable.
- Los cambios de comportamiento usan el flujo SDD completo disponible.
- Los refactors editoriales pueden usar direct + reconcile cuando no cambian autoridad ni contrato.
- Cada change actualiza specs, ADRs, roadmap y capability matrix cuando corresponda.
- Toda policy nueva empieza en shadow o sin alterar defaults.
- Ninguna optimización de coste puede descartar una señal material.
- Los cambios de target revalidan la documentación y versión real del host.
- La baseline incompleta no bloquea fixes demostrables, pero sí bloquea promover adaptive como default.

## 4. Grafo de dependencias

```text
G0.1
  ↓
O4.1
  ↓
O6A
  ↓
O2B
  ↓
O13A ───────────────┐
  ↓                 │
O13B                │
  ↓                 │
O13C                │
  ↓                 │
O13D                │
  ↓                 │
O19A ───────────────┘
  ↓
O7+O10
  ↓
O9+O11
  ↓
O8
  ├── O12
  ├── O14
  ├── O15 → O16+O17 → O18
  └── O19B
        ↓
       R1
```

Lanes R2 y targets pueden avanzar en paralelo cuando no cambien el control plane ni invaliden la baseline.

## 5. Ola 0 — baseline histórica y gobernanza

### G0. Gobernanza documental unificada — **done**

Entregado:

- `docs/architecture/harness-evolution.md`;
- `docs/roadmaps/harness-evolution.md`;
- `docs/roadmaps/README.md`;
- roadmaps de target;
- archivos históricos fuera de la autoridad activa.

### G0.1. Reconciliación de arquitectura y roadmap — **done**

Este reemplazo:

- actualiza el corte a v2.30.0;
- mueve O4+O5 a capacidades entregadas;
- documenta el contrato generalist-first real;
- retira la afirmación incorrecta de que `high-risk` omite el generalista;
- sustituye `review_plan required|candidate|skip` por la `review_decision` implementada;
- redefine O6 como arquitectura híbrida;
- separa O2A de O2B;
- añade policy resolver, invocation kernel y variantes como iniciativas explícitas;
- fija el orden previo al shadow mode.

### O2A. Infraestructura de benchmark — **done**

Entregado:

- catálogo canónico de nueve perfiles;
- smoke set de tres perfiles;
- runner headless local;
- cache con identidad fuerte;
- publicación fail-closed;
- scoring estructural run-level;
- O1 suplementario.

No entregado por O2A:

- baseline fija comparable de los nueve perfiles;
- gate de promoción de adaptive;
- CI obligatorio.

### O3. Clarify condicional — **done**

`clarify` es un gate posterior a `sdd-spec`, gobernado por envelope validado. No es una fase declarada en las rutas.

### O4+O5. Review selectivo y linaje acotado — **done**

Contrato entregado:

- generalista read-only ejecutado primero;
- decisión estructurada validada;
- evidencia determinista + generalista;
- cero a dos especialistas para normal;
- full 4R para `high-risk`;
- paridad de targets;
- findings congelados;
- corrección dirigida;
- máximo de tres validaciones fallidas;
- successor explícito para nuevo discovery.

Limitación aceptada:

- el cap normal puede excluir una tercera dimensión positiva; O4.1 la corrige.

## 6. Ola 1 — corrección de review, archive y baseline

### O4.1. Overflow de señales de review — **pending** ▶ SIGUIENTE

**Change sugerido:** `review-signal-overflow-escalation`.

#### Objetivo

Evitar que una señal material sea descartada por el máximo de dos especialistas de un change normal.

#### Política

```text
0 señales positivas
  → 0 especialistas

1-2 señales positivas
  → targeted review

3-4 señales positivas
  → escalar depth.review=strict
  → full 4R
```

#### Alcance

- modificar el clasificador/reducer;
- persistir razón de escalado;
- conservar orden canónico y evidence fingerprint;
- ajustar fixtures y paridad de cinco targets;
- actualizar OpenSpec baseline;
- mantener generalist-first;
- no cambiar el linaje acotado.

#### Done criteria

- ningún reason positivo termina como `normal-cap-excluded`;
- 3+ dimensiones producen full 4R;
- 0-2 conservan targeted review;
- malformed evidence sigue fallando cerrado;
- tests focales, `npm test` y paridad pasan;
- roadmap, arquitectura y specs coinciden.

### O6A. Archive híbrido transaccional — **pending**

**Change sugerido:** `hybrid-archive-transaction-runtime`.

#### Objetivo

Separar interpretación semántica de operaciones mecánicas y garantizar cierre transaccional, verificable y recuperable.

#### Plano semántico

`sdd-archive`:

- interpreta deltas;
- prepara specs resultantes;
- detecta conflictos;
- propone ADRs;
- produce `archive-plan.json`;
- no borra el origen.

#### Plano determinista

Runtime:

- valida verdict, gates, approvals y fingerprints;
- valida el plan y hashes de inputs;
- escribe staging;
- copia e inventaría;
- compara bytes;
- realiza commit/rename;
- elimina origen solo tras match completo;
- genera receipt, coste y rollback;
- recupera transacciones interrumpidas.

#### Fuera de alcance

- parser semántico determinista de Markdown libre;
- migrar toda la evidencia a JSON;
- CI headless;
- cambiar formato de specs.

#### Done criteria

- fallo antes del commit deja origen intacto;
- fallo posterior al staging es reanudable;
- una referencia/hash incorrecto bloquea;
- ningún borrado ocurre antes del full match;
- rollback probado en fixtures;
- archive agent no declara move completo;
- paridad JS/Go donde corresponda;
- `npm test` y tests de filesystem pasan en Windows/Linux.

### O2B. Baseline fija fixed-policy — **pending**

**Change sugerido:** `fixed-policy-reference-baseline`.

**Dependencia:** O6A.

#### Objetivo

Congelar el control contra el que se comparará adaptive.

#### Perfiles obligatorios

1. docs-one-file;
2. small-bugfix;
3. small-feature;
4. cross-module-feature;
5. behavior-preserving-refactor;
6. public-api-change;
7. filesystem-sensitive-change;
8. security-sensitive-change;
9. migration-change.

#### Requisitos

- policy `fixed`;
- misma versión de harness y target;
- identidad de modelo/effort conocida;
- provenance completa;
- resultados comparables;
- baseline publicada solo con 9/9 válidos;
- smoke 3/3 conservado para ciclos rápidos;
- cero filas inventadas o sintetizadas.

#### Done criteria

- baseline 9/9 versionada;
- comando reproducible documentado;
- resultados incompatibles se rechazan;
- métricas de calidad, coste, duración, preguntas y defectos disponibles;
- baseline no se modifica silenciosamente al cambiar fixtures.

## 7. Ola 2 — control plane adaptativo

### O13A. Perfil adaptativo revisionado — **pending**

**Change sugerido:** `adaptive-change-profile`.

**Dependencia:** O2B.

#### Entregables

- schema `execution-profile.json`;
- `intent`, `topology`, `preset`, `risk`, `depth`, `sources`;
- revision y fingerprint;
- referencia compacta desde `state.yaml`;
- normalización de señales;
- historial de reevaluaciones;
- fixtures por riesgo y topología.

#### Restricciones

- no cambia todavía el flujo por defecto;
- no selecciona modelo efectivo;
- no elimina rutas ni aliases;
- no aumenta el prompt del orquestador con parsers.

#### Done criteria

- mismo input produce mismo fingerprint;
- sources justifican cada score;
- señales desconocidas fallan o degradan según schema;
- state conserva referencia, no payload completo;
- recuperación desde filesystem probada.

### O13B. Resolver de policy de ejecución — **pending**

**Change sugerido:** `adaptive-execution-policy-resolver`.

**Dependencia:** O13A.

#### Entregables

Función pura:

```js
resolveExecutionPolicy({
  phase,
  profile,
  projectPolicy,
  targetCapabilities,
  previousDecision
});
```

Produce:

- variante;
- garantías mínimas;
- gates;
- validators;
- materialización;
- intención de modelo/effort;
- reasons;
- clamps.

#### Restricciones

- modo default sigue siendo `fixed`;
- decisiones adaptive se calculan en shadow;
- el resolver no toca filesystem ni ejecuta agentes;
- el modelo no puede reinterpretar el resultado.

#### Done criteria

- matriz de decisiones cubierta;
- monotonicidad de garantías probada;
- clamps por target probados;
- razones canónicas y fingerprinted;
- fallback fixed/strict probado.

### O13C. Kernel de invocación y orquestador fino — **pending**

**Change sugerido:** `phase-invocation-kernel`.

**Dependencia:** O13B.

#### Objetivo

Extraer del prompt del orquestador la lógica repetible de dispatch.

#### Entregables

- `invokePhase()`;
- registro pre-dispatch;
- compilación de contexto mínimo;
- aplicación de capabilities;
- validación de envelope;
- persistencia de decisión/telemetría;
- reducer de next action;
- guard que mantiene el orquestador por debajo del límite.

#### Done criteria

- el orquestador coordina, no implementa policy;
- no hay lógica duplicada por target;
- dispatches son reproducibles desde state/profile;
- errores contractuales producen reparación dirigida;
- tamaño y sentinels del orquestador pasan.

### O13D. Variantes generadas de agentes — **pending**

**Change sugerido:** `generated-agent-variants`.

**Dependencias:** O13B + O13C.

#### Objetivo

Generar wrappers `lite|standard|strict` desde una fuente y una skill canónicas.

#### Entregables

- expansión one-to-many;
- manifest de variantes;
- fingerprint fuente+policy;
- mapping por target;
- validadores que detectan drift;
- compatibilidad con nombres actuales.

#### Reglas

- una skill por fase;
- no copiar metodología;
- wrappers solo expresan depth, límites, modelo/effort intent y capabilities;
- target sin capacidad degrada explícitamente;
- no inflar el contexto always-on.

#### Done criteria

- editar la fuente actualiza todas las variantes;
- drift manual falla validación;
- paridad semántica en cinco targets;
- ninguna variante duplica una skill completa;
- build e instaladores siguen siendo idempotentes.

### O19A. Validadores contractuales mínimos — **pending**

**Change sugerido:** `planning-contract-validators-core`.

**Dependencias:** O13A.

#### Incluye

- intención/proposal;
- requirements y escenarios;
- asignación de diseño;
- cobertura de tasks;
- planning envelope;
- referencias al perfil;
- repair codes.

#### Done criteria

- errores concretos;
- reparación dirigida;
- ninguna regeneración completa como fallback por defecto;
- schemas versionados;
- fixtures adversariales;
- integration con invocation kernel.

## 8. Ola 3 — planificación adaptativa y A/B

### O7+O10. `sdd-plan` parametrizado por profundidad — **pending**

**Change sugerido:** `adaptive-sdd-plan`.

**Dependencias:** O13A–D + O19A.

#### Requisitos

- una única fase compuesta;
- una única skill canónica;
- checkpoints Scope → Behavior → Architecture → Reconciliation → Tasks;
- `planning_request` derivado del perfil;
- una invocación puede producir varias responsabilidades;
- formatos actuales siguen soportados;
- materialización compacta solo por policy;
- validadores antes de persistir;
- reparación por checkpoint.

#### Done criteria

- lite no pierde responsabilidad semántica;
- strict no reduce mínimos;
- outputs actuales siguen consumibles;
- tests de cobertura cruzada;
- coste e invocaciones medibles;
- no aparece un segundo orquestador.

### O9+O11. Reevaluación y escalado continuo — **pending**

**Change sugerido:** `adaptive-depth-controller`.

**Dependencia:** O7+O10.

#### Checkpoints

- post-contract;
- post-design;
- post-apply;
- post-verify;
- pre-review;
- pre-archive.

#### Requisitos

- revisión monotónica;
- profile revision history;
- borradores reutilizables solo tras revalidación;
- escalado de review, verify, modelo intent y gates;
- desescalada limitada a presentación/coste no material.

#### Done criteria

- señales nuevas cambian revision/fingerprint;
- no se pierde evidencia previa;
- 3+ señales de review mantienen full 4R;
- cambios inesperados de diff escalan;
- recuperación post-compact reproduce la decisión.

### O8. Shadow mode y A/B — **pending**

**Change sugerido:** `adaptive-flow-shadow-mode`.

**Dependencias:** O9+O11 + O2B.

#### Policies

```text
--execution-policy=fixed
--execution-policy=adaptive-shadow
--execution-policy=adaptive
```

`adaptive-shadow` calcula decisiones sin ejecutarlas.

#### Comparación

- mismos nueve perfiles;
- misma versión;
- modelos y effort controlados;
- calidad y defectos;
- requisitos/evidencia;
- invocaciones;
- tokens;
- duración;
- preguntas;
- escaladas;
- divergencias de policy.

#### Done criteria para activar adaptive

- calidad no inferior;
- cero pérdida de requisitos/evidencia/aprobaciones;
- cero señales materiales descartadas;
- fallback fixed/strict probado;
- ahorro o latencia mejorada demostrable;
- audit trail reproducible;
- paridad aceptable por target.

### O12. Limpieza de aliases — **pending**

**Change sugerido:** `execution-alias-compatibility-cleanup`.

**Dependencia:** O8 aprobado.

- documentar presets por garantías;
- separar intención/topología/preset en config;
- conservar aliases con deprecation;
- retirar nombres transicionales solo con migración;
- no crear ruta pública `standard-optimized`.

## 9. Ola 4 — routing, evidencia y presentación

### O14. Routing de modelos por decisión — **pending**

**Change sugerido:** `decision-aware-model-routing`.

**Dependencias:** O8 aprobado + O13B.

#### Alcance

- activar `modelTierIntent` y `effortIntent`;
- resolver modelo efectivo por target;
- registrar solicitado, clamp, efectivo y razón;
- respetar configuración local;
- fallar/degradar cuando el modelo no está disponible;
- ejecutar golden evals antes de cambiar tiers.

#### Done criteria

- ningún cambio de modelo sin evidencia;
- fallback documentado;
- model/effort efectivos auditables;
- targets sin selección nativa se marcan `inherited|unavailable`;
- no usar hooks de tool para seleccionar modelo de fase.

### O15. Evidencia estructurada — **pending**

**Change sugerido:** `structured-change-evidence`.

Canon:

```text
.ospec/evidence/<change>/tasks.jsonl
.ospec/evidence/<change>/tests.jsonl
.ospec/evidence/<change>/reviews.jsonl
.ospec/evidence/<change>/decisions.jsonl
.ospec/evidence/<change>/traceability.json
```

#### Done criteria

- runtime captura hechos;
- IDs y schemas versionados;
- Markdown no es autoridad mecánica;
- append concurrente seguro;
- archive incluye receipts y hashes;
- migración compatible con changes antiguos.

### O16+O17. Vistas compactas e informes — **pending**

**Change sugerido:** `evidence-report-views`.

- `apply-progress.md` como índice;
- verify `summary|behavioral|full-audit`;
- review report renderizado;
- nivel derivado de `depth`;
- verdict invariable;
- enlaces a evidencia canónica.

### O18. Phase capsules compiladas — **pending**

**Change sugerido:** `compiled-phase-capsules`.

**Dependencias:** O13D + O15.

- contexto mínimo por dispatch;
- fingerprint;
- regeneración por cambios relevantes;
- límites por target;
- no inlining de artefactos completos;
- medición de tokens always-on/on-invoke.

### O19B. Validadores completos — **pending**

**Change sugerido:** `complete-contract-evidence-validators`.

Amplía O19A a:

- result envelopes;
- workload;
- verify evidence;
- review decisions y lineage;
- archive plan/receipt;
- trazabilidad completa;
- evidence renderers.

## 10. Ola 5 — headless y CI

### R1. Verificación estructural no interactiva — **pending**

**Change sugerido:** `headless-sdd-verification`.

**Dependencias:** O6A + O15 + O19B.

#### Entregables

- CLI con exit codes;
- validación de state, profile, specs, deltas, trailers y evidencia;
- verify headless;
- archive readiness sin auto-aprobación;
- plantillas GitHub Actions;
- reports machine-readable;
- capabilities por target.

#### Reglas

- gate interactivo pendiente → `halt`;
- nunca auto-approve;
- CI no reinterpreta semántica;
- secretos fuera de artefactos;
- outputs reproducibles.

## 11. Lane de targets

Los subroadmaps no deciden prioridad global. Pueden avanzar cuando no cambien el control plane ni invaliden la baseline.

| Target | Estado agregado | Próximo trabajo permitido | Dependencia transversal |
| --- | --- | --- | --- |
| Claude Code | Fase nativa pendiente | hooks exec/matchers, validación strict | Independiente; preload/capsules dependen O13D/O18 |
| VS Code | Fase nativa pendiente | hooks enable y validator | Independiente; variantes dependen O13D |
| Codex | Bloque inicial completo; fase 2 parcial | revalidar hooks/decision control | O15/R1 para evidencia y CI |
| GitHub Copilot | Target funcional; roadmap específico pendiente | investigar modelo/permisos/hooks vigentes | O13D/O14 para variantes y modelo |
| OpenCode | Target funcional; roadmap específico pendiente | migrar capabilities deprecadas y revalidar permisos | O13D/O14 |

Reglas:

- revalidación oficial al abrir cada change;
- adapter común primero;
- capabilities `enforced|partial|instructional|unavailable`;
- no duplicar backlog transversal;
- pruebas de paridad con el mismo input;
- metadata del repositorio debe reconocer los cinco targets.

## 12. Lane de conocimiento

### R2. Foundation + OpenWiki — **pending**

Puede avanzar después de O8 o en paralelo si no toca el control plane.

Orden:

1. reparto normativo;
2. consumo aguas abajo;
3. ingesta resiliente;
4. foundation por etapas y gates batcheados;
5. adopt para brownfield;
6. staleness y refresh;
7. Starlight opcional como vista.

No mezclar conocimiento de producto con evidencia de ejecución.

## 13. Lane de escala

### R4. Epic intra-repo y federación write — **pending**

**Dependencias:** O13A–C + O6A + O19B + R1 base.

Orden:

1. `sub_changes[]` y DAG intra-repo;
2. change coordinador multi-repo;
3. contratos compartidos versionados;
4. apply provider → consumers;
5. verify federado;
6. archive coordinado.

Cada hijo recibe perfil independiente. No se crea una ruta rígida `epic`.

## 14. Métricas y gates del programa

Cada ola publica:

- coste total e invocaciones;
- tokens y duración;
- defectos antes/después de verify;
- escaladas y reviewers con motivo;
- señales descartadas: objetivo 0;
- trazabilidad completa;
- reparaciones dirigidas frente a relanzamientos;
- paridad por target;
- degradaciones activadas;
- deuda documental o de specs: objetivo 0.

Para promover adaptive:

1. calidad no inferior;
2. cero pérdida de requisitos, evidencia o aprobación;
3. cero señales materiales descartadas;
4. fallback probado;
5. ahorro o latencia mejorada;
6. audit trail reproducible;
7. paridad aceptable;
8. baseline fija e identidades compatibles.

## 15. Gotchas operativos vigentes

- `analisis-fino/` no es autoridad activa.
- Mantener el guard de tamaño del orquestador y sentinels de no-reinlining.
- Clarify es gate, no fase declarada.
- Mantener paridad JavaScript/Go en contratos compartidos.
- Inventariar y comparar antes de cualquier borrado.
- No tratar Markdown libre como input determinista sin plan/schema.
- No relanzar reviewers tras congelar findings.
- No resetear linajes por retry o interrupción.
- No promover adaptive con baseline 3/3 smoke.
- No activar routing dinámico de modelos antes del A/B.
- Revalidar roadmaps de target antes de implementar.
- No atribuir IA en commits o PRs.
- Confirmar flakies aislados antes de reintentar; no ocultar fallos reales.
- Corregir cualquier metadata que todavía indique cuatro targets.

## 16. Completado consolidado

Baseline histórica cerrada:

- auditoría inicial de agentes, skills, infraestructura y 4R;
- fixes de seguridad, routing y portabilidad;
- A1–A5, B2, B3, B5, C1–C5;
- paridad Go/JavaScript fase 1;
- prompt evals y contract lint;
- sdd-document;
- fingerprints y endurecimiento de archive;
- telemetría O1;
- O2A benchmark infrastructure;
- O3 clarify condicional;
- target Codex bloque inicial;
- G0 gobernanza;
- G0.1 reconciliación;
- O4+O5 review selectivo y linaje acotado.

## 17. Historial resumido

- 2026-07-02/04: núcleos iniciales y telemetría.
- 2026-07-05/07: integridad contractual, documentación, archive/fingerprints y lints.
- 2026-07-07/10: evals, exploración epic y roadmaps por target.
- 2026-07-10: dirección de optimización adaptativa.
- 2026-07-14/15: O2A y O3.
- 2026-07-16: reconciliación conceptual de rutas, presets y perfil.
- 2026-07-17: G0.
- 2026-07-18: O4+O5 y release v2.30.0.
- 2026-07-18: G0.1 redefine la ruta crítica: O4.1 → O6A → O2B → O13A–D/O19A → `sdd-plan` → reevaluación → A/B.
