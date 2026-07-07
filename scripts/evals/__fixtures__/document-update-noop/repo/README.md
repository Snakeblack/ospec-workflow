# acme-tool

Fixture repo for the `/sdd-document` update-mode no-op golden scenario.
`openwiki/.last-update.json` already persists `doc_language`/`scope_choice`
and a `gitHead` matching the workspace's baseline commit, and the source tree
has no drift since that commit. `sdd-document` MUST report no changes and
MUST NOT write any new output files; `state.yaml` MUST be left untouched.

This fixture's `GIT-BASELINE.json` marker (consumed by
`scripts/evals/run.js setup`, see `scripts/evals/README.md`'s driver
protocol) tells the harness to `git init` + commit this tree as the baseline
and resolve the `__GIT_HEAD__` placeholder in `openwiki/.last-update.json`
before the live orchestrator turn runs.
