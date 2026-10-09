# Latest Session

- Ended at: `2026-10-09T12:00:00Z`
- Session: `session-idd`
- Active change: `s-checks`, `s-close`, `s-contract`, `s-gate`, `s-living`, `s-migration`, `s-review`, `s-tdd`, `s-vague` (ambiguous: 9 open changes)
- Current phase: `multiple`
- Change status: `multiple`
- Detailed summary: `None`

## Next recommended action
Several changes are open; choose the one to resume:
- `s-checks` (idd): Satisfy `checks-pass` with check-run evidence: ospec check --change s-checks.
- `s-close` (idd): Close it: `ospec close --change s-close`.
- `s-contract` (idd): Satisfy `contract-spec-and-test` with contract-spec-and-test evidence: update the contract document and its test, then ospec check --change s-contract.
- `s-gate` (idd): Resolve the `irreversible-operation` gate with the user: `ospec next --change s-gate` shows what to ask.
- `s-living` (idd): Satisfy `living-doc` with living-doc-current evidence: write the Plan and Decisions of idd/s-living/change.md, then ospec close --change s-living.
- `s-migration` (idd): Satisfy `migration-compat-and-test` with migration-test evidence: ospec run --change s-migration --obligation migration-compat-and-test --command "<migration test>" --plan "<compatibility or rollback>".
- `s-review` (idd): Satisfy `trust-review` with frozen-review evidence: ospec review start --change s-review, dispatch review-trust on the returned paths, then ospec review record --change s-review --result '<findings json>'.
- `s-tdd` (idd): Satisfy `tdd-red-green` with tdd-red-green evidence: ospec run --change s-tdd --obligation tdd-red-green --command "<test>" [--unit <name>]: failing before the code, passing after it.
- `s-vague` (idd): Resolve the `ambiguous-intent` gate with the user: `ospec next --change s-vague` shows what to ask.
