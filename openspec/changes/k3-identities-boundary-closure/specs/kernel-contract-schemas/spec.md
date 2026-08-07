# Delta for kernel-contract-schemas

## ADDED Requirements

### Requirement: Canonical V2 Identity Schema Publication And Registry {#REQ-kernel-contract-schemas-013}

Candidate v2 and WorkOrder v2 schemas MUST be published at filesystem paths `schemas/kernel/candidate/v2.schema.json` and `schemas/kernel/work-order/v2.schema.json` with `$id` values `ospec://schemas/kernel/candidate/v2` and `ospec://schemas/kernel/work-order/v2` respectively. Both schemas MUST be registered in `schemas/kernel/manifest.json` and `schemas/kernel/contract-claims.json`. Publication under wrong directory layouts `schemas/kernel/candidate-v2/` or `schemas/kernel/work-order-v2/` MUST NOT remain as the canonical publication; those paths MUST be removed or replaced by the canonical paths above.

#### Scenario: V2 schemas resolve at canonical paths and ids

- GIVEN the published contract suite after this change
- WHEN Candidate v2 and WorkOrder v2 schemas are resolved
- THEN files MUST exist at `schemas/kernel/candidate/v2.schema.json` and `schemas/kernel/work-order/v2.schema.json`
- AND `$id` MUST be `ospec://schemas/kernel/candidate/v2` and `ospec://schemas/kernel/work-order/v2`

#### Scenario: Manifest and contract-claims register v2 families

- GIVEN `schemas/kernel/manifest.json` and `schemas/kernel/contract-claims.json`
- WHEN Candidate v2 and WorkOrder v2 entries are inspected
- THEN each family MUST be registered with its canonical path and `$id`
- AND consumers MUST be able to pin those versions via the registry

#### Scenario: Wrong candidate-v2 and work-order-v2 layouts are not canonical

- GIVEN residual directories `schemas/kernel/candidate-v2/` or `schemas/kernel/work-order-v2/`
- WHEN publication layout is validated
- THEN those paths MUST NOT be treated as the authoritative v2 schema locations

### Requirement: K1 Historical V1 Content And Pin Restore {#REQ-kernel-contract-schemas-014}

Historical pre-K3 `candidate/v1` and `work-order/v1` schema file contents and their `K1_SCHEMA_BASELINE` pins MUST be restored from the `02e97a5` era. The system MUST restore file content and update pins to match those restored files. The system MUST NOT retarget `K1_SCHEMA_BASELINE` pins alone to match mutated post-`02e97a5` files while leaving drifted v1 content in place. Verification MUST NOT claim K1 pins intact when v1 schema file digests have drifted from the restored baseline.

#### Scenario: V1 files and pins match 02e97a5-era baseline

- GIVEN `schemas/kernel/candidate/v1.schema.json`, `schemas/kernel/work-order/v1.schema.json`, and `K1_SCHEMA_BASELINE`
- WHEN compared to the `02e97a5`-era historical content and pins
- THEN file contents and pin digests MUST match that era
- AND pins MUST hash the restored files

#### Scenario: Pin-only retarget without content restore is forbidden

- GIVEN drifted v1 schema files that no longer match `02e97a5`-era content
- WHEN a remediation only rewrites `K1_SCHEMA_BASELINE` pin digests to the drifted files
- THEN that remediation MUST be rejected as non-compliant
- AND verify MUST NOT report pins intact under that condition

## MODIFIED Requirements

### Requirement: Execution Identity Schemas With Non-Aliasing Fixtures {#REQ-kernel-contract-schemas-012}

The contract suite MUST publish versioned JSON Schemas for `SourceSnapshot`, `WorkOrder`, `WorkResult`, and `Candidate` execution identity families. Each identity schema MUST declare a stable `$id` and explicit version field. The suite MUST define Candidate v2 and WorkOrder v2 at canonical paths `schemas/kernel/candidate/v2.schema.json` (`$id: "ospec://schemas/kernel/candidate/v2"`) and `schemas/kernel/work-order/v2.schema.json` (`$id: "ospec://schemas/kernel/work-order/v2"`) with explicit `kind` field ("candidate/v2" and "work-order/v2"). Baseline `candidate/v1.schema.json`, `work-order/v1.schema.json`, and `K1_SCHEMA_BASELINE` MUST remain immutable relative to the restored `02e97a5`-era content (see K1 historical restore). Each identity family MUST include valid fixtures and negative non-aliasing fixtures demonstrating that `WorkResult` cannot validate as `Candidate`, and `Candidate` cannot validate as `CandidateEvaluationAttestation` or `DeliveryAuthorization`.
(Previously: Named v2 schemas and v1 immutability without canonical path/`$id` registry closure or `02e97a5` restore semantics.)

#### Scenario: K3 identity families expose stable id and version

- GIVEN the published contract suite after this change
- WHEN SourceSnapshot, WorkOrder, WorkResult, and Candidate schemas are inspected
- THEN each MUST expose a non-empty stable `$id`
- AND MUST expose an explicit version identifier

#### Scenario: Identity confusion negative fixtures fail validation

- GIVEN negative fixtures cross-substituting WorkResult, Candidate, CandidateEvaluationAttestation, and DeliveryAuthorization structures
- WHEN schema validation runs for each family
- THEN validation MUST fail closed
- AND the failure MUST identify the schema kind or identifier mismatch

#### Scenario: Schema v2 exposes explicit kind discriminator for candidate and work-order

- GIVEN a candidate/v2 or work-order/v2 JSON payload
- WHEN validated against `candidate/v2.schema.json` or `work-order/v2.schema.json`
- THEN the payload MUST contain property `kind` matching `"candidate/v2"` or `"work-order/v2"` respectively
- AND payloads lacking `kind` or carrying invalid `kind` values MUST be rejected fail-closed

#### Scenario: Legacy v1 schemas and K1 baseline remain intact and immutable

- GIVEN `candidate/v1.schema.json`, `work-order/v1.schema.json`, and `K1_SCHEMA_BASELINE` pins
- WHEN verified against repository schema baseline rules after `02e97a5`-era restore
- THEN v1 schemas MUST match the restored historical content
- AND MUST NOT be mutated by v2 publication or pin-only retargeting
