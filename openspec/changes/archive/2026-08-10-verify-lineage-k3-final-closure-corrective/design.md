# Design: `verify-lineage-k3-final-closure-corrective`

## 1. Design principle

No crear una nueva capa.

La solución continúa siendo:

```text
Current workflow
   ↓
bounded deterministic guards
```

no:

```text
Current workflow
   ↓
new verify kernel
   ↓
future execution kernel
```

---

## 2. Remediation entry boundary

Crear o consolidar una única función/boundary conceptual:

```text
prepareRemediation(state, currentCandidate)
```

Responsabilidades:

1. validar lineage;
2. exigir `status = remediation-pending`;
3. resolver Candidate actual;
4. comparar contra `state.current_candidate_id`;
5. fail closed si existe drift;
6. devolver frozen findings y allowed scope.

Pseudo-flow:

```text
load state
   ↓
freeze current Candidate
   ↓
candidate_id == current_candidate_id ?
   ├── no → candidate-drift → stop
   └── yes
          ↓
       targeted remediation
```

Ninguna escritura debe ocurrir antes del check.

---

## 3. Remediation delta calculation

No utilizar:

```text
candidateInput.actual_changed_paths
```

como autoridad.

No utilizar:

```text
postCandidate.paths
```

como equivalencia del delta de remediation.

Implementar helper, por ejemplo:

```text
deriveCandidateDeltaPaths(beforeCandidate, afterCandidate, repoContext)
```

La implementación puede apoyarse en Git y en las identidades K3 existentes, pero MUST devolver cambios efectivos entre las dos superficies.

La operación debe preservar:

* additions;
* modifications;
* deletions;
* renames cuando sean representables;
* mode changes;
* symlink changes;
* case-distinct paths.

No necesita convertirse en una nueva identity.

Es un valor derivado para enforcement.

### Flow

```text
Candidate A
   ↓
remediation
   ↓
Candidate B
   ↓
deriveDelta(A,B)
   ↓
delta ⊆ allowed_paths ?
   ├── no → reject
   └── yes → record attempt
```

---

## 4. Contract digest API redesign

Retirar el patrón:

```text
computeContractDigest(arbitraryContractObject)
```

como boundary authority-sensitive.

Separar si fuera necesario:

```text
computeContractDigestFromArtifacts(changeRoot, mode)
```

Esta función:

1. localiza artifacts requeridos;
2. canonicaliza repository-relative paths;
3. lee bytes directamente;
4. SHA-256 de cada artifact;
5. ordena specs;
6. domain-separated final digest.

Conceptualmente:

```text
[
  path + sha256(bytes),
  path + sha256(bytes),
  ...
]
   ↓ canonical sort
sha256("verify-contract-v1\0" + canonicalPayload)
```

No se persiste ningún `ContractSnapshot`.

No se introduce nueva authority.

---

## 5. TDD configuration normalization

### Init/migration

Puede existir:

```text
legacy config
   ↓
migration
testing.tdd_mode
```

### Runtime

Toda resolución queda reducida a:

```js
resolveTddMode(config) {
  return validate(config.testing?.tdd_mode ?? "standard");
}
```

No:

```text
scale
strict_tdd
strictTdd
orchestrator guess
runner presence
```

como selección de modo.

Runner availability puede determinar si el modo puede ejecutarse, pero no cambiar cuál es el modo configurado.

Ejemplo:

```text
configured: strict
runner unavailable
→ strict-unavailable / blocked/deferred according to policy

NOT
→ silently standard
```

---

## 6. `sdd-apply` topology

Reordenar:

```text
Step 1
load shared skills/minimal state

Step 2
Execution Router

   if remediation-pending:
       freeze baseline Candidate
       validate identity
       load frozen findings
       read only allowed affected code
       apply fix
       freeze successor Candidate
       calculate A→B delta
       scope guard
       persist
       RETURN

   else:
       continue normal apply

Step 3
read previous apply-progress

Step 4
load specs/design/code/config

Step 5
workload

Step 6
resolve TDD

Step 7
execute remaining tasks
```

Esto convierte remediation en fast-path de ejecución y de contexto.

---

## 7. Apply continuation test harness

No es necesario introducir un nuevo production scheduler.

Puede crearse un test harness que modele el executor actual y registre invocations.

Ejemplo:

```text
executeTask(id):
  invocationCounter[id]++
```

Test:

```text
run apply session #1
→ task 1.1 invocation = 1
→ persisted [x]

new process/context

run apply session #2
→ task 1.1 invocation remains 1
```

El test debe atravesar el helper/logic real utilizado para decidir pending/completed tasks.

Si actualmente esa decisión vive solo en prompt prose y no existe helper deterministic, debe extraerse únicamente la mínima función reusable necesaria, por ejemplo:

```text
resolveRemainingTasks(tasks, applyProgress)
```

sin construir un execution runtime.

---

## 8. Verify evidence hardening

Los tests del corrective deben etiquetarse según qué prueban realmente.

Ejemplos:

```text
grep/source.includes(...)
→ static-lint

pure parser invocation
→ static-proof/runtime-test según comportamiento

temporary filesystem + function invocation
→ runtime-test

actual restart simulation
→ runtime-test
```

El final verify debe revisar cada MUST contra evidencia real, no contra el título del test.

---

## 9. Roadmap reconciliation

Tras completar el corrective:

1. comprobar estado real de `k3-readiness-remediation`;
2. reconciliar `state.yaml`, archive artifacts y roadmap;
3. comprobar `verify-lineage-k3-final-closure-corrective` terminal;
4. actualizar K4a únicamente según hechos ya cumplidos.

No cambiar arquitectura conceptual del roadmap.

---

## 10. Terminal rule

Incluir explícitamente en design:

```text
After this corrective verifies and archives,
no further bounded-verify redesign is permitted
unless a new BLOCKER demonstrates violation
of an existing invariant.

The next architectural slice is K4a.
```
