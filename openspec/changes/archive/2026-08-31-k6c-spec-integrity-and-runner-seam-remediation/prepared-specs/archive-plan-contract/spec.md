# archive-plan-contract Specification

## Purpose

Defines schema v1 of `archive-plan.json` — the semantic/deterministic boundary for hybrid archive. The agent emits the plan; a pure validator checks structure, integrity, and referenced input hashes without interpreting Markdown meaning. JS/Go parity is N/A for this domain (no Go archive consumer).

## Requirements

### Requirement: Archive Plan Schema v1 {#REQ-archive-plan-contract-001}

An `archive-plan.json` document MUST declare `schema_version: 1` and MUST include these fields:

| Field | Meaning |
|-------|---------|
| `change` | Change name string matching the active change folder |
| `source_fingerprint` | SHA-256 identity of the origin change folder inventory |
| `spec_writes[]` | Each entry: `domain`, `source_delta`, `target`, `target_before_sha256`, `content_sha256` |
| `adr_promotions[]` | Each entry: `source`, `target`, `content_sha256` (empty array when none) |
| `archive_inventory[]` | Relative paths that MUST exist under the origin change folder |
| `accepted_warnings[]` | Explicitly accepted verify warnings (empty when none) |
| `rollback.strategy` | MUST be `"staging-rename"` for schema v1 |

The validator MUST treat unknown `schema_version` values as invalid. It MUST NOT parse or judge Markdown semantics of spec/ADR content — only bytes and references.

#### Scenario: Valid minimal plan parses

- GIVEN a JSON object with `schema_version: 1` and all required fields populated (arrays MAY be empty)
- WHEN the plan validator runs
- THEN validation succeeds
- AND no I/O beyond reading the plan bytes is required of the pure validator

#### Scenario: Unknown schema version rejected

- GIVEN a plan with `schema_version` other than `1`
- WHEN the plan validator runs
- THEN validation fails fail-closed
- AND the rejection code is from the allowlisted set

### Requirement: Fail-Closed Hash, Reference, and Content Integrity Validation {#REQ-archive-plan-contract-002}

When validating against a filesystem snapshot, the validator (or the transaction preflight that consumes it) MUST reject the plan fail-closed if any of the following hold:
1. A referenced path is missing.
2. `target_before_sha256` does not match current target bytes.
3. `content_sha256` does not match prepared content bytes.
4. `source_fingerprint` does not match the origin inventory.
5. `archive_inventory` omits or extra-lists paths relative to the origin.
6. Any prepared spec in `spec_writes` contains corrupted content (such as literal `undefined` or invalid placeholder tokens).
7. Any prepared spec in `spec_writes` silently drops or omits requirement identifiers (`{#REQ-...}`) present in the baseline target (`target_before`) without an explicit declaration under `## REMOVED Requirements`.

Hash mismatches, corruption tokens, and undeclared dropped requirement IDs MUST block; the validator MUST NOT coerce, repair, or ignore them.

(Previously: validation only verified hashes, references, and inventory without inspecting prepared spec content for corruption tokens or undeclared dropped requirement IDs.)

#### Scenario: Wrong content hash blocks

- GIVEN a plan whose `spec_writes[0].content_sha256` does not match the prepared content bytes
- WHEN validation runs
- THEN the plan is rejected fail-closed
- AND no mutation of main specs or the origin folder is performed by the validator

#### Scenario: Stale target_before_sha256 blocks

- GIVEN `openspec/specs/{domain}/spec.md` bytes differ from `target_before_sha256`
- WHEN validation runs
- THEN the plan is rejected with an allowlisted stale/mismatch code

#### Scenario: Prepared spec containing literal undefined token is rejected fail-closed

- GIVEN a prepared spec content containing the literal token `undefined`
- WHEN plan validation runs against the snapshot
- THEN the plan MUST be rejected fail-closed with rejection code `corrupted-spec-content`
- AND no mutation of main specs or archive commit MUST proceed

#### Scenario: Undeclared dropped requirement ID is rejected fail-closed

- GIVEN a baseline target spec containing `{#REQ-example-003}` and prepared content that omits `{#REQ-example-003}` without a REMOVED declaration
- WHEN plan validation runs against the snapshot
- THEN the plan MUST be rejected fail-closed with rejection code `dropped-requirement-id`
- AND no spec writes MUST be authorized

### Requirement: Allowlisted Rejection Codes {#REQ-archive-plan-contract-003}

Plan validation failures MUST surface only allowlisted machine-readable codes. Schema v1 MUST recognize at least:

| Code | When |
|------|------|
| `invalid-schema` | Missing/extra required fields, wrong types, or unsupported `schema_version` |
| `invalid-rollback-strategy` | `rollback.strategy` ≠ `staging-rename` |
| `missing-reference` | Referenced path absent |
| `hash-mismatch` | Any declared SHA-256 does not match bytes |
| `inventory-mismatch` | `archive_inventory` / `source_fingerprint` disagree with origin |
| `change-name-mismatch` | `change` ≠ active change folder name |
| `corrupted-spec-content` | Prepared spec content contains literal `undefined` or invalid corruption tokens |
| `dropped-requirement-id` | Prepared spec content silently omits requirement identifiers present in `target_before` |

Arbitrary diagnostic prose MUST NOT replace these codes as the authoritative failure identity. Additional codes MAY be added in later schema versions; v1 consumers MUST treat unknown codes as fail-closed rejections.

(Previously: allowlisted codes only included schema, reference, hash, inventory, and change-name mismatch codes.)

#### Scenario: Rejection uses allowlisted code only

- GIVEN an invalid plan (e.g. missing `source_fingerprint` or containing corrupted spec content)
- WHEN validation fails
- THEN the result includes at least one allowlisted code from the v1 set
- AND the failure does not claim success

#### Scenario: Unknown future code still fails closed

- GIVEN a validator result carrying a code not in the caller's known v1 set
- WHEN a consumer interprets the result
- THEN it MUST treat the plan as rejected (fail-closed)
