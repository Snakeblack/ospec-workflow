# Delivery quality (E1.6, E4.5)

Compares the quality of two bench records beyond the hidden checks of
[`../bench/`](../bench/README.md). The bench says whether a delivery meets the
facts; this says how it is built. It is analysis tooling outside the bench
harness, so it never changes `harness_digest`.

## Measures

| Measure | How | Model |
| --- | --- | --- |
| Diff metrics | Product lines per category (source, test, types, docs), test-to-source ratio, workflow files apart, and the delivered suite's test count and status | No |
| Mutation score | One mutant per operator, literal or `throw` on each production line the agent added (equality, relational, logical, arithmetic, boolean, integer literal, `throw` → `void`), up to 60 per delivery, run against the delivered suite in a copy of the workspace that links its `node_modules`. In an `.html` file only the lines of its inline JavaScript blocks are mutated, never markup or CSS | No |
| Blind pairwise review | The request, the facts agreed with the user and both scrubbed product diffs, named A and B; scores 1–5 for correctness, readability, design, tests and scope, and the preferred delivery. Each pair runs twice with the order swapped; a preference that flips with the order is reported as `inconsistent` | Yes |

Workflow artifacts (`.ospec/`, `openspec/`, `idd/`, gentle-ai's `odd/` and
`.atl/`, and host directories) and installed dependencies (`node_modules/` and
lockfiles) are counted but never judged. The blind diff replaces workflow words (`openspec`,
`ospec`, `sdd`, `idd`) with `[process]`.

## Running

The workspaces of both records must still exist under the bench root (default:
`scripts/evals/.runs/bench`, where the bench archives each judged workspace as
`<record>/<scenario>[/r<n>]/workspace`). Records from before E4.5 left theirs in
the system temp directory: pass `--bench-root <tmp>/ospec-bench`.

```sh
node scripts/evals/quality/quality.js collect --baseline sdd-baseline-3 --candidate idd-2
node scripts/evals/quality/quality.js judge   --baseline sdd-baseline-3 --candidate idd-2
node scripts/evals/quality/quality.js report  --baseline sdd-baseline-3 --candidate idd-2
```

With `--corpus greenfield --repetitions 3` (E4.5) every repetition is a
delivery, paired with the same repetition of the other record (`todo-spa/r1`
…), and `judge --host agy` runs the review on the Antigravity CLI
(`claude-sonnet-5-5-medium` by default) from a fresh, rule-free HOME, with the
prompt on stdin. When `margins.json` declares a `quality` criterion, `report`
ends with its verdict: the candidate's mean mutation score (with each arm's
95 % interval) may trail the baseline's by at most its points, a delivered
suite that fails before any mutant counts as 0, and the blind review may
prefer the baseline in both orders in at most its pairs; an unjudged pair also
gives `revise`.

`collect` saves each product diff under
`results/<baseline>__<candidate>/deliveries/<record>/<scenario>.diff` and the
measures in `quality.json`, so the comparison survives a cleaned temp
directory. `judge` uses the bench's Claude configuration
(`~/.ospec-bench/claude`, `--config-dir`) and `claude-haiku-5-5` (`--model`;
user decision, 2026-10-21), skips scenarios already judged, and records its
cost. The bench checkpoint reads `quality.json` too: margins that declare
quality revise with `quality-missing` until the pair has one, and the criterion
it applies lives in `criterion.js`.

## Limits

- One delivery per scenario and arm: the comparison is exploratory.
- Equivalent mutants survive in both arms alike; the score compares arms, it is
  not an absolute coverage figure.
- The judge is the same model family that wrote both deliveries; swapping the
  order controls position bias, not taste.
