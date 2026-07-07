# Orchestrator Golden Evals

A golden-scenario eval suite that validates the SDD orchestrator's documented
behavior (routing, gates, blockers) end-to-end against 7 fixture repos, and
produces objective, model-agnostic evidence before bumping a model tier in
`models.yaml`. Implements capability `orchestrator-evals`
(see `openspec/specs/orchestrator-evals/spec.md` once archived, or
`openspec/changes/prompt-evals-golden-scenarios/specs/orchestrator-evals/spec.md`
before archive).

## Why this exists

The orchestrator (`agents/sdd-orchestrator.agent.md`) is an LLM-plus-tools
agent, not a pure function. Bumping the model backing it is a behavior change
that deserves evidence, not vibes. This suite runs the orchestrator live
against 7 versioned fixture scenarios and scores only **structural**
outcomes — resolved route, `blocker_type`, artifact presence/absence,
`state.yaml` fields, and `question_gate` shape (question/option counts,
`recommended` flags) — never free-text prose. That's what makes the same
suite portable across models: two different models can phrase a
`question_gate.reason` completely differently and both still pass, as long
as the structural shape matches.

## What this is NOT

- **Not part of `npm test` / CI.** `run.js` requires a live, configured model
  session to actually drive the orchestrator. There is no headless
  (`claude -p`-style) invocation wired up in this iteration — that's
  deferred to roadmap item 2.2/B4. Only the pure-Node halves
  (`lib/assertions.js` + `lib/fixtures.js`, exercised by
  `lib/assertions.test.js` + `lib/fixtures.test.js`) run in CI.
- **Not a transcript replay.** Nothing here asserts against a pre-recorded
  golden transcript. Every scenario run is a genuine live model invocation.

## Architecture

```
scenario.json + repo/ seed ──setup──▶ .runs/<scenario>/ (isolated workspace)
                                          │
                      live orchestrator session (configured model)
                                          │  writes state.yaml, openspec/**,
                                          │  and .eval-capture/{gate,envelope,done}.json
                                          ▼
capture.js  ◀── reads workspace fs + .eval-capture ──▶ { state, fileTree, gate, envelope }
                                          │
                      assertions.js (structural-only) ──▶ per-scenario {pass, failures[]}
                                          │
                          run.js report ──▶ N/7 passed + failing fields
```

| File | Role |
|------|------|
| `lib/fixtures.js` | Loads a scenario's `scenario.json`, materializes its `repo/` into an isolated `.runs/<scenario>/` workspace, tears it down |
| `lib/capture.js` | Snapshots a workspace after a live run: parsed `state.yaml`, file tree, `.eval-capture/gate.json`/`envelope.json` |
| `lib/assertions.js` | `assertScenario(expect, captured) → { pass, failures[] }` — the structural-only matcher |
| `__fixtures__/<scenario>/` | 7 golden scenario dirs, each `{ scenario.json, repo/ }` |
| `run.js` | CLI: `setup` / `assert` / `report` / `run <scenario\|all>` / `teardown` |

## Running the suite

Requires a live, configured model session (an interactive agent turn) — this
is a manual/local capability in this iteration, not a headless CLI. There are
two participants: **you** (running `run.js`, a plain Node script) and **the
live agent session** (playing the orchestrator, following the protocol
below).

```sh
# 1. Materialize every fixture's repo/ into an isolated workspace and print
#    the driver instructions for whichever scenarios haven't been run yet.
node scripts/evals/run.js run all

# 2. For each scenario reported "awaiting-live-run": open a live orchestrator
#    session rooted at the printed workspace path and follow the Driver
#    Protocol below.

# 3. Re-run the same command. Scenarios with a completed live turn are
#    scored; anything still pending re-prints its instructions.
node scripts/evals/run.js run all

# Once every scenario has a completed live turn, this prints:
#   PASS/FAIL per scenario, plus "N/7 passed"

# Run (or re-run) a single scenario:
node scripts/evals/run.js run high-risk-clarify-route

# Lower-level verbs, if you want to drive the phases yourself:
node scripts/evals/run.js setup <scenario|all>    # materialize only
node scripts/evals/run.js assert <scenario|all>   # score an already-run workspace
node scripts/evals/run.js report <scenario|all>   # assert + print the summary
node scripts/evals/run.js teardown                # remove scripts/evals/.runs/ entirely
```

Exit codes: `0` all requested scenarios passed; `1` at least one assertion
failed (or a usage/setup error); `2` from `run` when one or more scenarios
are still `awaiting-live-run` (distinct from a real assertion failure).

## Driver Protocol (what the live session must do)

This is the contract between the deterministic Node halves and the live
agent turn, per ADR "Agent-assisted harness, not a self-driving Node runner"
in `openspec/changes/prompt-evals-golden-scenarios/design.md`.

1. Read the scenario's printed **Input command** / **Input text** and send
   it to a live orchestrator session whose working directory is the printed
   **Workspace** path (`scripts/evals/.runs/<scenario>/`) — a real,
   materialized fixture repo, not a description of one.
2. Let the orchestrator run its normal behavior: classify, route, gate,
   dispatch sub-agents, write `state.yaml` and `openspec/changes/**` — same
   as it would for a real user, with two eval-only exceptions below.
3. **Gate capture**: whenever the orchestrator would normally call
   `vscode/askQuestions` to block on a `question_gate`, instead write that
   exact `question_gate` payload as JSON to
   `<workspace>/.eval-capture/gate.json` and stop the turn there — do not
   wait for (or fabricate) a human answer. Shape:
   `{ "questions": [ { "header": "...", "options": [ { "label": "...", "recommended": true }, ... ] }, ... ] }`.
4. **Envelope capture**: whenever a sub-agent returns `status: blocked` and
   the scenario's `scenario.json` sets `capture.envelope: true`, write that
   sub-agent's return envelope as JSON to
   `<workspace>/.eval-capture/envelope.json` (at minimum
   `{ "status": "blocked", "blocker_type": "..." }`).
5. **Completion marker**: once the turn is over — whether it ended in a gate
   capture, an envelope capture, or neither (e.g. the vague-request scenario,
   which expects neither) — always write
   `<workspace>/.eval-capture/done.json`, e.g.
   `{ "completed_at": "<ISO-8601 UTC timestamp>" }`. `run.js run` uses this
   file's presence as the sole signal that a scenario has a completed live
   turn ready to score; without it, re-running `run.js run` reprints the
   same instructions indefinitely.
6. Do not manually re-run `setup` for a scenario you've already driven live —
   it would wipe the workspace (including your `.eval-capture/` files) and
   re-materialize the pristine fixture. `run.js run` already skips `setup`
   for a workspace that already exists.

### The `GIT-BASELINE.json` marker (git-dependent fixtures only)

`sdd-document`'s update-mode drift detection and its J5 sandbox-inventory
check both depend on real `git` state (a `gitHead` in `.last-update.json`,
and `git status` for untracked/changed paths). Since this repository must
never contain a nested `.git` directory as a committed fixture asset (git
would treat it as a broken submodule pointer and silently drop its
contents), fixtures that need git state instead ship a `GIT-BASELINE.json`
marker at the root of their `repo/` tree. `run.js setup` (and therefore
`run.js run`) consumes it automatically, in the freshly materialized
(gitignored, ephemeral) `.runs/<scenario>/` workspace — never in the
committed fixture tree itself. Every `gitHead_files`/`post_baseline_untracked`
entry is resolved strictly inside that workspace (a `../..`-style traversal
or an absolute-path-shaped entry throws loudly instead of silently escaping)
— defense-in-depth, since the marker is a documented convention any future
fixture author can reuse, not just the two scenarios currently shipping one:

```json
{
  "commit_all": true,
  "gitHead_files": ["openwiki/.last-update.json"],
  "post_baseline_untracked": ["src/leaked-notes.txt"]
}
```

- `commit_all` (default `true`): `git init` the workspace and commit
  everything (minus `post_baseline_untracked` paths, see below) as a single
  baseline commit.
- `gitHead_files`: files whose content contains the literal placeholder
  token `__GIT_HEAD__`; after the baseline commit, each occurrence is
  replaced with the commit's real short hash (`git rev-parse --short HEAD`),
  and the change is folded into the same commit via `--amend`.
- `post_baseline_untracked`: paths that are already present in the
  materialized workspace but must land as genuinely **untracked** relative
  to the baseline commit (simulating a changed/untracked path a prior
  documentation run left behind). `run.js` moves them out of the workspace
  before the baseline commit and moves them back immediately after, so
  `git status` shows them as untracked, never staged or committed.
- The marker file itself is deleted from the workspace before the live turn
  starts — it is build-time-only fixture metadata, not part of the
  simulated repo.
- Before the baseline commit, `run.js` also writes (and commits) a
  `.gitignore` containing `.eval-capture/` into the workspace. This keeps
  the harness's own side-channel directory (`gate.json`/`envelope.json`/
  `done.json`/the setup completion marker) invisible to `git status` inside
  the fixture's nested repo — without it, that directory would show as
  untracked and could produce a false positive for `sdd-document`'s J5
  sandbox-inventory check on a scenario (like `document-update-noop`) that
  expects a perfectly clean tree.

## `scenario.json` manifest shape

```json
{
  "id": "apply-design-mismatch-blocked",
  "group": "orchestrator-core",
  "input": { "command": "/sdd-continue", "text": "..." },
  "capture": { "gate": false, "envelope": true },
  "expect": {
    "route": "sdd-design",
    "blocker_type": "design-mismatch",
    "state": { "status": "blocked", "blocking_questions_nonempty": true },
    "artifacts_absent": [],
    "question_gate": null
  }
}
```

`expect` fields (all optional — omit any the scenario doesn't care about),
evaluated by `lib/assertions.js`:

| Field | Checked against | Notes |
|-------|-----------------|-------|
| `route` | `state.next_recommended`, falling back to `state.route.actual_route` | |
| `blocker_type` | `envelope.blocker_type` | |
| `state.<key>` | `state[key]` | any top-level `state.yaml` field; `blocking_questions_nonempty` is derived from `state.blocking_questions.length > 0` |
| `artifacts_present` | file tree (relative paths) | every listed path MUST exist |
| `artifacts_absent` | file tree (relative paths) | no file tree entry MUST equal or start with `<path>/` |
| `fileTreeUnchanged` + `baselineFileTree` | file tree (relative paths) | `fileTreeUnchanged: true` asserts the captured file tree (minus harness-only `.eval-capture/**` paths) is EXACTLY the path set listed in `baselineFileTree` — both no unexpected new files and no missing expected files, named individually in `failures[]` |
| `question_gate` | `gate.questions[]` | `null` asserts NO gate was captured; otherwise `{ questions, options_min: { "<index>": n }, recommended_present: { "<index>": bool } }` |

The matcher never reads `executive_summary` or any question/option wording —
only counts, flags, and named field values (REQ-orchestrator-evals-002).

## The 7 golden scenarios

| Scenario | Group | What it proves |
|----------|-------|-----------------|
| `vague-request-no-artifact` | orchestrator-core | A genuinely vague request gets an intent-restatement, never a fabricated change |
| `high-risk-clarify-route` | orchestrator-core | `high-risk` classification resolves a route whose gates include `clarify` |
| `verify-fail-spec-gap-routes-sdd-spec` | orchestrator-core | A `FAIL`/`spec-gap` verify-report routes to `sdd-spec`, not `sdd-apply` |
| `apply-design-mismatch-blocked` | orchestrator-core | A `blocker_type: design-mismatch` envelope routes to `sdd-design`, never a silent `sdd-apply` retry |
| `document-batched-gate` | sdd-document | Init-mode `/sdd-document` asks language+scope as ONE batched gate, never two round-trips |
| `document-update-noop` | sdd-document | No source drift since the last run ⇒ no new files (`fileTreeUnchanged`), `state.yaml` untouched |
| `document-sandbox-violation-blocked` | sdd-document | A changed/untracked path outside the approved output dir halts with the documented 2-option gate |

## Role as a pre-`models.yaml`-bump gate

Before promoting a model to a higher tier in `models.yaml`, run this suite
against that model and attach the `N/7 passed` result (plus any failing
field names) to the change proposing the bump. A model that cannot pass all
7 structural scenarios has not earned the tier bump regardless of how good
its prose looks in casual use.

## Caveats

This is a **manual, local** capability (roadmap 2.1) — there is no CI
wiring and no headless driver yet (roadmap 2.2/B4). Scoring is
structural-only and taken from a single post-run snapshot (not a
before/after diff). `document-update-noop` uses `fileTreeUnchanged` +
`baselineFileTree` (see the manifest shape table above) to assert the exact
set of files present after the run matches the fixture's own seed tree — this
catches a broken orchestrator that silently writes a NEW output file, which
the previous `state.yaml.last_updated`-only proxy could not detect. It still
does not catch an in-place content rewrite of an EXISTING output file at an
unchanged path (a full before/after content diff, which would need
per-file hashing, is a larger change deferred as follow-up debt); the
`state.<key>` checks on `state.yaml`'s own fields remain the guard against
`state.yaml` itself drifting. Refine a scenario's `expect` block after your
first live run against your target model if you find a sharper, still-
structural assertion.
