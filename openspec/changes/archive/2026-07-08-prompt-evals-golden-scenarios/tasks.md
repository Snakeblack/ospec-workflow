# Tasks: Evals golden de comportamiento del orquestador

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-001 / 7 golden scenarios corpus | MUST | `scripts/evals/__fixtures__/<7 dirs>/{scenario.json,repo/}` | covered-by-design | Seeded-trigger fixture decision (ADR sdd-design-002) |
| REQ-001 / vague→restatement, no artifact | MUST | fixture `vague-request-no-artifact/` | covered-by-design | |
| REQ-001 / high-risk→clarify route | MUST | fixture `high-risk-clarify-route/` | covered-by-design | |
| REQ-001 / verify FAIL spec-gap→sdd-spec | MUST | fixture `verify-fail-spec-gap-routes-sdd-spec/` (pre-seeded verify-report) | covered-by-design | |
| REQ-001 / apply design-mismatch→sdd-design | MUST | fixture `apply-design-mismatch-blocked/` (pre-seeded blocked state.yaml) | covered-by-design | |
| REQ-001 / doc batched gate (2 questions) | MUST | fixture `document-batched-gate/` + `.eval-capture/gate.json` capture | covered-by-design | ADR sdd-design-001 side-channel |
| REQ-001 / doc update no-op | MUST | fixture `document-update-noop/` | covered-by-design | |
| REQ-001 / doc sandbox violation→blocked | MUST | fixture `document-sandbox-violation-blocked/` + `.eval-capture/envelope.json` | covered-by-design | |
| REQ-002 / structural-only assertion contract | MUST | `scripts/evals/lib/assertions.js` + `assertions.test.js` | covered-by-design | Matcher never reads prose fields |
| REQ-003 / runner pass/fail per scenario + summary | MUST | `scripts/evals/run.js` (`setup/assert/report/run`), `lib/capture.js` | covered-by-design | Live-invocation model (ADR sdd-design-001); `run.js` excluded from `*.test.js` glob |
| REQ-003 / failure names diverged field | MUST | `assertions.js` failures[] + `run.js` report path | covered-by-design | |
| REQ-004 / docs + pre-bump gate | MUST | `scripts/evals/README.md`, `models.yaml` header comment | covered-by-design | |
| REQ-004 / manually runnable, no CI | MUST | `run.js` not named `*.test.js`; README documents manual command | covered-by-design | |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (open question in design.md is non-blocking, deferred to roadmap 2.2)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1500-2200 (3 lib modules, 2 test files, 7 fixture dirs with `scenario.json` + seed `repo/` trees, `run.js` CLI, README, 2 one-line edits) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR under `size:exception` (additive, isolated under `scripts/evals/`; internal work units below for review navigation only) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `lib/fixtures.js`, `lib/capture.js`, `.gitignore` entry | PR 1 (single, size:exception) | Foundation helpers, no assertions yet |
| 2 | `lib/assertions.js` + `assertions.test.js` + `lib/fixtures.test.js` (RED→GREEN) | PR 1 | Core matcher, fully unit-tested, collected by `npm test` |
| 3 | 7 fixture scenario dirs (`scenario.json` + `repo/`) | PR 1 | Versioned data, reuses `__fixtures__/` pattern |
| 4 | `run.js` CLI + driver protocol print path | PR 1 | Kept out of `*.test.js` glob per ADR sdd-design-001 |
| 5 | `README.md` + `models.yaml` comment | PR 1 | Docs + pre-bump gate pointer |

Additive-only under `scripts/evals/` plus two one-line edits (`models.yaml`, `.gitignore`); maintainer has pre-accepted `size:exception` per `delivery_strategy: exception-ok`, so units above are for reviewer navigation, not separate PRs.

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Foundation

- [x] 1.1 Create `scripts/evals/lib/fixtures.js`: `materializeFixture(scenarioDir, runsRoot)` copies a scenario's `repo/` tree into an isolated `.runs/<scenario>/` workspace; `teardown(runsRoot)` removes it. [REQ-orchestrator-evals-001, REQ-orchestrator-evals-003]
- [x] 1.2 Create `scripts/evals/lib/capture.js`: `captureWorkspace(workspaceRoot)` returns `{ workspaceRoot, state, fileTree, gate, envelope }` — parses `state.yaml`, walks the tree for relative paths, parses `.eval-capture/gate.json`/`envelope.json` when present (`null` otherwise). [REQ-orchestrator-evals-003]
- [x] 1.3 Add `scripts/evals/.runs/` to `.gitignore`. [REQ-orchestrator-evals-003]

## Phase 2: Core Implementation (TDD)

- [x] 2.1 RED: write `scripts/evals/lib/assertions.test.js` — cases for route match, `blocker_type` match, `state.yaml` field match (`status`, `blocking_questions`), artifact present/absent by path, `question_gate` shape (question count, per-question option count, `recommended` flags present), a case proving differing prose does not fail, and a case proving a diverged field is named in `failures[]`. [REQ-orchestrator-evals-002, REQ-orchestrator-evals-003]
- [x] 2.2 GREEN: implement `scripts/evals/lib/assertions.js` exporting `assertScenario(expect, captured) → { pass, failures[] }` satisfying 2.1; assertion surface limited exactly to the structural fields in the `expect` shape from design.md (never reads `executive_summary`/question or option wording). [REQ-orchestrator-evals-002, REQ-orchestrator-evals-003]
- [x] 2.3 RED→GREEN: add `scripts/evals/lib/fixtures.test.js` covering `materializeFixture`/`teardown` round-trip and manifest-shape validation against a minimal stub scenario dir. [REQ-orchestrator-evals-001]

## Phase 3: Golden Fixture Corpus

- [x] 3.1 Create `scripts/evals/__fixtures__/vague-request-no-artifact/{scenario.json,repo/}` — vague request, expect intent restatement and no `openspec/changes/{change}/` artifact. [REQ-orchestrator-evals-001]
- [x] 3.2 Create `.../high-risk-clarify-route/{scenario.json,repo/}` — `high-risk` classification, expect resolved route includes `clarify` gate and `state.yaml` records the route name. [REQ-orchestrator-evals-001]
- [x] 3.3 Create `.../verify-fail-spec-gap-routes-sdd-spec/{scenario.json,repo/}` — pre-seed a `verify-report.md` tagged `FAIL`/`spec-gap`; expect dispatch resolves to `sdd-spec` and top-level `status` stays `blocked`. [REQ-orchestrator-evals-001]
- [x] 3.4 Create `.../apply-design-mismatch-blocked/{scenario.json,repo/}` — pre-seed a blocked `state.yaml` with `blocker_type: design-mismatch`; expect route to `sdd-design`, never a silent `sdd-apply` retry. [REQ-orchestrator-evals-001]
- [x] 3.5 Create `.../document-batched-gate/{scenario.json,repo/}` — no prior `.last-update.json`; expect exactly one `question_gate` capture with 2 questions (language, scope). [REQ-orchestrator-evals-001]
- [x] 3.6 Create `.../document-update-noop/{scenario.json,repo/}` — persisted `.last-update.json`, no source drift; expect no new output files and `state.yaml`/`.last-update.json` unchanged in content. [REQ-orchestrator-evals-001]
- [x] 3.7 Create `.../document-sandbox-violation-blocked/{scenario.json,repo/}` — seed a changed/untracked path outside the approved output dirs/exceptions; expect a `question_gate` capture with exactly the two documented options and no silent route close. [REQ-orchestrator-evals-001]

## Phase 4: Runner and Driver Protocol

- [x] 4.1 Create `scripts/evals/run.js` with verbs `setup`, `assert`, `report`, `run <scenario|all>`: `setup` calls `fixtures.materializeFixture`; `run` prints the driver-protocol instructions and exits `awaiting-live-run` when no `.eval-capture`/state signal is present yet, or asserts+reports when re-invoked after a capture exists. File is intentionally NOT named `*.test.js` so `check.js`'s `--test scripts/**/*.test.js` glob never collects it (ADR sdd-design-001). [REQ-orchestrator-evals-003]
- [x] 4.2 Implement the report path in `run.js`: per-scenario pass/fail plus an aggregate `N/7 passed` summary, and on failure name the diverged field from `assertions.js`'s `failures[]`. [REQ-orchestrator-evals-003]

## Phase 5: Documentation and Verification

- [x] 5.1 Create `scripts/evals/README.md`: how to run the suite locally against a configured model, the driver protocol contract (`.eval-capture/gate.json` / `envelope.json`), and its role as the evidence gate consulted before a `models.yaml` version bump. [REQ-orchestrator-evals-004]
- [x] 5.2 Add a header comment in `models.yaml` pointing contributors to `scripts/evals/` as the pre-bump gate. [REQ-orchestrator-evals-004]
- [x] 5.3 Run `npm test` locally: confirm `assertions.test.js` and `fixtures.test.js` are collected and green, and confirm `run.js` is excluded from the `--test` glob (manual `node scripts/evals/run.js all` stays outside CI). [REQ-orchestrator-evals-002, REQ-orchestrator-evals-003, REQ-orchestrator-evals-004]

## Phase 6: Cleanup (at archive)

- [x] 6.1 Mark roadmap 2.1 done in `analisis-fino/roadmap-evolucion-harness.md` during `sdd-archive` (per design.md Migration/Rollout note — not part of apply).
