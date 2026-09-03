# Design: K6d Complexity and Architecture Delta

## Technical Approach

K6d will be an additive, read-only CommonJS library under
`scripts/lib/complexity-architecture-delta/`. It accepts a canonical frozen
`Candidate v2`, nine pre-digested structural inventories, and assessed
alternatives. The core validates and normalizes those inputs, computes set
deltas, emits advisory questions, validates the resulting contracts, and only
then calculates content-addressed identities and canonical UTF-8 bytes.

The inventories are the host-independence boundary. Each observed inventory
contains stable `{ id, digest }` records for base and Candidate; producers resolve
language- or host-specific facts before calling K6d. An unavailable inventory
contains a non-empty reason and no synthetic empty set. K6d therefore compares
canonical facts without becoming another source scanner or absorbing CX0
telemetry.

## Architecture Decisions

### Decision: Analyze canonical inventories rather than live repository state

**Choice**: Require one `observed` or `unavailable` input for each of `modules`,
`interfaces`, `dependencies`, `configuration`, `states`, `compatibility`,
`duplication`, `dead_code`, and `public_api`. Observed records are uniquely keyed,
digest-bound, and sorted during normalization.

**Alternatives considered**: Walk the filesystem inside K6d; accept host-specific
AST objects; accept numeric totals only.

**Rationale**: Live scans and ASTs make identity tool-dependent, while totals
cannot identify additions, removals, or changes. Canonical inventories retain
reviewable facts and permit explicit unavailability.

### Decision: Publish two closed additive v1 contract families

**Choice**: Add `architecture-alternative/v1` and
`complexity-architecture-delta/v1`. Alternatives are independently
Candidate-bound and content-addressed; the report embeds their canonical records,
the nine deltas, and advisory signals. Both schemas use only the constrained
validator's supported Draft 2020-12 subset.

**Alternatives considered**: One unversioned envelope; reuse `evidence/v2` or
`verification/v2`; publish only a report schema with free-form alternatives.

**Rationale**: Separate closed kinds allow consumers to pin a stable contract,
validate alternatives independently, and reject cross-family substitution without
changing the frozen K1/K6b families.

### Decision: Keep facts, heuristics, and authority mechanically separate

**Choice**: `analyzer.js` computes facts only; `advisory.js` maps canonical facts
and every `new-abstraction` assessment to structured questions with
`authority: "advisory"`; `index.js` exposes an unconditional authority-misuse
rejection. No lifecycle, review, attestation, promotion, delivery, or CX0 module is
imported.

**Alternatives considered**: Return an approve/reject recommendation; wire K6d
into the verifier verdict; gate reports on CX0 coverage.

**Rationale**: A code boundary and closed signal vocabulary prevent heuristic
output from silently acquiring authority and preserve K7-K9 as later slices.

## Data Flow

```text
Candidate v2 ───────┐
                    ├─ integrity/normalization ── canonical_input_id
9 inventories ─────┤                              │
                    │                              v
alternatives ───────┘                         analyzer.js
                                                   │ facts
                                                   v
                                             advisory.js
                                                   │
                                                   v
                                      schema + binding validation
                                                   │
                                                   v
                                  report_id + stableSerialize(report)
```

`createDeltaReport(input)` first validates Candidate schema and recomputed
Candidate identity through `execution-identities`. It rejects duplicate inventory
IDs, malformed digests, missing dimensions, and incomplete alternatives. It sorts
inventories and alternatives, hashes the normalized input with domain
`complexity-architecture-input:v1`, derives deltas, generates signals, validates
the complete report, hashes the body with domain
`complexity-architecture-delta:v1`, and returns `{ ok, report, bytes }`.

`validateDeltaReport(report, { candidate, canonicalInput? })` always checks the
closed schema, recomputed report and alternative IDs, and exact Candidate binding.
When canonical input is supplied it also recomputes `canonical_input_id`. Failures
return `{ ok: false, reason_code, error }`; they never return a partial report.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/complexity-architecture-delta/integrity.js` | Create | Canonical input/report validation, identity recomputation, stable bytes, and structured failures. |
| `scripts/lib/complexity-architecture-delta/analyzer.js` | Create | Deterministic set delta for the nine closed dimensions. |
| `scripts/lib/complexity-architecture-delta/advisory.js` | Create | Pure advisory question generation; no verdict or mutation vocabulary. |
| `scripts/lib/complexity-architecture-delta/index.js` | Create | Public create/validate API and `rejectAuthorityMisuse` guard. |
| `schemas/kernel/architecture-alternative/v1.schema.json` | Create | Closed Candidate-bound alternative contract and conditional `new-abstraction` rationale. |
| `schemas/kernel/complexity-architecture-delta/v1.schema.json` | Create | Closed report, dimension, and advisory-signal contract. |
| `schemas/kernel/{architecture-alternative,complexity-architecture-delta}/fixtures/**` | Create | Valid, malformed binding/identity, unsupported classification, unavailable, incomplete rationale, and cross-family fixtures. |
| `schemas/kernel/manifest.json` | Modify | Register both canonical `$id` values and versions. |
| `schemas/kernel/contract-claims.json` | Modify | Publish required fields and closed enums for both families. |
| `scripts/lib/lifecycle-kernel/k1-compat.js` | Modify | Exclude the two additive K6d directories from the frozen K1 file inventory, preserving every existing pin. |
| `scripts/lib/k6d-schema-fixtures.test.js` | Create | Schema/claims/fixture and cross-family contract coverage. |
| `scripts/lib/complexity-architecture-delta/index.test.js` | Create | Determinism, bindings, dimensions, alternatives, signals, and CX0 independence. |
| `scripts/lib/roadmap-boundary.test.js` | Modify | Pin K6d maturity/advisory status, K7-K9 target status, upstream import boundary, and misuse rejection. |
| `docs/architecture/harness-evolution.md` | Modify | Move K6d to implemented advisory evidence without promoting later authorities. |

## Interfaces / Contracts

```js
createDeltaReport({
  candidate, // canonical frozen candidate/v2
  observations: {
    modules: observedOrUnavailable,
    interfaces: observedOrUnavailable,
    dependencies: observedOrUnavailable,
    configuration: observedOrUnavailable,
    states: observedOrUnavailable,
    compatibility: observedOrUnavailable,
    duplication: observedOrUnavailable,
    dead_code: observedOrUnavailable,
    public_api: observedOrUnavailable,
  },
  alternatives: [alternativeInput],
});

// observedOrUnavailable:
{ status: "observed", base: [{ id, digest }], candidate: [{ id, digest }] }
{ status: "unavailable", reason: "collector not available for this Candidate" }
```

An observed report dimension is
`{ status: "observed", added, removed, changed }`, where `changed` records
`{ id, before_digest, after_digest }`. Empty arrays explicitly mean observed and
unchanged. An unavailable dimension is exactly
`{ status: "unavailable", reason }`.

`architecture-alternative/v1` requires `alternative_id`, `candidate_id`,
`classification`, and `summary`. Classification is exactly `no-op`, `local`,
`extend-pattern`, or `new-abstraction`. The last additionally requires
`rationale.problem`, `consumers`, `variability`, `boundary`,
`simpler_alternative`, and `retirement_path`. Its ID hashes the canonical body
under `architecture-alternative:v1`.

`complexity-architecture-delta/v1` requires `report_id`, `candidate_id`,
`canonical_input_id`, `authority: "advisory"`, the nine dimensions,
canonical alternatives, and `signals`. Signals have a content-addressed
`signal_id`, closed advisory code, question, and sorted basis references; no
verdict, approval, transition, attestation, promotion, or authorization field is
permitted.

## Scenario Allocation

| MUST scenario | Component / verification |
|---|---|
| Equivalent inputs reproduce bytes and ID | `integrity.js`; `index.test.js` compares reordered equivalent inputs byte-for-byte. |
| Missing/malformed/divergent Candidate binding fails | Candidate validation plus report binding gate; runtime and invalid-fixture tests. |
| All nine dimensions represented | Closed schema and `analyzer.js`; complete fixture and unit assertion. |
| Unobservable duplication is not zero/unchanged | `unavailable` schema branch; unit and fixture assert reason with no delta arrays. |
| Complete new-abstraction rationale | Conditional schema plus alternative integrity; valid fixture. |
| Missing simpler alternative/retirement fails | Two negative fixtures and path-specific validator errors. |
| Overengineering fixture emits question, never decision | `advisory.js`; unit test asserts advisory signal and absence of decision fields. |
| Report valid without CX0 | Public input allowlist contains no telemetry fields; no-CX0 unit fixture succeeds. |
| K6d implemented without authority promotion | Documentation and `roadmap-boundary.test.js` maturity table. |
| K6d used as authority fails closed | `rejectAuthorityMisuse`; boundary test checks `K6D_AUTHORITY_MISUSE`. |
| Valid report/alternative contracts pass | `k6d-schema-fixtures.test.js` loads both schemas via manifest. |
| Invalid identity/binding/rationale fails | Negative fixtures plus runtime recomputation tests. |
| Cross-family substitution rejected | Existing evidence/verification schemas and identity-kind guards reject K6d fixtures. |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Inventory normalization, set delta, IDs, stable bytes, unavailable observations, advisory generation | Node `node:test` against pure module functions with reordered and mutated inputs. |
| Contract | Schemas, manifest, claims, valid/negative fixtures, conditional rationale, closed properties, cross-family substitution | Extend the existing `kernel-schema-validator.js` fixture pattern in `k6d-schema-fixtures.test.js`. |
| Integration | Canonical Candidate v2 binding and upstream/authority boundaries | Freeze real test Candidates with `execution-identities`; static boundary tests ensure K3-K6c do not import K6d and K6d cannot authorize. |
| Regression | Frozen K1/K6b/K6c contracts remain byte-identical | Run `assertK1SchemasUnchanged` and retain the existing K6b/K6c compatibility assertions. |

## Migration / Rollout

No state or data migration is required. The schemas and library are additive and
reports are derived/discardable. Ship producer, validators, fixtures, manifest,
claims, authority guard, and documentation in one slice so no registered schema
lacks runtime validation. Rollback removes the two families and K6d module as a
unit; no lifecycle or authority store needs repair.

## Open Questions

None.
