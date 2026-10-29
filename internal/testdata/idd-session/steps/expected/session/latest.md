# Latest Session

- Ended at: `2026-10-09T12:00:00Z`
- Session: `session-idd`
- Active change: `s-adr`, `s-boundary`, `s-checks`, `s-checks-changed`, `s-close`, `s-contract`, `s-gate`, `s-limit`, `s-living`, `s-migration`, `s-review`, `s-tdd`, `s-vague` (ambiguous: 13 open changes)
- Current phase: `multiple`
- Change status: `multiple`
- Detailed summary: `None`

## Next recommended action
Several changes are open; choose the one to resume:
- `s-adr` (idd): Satisfy `adr-impact-declaration` with adr-impact-declaration evidence: ospec record impact --change s-adr (--adr <id> | --quality <id>) --impact <none|conforms|amends|supersedes|contradicts> --reason "<why>" [--record <new ADR>], then ospec check --change s-adr.
- `s-boundary` (idd): Satisfy `boundary-tests` with tested-check evidence: ospec check --change s-boundary after the diff adds a test for the product code; the output must report tests greater than 0, and the test must fail against the base product.
- `s-checks` (idd): Satisfy `checks-pass` with check-run evidence: ospec check --change s-checks; a run that reports tests 0 is not evidence.
- `s-checks-changed` (idd): Resolve the `checks-changed` gate with the user: `ospec next --change s-checks-changed` shows what to ask.
- `s-close` (idd): Close it: `ospec close --change s-close`.
- `s-contract` (idd): Satisfy `contract-spec-and-test` with contract-spec-and-test evidence: in one diff, touch a contract document and its test (contracts.documents and contracts.tests of idd/config.yaml), then ospec check --change s-contract.
- `s-gate` (idd): Resolve the `irreversible-operation` gate with the user: `ospec next --change s-gate` shows what to ask.
- `s-limit` (idd): Resolve the `review-limit` gate with the user: `ospec next --change s-limit` shows what to ask.
- `s-living` (idd): Satisfy `living-doc` with living-doc-current evidence: the CLI writes the Plan of idd/s-living/change.md from --path and its Decisions from --decision "<text>"; add by hand what they leave out, then ospec close --change s-living.
- `s-migration` (idd): Satisfy `migration-compat-and-test` with migration-test evidence: ospec run --change s-migration --obligation migration-compat-and-test --command "<migration test>" --plan "<compatibility or rollback>".
- `s-review` (idd): Satisfy `trust-review` with frozen-review evidence: ospec review start --change s-review, dispatch review-trust on the returned paths, then ospec review record --change s-review --result '<findings json>'.
- `s-tdd` (idd): Satisfy `tdd-red-green` with tdd-red-green evidence: ospec run --change s-tdd --obligation tdd-red-green --command "<test>" [--unit <name>]: failing before the code, passing after it, with the test in a test file of the diff; it must also fail against the base product.
- `s-vague` (idd): Resolve the `ambiguous-intent` gate with the user: `ospec next --change s-vague` shows what to ask.
