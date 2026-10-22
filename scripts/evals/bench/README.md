# Bench (E4.1, E4.2, E4.5)

Measures a workflow mode with real agents on fixed scenarios, so E1.6 could
decide with predeclared numbers whether IDD becomes the default entry (E4.1),
and so IDD can be compared with gentle-ai: on Claude Code over six scenarios
(E4.2), and on the Antigravity CLI over a project built from scratch (E4.5).
Contract: `openspec/specs/bench/spec.md` (REQ-bench-001 to 006). Measurement
tooling only: it grants no authority and never runs a model in `npm test`.

## Pieces

| File | Role |
| --- | --- |
| `scenarios/<id>/` | The `default` corpus: `scenario.json` (brief and hidden facts), `repo/` (the seed the agent gets), `checks.js` (hidden checks) |
| `scenarios-greenfield/<id>/` | The `greenfield` corpus: `todo-spa` (E4.5) and the reserved `receta-spa` (E4.6), each one page |
| `scenarios-reserved/<id>/` | The `reserved` corpus (OSP-011): `salas`, frozen before the head-to-head runs that judge it; its digest is pinned in `scenarios.test.js` and its ids differ from the default corpus |
| `__fixtures__/reference/<id>/`, `__fixtures__/reference-greenfield/<id>/` | A correct delivery per scenario; `checks.test.js` and `checks-greenfield.test.js` prove every check passes on it and acceptance fails on the seed |
| `scenarios.js` | Loads and validates the corpus, digests it, materializes a seed |
| `checks.js`, `check-runner.js`, `check-kit.js` | Run each hidden check in its own process against the delivered workspace |
| `browser.js` | A headless Chromium-family browser over the DevTools protocol, with Node's own WebSocket: serves the workspace on 127.0.0.1 and gives each check a fresh profile (`BENCH_CHROMIUM` names the browser) |
| `arms.js` | `sdd` (init, `sdd-new`, archived change), `idd` (agent writes `idd/config.yaml` with `mode: idd` and `npm test`, the brief as is because the router is loaded, finished when the new `idd/archive/` entry is committed and the tree is clean) and `gentle-ai` (no setup, the brief as is, a commit after setup with nothing uncommitted outside `odd/` and `.atl/`, its skill registry, and every `odd/tasks/*.md` task checked) |
| `persona.js` | The simulated user: brief, facts, and goal; classifies each agent message and answers |
| `driver.js` | Seed → git → setup (unmeasured; the persona only knows the setup goal, and a setup that edits the seed voids the run) → change conversation → hidden checks |
| `hosts/claude.js` | Headless `claude -p` turns and persona calls in a dedicated config directory, with the plugin built from the checkout and the agent in its own copy of that directory; for `gentle-ai`, agent turns in gentle-ai's own HOME |
| `hosts/engram.js` | Engram for the ospec arms: the gentle-ai arm's engram binary, installed with `engram setup <agent>`, and the digest of what it installed |
| `hosts/gentle-ai.js` | Installs gentle-ai into its bench HOME (for Claude Code or for agy), identifies that install, and starts an empty Engram per workspace |
| `hosts/agy.js` | Headless `agy --print` turns and persona calls (prompts on stdin as stream-json), each workspace in a fresh copy of the arm's template HOME; installs ospec for antigravity as the IDD template. A persona model whose id starts with `grok-` is asked through `hosts/cursor-persona.js` instead |
| `hosts/cursor-persona.js` | Cursor CLI persona (`agent --print --mode ask`) in an empty directory, for a Grok persona agy cannot serve |
| `transcript.js` | Usage, cost, and session from a `stream-json` transcript (`modelUsage` includes subagents) |
| `record.js` | The versioned record of one arm and its Markdown report |
| `checkpoint.js`, `margins.json` | Predeclared margins, the declared harness exception, and the continue/revise decision |
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
| `greenfield` (corpus `greenfield`) | A to-do list in one `index.html`, from a README and an empty `package.json` | Trimmed titles and their 200-character limit, pending duplicates, storage key and corrupt data, counter wording, filter in the URL, editing keys, order, titles as text, accessible names |
| `greenfield` (corpus `greenfield`) | `receta-spa`, a recipe card in one `index.html`, reserved for E4.6 | Nine hidden facts, frozen in its `scenario.json`. They are not repeated here, so tuning IDD does not read them |
| `saas-small` (corpus `reserved`) | `salas`, room bookings in a multi-tenant API, reserved for OSP-011 | Four hidden facts, frozen in its `scenario.json` and not repeated here, for the same reason |

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
node scripts/evals/bench/bench.js run --arm idd --record idd-1 --repetitions 1
node scripts/evals/bench/bench.js report --record sdd-baseline-3
node scripts/evals/bench/bench.js checkpoint --baseline sdd-baseline-3 --candidate idd-1
```

The `gentle-ai` arm runs gentle-ai from a HOME of its own, because gentle-ai
writes only to `$HOME/.claude` and registers its Engram MCP server in
`$HOME/.claude.json`, which Claude Code does not read under `CLAUDE_CONFIG_DIR`.
Build gentle-ai from a release tag and install it there once (it copies both
binaries into `<home>/bin`, installs Claude Code only with the `persona`,
`engram`, and `skills` components, the `ecosystem-only` skills, and the
`neutral` persona, and turns telemetry off), then log in in that HOME:

```sh
git -C <gentle-ai clone> archive v4.1.1 | tar -x -C <src>
(cd <src> && go build -ldflags "-s -w -X main.version=4.1.1" -o <dir>/gentle-ai ./cmd/gentle-ai)
node scripts/evals/bench/bench.js setup-gentle-ai --gentle-ai-bin <dir>/gentle-ai --engram-bin "$(command -v engram)"
HOME="$HOME/.ospec-bench/gentle-ai" claude
node scripts/evals/bench/bench.js run --arm gentle-ai --record gentle-ai-1 --repetitions 1
```

The agent loads exactly the MCP servers gentle-ai registered (its Engram), with
`--strict-mcp-config`, so the account's claude.ai connectors stay out as in the
other arms. Each gentle-ai workspace gets an empty Engram (data under
`.git/bench-engram`, its own port) that the bench stops when the run ends or is
interrupted, so no scenario sees
another's memory and none reaches the user's Engram. The persona keeps the
bench configuration directory for every arm.

`run` builds the plugin from the checkout (the gentle-ai arm records its install instead), materializes each scenario in a
directory of its own with an opaque name under the system temp directory
(`ospec-bench/<opaque>/<scenario>`) whose `.git/info/exclude` lists `.ospec/`
(the Stop hook rewrites its session trace every turn; tracked by the setup
commit, it left no clean tree and the `idd` arm never finished, as in the
discarded first attempt of `idd-5`), writes the record to
`records/<record>.json` after every run, and keeps transcripts under
`scripts/evals/.runs/bench/<record>/<scenario>[/r<n>]/` (gitignored). Once
judged, the workspace moves there too (`workspace/`), so no later run can find
it. Runs go one at a time: a second `run` on the same workspaces directory
refuses while the first is alive. `--repetitions <n>` runs every
scenario n times, repetition by repetition (default 3, the fewest a
head-to-head checkpoint concludes from, OSP-011; `--repetitions 1` makes a
quick try). Rerunning the same
record skips complete runs (`--force` reruns them) and refuses a different host,
model, plugin build, persona, corpus, harness, or repetition count. When the
host's usage quota runs out (HTTP 429, such as a subscription session limit),
`run` stops at once with exit code 3 and does not record the interrupted run:
the same command resumes after the reset. A persona that fails twice in a row
(each call already retried, such as an expired login) stops `run` the same way
with exit code 4. The ospec agent's copy of the configuration and the
original share one OAuth login: before every call, the login with the later
expiry is copied over the other, because refreshing it in one directory
leaves the other's dead. Defaults: model `claude-haiku-5-5`,
persona `claude-haiku-5-5` (user decision, 2026-10-21), 30 agent turns and $25
per scenario (`--model`, `--persona-model`, `--max-turns`, `--max-cost`).

### Engram in every arm (OSP-025)

Engram goes in every arm (user decision, 2026-10-13). The ospec arms (`idd`,
`sdd`) use the engram binary of the host's gentle-ai HOME (`<gentle-ai
home>/bin/engram`, or `--engram-bin`), so `setup-gentle-ai` comes first for
them too, and install it the way an ospec user's install does, with the
upstream `engram setup <agent>` (user decision, 2026-10-21): its MCP server and
its memory protocol. On Claude Code it runs in the agent's copy of the bench
configuration (the persona's stays without it) and fetches the `engram@engram`
plugin, its hooks and skill, from its GitHub marketplace, so the plugin version
floats and the record's `plugin_digest` covers it. The agent loads only
Engram's MCP server (`--strict-mcp-config`). On agy it writes
`.gemini/config/mcp_config.json` and the protocol block of `.gemini/GEMINI.md`
into the IDD template. As for gentle-ai, every workspace gets an empty Engram
of its own, and the record keeps `host.engram_mcp_bytes` in every arm.

### On the Antigravity CLI (E4.5)

`--host agy` runs the agent and the persona on `agy` (`--agy-bin`), which keeps
its login outside `HOME`: no bench login is needed. Each workspace gets a fresh
copy of the arm's template HOME under its `.git/`, without agy's
conversations, summaries, or knowledge, so no repetition learns from another.
The IDD template is ospec installed for antigravity from the checkout (no SDD)
with Engram set up in it (see above); its router loads, so the change is the
brief itself, as for gentle-ai. gentle-ai 4.1.1 does not reach agy 1.3.3 on its own (its
verification needs a file its Engram step never writes, and it leaves its
skills and plugin where agy does not read them), so `setup-gentle-ai --host
agy` adds three environment steps around its unchanged install: an empty
`antigravity-cli/mcp_config.json` first, then `agy plugin install` of its
Engram plugin and a copy of its skills into `.gemini/config/skills`.

agy reads the whole disk (`--sandbox` does not stop it), and Gemini explores
it: in the first E4.5 runs it copied the previous repetition's delivery, and
then found this repository through `ps` and read the hidden checks. So every
agy process (agent and persona) runs in bubblewrap (`bwrap`, Linux only; `run
--host agy` refuses without it): a PID namespace of its own, the system temp
directory, the top-level directory of the user's `HOME` (`/home`) and the
bench's directories emptied, and only the run's own directory, the arm's
template, agy and the bench's Node mounted back. `/home` goes whole because
in the first run of #388 Gemini read this repository's copy in a btrfs
snapshot (`/home/.snapshots/<n>/snapshot/...`): records, hidden facts,
checks and reference solution.
Its environment is an allowlist (`PATH`, locale, terminal, user, runtime
directory, D-Bus and proxy or certificate variables): a terminal or editor
variable such as `ORCA_WORKSPACE_ID`, which named this repository, never
reaches agy.
As a safety net, after every turn the host reads the tool steps of the
transcript, and a step that names a path of the bench the sandbox never mounts,
or of a copy of one under another prefix (a snapshot), voids the run (`workspace-escape`): it is neither judged nor recorded, it is
kept as `<scenario>[/r<n>].escaped-<k>/` with its workspace, and the same
command repeats it. The persona's `HOME`, which holds the hidden facts, is
deleted after every call. Each turn gets a fresh sandbox, so a background
process does not outlive its turn.

```sh
node scripts/evals/bench/bench.js setup-gentle-ai --host agy --gentle-ai-bin <dir>/gentle-ai --engram-bin "$(command -v engram)"
node scripts/evals/bench/bench.js run --host agy --corpus greenfield --arm idd --record idd-agy-1 --repetitions 3
node scripts/evals/bench/bench.js run --host agy --corpus greenfield --arm gentle-ai --record gentle-ai-agy-1 --repetitions 3
node scripts/evals/bench/bench.js checkpoint --baseline gentle-ai-agy-1 --candidate idd-agy-1
```

Defaults on agy: model `gemini-3.8-flash-high`, persona
`claude-sonnet-5-5-medium`, 30 agent turns and 30 M tokens per run
(`--max-tokens`), since agy reports no cost. The hidden checks of the greenfield corpus
need a Chromium-family browser (`BENCH_CHROMIUM`, or Chromium or Chrome on the
PATH or in its usual place).

## Metrics

- **Tokens:** input, output, cache reads, and cache writes of every model in the
  change conversation, subagents included. Setup and persona are reported apart.
  On agy: input, output (its thinking included), and cache reads, each turn as
  the difference of the conversation's accumulated usage; cost is 0. Each agent
  turn of the conversation keeps its own `tokens`, so the weight of a turn
  (such as the commit turn) can be read apart.
- **Duration:** wall clock of the host processes.
- **Questions:** agent messages the persona classifies as `question` or
  `approval`; **decision-changing** when the answer discloses a fact or departs
  from the agent's recommendation.
- **Interventions:** every persona reply.
- **Escaped defects:** hidden checks the delivered workspace fails. A run that
  never reached the change (voided setup) is not judged and shows as such.
- **Open facts:** for the `idd` arm, how the change `ospec close` archived
  settled its open facts (`open_facts`): a feature's categories each asked,
  cited (`path:line`) or quoted (from the request), and the questions asked.
  The report lists them. `open_facts.cites` keeps what each cite said: the
  cited line as the setup commit held it (else the delivered tree, else
  `null`) or the quoted fragment, up to 200 characters; only the JSON has it.
- **Repetitions:** the report adds the mean of each scenario over its
  repetitions; the total of those means compares with a one-repetition record.
  Schema 1 records (one run per scenario, such as `sdd-baseline-2`) still read
  as one repetition.
- **Schema 3:** adds `repo_commit` (the checkout's commit, `-dirty` when a
  tracked file outside `records/` differs), requires `host.engram_mcp_bytes`,
  tokens per agent turn and `open_facts`. Schema 1 and 2 records still read.

## Checkpoint

`margins.json` (`bench-margins-11`, OSP-011, #342) is declared before the
repetition on Claude Code with Haiku for the agent and the persona (user
decision, 2026-10-21), with Engram in every arm (OSP-025): `gentle-ai` is the
baseline and `idd` the candidate; both arms run each scenario of the default
corpus and of the reserved corpus three times, one record per corpus and arm.
Summed over the per-scenario means, the candidate may not escape more defects
than the baseline (`max_mean_delta: 0`) or spend more tokens
(`max_total_ratio: 1`), as in E4.9. Quality: the candidate's mean mutation
score may not trail by more than 5 points, and the blind review may not prefer
the baseline in both orders in more than one pair. The verdict blocks nothing.
With fewer than three repetitions per scenario the checkpoint states
`Inconclusive` (`conclusive: false`): the decision still applies the margins,
but shows neither arm is better (OSP-011). The report also gives the mean of
the per-scenario token ratios with its 95% t interval. `bench-margins-10` (E4.6, one
repetition, the same thresholds) stays reproducible from v2.144.0.
`bench-margins-9` (the greenfield campaign: three repetitions,
delta 2, ratio 10, the same quality criterion, and per-scenario rules judged in
its report) stays reproducible from v2.143.0. `bench-margins-8` (E4.9, one
repetition, delta 0, ratio 1, no quality criterion) stays reproducible from
v2.137.0. The E4.5 checkpoint
(`bench-margins-7`, three repetitions and the same quality criterion) is
reproducible from v2.134.0. The E4.2 checkpoint (`bench-margins-6`, one
repetition, no quality criterion) is reproducible from v2.133.0. Fixed in code:
incomparable records (including another repetition count, and a pair where
either arm ran without Engram, OSP-025), incomplete or missing runs, and any
hidden check the baseline passes in every repetition and the candidate fails in
any force `revise`. Margins that declare quality need the pair's
`scripts/evals/quality` result (`scripts/evals/quality/results/<baseline>__<candidate>/quality.json`,
or `--quality-dir`): without it the checkpoint revises with `quality-missing`,
and with it the quality verdict is one more reason (OSP-026). So the E4.6 pair
`gentle-ai-agy-4` / `idd-agy-4` is no longer comparable: its IDD arm ran without
Engram and its quality was never collected. A new campaign that needs other
margins declares a new version first.

Records of different harnesses are not comparable unless the margins declare a
`harness_exception` (one baseline digest, the candidate digests accepted against
it, the files that differ, and why), and a test then verifies it against
committed copies of those files. `bench-margins-11` declares none: both arms run
with the same harness. The E4.1 checkpoint (`bench-margins-5`,
`sdd-baseline-3` against `idd-2`, with its exception and
`harness-exception.test.js`) is reproducible from v2.132.1 or earlier.

## Limits

- One host and one model per record: Claude Code, or the Antigravity CLI.
  A host adapter for Codex can be added beside them.
- On agy, gentle-ai runs with three environment steps of the bench (see
  above); its content is the one it installs.
- agy's accumulated usage is the conversation's: whether it includes the
  subagents agy may launch is not documented, and the record counts none.
- An agy template HOME records absolute paths of the record's workspace
  directory; the digest reads that directory as `~` and leaves out binaries
  (the hook launcher built from Go), whose source `repo_commit` pins.
- The persona is a model: its classification is checked only by the record's
  conversation log, which keeps every message (clipped) for audit.
- Isolation from the hidden checks is by location: they live in this
  repository and the workspace lives under the system temp directory.
