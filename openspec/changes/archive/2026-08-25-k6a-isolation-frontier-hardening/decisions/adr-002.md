# ADR-002: WorkerIsolation Live-Identity Binding Without Schema Field

- Status: proposed
- Change: k6a-isolation-frontier-hardening
- Date: 2026-08-25

## Context
WorkerIsolation `enforced` must bind to the executing `WorkerTransport` (`port_id` / fingerprint). Adding those as required CapabilityProof document fields would change the public proof schema. REQ-005 already owns live identity via expected inputs + probe digest.

## Decision
Extend `verifyCapabilityProof` expected inputs with `expectedPortId` and `expectedFingerprint` when `capabilityId` is `WorkerIsolation`. Put the same pair in semantic evidence (already covered by `evidence_digest`). The CapabilityProof document required-field list does not gain `port_id` or `fingerprint`. ExecuteWorkOrder supplies the executing transport identity as those expected inputs.

## Alternatives
- *New required proof schema fields*: Rejected (sdd-spec-001); breaks existing proofs and implies isolation is a document-owned port.
- *Bind only via probe digest*: Digest match can succeed while commands run on a different port unless identity is an explicit expected input.
- *Sixth host port for isolation*: Rejected; isolation is a capability on WorkerTransport.

## Consequences
Missing identity fails with `expected-field-missing` and a path. F vs G fails closed without schema migration. `resolveCapabilityState` must forward the two expected inputs. Easily reversible internally; public proof documents stay compatible.
