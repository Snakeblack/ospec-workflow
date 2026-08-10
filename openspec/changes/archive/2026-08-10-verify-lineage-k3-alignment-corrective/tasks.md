# Tasks: `verify-lineage-k3-alignment-corrective`

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

## Phase 1 — Canonical Candidate Binding

* [x] **1.1** Sustituir la identidad `verify-candidate-v1` de `verify-lineage.js` por `Candidate/v2.candidate_id`.
* [x] **1.2** Reutilizar las funciones canónicas de `scripts/lib/execution-identities/`.
* [x] **1.3** Rechazar Candidate ausente, inválido o no canónico.
* [x] **1.4** Mantener `genesis_candidate_id`, `current_candidate_id` y `verified_candidate_id` ligados exclusivamente a CandidateId K3.
* [x] **1.5** Añadir tests de Candidate malformed, empty input y forged `candidate_id`.

## Phase 2 — Active Candidate Drift

* [x] **2.1** Añadir candidate identity check común a `getLineageNextAction`.
* [x] **2.2** Cubrir `remediation-pending`.
* [x] **2.3** Cubrir `recheck-pending`.
* [x] **2.4** Mantener el check existente de `closed`.
* [x] **2.5** Persistir reason code estructurado para candidate drift.
* [x] **2.6** Añadir restart tests en cada estado.

## Phase 3 — Byte-Bound Contract Fingerprint

* [x] **3.1** Implementar helper canónica para fingerprint de artifacts OpenSpec.
* [x] **3.2** Fingerprint proposal/proposal-lite según modo.
* [x] **3.3** Fingerprint specs sorted por repository-relative path.
* [x] **3.4** Fingerprint design/tasks cuando sean requeridos.
* [x] **3.5** Rechazar artifacts requeridos ausentes o unreadable.
* [x] **3.6** Sustituir los callers que actualmente construyen contract identity desde representaciones ambiguas.

## Phase 4 — Mechanical Remediation Scope

* [x] **4.1** Resolver Candidate pre-remediation.
* [x] **4.2** Resolver Candidate post-remediation.
* [x] **4.3** Derivar paths modificados efectivos.
* [x] **4.4** Validar subset contra union de `allowed_paths` unresolved.
* [x] **4.5** Rechazar transition a `recheck-pending` ante scope violation.
* [x] **4.6** Añadir structured reason `remediation-scope-violation`.

## Phase 5 — Frozen Validation Recipes

* [x] **5.1** Eliminar fallback implícito `npm test`.
* [x] **5.2** Validar `validation.commands`.
* [x] **5.3** Validar `expected_exit`.
* [x] **5.4** Canonicalizar `test_files`.
* [x] **5.5** Rechazar blocker finding sin recipe reproducible.
* [x] **5.6** Comprobar que Targeted Recheck consume exclusivamente las recipes congeladas.

## Phase 6 — Restore Normal Apply Recovery

* [x] **6.1** Restaurar lectura explícita de `apply-progress.md`.
* [x] **6.2** Colocar el remediation router antes del workflow normal.
* [x] **6.3** Evitar que remediation cargue/ejecute tareas normales innecesariamente.
* [x] **6.4** Garantizar que `[x]` conserva semántica de completado/verificado tras restart.
* [x] **6.5** Corregir referencias internas al antiguo Step 2b.
* [x] **6.6** Añadir test de continuation con tareas parciales.

## Phase 7 — Canonical TDD Authority

* [x] **7.1** Introducir/resolver `resolveTddMode(config)` como autoridad común.
* [x] **7.2** `sdd-apply` usa solo `testing.tdd_mode`.
* [x] **7.3** `sdd-verify` usa solo `testing.tdd_mode`.
* [x] **7.4** pre-commit usa solo `testing.tdd_mode`.
* [x] **7.5** `scale` deja de participar en runtime TDD resolution.
* [x] **7.6** `strict_tdd` queda únicamente como migration input.
* [x] **7.7** Actualizar init/reference text que todavía presenta `strict_tdd` como config runtime.

## Phase 8 — FSM and Recovery Contract Suite

* [x] **8.1** Start blockers → `remediation-pending`.
* [x] **8.2** Successful remediation → `recheck-pending`.
* [x] **8.3** Successful recheck → `closed`.
* [x] **8.4** First failed recheck → `remediation-pending`.
* [x] **8.5** Second failed recheck → `exhausted`.
* [x] **8.6** Candidate drift in every active state → fail closed.
* [x] **8.7** Contract byte drift → superseded.
* [x] **8.8** Hard retry limit tampering → rejected.
* [x] **8.9** Unauthorized remediation path → rejected.
* [x] **8.10** Missing validation recipe → rejected.
* [x] **8.11** Restart every persisted state → deterministic `next_action`.
* [x] **8.12** Closed + exact Candidate/contract → cached PASS.
* [x] **8.13** Closed + different Candidate → never cached PASS.

## Phase 9 — Roadmap Boundary Tests

* [x] **9.1** Assert corrective introduces no Execution Graph runtime.
* [x] **9.2** Assert no WorkOrder/WorkResult dependency is added to bounded verify remediation.
* [x] **9.3** Assert no new Candidate identity/schema is introduced.
* [x] **9.4** Assert no new Authority Store ownership for verify lineage.
* [x] **9.5** Assert no Evaluation Attestation or Delivery Authorization behavior appears.
* [x] **9.6** Document maturity as current-workflow corrective, not K4a capability.

## Phase 10 — Final Verification

* [x] **10.1** Run focal verify-lineage tests.
* [x] **10.2** Run apply continuation/recovery tests.
* [x] **10.3** Run TDD authority matrix.
* [x] **10.4** Run execution-identities regression suite.
* [x] **10.5** Run all target generation tests affected indirectly.
* [x] **10.6** Run complete `npm test`.
* [x] **10.7** Verify no K4a/K4b primitive was introduced.
* [x] **10.8** Verify roadmap remains unchanged except, if desired, a small reference to the corrective.
* [ ] **10.9** Archive the corrective.
* [ ] **10.10** Continue with K4a rather than opening another round of bounded-workflow redesign.
