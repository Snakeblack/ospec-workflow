# Design: K6c Integrity Remediation

## Technical Approach

Harden the existing K6c pipeline around one shared canonical-integrity boundary. Planning, execution, independent verification, projection, and replay will all call the same schema/identity/binding validator; none may trust a declared ID or infer validity from record presence. The nine-type catalog and the current proportional `STRATEGY_CHALLENGE_SELECTION` remain unchanged.

Execution reuses K6a's private workspace registry (`worker-workspace.js`) and confined Node executor (`worker-sandbox.js`). Each selected challenge gets one fresh workspace materialized from bytes whose tree digest equals the frozen Candidate. Focal line scope comes only from unified-diff bytes whose digest equals `Candidate.diff_hash`; caller `targetLines`, paths, or source snippets cannot widen it.

## Architecture Decisions

### Decision: One canonical validator owns K6c identity and set integrity

**Choice**: Add `adversarial-challenges/integrity.js` for schema loading, canonical ID recomputation, binding checks, required-path enforcement, and exact result-set cardinality. Plan/result IDs hash every required field except their own ID; arrays must already be in canonical order.
**Alternatives considered**: Repeat partial checks in planner, runner, verifier, and projector; accept schema-valid records without recomputing IDs.
**Rationale**: The current verifier collapses duplicates into a `Map`, accepts an absent plan, and checks only Candidate/outcome. A shared fail-closed gate prevents those consumers from drifting. See [ADR-001](decisions/adr-001.md).

### Decision: Reuse K6a isolation with a sticky wall-clock deadline

**Choice**: Materialize Candidate bytes through `createWorkspace`/`materializeSourceSnapshot`, execute through `executeSandboxedCommand`, and always dispose the registered workspace. One monotonic plan deadline supplies each challenge's remaining `timeoutMs` and `AbortSignal`; once elapsed, `CHALLENGE_TIMEOUT` is final even if late work reports success.
**Alternatives considered**: In-memory callbacks over caller source strings; a second K6c sandbox; decrementing only caller-reported duration.
**Rationale**: K6a already enforces path confinement, byte digests, and private workspace identity. Reuse avoids a weaker parallel boundary while the sticky outcome handles non-cooperative cancellation safely. See [ADR-002](decisions/adr-002.md).

### Decision: Project K6c IDs as non-authoritative graph nodes and replay full records

**Choice**: Add `challenge-plan` and `challenge-result` node kinds. The plan derives from Candidate; each result derives from its plan; a successful verification is `verified-by` every accepted result. Full records remain in the persistable replay bundle and are revalidated before projection.
**Alternatives considered**: Exclude K6c from `graph_id`; put mutable full records inside graph nodes; treat challenge results as ordinary `evidence/v2`.
**Rationale**: IDs and edges make `graph_id` sensitive to the exact canonical set without aliasing evidence or granting authorization. See [ADR-003](decisions/adr-003.md).

## Data Flow

```text
Candidate + diff bytes + PolicySnapshot + graph node
        |  recompute Candidate/diff/policy/graph bindings
        v
 proportional planner -> canonical ChallengePlan
        | validate schema + plan_id + catalog partition
        v
 for each selected type (exactly once)
   create K6a workspace -> materialize Candidate bytes -> capability gate
   -> execute with remaining wall-clock deadline -> emit bound result
   -> recompute original Candidate/tree digest -> dispose workspace
        |
        v
 verifier: strategy minimums -> MUST walk -> exact K6c set gate
        | failure: no verdict, no graph, K6d blocked
        v
 Verification + challenge_verification: accepted
        -> deterministic graph projection -> persisted replay bundle
        -> replay revalidates records/cardinality -> same graph_id or GRAPH_DIVERGENCE
```

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/adversarial-challenges/integrity.js` | Create | Cached schema loaders; canonical plan/result bodies and IDs; Candidate/node/policy/strategy bindings; catalog partition and exact result-set validator. |
| `scripts/lib/adversarial-challenges/diff-scope.js` | Create | Verify unified-diff bytes against `diff_hash`; derive normalized changed paths and added/modified line ranges intersected with `Candidate.paths`. |
| `scripts/lib/adversarial-challenges/planner.js` | Modify | Require `nodeId`; validate Candidate/PolicySnapshot inputs; retain selection matrix; emit canonical byte-stable v1 plan. |
| `scripts/lib/adversarial-challenges/runner.js` | Modify | Validate before effects; require enforced per-type, isolation, and cancellation capabilities; allocate one K6a workspace per selected type; enforce deadline/cancellation and original Candidate digest checks. |
| `scripts/lib/adversarial-challenges/index.js` | Modify | Export integrity/scope APIs without exporting workspace-registry or authority-minting internals. |
| `scripts/lib/independent-verifier/challenge-evidence.js` | Create | Enforce one plan and the exact selected result set in required K6c mode; return typed K6c status. |
| `scripts/lib/independent-verifier/index.js` | Modify | Add a required K6c entrypoint over a shared core; run the gate after strategy/MUST coverage and before verdict; emit `challenge_verification`/`replay_challenges`. |
| `scripts/lib/assurance-graph/projector.js` | Modify | Add deterministic plan/result nodes and edges after shared validation. |
| `scripts/lib/assurance-graph/index.js` | Modify | Revalidate persisted K6c material and mandatory status before replay/reconcile. |
| `schemas/kernel/challenge-plan/v1.schema.json` | Modify | Require non-empty `node_id`; strengthen collection bounds/uniqueness within the supported validator subset. |
| `schemas/kernel/challenge-result/v1.schema.json` | Modify | Require `policy_snapshot_id` and `evidence_strategy`; preserve closed catalog and `additionalProperties: false`. |
| `schemas/kernel/assurance-graph/v1.schema.json` | Modify | Add only the two non-authoritative K6c node kinds. |
| `schemas/kernel/{manifest.json,contract-claims.json}` | Modify | Keep challenge family registrations aligned and extend Assurance Graph node-kind claims. |
| `schemas/kernel/challenge-{plan,result}/fixtures/**` | Modify/Create | Valid bound payloads plus missing binding, malformed ID, duplicate selection, and cross-bound pair fixtures. |
| `scripts/lib/{adversarial-challenges,independent-verifier,assurance-graph}/**/*.test.js` | Modify/Create | Unit and adversarial regressions for every integrity bypass. |
| `scripts/lib/k6c-schema-fixtures.test.js` | Modify | Schema/claim fixtures, cross-family rejection, pair-level binding checks, and K1/evidence/verification byte pins. |

## Interfaces / Contracts

```javascript
validateChallengePlan(plan, {
  candidate, executionGraph, policySnapshot, evidenceStrategy, nodeId
}) // -> { ok, plan } | { ok:false, reason_code:"CHALLENGE_INTEGRITY_INVALID" }

validateChallengeResultSet(plan, results, bindings)
// exact set: one result per selected type; none skipped/unknown/duplicate/foreign

verifyCandidateWithChallenges(input)
// policy/strategy-selected K6c path; a canonical plan is unconditionally required

executeChallengePlan(plan, {
  candidate, candidateDiff, repository, sourceSnapshot, workOrder,
  executionGraph, policySnapshot, executor
}) // executor exposes enforced challenge/isolation/cancellation capabilities
```

The internal executor contract requires `capabilities.challenge_types[challengeType]`, `capabilities.isolation`, and `capabilities.cancellation` all to equal `"enforced"`; missing, false, `partial`, or unverifiable values stop before workspace effects. The runner uses `performance.now()` for one plan deadline and passes both its remaining milliseconds and a signal to the confined executor.

Canonical plan order is the strategy table's selected order followed by skipped entries in `CHALLENGE_TYPES` order. `selected` and `skipped` must be disjoint and their union must equal the catalog exactly. Result `evidence_ids` are unique sorted IDs; `details` use canonical JSON. Validation recomputes `CandidateId`, PolicySnapshot identity, plan/result IDs, and requires `node_id` to exist in the bound Execution Graph.

Policy/strategy selection routes K6c work through `verifyCandidateWithChallenges`; requiredness is an entrypoint invariant, not a caller-provided boolean and therefore cannot be downgraded in the payload. The legacy `verifyCandidate` path remains compatible for callers not routed through K6c, while any supplied challenge material is still validated. Only the required entrypoint can emit `challenge_verification.status === "accepted"`, which is the sole state eligible for future K6d entry.

The Candidate integrity check has two levels: before materialization, `computeTreeDigest(repository.files) === candidate.candidate_tree` and `sha256Fingerprint("candidate-diff/v1", candidateDiff) === candidate.diff_hash`; after every challenge, those original repository bytes and `computeCandidateId(candidate)` must match their pre-run values. `materializeSourceSnapshot` receives those bytes as a verified `effectiveBase`; mutations are permitted only inside the disposable workspace and only within the verified diff scope.

## Requirement / Scenario Allocation

| Requirement and scenarios | Components / test seams |
|---|---|
| `REQ-adversarial-challenges-002`: bug/refactor/migration proportional plans; identical inputs; changed node/policy binding | `planner.js` + `integrity.js`; golden byte equality and binding-mutation table tests. |
| `REQ-adversarial-challenges-004`: focal defect, complacent tests, tautology, missing capability/deadline, foreign scope/Candidate mutation | `diff-scope.js`, `runner.js`, K6a workspace/sandbox fakes; real temp-workspace integration, non-cooperative executor clock test, pre/post digest test. |
| `REQ-independent-verification-010`: complete success, failed result, challenge-only evidence, missing/duplicate/foreign set | `challenge-evidence.js` before verdict; table-driven cardinality/binding tests assert no `verification`/graph and K6d status absent. |
| `REQ-assurance-graph-009`: reproducible projection/replay, duplicate/foreign divergence, mandatory-plan absence | `projector.js`/`index.js`; permuted canonical inputs, persisted tamper, and replay tests assert identical `graph_id` or `GRAPH_DIVERGENCE`. |
| `REQ-kernel-contract-schemas-029`: valid plan/result, missing/unknown/invalid bindings, cross-family/pair substitution, registration | JSON fixtures plus `k6c-schema-fixtures.test.js`; schema validation and shared pair-integrity validation. |

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Canonical IDs, catalog partition, cardinality, diff scope, capability gate, deadline state | Node test tables; mutate one field at a time and recompute forged IDs where needed. |
| Integration | K6a materialization/confinement, Candidate immutability, timeout, verifier short-circuit | Real temp directories and sandboxed Node children; assert disposal and no approving late result. |
| Replay/contract | Schema fixtures, graph permutation stability, persisted tamper, byte pins | Existing schema validator and Assurance Graph replay harness; full suite `npm test`. |

## Migration / Rollout

This is an atomic corrective cutover of the existing v1 challenge families, not a dual reader. Previously emitted incomplete v1 plans/results (missing node, policy, or strategy bindings) are rejected and must be regenerated from the still-frozen Candidate, verified diff, graph node, strategy, and PolicySnapshot; IDs necessarily change. Producers, schemas, verifier, projector, fixtures, manifest, and claims ship together. `evidence/v2`, `verification/v2`, K1 schema bytes, and K1 baseline pins remain byte-identical. K6d remains blocked until terminal verification and replay pass with `challenge_verification.status: accepted`.

Rollback reverts the whole K6c runtime/schema/projection slice together and keeps K6d blocked; partial rollback is unsafe because consumers would disagree about identities.

## Open Questions

None.
