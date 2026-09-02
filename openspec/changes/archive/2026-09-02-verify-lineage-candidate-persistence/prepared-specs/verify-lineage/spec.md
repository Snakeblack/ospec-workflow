# Specs: `verify-lineage-k3-alignment-corrective`

## Requirement: Verify Lineage MUST Use Canonical Candidate Identity

`REQ-VL-K3-001`

`verify_lineage` MUST utilizar como identidad del código el `candidate_id` canónico de `Candidate/v2`. Every persisted Candidate record and recovery result MUST validate against that canonical identity.

El sistema MUST NOT mantener una segunda función de identidad semántica basada exclusivamente en `paths`, `diff_hash` u otra representación parcial. A content address MAY identify recovery bytes, but MUST NOT replace or redefine `candidate_id`.

(Previously: required canonical `candidate_id` but did not require recoverable material to be checked against it.)

### Scenario: lineage opens against canonical Candidate

* GIVEN un `Candidate/v2` válido y canónico.
* WHEN Full Discovery abre una remediation lineage.
* THEN `genesis_candidate_id` MUST igualar exactamente `Candidate/v2.candidate_id`.
* AND `current_candidate_id` MUST igualar exactamente ese mismo `candidate_id`.

### Scenario: incomplete candidate fails closed

* GIVEN una operación authority-sensitive de verify.
* AND no puede resolverse un `Candidate/v2` canónico.
* WHEN se intenta abrir, continuar o cerrar una lineage.
* THEN la operación MUST fallar cerrada.
* AND MUST NOT generar una identidad alternativa desde `{}`, paths parciales o un `diff_hash` opcional.

### Scenario: recovered bytes disagree with canonical identity

* GIVEN a persisted Candidate record resolves to bytes whose canonical `candidate_id` differs from the lineage reference.
* WHEN a mutable transition validates the record.
* THEN the transition MUST fail closed.
* AND the lineage MUST retain its frozen identity and history unchanged.

---

## Requirement: Active Candidate Drift MUST Invalidate Lineage Execution

`REQ-VL-K3-002`

Toda transición ejecutable de una lineage activa MUST comprobar que el Candidate observado coincide con `current_candidate_id`.

### Scenario: drift before remediation

* GIVEN `status: remediation-pending`.
* AND `current_candidate_id = Candidate A`.
* AND el workspace actual corresponde a `Candidate B`.
* WHEN se evalúa la siguiente acción.
* THEN remediation MUST NOT ejecutarse.
* AND la lineage MUST quedar invalidada/superseded con un reason code estructurado de candidate drift.

### Scenario: drift before targeted recheck

* GIVEN `status: recheck-pending`.
* AND la remediation produjo `Candidate B`.
* AND antes del recheck el workspace cambió a `Candidate C`.
* WHEN se evalúa la siguiente acción.
* THEN Targeted Recheck MUST NOT ejecutarse contra Candidate C.
* AND la lineage MUST requerir reconciliación o nueva Discovery.

### Scenario: exact candidate resumes deterministically

* GIVEN una sesión reiniciada.
* AND el Candidate actual coincide con `current_candidate_id`.
* WHEN se evalúa la lineage.
* THEN el mismo persisted state MUST producir la misma `next_action`.

---

## Requirement: Contract Digest MUST Bind Real OpenSpec Bytes

`REQ-VL-K3-003`

`contract_digest` MUST depender del contenido efectivo de los artefactos contractuales y no únicamente de sus rutas o nombres.

El fingerprint MUST ser derivado y MUST NOT constituir una nueva autoridad semántica.

### Canonical inputs

Cuando existan según el modo del change:

* `proposal.md` o `proposal-lite.md`
* specs activas del change
* `design.md`
* `tasks.md`

Cada input MUST representarse mediante:

```text
canonical repository-relative path
+
SHA-256 of current file bytes
```

Las colecciones MUST ordenarse canónicamente antes de calcular el digest final.

### Scenario: same path, changed bytes

* GIVEN `design.md` mantiene la misma ruta.
* AND sus bytes cambian.
* WHEN se recalcula `contract_digest`.
* THEN el digest MUST cambiar.

### Scenario: missing required artifact

* GIVEN un artifact requerido por el modo actual.
* AND el artifact no puede leerse o fingerprintarse.
* WHEN una operación de lineage requiere el contract identity.
* THEN MUST fallar cerrada.
* AND MUST NOT sustituir el contenido por `""`, `[]` o valores equivalentes.

---

## Requirement: Remediation Scope MUST Be Mechanically Enforced

`REQ-VL-K3-004`

Una remediation MUST poder modificar únicamente el conjunto permitido por las findings congeladas.

```text
actual_remediation_changed_paths
⊆
union(unresolved_findings.allowed_paths)
```

### Scenario: remediation inside scope

* GIVEN una lineage `remediation-pending`.
* WHEN la remediation produce un nuevo Candidate.
* AND todos los paths modificados pertenecen al scope permitido.
* THEN `recordRemediationAttempt` MAY avanzar a `recheck-pending`.

### Scenario: remediation escapes scope

* GIVEN una remediation que modifica al menos un path fuera del allowlist congelado.
* WHEN se intenta registrar el intento.
* THEN el intento MUST ser rechazado.
* AND MUST NOT avanzar a `recheck-pending`.
* AND el motivo MUST ser estructurado, por ejemplo `remediation-scope-violation`.

### Constraint

La comprobación MUST realizarse mediante el delta real entre Candidates/Git.

El modelo no puede autorizar una excepción escribiendo que el cambio era necesario.

---

## Requirement: Frozen Findings MUST Have Explicit Validation Recipes

`REQ-VL-K3-005`

Toda finding BLOCKER/CRITICAL que abra una bounded remediation lineage MUST contener una validation recipe explícita y reproducible.

### Scenario: explicit recipe

* GIVEN una finding con un comando/test focal válido.
* WHEN se abre la lineage.
* THEN la recipe MUST quedar congelada junto a la finding.

### Scenario: missing recipe

* GIVEN una BLOCKER/CRITICAL finding sin validation recipe suficiente.
* WHEN `startVerifyLineage` intenta congelarla.
* THEN la operación MUST fallar cerrada o devolver un structured blocker de missing verification recipe.
* AND MUST NOT inventar `npm test`, `go test`, pytest ni otro comando.

### Constraint

Targeted Recheck MUST ejecutar evidence ya seleccionada.

MUST NOT volver a hacer Full Discovery para decidir cómo comprobar la finding.

---

## Requirement: Normal Apply Resume MUST Remain Authoritative

`REQ-VL-K3-006`

El remediation fast path MUST NOT eliminar la recuperación normal del progreso de implementación.

### Scenario: resume partially completed apply

* GIVEN `apply-progress.md` contiene tareas previamente completadas y verificadas.
* WHEN `sdd-apply` continúa tras un restart.
* THEN MUST leer el progreso persistido antes de implementar.
* AND MUST NOT repetir una tarea `[x]` salvo invalidación explícita y demostrable de su evidencia.

### Scenario: remediation bypasses normal task implementation

* GIVEN `verify_lineage.status: remediation-pending`.
* WHEN se ejecuta `sdd-apply`.
* THEN MUST tomar el remediation fast path antes del workflow normal.
* AND MUST RETURN después de remediation.
* AND MUST NOT ejecutar tareas normales del backlog.

---

## Requirement: `testing.tdd_mode` MUST Be Sole Runtime TDD Authority

`REQ-VL-K3-007`

Durante apply, verify y hooks:

```yaml
testing:
  tdd_mode: standard | focused | strict
```

MUST ser la única autoridad runtime del modo TDD.

### Scenario: team with explicit standard

* GIVEN:

```yaml
scale: team
testing:
  tdd_mode: standard
```

* WHEN `sdd-apply` resuelve el modo.
* THEN MUST resolver `standard`.

### Scenario: strict canonical config

* GIVEN:

```yaml
testing:
  tdd_mode: strict
```

* WHEN apply, verify o pre-commit evalúan Strict TDD.
* THEN todos MUST resolver Strict usando la misma autoridad.

### Legacy migration

`strict_tdd` MAY aceptarse únicamente como input de migración/init.

Una vez materializado `testing.tdd_mode`, `strict_tdd` MUST NOT participar en runtime decisions.

---

## Requirement: Corrective MUST NOT Introduce Future Roadmap Authority

`REQ-VL-K3-008`

Este change MUST permanecer compatible con el roadmap y MUST NOT introducir parcialmente primitives pertenecientes a slices futuros.

### Forbidden additions

El change MUST NOT introducir como parte de la solución:

* WorkOrder runtime para remediation.
* WorkResult runtime para remediation.
* Execution Graph nodes.
* Obligation Manifest.
* Worker scheduler.
* Budget authority.
* Isolation/capsules.
* Evaluation Attestation.
* Delivery Authorization.
* Nueva authority store para verify.

### Scenario: architecture boundary validation

* GIVEN el corrective aplicado.
* WHEN se inspecciona el nuevo runtime.
* THEN Bounded Verify Lineage MUST seguir siendo un mecanismo acotado del workflow actual.
* AND K4a MUST conservar la propiedad del Execution Graph.
* AND K4b MUST conservar la propiedad de `WorkOrder → WorkResult → integrate → Candidate`.

---

# Specs: `verify-lineage-k3-final-closure-corrective`

## REQ-VL-FINAL-001 — Remediation MUST Start From Expected Candidate

Toda remediation MUST comprobar el Candidate activo inmediatamente antes de cualquier escritura.

El Candidate actual MUST coincidir exactamente con:

```text
verify_lineage.current_candidate_id
```

### Scenario: exact baseline permits remediation

* GIVEN `verify_lineage.status = remediation-pending`.
* AND `current_candidate_id = Candidate A`.
* AND el workspace actual freezea como Candidate A.
* WHEN `sdd-apply` entra en remediation mode.
* THEN MAY ejecutar la remediation.

### Scenario: drift before remediation blocks writes

* GIVEN `current_candidate_id = Candidate A`.
* AND el workspace actual freezea como Candidate B.
* WHEN remediation intenta comenzar.
* THEN MUST NOT modificar ningún archivo.
* AND MUST return `candidate-drift`.
* AND lineage MUST route to supersede/discovery or reconciliation.
* AND no remediation attempt MUST ser contabilizado.

### Scenario: baseline validation is mandatory

* GIVEN `recordRemediationAttempt` o su boundary equivalente.
* WHEN no existe evidencia del Candidate pre-remediation.
* THEN MUST fail closed.
* AND MUST NOT inferir el baseline a partir del Candidate posterior.

---

## REQ-VL-FINAL-002 — Remediation Scope MUST Derive From Mechanical Candidate Delta

El conjunto de paths modificados durante remediation MUST derivarse únicamente de la diferencia efectiva entre `CandidateBefore` y `CandidateAfter` utilizando objetos o referencias Git resolubles.

### Scenario: no externally supplied diff text or fallback path sets

* GIVEN `deriveCandidateDeltaPaths(beforeCandidate, afterCandidate, options)`.
* WHEN se evalúa el delta de remediación.
* THEN el runtime MUST NOT aceptar `options.diffText` ni `options.diff` suministrados externamente como fuente de autoridad.
* AND el runtime MUST NOT asentar que todos los paths de B cambiaron simplemente porque el conjunto de paths coincide y `diff_hash` difiere.
* AND si las referencias de Candidate A o B no pueden resolverse contra objetos Git o tree snapshots reales, la operación MUST fallar cerrada (`delta-unresolvable`).

---

## REQ-VL-FINAL-003 — Contract Fingerprint MUST Be Runtime-Derived From OpenSpec Bytes Only

Toda operación de lineage (`startVerifyLineage`, `evaluateRecheck`, `getLineageNextAction`) MUST derivar `contract_digest` invocando `computeContractDigestFromArtifacts(changeRoot, mode)`.

### Scenario: external contract object is rejected for authority decisions

* GIVEN una invocación a `startVerifyLineage`, `evaluateRecheck` o `getLineageNextAction`.
* WHEN se pasa un objeto `contract` con strings u objetos suministrados externamente.
* THEN el runtime MUST requerir `changeRoot` y `mode`.
* AND MUST derivar el `contract_digest` leyendo bytes reales desde la estructura OpenSpec en disco.
* AND MUST NOT confiar en representaciones inline para decisiones de autoridad.

---

## REQ-VL-FINAL-004 — `testing.tdd_mode` MUST Be Sole Runtime Authority

`testing.tdd_mode` MUST ser la única autoridad runtime para la resolución de modo TDD.

### Scenario: complete elimination of legacy strict_tdd parsing

* GIVEN cualquier evaluación de modo TDD en `resolveTddMode()`, `pre-commit-hook.js`, `sdd-apply`, `sdd-verify` o `strict-tdd.md`.
* WHEN se resuelve el modo TDD.
* THEN el runtime MUST NOT consultar `config.strict_tdd`, `config.strictTdd` ni regexes de `strict_tdd: true`.
* AND `scale: team` MUST NOT activar modo Focused si `testing.tdd_mode: standard`.

---

## REQ-VL-FINAL-005 — Remediation Router MUST Precede Full Context Loading

`sdd-apply` MUST resolver remediation mode antes de cargar el contexto completo de normal apply.

### Scenario: remediation fast path

* GIVEN `verify_lineage.status = remediation-pending`.
* WHEN `sdd-apply` inicia.
* THEN MUST leer solo el estado y artifacts mínimos necesarios para:

  * validate Candidate baseline;
  * read frozen findings;
  * inspect allowed paths;
  * execute targeted remediation.
* AND MUST NOT cargar innecesariamente:

  * backlog completo;
  * unrelated specs;
  * unrelated existing code;
  * normal workload forecast.
* AND MUST RETURN después de remediation.

### Scenario: normal path loads full context

* GIVEN no active remediation.
* THEN `sdd-apply` MAY continuar al full normal context.

---

## REQ-VL-FINAL-006 — Apply Resume MUST Prevent Re-execution

El workflow MUST demostrar comportamiento de continuation, no solo presencia de marcadores textuales.

### Scenario: completed task survives restart

* GIVEN session 1 ejecuta Task 1.1 exactamente una vez.
* AND Task 1.1 queda `[x]`.
* AND progress se persiste.
* WHEN un proceso nuevo ejecuta normal `sdd-apply`.
* THEN Task 1.1 MUST NOT ejecutarse otra vez.

### Scenario: partial task resumes appropriately

* GIVEN Task 1.2 está `[~]`.
* WHEN apply continúa.
* THEN el sistema MAY ejecutar únicamente el trabajo/verificación restante.
* AND MUST NOT representar `[~]` como totalmente completed.

---

## REQ-VL-FINAL-007 — Verify Evidence Integrity MUST Reflect Exact HEAD Implementation

El informe de verificación y las afirmaciones de `apply-progress.md` MUST coincidir exactamente con el estado de HEAD.

### Scenario: strict verification of claim accuracy

* GIVEN una afirmación en `apply-progress.md` o en las tareas de que se eliminó `strict_tdd` de un archivo.
* WHEN `sdd-verify` realiza la validación del cambio.
* THEN si HEAD aún contiene el código o propiedad declarada como eliminada, el veredicto MUST ser `FAIL` o reportar la inconsistencia.
* AND `sdd-verify` MUST NOT clasificar la verificación como PASS con evidencia falsa o sobreafirmada.

---

## REQ-VL-FINAL-008 — Corrective MUST Preserve Roadmap Boundary

Este corrective MUST NOT introducir K4a/K4b behavior.

### Forbidden

* ExecutionGraph.
* Graph nodes como mecanismo runtime de este corrective.
* WorkOrder dispatch.
* WorkResult execution receipts.
* budgets de worker.
* worker isolation.
* repair shadow executor.
* Assurance Graph.
* attestation.
* authorization.

### Scenario: final boundary audit

* WHEN corrective termina.
* THEN K4a MUST seguir siendo owner del Execution Graph.
* AND K4b MUST seguir siendo owner de:

```text
WorkOrder
  ↓
WorkResult
  ↓
integration
  ↓
Candidate
```

---

## REQ-VL-FINAL-009 — Roadmap State MUST Be Reconciled Before K4a

Los artefactos de roadmap y lifecycle MUST representar consistentemente el estado de K3 readiness.

### Scenario: archived change has coherent terminal state

* GIVEN `k3-readiness-remediation` está físicamente en `openspec/changes/archive/...`.
* THEN its authoritative lifecycle state MUST no longer report contradictory non-terminal archive state.

### Scenario: K4a eligibility follows reconciled facts

* WHEN K3 readiness y correctives requeridos están archived/terminal.
* THEN roadmap MUST mark K4a consistently as eligible according to roadmap vocabulary.
* AND MUST NOT leave K4a blocked by an already satisfied prerequisite.

---

# Specs: `verify-lineage-candidate-persistence`

## Requirement: Verify Lineage MUST Persist Recoverable Candidate Records {#REQ-verify-lineage-010}

Before a mutable verify-lineage state references a `Candidate/v2`, the system MUST persist the Candidate's canonical bytes in an immutable, content-addressed record and MUST retain a recoverable reference with the lineage. The record MUST be validated before that reference becomes observable. Repeating persistence for byte-identical canonical input MUST be idempotent. This recovery material MUST NOT become a competing identity or authority store; canonical `candidate_id` remains authoritative.

### Scenario: lineage start persists an exact preimage

- GIVEN a valid canonical `Candidate/v2`.
- WHEN `startVerifyLineage` creates a lineage.
- THEN its initial Candidate reference MUST resolve to the exact canonical bytes.
- AND `genesis_candidate_id` and `current_candidate_id` MUST equal the Candidate's canonical `candidate_id`.

### Scenario: repeated persistence is byte-stable

- GIVEN canonical bytes already persisted for a Candidate.
- WHEN the same bytes are persisted again.
- THEN the reference and stored bytes MUST remain byte-equivalent.
- AND no divergent record MAY be created for the same content address.

---

## Requirement: Mutable Transitions MUST Rehydrate and Validate Candidate Evidence {#REQ-verify-lineage-011}

`prepareRemediation` and `recordRemediationAttempt` MUST recover the Candidate referenced by the persisted lineage rather than require an in-memory preimage. Before either transition mutates lineage state, the system MUST recompute the stored-byte digest and canonical `candidate_id`, and MUST require both to match the persisted reference and expected Candidate identity.

### Scenario: remediation resumes in a new process

- GIVEN a lineage and its Candidate record were serialized to disk.
- AND a new process reloads that state with no in-memory Candidate.
- WHEN `prepareRemediation` runs.
- THEN it MUST recover and validate the referenced Candidate.
- AND the same valid state MUST permit the same remediation preparation.

### Scenario: remediation successor survives another restart

- GIVEN a permitted remediation yields a valid successor Candidate.
- WHEN `recordRemediationAttempt` records the successor and the process restarts.
- THEN the successor record MUST be recoverable and double-validated.
- AND the reloaded lineage MUST retain its recorded `current_candidate_id` and next action.

### Scenario: tampered, missing, or divergent material blocks before mutation

- GIVEN a referenced Candidate record is absent, has a mismatched byte digest, or recomputes to a different `candidate_id`.
- WHEN either mutable transition attempts recovery.
- THEN it MUST fail closed with a structured recovery reason.
- AND it MUST NOT advance status, `current_candidate_id`, attempts, findings, or allowed scopes.

---

## Requirement: Legacy ID-Only Lineages MUST Remain Readable but Immutable {#REQ-verify-lineage-012}

Lineages persisted before recoverable Candidate records MUST remain readable without fabricated preimages or history rewrites. A legacy ID-only lineage MUST NOT enter a mutable transition unless exact recoverable Candidate material is independently present and passes the same double validation.

### Scenario: legacy inspection preserves state

- GIVEN a legacy lineage containing only Candidate IDs.
- WHEN it is loaded for inspection or next-action evaluation.
- THEN its historical fields MUST be returned unchanged.
- AND the runtime MUST NOT synthesize Candidate bytes from an ID, paths, or a digest.

### Scenario: legacy remediation is rejected safely

- GIVEN an ID-only legacy lineage without a valid recoverable record.
- WHEN `prepareRemediation` or `recordRemediationAttempt` is requested.
- THEN the request MUST fail closed with a structured legacy-recovery reason.
- AND it MUST NOT consume an attempt or alter findings or scopes.
