# Change Proposal: `verify-lineage-k3-final-closure-corrective`

## Summary

Cerrar las garantías que quedaron incompletas en v2.43.2 dentro del flujo bounded `verify → remediation → targeted recheck`, sin introducir primitives, autoridades ni comportamiento perteneciente a K4a o posteriores.

El corrective corrige cinco fronteras concretas:

1. Candidate drift antes de iniciar remediation.
2. Scope de remediation calculado desde el delta real entre Candidates.
3. Contract fingerprint derivado exclusivamente de bytes OpenSpec leídos por runtime.
4. `testing.tdd_mode` como única autoridad TDD runtime.
5. Fast-path y resume de `sdd-apply` demostrados mediante comportamiento real, no mediante assertions estructurales.

Al finalizar este change, Bounded Verify Lineage se considera cerrado como mecanismo transitorio/current-workflow y cualquier evolución adicional deberá ocurrir a través del roadmap K4a → K5 → K6a → K4b → K6b.

## Context

v2.43.2 corrigió correctamente varias debilidades previas:

* `verify_lineage` reutiliza `Candidate/v2.candidate_id`;
* desaparece `verify-candidate-v1`;
* recheck detecta candidate drift;
* blocker findings requieren validation recipe explícita;
* el FSM conserva límite de dos remediations;
* no se adelantaron WorkOrder, WorkResult, Execution Graph ni Assurance primitives.

Sin embargo, varias garantías declaradas por el corrective anterior siguen siendo incompletas.

### Candidate drift pre-remediation

`recordRemediationAttempt()` solo valida el Candidate previo cuando el caller proporciona opcionalmente `baseline_candidate`.

El flujo `sdd-apply` no exige ese Candidate baseline antes de editar.

Por tanto puede existir:

```text
Candidate A
  ↓
verify discovery
  ↓
remediation-pending(A)
  ↓
workspace cambia a B
  ↓
remediation ejecutada sobre B
  ↓
Candidate C
  ↓
recheck-pending(C)
```

sin demostrar que la remediation empezó realmente sobre A.

---

### Remediation scope

El guard actual puede consumir:

```text
actual_changed_paths
```

proporcionado por el caller o caer a:

```text
postCandidate.paths
```

Ninguno representa necesariamente:

```text
delta(CandidateBefore, CandidateAfter)
```

Por tanto el requisito de scope todavía no está ligado mecánicamente a la operación de remediation concreta.

---

### Contract fingerprint

`computeContractDigest()` permite varias representaciones:

* bytes/content inline;
* paths;
* digests declarados;
* strings interpretables como contenido.

Esto deja al caller demasiado control sobre qué identidad contractual se evalúa.

Una operación authority-sensitive debe derivar el fingerprint directamente de los artefactos OpenSpec efectivos del change.

---

### TDD authority

Aunque existe `resolveTddMode()`, todavía sobreviven decisiones runtime basadas en:

* `strict_tdd`;
* `scale: team`;
* señales legacy del orchestrator/config.

La política pretendida es más simple:

```text
runtime authority = testing.tdd_mode
```

`scale` solo puede elegir el valor inicial durante init.

`strict_tdd` solo puede existir como input de migración.

---

### Fast path / resume evidence

`sdd-apply` todavía lee parte del contexto completo antes de comprobar remediation mode.

Además, algunos tests anteriores prueban contenido textual de `apply-progress.md`, pero no prueban que una tarea completada no vuelva realmente a ejecutarse después de un restart.

## Goal

Conseguir las siguientes invariants:

```text
1. No remediation sin Candidate baseline exacto.
2. Scope = delta real Candidate A → Candidate B.
3. Contract digest = bytes reales OpenSpec leídos por runtime.
4. TDD runtime authority = testing.tdd_mode exclusivamente.
5. Remediation router ocurre antes de full-context loading.
6. Completed apply tasks no se ejecutan otra vez después de restart.
7. Verify evidence no puede declarar PASS basándose en un test estructural
   cuando el requirement exige comportamiento runtime.
```

## Non-goals

Este change MUST NOT implementar:

* Execution Graph;
* Obligation Manifest;
* WorkOrder runtime;
* WorkResult runtime;
* worker scheduler;
* kernel budgets;
* recovery authority de K5;
* isolation/capsules;
* Repair Shadow Execution;
* Assurance Graph;
* provenance runtime de K6b;
* Candidate Evaluation Attestation;
* Delivery Authorization;
* un nuevo Authority Store;
* un nuevo Verify Runtime.

No se pretende perfeccionar indefinidamente `verify_lineage`.

Se pretende cerrarlo suficientemente para continuar con K4a.

## Roadmap Impact

El corrective no cambia la secuencia:

```text
K3
 ↓
verify-lineage-k3-final-closure-corrective
 ↓
K4a
 ↓
K5
 ↓
K6a
 ↓
K4b
 ↓
K6b+
```

Al completar este change:

```text
Bounded Verify Lineage
= frozen compatibility/current-workflow mechanism
```

y NO:

```text
Bounded Verify Lineage
= future execution architecture
```

No debe abrirse otro corrective equivalente salvo defecto crítico demostrado.
