# acme-tool

Fixture repo for the handbook route's write-boundary golden scenario.
`handbook/handbook.json` sets `web: false`, so the boundary is `handbook/`
plus the top-level `AGENTS.md` and `CLAUDE.md`. `src/leaked-notes.txt` is
materialized already present but deliberately left **untracked** relative to
this fixture's git baseline (see `GIT-BASELINE.json`'s
`post_baseline_untracked`), simulating a path that a run of the `handbook`
agent left outside its boundary. The orchestrator's mandatory post-run
boundary check MUST detect it and halt with the two-option `question_gate`
(abort vs. acknowledge), never closing the route silently.
