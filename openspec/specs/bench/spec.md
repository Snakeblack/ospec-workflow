# Bench Specification

## Purpose

The bench (E4.1) measures a workflow mode with real agents on fixed scenarios,
so the decision to make IDD the default entry (E1.6) rests on numbers declared
before the run. E4.2 uses it to compare IDD with gentle-ai, and E4.5 repeats
that comparison on the Antigravity CLI with a project built from scratch. It
lives in `scripts/evals/bench/`. It is measurement tooling:
it grants no authority, changes no default, and never runs a model inside
`npm test`.

## Requirements

### Requirement: Scenario Corpus {#REQ-bench-001}

The `default` corpus MUST cover the six project profiles `cli-local`,
`saas-small`, `regulated`, `brownfield`, `public-library`, and `bugfix`, with at
least one scenario each. The `greenfield` corpus (E4.5) MUST live in its own
directory, cover the `greenfield` profile, and leave the `default` corpus
digest unchanged; `bench.js --corpus` selects one. A scenario MUST declare a seed repository (`repo/`), a change
request (`brief`), the facts only the simulated user knows (`F<n>`), and hidden
checks of kind `acceptance`, `fact`, or `regression`. Every fact MUST be judged
by at least one `fact` check, and every scenario MUST run its own test suite as
a regression check. Only `repo/` MAY reach the agent's workspace. A reference
delivery per scenario MUST pass every hidden check, and the untouched seed MUST
fail its acceptance checks while passing its regression checks. The corpus
digest MUST NOT depend on the checkout's line endings. The checks of a page
scenario MUST drive the delivered page in a headless Chromium-family browser
over the DevTools protocol, without any dependency, serving the workspace on
`127.0.0.1` and giving each check a fresh browser profile; without such a
browser, the test of its reference delivery MUST be skipped, not failed.

#### Scenario: A fact without a check is rejected

- GIVEN a scenario whose fact `F3` no check names
- WHEN the corpus is validated by its test
- THEN the test MUST fail naming the scenario and `F3`

#### Scenario: A browser check starts from an empty profile

- GIVEN two checks of `todo-spa`, the first of which stores tasks
- WHEN the second check opens the page
- THEN its `localStorage` MUST be empty

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
the run, and MUST load the plugin built from the current checkout with the SDD
package (`--with-sdd`, REQ-generator-025) for every arm, so both arms keep the
plugin content of the runs measured before E1.6 (d2). The `gentle-ai` arm
MUST instead run the agent with `HOME` set to the bench's gentle-ai home,
where gentle-ai was installed once (`bench.js setup-gentle-ai`), without the
ospec plugin and with exactly the MCP servers gentle-ai registered in
`$HOME/.claude.json` (its Engram), passed with `--strict-mcp-config` so the
account's claude.ai connectors never load, because gentle-ai writes only to
`$HOME/.claude` and `$HOME/.claude.json`. That install MUST be Claude
Code only, with the `persona`, `engram`, and `skills` components, the
`ecosystem-only` preset, and the `neutral` persona, with telemetry and
self-update off, and its binaries copied into the home. Each workspace MUST get
an empty Engram of its own (data under `.git/`, its own port) that the bench
stops when the run ends; an interrupted bench MUST also stop the turns in flight. The persona MUST run in the bench configuration
directory for every arm. Variables of
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

No run MUST be able to reach another run's delivery. `bench.js run` MUST take
a lock on the workspaces directory, so runs go one at a time, and each run
MUST work in its own directory with an opaque name (neither record, arm,
scenario nor repetition) whose only content is the workspace. Once judged, the
workspace MUST move out of the workspaces directory, next to the run's
transcripts under `scripts/evals/.runs/bench/`, where the quality tooling
reads it. On agy, every agy process MUST run in a bubblewrap sandbox with a
PID namespace of its own, in which the system temp directory, the user's
`HOME` and the bench's directories (workspaces, runs, records, this
repository, `~/.ospec-bench`) are empty except for the run's own directory,
the arm's template, agy and the bench's Node; without bubblewrap, `bench.js
run --host agy` MUST refuse to start. A turn whose tool steps name a path of
those directories that the sandbox does not mount, nor lies above one it
mounts, MUST void the run (`workspace-escape`): it MUST NOT be judged nor
recorded, its transcripts and workspace MUST be kept apart for audit, and the
same command MUST repeat it.

With `--host agy` (E4.5) the run MUST drive the Antigravity CLI headless
(`agy --print`) with every prompt on stdin as one stream-json message, and each
workspace MUST run in its own `HOME`, copied under `.git/` from the arm's
template without agy's runtime state (conversations, summaries, knowledge,
logs), so nothing passes from one run to another and none of the user's rules
load. The `idd` arm's template MUST be ospec installed for antigravity from the
checkout, without SDD and without Engram. The `gentle-ai` arm's template MUST
be gentle-ai installed for antigravity once (`bench.js setup-gentle-ai --host
agy`) with the same selection as on Claude Code, plus the three environment
steps that place its unchanged output where agy reads it: an empty
`.gemini/antigravity-cli/mcp_config.json` before the install, `agy plugin
install` of the Engram plugin it generates, and its skills copied to
`.gemini/config/skills`; each workspace MUST get an empty Engram of its own.
The persona MUST run on agy from a fresh, rule-free `HOME` per call. The `sdd`
arm MUST NOT run on agy. Since agy reports no cost, a run on agy MUST stop as
`incomplete` (`max-tokens`) at its token cap instead of a cost cap.

#### Scenario: Each agy workspace starts clean

- GIVEN two repetitions of `todo-spa` on agy
- WHEN the second repetition's first turn starts
- THEN its `HOME` MUST be a fresh copy of the template under that workspace's
  `.git/`, without the first repetition's conversations or knowledge

#### Scenario: A run cannot reach an earlier delivery or the bench

- GIVEN the second repetition of `todo-spa` on agy, after the first was judged
- WHEN the agent lists the system temp directory, its workspace's grandparent,
  or the running processes
- THEN it MUST see neither the first repetition's workspace, nor the bench's
  processes, nor this repository
- AND a step that names the first repetition's directory MUST end the run as
  `workspace-escape`, without judging or recording it, and the next
  `bench.js run` MUST repeat it

#### Scenario: gentle-ai stays in its own home

- GIVEN the `gentle-ai` arm
- WHEN an agent turn starts
- THEN `HOME` MUST be the bench's gentle-ai home, `CLAUDE_CONFIG_DIR` MUST NOT
  be set, and the turn MUST pass `--strict-mcp-config` with only the MCP
  servers of `$HOME/.claude.json` and MUST NOT pass `--plugin-dir`
- AND `ENGRAM_DATA_DIR` and `ENGRAM_PORT` MUST belong to that workspace alone
- AND the persona MUST still run with the bench's `CLAUDE_CONFIG_DIR`

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
model, subagents included; on agy, input, output with its thinking, and cache
reads, as the difference of the conversation's accumulated usage, with no
cost), cost, wall-clock duration, agent turns, questions,
decision-changing questions, interventions, host errors, the hidden check
results, and the escaped defects (failed checks). A bench record MUST bind its
runs to the arm, host and version, model, effort, plugin version and digest
(for the `gentle-ai` arm, the gentle-ai and Engram versions and a digest of
both binaries, its MCP servers, and the installed assets a run reads),
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

The margins MAY declare one `harness_exception`: a baseline digest, the
candidate digests accepted against it (distinct, the current harness last), the
harness files allowed to differ, and a reason. The checkpoint MUST accept a
different harness only for a baseline with that digest and a candidate with one
of those digests, in that direction, and MUST report the pair it applied in its
result. When the margins declare one, a test MUST verify it: the current
harness digest MUST equal the last candidate digest, restoring the declared
files from committed copies MUST rebuild the baseline digest and every earlier
candidate digest, and the baseline arm MUST behave as it did.

The margins MAY declare a `quality` criterion: the most points the candidate's
mean mutation score may trail the baseline's, and the most pairs in which the
blind review may prefer the baseline in both orders. The checkpoint MUST only
validate it; `scripts/evals/quality` MUST evaluate it over every delivery
pair, counting a delivered suite that fails before any mutant as a score of 0,
and MUST decide `revise` when either margin is exceeded or a pair is not
judged. The E4.5 margins (`bench-margins-7`: `gentle-ai` as baseline, `idd` as
candidate, three repetitions, `max_mean_delta` 0, `max_total_ratio` 1, and a
quality criterion of 5 points and one pair) declare no harness exception,
because both arms run with the same harness; their verdict blocks nothing. The
E4.2 checkpoint (`bench-margins-6`) is reproducible from v2.133.0.

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

#### Scenario: A declared harness exception covers only its pair

- GIVEN margins that declare a harness exception from digest A to digests B and C
- WHEN the baseline has harness A and the candidate harness B or C
- THEN the checkpoint MUST NOT report `not-comparable` for the harness
- AND its result MUST carry the applied pair
- WHEN the candidate has any other harness, or the pair is reversed
- THEN it MUST report `not-comparable`

### Requirement: Arms {#REQ-bench-006}

The `sdd` arm MUST initialize the project with `/ospec-workflow:sdd-init`,
request the change with `/ospec-workflow:sdd-new`, and finish when a change is
archived under `openspec/changes/archive/`. The `idd` arm MUST set the project
up by asking the agent to write `idd/config.yaml` with `mode: idd` and the
`npm test` check, and that setup MUST be done only when the file parses in IDD
mode. On Claude Code it MUST request the change with `/ospec-workflow:idd`,
because the router does not load in the bench's isolated configuration; on agy,
where the router loads, it MUST request it with the brief alone, as the
`gentle-ai` arm does. It MUST finish when `ospec close` has archived a change
under `idd/archive/` that the setup commit did not hold. The `gentle-ai` arm
MUST need no project setup, MUST request the change with the brief alone,
because ODD runs on every request, and MUST finish when there is at least one
commit after setup, nothing is uncommitted outside `odd/` and `.atl/`, and no
`odd/tasks/*.md` has an unchecked task: ODD writes that document only for
substantial work and records each commit in it after committing, and `.atl/`
is the skill registry gentle-ai regenerates at every session start.

#### Scenario: IDD arm finishes at the closed change

- GIVEN the `idd` arm with its setup done
- WHEN the change is requested
- THEN the prompt MUST be `/ospec-workflow:idd <brief>` on Claude Code and the
  brief itself on agy
- AND the run MUST be complete only once `idd/archive/` holds a directory the
  setup commit did not hold

#### Scenario: gentle-ai arm finishes at a committed delivery

- GIVEN the `gentle-ai` arm, which needs no project setup
- WHEN the change is requested
- THEN the prompt MUST be the brief itself
- AND the run MUST be complete only once there is at least one commit after
  setup, nothing uncommitted outside `odd/` and `.atl/`, and no unchecked task
  in any `odd/tasks/*.md`
