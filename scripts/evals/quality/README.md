# Delivery quality (E1.6)

Compares the quality of two bench records beyond the hidden checks of
[`../bench/`](../bench/README.md). The bench says whether a delivery meets the
facts; this says how it is built. It is analysis tooling outside the bench
harness, so it never changes `harness_digest`.

## Measures

| Measure | How | Model |
| --- | --- | --- |
| Diff metrics | Product lines per category (source, test, types, docs), test-to-source ratio, workflow files apart, and the delivered suite's test count and status | No |
| Mutation score | One mutant per operator, literal or `throw` on each production line the agent added (equality, relational, logical, arithmetic, boolean, integer literal, `throw` → `void`), up to 60 per delivery, run against the delivered suite in a copy of the workspace | No |
| Blind pairwise review | The request, the facts agreed with the user and both scrubbed product diffs, named A and B; scores 1–5 for correctness, readability, design, tests and scope, and the preferred delivery. Each pair runs twice with the order swapped; a preference that flips with the order is reported as `inconsistent` | Yes |

Workflow artifacts (`.ospec/`, `openspec/`, `idd/` and host directories) are
counted but never judged. The blind diff replaces workflow words (`openspec`,
`ospec`, `sdd`, `idd`) with `[process]`.

## Running

The workspaces of both records must still exist under the bench root (default:
the system temp directory, `ospec-bench/<record>/<scenario>[/r1]`).

```sh
node scripts/evals/quality/quality.js collect --baseline sdd-baseline-3 --candidate idd-2
node scripts/evals/quality/quality.js judge   --baseline sdd-baseline-3 --candidate idd-2
node scripts/evals/quality/quality.js report  --baseline sdd-baseline-3 --candidate idd-2
```

`collect` saves each product diff under
`results/<baseline>__<candidate>/deliveries/<record>/<scenario>.diff` and the
measures in `quality.json`, so the comparison survives a cleaned temp
directory. `judge` uses the bench's Claude configuration
(`~/.ospec-bench/claude`, `--config-dir`) and `claude-sonnet-5-5` (`--model`),
skips scenarios already judged, and records its cost.

## Limits

- One delivery per scenario and arm: the comparison is exploratory.
- Equivalent mutants survive in both arms alike; the score compares arms, it is
  not an absolute coverage figure.
- The judge is the same model family that wrote both deliveries; swapping the
  order controls position bias, not taste.
