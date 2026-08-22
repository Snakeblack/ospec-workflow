# Delta for Operation Permits

## MODIFIED Requirements

### Requirement: Controlled Issuer Issues Permits {#REQ-operation-permits-005}

Permit issuance MUST occur only through a controlled runtime issuer that accepts a `TransitionOffer` plus exactly one of `PolicyDecision`, `HumanDecision`, or `KernelRule`, plus `expected_revision`, and returns an `OperationPermit`. The controlled issuer MUST query an authoritative snapshot from the Authority Store (`store.snapshot(subject_id)`) to verify `expected_revision`, evaluate node budget and authority effect budget exhaustion via `isBudgetExhausted()` (accounting for node-partitioned carry-over under key `${subjectId}:${nodeId}`), and validate causal recovery allowlists via `validateRecoveryTransition()` against the primary failure derived by `resolvePrimaryFailure()` prior to issuing an `OperationPermit`. The controlled issuer MUST fail closed if no authoritative store snapshot exists, and MUST NOT fall back to unverified caller-provided state (`input.state`). If `expected_revision` does not match the Authority Store head revision, if any node or authority budget is exhausted for the specific `${subjectId}:${nodeId}` partition, or if the offered transition is not allowlisted for the active causal failure, the issuer MUST fail closed and refuse permit issuance. State-validity of the offered transition alone MUST NOT authorize issuance or mutation. Models, hosts, and public mutating entrypoints MUST NOT self-grant or auto-mint permits.
(Previously: Controlled issuer evaluated budgets and allowlists but did not explicitly require node-partitioned carry-over evaluation by `${subjectId}:${nodeId}` to isolate budgets between concurrent nodes under the same subject.)

#### Scenario: Issuer produces permit from offer plus decision when Authority Store head, budget, and causal allowlist pass

- GIVEN a valid TransitionOffer, positive remaining budget quotas, and a PolicyDecision (or HumanDecision or KernelRule) bound to expected_revision R
- AND the Authority Store head revision matches R
- AND the transition is allowlisted under the causal recovery matrix
- WHEN the controlled issuer runs
- THEN it MUST return a runtime-owned OperationPermit with expected_revision R
- AND the permit MUST NOT be minted by the public mutating entrypoint

#### Scenario: State-valid offer alone does not issue

- GIVEN a TransitionOffer that is state-valid for the current head
- AND no PolicyDecision, HumanDecision, or KernelRule is supplied
- WHEN issuance is attempted
- THEN the issuer MUST fail closed
- AND no OperationPermit MUST exist for that attempt

#### Scenario: Issuer refuses permit when node or authority budget is exhausted in Authority Store

- GIVEN a valid TransitionOffer and PolicyDecision
- AND the target node or authority budget in the Authority Store state is exhausted (`isBudgetExhausted()` returns `exhausted: true`)
- WHEN permit issuance is attempted through the controlled issuer
- THEN the issuer MUST fail closed
- AND MUST NOT return or mint an OperationPermit

#### Scenario: Issuer refuses permit on Authority Store revision mismatch or causal allowlist violation

- GIVEN a valid TransitionOffer and PolicyDecision
- AND expected_revision differs from the Authority Store head OR the transition violates the causal recovery allowlist
- WHEN permit issuance is attempted through the controlled issuer
- THEN the issuer MUST fail closed
- AND MUST NOT return or mint an OperationPermit

#### Scenario: Controlled issuer fails closed without authoritative store snapshot

- GIVEN a permit issuance request where `store.snapshot()` returns null or no store is present
- AND caller supplies an arbitrary `input.state`
- WHEN `issuePermitForSelectedTransition` is invoked
- THEN the issuer MUST fail closed with an authoritative snapshot required error
- AND MUST NOT utilize `input.state` as fallback to mint a permit

#### Scenario: Controlled issuer validates causal allowlists using unified resolvePrimaryFailure

- GIVEN a failed node state with multiple causal failure descriptors in the Authority Store snapshot
- WHEN `issuePermitForSelectedTransition` evaluates a recovery transition offer
- THEN the issuer MUST resolve the primary failure category via `resolvePrimaryFailure()`
- AND MUST reject unallowlisted recovery operations for that resolved category fail-closed

#### Scenario: Permit evaluation isolates node budget carry-over by subject and node key

- GIVEN two concurrent nodes `N1` and `N2` under subject `S1` where `N1` has accumulated pending carry-over consumption
- WHEN `issuePermitForSelectedTransition` evaluates a permit request for node `N2`
- THEN budget checking MUST evaluate pending carry-over partitioned by key `S1:N2`
- AND `N1`'s carry-over under key `S1:N1` MUST NOT cause permit issuance for `N2` to fail due to quota exhaustion
