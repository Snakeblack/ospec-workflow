# invoicing Specification

## Requirement: CSV Export {#REQ-invoicing-001}

The system MUST expose an endpoint that exports invoices as CSV.

### Scenario: Export current month invoices

- GIVEN invoices exist for the current month
- WHEN a user requests the CSV export
- THEN the response MUST contain one row per invoice
