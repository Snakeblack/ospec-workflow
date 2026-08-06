# Design: K3 — Execution Identities, Candidate Freeze, and Initial Candidate Relations

## Technical Approach

K3 establishes absolute separation across four execution identity families (`SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`) and implements a deterministic candidate freeze and initial relation evaluation pipeline.

The technical approach maps directly to the `execution-identities` and `kernel-contract-schemas` specs:
1. **Schema & Contract Standardization**: Publish stable JSON Schemas (`ospec://schemas/kernel/{family}/v1`) under `schemas/kernel/` for `source-snapshot`, `work-order`, `work-result`, and `candidate`. Register them in `schemas/kernel/manifest.json`.
2. **Deterministic Identity Digests**: Implement domain-prefixed SHA-256 fingerprinting using `canonical-json.js` (`sha256Fingerprint(domain, payload)`). Each identity family uses a dedicated domain string (`source-snapshot/v1`, `work-order/v1`, `work-result/v1`, `candidate/v1`).
3. **Candidate Freeze Pipeline**: Restrict projections strictly to `workspace` or `staged`. Normalize paths to canonical POSIX format. Compute content hashes, `changed_paths_modes_digest` (tracking file modes like `100644` vs `100755`), `intended_untracked_digest`, and symlink/case-sensitivity representations.
4. **Fail-Closed Candidate Initial Relations**: Implement a deterministic evaluator producing initial relations (`exact`, `changed`, `ambiguous`, `unknown`). Ambiguities in selectors or projections fail closed with `ambiguous` or `unknown`, halting execution or triggering a `decide` state transition.
5. **Non-Aliasing & Mutable Target Rejection**: Provide strict type-guard validators and negative test suites ensuring raw worker outputs (`WorkResult`) cannot pass as `Candidate`, and `Candidate` cannot pass as `CandidateEvaluationAttestation` or `DeliveryAuthorization`. Enforce that attestations and authorizations reject mutable Git branch names or unintegrated working tree paths.

## Architecture Decisions

### Decision: Dedicated Domain-Prefixed Fingerprints for Four Execution Identities

**Choice**: Use `canonical-json.js` `sha256Fingerprint` with distinct domain strings (`source-snapshot/v1`, `work-order/v1`, `work-result/v1`, `candidate/v1`) for each identity.
**Alternatives considered**: Using generic SHA-256 over raw JSON, or sharing digest domains across identities.
**Rationale**: Prevents accidental identity aliasing or cross-family digest collisions. Guarantees that even if two structures contain similar keys, their resulting IDs will differ deterministically.

### Decision: Candidate Freeze Restricted to `workspace` and `staged` Projections with Modes & Untracked Digests

**Choice**: Candidate freeze strictly permits `workspace` or `staged` projections and records `changed_paths_modes_digest` (POSIX mode bits) and `intended_untracked_digest`.
**Alternatives considered**: Allowing `commit` as a Candidate projection, or ignoring file permissions and untracked file inventories.
**Rationale**: Candidate freeze represents the uncommitted integrated work product before verification. `commit` is a valid origin for a `SourceSnapshot`, but not a Candidate projection. File mode changes (e.g. executable flag `100755`) and untracked files alter execution behavior and must change `CandidateId`.

### Decision: Fail-Closed 4-Value Candidate Initial Relation Evaluation

**Choice**: Limit initial Candidate relation outcomes to `exact`, `changed`, `ambiguous`, `unknown`. Default ambiguous inputs to `ambiguous` or `unknown` and halt execution (`stop`/`decide`). Keep `compatible-base-advance` experimental.
**Alternatives considered**: Automatically applying optimistic base-advance heuristics or full relational algebra.
**Rationale**: Optimistic base advancing can cause false-positive verification reuse when base trees shift. Fail-closed initial evaluation guarantees safety.

### Decision: Fail-Closed Type Non-Aliasing and Mutable Target Rejection

**Choice**: Implement explicit type discriminators and validation checks that reject `WorkResult` where `Candidate` is expected, reject `Candidate` where `CandidateEvaluationAttestation` or `DeliveryAuthorization` is expected, and reject branch names or mutable paths for attestations.
**Alternatives considered**: Structural duck-typing without strict kind validation.
**Rationale**: Unintegrated worker outputs or mutable branch references introduce non-determinism into the verification chain. Strict non-aliasing guarantees auditability.

## Data Flow

```text
 [Git Repo / Working Tree] ──→ SourceSnapshot (workspace | staged | commit)
                                      │
                                      ▼
                                 WorkOrder (bound to SourceSnapshotId)
                                      │
                                      ▼
                                 WorkResult (unapproved worker output)
                                      │
                                      ▼ (integrate on base + canonicalize)
                               Candidate Freeze (workspace | staged)
                                      │
                                      ▼
                      Candidate Initial Relation Evaluator
                           ├── exact      ──→ Validate / Reuse
                           ├── changed    ──→ Re-evaluate
                           ├── ambiguous  ──→ stop / decide
                           └── unknown    ──→ stop
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `schemas/kernel/source-snapshot/v1.schema.json` | Create | JSON Schema for `SourceSnapshot` execution identity family |
| `schemas/kernel/source-snapshot/fixtures/valid/minimal.json` | Create | Valid fixture for `SourceSnapshot` |
| `schemas/kernel/source-snapshot/fixtures/invalid/minimal.json` | Create | Invalid fixture for `SourceSnapshot` |
| `schemas/kernel/work-result/v1.schema.json` | Create | JSON Schema for `WorkResult` raw output family |
| `schemas/kernel/work-result/fixtures/valid/minimal.json` | Create | Valid fixture for `WorkResult` |
| `schemas/kernel/work-result/fixtures/invalid/minimal.json` | Create | Invalid fixture for `WorkResult` |
| `schemas/kernel/candidate/v1.schema.json` | Modify | Extend `Candidate` schema with `repository_id`, `changed_paths_modes_digest`, `intended_untracked_digest`, `predecessor_id`, `relation` |
| `schemas/kernel/candidate/fixtures/valid/k3-frozen.json` | Create | Valid fixture for K3 Candidate freeze |
| `schemas/kernel/candidate/fixtures/invalid/commit-projection.json` | Create | Invalid fixture rejecting `commit` projection in Candidate |
| `schemas/kernel/candidate/fixtures/invalid/work-result-alias.json` | Create | Invalid fixture attempting to pass WorkResult as Candidate |
| `schemas/kernel/work-order/v1.schema.json` | Modify | Extend `WorkOrder` schema to require `source_snapshot_id` binding |
| `schemas/kernel/manifest.json` | Modify | Register `source-snapshot` and `work-result` schema families |
| `scripts/lib/execution-identities/index.js` | Create | Core identity digests (`SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`), candidate freeze, relation evaluator, and non-aliasing validators |
| `scripts/lib/execution-identities/index.test.js` | Create | Unit and integration test suite for execution identities, freeze, relations, and negative fixtures |
| `scripts/lib/k3-schema-fixtures.test.js` | Create | Schema conformance test suite for K3 identity families and non-aliasing fixtures |

## Interfaces / Contracts

### `scripts/lib/execution-identities/index.js`

```javascript
/**
 * Compute SourceSnapshotId digest.
 * @param {{ repositoryId: string, baseTreeDigest: string, projection: "workspace"|"staged"|"commit", dependencyDigests?: string[] }} snapshot
 * @returns {string} sha256:...
 */
function computeSourceSnapshotId(snapshot)

/**
 * Compute WorkOrderId digest.
 * @param {{ sourceSnapshotId: string, nodeId: string, role: string, operation: string, objective: string, allowedPaths: string[], invariants: string[], budget: object }} workOrder
 * @returns {string} sha256:...
 */
function computeWorkOrderId(workOrder)

/**
 * Compute WorkResultId digest.
 * @param {{ workOrderId: string, sourceSnapshotId: string, patch: string, commands: object[], logs: string[], exitCode: number, filesystemInventory: object[] }} workResult
 * @returns {string} sha256:...
 */
function computeWorkResultId(workResult)

/**
 * Freeze a candidate into a Candidate object and compute CandidateId.
 * @param {{ repositoryId: string, projection: "workspace"|"staged", baseTree: string, candidateTree: string, diffText: string, paths: string[], fileModes?: Record<string, string>, intendedUntracked?: Array<{path: string, hash: string}>, predecessorId?: string }} input
 * @returns {CandidateRecord}
 */
function freezeCandidate(input)

/**
 * Compute CandidateId digest.
 * @param {{ repositoryId: string, projection: "workspace"|"staged", baseTree: string, candidateTree: string, diffHash: string, pathsDigest: string, changedPathsModesDigest: string, intendedUntrackedDigest: string|null }} candidate
 * @returns {string} sha256:...
 */
function computeCandidateId(candidate)

/**
 * Evaluate relation between a baseline Candidate and a target Candidate or selector.
 * @param {CandidateRecord} baseline
 * @param {CandidateRecord|SelectorQuery} target
 * @returns {{ relation: "exact"|"changed"|"ambiguous"|"unknown", action: "validate"|"re-evaluate"|"decide"|"stop", reason?: string }}
 */
function evaluateCandidateRelation(baseline, target)

/**
 * Assert strict identity separation & reject aliased or mutable targets.
 * @param {object} payload
 * @param {"SourceSnapshot"|"WorkOrder"|"WorkResult"|"Candidate"} expectedKind
 * @returns {{ ok: boolean, reason_code?: string }}
 */
function validateIdentityKind(payload, expectedKind)
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | 4 Digest Algorithms (`SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`) | Verify stability, canonical ordering, 1-byte mutation sensitivity, distinct domain prefixes |
| Unit | Candidate Freeze Pipeline | Test `workspace` vs `staged` projections, rejection of `commit`, file mode changes (100644 vs 100755), untracked file digests, symlinks, case-sensitivity |
| Unit | Initial Candidate Relations | Test `exact`, `changed`, `ambiguous`, `unknown` classification and fail-closed transitions |
| Integration | Non-aliasing & Schema Conformance | Run JSON Schema validation and negative confusion fixtures (`WorkResult ≠ Candidate`, `Candidate ≠ Attestation`, branch name rejection) |

## Migration / Rollout

No migration required for existing persistent workspace state. K3 identity schemas and freeze modules introduce new data structures without breaking existing legacy receipt formats (`receipt/v1`) or `ArchiveTransactionReceipt`.

## Open Questions

None.
