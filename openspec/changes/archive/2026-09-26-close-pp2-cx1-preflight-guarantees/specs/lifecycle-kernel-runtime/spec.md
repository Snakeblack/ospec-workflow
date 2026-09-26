# Delta for lifecycle-kernel-runtime

## MODIFIED Requirements

### Requirement: CAS and Replay Determinism for Phase State Projection {#REQ-lifecycle-kernel-029}

State projections produced by `PhaseCompletionReducer` and committed to durable storage MUST enforce Compare-And-Swap (CAS) revision matching under advisory file locking (`withFileLock`). Replaying an identical phase completion payload against an already projected state MUST be idempotent: the kernel runtime MUST detect the replay through payload hashing or journal matching and return the converged state without advancing revision counters or duplicating journal records.

When a durable state record stores a payload hash produced by the v2.67.0–v2.67.3 frozen-key-order serialization of an already committed completion payload, the runtime MUST treat a replay of that same payload as a zero-delta idempotent convergence in both Node and Go only when the envelope's key order matches the frozen contract: `schema_version` first on the top-level envelope, with nested `question_gate` / question / option key orders already pinned by that contract. Recognition of that historical hash form MUST NOT bump `revision`, MUST NOT re-apply state mutations, and MUST NOT append duplicate journal records. The runtime MUST also continue to recognize the current canonical payload hash as an identical zero-delta replay.

A payload that is semantically equal to a prior completion but whose insertion/key order differs from the frozen v2.67.0–v2.67.3 contract MUST NOT be promised as a legacy noop solely by that semantic equality; its hash MUST NOT match the frozen legacy digest unless the frozen order is used. The runtime MUST NOT require preserving original JSON bytes of historical envelopes. A payload whose stored hash matches neither the current canonical form nor the frozen v2.67.0–v2.67.3 key-order form MUST NOT be treated as that prior completion's replay solely on hash equality.

(Previously: Accepted any v2.67.0–v2.67.3 insertion-order `JSON.stringify` hash as a zero-delta noop without limiting the promise to the frozen key order, so a semantically equal envelope with a different insertion order could be treated as compatibility.)

#### Scenario: Concurrent projection conflict triggers CAS conflict rejection

- GIVEN a projection commit attempt with expected revision R
- WHEN storage head revision has advanced to R+1 due to a concurrent write
- THEN the commit MUST fail closed with a CAS conflict
- AND authoritative state MUST remain unchanged

#### Scenario: Replaying identical phase completion payload produces zero-delta idempotent convergence

- GIVEN a change state that already committed completion payload P under the current canonical hash
- WHEN the runtime reconciles or replays payload P
- THEN the runtime MUST recognize the completed operation
- AND MUST NOT re-execute state mutations or append duplicate journal records
- AND MUST NOT advance `revision`

#### Scenario: v2.67 frozen-key-order hash replay is a zero-delta noop in Node and Go

- GIVEN durable state that already committed completion payload P with a stored hash from the v2.67.0–v2.67.3 frozen-key-order form (`schema_version` first; nested `question_gate`/question/option orders pinned)
- WHEN the Node runtime and the Go runtime each reconcile or replay the same payload P in that frozen key order
- THEN both runtimes MUST recognize the completed operation as a zero-delta replay
- AND MUST NOT bump `revision`, re-apply mutations, or append duplicate journal records

#### Scenario: Semantically equal envelope with different key order is not a promised legacy noop

- GIVEN durable state that records the frozen v2.67.0–v2.67.3 key-order hash for payload P
- AND a semantically equal envelope P′ whose top-level or nested key insertion order differs from that frozen contract
- WHEN the runtime evaluates P′ for legacy noop recognition
- THEN it MUST NOT treat P′ as a promised v2.67 legacy zero-delta replay solely because it is semantically equal to P
- AND MUST NOT require that original historical JSON bytes of P be preserved

#### Scenario: Unrelated payload hash is not treated as prior completion replay

- GIVEN durable state that records a completion hash for payload P
- AND a distinct completion payload Q whose hash matches neither the current canonical hash of P nor the frozen v2.67.0–v2.67.3 key-order hash of P
- WHEN the runtime evaluates Q against that stored record
- THEN it MUST NOT treat Q as an idempotent replay of P solely by hash equality

#### Scenario: Recovery from interrupted write restores valid state without corruption

- GIVEN an interrupted write during state projection
- WHEN the runtime initializes or re-executes projection
- THEN it MUST recover from backup (`.bak`) or journal state safely
- AND MUST restore a consistent, non-corrupted state
