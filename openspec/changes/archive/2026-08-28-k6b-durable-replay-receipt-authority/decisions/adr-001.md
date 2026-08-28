# ADR-001: Distinct CAS collection field `runner_receipts`

- Status: proposed
- Change: k6b-durable-replay-receipt-authority
- Date: 2026-08-28

## Context
AS-018 requires a durable bag for `runner-receipt/v1` that MUST NOT overload `authority.receipts` (OperationReceipt). The public field name was design-owned.

## Decision
Persist runner receipts in additive CAS field `runner_receipts` at the revision-record root (sibling of `authority`, `journal`, `state`, `budgets`). Key by `receipt_id`. Accept only `kind: "runner-receipt/v1"`. `authority.receipts` remains OperationReceipt-only.

## Alternatives
- Nest `authority.runner_receipts` — rejected: mixes families in the authority bag and conflicts with AS-018 restore-together-with-the-authority-bag wording.
- Overload `authority.receipts` — rejected: forbidden by proposal and AS-018.
- CamelCase `runnerReceipts` — rejected: store JSON uses snake_case (`receipts`, `budgets`).

## Consequences
- Easier: FileSystemStore load/commit can copy one additive field; `digestAuthority` stays OperationReceipt-shaped.
- Harder: every `inner.commit` / `computeRevision` call site must thread the sibling bag so lifecycle CAS cannot drop it.
- Reversibility: High for empty heads (field absent ≡ `{}`); costly once non-empty bags exist on disk.
