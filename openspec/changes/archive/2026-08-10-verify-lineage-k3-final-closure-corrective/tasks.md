# Tasks: `verify-lineage-k3-final-closure-corrective`

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

## Phase 1 — Pre-Remediation Candidate Guard

* [x] **1.1** Identificar la boundary exacta previa a cualquier write de remediation.
* [x] **1.2** Freeze/resolver Candidate actual antes de remediation.
* [x] **1.3** Compararlo obligatoriamente con `verify_lineage.current_candidate_id`.
* [x] **1.4** Rechazar drift antes de cualquier filesystem write.
* [x] **1.5** Eliminar semántica opcional de `baseline_candidate` para una transition válida.
* [x] **1.6** Añadir structured reason `candidate-drift`.
* [x] **1.7** Garantizar que drift no incremente `remediation_attempts`.

## Phase 2 — Real Candidate Delta

* [x] **2.1** Implementar helper de delta Candidate A → Candidate B.
* [x] **2.2** Cubrir added paths.
* [x] **2.3** Cubrir modified paths.
* [x] **2.4** Cubrir deleted paths.
* [x] **2.5** Cubrir mode/symlink/case-sensitive differences según K3.
* [x] **2.6** Eliminar `actual_changed_paths` como source of authority.
* [x] **2.7** Eliminar fallback semántico `postCandidate.paths == remediation delta`.
* [x] **2.8** Aplicar allowlist al delta derivado.
* [x] **2.9** Fail closed si el delta no puede calcularse de forma fiable.

## Phase 3 — Runtime-Owned Contract Digest

* [x] **3.1** Diseñar API `computeContractDigestFromArtifacts`.
* [x] **3.2** Resolver standard vs lite artifacts.
* [x] **3.3** Leer proposal bytes.
* [x] **3.4** Leer y ordenar specs bytes.
* [x] **3.5** Leer design bytes cuando sea requerido.
* [x] **3.6** Leer tasks bytes.
* [x] **3.7** Rechazar missing/unreadable required artifacts.
* [x] **3.8** Eliminar trust en externally supplied artifact digest.
* [x] **3.9** Impedir interpretación de path strings como artifact content.
* [x] **3.10** Migrar start/recheck/router callers a la nueva boundary.

## Phase 4 — Canonical TDD Authority

* [x] **4.1** Simplificar `resolveTddMode()` a `testing.tdd_mode`.
* [x] **4.2** Eliminar `scale` de runtime resolution en `sdd-apply`.
* [x] **4.3** Eliminar legacy `strict_tdd` de `sdd-verify` runtime.
* [x] **4.4** Eliminar legacy parsing de `strict_tdd` del pre-commit runtime.
* [x] **4.5** Actualizar strict TDD rule activation wording.
* [x] **4.6** Actualizar `sdd-init` para migration/default materialization.
* [x] **4.7** Eliminar escritura duplicada de `strict_tdd` donde ya exista canonical config.
* [x] **4.8** Actualizar init-details/references.
* [x] **4.9** Añadir tests de precedence y migration.

## Phase 5 — True Remediation Fast Path

* [x] **5.1** Mover remediation router antes del full context normal.
* [x] **5.2** Definir artifacts mínimos necesarios.
* [x] **5.3** Evitar lectura de unrelated specs/design/code en remediation.
* [x] **5.4** Evitar normal workload forecast durante remediation.
* [x] **5.5** Mantener RETURN/HALT obligatorio tras remediation.
* [x] **5.6** Añadir test estructural del orden del skill.
* [x] **5.7** Añadir test funcional de que remediation no entra en normal executor.

## Phase 6 — Behavioral Apply Resume

* [x] **6.1** Identificar/extract minimal deterministic task-resume logic.
* [x] **6.2** Leer `apply-progress` antes de normal task execution.
* [x] **6.3** Resolver completed `[x]`.
* [x] **6.4** Resolver partial `[~]`.
* [x] **6.5** Evitar duplicate execution.
* [x] **6.6** Añadir process/restart-equivalent test.
* [x] **6.7** Eliminar/reclasificar el test textual anterior si se presenta como runtime evidence.

## Phase 7 — Verify Evidence Integrity

* [x] **7.1** Auditar tests asociados a cada MUST del corrective.
* [x] **7.2** Clasificar static-lint vs static-proof vs runtime-test correctamente.
* [x] **7.3** Reemplazar tests nominales/textuales por tests comportamentales donde corresponda.
* [x] **7.4** Evitar que test titles determinen evidence level.
* [x] **7.5** Añadir regression test para overclaim de evidence.
* [x] **7.6** Verificar que cada MUST runtime tenga runtime invocation real.

## Phase 8 — FSM Regression

* [x] **8.1** Start lineage → remediation-pending.
* [x] **8.2** Drift before remediation → supersede, zero writes.
* [x] **8.3** Valid remediation → successor Candidate.
* [x] **8.4** Scope violation → reject.
* [x] **8.5** Valid scope → recheck-pending.
* [x] **8.6** Candidate drift before recheck → supersede.
* [x] **8.7** Contract byte drift → supersede.
* [x] **8.8** First failed recheck → remediation-pending.
* [x] **8.9** Second failed recheck → exhausted.
* [x] **8.10** Closed exact identity → cached PASS.
* [x] **8.11** Closed changed identity → discovery.

## Phase 9 — Roadmap Boundary Regression

* [x] **9.1** Assert no Execution Graph runtime introduced.
* [x] **9.2** Assert no WorkOrder remediation runtime introduced.
* [x] **9.3** Assert no WorkResult evidence runtime introduced.
* [x] **9.4** Assert no worker isolation introduced.
* [x] **9.5** Assert no Assurance Graph introduced.
* [x] **9.6** Assert no attestation/authorization introduced.
* [x] **9.7** Assert Candidate remains K3 primitive reused rather than duplicated.

## Phase 10 — K3 / Roadmap Reconciliation

* [x] **10.1** Inspect `k3-readiness-remediation` terminal lifecycle facts.
* [x] **10.2** Reconcile archived folder vs `state.yaml`.
* [x] **10.3** Reconcile archive report if stale.
* [x] **10.4** Update roadmap K4a prerequisite status based on actual facts.
* [x] **10.5** Preserve roadmap ordering and architecture.
* [x] **10.6** Add regression preventing archived/verified/blocked contradictions where mechanically detectable.

## Phase 11 — Final Verification

* [x] **11.1** Run focal Candidate drift tests.
* [x] **11.2** Run real Candidate delta tests.
* [x] **11.3** Run filesystem contract digest tests.
* [x] **11.4** Run TDD authority matrix.
* [x] **11.5** Run remediation routing tests.
* [x] **11.6** Run behavioral apply resume test.
* [x] **11.7** Run verify evidence classification tests.
* [x] **11.8** Run execution-identities regression.
* [x] **11.9** Run relevant target/config generation regression.
* [x] **11.10** Run full `npm test`.
* [x] **11.11** Verify zero forbidden K4a/K4b primitives introduced.
* [x] **11.12** Generate fresh verify report based only on demonstrated evidence.

## Phase 12 — Archive and Handoff

* [x] **12.1** Archive corrective transactionally.
* [x] **12.2** Confirm promoted spec bytes match verified change.
* [x] **12.3** Confirm roadmap reflects reconciled K3/K4a state.
* [x] **12.4** Freeze Bounded Verify Lineage corrective work.
* [x] **12.5** Mark K4a as next architectural work when prerequisites are satisfied.
* [x] **12.6** Do not open another bounded-verify redesign change without a new demonstrated BLOCKER.
