# Tasks: Suite de changes de referencia / benchmark (O2)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-orchestrator-evals-001 / siete golden versionados | MUST | `scripts/evals/lib/fixtures.js`, `scripts/evals/run.js` | covered-by-design | Corpus golden separado del benchmark. |
| REQ-orchestrator-evals-001 / vague intent restatement | MUST | golden fixture + assertions | covered-by-design | Sin artefacto de change. |
| REQ-orchestrator-evals-001 / high-risk clarify route | MUST | golden fixture + route assertions | covered-by-design | Ruta y gate persistidos. |
| REQ-orchestrator-evals-001 / verify spec-gap | MUST | golden fixture + failure routing | covered-by-design | Retorno a `sdd-spec`. |
| REQ-orchestrator-evals-001 / apply design-mismatch | MUST | golden fixture + blocker routing | covered-by-design | Retorno a `sdd-design`. |
| REQ-orchestrator-evals-001 / document batched gate | MUST | fixtures `sdd-document` | covered-by-design | Un gate con dos preguntas. |
| REQ-orchestrator-evals-001 / document no-op | MUST | fixture no-drift | covered-by-design | Sin escrituras. |
| REQ-orchestrator-evals-001 / document sandbox escape | MUST | fixture J5 | covered-by-design | Gate abort/accepted-risk. |
| REQ-orchestrator-evals-001 / nueve perfiles derivados | MUST | `scripts/evals/safe-export.js` | covered-by-design | Sin fixtures benchmark paralelas. |
| REQ-orchestrator-evals-003 / infraestructura local verificable | MUST | `run.js`, `live-driver.js`, `lib/benchmark.js` | covered-by-design | Verify/archive no dependen de live ni baseline. |
| REQ-orchestrator-evals-003 / core 3/3 publicable | MUST | `runLiveSuite()`, publicación atómica | covered-by-design | Seguimiento operativo no bloqueante. |
| REQ-orchestrator-evals-003 / core incompleto fail-closed | MUST | renderer y cache guards | covered-by-design | Nunca publica filas parciales. |
| REQ-orchestrator-evals-003 / diagnósticos Sol y Luna | MUST | audit trail del change | covered-by-design | Excluidos del baseline comparable. |
| REQ-orchestrator-evals-003 / extended opcional | MUST | selección `extended` | covered-by-design | Nueve seleccionables; no gate. |
| REQ-orchestrator-evals-003 / resume compatible | MUST | descriptor fuerte + replay | covered-by-design | Modelo, effort, runtime y payload exactos. |
| REQ-orchestrator-evals-003 / replay público rechazado | MUST | capability single-use | covered-by-design | Sin scoring de workspace preconstruido. |
| REQ-orchestrator-evals-003 / O1 ausente | MUST | scoring run-level | covered-by-design | `unavailable`, sin síntesis ni bloqueo. |
| REQ-orchestrator-evals-003 / threat model cooperativo | MUST | hashes, attestations y docs | covered-by-design | Correlación/tamper, no autenticidad. |

### Reconciliation Verdict

- MUST coverage: complete.
- SHOULD/MAY gaps: none; el piloto live es seguimiento operativo explícitamente no bloqueante.
- Ambiguities to track: none.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 0-40 restantes, limitadas a reportes de calidad |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Un único cierre de verify + 4R |
| Delivery strategy | exception-ok |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Cierre de calidad contra el entregable local | Single PR | Sin implementación restante ni dependencia live. |

### Checklist Status Legend

- `[ ]` pendiente
- `[~]` implementado sin verificación local completa
- `[x]` implementado y verificado localmente

## Phase 1: Catálogo y runner

- [x] 1.1 Conservar exactamente siete golden scenarios versionados y sus rutas/assertions en `scripts/evals/lib/fixtures.js`, `scripts/evals/run.js` y tests asociados. [REQ-orchestrator-evals-001]
- [x] 1.2 Definir en `scripts/evals/safe-export.js` exactamente nueve perfiles derivados con materialización sintética aislada, rutas, artefactos y outcomes canónicos. [REQ-orchestrator-evals-001]
- [x] 1.3 Mantener las selecciones core `all`/`initial` y los nueve perfiles opcionales bajo `extended`, sin fixtures benchmark paralelas. [REQ-orchestrator-evals-001, REQ-orchestrator-evals-003]

## Phase 2: Scoring y guards host-owned

- [x] 2.1 Capturar en `scripts/evals/live-driver.js` y `lib/benchmark.js` tokens terminales, duración host, preguntas y defectos como filas run-level sin atribución de fase inventada. [REQ-orchestrator-evals-003]
- [x] 2.2 Exigir capability host-owned single-use ligada a workspace, sesión, transcript/hash y CLI; rechazar replay público y workspaces preconstruidos. [REQ-orchestrator-evals-003]
- [x] 2.3 Mantener O1 como evidencia suplementaria emission-bound; degradar a `unavailable` sin síntesis, pesos ni bloqueo del scoring primario. [REQ-orchestrator-evals-003]
- [x] 2.4 Validar Git, artefactos/orden, reports estructurados, allowlist runtime exacta y publicación atómica 3/3 fail-closed. [REQ-orchestrator-evals-003]

## Phase 3: Identidad, cache y recovery

- [x] 3.1 Resolver contexto causal inmutable de modelo, reasoning effort e instalación derivada; pasar exactamente modelo/effort al mismo `codex exec` observado. [REQ-orchestrator-evals-003]
- [x] 3.2 Recalcular cache desde transcript/observación y exigir descriptor fuerte exacto; cualquier identidad desconocida, mismatch o tamper produce miss. [REQ-orchestrator-evals-003]
- [x] 3.3 Implementar recovery offline confinado a workspaces temporales, sin modelo/red ni JSON manual, repitiendo las validaciones post-exit antes de persistir. [REQ-orchestrator-evals-003]
- [x] 3.4 Endurecer el parser verify con bloque único y sufijo Verdict anclado, preservando validaciones independientes de state, fases, Git y reportes. [REQ-orchestrator-evals-003]

## Phase 4: Strict TDD, documentación y diagnóstico

- [x] 4.1 Completar RED/GREEN/TRIANGULATE para catálogo, scoring, capability, modelo+effort, runtime, cache, recovery, parsers, allowlist y publicación; ejecutar focal 59/59 y `npm test` en verde. [REQ-orchestrator-evals-001, REQ-orchestrator-evals-003]
- [x] 4.2 Documentar en `scripts/evals/README.md` el contrato operativo, límites del threat model, core/extended y ausencia de baseline como estado válido. [REQ-orchestrator-evals-003]
- [x] 4.3 Preservar como diagnósticos la observación Sol aceptada mediante recovery y el canary Luna-low rechazado por cero dispatch/waits, sin promoverlos a baseline ni 3/3. [REQ-orchestrator-evals-003]

## Phase 5: Cierre de calidad activo

- [x] 5.1 Ejecutar `sdd-verify` final contra proposal/spec/design/tasks, código y evidencia Strict TDD; evaluar la infraestructura local independientemente de live o `reference-baseline.md`. [REQ-orchestrator-evals-001, REQ-orchestrator-evals-003]
- [ ] 5.2 Ejecutar 4R final sobre el delta efectivo; resolver cualquier BLOCKER/CRITICAL y registrar warnings aceptados o follow-ups antes de archive. [REQ-orchestrator-evals-003]

## Seguimiento operativo post-archive

Estas acciones no son tareas activas, no condicionan `sdd-verify`/archive y no forman parte del workload restante:

- Ejecutar, con host y presupuesto compatibles, el core `docs-one-file`, `small-bugfix` y `security-sensitive-change` bajo una única identidad comparable; publicar `reference-baseline.md` solo con 3/3 aceptados.
- Mantener cualquier conjunto incompleto fail-closed, sin inventar filas; conservar Sol y Luna-low únicamente como diagnósticos históricos.
- Ejecutar `extended` cuando se necesite diagnóstico adicional; sus seis perfiles extra permanecen opcionales y no bloqueantes.
