# Delta for kernel-contract-schemas

## ADDED Requirements

### Requirement: K6d Delta Contract Family Publication {#REQ-kernel-contract-schemas-030}

The contract suite MUST publish a versioned K6d complexity-architecture-delta
schema family for the canonical Candidate-bound report and its alternatives.
Each published schema MUST declare a canonical `$id`, `schema_version`, and
closed `kind`, disallow unknown properties, and be registered in
`schemas/kernel/manifest.json` and `contract-claims.json`. The suite MUST ship
valid fixtures and negative fixtures for missing or malformed Candidate and
report identities, divergent bindings, incomplete `new-abstraction` rationale,
and unsupported alternative classifications. These contracts MUST NOT validate
as evidence, verification, attestation, or delivery-authorization families.

#### Scenario: Valid K6d contracts and fixtures validate

- GIVEN a canonical Candidate-bound K6d report and a complete alternative
- WHEN validated against the registered K6d schemas
- THEN validation MUST succeed

#### Scenario: Invalid K6d binding or rationale fails closed

- GIVEN a K6d fixture with a malformed identity, divergent Candidate binding,
  or incomplete `new-abstraction` rationale
- WHEN contract validation runs
- THEN it MUST fail closed identifying the violating property

#### Scenario: Cross-family substitution is rejected

- GIVEN a K6d payload supplied as verification, attestation, or delivery input
- WHEN the target family validates it
- THEN validation MUST fail closed because kind and required fields differ

