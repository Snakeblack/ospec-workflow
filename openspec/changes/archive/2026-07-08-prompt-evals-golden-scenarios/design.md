# Design: Evals golden de comportamiento del orquestador

## Technical Approach

Implements `orchestrator-evals` (spec REQ-001..004) as an additive `scripts/evals/`
capability with three separable responsibilities: **fixture materialization**,
**live orchestrator execution**, and **structural assertion + reporting**. The
central constraint drives the whole architecture: the orchestrator under test
(`agents/sdd-orchestrator.agent.md`) is an LLM-plus-tools agent that resolves routes,
runs `vscode/askQuestions` gates, and delegates to sub-agents. There is **no
pure-Node entry point** that reproduces its prompt behavior — `route-dispatcher.js`
et al. are pure helpers the live agent calls, not the agent. A standalone Node script
therefore cannot, in this iteration, "run the orchestrator": the only non-interactive
model driver (`claude -p`-style headless) is exactly the CLI subset the proposal
defers to roadmap 2.2/B4. So Node owns the deterministic bookends (setup, assert,
report) and a **live interactive agent session** performs the run in between,
following a documented driver protocol. This satisfies REQ-003's LIVE-invocation
mandate (a real configured model is exercised) without pulling headless/CI into scope.

## Architecture Decisions

### Decision: Agent-assisted harness, not a self-driving Node runner

**Choice**: `scripts/evals/run.js` exposes verbs `setup`, `assert`, `report`, `run`.
`setup` copies a scenario fixture into an isolated run workspace; the contributor (or
an eval-driver agent turn) then runs the scenario input against the live orchestrator
in that workspace; `assert`/`report` read back the workspace and score structurally.
`run <scenario|all>` chains them: it setups, and if a capture is not yet present it
prints the driver instructions and exits `awaiting-live-run`; on re-invocation (capture
present) it asserts and reports.

**Alternatives considered**: (a) `claude -p` headless invocation from Node — rejected:
it is the deferred 2.2 non-interactive CLI subset, and it cannot answer/observe the
interactive `askQuestions` gates that 4 of 7 scenarios assert on. (b) Transcript replay
— rejected: forbidden by REQ-003 and pointless given REQ-002 exists precisely to
tolerate live prose variance.

**Rationale**: honest to the actual invocability surface; keeps the live-model
guarantee; the Node halves are unit-testable and CI-safe today; the missing middle
(programmatic drive) is exactly what 2.2 adds, so this composes forward cleanly.

### Decision: `.eval-capture/` side-channel for interactive gates

**Choice**: `question_gate` payloads emitted through `vscode/askQuestions` never touch
disk, so scenarios that assert gate shape require the run to serialize the emitted gate
(and, for blocker scenarios, the sub-agent return envelope) as JSON to
`<workspace>/.eval-capture/gate.json` / `envelope.json`. The driver protocol instructs
the live session to write that file at the gate/blocker boundary instead of (or before)
blocking on a human answer, then stop. `state.yaml` and `openspec/changes/**` artifacts
need no side-channel — the orchestrator already persists them.

**Alternatives considered**: parsing the chat transcript — rejected (prose-coupled,
model-specific, violates REQ-002 spirit). Asserting only on `state.yaml` — rejected: it
cannot see gate question/option counts the spec requires.

**Rationale**: a small, explicit, model-agnostic capture contract is the only way to
make an interactive gate structurally observable from Node without a headless driver.

### Decision: Seeded-trigger fixtures + `scenario.json` manifest

**Choice**: each scenario is a self-contained directory
`scripts/evals/__fixtures__/<scenario>/` holding a `scenario.json` manifest plus a
`repo/` seed tree (its own `openspec/`, `state.yaml`, `config.yaml` routing block,
`.last-update.json`, source drift, etc.). For routing/blocker scenarios the fixture
**pre-seeds the trigger state** (e.g. a `verify-report.md` tagged `FAIL`/`spec-gap`, or
a blocked `state.yaml`), so the live model exercises the orchestrator's *routing
decision* — the behavior under test — rather than the non-deterministic sub-agent that
produced the trigger. REQ-003 explicitly blesses fixtures capturing reusable starting
states; this is that, applied to the trigger envelope.

**Alternatives considered**: full end-to-end runs where real `sdd-verify`/`sdd-apply`
sub-agents produce the FAIL/blocked envelope live — rejected for 2.1: costly,
flaky, and it tests the sub-agent's judgment, not the orchestrator's routing.

**Rationale**: isolates the assertion target (orchestrator routing/gate behavior),
keeps cost/latency bounded, stays inside the spec's fixture allowance.

### Decision: Declarative structural matcher; evals excluded from `npm test`

**Choice**: `scripts/evals/lib/assertions.js` exposes
`assertScenario(expect, captured) → { pass, failures[] }` where each failure names the
diverged field (REQ-003 attributability). `expect` covers only structural fields
(artifacts present/absent, `state.yaml` field values, dispatched route/phase,
`blocker_type`, `question_gate` shape: question count, per-question option count,
option-label presence, `recommended` flags) — never prose. Only this library gets a
`*.test.js` (pure-Node, runs in `check.js`); `run.js` is NOT a `*.test.js` and is thus
excluded from the `--test scripts/**/*.test.js` collection, so the live suite never runs
in CI.

**Alternatives considered**: assert inside `*.test.js` with `node:test` — rejected: it
would be auto-collected by `check.js` and fail CI (no model). Mirrors the existing
`e2e.test.js` self-skip precedent but goes further by keeping the live driver out of the
test glob entirely.

**Rationale**: keeps CI green and deterministic; matcher logic stays fully unit-tested.

## Data Flow

    scenario.json + repo/ seed ──setup──▶ .runs/<scenario>/ (isolated workspace)
                                              │
                          live orchestrator session (configured model)
                                              │  writes state.yaml, openspec/**,
                                              │  and .eval-capture/{gate,envelope}.json
                                              ▼
    capture.js  ◀── reads workspace fs + .eval-capture ──▶ { state, fileTree, gate, envelope }
                                              │
                          assertions.js (structural-only) ──▶ per-scenario {pass, failures[]}
                                              │
                              report.js ──▶ N/7 passed + failing fields

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/evals/run.js` | Create | CLI: `setup`/`assert`/`report`/`run <scenario\|all>`; prints driver protocol when awaiting live run |
| `scripts/evals/lib/fixtures.js` | Create | Materialize a fixture `repo/` into `.runs/<scenario>/`; teardown |
| `scripts/evals/lib/capture.js` | Create | Snapshot workspace fs + parse `.eval-capture/*.json` and `state.yaml` |
| `scripts/evals/lib/assertions.js` | Create | Declarative structural matcher `assertScenario(expect, captured)` |
| `scripts/evals/lib/assertions.test.js` | Create | Pure-Node unit tests for the matcher (runs in `check.js`) |
| `scripts/evals/__fixtures__/<7 scenarios>/scenario.json` + `repo/` | Create | 7 golden scenarios (4 core + 3 document) with seeded triggers |
| `scripts/evals/README.md` | Create | How to run locally + role as pre-`models.yaml`-bump gate + driver protocol |
| `scripts/evals/.runs/` (gitignored) | Create | Ephemeral run workspaces; add to `.gitignore` |
| `models.yaml` | Modify | Header comment pointing to `scripts/evals/` as pre-bump gate (REQ-004) |
| `analisis-fino/roadmap-evolucion-harness.md` | Modify | Mark 2.1 done (at archive) |

## Interfaces / Contracts

`scenario.json` manifest (per scenario):

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

`question_gate` expectation shape (structural only):
`{ "questions": 2, "options_min": { "0": 2, "1": 4 }, "recommended_present": { "0": true, "1": true } }`.

Captured object: `{ workspaceRoot, state (parsed state.yaml), fileTree (relative paths),
gate (parsed JSON|null), envelope (parsed JSON|null) }`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Matcher logic: field divergence naming, prose ignored, gate-shape counts, absent/present artifacts | `assertions.test.js`, pure-Node, in `check.js` |
| Unit | Manifest validity + fixture materialization/teardown | small `*.test.js` fixture loader test |
| Integration (manual) | 7 live scenarios against a configured model | `node scripts/evals/run.js all`; NOT in CI |

## Migration / Rollout

No migration. Additive under `scripts/evals/` plus one `models.yaml` comment; rollback =
revert the PR. Live suite is manual/local only in 2.1; programmatic driving of the
interactive middle step is deferred to roadmap 2.2/B4.

## Open Questions

- [ ] None blocking. Confirm at 2.2 whether the `.eval-capture/` contract is reused by
  the headless driver or replaced by structured transcript capture.
