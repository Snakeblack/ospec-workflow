# Tasks: k6b-verifier-evidence-assurance-graph

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-independent-verification-001: Frozen CandidateId proceeds | MUST | `independent-verifier/bindings.js` | covered-by-design | K3 Candidate v2 + K4a bindings + repo reconciliation |
| REQ-independent-verification-001: WorkResult subject rejected | MUST | `independent-verifier/bindings.js` | covered-by-design | Explicit WorkResult/unfrozen fail-closed before strategy |
| REQ-independent-verification-001: Unfrozen/binding mismatch rejected | MUST | `independent-verifier/bindings.js` | covered-by-design | Digest mismatch halts before strategy evaluation |
| REQ-independent-verification-002: Feature strategy minimums | MUST | `independent-verifier/strategy-policy.js` | covered-by-design | Closed table per strategy with negatives |
| REQ-independent-verification-002: Strict TDD fallback, no tdd_mode rewrite | MUST | `independent-verifier/strategy-policy.js` | covered-by-design | Default when undeclared; config.yaml untouched |
| REQ-independent-verification-003: Runtime-observed satisfies obligation | MUST | `independent-verifier/evidence.js` | covered-by-design | Provenance admission + sufficiency without verdict |
| REQ-independent-verification-003: Model-reported insufficient | MUST | `independent-verifier/evidence.js` | covered-by-design | Worker narrative cannot satisfy stronger obligations |
| REQ-independent-verification-003: Stale/foreign/fabricated rejected | MUST | `independent-verifier/evidence.js`, `bindings.js` | covered-by-design | Digest/CandidateId/staleness gates |
| REQ-independent-verification-004: Sufficient evidence yields verdict | MUST | `independent-verifier/verdict.js` | covered-by-design | Separate verification/v2 record |
| REQ-independent-verification-004: Evidence carrying verdict rejected | MUST | `evidence/v2.schema.json`, `evidence.js` | covered-by-design | Schema + verifier reject mixed payloads |
| REQ-assurance-graph-001: Matching inputs project graph | MUST | `assurance-graph/projector.js` | covered-by-design | Derived from canonical OpenSpec/Git/Candidate |
| REQ-assurance-graph-001: Divergent graph fails closed | MUST | `assurance-graph/index.js` (reconcile) | covered-by-design | Recomputation mismatch → fail-closed |
| REQ-assurance-graph-002: Same digest and edges twice | MUST | `assurance-graph/projector.js` | covered-by-design | Sorted/deduped canonical projection |
| REQ-assurance-graph-002: Forbidden relations rejected | MUST | `assurance-graph/v1.schema.json`, `projector.js` | covered-by-design | No reviewed-by/K7/K8 subjects |
| REQ-assurance-graph-003: Successor invalidates dependent closure only | MUST | `assurance-graph/invalidation.js` | covered-by-design | Selective preservation of independent evidence |
| REQ-assurance-graph-003: Transitive invalidates blocks reuse | MUST | `assurance-graph/invalidation.js`, verifier integration | covered-by-design | Cycle-safe traversal |
| REQ-assurance-graph-004: Manifest emitted without promotion | MUST | `assurance-graph/index.js` | covered-by-design | Binds graph_id + CandidateId; non-authoritative |
| REQ-assurance-graph-004: Manifest cannot alias attestation | MUST | `assurance-graph/v1.schema.json`, fixtures | covered-by-design | Non-aliasing fixtures |
| REQ-kernel-contract-schemas-024: evidence/v2 + v1 pins frozen | MUST | `schemas/kernel/evidence/v2.schema.json`, `k6b-schema-fixtures.test.js` | covered-by-design | Additive v2; v1 byte-identical |
| REQ-kernel-contract-schemas-025: verification/v2 + cross-family rejection | MUST | `schemas/kernel/verification/v2.schema.json`, fixtures | covered-by-design | evidence↔verification non-aliasing |
| REQ-kernel-contract-schemas-026: assurance-graph family + manifest | MUST | `schemas/kernel/assurance-graph/v1.schema.json`, registry | covered-by-design | Four relations; optional equivalence manifest |
| REQ-kernel-contract-schemas-001: K6b family in inventory | MUST | `manifest.json`, `k6b-schema-fixtures.test.js` | covered-by-design | assurance-graph pinnable alongside v2 families |
| REQ-harness-authority-canon-010: Read-only projection accepted | MUST | `assurance-graph/index.js`, boundary tests | covered-by-design | No mutating authority APIs |
| REQ-harness-authority-canon-010: Graph as authority fails closed | MUST | `roadmap-boundary.test.js`, API guards | covered-by-design | Structured reason on authority misuse |
| REQ-harness-authority-canon-011: K6b surfaces tagged implemented | MUST | `docs/architecture/harness-evolution.md`, `docs/roadmaps/harness-evolution.md` | covered-by-design | Verifier/strategies/projection only |
| REQ-harness-authority-canon-011: Graph authority stays non-implemented | MUST | harness-evolution docs | covered-by-design | K6c/K7/K8 remain target/experimental |
| REQ-harness-authority-canon-001: Assurance Graph cannot override OpenSpec | MUST | `assurance-graph/index.js` reconcile, boundary tests | covered-by-design | OpenSpec/Git/Candidate remain sole authority |

### Reconciliation Verdict

- MUST coverage: complete (14 REQs, 26/26 escenarios MUST cubiertos por diseño).
- SHOULD/MAY gaps: none.
- Ambiguities to track: none.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1100–1500 líneas |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR con `size:exception`; orden lógico: schemas/fixtures → verifier bindings/strategy → evidence/verdict → assurance-graph → boundary/E2E → docs |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Contratos v2/v1 schemas, fixtures y registro K1 aditivo | PR 1 (single) | evidence/v2, verification/v2, assurance-graph/v1; v1 pins byte-identical |
| 2 | Verifier independiente (bindings → strategy → evidence → verdict) | PR 1 (single) | `scripts/lib/independent-verifier/` con Strict TDD fallback |
| 3 | Assurance Graph (projector → invalidation → manifest) | PR 1 (single) | Proyección determinista y closure selectivo |
| 4 | Boundary, E2E K4b→verify→graph→successor y docs de madurez | PR 1 (single) | `roadmap-boundary.test.js`, `k6b-verifier-assurance-graph-e2e.test.js` |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Kernel Schemas v2 y Registro Aditivo

- [x] 1.1 RED: Crear `scripts/lib/k6b-schema-fixtures.test.js` con tests que exigen `evidence/v2`, `verification/v2`, `assurance-graph/v1` en `manifest.json`/`contract-claims.json` y assert de bytes v1 sin cambios en `K1_SCHEMA_BASELINE`. [REQ-kernel-contract-schemas-024, REQ-kernel-contract-schemas-025, REQ-kernel-contract-schemas-026, REQ-kernel-contract-schemas-001]
- [x] 1.2 GREEN: Publicar `schemas/kernel/evidence/v2.schema.json` (`kind: evidence/v2`, provenance enum, `additionalProperties: false`, sin `verdict`) y fixtures valid/invalid (provenance, verdict, malformed candidate_id). [REQ-kernel-contract-schemas-024]
- [x] 1.3 GREEN: Publicar `schemas/kernel/verification/v2.schema.json` (`kind: verification/v2`, verdict enum, evidence_ids) y fixtures valid/invalid incluyendo cross-family rejection evidence↔verification. [REQ-kernel-contract-schemas-025]
- [x] 1.4 GREEN: Publicar `schemas/kernel/assurance-graph/v1.schema.json` (cuatro relaciones, equivalence-manifest opcional no aliasing) y fixtures valid/invalid (unknown relation, malformed digest, attestation alias). [REQ-kernel-contract-schemas-026]
- [x] 1.5 GREEN: Actualizar `schemas/kernel/manifest.json` y `schemas/kernel/contract-claims.json` con familias aditivas; verificar que `k6b-schema-fixtures.test.js` pasa y v1 permanece byte-identical. [REQ-kernel-contract-schemas-001]
- [x] 1.6 REFACTOR: Triangular fixtures adversariales (verdict en evidence, worker-said-so provenance, reviewed-by edge) en `k6b-schema-fixtures.test.js`. [REQ-kernel-contract-schemas-024, REQ-kernel-contract-schemas-026]

## Phase 2: Independent Verifier — Bindings y Estrategias

- [x] 2.1 RED: Crear `scripts/lib/independent-verifier/index.test.js` con tests de rechazo: subject `WorkResultId`, candidate no congelado, binding digest mismatch — todos fail-closed antes de strategy. [REQ-independent-verification-001]
- [x] 2.2 GREEN: Implementar `scripts/lib/independent-verifier/bindings.js` usando APIs K3 (`execution-identities`) y K4a (`execution-graph`) para validar Candidate v2, Execution Graph, repo bytes y raw evidence bindings. [REQ-independent-verification-001]
- [x] 2.3 RED: Tests en `index.test.js` para selección exactamente-una de `bug|feature|refactor|migration|config-docs`, mínimos por strategy (p.ej. feature exige acceptance+negative), y fallback Strict TDD sin mutar `openspec/config.yaml`. [REQ-independent-verification-002]
- [x] 2.4 GREEN: Implementar `scripts/lib/independent-verifier/strategy-policy.js` con tabla cerrada de mínimos, negativos y provenance admisible; undeclared → `strict-tdd`. [REQ-independent-verification-002]
- [x] 2.5 REFACTOR: Triangular las cinco strategies con casos negativos representativos (green-without-red, missing rollback, docs-only claim). [REQ-independent-verification-002]

## Phase 3: Independent Verifier — Evidencia, Provenance y Verdict

- [x] 3.1 RED: Tests en `index.test.js` para normalización evidence/v2: digest sobre raw bytes, provenance admission, rechazo stale/foreign/fabricated y model-reported insuficiente para obligaciones runtime/tool. [REQ-independent-verification-003]
- [x] 3.2 GREEN: Implementar `scripts/lib/independent-verifier/evidence.js` (canonical normalize, obligation sufficiency, fail-closed provenance). [REQ-independent-verification-003]
- [x] 3.3 RED: Tests para emisión verification/v2 separada (PASS/WARN/FAIL), evidence sin `verdict`, rechazo payload mixto evidence+verdict. [REQ-independent-verification-004]
- [x] 3.4 GREEN: Implementar `scripts/lib/independent-verifier/verdict.js` y facade `scripts/lib/independent-verifier/index.js` exportando `verifyCandidate()`. [REQ-independent-verification-004]
- [x] 3.5 REFACTOR: Verificar determinismo de `evidence_id` y `verification_id` con inputs permutados; registrar tabla TDD en `apply-progress.md`. [REQ-independent-verification-003, REQ-independent-verification-004]

## Phase 4: Assurance Graph — Proyección y Reconciliación

- [x] 4.1 RED: Crear `scripts/lib/assurance-graph/index.test.js` con tests de digest byte-idéntico ante permutación de nodos/edges y rechazo de relaciones prohibidas (`reviewed-by`, K7/K8 subjects). [REQ-assurance-graph-002]
- [x] 4.2 GREEN: Implementar `scripts/lib/assurance-graph/projector.js` (canonical sort/dedupe, cuatro relaciones, `graph_id` fingerprint). [REQ-assurance-graph-001, REQ-assurance-graph-002]
- [x] 4.3 RED: Tests de reconciliación fail-closed cuando proyección almacenada diverge de OpenSpec/Git/Candidate canónicos. [REQ-assurance-graph-001, REQ-harness-authority-canon-001]
- [x] 4.4 GREEN: Implementar reconciliación read-only en `scripts/lib/assurance-graph/index.js` (`projectAssuranceGraph`, `reconcileAssuranceGraph`). [REQ-assurance-graph-001]
- [x] 4.5 REFACTOR: Assert APIs retornan objetos nuevos sin write-through a OpenSpec/Git/Candidate. [REQ-harness-authority-canon-010]

## Phase 5: Assurance Graph — Invalidación Selectiva y Manifest K9

- [x] 5.1 RED: Tests en `index.test.js` para closure selectivo: successor afecta evidencia dependiente D, preserva independiente I; traversal cycle-safe sobre cuatro relaciones. [REQ-assurance-graph-003]
- [x] 5.2 GREEN: Implementar `scripts/lib/assurance-graph/invalidation.js` (`computeInvalidationClosure`) con IDs ordenados y preserved_evidence_ids. [REQ-assurance-graph-003]
- [x] 5.3 RED: Tests de rechazo verifier cuando evidencia E alcanzable vía `invalidates` transitivo; manifest ligado a graph_id+CandidateId sin promover equivalencia ni autorizar delivery. [REQ-assurance-graph-003, REQ-assurance-graph-004]
- [x] 5.4 GREEN: Completar `assurance-graph/index.js` con export de manifest no autoritativo y wiring post-`verifyCandidate`. [REQ-assurance-graph-004]
- [x] 5.5 REFACTOR: Triangular manifest non-aliasing contra schemas attestation/authorization en fixtures. [REQ-assurance-graph-004, REQ-kernel-contract-schemas-026]

## Phase 6: Boundary, E2E e Integración Vertical

- [x] 6.1 RED: Extender `scripts/lib/roadmap-boundary.test.js` assertando que K3/K4a/K4b/K6a no importan ni referencian módulos K6b (`independent-verifier`, `assurance-graph`). [REQ-harness-authority-canon-010]
- [x] 6.2 GREEN: Añadir guard de authority misuse: operación que intente aprobar/delivery desde graph edges solas debe fail-closed con reason_code estructurado. [REQ-harness-authority-canon-010]
- [x] 6.3 RED: Crear `scripts/k6b-verifier-assurance-graph-e2e.test.js`: Candidate K4b congelado → verify → project twice (digest match) → successor → invalidation selectiva → verifier rechaza evidencia invalidada. [REQ-independent-verification-001, REQ-assurance-graph-002, REQ-assurance-graph-003]
- [x] 6.4 GREEN: Implementar flujo E2E completo con fixtures K4a/K4b reales; ejecutar `npm test` focalizado en suite K6b. [REQ-assurance-graph-003]
- [x] 6.5 Ejecutar suites (`k6b-schema-fixtures.test.js`, `independent-verifier/index.test.js`, `assurance-graph/index.test.js`, `k6b-verifier-assurance-graph-e2e.test.js`, `roadmap-boundary.test.js`) y registrar evidencia TDD en `apply-progress.md`.

## Phase 7: Documentación de Madurez Harness

- [x] 7.1 Actualizar `docs/architecture/harness-evolution.md` y `docs/roadmaps/harness-evolution.md`: etiquetar verifier independiente, strategies/provenance y Assurance Graph projection como `implemented`; mantener graph authority, K6c/K7/K8 como `target`/`experimental`. [REQ-harness-authority-canon-011]
- [x] 7.2 Verificar que documentación refuerza OpenSpec/Git/Candidate como única autoridad semántica post-K6b. [REQ-harness-authority-canon-001, REQ-harness-authority-canon-011]
