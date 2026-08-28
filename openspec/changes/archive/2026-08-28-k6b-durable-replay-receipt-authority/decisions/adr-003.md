# ADR-003: Persist records; reissue ephemeral channel after restart

- Status: proposed
- Change: k6b-durable-replay-receipt-authority
- Date: 2026-08-28

## Context
ADR-014 made `runnerReceiptChannel` an opaque WeakMap capability. REQ-006 listed that channel as persistable; a restart empties the WeakMap and replay cannot reconstruct authority from public fields.

## Decision
Persist only `runner-receipt/v1` records via `persistRunnerReceipts` after a trusted `readRunnerReceiptChannel`. Do not serialize the channel or WeakMap. On restart, `rehydrateAndIssueRunnerReceiptChannel` validates schema, recomputes `receipt_id`, fail-closes on divergence, and calls `issueRunnerReceiptChannel` so the new process gets a **new** channel object. `verifyCandidate` consumption, strategy, and MUST-walk stay unchanged. Kind mismatch on CAS fails closed with `receipt-kind-mismatch` and does not advance head.

## Alternatives
- Serialize WeakMap / channel identity — rejected: copies of `kind`/`issuer_id`/`transport` would become authority.
- Persist inside `verifyCandidate` — rejected: remodeled the consumption path and coupled unit tests to the store.
- Reuse pre-restart channel identity — rejected: IV-009 requires a newly issued capability.

## Consequences
- Easier: unit tests keep issuing in-process channels; restart tests load the bag and reissue.
- Harder: trusted runtimes MUST call persist after successful verify; omitting the store leaves receipts non-durable.
- Reversibility: High for the helper module; the WeakMap contract remains ADR-014.
