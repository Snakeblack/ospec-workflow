# Design: `verify-lineage-k3-alignment-corrective`

## 1. Architectural Principle

El corrective usa las primitives existentes:

```text
OpenSpec ──────┐
               ├── Bounded Verify Lineage
Candidate/v2 ──┘
```

No crea equivalents propios.

### Authority

```text
Semantic authority:
  OpenSpec + Git

Canonical code identity:
  Candidate/v2.candidate_id

Bounded workflow state:
  verify_lineage

Derived non-authority values:
  contract_digest
  remediation path delta
```

---

## 2. Candidate Identity Integration

Eliminar `computeCandidateDigest()` como generador de una segunda identidad semántica.

La boundary de verify MUST recibir/resolver un Candidate v2 canónico y utilizar:

```text
candidate.candidate_id
```

Antes de utilizarlo MUST cumplirse:

```text
validate Candidate/v2
AND
candidate.candidate_id == computeCandidateId(candidate)
```

`verify_lineage` conserva:

```yaml
genesis_candidate_id:
current_candidate_id:
verified_candidate_id:
```

pero todos contienen CandidateId canónicos K3.

---

## 3. Lineage State Machine

La FSM permanece pequeña:

```text
NO LINEAGE
   ↓
DISCOVERY
   ↓ blockers
remediation-pending
   ↓ successful bounded remediation
recheck-pending
   ↓
 ┌───────────────┬─────────────────┐
 │               │                 │
PASS         FAIL + budget     identity drift
 │               │                 │
closed    remediation-pending   superseded
                 │
         max attempts reached
                 ↓
             exhausted
```

### Global precondition

Antes de devolver una acción ejecutable desde:

* `remediation-pending`
* `recheck-pending`
* `closed`

el reducer/controller MUST comparar el Candidate observado con el Candidate esperado por el estado.

Una mismatch nunca se interpreta como una continuation normal.

---

## 4. Contract Fingerprint

No se crea `ContractSnapshot` como artifact persistido ni nueva schema pública.

Se implementa una helper pura, por ejemplo:

```text
computeVerifyContractDigest(rootDir, artifactManifest)
```

que:

1. resuelve paths repository-relative;
2. rechaza escape del repository;
3. lee bytes;
4. calcula SHA-256 por archivo;
5. ordena las entradas;
6. calcula el digest final domain-separated.

Ejemplo conceptual:

```json
{
  "proposal": {
    "path": ".../proposal.md",
    "digest": "sha256:..."
  },
  "specs": [
    {
      "path": ".../specs/a/spec.md",
      "digest": "sha256:..."
    }
  ],
  "design": {
    "path": ".../design.md",
    "digest": "sha256:..."
  },
  "tasks": {
    "path": ".../tasks.md",
    "digest": "sha256:..."
  }
}
```

Este objeto puede existir in-memory.

No necesita convertirse en una quinta identidad del roadmap.

---

## 5. Remediation Scope Guard

El remediation pipeline:

```text
lineage remediation-pending
       ↓
capture Candidate A
       ↓
apply frozen findings
       ↓
freeze Candidate B
       ↓
derive actual changed paths A→B
       ↓
validate subset of allowed_paths
       ↓
recordRemediationAttempt(A→B)
```

Si hay violation:

```text
do not transition
do not recheck
report structured blocker
```

No se introduce WorkOrder.

---

## 6. Validation Recipe Contract

`startVerifyLineage()` deja de aplicar:

```text
validation command ?? npm test
```

Una finding bloqueante solo entra en bounded remediation si existe una recipe focal válida.

Shape mínimo:

```yaml
validation:
  commands:
    - command
  expected_exit: 0
  test_files:
    - optional/test/path
```

No se exige que el reducer ejecute los comandos.

El executor actual continúa siendo responsable de la ejecución hasta que los slices de ejecución/evidence posteriores sustituyan esa frontera.

---

## 7. Apply Routing

Reordenar `sdd-apply`:

```text
1. retrieve canonical state

2. execution router
   ├─ remediation-pending
   │    → remediation pipeline
   │    → RETURN
   │
   └─ normal apply
        ↓

3. read previous apply-progress
4. read contract/context
5. workload
6. resolve TDD
7. implement pending tasks
8. persist
```

De este modo remediation no paga el coste de cargar y razonar sobre todo el backlog normal.

---

## 8. Canonical TDD Resolver

Introducir una única helper conceptual:

```text
resolveTddMode(config)
```

Regla runtime:

```text
testing.tdd_mode exists
→ use exactly that value
```

`scale` solo sirve durante init para elegir el default inicial.

`strict_tdd` solo sirve durante migración:

```text
legacy strict_tdd
       ↓ init/migration
testing.tdd_mode
       ↓
legacy no longer authoritative
```

Apply, verify y hooks deben consumir la misma decisión.

---

## 9. Persistence and Recovery

Persisted state MUST ser suficiente para reconstruir la siguiente acción sin conversation memory.

Tests deben simular:

```text
state persisted
process exits
new process
load state
resolve Candidate
getNextAction()
```

para cada estado de la FSM.

No se introduce un segundo store.

`state.yaml` continúa siendo la representación OpenSpec del workflow actual.

---

## 10. Explicit Roadmap Boundary

El design MUST contener una cláusula de no-expansion:

```text
This corrective terminates at deterministic bounded-workflow guards.

It MUST NOT implement:
Execution Graph,
WorkOrder/WorkResult execution,
budgets,
worker isolation,
shadow repair runtime,
Assurance Graph,
Attestation,
Authorization.
```

Esto debe estar también cubierto por un test/contract estructural de no-K4a.
