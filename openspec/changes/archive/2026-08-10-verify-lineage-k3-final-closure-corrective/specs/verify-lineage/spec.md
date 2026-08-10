# Specs: `verify-lineage-k3-alignment-corrective`

## Requirement: Verify Lineage MUST Use Canonical Candidate Identity

`REQ-VL-K3-001`

`verify_lineage` MUST utilizar como identidad del código el `candidate_id` canónico de `Candidate/v2`.

El sistema MUST NOT mantener una segunda función de identidad semántica basada exclusivamente en `paths`, `diff_hash` u otra representación parcial.

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

## REQ-VL-FINAL-002 — Remediation Scope MUST Derive From Candidate Delta

El conjunto de paths modificados durante remediation MUST derivarse mecánicamente de la diferencia entre:

```text
CandidateBefore
CandidateAfter
```

No puede ser declarado arbitrariamente por el caller.

### Invariant

```text
remediationChangedPaths =
  deltaPaths(CandidateBefore, CandidateAfter)

remediationChangedPaths
  ⊆
union(unresolvedFindings.allowed_paths)
```

### Scenario: pre-existing candidate paths are ignored

* GIVEN Candidate A ya contiene cambios en:

  * `auth.js`
  * `user.js`
  * `config.js`
* AND remediation solo modifica `auth.js`.
* WHEN Candidate B se freezea.
* THEN `remediationChangedPaths` MUST ser únicamente `auth.js`.
* AND `user.js` y `config.js` MUST NOT causar scope violation.

### Scenario: new unauthorized change fails

* GIVEN allowed scope contiene solo `auth.js`.
* AND remediation cambia:

  * `auth.js`
  * `logger.js`
* WHEN se registra el attempt.
* THEN MUST fail with `remediation-scope-violation`.
* AND MUST NOT avanzar a `recheck-pending`.

### Scenario: caller-provided path list cannot bypass scope

* GIVEN el caller declara `actual_changed_paths = ["auth.js"]`.
* BUT el delta real Candidate A → Candidate B incluye `logger.js`.
* WHEN se valida remediation.
* THEN el sistema MUST detectar `logger.js`.
* AND MUST reject the transition.

---

## REQ-VL-FINAL-003 — Contract Fingerprint MUST Be Runtime-Derived From OpenSpec Bytes

Toda operación de lineage MUST calcular `contract_digest` desde artifacts OpenSpec efectivos.

El caller MUST NOT controlar directamente el digest contractual.

### Runtime inputs

La boundary deberá recibir únicamente información necesaria para localizar el change, por ejemplo:

```text
changeRoot
mode
```

o equivalente determinista.

El runtime MUST resolver:

```text
standard:
  proposal.md
  specs/**/*.md aplicables
  design.md
  tasks.md

lite:
  proposal-lite.md
  tasks.md
```

según el contrato vigente del workflow.

### Scenario: same path, modified bytes

* GIVEN `design.md` mantiene el mismo path.
* WHEN cambia un byte.
* THEN `contract_digest` MUST cambiar.

### Scenario: forged digest ignored/rejected

* GIVEN el caller intenta proporcionar:

```json
{
  "path": "design.md",
  "digest": "sha256:..."
}
```

* WHEN se evalúa contract identity.
* THEN el runtime MUST recomputar el digest desde bytes.
* OR MUST reject external digest input.
* AND MUST NOT confiar en el digest declarado.

### Scenario: unreadable required artifact fails closed

* GIVEN un artifact obligatorio.
* AND runtime no puede leerlo.
* WHEN lineage necesita contract identity.
* THEN MUST fail closed.
* AND MUST NOT sustituirlo por empty string, path literal o digest supplied externally.

### Scenario: inline prose is not artifact bytes

* GIVEN `design: "design.md"` sin filesystem resolution válido.
* THEN `"design.md"` MUST NOT interpretarse como contenido contractual.

---

## REQ-VL-FINAL-004 — `testing.tdd_mode` MUST Be Sole Runtime Authority

La única autoridad runtime para seleccionar TDD es:

```yaml
testing:
  tdd_mode: standard | focused | strict
```

### Scenario: team + standard remains standard

* GIVEN:

```yaml
scale: team
testing:
  tdd_mode: standard
```

* WHEN apply resuelve el modo.
* THEN MUST resolve `standard`.
* AND MUST NOT cargar `focused-tdd.md`.

### Scenario: strict_tdd cannot override runtime

* GIVEN:

```yaml
testing:
  tdd_mode: standard
strict_tdd: true
```

* WHEN runtime resuelve TDD.
* THEN MUST resolve `standard`.

### Scenario: migration converts legacy once

* GIVEN config legacy:

```yaml
strict_tdd: true
```

* WHEN init/migration se ejecuta.
* THEN MUST materializar:

```yaml
testing:
  tdd_mode: strict
```

* AND SHOULD remove/deprecate `strict_tdd`.
* AFTER migration runtime MUST NOT consultar `strict_tdd`.

### Scenario: scale only derives init default

* GIVEN `scale: team`.
* AND `testing.tdd_mode` aún no existe durante init.
* WHEN init genera config.
* THEN MAY choose `focused`.
* AFTER persistence `scale` MUST NOT participar en runtime mode resolution.

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

## REQ-VL-FINAL-007 — Verify Evidence Classification MUST Match Tested Behavior

Un test estructural no puede satisfacer un runtime requirement.

### Scenario: textual fixture is not runtime resume evidence

* GIVEN un test únicamente comprueba que una string contiene `[x]`.
* WHEN se evalúa REQ-VL-FINAL-006.
* THEN evidence level MUST NOT ser `runtime-test`.

### Scenario: runtime transition requires invocation evidence

* GIVEN un MUST habla de:

  * reducer transition;
  * Candidate drift;
  * filesystem bytes;
  * resume execution;
  * path enforcement.
* THEN el test MUST invocar el runtime/helper efectivo y observar el resultado correspondiente.

### Scenario: verify report cannot overclaim

* GIVEN evidence real inferior al requirement.
* THEN verify MUST downgrade evidence or fail the scenario.
* AND MUST NOT declarar cumplimiento por descripción textual del test.

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
