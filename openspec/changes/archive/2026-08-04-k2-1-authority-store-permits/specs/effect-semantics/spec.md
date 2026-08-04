# effect-semantics Specification

## Purpose

Require every effect intent to declare an explicit effect class and bind shell
retry policy so ambiguous irreversible outcomes never blind-retry, and so false
exactly-once guarantees are not claimed over external I/O.

## Requirements

### Requirement: Every Effect Declares A Class {#REQ-effect-semantics-001}

Every effect intent emitted by the lifecycle reducer MUST declare exactly one
class from `{pure, idempotent-keyed, probeable, compensatable, irreversible}`.
An effect intent without a class, or with an unknown class, MUST fail closed
before shell execution.

#### Scenario: Classified effect is accepted

- GIVEN a reducer action that emits an effect intent with class `idempotent-keyed`
- WHEN the imperative shell prepares execution
- THEN the effect MUST be accepted for class-governed handling

#### Scenario: Missing class fails closed

- GIVEN an effect intent with no effect class
- WHEN the shell attempts execution
- THEN execution MUST be rejected with a stable reason code
- AND no external side effect MUST occur

### Requirement: Class Governs Retry Policy {#REQ-effect-semantics-002}

Shell retry and reconciliation MUST follow the declared class:

| Class | Retry / reconcile rule |
| --- | --- |
| `pure` | Safe to re-evaluate; no external mutation |
| `idempotent-keyed` | Retry only with the same idempotency key |
| `probeable` | MAY probe before mutate; MUST NOT invent success |
| `compensatable` | MAY compensate on confirmed failure per policy |
| `irreversible` | MUST NOT blind-retry on ambiguous outcome |

The runtime MUST NOT promise exactly-once delivery over shell, Git, network APIs,
or other external I/O.

#### Scenario: Idempotent-keyed retry uses same key

- GIVEN an effect classed `idempotent-keyed` interrupted before completion
- WHEN reconciliation retries
- THEN it MUST reuse the same effect idempotency key
- AND MUST NOT mint a distinct key for the same logical effect

#### Scenario: No false exactly-once over external I/O

- GIVEN an effect that targets shell, Git, or an external API
- WHEN documentation or runtime claims are inspected
- THEN the runtime MUST NOT claim exactly-once completion for that effect
- AND MUST rely on the declared class policy instead

### Requirement: Ambiguous Irreversible Forces Decide Or Stop {#REQ-effect-semantics-003}

When an `irreversible` effect yields an ambiguous outcome (unknown success,
unknown failure, or unverifiable external state), the runtime MUST select
`decide` or `stop`. It MUST NOT automatically retry the same irreversible
effect. Ambiguity MUST NOT be relabeled as a code defect solely to justify retry.

#### Scenario: Ambiguous irreversible stops blind retry

- GIVEN an irreversible effect whose outcome is ambiguous
- WHEN the shell evaluates the next transition
- THEN the selected kind MUST be `decide` or `stop`
- AND the same irreversible effect MUST NOT auto-retry

#### Scenario: Ambiguity is not auto-classified as code defect

- GIVEN an ambiguous irreversible outcome
- WHEN diagnostics are emitted
- THEN the runtime MUST NOT rewrite the outcome as a definite code defect
  solely to enable retry
- AND MUST surface ambiguity for human or policy decision

### Requirement: Mutations Require Class Plus Permit Plus CAS {#REQ-effect-semantics-004}

Any adapter or shell path that mutates authoritative state or external durable
effects MUST present a valid OperationPermit, perform Authority Store CAS, and
carry an effect class. Direct-write adapters that bypass permit, CAS, or class
MUST be blocked.

#### Scenario: Direct-write adapter is blocked

- GIVEN an adapter that writes authoritative state or durable effects without
  permit, CAS, or effect class
- WHEN the authorize or shell boundary is exercised
- THEN the write MUST be rejected
- AND no authoritative head MUST advance

#### Scenario: Compliant mutation path succeeds

- GIVEN a valid unused OperationPermit matching head revision
- AND an effect intent with an explicit class
- WHEN compareAndSwap commits the authorized next state
- THEN the mutation MUST be accepted
- AND an OperationReceipt MUST be recordable on mechanical completion
