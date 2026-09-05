# Approval Ledger

Blocking workflow decisions must be persisted.

## Valid approval sources

- `AskUserQuestion`
- explicit approval already persisted in `openspec/changes/{change-name}/state.yaml`

## Invalid approval sources

- conversation summary
- inferred user intent
- previous assistant statement
- "the user probably wanted..."

## State shape

```yaml
approvals:
  - id: string
    gate: execution-mode | delivery-strategy | review-workload | architecture | testing | archive-warning | intent-briefing
    decision: string
    source: AskUserQuestion
    accepted_at: ISO-8601
    applies_to:
      - sdd-apply
```

`synthesis` and `scope` are obligatory only for `intent-briefing` (agreed functional restatement and in/out-of-scope boundary) and MUST NOT appear on other gates. For `intent-briefing`, `applies_to` MUST include `change-classification`. An `intent-briefing` approval MUST NOT substitute the `confidence: advisory` route-confirmation gate.
