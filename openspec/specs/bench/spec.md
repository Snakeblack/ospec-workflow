# Bench Specification

## Purpose

The bench (E4.1) measures a workflow mode with real agents on fixed scenarios,
so the decision to make IDD the default entry (E1.6) rests on numbers declared
before the run. It lives in `scripts/evals/bench/`. It is measurement tooling:
it grants no authority, changes no default, and never runs a model inside
`npm test`.

## Requirements

### Requirement: Scenario Corpus {#REQ-bench-001}

The corpus MUST cover the six project profiles `cli-local`, `saas-small`,
`regulated`, `brownfield`, `public-library`, and `bugfix`, with at least one
scenario each. A scenario MUST declare a seed repository (`repo/`), a change
request (`brief`), the facts only the simulated user knows (`F<n>`), and hidden
checks of kind `acceptance`, `fact`, or `regression`. Every fact MUST be judged
by at least one `fact` check, and every scenario MUST run its own test suite as
a regression check. Only `repo/` MAY reach the agent's workspace. A reference
delivery per scenario MUST pass every hidden check, and the untouched seed MUST
fail its acceptance checks while passing its regression checks. The corpus
digest MUST NOT depend on the checkout's line endings.

#### Scenario: A fact without a check is rejected

- GIVEN a scenario whose fact `F3` no check names
- WHEN the corpus is validated by its test
- THEN the test MUST fail naming the scenario and `F3`

#### Scenario: Hidden checks never reach the agent

- GIVEN a scenario materialized for a run
- WHEN the workspace is listed
- THEN it MUST contain the seed repository and MUST NOT contain `checks.js` or
  `scenario.json`

### Requirement: Isolated Real-Agent Runs {#REQ-bench-002}

A run MUST drive a real agent host headless in a workspace outside the
repository, initialized as a git repository from the seed. The Claude Code host
MUST use a dedicated configuration directory (`CLAUDE_CONFIG_DIR`) so the
user's instructions, installed plugins, MCP servers, and memory do not reach
the run, and MUST load the plugin built from the current checkout. Variables of
the calling session that alter the host (nested-session markers, hook switches,
an API key) MUST NOT be inherited. The arm's project setup MUST run before the
measured change and MUST NOT count toward its metrics. During setup the
persona MUST receive the arm's setup goal instead of the change request and
its facts, and a setup that modifies any seed file MUST make the run
`incomplete` (`setup-modified-seed`) without requesting the change. A run MUST stop as
`incomplete` with its reason when the arm never reaches its end state within
the turn or cost limit, when the setup does not complete, or after two
consecutive host errors. A run whose change was requested MUST still be judged
by the hidden checks; a run voided before the change (`setup-incomplete`,
`setup-modified-seed`) MUST NOT be judged, because the seed is not the arm's
delivery. When a host turn reports an exhausted usage quota (HTTP 429), the run
MUST stop at once without retrying, and `bench.js run` MUST end the whole
campaign with a distinct exit code without recording the interrupted run, so
the same command resumes it after the reset.

#### Scenario: Missing bench login

- GIVEN no bench configuration directory
- WHEN `bench.js run` starts
- THEN it MUST exit without spending tokens and explain how to log in once

#### Scenario: Setup that starts the change

- GIVEN an agent that edits `src/` while initializing the project
- WHEN the setup ends
- THEN the run MUST be `incomplete` with reason `setup-modified-seed` and the
  change MUST NOT be requested

#### Scenario: Exhausted host quota

- GIVEN a host turn that ends with HTTP 429 (for example a session limit)
- WHEN the driver receives it
- THEN the run MUST stop without another turn and without being judged
- AND `bench.js run` MUST exit with code 3, leave the record without that run,
  and skip the remaining scenarios

#### Scenario: Turn limit

- GIVEN an agent that never archives the change
- WHEN the run reaches its turn limit
- THEN the run MUST be `incomplete` with reason `max-agent-turns` and MUST
  carry its check results

### Requirement: Simulated User {#REQ-bench-003}

Each agent turn that ends without the change finished MUST be answered by a
persona that knows the brief, the facts, and the arm's goal. The persona MUST
classify the agent's message as `question`, `approval`, `stopped`, `finished`,
or `blocked`, MUST disclose a fact only when asked about it or to correct a
proposal that contradicts it, MUST compare every summary or plan it is asked to
approve against its facts, and MUST report as disclosed only the facts whose
content its answer states, and whether it departed from the agent's
recommendation. A persona failure MUST NOT
end the run: the agent is asked to continue and the failure is counted.

#### Scenario: A question that changes a decision

- GIVEN an agent that asks which priority applies by default
- WHEN the persona answers with fact `F1`
- THEN the run MUST count one question, one decision-changing question, and
  one intervention

### Requirement: Metrics And Record {#REQ-bench-004}

A run MUST record tokens (input, output, cache reads, and cache writes of every
model, subagents included), cost, wall-clock duration, agent turns, questions,
decision-changing questions, interventions, host errors, the hidden check
results, and the escaped defects (failed checks). A bench record MUST bind its
runs to the arm, host and version, model, effort, plugin version and digest,
persona model, corpus digest, and harness digest (the bench code itself), and MUST keep the SHA-256 of every
transcript. A record MUST declare how many repetitions it runs per scenario,
and each run MUST carry its repetition number; the repetition count is part of
the identity. Resuming a record with a different identity MUST be refused. The
report MUST be recomputable from the record without calling a model and, with
more than one repetition, MUST add the mean of each scenario over its
repetitions. A record of schema 1 (one run per scenario) MUST still be read as
one repetition.

#### Scenario: Resume with another plugin build

- GIVEN a record produced with plugin digest A
- WHEN `bench.js run` resumes it with a plugin whose digest is B
- THEN it MUST refuse and ask for a new record id

#### Scenario: Repetitions in the report

- GIVEN a record with 3 repetitions per scenario
- WHEN its report is rendered
- THEN every run MUST appear with its repetition number
- AND a second table MUST give each scenario's mean tokens, cost, questions,
  interventions, and escaped defects

### Requirement: Predeclared Margins And Checkpoint {#REQ-bench-005}

The margins MUST be versioned in `scripts/evals/bench/margins.json` before any
comparison and their digest MUST appear in the checkpoint. The checkpoint MUST
compare a candidate record with a baseline record and decide `continue` or
`revise`. The margins MUST declare the repetitions per scenario, and the
totals MUST add per-scenario means over those repetitions. It MUST revise when
the records are not comparable (arms other than the margins name, a repetition
count other than the margins', or a different corpus, harness, host, model,
effort, persona, or scenario set), when any run is incomplete or a repetition is
missing, when a hidden check the baseline passes in every repetition fails in
any repetition of the candidate, when the candidate's summed mean of escaped
defects exceeds the baseline's by more than `escaped_defects.max_mean_delta`,
or when the candidate's summed mean tokens exceed `tokens.max_total_ratio`
times the baseline's. These vetoes MUST NOT be configurable.

#### Scenario: Improvement in totals does not hide a regression

- GIVEN a candidate with fewer escaped defects in total
- AND one check the baseline passes and the candidate fails
- WHEN the checkpoint runs
- THEN the decision MUST be `revise` with reason `check-regression`

#### Scenario: A check the baseline already misses once is not a regression

- GIVEN a check the baseline fails in one of its three repetitions
- AND the candidate fails it in one of its three repetitions
- WHEN the checkpoint runs
- THEN it MUST NOT report `check-regression` for that check
- AND the escaped-defect means of both arms MUST still count it

### Requirement: Arms {#REQ-bench-006}

The `sdd` arm MUST initialize the project with `/ospec-workflow:sdd-init`,
request the change with `/ospec-workflow:sdd-new`, and finish when a change is
archived under `openspec/changes/archive/`. The `idd` arm MUST be declared and
MUST refuse to run until E1.6 ships the IDD protocol.

#### Scenario: IDD before E1.6

- GIVEN the current release
- WHEN `bench.js run --arm idd` is requested
- THEN it MUST refuse and name E1.6
