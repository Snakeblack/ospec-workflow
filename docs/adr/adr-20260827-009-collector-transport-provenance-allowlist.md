# ADR-003: Strong provenance from collector/transport allowlist

- Status: proposed
- Change: k6b-verification-integrity-remediation
- Date: 2026-08-27

## Context

`normalizeEvidence` currently copies `raw.provenance` into `evidence/v2`. A worker can claim `runtime-observed`. PKI is out of scope. Payload digest identifies bytes, not origin.

## Decision

Derive strong classes (`runtime-observed`, `host-attested`, `tool-produced`) from harness-supplied `collector.id` + `transport` via a fail-closed allowlist (`node-test`/`npm-test`/`node:test` → runtime-observed; `tool-execution` → tool-produced; `host-adapter` → host-attested). Worker/absent/unknown collectors cannot produce a strong class. Store the derived class on `evidence/v2`; never copy collector metadata onto that record.

## Alternatives

- Trust the payload provenance string: rejected; this is the verified defect.
- Require signatures or PKI: rejected; out of scope for this change.
- Treat payload digest as origin: rejected; digest is content identity only.

## Consequences

Callers that claim a strong class must pass allowlisted collector metadata (tests included). Mis-mapped collector ids fail closed rather than silently weakening provenance.
