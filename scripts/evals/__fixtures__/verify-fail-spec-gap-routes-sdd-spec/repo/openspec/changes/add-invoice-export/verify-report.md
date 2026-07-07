# Verify Report: add-invoice-export

**Result**: FAIL

**CRITICAL**: The CSV export includes refunded/voided invoices with no way to
filter them out, contradicting the spec's implied "reconcile monthly totals"
purpose; the spec itself never defines the expected row filter, so this is a
gap in the specification, not the implementation. (origin `spec-gap`)

**WARNING**: None

## Traceability Matrix

| REQ | Task | Commit | Test |
|-----|------|--------|------|
| REQ-invoicing-001 | 1.1, 1.2 | (pending) | (pending) |
