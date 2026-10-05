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
consecutive host errors, and MUST still be judged by the hidden checks.

#### Scenario: Missing bench login

- GIVEN no bench configuration directory
- WHEN `bench.js run` starts
- THEN it MUST exit without spending tokens and explain how to log in once

#### Scenario: Setup that starts the change

- GIVEN an agent that edits `src/` while initializing the project
- WHEN the setup ends
- THEN the run MUST be `incomplete` with reason `setup-modified-seed` and the
  change MUST NOT be requested

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
transcript. Resuming a record with a different identity MUST be refused. The
report MUST be recomputable from the record without calling a model.

#### Scenario: Resume with another plugin build

- GIVEN a record produced with plugin digest A
- WHEN `bench.js run` resumes it with a plugin whose digest is B
- THEN it MUST refuse and ask for a new record id

### Requirement: Predeclared Margins And Checkpoint {#REQ-bench-005}

The margins MUST be versioned in `scripts/evals/bench/margins.json` before any
comparison and their digest MUST appear in the checkpoint. The checkpoint MUST
compare a candidate record with a baseline record and decide `continue` or
`revise`. It MUST revise when the records are not comparable (arms other than
the margins name, or a different corpus, harness, host, model, effort, persona, or
scenario set), when any run is incomplete, when a hidden check the baseline
passes fails in the candidate, when the candidate escapes more defects in total
than `escaped_defects.max_total_delta` allows, or when the candidate's tokens
exceed `tokens.max_total_ratio` times the baseline's. These vetoes MUST NOT be
configurable.

#### Scenario: Improvement in totals does not hide a regression

- GIVEN a candidate with fewer escaped defects in total
- AND one check the baseline passes and the candidate fails
- WHEN the checkpoint runs
- THEN the decision MUST be `revise` with reason `check-regression`

### Requirement: Arms {#REQ-bench-006}

The `sdd` arm MUST initialize the project with `/ospec-workflow:sdd-init`,
request the change with `/ospec-workflow:sdd-new`, and finish when a change is
archived under `openspec/changes/archive/`. The `idd` arm MUST be declared and
MUST refuse to run until E1.6 ships the IDD protocol.

#### Scenario: IDD before E1.6

- GIVEN the current release
- WHEN `bench.js run --arm idd` is requested
- THEN it MUST refuse and name E1.6
