# Tasks: Phase Envelope and State Mechanical Projection (CX1)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-kernel-contract-schemas-031 / Valid result-envelope v1 fixture | MUST | `schemas/kernel/result-envelope/v1/envelope.schema.json`, `fixtures/valid/valid-v1.json` | covered-by-design | Pinned schema version 1 con validación estricta |
| REQ-kernel-contract-schemas-031 / Invalid fixture missing required field | MUST | `schemas/kernel/result-envelope/v1/fixtures/invalid/invalid-v1.json` | covered-by-design | Falla validación deterministamente por propiedad requerida ausente |
| REQ-kernel-contract-schemas-031 / Valid blocked fixture with question_gate | MUST | `schemas/kernel/result-envelope/v1/fixtures/valid/blocked-v1.json` | covered-by-design | Valida estructura de question_gate y blocker_type |
| REQ-kernel-contract-schemas-031 / Valid sdd-spec success with ambiguity signals | MUST | `schemas/kernel/result-envelope/v1/fixtures/valid/ambiguity-spec-v1.json` | covered-by-design | Valida señales de ambigüedad en orden canónico |
| REQ-kernel-contract-schemas-001 / Result-envelope family registered | MUST | `schemas/kernel/manifest.json`, `schemas/kernel/contract-claims.json` | covered-by-design | Registro formal de familia con $id y version explícita |
| REQ-skills-018 / Valid v1 envelope emitted on phase completion | MUST | `scripts/lib/result-envelope.js` `validateEnvelope` | covered-by-design | Exige schema_version: 1 y campos obligatorios |
| REQ-skills-018 / Blocked status includes question_gate and blocker_type | MUST | `scripts/lib/result-envelope.js` `validateEnvelope` | covered-by-design | Valida estructura de bloqueo y enum blocker_type |
| REQ-skills-018 / Successful sdd-spec includes ambiguity signals | MUST | `scripts/lib/result-envelope.js` `validateEnvelope` ({ phase: "sdd-spec" }) | covered-by-design | Señales de ambigüedad requeridas solo para sdd-spec success |
| REQ-skills-019 / Deterministic rendering of successful phase completion | MUST | `scripts/lib/result-envelope.js` `renderEnvelopeToMarkdown` | covered-by-design | Renderizador desacoplado de envelope a markdown legible |
| REQ-skills-019 / Deterministic rendering of blocked envelope | MUST | `scripts/lib/result-envelope.js` `renderEnvelopeToMarkdown` | covered-by-design | Renderiza preguntas y trade-offs recomendados |
| REQ-skills-019 / Renderer preserves payload integrity | MUST | `scripts/lib/result-envelope.js` `renderEnvelopeToMarkdown` | covered-by-design | Operación pura de solo lectura sin mutar el envelope |
| REQ-skills-001 / Compact Phase Summaries in state.yaml | MUST | `skills/_shared/sdd-phase-common.md` §C & §D, `PhaseCompletionReducer` | covered-by-design | Prohíbe mutación directa por agentes; reduce automáticamente |
| REQ-agents-029 / Model self-attesting approval is rejected | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | covered-by-design | Ignora aserciones de aprobación de modelo sin registro en state.yaml |
| REQ-agents-029 / State advancement strictly follows PhaseCompletionReducer | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | covered-by-design | Elimina inferencia LLM en transiciones de fase |
| REQ-agents-029 / Uncommitted gate verdict halts progression | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | covered-by-design | Detiene la ruta si veredicto de gate no está comprometido |
| 6.1a / Orchestrator Consumes Structured Envelope Fields | MUST | `scripts/lib/result-envelope.js` `adaptLegacyEnvelope`, reducer | covered-by-design | Extracción de campos y normalización legacy antes de reducer |
| REQ-hooks-023 / SubagentStop projects valid envelope via reducer | MUST | `scripts/hooks/subagent-stop.js` `persistResultEnvelope` | covered-by-design | Delega a projectPhaseCompletion bajo bloqueo de archivo |
| REQ-hooks-023 / Replay of SubagentStop projection is idempotent | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | covered-by-design | Hash de payload detecta replay con convergencia delta cero |
| REQ-hooks-023 / Reducer execution failure remains fail-safe | MUST | `scripts/hooks/subagent-stop.js` `persistResultEnvelope` | covered-by-design | Captura fail-safe preservando continue: true |
| REQ-hooks-015 / Invalid successful sdd-spec envelope becomes blocked | MUST | `scripts/hooks/subagent-stop.js` `resolveDispatchStatus` | covered-by-design | Validación fail-closed para sdd-spec |
| REQ-hooks-015 / Prefixed sdd-spec dispatch enforces fail-closed | MUST | `scripts/hooks/subagent-stop.js` `resolveDispatchStatus` | covered-by-design | Resuelve agente canónico antes de validar |
| REQ-hooks-015 / Valid envelope from prefixed dispatch projects state | MUST | `scripts/hooks/subagent-stop.js` `persistResultEnvelope` | covered-by-design | Deriva phase key desde agente canónico |
| REQ-hooks-015 / Unresolvable or foreign agent skips persistence fail-safely | MUST | `scripts/hooks/subagent-stop.js` `persistResultEnvelope` | covered-by-design | Agente no resuelto omite persistencia de forma segura |
| REQ-hooks-015 / Zero device id matches transcript identity | MUST | `scripts/hooks/subagent-stop.js` `sameFileIdentity` | covered-by-design | Tolera dev === 0 en snapshots de transcripción |
| REQ-lifecycle-kernel-028 / Reducer computes valid phase advance | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | covered-by-design | Proyecta phases.{phase}.status, summary y artifacts |
| REQ-lifecycle-kernel-028 / Reducer projects blocked status with questions | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | covered-by-design | Proyecta status: blocked y blocking_questions |
| REQ-lifecycle-kernel-028 / Reducer rejects synthetic gate passes | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | covered-by-design | Rechaza aprobaciones no confirmadas fail-closed |
| REQ-lifecycle-kernel-029 / CAS conflict rejection | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`, `ospec-state.js` | covered-by-design | Conflicto CAS si expectedRevision != head |
| REQ-lifecycle-kernel-029 / Replay produces zero-delta idempotent convergence | MUST | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | covered-by-design | Devuelve outcome: noop-replay sin mutar estado |
| REQ-lifecycle-kernel-029 / Recovery from interrupted write restores valid state | MUST | `scripts/lib/ospec-state.js` `projectPhaseCompletion` | covered-by-design | Restaura estado desde .bak vía recoverOrphanBak |
| REQ-lifecycle-kernel-030 / Adapter normalizes unversioned fence | MUST | `scripts/lib/result-envelope.js` `adaptLegacyEnvelope` | covered-by-design | Mapea campos legacy y asigna schema_version: 1 |
| REQ-lifecycle-kernel-030 / Adapter normalizes legacy prose envelope | MUST | `scripts/lib/result-envelope.js` `adaptLegacyEnvelope` | covered-by-design | Extracción regex de formato adyacente a prosa |
| REQ-lifecycle-kernel-030 / Malformed legacy payload rejected fail-safely | MUST | `scripts/lib/result-envelope.js` `adaptLegacyEnvelope` | covered-by-design | Retorna error estructurado sin lanzar excepciones |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,400–1,800 lines (additions + deletions) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 5 chained PRs (Work Units 1 → 2 → 3 → 4 → 5) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Kernel Contract Schema, Registration & Fixtures | PR 1 | Base: `feat/phase-envelope-state-mechanical-projection`; `envelope.schema.json`, `manifest.json`, `contract-claims.json`, fixtures |
| 2 | Result Envelope v1 Validator, Legacy Adapter & Decoupled Renderer | PR 2 | Base: PR 1; actualiza `scripts/lib/result-envelope.js` y tests en `result-envelope.test.js` |
| 3 | Pure PhaseCompletionReducer | PR 3 | Base: PR 2; implementa `phase-completion-reducer.js`, re-export en `reducer.js` y suite unitaria |
| 4 | State Projection & SubagentStop Hook Integration | PR 4 | Base: PR 3; implementa `projectPhaseCompletion` en `ospec-state.js` e integra en `subagent-stop.js` |
| 5 | Skill & Protocol Alignment & Full Verification | PR 5 | Base: PR 4; actualiza `sdd-phase-common.md` (§C, §D) y ejecuta regresión global |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Kernel Contract Schema, Registration & Fixtures (Foundation)

- [x] 1.1 RED: Crear tests de schema fixtures en `scripts/lib/result-envelope-schema-fixtures.test.js` validando `result-envelope/v1` contra fixtures válidos e inválidos [REQ-kernel-contract-schemas-031, REQ-kernel-contract-schemas-001]
- [x] 1.2 GREEN: Crear `schemas/kernel/result-envelope/v1/envelope.schema.json` (y compatibilidad con `schemas/kernel/result-envelope.schema.json`) con `$id: "https://openspec.io/schemas/kernel/result-envelope/v1.schema.json"` [REQ-kernel-contract-schemas-031]
- [x] 1.3 GREEN: Crear fixtures de test canónicos: `valid-v1.json`, `blocked-v1.json`, `ambiguity-spec-v1.json`, `legacy-unversioned.json` e `invalid-v1.json` en `schemas/kernel/result-envelope/v1/fixtures/` [REQ-kernel-contract-schemas-031]
- [x] 1.4 GREEN: Registrar la familia `result-envelope` en `schemas/kernel/manifest.json` (`path`, `$id`, `schema_version: 1`) y en `schemas/kernel/contract-claims.json` [REQ-kernel-contract-schemas-001]
- [x] 1.5 VERIFY: Ejecutar tests de fixtures de esquemas kernel para confirmar resolución de la familia y validación positiva y negativa [REQ-kernel-contract-schemas-031, REQ-kernel-contract-schemas-001]

## Phase 2: Result Envelope v1 Validator, Legacy Adapter & Decoupled Renderer

- [x] 2.1 RED: Añadir tests unitarios en `scripts/lib/result-envelope.test.js` para validación estricta de `schema_version: 1`, normalización en `adaptLegacyEnvelope` (fences unversioned y formato de prosa) y pureza en `renderEnvelopeToMarkdown` [REQ-skills-018, REQ-skills-019, REQ-lifecycle-kernel-030]
- [x] 2.2 GREEN: Actualizar `validateEnvelope` en `scripts/lib/result-envelope.js` para validar `schema_version: 1`, tipos de señales de ambigüedad y campos opcionales [REQ-skills-018]
- [x] 2.3 GREEN: Implementar `adaptLegacyEnvelope(rawInput)` en `scripts/lib/result-envelope.js` normalizando fences sin versionar y líneas de texto adyacentes a `result-envelope/v1` de forma fail-safe [REQ-lifecycle-kernel-030]
- [x] 2.4 GREEN: Implementar `renderEnvelopeToMarkdown(envelope, options)` en `scripts/lib/result-envelope.js` formateando envelopes a markdown sin mutar el payload de origen [REQ-skills-019]
- [x] 2.5 VERIFY: Ejecutar suite `scripts/lib/result-envelope.test.js` garantizando paso de validación v1, compatibilidad legacy y determinismo del renderizado [REQ-skills-018, REQ-skills-019, REQ-lifecycle-kernel-030]

## Phase 3: Pure PhaseCompletionReducer

- [x] 3.1 RED: Crear tests unitarios en `scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` cubriendo reducción de avance de fase, proyección de bloqueos, detección de replay por hash, verificación CAS y descarte de aprobaciones sintéticas [REQ-lifecycle-kernel-028, REQ-lifecycle-kernel-029, REQ-agents-029]
- [x] 3.2 GREEN: Implementar función pura `reducePhaseCompletion(currentState, payload, options)` en `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` con mapeo de summary, artifacts y status [REQ-lifecycle-kernel-028]
- [x] 3.3 GREEN: Implementar lógica de replay idempotente (`outcome: "noop-replay"`) y verificación CAS (`outcome: "cas-conflict"`, `code: "cas_conflict"`) en `PhaseCompletionReducer` [REQ-lifecycle-kernel-029]
- [x] 3.4 GREEN: Implementar descarte estricto fail-closed de afirmaciones de aprobaciones o saltos de gates no autorizados en el reducer [REQ-agents-029, REQ-lifecycle-kernel-028]
- [x] 3.5 GREEN: Cablear y re-exportar `reducePhaseCompletion` en `scripts/lib/lifecycle-kernel/reducer.js` [REQ-lifecycle-kernel-028]
- [x] 3.6 VERIFY: Ejecutar `node --test scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` verificando pureza funcional, CAS y convergencia determinista [REQ-lifecycle-kernel-028, REQ-lifecycle-kernel-029, REQ-agents-029]

## Phase 4: State Projection & SubagentStop Hook Integration

- [x] 4.1 RED: Añadir tests en `scripts/lib/ospec-state.test.js` para `projectPhaseCompletion` con locking (`withFileLock`), recuperación `.bak` y commit atómico [REQ-lifecycle-kernel-029]
- [x] 4.2 RED: Añadir tests de integración en `scripts/hooks/subagent-stop.test.js` verificando que `SubagentStop` delega a `PhaseCompletionReducer`, maneja agentes prefijados, valida `sdd-spec` fail-closed y permanece fail-safe ante fallos [REQ-hooks-023, REQ-hooks-015]
- [x] 4.3 GREEN: Implementar `projectPhaseCompletion({ changePath, phase, envelope, expectedRevision })` en `scripts/lib/ospec-state.js` usando `withFileLock`, `recoverOrphanBak`, `reducePhaseCompletion` y `writeFileAtomic` manteniendo `setPhaseSummary` como fallback retrocompatible [REQ-lifecycle-kernel-029]
- [x] 4.4 GREEN: Actualizar `persistResultEnvelope` en `scripts/hooks/subagent-stop.js` para delegar la persistencia de estado a `projectPhaseCompletion` y asegurar manejo fail-safe [REQ-hooks-023, REQ-hooks-015]
- [x] 4.5 VERIFY: Ejecutar suites `scripts/lib/ospec-state.test.js` y `scripts/hooks/subagent-stop.test.js` validando locking, CAS y proyección mecánica sin mutaciones manuales [REQ-hooks-023, REQ-hooks-015, REQ-lifecycle-kernel-029]

## Phase 5: Skill & Protocol Alignment & Full Verification

- [x] 5.1 Actualizar documentación de protocolo en `skills/_shared/sdd-phase-common.md` (§C y §D) prohibiendo escrituras directas de agentes en `state.yaml`, formalizando la emisión de `result-envelope/v1` y detallando la proyección mecánica [REQ-skills-018, REQ-skills-019]
- [x] 5.2 Ejecutar suite completa de tests de regresión (`npm test`) verificando cero roturas en hooks, lifecycle kernel, contratos de esquemas y herramientas existentes [REQ-kernel-contract-schemas-001, REQ-lifecycle-kernel-028, REQ-hooks-023]
- [x] 5.3 Registrar evidencia de trazabilidad y actualizar `apply-progress.md` con matriz de requisitos y estado de ciclo TDD [REQ-skills-018, REQ-hooks-023]
