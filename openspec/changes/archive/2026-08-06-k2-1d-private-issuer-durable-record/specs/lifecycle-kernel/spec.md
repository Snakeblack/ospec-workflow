# lifecycle-kernel Specification Delta

## Purpose

Enforce strict internal permit issuer capability resolution within runtime composition, prevent caller-provided or forged permit issuers, and guarantee atomic rollback of kernel state when CAS persistence or authority bag materialization fails.

## Requirements

### Requirement: Internal Permit Issuer Resolution {#REQ-lifecycle-kernel-020}

The lifecycle kernel MUST NOT accept caller-minted or caller-provided permit issuers. Permit authority resolution MUST be strictly internal to runtime composition (`runKernelOperation` and internal kernel bindings). Public API signatures MUST NOT accept an external permit issuer capability parameter.

#### Scenario: Caller-provided permit issuer is rejected

- GIVEN a caller invoking a lifecycle kernel operation
- WHEN the caller attempts to pass a custom, external, or caller-minted permit issuer
- THEN the kernel MUST ignore or reject the external issuer parameter
- AND MUST NOT use caller-supplied capabilities to issue permits

#### Scenario: Internal permit authority resolution

- GIVEN a valid lifecycle kernel operation initiated via `runKernelOperation`
- WHEN permit minting and authorization are evaluated
- THEN the kernel MUST resolve the private permit authority internally within its composition boundary

### Requirement: Forged Permit Issuer Rejection {#REQ-lifecycle-kernel-021}

The lifecycle kernel MUST reject forged permit issuer objects carrying global Symbols (e.g. `Symbol.for(...)`) or mock capability brands. Only genuine private capabilities bound within runtime composition MAY issue valid `OperationPermit` instances.

#### Scenario: Forged permit issuer with global Symbol is rejected

- GIVEN a forged permit issuer object constructed with `Symbol.for("ospec.permitAuthorityIssuer")` or mock brand properties
- WHEN the forged object is presented to kernel authorization or permit issuance mechanisms
- THEN authorization MUST fail closed with an un-authorized or invalid-capability error
- AND no valid OperationPermit MUST be minted

### Requirement: Atomic Failure Rollback {#REQ-lifecycle-kernel-022}

If authority bag materialization or atomic CAS persistence fails during a kernel operation attempt, the operation MUST fail closed. The Authority Store head MUST remain at its previous committed revision intact, with no partial state updates, torn journal entries, or leaked authority bag entries.

#### Scenario: CAS persistence failure leaves head intact

- GIVEN a lifecycle kernel operation attempting an authoritative mutation
- WHEN underlying CAS persistence fails or authority bag materialization throws an error
- THEN the kernel operation MUST fail closed
- AND the previous Authority Store head revision MUST remain unchanged and intact
