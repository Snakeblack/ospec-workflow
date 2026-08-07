# ADR-004: Dual-Domain WorkOrder Digest Versioning

- Status: proposed
- Change: k3-identities-boundary-closure
- Date: 2026-08-07

## Context
`computeWorkOrderId` always hashes under domain `work-order/v1`, even for `kind: "work-order/v2"` payloads, allowing cross-version digest aliasing.

## Decision
Derive digest domain from WorkOrder identity: `kind === "work-order/v2"` or `schema_version === 2` → domain `work-order/v2`; otherwise `work-order/v1`. Keep Candidate compute domain as `candidate/v1` for this change.

## Alternatives
- Always switch to `work-order/v2` — rejected; breaks legitimate v1 callers.
- Also rename Candidate domain to `candidate/v2` — deferred; not required by closure #8.

## Consequences
Stored WorkOrder v2 IDs must be recomputed after upgrade. Adversarial tests must prove same payload yields distinct digests across domains. Callers minting v2 orders must set `kind`/`schema_version` correctly before hashing.
