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

---

# Specs: `modernize-installer-model-selection`

## Requirement: Irrecoverable Candidate Recovery Requires an Audited Terminal Successor {#REQ-verify-lineage-013}

Una `verify_lineage` activa MAY terminar con `status: superseded` y
`terminal_reason: candidate-recovery-irrecoverable` únicamente cuando existan
aprobaciones explícitas de `new-scope` y `architecture`, y un registro inmutable
`candidate-recovery-audit/v1`. El registro MUST vincular `lineage_id`,
`current_candidate_id` y `content_digest`, enumerar cada fuente aplicable de
recuperación (registro persistido, change root, objetos/referencias Git,
reflog/stash/worktrees y toda fuente externa autorizada), y conservar para cada
una la búsqueda acotada, su digest de evidencia y un resultado estructurado.
La reconciliación MUST demostrar que no existen bytes canónicos ni snapshot/tree
OID resoluble; cualquier fuente `unknown` o no intentada MUST impedir la
transición. Una afirmación narrativa o un digest de identidad por sí solo NO
constituye prueba de irrecuperabilidad.

La transición MUST conservar sin cambios `findings` (incluidos V001–V004), sus
recetas, `allowed_paths`, `remediation_attempts`, `max_remediation_attempts`,
`late_observations` y la historia previa; MAY añadir únicamente la auditoría y
los campos terminales. MUST NOT borrar el Candidate, reescribir su identidad ni
marcarlo como equivalente a otro Candidate.

### Scenario: exhaustive audit permits terminalization

- GIVEN una lineage activa cuyo Candidate A conserva solo una referencia no resoluble
- AND las aprobaciones `new-scope` y `architecture` autorizan este protocolo
- AND la auditoría verifica todas las fuentes aplicables sin bytes ni tree snapshot recuperable
- WHEN se registra la terminación por recuperación irrecuperable
- THEN la lineage MUST quedar `superseded` con el reason code estructurado
- AND V001–V004, intentos, presupuesto y evidencia histórica MUST permanecer idénticos

### Scenario: incomplete audit remains blocked

- GIVEN una lineage activa con aprobación ausente, fuente no inspeccionada o resultado `unknown`
- WHEN se solicita la terminación por recuperación irrecuperable
- THEN la operación MUST fallar cerrada sin cambiar la lineage
- AND MUST NOT crear una sucesora ni consumir intentos

---

## Requirement: Successor Lineage Must Be Snapshot-Bound and Recheck-Directed {#REQ-verify-lineage-014}

Una sucesora MAY crearse solo desde una lineage terminalizada bajo
`REQ-verify-lineage-013` y con un Candidate B nuevo, válido y canónico. B MUST
persistir sus bytes exactos, `content_digest` y evidencia de árbol que contenga
OIDs Git base y candidato resolubles y validados, o snapshots de árbol completos
con digest de contenido verificable cuando Git no aplique. Los campos `sha256`
del Candidate por sí solos NO son un tree OID. La sucesora MUST tener un
`lineage_id` nuevo, `generation` incrementada, `predecessor_id` igual al
`lineage_id` terminal y Candidate B como `genesis_candidate_id` y
`current_candidate_id`; MUST NOT afirmar equivalencia ni inventar un
`Candidate.predecessor_id` para A. Debe copiar literalmente findings, recetas,
scopes, `remediation_attempts` y `max_remediation_attempts`, sin reset ni
incremento implícito, y comenzar en `recheck-pending`.

El recheck de la sucesora MUST validar B, el snapshot y el `contract_digest`, y
ejecutar exactamente una vez las recetas congeladas de V001–V004. MUST ser
dirigido por esas recetas, no por Full Discovery ni por resultados suministrados
como autoridad. Si todas pasan, MUST cerrar la sucesora con B como verificado;
si alguna falla, MUST conservarla sin resolver y elegir remediation o exhaustion
según el presupuesto ya consumido. Observaciones no causales MAY registrarse como
seguimiento no bloqueante.

### Scenario: verified successor recheck closes safely

- GIVEN A fue terminalizada con auditoría válida y B tiene bytes y árboles verificables
- WHEN se crea la sucesora y el recheck ejecuta las recetas congeladas
- THEN la sucesora MUST conservar el enlace a A y cerrar solo si todas las recetas pasan
- AND `verified_candidate_id` MUST igualar B sin alterar el historial de A

### Scenario: unverifiable successor is rejected

- GIVEN B carece de bytes exactos, snapshot/tree OID verificable o identidad canónica
- WHEN se intenta crear la sucesora o iniciar su recheck
- THEN MUST fallar cerrado sin cambiar A, findings, intentos ni presupuesto

### Scenario: failed directed recheck preserves budget

- GIVEN una sucesora conserva `remediation_attempts = n` y una receta congelada falla
- WHEN termina el recheck dirigido
- THEN la finding MUST permanecer `unresolved`
- AND el siguiente estado MUST ser `remediation-pending` si `n < max_remediation_attempts`, o `exhausted` en caso contrario
- AND `n` y el límite MUST permanecer sin reinicio

---

## Requirement: Inconclusive Directed Operations MUST Be Terminally Preserved {#REQ-verify-lineage-015}

Una operación persistida de tipo `directed-recheck-command` que no tenga un
completion blob válido MUST quedar marcada una sola vez con un resultado terminal
`non-reconcilable` y `preserved: true`. La marca terminal MUST conservar el
registro pendiente original, sus digests y toda evidencia ya publicada sin
mutarlos; MUST NOT promoverse desde prosa, booleanos o resultados inline, ni
alterar la lineage, findings, recetas, paths, contadores o presupuesto.

### Scenario: pending operations are preserved without replay

- GIVEN seis operaciones `directed-recheck-command` están `pending` y ninguna tiene completion blob
- WHEN se reconcilia el bloqueo
- THEN cada operación MUST recibir exactamente una marca terminal `non-reconcilable`
- AND sus registros y digests originales MUST permanecer byte-equivalentes
- AND MUST ejecutarse cero comandos y MUST ocurrir cero promoción de resultados

### Scenario: unknown or tampered completion remains terminal

- GIVEN una operación `pending` o `unknown` tiene un completion ausente, ilegible o con digest que no coincide
- WHEN se solicita evaluar o reconciliar esa operación
- THEN MUST quedar preservada con un reason code estructurado y sin evaluación
- AND la lineage MUST conservar identidad, findings, intentos y presupuesto sin cambios

---

## Requirement: Reconciliation Successor MUST Be Audited and Fresh {#REQ-verify-lineage-016}

Una sucesora de reconciliación MUST crearse únicamente desde la lineage actual
con operaciones inconclusas ya preservadas terminalmente, una auditoría válida y
referencias de aprobación persistidas. MUST tener un `lineage_id` nuevo,
`generation` igual a la del predecessor más uno, `predecessor_id` enlazado al
`lineage_id` anterior y referencias audit/approval verificables. MUST heredar
literalmente findings, validation recipes, `allowed_paths`, observaciones,
`remediation_attempts`, `max_remediation_attempts` y todo el presupuesto
restante. MUST usar un journal nuevo, sin reutilizar operaciones o completion
blobs del predecessor, y comenzar en `recheck-pending`.

### Scenario: authorized successor starts a fresh recheck

- GIVEN la lineage actual conserva las seis operaciones terminales preservadas
- AND la auditoría y las aprobaciones autorizan la reconciliación
- WHEN se crea la sucesora
- THEN MUST observarse una identidad nueva, `generation` incrementada y `predecessor_id` exacto
- AND todos los campos heredados MUST ser literalmente iguales a los del predecessor
- AND el journal MUST ser nuevo y el estado MUST ser `recheck-pending`

### Scenario: incomplete or tampered authorization cannot create a successor

- GIVEN falta una aprobación/auditoría aplicable o su evidencia está ausente o alterada
- WHEN se solicita crear la sucesora
- THEN la operación MUST fallar cerrada sin crear identidad, journal ni recheck nuevos
- AND la lineage actual MUST permanecer sin mutaciones

---

## Requirement: Directed Recheck Runner MUST Persist Completion Before Evaluation and MUST NOT Replay {#REQ-verify-lineage-017}

El runner MUST publicar y validar el completion de una operación nueva antes de
que cualquier reducción o transición consuma su resultado. Una operación
persistida en estado `pending`, `unknown` o `completed` MUST NOT volver a
invocarse; `pending` y `unknown` requieren reconciliación y `completed` debe
reutilizar únicamente su resultado persistido. Solo una operación nueva del
journal de la sucesora MAY ejecutarse una vez.

### Scenario: completion precedes result evaluation

- GIVEN una receta esperada tiene una operación nueva en el journal de la sucesora
- WHEN el runner obtiene su resultado
- THEN MUST persistir y validar el completion blob antes de reducir o cerrar la finding
- AND un fallo posterior de evaluación MUST conservar ese completion para reconciliación

### Scenario: restart does not replay pending, unknown, or completed work

- GIVEN un reinicio encuentra operaciones `pending`, `unknown` y `completed`
- WHEN el runner reanuda el recheck
- THEN MUST invocar cero comandos para esas operaciones
- AND MUST devolver el estado persistido o requerir reconciliación sin aceptar una justificación narrativa

---

## Requirement: Recheck Results MUST Reduce by Finding and Close Only With Complete Recipe Coverage {#REQ-verify-lineage-018}

El recheck MUST reducir resultados mediante la identidad de finding y de cada
receta congelada, manteniendo separadas recetas con comandos iguales. Una
finding solo puede considerarse pasada cuando todas sus recetas esperadas tienen
completion validado y resultado satisfactorio; la sucesora solo puede cerrarse
cuando todas las recetas esperadas de todas las findings pasan. Resultados
faltantes, `pending`, `unknown`, tampered o suministrados desde fuera MUST
permanecer no satisfactorios.

### Scenario: all expected recipes close the successor

- GIVEN cada finding congelada tiene completion válido para cada receta esperada
- AND todos los resultados reducidos por finding son satisfactorios
- WHEN finaliza el recheck dirigido
- THEN la sucesora MUST cerrarse como verificada con el Candidate esperado
- AND MUST conservar los resultados separados aunque compartan el mismo comando

### Scenario: partial failure keeps only affected findings unresolved

- GIVEN algunas recetas pasan y una receta de una finding falla o carece de completion válido
- WHEN se reduce el recheck
- THEN esa finding MUST permanecer `unresolved` y la sucesora MUST NOT cerrarse
- AND los resultados válidos de otras findings MUST conservarse como evidencia no bloqueante

### Scenario: failure preserves the consumed budget

- GIVEN `remediation_attempts = n` y una o más recetas esperadas no pasan
- WHEN termina el recheck parcial
- THEN el siguiente estado MUST ser `remediation-pending` si `n < max_remediation_attempts`, o `exhausted` si `n >= max_remediation_attempts`
- AND `n`, `max_remediation_attempts`, findings, recipes y presupuesto restante MUST permanecer literalmente sin reinicio
