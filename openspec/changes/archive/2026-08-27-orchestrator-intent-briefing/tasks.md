# Tasks: Briefing funcional de intención del orquestador

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| Briefing vago antes de clasificación | MUST | `agents/sdd-orchestrator.agent.md` D2; golden `vague-request-no-artifact`; contract test | covered-by-design | — |
| Briefing específico también obligatorio | MUST | D2 CORE; golden `specific-request-no-artifact`; contract anti-skip | covered-by-design | Elimina skip-if-specific |
| Corrección con cap 2 + confirm-last/abort | MUST | Máquina D2 + shapes de pregunta; contract test | covered-by-design | — |
| Sin artefactos durante espera | MUST | Orden del flujo D2; goldens `artifacts_absent` | covered-by-design | — |
| Accept persiste antes de classify | MUST | Bootstrap `state.yaml` + `approval-ledger.md`; contract test | covered-by-design | ADR-002, ADR-003 |
| Continue / fase posterior sin re-brief | MUST | Matriz D2; golden `continue-no-rebrief` | covered-by-design | — |
| Cosmetic ambient skip | MUST | Matriz D2; contract test | covered-by-design | — |
| Abort sin directorio ni classify | MUST | Flujo D2; contract test | covered-by-design | — |
| REQ-agents-019 hilo principal / explore RO | MUST | Ownership D2; contract landmarks | covered-by-design | — |
| REQ-agents-020 ledger intent-briefing | MUST | `approval-ledger.md` + bootstrap; contract enum/shape | covered-by-design | No sustituye route confirmation |
| REQ-orchestrator-evals-006 contract fail-closed | MUST | `recommendation-ambiguity-contract.test.js` | covered-by-design | RED antes de CORE |
| REQ-orchestrator-evals-001 corpus 9 | MUST | Fixtures + `run.js`/`run.test.js`/`README.md` | covered-by-design | 7→9 goldens |
| REQ-orchestrator-evals-003 runner N/9 | MUST | `run.js`, `run.test.js` discovery/assertions | covered-by-design | — |
| Purpose baseline (briefing no solo vago) | MUST | Merge en `sdd-archive` | covered-by-design | **No** escribir en apply |
| Regresión design-mismatch / 6 conservadas | MUST | Sin cambio funcional; suite existente | covered-by-design | — |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520–680 (CORE ~70, ledger ~35, contract ~100, configure source+goldens ~180–280, eval fixtures ~120, runner/docs ~40, real-repo ~30) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1: contrato RED→CORE+ledger GREEN · PR2: configure source+goldens+real-repo · PR3: evals 7→9+runner/docs |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Contrato RED + CORE D2 + ledger `intent-briefing` + contrato GREEN | PR 1 | Base `main`; `node --test scripts/recommendation-ambiguity-contract.test.js` verde al cierre |
| 2 | Fixture configure source + regenerar goldens + landmarks real-repo | PR 2 | Depende PR1; no editar goldens a mano |
| 3 | Fixtures eval 7→9 + `run.js`/`run.test.js`/`README.md` + regresión | PR 3 | Depende PR1; `npm test` focal evals/configure |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Contrato RED (TDD)

- [x] 1.1 Añadir helper que extrae la subsección `Intent Restatement` de `agents/sdd-orchestrator.agent.md` en `scripts/recommendation-ambiguity-contract.test.js` [REQ-orchestrator-evals-006]
- [x] 1.2 Añadir test que **falla** si D2 conserva skip cuando la solicitud no es vaga (p. ej. «NOT vague», «skip this step», «proceed directly to Change Classification») [REQ-orchestrator-evals-006]
- [x] 1.3 Añadir tests RED para matriz de elegibilidad: `/sdd-new|ff|lite` MUST; `/sdd-continue`, fase posterior con ledger, cosmetic ambient MUST skip [REQ-orchestrator-evals-006]
- [x] 1.4 Añadir tests RED para cap 2 correcciones, confirm-last (`allowFreeformInput: false`) y abort sin `classifyChange` [REQ-orchestrator-evals-006]
- [x] 1.5 Añadir tests RED para persist-before-classify, prohibición de ids `sdd-*` en briefing, ownership hilo principal y explore solo lectura [REQ-agents-019, REQ-agents-020, REQ-orchestrator-evals-006]
- [x] 1.6 Añadir tests RED para enum `intent-briefing` y campos obligatorios `synthesis`/`scope` en `skills/_shared/approval-ledger.md` [REQ-agents-020]
- [x] 1.7 Ejecutar `node --test scripts/recommendation-ambiguity-contract.test.js` y confirmar RED en tests nuevos (tests legacy siguen verdes) [REQ-orchestrator-evals-006]

## Phase 2: CORE + Approval Ledger (GREEN contrato)

- [x] 2.1 Reescribir `#### Intent Restatement (pre-classification)` en `agents/sdd-orchestrator.agent.md`: elegibilidad sin predicado de vaguedad, briefing 2–4 líneas funcionales sin ids `sdd-*`, explore read-only, ownership del hilo [REQ-agents-019]
- [x] 2.2 Documentar máquina de interacción en D2: rondas 0–1 (Confirmar/Corregir/Abortar, `allowFreeformInput: true`); tras cap 2 solo Confirmar última síntesis/Abortar (`allowFreeformInput: false`) [REQ-orchestrator-evals-006]
- [x] 2.3 Documentar bootstrap post-accept: primera escritura mínima de `state.yaml` con approval `intent-briefing` (`synthesis`, `scope`, `applies_to: [change-classification]`) **antes** de `classifyChange`; abort = cero artefactos [REQ-agents-020]
- [x] 2.4 Explicitar separación: `intent-briefing` no sustituye confirmación de route `confidence: advisory` [REQ-agents-020]
- [x] 2.5 Ampliar enum `gate` en `skills/_shared/approval-ledger.md` con `intent-briefing`; documentar `synthesis`/`scope` obligatorios solo para ese gate [REQ-agents-020]
- [x] 2.6 Ejecutar `node --test scripts/recommendation-ambiguity-contract.test.js` y confirmar GREEN en todos los tests D2/ledger [REQ-orchestrator-evals-006]

## Phase 3: Configure — source fixture y goldens

- [x] 3.1 Añadir subsección D2 representativa (landmarks del CORE productivo) a `scripts/configure/__fixtures__/source/agents/sdd-orchestrator.agent.md` [REQ-orchestrator-evals-006]
- [x] 3.2 Regenerar snapshots en `scripts/configure/__fixtures__/golden/{claude,cursor,github-copilot}/**/*orchestrator*` desde la fixture source (no editar a mano) [REQ-orchestrator-evals-006]
- [x] 3.3 Ampliar `scripts/configure/real-repo.test.js` para comprobar landmarks D2 (sin skip-if-specific, cap 2, persist-before-classify) en cada target generado desde el repo real [REQ-orchestrator-evals-006]
- [x] 3.4 Ejecutar tests `scripts/configure/*.test.js` relevantes y confirmar verdes [REQ-orchestrator-evals-006]

## Phase 4: Evals — corpus golden 7→9

- [x] 4.1 Actualizar `scripts/evals/__fixtures__/vague-request-no-artifact/scenario.json` (y repo seed si aplica): solicitud elegible nueva, gate presente, `artifacts_absent` mientras espera [REQ-orchestrator-evals-001]
- [x] 4.2 Crear `scripts/evals/__fixtures__/specific-request-no-artifact/` con repo seed + `scenario.json`: solicitud concreta emite gate sin artefactos [REQ-orchestrator-evals-001]
- [x] 4.3 Crear `scripts/evals/__fixtures__/continue-no-rebrief/` con `state.yaml` seed que incluya approval `intent-briefing` aceptada; continue/fase posterior no repite briefing [REQ-orchestrator-evals-001]
- [x] 4.4 Actualizar `scripts/evals/run.js` para registrar exactamente 9 escenarios golden (discovery/listado) [REQ-orchestrator-evals-003]
- [x] 4.5 Cambiar `scripts/evals/run.test.js`: discovery `listScenarioNames().length === 9`, agregado N/9, mensajes 7→9 [REQ-orchestrator-evals-003]
- [x] 4.6 Actualizar `scripts/evals/README.md` documentando corpus 9 (3 core briefing + 6 conservadas) [REQ-orchestrator-evals-001, REQ-orchestrator-evals-003]
- [x] 4.7 Ejecutar `node --test scripts/evals/run.test.js` y confirmar verdes; verificar que catálogo benchmark `safe-export.js` sigue en 9 perfiles [REQ-orchestrator-evals-001]

## Phase 5: Verificación de regresión

- [x] 5.1 Ejecutar `npm test` (o suite focal: contract + configure + evals) y confirmar verdes sin regresión en las 6 fixtures conservadas ni en design-mismatch [REQ-orchestrator-evals-001]
- [x] 5.2 Verificar estáticamente que ningún apply task escribe en `openspec/specs/` (promoción solo vía archive) [REQ-orchestrator-evals-006]

## Phase 6: Preparación archive (no apply)

- [ ] 6.1 Nota para `sdd-archive`: al promover deltas, actualizar Purpose en `openspec/specs/ambiguity-detection-boundaries/spec.md` — briefing para toda solicitud elegible, no solo vaga; preservar boundary `design-mismatch` [REQ-orchestrator-evals-001]
  - Deferred: not an apply task. Archive promotes deltas into `openspec/specs/`.
