# Archive Report: k4b-integration-invariants-remediation

**Archive destination (planned)**: `openspec/changes/archive/2026-08-26-k4b-integration-invariants-remediation/`
**Verified**: 2026-08-26
**Verify verdict**: PASS (35/35 MUST scenarios; targeted 173/173; `npm test` 2667 passed / 0 failed / 2 skipped)
**4R lineage**: `sha256:1ad92db832e2e76d8f753f920b345131f76bd513ecae9dbecc12deb6b2cb2f69` — approved (`no-unresolved-blocking-findings`)

## Summary

Remediación K4b de cinco invariantes de integración publicados en v2.48.1:

- Parser fail-closed de unified diffs (`MALFORMED_UNIFIED_DIFF`) con excepción explícita para diffs solo-modo.
- Option A: WorkOrder v2 con `capsule_inputs` concretos; materialización K6a = `EffectiveShadowBase ∩ capsule_inputs`.
- Conflictos DAG solo entre predecesores incomparables; solapamientos ancestro→descendiente permitidos.
- Store 1:N por fingerprint interno; `CandidateId` como índice secundario sin quinta identidad.
- Comparación canónica en siete dimensiones con `steps` = `node_id` topológico.

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS |
| CRITICAL issues | None |
| WARNING issues (verify) | None |
| 4R review | Approved — 0 BLOCKER, 0 CRITICAL, 8 WARNING, 1 SUGGESTION (advisory) |
| Tasks complete | 41 / 41 |
| Normative scenarios | 35 / 35 satisfied |
| Full repository suite | PASS — 2667 passed / 0 failed / 2 skipped |

## Spec Preparation (change-local)

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `repair-shadow-orchestration` | Merge delta into baseline | REQ-010, REQ-011, REQ-012 | REQ-006, REQ-009 | — |
| `execution-graph-compiler` | Merge delta into baseline | REQ-009 | — | — |
| `worker-isolation` | Merge delta into baseline | — | REQ-002 | — |
| `kernel-contract-schemas` | Merge delta into baseline | REQ-023 | — | — |

Prepared merged bytes under `prepared-specs/{domain}/spec.md`. Delta audit trail under `specs/{domain}/spec.md`.

| Domain | `target_before_sha256` | `content_sha256` |
|--------|------------------------|------------------|
| `repair-shadow-orchestration` | `sha256:aead5c3d69c1434a5a33a09173b65a47a07c9b4902330552c9d90324eccc33eb` | `sha256:1971325f8a7896664c336a57bac725cfeff3a975f315aa0126d54b23941c3262` |
| `execution-graph-compiler` | `sha256:3b46a149174c3e51f05e7765ca6c9243a9d8874d66ec02a5441772bca587096f` | `sha256:91cf3666ae6c6bdd6d805a819d33d09d22ec159ac3554b77a5bb06875c65261d` |
| `worker-isolation` | `sha256:80f7e2dfd50de9fae1f258836f1fcec9ae38fa5724b974291561f48311ce8e52` | `sha256:be2a4ed2860eec34484c6d3ab0e2ec3da71f546b535c1c63176d9284a7a4cea4` |
| `kernel-contract-schemas` | `sha256:d36106d210f979695523587d5e00d175960eb32e4f173665915707f492211cf9` | `sha256:c719bd07ea252ca0f7a1d0cc361d982c86a9991bbdc4bd126efa29c43e52ba24` |

All `target_before_sha256` values match `baseline_fingerprints` in `state.yaml`.

## ADR Promotions (planned)

| Source | Planned target |
|--------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260826-004-workorder-capsule-inputs-from-snapshot-bound-inventory.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260826-005-execution-records-indexed-by-internal-fingerprint.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260826-006-canonical-graph-derived-execution-projections.md` |

Las copias locales bajo `decisions/` viajan con el directorio archivado como pista de auditoría.

## Accepted Risks / Follow-ups (4R advisory)

| ID | Owner | Severity | Summary | Disposition |
|----|-------|----------|---------|-------------|
| F-8fa19fff5eecb9d0 | reliability | WARNING | Cobertura de tests insuficiente para rechazos `empty-capsule-inputs` / `invalid-capsule-inputs` en `computeWorkOrderId` | **Follow-up** |
| F-0d76867abc05713d | reliability | WARNING | `materializeSourceSnapshot` no rechaza `capsule_inputs: []` antes de escribir | **Follow-up** |
| F-93617d755411a476 | reliability | WARNING | `execution_metrics` vía `JSON.stringify` puede false-divergir con orden de claves distinto | **Follow-up** |
| F-d03e21b54347bec9 | reliability | SUGGESTION | Sin fixture/test para `uniqueItems` en `capsule_inputs` v2 | **Follow-up** |
| F-d435df6b87bb7fd5 | readability | WARNING | `detectPredecessorContextConflicts` mezcla firmas y anidación profunda | **Follow-up** |
| F-22474cdcd456548f | readability | WARNING | `isDirectoryOrGlobRule` ambiguo; duplicación con `isConcreteRelativeCapsulePath` | **Follow-up** |
| F-5fd446549be143e1 | readability | WARNING | Proyección sin grafo puede pasar validación con `steps:[]` | **Follow-up** |
| F-b9a7defad099bc61 | readability | WARNING | `parseUnifiedDiffs` continúa tras hunk malformado sin documentar excepciones | **Follow-up** |
| F-944663644dad49bc | readability | WARNING | Fallback silencioso de topología shadow en baseline no-proyección | **Follow-up** |

Ningún hallazgo 4R bloquea el archivo; todos quedan registrados como trabajo de seguimiento.

## Archive Inventory

Origin paths preserved by the planned runtime move (excluding `archive-plan.json` from fingerprint):

- `.4r/build-evidence.js`
- `.4r/diff.tracked.patch`
- `.4r/evidence.json`
- `.4r/findings-summary.json`
- `.4r/freeze-lineage.js`
- `.4r/gate.json`
- `.4r/lens-readability.json`
- `.4r/lens-reliability.json`
- `.4r/lens-resilience.json`
- `.4r/lens-risk.json`
- `.4r/lineage.json`
- `.4r/record-lenses.js`
- `.4r/request-ids.json`
- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `design.md`
- `prepared-specs/execution-graph-compiler/spec.md`
- `prepared-specs/kernel-contract-schemas/spec.md`
- `prepared-specs/repair-shadow-orchestration/spec.md`
- `prepared-specs/worker-isolation/spec.md`
- `proposal.md`
- `specs/execution-graph-compiler/spec.md`
- `specs/kernel-contract-schemas/spec.md`
- `specs/repair-shadow-orchestration/spec.md`
- `specs/worker-isolation/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

## Runtime Completion (pending)

- Promoción de especificaciones vivas y ADRs: `node scripts/archive-transaction-run.js k4b-integration-invariants-remediation`
- El directorio fuente `openspec/changes/k4b-integration-invariants-remediation/` permanece intacto hasta que el recibo de éxito del runtime confirme la coincidencia completa.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k4b-integration-invariants-remediation/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
