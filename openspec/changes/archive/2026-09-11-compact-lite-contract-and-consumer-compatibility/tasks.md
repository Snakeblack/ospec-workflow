# Tasks: Compact Lite Contract and Consumer Compatibility

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-routing-015 | MUST | `openspec-convention.md`, `flow-validator.js`, `validate-phase.js` | covered-by-design | Conserva cinco fases, elegibilidad y ausencia legítima de spec/design. |
| REQ-skills-017 | MUST | `skills/sdd-{propose,tasks,apply,verify,archive}/SKILL.md` | covered-by-design | Productores y consumidores resuelven dependencias por `actual_route`; apply fusiona progreso. |
| REQ-agents-028 | MUST | `agents/sdd-orchestrator.agent.md`, agentes de fase, hooks | covered-by-design | Recovery y resúmenes derivan de artifacts persistidos sin promoción silenciosa. |
| REQ-generator-017 | MUST | `real-repo.test.js`, reglas/targets generados, `compact-lite-contract.test.js` | covered-by-design | Paridad para claude, vscode, github-copilot, opencode, codex y cursor. |
| REQ-archive-plan-contract-004 | MUST | `archive-plan.js`, `archive-transaction.js` | covered-by-design | Inventario lite exacto, hashes y preflight fail-closed sin schema nuevo. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 700–1,000 (15+ source/skill/agent files and 10+ test/target fixtures) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: route/dependency contracts and validators; PR 2: skills/agents/recovery; PR 3: archive and six-target parity tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Definir matriz de artifacts por ruta y validar predecesores | PR 1 | `openspec-convention.md`, `flow-validator.js`, `validate-phase.js`; RED/GREEN de lite y standard. |
| 2 | Compactar productores y consumidores de fase | PR 2 | Skills y agentes de propose/tasks/apply/verify; tests de AC-N, progreso mergeado e independencia de verify. |
| 3 | Hacer recovery y resúmenes route-aware | PR 2 | Orchestrator, `pre-compact`, `subagent-stop`, `apply-resume`; preservar estado, approvals, assumptions y gates. |
| 4 | Cerrar inventario e integridad de archive lite | PR 3 | `archive-plan.js`, `archive-transaction.js` y tests de hashes, referencias inventadas y no-mutación. |
| 5 | Garantizar paridad de targets y contrato source | PR 3 | `real-repo.test.js`, `compact-lite-contract.test.js`, regeneración de seis targets y regresión standard. |

## Phase 1: Route Contracts and Validators

- [x] 1.1 RED: añadir fixtures para matriz lite/standard y ausencia de proposal/spec/design; GREEN: extender `openspec-convention.md`, `scripts/lib/flow-validator.js` y `scripts/configure/validate-phase.js` para exigir solo predecesores de `state.yaml.route.actual_route` [REQ-routing-015, REQ-skills-017]
- [x] 1.2 Verificar que `route-dispatcher` conserva floors de API pública, elegibilidad, cinco fases lite y ninguna ruta/fase nueva mediante regresiones existentes y fixture de routing [REQ-routing-015]

## Phase 2: Compact Producers and Consumers

- [x] 2.1 RED/GREEN: actualizar `skills/sdd-propose/SKILL.md` y `skills/sdd-tasks/SKILL.md` para `proposal-lite.md`, etiquetas estables `AC-N`, tareas accionables y evidencia enlazada, sin reconciliación full [REQ-skills-017]
- [x] 2.2 RED/GREEN: actualizar `skills/sdd-apply/SKILL.md` y `scripts/lib/apply-resume.test.js` para leer contrato lite y fusionar `apply-progress.md` previo sin repetir tareas completadas [REQ-skills-017]
- [x] 2.3 RED/GREEN: actualizar `skills/sdd-verify/SKILL.md` para verificar AC-N, tareas, implementación y evidencia directamente; mantener proposal/spec/design obligatorios en standard [REQ-skills-017]

## Phase 3: Recovery and Targeted Agent Contracts

- [x] 3.1 Alinear `agents/sdd-{propose,tasks,apply,verify,archive}.agent.md` con lecturas route-aware, límites de resumen y referencias de artifact; añadir pruebas de `pre-compact` y `subagent-stop` [REQ-agents-028]
- [x] 3.2 Actualizar `agents/sdd-orchestrator.agent.md`, `rules/sdd-common.instructions.md` y `rules/sdd-openspec.instructions.md` para recuperar la siguiente fase declarada, bloquear artifacts faltantes y no promover rutas [REQ-agents-028]
- [x] 3.3 RED/GREEN: cubrir continuación en dos sesiones/batches y preservar route, refs, approvals, assumptions, gates y progreso en `scripts/lib/apply-resume.test.js`, `scripts/hooks/pre-compact.test.js` y `scripts/hooks/subagent-stop.test.js` [REQ-agents-028]

## Phase 4: Archive Integrity

- [x] 4.1 RED/GREEN: hacer que `scripts/lib/archive-plan.js` construya inventario mínimo lite (incluido `verify-report`) con `spec_writes: []` permitido y rechace ausentes/inexistentes [REQ-archive-plan-contract-004]
- [x] 4.2 RED/GREEN: hacer que `scripts/lib/archive-transaction.js` detenga toda mutación ante fingerprint/hash/inventario inválido; añadir casos de diseño inventado y verify omitido en sus tests [REQ-archive-plan-contract-004]

## Phase 5: Generator Parity and Verification

- [x] 5.1 Crear `scripts/compact-lite-contract.test.js` con fixtures de productor compacto, verify independiente, ausencia sin filler y regresión standard [REQ-generator-017]
- [x] 5.2 Extender `scripts/configure/real-repo.test.js` para generar claude, vscode, github-copilot, opencode, codex y cursor; afirmar mismo orden, dependencias y obligaciones, fallando ante spec/design incondicional [REQ-generator-017]
- [x] 5.3 Regenerar/inspeccionar `dist/` y ejecutar `node --test scripts/**/*.test.js` y `npm test`; documentar evidencia y cualquier warning aceptado en el progreso [REQ-generator-017, REQ-agents-028]

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally
