# Delta for contract-lint

## ADDED Requirements

### Requirement: Causal Failure Taxonomy And Transition Matrix Checker {#REQ-contract-lint-014}

The unified contract-lint registry MUST include a checker that validates declared failure descriptors and recovery transitions against the causal failure taxonomy and allowlisted transition matrix. The checker MUST report an offender if any declared recovery transition references an unallowlisted operation for its failure category or code, or if a failure descriptor omits required taxonomy fields (`category`, `code`, `priority`, `blocking_fingerprint`).

#### Scenario: Unallowlisted transition for failure category is reported as an offender

- GIVEN a recovery transition declaration mapping category `ambiguous_effect` to target operation `repair`
- WHEN the contract-lint aggregator runs the transition matrix checker
- THEN the checker MUST report an offender naming the invalid transition and operation
- AND the overall lint run MUST fail

#### Scenario: Valid causal failure and transition declarations pass lint

- GIVEN execution contracts with valid causal failure descriptors and allowlisted transition mappings
- WHEN the transition matrix checker runs
- THEN the checker MUST return an empty offender list

---

### Requirement: Execution Budget And Monotonicity Structure Checker {#REQ-contract-lint-015}

The unified contract-lint registry MUST include a checker that validates budget declarations across execution graphs, work orders, and recovery nodes. The checker MUST report an offender if any node execution budget or authority budget contains negative quotas, malformed field types, or if a child repair node declares budget allocations that exceed the parent work order's remaining budget envelope.

#### Scenario: Negative or malformed budget allocation is reported as an offender

- GIVEN an execution graph node declaring `turns: -2` or `effect_attempts: "many"`
- WHEN the contract-lint aggregator runs the budget structure checker
- THEN the checker MUST report an offender identifying the file, node ID, and malformed budget field
- AND the overall lint run MUST fail

#### Scenario: Inflated repair node budget is reported as an offender

- GIVEN a child repair work order declaring `effect_attempts: 5` when the parent node had an initial budget of 3
- WHEN the budget structure checker runs
- THEN the checker MUST report an offender for budget inflation / non-monotonicity violation
- AND the overall lint run MUST fail

#### Scenario: Well-formed monotonic budget structures pass lint

- GIVEN execution graphs and work orders with valid non-negative budgets satisfying monotonicity constraints
- WHEN the budget structure checker runs
- THEN the checker MUST return an empty offender list
