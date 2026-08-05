# ADR-001: Live Expected-Identity And Probe Binding On Verify

- Status: proposed
- Change: k2a-1-live-capability-probes-async-transports
- Date: 2026-08-05

## Context
K2a `verifyCapabilityProof` recomputed digests from versions declared inside the
proof, so a foreign adapter/host or fixture-only digest could still verify.
K3 must not treat that as live enforcement authority.

## Decision
Require an options-object verify API with `expectedAdapterId`,
`expectedAdapterVersion`, `expectedHostRuntimeVersion`, and
`expectedProbeDigest`. Extend CapabilityProof with `adapter_id` and
`probe_digest`. Keep fixture `evidence_digest` via `createEvidenceDigest`; add
`createProbeDigest` under domain `capability-probe/v1`. Fail closed when any
expected field is missing, identities mismatch, or
`expectedProbeDigest` equals the fixture digest.

## Alternatives
- Soft/optional live fields: rejected — callers can omit binding and CRITICAL 3 remains.
- Replace fixture digest with probe digest: rejected — destroys proof reproducibility.
- Keep positional API: rejected — cannot express required expected identity cleanly.

## Consequences
All verify call sites migrate in-change. Fixture proofs alone cannot authorize
`enforced`. Live probes produce a distinct digest domain from fixture evidence.
