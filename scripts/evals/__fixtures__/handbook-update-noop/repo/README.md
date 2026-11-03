# acme-tool

Fixture repo for the handbook route's update no-op golden scenario.
`handbook/handbook.json` already holds the settings and `handbook/.state.json`
a `gitHead` matching the workspace's baseline commit, and the source tree has
no drift since that commit. The `handbook` agent MUST report no changes and
MUST NOT write any new output files; `state.yaml` MUST be left untouched.

This fixture's `GIT-BASELINE.json` marker (consumed by
`scripts/evals/run.js setup`, see `scripts/evals/README.md`'s driver
protocol) tells the harness to `git init` + commit this tree as the baseline
and resolve the `__GIT_HEAD__` placeholder in `handbook/.state.json` before
the live orchestrator turn runs.
