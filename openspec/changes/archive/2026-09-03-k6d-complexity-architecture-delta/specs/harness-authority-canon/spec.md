# Delta for harness-authority-canon

## ADDED Requirements

### Requirement: K6d Reports Are Advisory Candidate-Bound Evidence {#REQ-harness-authority-canon-013}

Normative harness documentation MUST label K6d complexity-architecture-delta
reports and anti-overengineering findings as `implemented` advisory,
Candidate-bound evidence. They MUST NOT become semantic, review, lifecycle,
promotion, attestation, or delivery authority. K7 review/findings, K8
Evaluation Attestation, and K9 promotion or DeliveryAuthorization MUST remain
`target` or later-slice work and MUST NOT be labeled implemented by K6d.

#### Scenario: K6d is available without authority promotion

- GIVEN documentation listing K6d reports and its later consumers
- WHEN maturity and authority labels are validated
- THEN K6d MUST be labeled implemented advisory evidence
- AND OpenSpec, Git, and the frozen Candidate MUST remain authoritative

#### Scenario: K6d output is used as a decision authority

- GIVEN an operation that approves review, promotion, or delivery solely from a K6d report
- WHEN authority is evaluated
- THEN the operation MUST fail closed with a structured reason
- AND K7, K8, and K9 MUST remain non-implemented by K6d

