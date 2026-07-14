# Delta for Skills

## ADDED Requirements

### Requirement: sdd-spec Ambiguity Signal Contract {#REQ-skills-003}

Every `sdd-spec` return with `status: success` MUST include these fields in its
strict `json:result-envelope` object and prose-adjacent envelope:

| Field | Type |
|---|---|
| `residual_ambiguity` | boolean |
| `public_contract_questions` | array of strings |
| `conflicting_requirements` | array of strings |
| `missing_acceptance_criteria` | array of strings |

The JavaScript and Go result-envelope validators MUST enforce the boolean, array,
and array-element types consistently. These fields are REQUIRED only for successful
`sdd-spec` returns; other phases and non-successful `sdd-spec` returns MUST retain
their existing envelope requirements.

The clarify predicate MUST evaluate to `false` only when
`residual_ambiguity` is `false` and all three arrays are empty. It MUST evaluate to
`true` when `residual_ambiguity` is `true` or any array is non-empty.

#### Scenario: Well-defined spec emits the skip signal

- GIVEN `sdd-spec` completes with no unresolved contract, requirement, or acceptance gap
- WHEN it emits a successful result envelope
- THEN `residual_ambiguity` MUST be `false`
- AND all three signal arrays MUST be empty

#### Scenario: Any ambiguity category triggers the predicate

- GIVEN `sdd-spec` identifies at least one unresolved item in any signal category
- WHEN it emits a successful result envelope
- THEN the corresponding array MUST contain that item or `residual_ambiguity` MUST be `true`
- AND the clarify predicate MUST evaluate to `true`

#### Scenario: Validator rejects a missing signal

- GIVEN a successful `sdd-spec` envelope omits any of the four fields
- WHEN either canonical validator checks it
- THEN validation MUST fail with an error identifying the missing field
- AND the envelope MUST NOT be accepted as a valid successful `sdd-spec` result

#### Scenario: Validator rejects a malformed signal

- GIVEN a successful `sdd-spec` envelope uses a non-boolean ambiguity flag, a non-array signal, or a non-string array element
- WHEN either canonical validator checks it
- THEN validation MUST fail with an error identifying the malformed field
- AND JavaScript and Go MUST return equivalent validity outcomes
