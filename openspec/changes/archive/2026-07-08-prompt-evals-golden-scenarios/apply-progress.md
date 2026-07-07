# Apply Progress: prompt-evals-golden-scenarios

**Mode**: Strict TDD
**Delivery**: `size:exception` (single PR, `delivery_strategy: exception-ok` per tasks.md forecast — High risk, ~1500-2200 lines, no chaining)

## Context: retry after infrastructure interruption

A previous `sdd-apply` attempt was interrupted mid-work by an infrastructure
error (session limit), not a design-mismatch or spec issue. No
`apply-progress.md` had been written yet. Three files already existed on disk
from that partial attempt: `scripts/evals/lib/fixtures.js`,
`scripts/evals/lib/capture.js`, `scripts/evals/lib/assertions.test.js`. All
three were read and verified against `design.md`/`spec.md` before reuse:

- `fixtures.js` — `loadScenario`/`materializeFixture`/`teardown` match the
  design's manifest contract and workspace-materialization semantics exactly;
  error messages are descriptive (never opaque). Kept as-is.
- `capture.js` — the YAML-lite parser and `captureWorkspace` shape
  (`{ workspaceRoot, state, fileTree, gate, envelope }`) match design.md's
  Interfaces/Contracts section exactly, including the `.eval-capture/`
  side-channel read path. Kept as-is.
- `assertions.test.js` — 16 RED cases already covered every structural
  assertion surface named in REQ-orchestrator-evals-002/003 (route,
  blocker_type, state fields, artifacts present/absent, question_gate shape,
  prose-is-ignored, diverged-field-naming). Kept as-is; `assertions.js` was
  implemented fresh against it (GREEN).

All 19 tasks across the 6 phases are complete except Phase 6 (roadmap
cleanup mark), which `tasks.md`/`design.md` explicitly defer to `sdd-archive`
and which this apply batch correctly did not touch.

## Completed Tasks

### Phase 1: Foundation
- [x] 1.1 `scripts/evals/lib/fixtures.js` (reused/verified from prior attempt)
- [x] 1.2 `scripts/evals/lib/capture.js` (reused/verified from prior attempt)
- [x] 1.3 `.gitignore` entry for `scripts/evals/.runs/`

### Phase 2: Core Implementation (TDD)
- [x] 2.1 `scripts/evals/lib/assertions.test.js` (reused/verified — RED, pre-existing)
- [x] 2.2 `scripts/evals/lib/assertions.js` (GREEN, implemented this batch)
- [x] 2.3 `scripts/evals/lib/fixtures.test.js` (RED→GREEN, implemented this batch)

### Phase 3: Golden Fixture Corpus (all 7 scenarios)
- [x] 3.1 `vague-request-no-artifact/{scenario.json,repo/}`
- [x] 3.2 `high-risk-clarify-route/{scenario.json,repo/}`
- [x] 3.3 `verify-fail-spec-gap-routes-sdd-spec/{scenario.json,repo/}`
- [x] 3.4 `apply-design-mismatch-blocked/{scenario.json,repo/}`
- [x] 3.5 `document-batched-gate/{scenario.json,repo/}`
- [x] 3.6 `document-update-noop/{scenario.json,repo/}`
- [x] 3.7 `document-sandbox-violation-blocked/{scenario.json,repo/}`

### Phase 4: Runner and Driver Protocol
- [x] 4.1 `scripts/evals/run.js` (`setup`/`assert`/`report`/`run <scenario|all>`/`teardown`)
- [x] 4.2 Report path: per-scenario PASS/FAIL + aggregate `N/7 passed`, diverged-field naming on failure

### Phase 5: Documentation and Verification
- [x] 5.1 `scripts/evals/README.md` (usage, driver protocol, `GIT-BASELINE.json` contract, pre-bump gate role)
- [x] 5.2 `models.yaml` header comment pointing to `scripts/evals/`
- [x] 5.3 `npm test` run locally — see Verification below

### Phase 6: Cleanup (at archive)
- [ ] 6.1 Deferred to `sdd-archive` per `design.md`/`tasks.md` — intentionally not done here.

## Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `scripts/evals/lib/fixtures.js` | Reused (verified) | Manifest loading + fixture materialization/teardown; from prior interrupted attempt, verified correct |
| `scripts/evals/lib/capture.js` | Reused (verified) | YAML-lite `state.yaml` parser + workspace snapshot; from prior interrupted attempt, verified correct |
| `scripts/evals/lib/assertions.test.js` | Reused (verified) | 16 RED unit tests for the structural matcher; from prior interrupted attempt, verified correct |
| `scripts/evals/lib/assertions.js` | Created | GREEN implementation of `assertScenario(expect, captured)`; route/blocker_type/state-field/artifact/question_gate structural checks; every divergence named in `failures[]` |
| `scripts/evals/lib/fixtures.test.js` | Created | RED→GREEN tests for `loadScenario`/`materializeFixture`/`teardown` round-trip + manifest validation errors |
| `scripts/evals/__fixtures__/vague-request-no-artifact/{scenario.json,repo/}` | Created | Vague request; expects no `openspec/changes` artifact |
| `scripts/evals/__fixtures__/high-risk-clarify-route/{scenario.json,repo/}` | Created | High-risk classification request; expects `route: standard` (the route carrying the `clarify` gate) and `state.classification: high-risk` |
| `scripts/evals/__fixtures__/verify-fail-spec-gap-routes-sdd-spec/{scenario.json,repo/}` | Created | Pre-seeded `verify-report.md` tagged `FAIL`/`spec-gap`; expects route `sdd-spec`, `state.status: blocked` |
| `scripts/evals/__fixtures__/apply-design-mismatch-blocked/{scenario.json,repo/}` | Created | Pre-seeded blocked `state.yaml` (apply `blocker_type: design-mismatch`); expects route `sdd-design`, envelope `blocker_type` match, `blocking_questions_nonempty: true` |
| `scripts/evals/__fixtures__/document-batched-gate/{scenario.json,repo/}` | Created | No `.last-update.json` anywhere; expects ONE captured gate with 2 questions (`options_min: {0:2,1:4}`, both `recommended_present`) |
| `scripts/evals/__fixtures__/document-update-noop/{scenario.json,repo/}` | Created | Persisted `.last-update.json` + `GIT-BASELINE.json` git-baseline marker (no drift); expects `state.yaml.last_updated` unchanged, no gate |
| `scripts/evals/__fixtures__/document-sandbox-violation-blocked/{scenario.json,repo/}` | Created | `GIT-BASELINE.json` marks `src/leaked-notes.txt` as `post_baseline_untracked` (simulated leaked write outside `openwiki/`); expects the 2-option sandbox gate + `state.status: blocked` |
| `scripts/evals/run.js` | Created | CLI: `setup`/`assert`/`report`/`run <scenario\|all>`/`teardown`; resolves `GIT-BASELINE.json` markers (git init + baseline commit + `__GIT_HEAD__` resolution + untracked-path staging); NOT named `*.test.js` |
| `scripts/evals/README.md` | Created | Usage, architecture, full Driver Protocol (gate/envelope/done capture contract), `GIT-BASELINE.json` contract, `scenario.json` shape reference, pre-`models.yaml`-bump gate role, caveats |
| `models.yaml` | Modified | Header comment pointing contributors to `scripts/evals/` as the pre-bump gate |
| `.gitignore` | Modified | Added `scripts/evals/.runs/` (ephemeral run workspaces) |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------|
| 1.1 | `lib/fixtures.test.js` (2.3, retro-covering) | Unit | `npm test` | — (pre-existing impl) | — | — | — | Reused/verified from prior attempt; RED/GREEN cycle for its behavior is recorded under task 2.3 below, since its own test file didn't exist until this batch |
| 1.2 | (none — snapshot helper, exercised live via `run.js`/manual scenarios, no dedicated unit test per design's Testing Strategy table) | — | manual smoke test (see Verification) | n/a | n/a | n/a | n/a | Design's Testing Strategy table lists only `assertions.test.js` + a fixture-loader test as unit layers; `capture.js` is exercised end-to-end via the manual eval runs, matching design intent |
| 1.3 | n/a (config change) | — | `git status` review | n/a | n/a | n/a | n/a | `.gitignore` line addition |
| 2.1 | `lib/assertions.test.js` | Unit | `node --test scripts/evals/lib/assertions.test.js` | Ran RED against a stub before `assertions.js` existed in this batch — confirmed `MODULE_NOT_FOUND` on `require("./assertions.js")`, proving the 16 cases were true RED, not vacuously passing | n/a (RED task) | n/a | n/a | Test file itself pre-existed from the interrupted attempt; verified content matches REQ-002/003 exactly before treating it as this batch's RED baseline |
| 2.2 | `lib/assertions.test.js` | Unit | `node --test scripts/evals/lib/assertions.test.js` → 16/16 pass | (2.1) | Implemented `assertions.js`; all 16 cases pass on first full run | Covered via existing test's own model-A/model-B prose-variance case + explicit re-run after intentionally reverting one branch (route fallback) to confirm it still fails correctly, then restoring | Kept surface minimal: 6 small pure functions (`checkRoute`, `checkBlockerType`, `checkStateFields`, `checkArtifactsPresent`, `checkArtifactsAbsent`, `checkQuestionGate`), each appending to a shared `failures[]` | Assertion surface limited exactly to design's structural fields; never reads `executive_summary`/prose |
| 2.3 | `lib/fixtures.test.js` | Unit | `node --test scripts/evals/lib/fixtures.test.js` → 7/7 pass | Wrote 7 cases against `fixtures.js`'s existing (pre-attempt) implementation — first run already GREEN since the implementation pre-existed and matched the contract | Confirmed GREEN on first run (7/7) | Added a dedicated "repeated setup calls discard prior workspace contents" case beyond the minimum ask, to triangulate the discard-old-contents behavior explicitly | No refactor needed — implementation already matched | Since `fixtures.js` pre-existed, this task's RED phase is "test written before being run," not "test written before the implementation existed"; that distinction is recorded honestly here rather than glossed over |
| 3.1–3.7 | n/a (fixture data, not code under test) | Data | End-to-end round-trip script: `loadScenario` + `materializeFixture` + `captureWorkspace` over all 7 dirs (see Verification) | n/a | n/a | n/a | n/a | Fixture manifests/repos are versioned data per REQ-001, validated via the round-trip script, not unit tests |
| 4.1, 4.2 | n/a (CLI script, deliberately excluded from `*.test.js` per ADR sdd-design-001) | Integration (manual) | Full manual smoke test: `setup all` → `run all` (awaiting-live-run, exit 2) → simulated live-turn captures for all 7 scenarios → `run all` (7/7 passed, exit 0) → intentional corruption → `assert` (correctly reports `route: expected "sdd-design", got "sdd-apply"`) → `teardown` | n/a | n/a | n/a | Fixed a real bug found during this smoke test: `cmdRun` was re-invoking `setupScenario` (which wipes and re-copies the workspace) on every `run` call, even after a live turn had already written `.eval-capture/`/`state.yaml` — this would have silently destroyed the very evidence the harness exists to score. Fixed to skip `setup` when the workspace already exists | See Verification section below for full transcript summary |
| 5.1, 5.2 | n/a (docs) | — | Manual review against README.md's own driver-protocol claims (re-verified by actually following them in the 4.1/4.2 smoke test) | n/a | n/a | n/a | n/a | |
| 5.3 | `scripts/**/*.test.js` (full suite) | Suite | `npm test` | n/a | 1101/1101 native tests pass; `run.js` confirmed absent from the collected test list; full target-generation validation ("All checks passed.") | Re-ran `npm test` twice to rule out flakiness after one unrelated pre-existing failure | n/a | See Verification below |

## Verification

- `node --test scripts/evals/lib/assertions.test.js` → 16/16 pass
- `node --test scripts/evals/lib/fixtures.test.js` → 7/7 pass
- Manual round-trip script (`loadScenario` + `materializeFixture` +
  `captureWorkspace`) over all 7 `__fixtures__/*` dirs → all load, materialize,
  and capture without error
- `node scripts/evals/run.js setup all` → materializes all 7 workspaces;
  confirmed `GIT-BASELINE.json` resolution for the two `sdd-document` git-
  dependent fixtures (`document-update-noop`, `document-sandbox-violation-blocked`):
  `gitHead` placeholder replaced with the real short commit hash, and
  `src/leaked-notes.txt` correctly lands as `??` (untracked) in `git status`
  for the sandbox-violation scenario
- `node scripts/evals/run.js run all` (before any live turn) → all 7 report
  `awaiting-live-run`, exit code `2`
- Simulated a live-turn capture (`.eval-capture/{gate,envelope,done}.json` +
  `state.yaml` writes) for all 7 scenarios by hand, matching what a real
  orchestrator session would produce → `node scripts/evals/run.js run all`
  → `7/7 passed`, exit code `0`
- Intentionally corrupted one scenario's `state.yaml` (`next_recommended:
  sdd-apply` instead of `sdd-design`) → `node scripts/evals/run.js assert
  apply-design-mismatch-blocked` correctly reports
  `FAIL` with `- route: expected "sdd-design", got "sdd-apply"`, proving
  attributable failure reporting (REQ-orchestrator-evals-003)
- `node scripts/evals/run.js teardown` → removes `.runs/` cleanly
- `npm test` (full suite, run twice) → **1101/1101 native tests pass**,
  4/4 target generations validate ("All checks passed."); `scripts/evals/lib/assertions.test.js`
  and `scripts/evals/lib/fixtures.test.js` are both present in the collected
  test list; `scripts/evals/run.js` is confirmed **excluded** (not named
  `*.test.js`, never appears as a collected test file)
  - First `npm test` run hit one **unrelated, pre-existing** flaky failure in
    `scripts/lib/ospec-state.test.js` ("appendRuntimeEvent serializes
    concurrent writers... EPERM" — a Windows file-lock timing issue,
    unrelated to this change). Re-ran that file alone (53/53 pass) and the
    full suite again (clean) to confirm it was pre-existing flakiness, not a
    regression introduced by this batch.

## Deviations from Design

None — implementation matches `design.md`. One clarification: design.md's
File Changes table does not list a separate "driver protocol document"; per
`tasks.md` 5.1 and design's own Testing Strategy note, the driver protocol
is documented inside `scripts/evals/README.md` rather than as a standalone
file, which is what was built.

## Assumptions

Two internal-only decisions were made this batch (neither affects an
external contract already fixed by spec/design, so per the Assumption
Materiality Rule neither required a `question_gate`):

- `sdd-apply-001` (internal, reversibility: high): the `GIT-BASELINE.json`
  marker convention (fields: `commit_all`, `gitHead_files`,
  `post_baseline_untracked`) for git-dependent fixtures — invented in this
  batch since design.md specifies the `.eval-capture/` side-channel contract
  but does not specify how git-dependent fixtures (`sdd-document`'s
  `gitHead`-scoped drift detection and `git status`-based sandbox check)
  should be seeded without committing a nested `.git` directory into this
  repository. Basis: avoids the git-submodule-pointer footgun of a committed
  nested `.git`; keeps the mechanism entirely inside the gitignored,
  ephemeral `.runs/` workspace; documented fully in README.md so any future
  scenario author can reuse the same convention.
- `sdd-apply-002` (internal, reversibility: high): the `.eval-capture/done.json`
  completion marker — invented in this batch as the uniform signal `run.js
  run` uses to distinguish "awaiting a live turn" from "ready to score,"
  since scenarios differ in whether they expect a gate/envelope capture at
  all (e.g. `vague-request-no-artifact` expects neither). Basis: keeps
  `run.js`'s control flow scenario-agnostic; documented in README.md's
  Driver Protocol step 5.

## Issues Found

- **Bug found and fixed during smoke testing** (see TDD Cycle Evidence,
  task 4.1/4.2): `cmdRun` in `run.js` originally called `setupScenario` on
  every invocation, including re-invocations after a live turn had already
  captured evidence into the workspace — `materializeFixture` unconditionally
  wipes and re-copies the workspace, so this would have silently destroyed
  `.eval-capture/` and any `state.yaml` writes the live session produced,
  making the harness un-usable across its own two-step (setup-then-drive,
  then re-invoke-to-score) design. Fixed by skipping `setup` when the
  workspace directory already exists. Verified via the full manual
  smoke-test transcript in Verification above.

## Workload / PR Boundary

- Mode: single PR, `size:exception` (delivery_strategy: exception-ok,
  pre-accepted per the launch prompt)
- Current work unit: all 5 suggested work units from `tasks.md`'s Review
  Workload Forecast, delivered together (additive-only under
  `scripts/evals/` plus the two one-line edits to `models.yaml`/`.gitignore`)
- Boundary: this batch starts from an empty `scripts/evals/` tree (plus the
  3 pre-existing files from the interrupted attempt) and ends with all 19
  tasks across Phases 1-5 complete and locally verified; Phase 6 (roadmap
  mark) is explicitly deferred to `sdd-archive`
- Estimated review budget impact: within the pre-accepted `size:exception`
  forecast (~1500-2200 lines); no further chaining needed

## Status

18/19 tasks complete (Phase 6's single task is intentionally deferred to
`sdd-archive` per design.md, not outstanding work). Ready for `sdd-verify`.

---

## Remediation Batch: 4R review gate findings (post-verify, pre-archive)

**Context**: `sdd-verify` returned PASS WITH WARNINGS (see `verify-report.md`).
The 4R review gate then found 1 CRITICAL + 7 WARNING + 2 SUGGESTION. Per
`approval-001` in `state.yaml`, the user approved remediating the CRITICAL
plus the two most impactful WARNINGs (`document-update-noop` weak proxy;
`GIT-BASELINE.json` path traversal) before archive; the remaining
WARNINGs/SUGGESTIONs are documented as follow-up debt at archive. All three
items are in scope of `scripts/evals/` only — no other change to the
original 19 tasks.

### R1 — CRITICAL: silent reuse of a half-materialized/corrupted fixture workspace

**Fix**: Introduced a completion marker convention consistent with the
existing `.eval-capture/done.json` pattern:
`scripts/evals/lib/fixtures.js` now exports `markMaterialized(workspaceRoot)`
/ `isMaterialized(workspaceRoot)`, backed by a marker file at
`<workspaceRoot>/.eval-capture/materialized.json`. `run.js`'s `setupScenario`
calls `markMaterialized` only after BOTH `materializeFixture` AND
`applyGitBaseline` (when a `GIT-BASELINE.json` is present) have fully
succeeded — if either throws partway, execution never reaches that call, so
the workspace is correctly left unmarked. `cmdRun`'s reuse decision (and
`scoreScenario`'s "workspace ready" guard) now check `isMaterialized(...)`
instead of bare `fs.existsSync(...)`; a workspace whose directory exists but
lacks the marker falls through to a full `setupScenario` rebuild, which
itself `rmSync`s the stale/partial directory before re-copying (pre-existing
`materializeFixture` behavior, unchanged).

**Bug found and fixed as a direct side-effect of this remediation** (not
present before this batch — introduced transiently while implementing the
marker, then caught by this batch's own manual verification before it ever
reached `main`): writing the marker under `.eval-capture/materialized.json`
*after* `applyGitBaseline`'s baseline git commit meant it (and any future
`.eval-capture/*` file, including a live turn's own `gate.json`/`done.json`)
would show as untracked inside the fixture's nested git repo — a **false
positive** for `sdd-document`'s J5 sandbox-inventory check on
`document-update-noop`, which expects a perfectly clean tree. Fixed by
having `applyGitBaseline` write (and commit, via the existing `commit_all`
step) a `.gitignore` containing `.eval-capture/` into the workspace *before*
`git init`, so the harness side-channel is invisible to `git status` for
git-baselined fixtures. Verified: `git status --porcelain` inside a freshly
set-up `document-update-noop` workspace is now empty; the sandbox-violation
fixture still shows exactly `src/leaked-notes.txt` untracked (unchanged).

**Tests** (`scripts/evals/lib/fixtures.test.js`, RED→GREEN):
- `isMaterialized: a freshly materialized workspace is NOT marked materialized yet`
- `markMaterialized + isMaterialized: a workspace is materialized only after explicitly marked`
- `isMaterialized: a half-copied/corrupted workspace (dir exists, marker absent) is detected as NOT materialized`
- `isMaterialized: rebuilding a corrupted workspace via materializeFixture + markMaterialized recovers it`
- `isMaterialized: a nonexistent workspace root is safely reported as not materialized`

**Manual integration verification** (`run.js`'s exports aren't collected by
`npm test` per ADR-004, so this layer stays manual, same as the original
apply's 4.1/4.2 evidence): `setup` → confirmed `.eval-capture/materialized.json`
written; manually deleted the marker and dropped a `stray-partial.txt` into
the workspace to simulate corruption → `run.js run <scenario>` correctly
treated it as `awaiting-live-run` (rebuilt, not reused) → after rebuild, the
stray file was gone and the marker was freshly re-written. Also re-verified
both `GIT-BASELINE.json`-consuming fixtures (`document-update-noop`,
`document-sandbox-violation-blocked`) end-to-end after the `.gitignore` fix.

### R2 — WARNING: `document-update-noop` fixture's expect block too weak

**Fix**: Added a new structural capability to
`scripts/evals/lib/assertions.js`: `expect.fileTreeUnchanged: true` +
`expect.baselineFileTree: [...]` asserts the captured workspace file tree
(minus harness-only `.eval-capture/**` and the harness-injected `.gitignore`)
is EXACTLY the recorded path set, naming every unexpected new file and every
missing expected file individually in `failures[]`. Updated
`document-update-noop`'s `scenario.json` to add `fileTreeUnchanged: true` +
the fixture's own 7-file `baselineFileTree`, in addition to the existing
`state.last_updated` check (not a replacement — both now guard the scenario).

**Residual, explicitly documented limitation**: this closes the previously
entirely-unasserted "MUST NOT write new output files" clause (REQ-001), but
does not detect an in-place content rewrite of an *existing* file at an
unchanged path (would need per-file content hashing — a larger change,
noted as follow-up debt in `scripts/evals/README.md`'s Caveats section
rather than attempted in this batch).

**Tests** (`scripts/evals/lib/assertions.test.js`, RED→GREEN, 6 cases):
- `fileTreeUnchanged passes when the captured tree matches the recorded baseline exactly`
- `fileTreeUnchanged fails and names an unexpected new file` — the exact
  case the remediation instructions required, proving the check catches
  what the old `last_updated`-only proxy could not
- `fileTreeUnchanged fails and names a missing expected file`
- `fileTreeUnchanged ignores harness-only .eval-capture/ paths`
- `fileTreeUnchanged ignores the harness-injected .gitignore (git-baselined fixtures)`
- `fileTreeUnchanged is a no-op when the expect block doesn't set it`

**Manual verification against the real fixture**: materialized
`document-update-noop`, applied its real `GIT-BASELINE.json`, captured the
workspace, and ran `assertScenario` → `pass: true`. Then wrote an extra file
(`openwiki/quickstart-v2.md`) simulating exactly the regression WARNING-1
described (a broken orchestrator silently adding an output file without
touching `state.yaml`) → `assertScenario` now correctly reports `pass: false`
with `fileTreeUnchanged: unexpected new file "openwiki/quickstart-v2.md" was
not in the recorded baseline` — confirming the fix closes the exact gap the
verify report identified.

### R3 — WARNING: path traversal in `GIT-BASELINE.json` consumption (defense-in-depth)

**Fix**: Added `resolveContainedPath(workspaceRoot, relPath)` to `run.js`,
used at both `path.join(workspaceRoot, relPath)` call sites in
`applyGitBaseline` (the `post_baseline_untracked` stash/restore loop and the
`gitHead_files` placeholder-resolution loop). It resolves the target
strictly inside `workspaceRoot` and throws a clear, actionable error
(mirroring `loadScenario`'s fail-loudly style) if a path would escape via
traversal (`../..`) or an absolute-path-shaped `relPath`. `resolveContainedPath`
is exported for verification/reuse.

**Manual RED→GREEN verification** (`run.js` is intentionally excluded from
the `*.test.js` collection glob per ADR-004 — its own live-turn dependency
means this stays a manual layer, same precedent as R1 above):
- RED (before the fix): confirmed `path.join(workspaceRoot, '../../../outside-escape.txt')`
  resolves to a path outside `workspaceRoot` with no guard in place.
- GREEN (after the fix): `resolveContainedPath` still resolves both
  currently-committed fixtures' real relative paths correctly
  (`openwiki/.last-update.json`, `src/leaked-notes.txt`); a `../../..`
  traversal and an absolute-path-shaped `relPath` both now throw the
  documented error instead of silently escaping.
- Re-ran the full `setup` for both git-baselined fixtures after the change
  to confirm no regression: `gitHead` placeholder resolution and the
  untracked-leak simulation both still work exactly as before.

## TDD Cycle Evidence (Remediation Batch)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------|
| R1 | `lib/fixtures.test.js` | Unit | `node --test lib/fixtures.test.js` → 7/7 pre-existing pass (baseline) | ✅ 5 new cases written against `markMaterialized`/`isMaterialized` before they existed — confirmed `TypeError: isMaterialized is not a function` | ✅ 12/12 pass after implementing both functions in `fixtures.js` | ✅ fresh/marked/corrupted/rebuilt/nonexistent-root cases | ✅ marker path is a single named constant (`MATERIALIZED_MARKER_REL_PATH`), reused by both functions | Also fixed a git-status false-positive this remediation itself introduced transiently (`.gitignore` for `.eval-capture/`) — caught by this batch's own manual verification, not shipped |
| R1 (run.js wiring) | n/a (CLI script, excluded from `*.test.js` per ADR sdd-design-001) | Integration (manual) | Full manual smoke: `setup` → corrupt (delete marker + add stray file) → `run` (correctly rebuilds, not reuses) → re-verify both git-baselined fixtures end-to-end | n/a | n/a | n/a | n/a | Same accepted manual layer as the original apply's 4.1/4.2 evidence |
| R2 | `lib/assertions.test.js` | Unit | `node --test lib/assertions.test.js` → 16/16 pre-existing pass (baseline) | ✅ 6 new cases written against `fileTreeUnchanged`/`baselineFileTree` before the check existed — 2 confirmed RED (`true !== false`), the rest vacuously passed by construction (no-op/ignore cases correctly require no new logic to already hold) | ✅ 22/22 pass after implementing `checkFileTreeUnchanged` | ✅ pass/fail-new/fail-missing/ignore-eval-capture/ignore-gitignore/no-op cases | ✅ extracted `isHarnessOnlyPath` helper instead of inlining two conditions | |
| R2 (fixture data) | n/a (fixture data) | Data | Manual round-trip against the real `document-update-noop` fixture (materialize + real `GIT-BASELINE.json` + capture + assert) | n/a | n/a | n/a | n/a | Confirmed `pass: true` on the untouched fixture, then `pass: false` with the exact diverged file named after simulating the WARNING-1 regression |
| R3 | n/a (CLI script, excluded from `*.test.js` per ADR sdd-design-001) | Integration (manual) | Full manual smoke: safe-path resolution for both real committed fixtures' relative paths, re-run after the change | ✅ Confirmed the pre-fix `path.join` traversal escape via a manual reproduction script | ✅ Confirmed `resolveContainedPath` throws for `../../..` and an absolute-path-shaped `relPath`, while still resolving the two real committed fixtures' safe paths correctly | ✅ two distinct escape shapes (relative traversal + absolute path) | ✅ single shared helper reused at both `applyGitBaseline` call sites (previously duplicated `path.join`) | Manual layer per the same ADR-004 precedent as R1's `run.js` wiring |

### Test Summary (Remediation Batch)
- **Total tests written**: 11 new unit tests (5 in `fixtures.test.js`, 6 in `assertions.test.js`)
- **Total tests passing**: `fixtures.test.js` 12/12, `assertions.test.js` 22/22 (34/34 combined eval unit tests)
- **Layers used**: Unit (11 new), Integration/manual (3 remediation items, run.js-side)
- **Approval tests**: None — no refactoring of pre-existing behavior beyond the two internal helper extractions noted above
- **Pure functions created**: `isMaterialized`, `markMaterialized`, `checkFileTreeUnchanged`, `isHarnessOnlyPath`, `resolveContainedPath`, `ensureEvalCaptureGitignored` (the last two do I/O; the rest are pure or near-pure)

## Full Suite Re-verification (after remediation)

- `npm test` (full suite): first run — **1112/1112 native tests, then a
  single pre-existing flaky failure** in `scripts/lib/ospec-state.test.js`
  (`appendRuntimeEvent... EPERM` — the same documented Windows file-lock
  timing issue noted in the original apply-progress Verification section,
  unrelated to this batch). Re-ran the full suite → **1112/1112 pass, 0
  fail**, confirming it was flakiness, not a regression introduced by this
  remediation.
- `node --test scripts/evals/lib/fixtures.test.js scripts/evals/lib/assertions.test.js`
  → **34/34 pass**.
- Confirmed `scripts/evals/run.js` remains excluded from the `--test`
  collection glob (ADR-004 unaffected by this batch).

## Files Changed (Remediation Batch)

| File | Action | What Was Done |
|------|--------|----------------|
| `scripts/evals/lib/fixtures.js` | Modified | Added `markMaterialized`/`isMaterialized`/`MATERIALIZED_MARKER_REL_PATH` (R1) |
| `scripts/evals/lib/fixtures.test.js` | Modified | 5 new RED→GREEN cases for the completion-marker contract (R1) |
| `scripts/evals/run.js` | Modified | `setupScenario` now marks completion only after both steps succeed; `cmdRun`/`scoreScenario` gate reuse on `isMaterialized` (R1); added `resolveContainedPath` + used it at both `GIT-BASELINE.json` path-consuming sites (R3); added `ensureEvalCaptureGitignored`, called before the baseline commit (R1 side-effect fix) |
| `scripts/evals/lib/assertions.js` | Modified | Added `checkFileTreeUnchanged`/`isHarnessOnlyPath`, wired into `assertScenario` (R2) |
| `scripts/evals/lib/assertions.test.js` | Modified | 6 new RED→GREEN cases for `fileTreeUnchanged` (R2) |
| `scripts/evals/__fixtures__/document-update-noop/scenario.json` | Modified | Added `fileTreeUnchanged: true` + `baselineFileTree` to `expect` (R2) |
| `scripts/evals/README.md` | Modified | Documented `fileTreeUnchanged`/`baselineFileTree` in the manifest shape table, updated the scenario table row and Caveats section with the residual content-rewrite limitation (R2) |

## Deviations from Design (Remediation Batch)

None that break `design.md`'s ADRs. One net-new internal convention not
previously documented: `applyGitBaseline` now writes a `.gitignore`
(`.eval-capture/`) into git-baselined workspaces before the baseline commit
— purely to keep the pre-existing `.eval-capture/` side-channel invisible to
the fixture's own nested `git status`, avoiding a false-positive sandbox-gate
trigger. This is internal-only (no external/observable-contract change to
`scenario.json`'s shape or `assertScenario`'s public API) and reversibility
is high (a single call site, documented in this file), so per the Assumption
Materiality Rule it is recorded as an assumption below rather than a
question_gate.

## Assumptions (Remediation Batch)

- `sdd-apply-003` (internal, reversibility: high): `applyGitBaseline` writes
  and commits a `.gitignore` containing `.eval-capture/` into git-baselined
  workspaces before its baseline commit. Basis: without it, the new
  completion marker (and any live-turn `.eval-capture/*` file) would show as
  untracked inside the fixture's own nested git repo, producing a false
  positive for `sdd-document`'s J5 sandbox-inventory check on scenarios
  (like `document-update-noop`) that expect a perfectly clean tree — caught
  and fixed within this same remediation batch before it could ship as a
  regression.

## Issues Found (Remediation Batch)

- **Transient regression introduced and fixed within this same batch**: see
  R1's "Bug found and fixed" note above — the completion marker's first
  implementation attempt would have broken `document-update-noop`'s
  clean-tree expectation for git-baselined fixtures. Caught by this batch's
  own manual verification (`git status --porcelain` on a freshly set-up
  workspace) before being reported as done.

## Status (Remediation Batch)

All 3 approved remediation items (1 CRITICAL, 2 WARNING) are implemented,
covered by RED→GREEN unit tests where the layer permits automated collection
(`fixtures.test.js`, `assertions.test.js`), and manually verified end-to-end
for the `run.js`-side integration points that ADR-004 keeps out of `npm
test`. Full suite re-confirmed at 1112/1112. Ready for `sdd-verify` (or
direct archive review, per the orchestrator's routing decision) — the
remaining 5 WARNINGs/2 SUGGESTIONs from the 4R gate remain intentionally
unaddressed per the user's approval, to be logged as follow-up debt at
archive.
