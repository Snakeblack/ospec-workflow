# acme-tool

Fixture repo for the handbook route's first-run golden scenario. No
`handbook/handbook.json` exists yet, so the `handbook` agent returns ONE
`question_gate` with both settings — the handbook language and whether to
build the website — and the orchestrator asks them in a single round, never
as two separate blocking round-trips.
