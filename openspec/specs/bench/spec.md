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
digest unchanged; `bench.js --corpus` selects one. The `reserved` corpus
(OSP-011) MUST live in its own directory, cover the `saas-small` profile, use
scenario ids absent from the `default` corpus, and keep its digest pinned by a
test, so the scenario stays frozen before the head-to-head runs that judge it. A scenario MUST declare a seed repository (`repo/`), a change
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

#### Scenario: The reserved corpus stays frozen

- GIVEN the `reserved` corpus with its digest pinned by its test
- WHEN a scenario of it changes, or takes an id of the `default` corpus
- THEN that test MUST fail

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
the run. The `sdd` arm MUST load the plugin built from the current checkout
with the SDD package (`--with-sdd`). The `idd` arm MUST load that plugin
without SDD. The agent of both ospec arms MUST run with a copy of the bench
configuration, which for `idd` adds the router block from the plugin's
`global-instructions/CLAUDE.md`; the persona MUST keep the bench configuration
without that block. Both directories hold the same OAuth login, and refreshing
it rotates its refresh token, so before every agent turn and persona call the
login with the later expiry MUST be copied over the other (mode 0600); without
a credentials file there is nothing to share. Engram goes in every arm (OSP-025): in that copy, `engram
setup claude-code`, run from a copy of the engram binary of the bench's
gentle-ai home (or `--engram-bin`), MUST install Engram as an ospec user's
install does, and the agent MUST load exactly the MCP servers it registered,
passed with `--strict-mcp-config`; without that binary, `bench.js run` MUST
refuse to start an ospec arm. The `gentle-ai` arm
MUST instead run the agent with `HOME` set to the bench's gentle-ai home,
where gentle-ai was installed once (`bench.js setup-gentle-ai`), without the
ospec plugin and with exactly the MCP servers gentle-ai registered in
`$HOME/.claude.json` (its Engram), passed with `--strict-mcp-config` so the
account's claude.ai connectors never load, because gentle-ai writes only to
`$HOME/.claude` and `$HOME/.claude.json`. That install MUST be Claude
Code only, with the `persona`, `engram`, and `skills` components, the
`ecosystem-only` preset, and the `neutral` persona, with telemetry and
self-update off, and its binaries copied into the home. In every arm, each workspace MUST get
an empty Engram of its own (data under `.git/`, its own port) that the bench
stops when the run ends; an interrupted bench MUST also stop the turns in flight. On Claude Code the persona MUST run in the bench configuration
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
scenario nor repetition) whose only content is the workspace. The workspace's
`.git/info/exclude` MUST list `.ospec/` before the first commit, so ospec's
session data, which the Stop hook rewrites every turn, never enters the setup
commit nor dirties a delivery, whatever the plugin under test does. Once judged, the
workspace MUST move out of the workspaces directory, next to the run's
transcripts under `scripts/evals/.runs/bench/`, where the quality tooling
reads it. On agy, every agy process MUST run in a bubblewrap sandbox with a
PID namespace of its own, in which the system temp directory, the top-level
directory of the user's `HOME` (`/home`, with any filesystem snapshot under
it) and the bench's directories (workspaces, runs, records, this repository,
`~/.ospec-bench`) are empty except for the run's own directory, the arm's
template, agy and the bench's Node; without bubblewrap, `bench.js run --host
agy` MUST refuse to start. The template MUST be mounted as a copy without
agy's runtime state (logs, conversations, summaries, knowledge) over its own
path, so a log that names this repository never reaches the agent. Every
workspace `HOME` MUST carry a `PreToolUse` hook, read-only in the sandbox,
that denies agy's web and browser tools (`search_web`, `read_url_content`,
`open_browser_url`, `browser_*`) in every permission mode; the shell keeps its
network, since cutting it cuts agy's API. A turn whose tool steps name a path of those
directories, or of a copy of one under another prefix (such as
`/home/.snapshots/<n>/snapshot/<user>/<repo>`), that the sandbox does not
mount, nor lies above one it mounts, MUST void the run (`workspace-escape`): it MUST NOT be judged nor
recorded, its transcripts and workspace MUST be kept apart for audit, and the
same command MUST repeat it.

With `--host agy` (E4.5) the run MUST drive the Antigravity CLI headless
(`agy --print`) with every prompt on stdin as one stream-json message, and each
workspace MUST run in its own `HOME`, copied under `.git/` from the arm's
template without agy's runtime state (conversations, summaries, knowledge,
logs), so nothing passes from one run to another and none of the user's rules
load. The `idd` arm's template MUST be ospec installed for antigravity from the
checkout, without SDD, with Engram set up by `engram setup antigravity-cli`
from the same engram binary (its MCP server in `.gemini/config/mcp_config.json`
and its protocol in `.gemini/GEMINI.md`); each workspace MUST get an empty
Engram of its own. The `gentle-ai` arm's template MUST
be gentle-ai installed for antigravity once (`bench.js setup-gentle-ai --host
agy`) with the same selection as on Claude Code, plus the three environment
steps that place its unchanged output where agy reads it: an empty
`.gemini/antigravity-cli/mcp_config.json` before the install, `agy plugin
install` of the Engram plugin it generates, and its skills copied to
`.gemini/config/skills`; each workspace MUST get an empty Engram of its own.
The persona MUST run on agy from a fresh, rule-free `HOME` per call, except
when its model id starts with `grok-`: then it MUST run through the Cursor CLI
(`agent --print --mode ask`) in an empty directory, with the repository not
set as its workspace. The `sdd`
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

#### Scenario: A snapshot of the repository stays out of reach

- GIVEN a filesystem snapshot under `/home` that holds a copy of this
  repository, its hidden facts and its records
- WHEN the agent on agy lists `/home` or reads a path of that copy
- THEN it MUST see no snapshot under `/home`
- AND a step that names a path of the copy MUST end the run as
  `workspace-escape`, without judging or recording it

#### Scenario: The agent on agy works offline and without the template's logs

- GIVEN an arm's template that holds a log of agy naming this repository
- WHEN the agent on agy calls `search_web`, edits its `hooks.json`, or reads
  the template's log
- THEN the hook MUST deny the search, the edit MUST fail, and the log MUST
  NOT exist in the sandbox, while the template's configuration and binaries
  do

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
recommendation. A single persona failure MUST NOT
end the run: the agent is asked to continue and the failure is counted. Two
failures in a row MUST stop the run unjudged (`persona-error`), and `bench.js
run` MUST exit with code 4 without recording it and skip the remaining
scenarios, since nobody would answer the agent.

#### Scenario: A persona that stops answering

- GIVEN a persona whose calls keep failing (for example an expired login)
- WHEN it fails for the second time in a row
- THEN the run MUST stop without another turn and without being judged
- AND `bench.js run` MUST exit with code 4 and leave the record without that run

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
persona model, corpus digest, harness digest (the bench code itself), and the
commit of the checkout it was produced from (`repo_commit`, `-dirty` when a
tracked file outside the records differs), and MUST keep the SHA-256 of every
transcript. An ospec arm's plugin version and digest MUST cover the Engram
installed with it. A plugin digest MUST identify content, not the machine: the
same commit installed in two template directories MUST give the same digest,
so the absolute template directory MUST read as `~` and binaries built from the
repository MUST stay out of it. A record MUST declare how many repetitions it runs per scenario,
`bench.js run` MUST run three unless `--repetitions` names another count (OSP-011),
and each run MUST carry its repetition number; the repetition count is part of
the identity. Resuming a record with a different identity MUST be refused. The
report MUST be recomputable from the record without calling a model and, with
more than one repetition, MUST add the mean of each scenario over its
repetitions. It MUST break hidden checks down by kind (`acceptance`,
`regression` and `fact`). Every record MUST store the byte size of the
Engram MCP config its arm loads, and the report MUST state that size apart
from token totals, without subtracting it. Each agent turn of a run's
conversation MUST keep its own tokens. An `idd` run MUST record how the change
it archived closed its open facts (`open_facts`: the change kind, each feature
category `asked`, `cited` or `quoted`, and the questions asked), and the report
MUST list it. A record of schema 1 (one run per scenario) MUST still be read as
one repetition, and records of schema 1 and 2 MUST still be read without the
fields schema 3 adds.

#### Scenario: Resume with another plugin build

- GIVEN a record produced with plugin digest A
- WHEN `bench.js run` resumes it with a plugin whose digest is B
- THEN it MUST refuse and ask for a new record id

#### Scenario: Three repetitions by default

- GIVEN `bench.js run` without `--repetitions`
- WHEN it runs a scenario
- THEN the scenario MUST run three times and the record MUST declare 3 repetitions

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
count other than the margins', a different corpus, harness, host, model,
effort, persona, or scenario set, or either record without Engram's MCP size), when any run is incomplete or a repetition is
missing, when a hidden check the baseline passes in every repetition fails in
any repetition of the candidate, when the candidate's summed mean of escaped
defects exceeds the baseline's by more than `escaped_defects.max_mean_delta`,
or when the candidate's summed mean tokens exceed `tokens.max_total_ratio`
times the baseline's. These vetoes MUST NOT be configurable. With fewer than
three repetitions per scenario the result MUST state `conclusive: false` and
its report a line `Inconclusive`, without changing the decision or the exit
code: such a comparison shows neither arm is better (OSP-011). The report
MUST give the mean of the per-scenario token ratios with its 95% t interval
when there are at least two scenarios.

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
blind review may prefer the baseline in both orders. `scripts/evals/quality`
MUST evaluate it over every delivery pair, counting a delivered suite that
fails before any mutant as a score of 0, and MUST decide `revise` when either
margin is exceeded or a pair is not judged. When the margins declare it, the
checkpoint MUST read that pair's result, MUST revise with `quality-missing`
when there is none, and MUST revise with `quality` when its verdict is
`revise` (OSP-026). The E4.9 margins (`bench-margins-8`: `gentle-ai` as baseline, `idd` as
candidate, one repetition, `max_mean_delta` 0, `max_total_ratio` 1, and no
quality criterion) declare no harness exception, because both arms run with
the same harness; their verdict blocks nothing. The E4.6 margins
(`bench-margins-9`: the same arms, three repetitions, `max_mean_delta` 2,
`max_total_ratio` 10, and the E4.5 quality criterion) are the aggregate ceiling
of the greenfield campaign. Its report judges the binding escaped-defect rules:
on `todo-spa` the candidate's mean is at most 2, and on the reserved scenario
it is strictly below the baseline. Token growth on that campaign does not
decide; the 10× ratio only stops a runaway. They stay reproducible from
v2.143.0. The margins of the `idd-4` repetition with Engram in every arm
(`bench-margins-10`: the same arms, one repetition on Claude Code with Haiku,
`max_mean_delta` 0, `max_total_ratio` 1, and the E4.5 quality criterion)
declare no harness exception; with one repetition their verdict is
exploratory and blocks nothing, and they stay reproducible from v2.144.0. The
margins of the OSP-011 repetition (`bench-margins-11`: the same arms and
thresholds as `bench-margins-10`, three repetitions on Claude Code with Haiku,
over the `default` and `reserved` corpora) declare no harness exception; their
verdict blocks nothing. The E4.5 checkpoint
(`bench-margins-7`) is reproducible from v2.134.0. The E4.2 checkpoint
(`bench-margins-6`) is reproducible from v2.133.0.

#### Scenario: An arm without Engram is not comparable

- GIVEN a baseline record with Engram's MCP size
- AND a candidate record without it
- WHEN the checkpoint runs
- THEN the decision MUST be `revise` with reason `not-comparable`, naming the arm

#### Scenario: Fewer than three repetitions are inconclusive

- GIVEN margins with one repetition per scenario
- AND records that meet every margin
- WHEN the checkpoint runs
- THEN the decision MUST be `continue`
- AND the result MUST state `conclusive: false` and its report `Inconclusive`

#### Scenario: Declared quality needs its result

- GIVEN margins that declare a quality criterion
- AND no `scripts/evals/quality` result for the pair
- WHEN the checkpoint runs
- THEN the decision MUST be `revise` with reason `quality-missing`

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
mode. On every host it MUST request the change with the brief alone, because
the router is loaded (on Claude Code, in the agent's configuration copy; on
agy, in the antigravity install). It MUST finish only when `ospec close` has
archived a change under `idd/archive/` that the setup commit did not hold, at
least one commit exists after setup, the working tree is clean, and that new
archive directory is recorded in `HEAD`. The `gentle-ai` arm
MUST need no project setup, MUST request the change with the brief alone,
because ODD runs on every request, and MUST finish when there is at least one
commit after setup, nothing is uncommitted outside `odd/` and `.atl/`, and no
`odd/tasks/*.md` has an unchecked task: ODD writes that document only for
substantial work and records each commit in it after committing, and `.atl/`
is the skill registry gentle-ai regenerates at every session start.

#### Scenario: IDD arm finishes at the closed change

- GIVEN the `idd` arm with its setup done
- WHEN the change is requested
- THEN the prompt MUST be the brief itself
- AND the run MUST be complete only once `idd/archive/` holds a directory the
  setup commit did not hold, that directory is in `HEAD`, at least one commit
  exists after setup, and the working tree is clean

#### Scenario: gentle-ai arm finishes at a committed delivery

- GIVEN the `gentle-ai` arm, which needs no project setup
- WHEN the change is requested
- THEN the prompt MUST be the brief itself
- AND the run MUST be complete only once there is at least one commit after
  setup, nothing uncommitted outside `odd/` and `.atl/`, and no unchecked task
  in any `odd/tasks/*.md`
