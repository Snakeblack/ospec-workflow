# Bench (E4.1)

Measures a workflow mode with real agents on six fixed scenarios, so E1.6 can
decide with predeclared numbers whether IDD becomes the default entry.
Contract: `openspec/specs/bench/spec.md` (REQ-bench-001 to 006). Measurement
tooling only: it grants no authority and never runs a model in `npm test`.

## Pieces

| File | Role |
| --- | --- |
| `scenarios/<id>/` | `scenario.json` (brief and hidden facts), `repo/` (the seed the agent gets), `checks.js` (hidden checks) |
| `__fixtures__/reference/<id>/` | A correct delivery per scenario; `checks.test.js` proves every check passes on it and acceptance fails on the seed |
| `scenarios.js` | Loads and validates the corpus, digests it, materializes a seed |
| `checks.js`, `check-runner.js`, `check-kit.js` | Run each hidden check in its own process against the delivered workspace |
| `arms.js` | `sdd` (init, `sdd-new`, archived change) and `idd` (declared, unavailable until E1.6) |
| `persona.js` | The simulated user: brief, facts, and goal; classifies each agent message and answers |
| `driver.js` | Seed → git → setup (unmeasured; the persona only knows the setup goal, and a setup that edits the seed voids the run) → change conversation → hidden checks |
| `hosts/claude.js` | Headless `claude -p` turns and persona calls in a dedicated config directory, with the plugin built from the checkout |
| `transcript.js` | Usage, cost, and session from a `stream-json` transcript (`modelUsage` includes subagents) |
| `record.js` | The versioned record of one arm and its Markdown report |
| `checkpoint.js`, `margins.json` | Predeclared margins and the continue/revise decision |
| `stats.js` | Per-scenario 95% t interval (the task is the statistical unit) |
| `bench.js` | CLI |

## Scenarios

| Profile | Change | What the hidden facts test |
| --- | --- | --- |
| `cli-local` | Task priorities in a terminal CLI | Default, invalid values, legacy files, ties, output parsed by scripts |
| `saas-small` | Sharing notes in a multi-tenant API | Owner only, no cross-tenant sharing, read-only, idempotence |
| `regulated` | CSV export of a clinic's appointments | No national id or diagnosis, audit trail, roles, CSV escaping |
| `brownfield` | Discount codes in untested legacy invoicing | Discount before VAT, shipping threshold, case, unknown codes, history to the cent |
| `public-library` | Days in a published duration library | No behavior change in a minor release, opt-in option, types, changelog |
| `bugfix` | Pagination with an extra empty page | 1-based pages, out-of-range pages, empty lists, invalid page size |

The facts are what a careful engineer would ask about, never trivia. An agent
that does not ask may still get them right from the code; one that asks gets
them from the persona.

## Running

The run drives real agents and spends tokens. Log in once in the bench's own
configuration directory, so your `CLAUDE.md`, installed plugins, MCP servers,
and memory stay out of the measurement:

```powershell
$env:CLAUDE_CONFIG_DIR="$HOME\.ospec-bench\claude"; claude
```

Then:

```sh
node scripts/evals/bench/bench.js list
node scripts/evals/bench/bench.js run --arm sdd --record sdd-baseline-3 --repetitions 1
node scripts/evals/bench/bench.js report --record sdd-baseline-3
node scripts/evals/bench/bench.js checkpoint --baseline sdd-baseline-3 --candidate idd-1
```

`run` builds the plugin from the checkout, materializes each scenario under
the system temp directory (`ospec-bench/<record>/<scenario>[/r<n>]`), writes the
record to `records/<record>.json` after every run, and keeps transcripts
under `scripts/evals/.runs/bench/` (gitignored). `--repetitions <n>` runs every
scenario n times, repetition by repetition (default 1). Rerunning the same
record skips complete runs (`--force` reruns them) and refuses a different host,
model, plugin build, persona, corpus, harness, or repetition count. When the
host's usage quota runs out (HTTP 429, such as a subscription session limit),
`run` stops at once with exit code 3 and does not record the interrupted run:
the same command resumes after the reset. Defaults: model `claude-sonnet-5-5`,
persona `claude-sonnet-5-5`, 30 agent turns and $25 per scenario
(`--model`, `--persona-model`, `--max-turns`, `--max-cost`).

## Metrics

- **Tokens:** input, output, cache reads, and cache writes of every model in the
  change conversation, subagents included. Setup and persona are reported apart.
- **Duration:** wall clock of the host processes.
- **Questions:** agent messages the persona classifies as `question` or
  `approval`; **decision-changing** when the answer discloses a fact or departs
  from the agent's recommendation.
- **Interventions:** every persona reply.
- **Escaped defects:** hidden checks the delivered workspace fails. A run that
  never reached the change (voided setup) is not judged and shows as such.
- **Repetitions:** the report adds the mean of each scenario over its
  repetitions; the total of those means compares with a one-repetition record.
  Schema 1 records (one run per scenario, such as `sdd-baseline-2`) still read
  as one repetition.

## Checkpoint

`margins.json` (`bench-margins-3`) is declared before any comparison: both
arms run every scenario `repetitions: 1` time (the subscription quota does not
allow more; with one run per scenario the comparison is exploratory); summed over the per-scenario
means, the candidate may not escape more defects than the baseline
(`max_mean_delta: 0`) and must spend at most 90% of its tokens
(`max_total_ratio: 0.9`). Fixed in code: incomparable records (including
another repetition count), incomplete or missing runs, and any hidden check the
baseline passes in every repetition and the candidate fails in any force
`revise`. A new campaign that needs other margins declares a new version first.

## Limits

- One host (Claude Code) and one model per record. The mode comparison needs no
  more; a host adapter for Codex can be added beside `hosts/claude.js`.
- The persona is a model: its classification is checked only by the record's
  conversation log, which keeps every message (clipped) for audit.
- Isolation from the hidden checks is by location: they live in this
  repository and the workspace lives under the system temp directory.
