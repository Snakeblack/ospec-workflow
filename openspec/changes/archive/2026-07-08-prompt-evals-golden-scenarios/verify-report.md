# Verification Report

**Change**: prompt-evals-golden-scenarios
**Capability**: orchestrator-evals
**Mode**: openspec · Strict TDD ACTIVE
**Test runner**: `npm test` (`node scripts/check.js` → `node --test scripts/**/*.test.js`)
**Verdict**: **PASS WITH WARNINGS** (re-verified post-remediation — see the
Re-Verification section at the end; test count is now **1112/1112**, and the
`document-update-noop` weak-proxy WARNING has been closed)

## Task Completeness

| Phase / Task | Status | Evidence |
|---|---|---|
| 1.1–1.3 Foundation (`fixtures.js`, `capture.js`, `.gitignore`) | ✅ done | Files present; `.runs/` in `.gitignore` |
| 2.1–2.3 Core matcher + tests (`assertions.js`, `assertions.test.js`, `fixtures.test.js`) | ✅ done | 16 + 7 cases collected & green |
| 3.1–3.7 Seven golden fixture dirs | ✅ done | All 7 `__fixtures__/<scenario>/{scenario.json,repo/}` present |
| 4.1–4.2 Runner (`run.js`) + report path | ✅ done | `run all` prints driver protocol, exits `awaiting-live-run` (2); `assert`/`report` name diverged field |
| 5.1–5.2 README + `models.yaml` comment | ✅ done | README present; `models.yaml` header pointer verified |
| 5.3 `npm test` local run | ✅ done | 1101/1101 pass; eval tests collected; `run.js` excluded |
| 6.1 Roadmap mark | ⏸ deferred | Correctly deferred to `sdd-archive` per design.md/tasks.md — NOT outstanding apply work |

18/19 tasks complete; the single incomplete task is an intentional archive-phase deferral (cleanup task, not core). No CRITICAL.

## Build / Tests / Coverage Evidence

- **`npm test`** (full `check.js`): re-run independently by this verify pass →
  **`tests 1101 / pass 1101 / fail 0`**, plus `All checks passed.` (4/4 target
  generations validate). Matches the implementer's claimed 1101/1101 exactly.
- **Eval test collection confirmed**: `assertScenario:` cases = 16 collected and
  green; `fixtures.test.js` = 7 collected and green. `scripts/evals/run.js` is
  **not** named `*.test.js` and therefore never matches the
  `scripts/**/*.test.js` glob (`scripts/check.js:56`) — confirmed excluded.
  `run.js` also guards with `if (require.main === module)`, so even an incidental
  require would not execute `main`. **ADR-004 hard constraint satisfied.**
- **Coverage tool**: none configured for this project → coverage analysis skipped
  (not a failure).
- **Live-harness smoke (independent re-run by this pass)**: from a clean tree,
  `node scripts/evals/run.js run all` → all 7 report `awaiting-live-run`, process
  exit code **2**. Confirms the runner genuinely requires a live turn's captured
  evidence and does not fabricate results.

## Spec Compliance Matrix

| Requirement / Scenario | Strength | Evidence level | Status |
|---|---|---|---|
| REQ-001 corpus = exactly 7 golden (4 core + 3 document), each versioned data | MUST | runtime-test (dir listing + `run all` enumerates all 7) | ✅ |
| REQ-001 / vague → no artifact | MUST | inspection-proof (fixture `expect.artifacts_absent: [openspec/changes]`) | ✅ |
| REQ-001 / high-risk → clarify route | MUST | inspection-proof (asserts `route: standard` as proxy — see SUGGESTION-1) | ⚠️ see note |
| REQ-001 / verify FAIL spec-gap → sdd-spec | MUST | inspection-proof (`route: sdd-spec`, `state.status: blocked`; seeded verify-report) | ✅ |
| REQ-001 / apply design-mismatch → sdd-design | MUST | inspection-proof (`route: sdd-design`, `blocker_type`, `blocking_questions_nonempty`) | ✅ |
| REQ-001 / doc batched gate (2 questions) | MUST | inspection-proof (`question_gate.questions: 2`, `options_min {0:2,1:4}`, both `recommended`) | ✅ |
| REQ-001 / doc update no-op | MUST | inspection-proof — **weak proxy** (see WARNING-1) | ⚠️ |
| REQ-001 / doc sandbox violation → blocked | MUST | inspection-proof (`question_gate.questions:1, options_min{0:2}`, `state.status: blocked`; `GIT-BASELINE.json` seeds untracked leak) | ✅ |
| REQ-002 structural-only assertion contract | MUST | runtime-test (`assertions.test.js`: prose-variance case + never reads `executive_summary`/wording) | ✅ |
| REQ-002 / assertion targets structural field | MUST | runtime-test (state.status / route field cases) | ✅ |
| REQ-002 / prose diff does not fail | MUST | runtime-test (model-A vs model-B case, both pass) | ✅ |
| REQ-003 runner + assertion lib, pass/fail per scenario + summary | MUST | runtime-test (`run all` per-scenario verdict + `N/7 passed`) | ✅ |
| REQ-003 / failure names diverged field | MUST | runtime-test (`assertions.test.js` diverged-field cases; `run.js` prints `- route: expected ..., got ...`) | ✅ |
| REQ-003 live-invocation (NOT replay) | MUST | inspection-proof + runtime (runner never invokes/mocks a model; gates on `.eval-capture/done.json`; README forbids replay) | ✅ |
| REQ-004 docs + pre-bump gate + `models.yaml` comment | MUST | static-proof (README present; `models.yaml` pointer verified) | ✅ |
| REQ-004 / manually runnable, no CI | MUST | runtime-test (`run all` executes locally, outside the test glob) | ✅ |

Note on evidence tier: REQ-001's seven fixture scenarios are **versioned data**,
not runtime behavior — their compliance is proven by inspecting each `expect`
block against the spec-scenario semantics (the correct evidence tier for a
declarative fixture contract), plus the matcher's own runtime tests
(`assertions.test.js`) that prove the `expect` shapes are evaluated structurally.
This is the ceiling available in the 2.1 manual iteration (no live model in CI),
consistent with the spec's own manual-runnable mandate. Two `expect` blocks are
weaker than the spec-scenario they encode (WARNING-1, SUGGESTION-1).

## Independent Audit of Implementer-Flagged Items

1. **`run.js` excluded / eval tests collected (ADR-004)** — CONFIRMED. Glob
   `scripts/**/*.test.js`; `run.js` excluded; `assertions.test.js` (16) +
   `fixtures.test.js` (7) collected and green.
2. **`document-update-noop` proxy** — CONFIRMED TOO WEAK → **WARNING-1** below.
3. **`npm test` 1101/1101** — CONFIRMED by independent re-run.
4. **`GIT-BASELINE.json` + `done.json` consistency** — CONFIRMED consistent.
   Only the two git-dependent fixtures (`document-update-noop`,
   `document-sandbox-violation-blocked`) carry `GIT-BASELINE.json`; the other 5
   correctly omit it. `done.json` is a runtime completion marker (never a
   committed fixture asset), documented in README Driver Protocol step 5 and used
   uniformly by `run.js`'s `liveTurnCaptured`. Both conventions match README.
5. **Live-invocation honesty (REQ-003)** — CONFIRMED. `run.js` never spawns or
   mocks a model and never replays a transcript. From a clean tree every scenario
   exits `awaiting-live-run` (2); scoring is gated solely on a live turn having
   written `.eval-capture/done.json` + `state.yaml`. Honest to the spec.
6. **TDD assertion audit** — CLEAN. No tautologies, ghost loops, or type-only
   smoke tests (details in TDD sections).

---

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Full "TDD Cycle Evidence" table in apply-progress |
| All coding tasks have tests | ⚠️ | `assertions.js`/`fixtures.js` covered; **`capture.js` has no test** (WARNING-2) |
| RED confirmed (tests exist) | ✅ | `assertions.test.js` RED proven via `MODULE_NOT_FOUND`; both test files exist |
| GREEN confirmed (tests pass) | ✅ | 16/16 + 7/7 pass on independent re-run |
| Triangulation adequate | ✅ | assertions: pass+fail+prose-variance+field-naming per behavior; fixtures: round-trip + discard-old-contents |
| Safety Net for modified files | ➖ | All change files new; no pre-existing tests to guard |

**TDD Compliance**: 5/6 checks pass (capture.js coverage gap is WARNING-2).

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 23 | 2 (`assertions.test.js`, `fixtures.test.js`) | `node:test` |
| Integration (manual, not CI) | 7 scenarios | `run.js` + fixtures | live model session |
| **Total (CI)** | **23** | **2** | |

### Assertion Quality
**Assertion quality**: ✅ All assertions verify real behavior. Every case in
`assertions.test.js` calls `assertScenario` (production code) and asserts a
concrete `pass` boolean plus, on failure paths, the named diverged field
(`failures[0]` prefix matches). `fixtures.test.js` performs real fs round-trips
and asserts file existence, byte content, and descriptive throw messages. No
tautologies, no loops over possibly-empty collections, no `toBeDefined`-only
smoke tests, no mock-heavy cases.

### Quality Metrics
**Linter**: ➖ Not run per-file (no changed-file linter configured); full
`check.js` passed. **Type Checker**: ➖ Not available (plain JS project).

---

## Design Coherence

| Design decision | Implemented | Note |
|---|---|---|
| Agent-assisted harness (setup/assert/report/run) | ✅ | `run.js` verbs match; live middle step |
| `.eval-capture/` side-channel (ADR-002) | ✅ | `capture.js` reads gate/envelope; README documents |
| Seeded-trigger fixtures + `scenario.json` (ADR-003) | ✅ | Routing/blocker fixtures pre-seed trigger state |
| Structural matcher, evals out of `npm test` (ADR-004) | ✅ | `assertions.js` structural-only; `run.js` off the glob |
| `GIT-BASELINE.json` marker (apply assumption, high-rev) | ✅ | New convention; documented in README; only in 2 git fixtures |
| `.eval-capture/done.json` completion marker (apply assumption, high-rev) | ✅ | New convention; documented; uniform across `run.js` |

No design deviations that break a spec.

## Assumption Reconciliation

`state.yaml` carries 5 assumption entries, **all `status: unresolved` and all
`reversibility: high`** (`sdd-clarify-001` live-vs-replay, `sdd-design-001`
run.js-off-the-glob, `sdd-design-002` seeded-triggers, `sdd-apply-001`
GIT-BASELINE.json, `sdd-apply-002` done.json).

The launch prompt carried no `assumption_resolutions` block. Per the verify
Decision Gates, **unresolved `reversibility: high` entries produce NO escalation
and MUST NOT raise a finding**; none of the five is material (each is a
trivially-reversible, fully-documented internal convention). This pass records
them as unresolved-with-no-escalation rather than hard-blocking the entire
verification on optional rubber-stamps for non-material decisions. The
orchestrator MAY, at its discretion, run a confirmation multiSelect for these
five before archive; doing so is not required by the gate.

## Issues

### CRITICAL
None.

### WARNING

- **WARNING-1 (spec-gap / design-gap) — `document-update-noop` scenario cannot
  detect a whole class of regression.** The spec no-op scenario (REQ-001) is a
  MUST with TWO clauses: "MUST NOT write new output files" AND
  "`state.yaml`/`.last-update.json` MUST be left unmodified in content." The
  fixture's `expect` block asserts only `{ state: { last_updated:
  "2025-01-01T00:00:00Z" }, question_gate: null }`. Consequence: a broken
  orchestrator that silently regenerates/rewrites output files (e.g.
  `openwiki/quickstart.md`) but happens not to bump `state.yaml.last_updated`
  would **PASS this scenario undetected** — the exact regression the scenario
  exists to catch. Additionally the "`.last-update.json` unmodified" clause is
  entirely unasserted. Root cause is twofold: (a) the fixture chose the weakest
  proxy, and (b) `assertions.js` offers no file-set/diff assertion (only
  present-by-path / absent-by-path), so "no NEW files appeared" is not
  expressible today. Acknowledged as a caveat in README, but it materially
  weakens a MUST scenario's regression power for the "bump models.yaml with
  confidence" objective. Remediation options: add a file-tree snapshot/diff
  matcher, or at minimum assert `artifacts_present` for the exact expected output
  set plus `.last-update.json` content stability.

- **WARNING-2 (design-gap / tasks-gap) — `capture.js` (incl. the `parseYamlLite`
  parser) ships with ZERO automated test coverage.** `capture.js` is on the
  critical path of every scenario's `state` assertion: its hand-rolled
  indentation-based YAML-lite parser (nested maps, lists-of-scalars,
  lists-of-maps, scalar coercion, comment stripping) decides what `state`
  every assertion sees. It has no `*.test.js` and is therefore never exercised in
  CI — only "end-to-end via manual eval runs" that require a live model and are
  explicitly outside `npm test`. Under Strict TDD with runtime-evidence priority,
  a branching parser with no executable test is a real risk: a parse bug would
  silently mis-populate `captured.state` and produce false PASS/FAIL verdicts,
  undermining the suite's whole purpose. Rated WARNING (not CRITICAL) because
  design.md's Testing Strategy explicitly scoped `capture.js` out of unit testing
  and it is exercised manually. Remediation: add a small `capture.test.js`
  covering `parseYamlLite` against the actual `state.yaml` shapes the fixtures
  emit (nested `route:`/`phases:` maps, `blocking_questions` list, quoted
  timestamps) and `captureWorkspace`'s active-change discovery.

### SUGGESTION

- **SUGGESTION-1 — `high-risk-clarify-route` asserts a route-name proxy, not the
  clarify-gate membership the spec names.** The spec scenario says "the resolved
  route MUST include the `clarify` gate per `routing.yaml`." The fixture asserts
  `route: "standard"` (trusting that `standard` carries `clarify`). Defensible
  (routing.yaml is versioned static config), but a sharper still-structural
  assertion would tie the scenario directly to the spec clause. If `routing.yaml`
  ever changes which gates `standard` carries, this scenario would silently stop
  testing what it claims to.

- **SUGGESTION-2 — Consider an assertion-surface for gate membership** more
  generally, so scenarios can assert "route X includes gate Y" structurally
  rather than via route-name proxies (supports SUGGESTION-1 and future scenarios).

## Final Verdict

**PASS WITH WARNINGS** — All 19 in-scope tasks are implemented and locally
verified (Phase 6 correctly deferred to archive). `npm test` is green at
1101/1101, the ADR-004 collection-glob constraint holds, the runner honestly
requires a live invocation (no mock/replay), and the assertion library is
structurally correct with strong TDD evidence. Two WARNINGs — a too-weak
`document-update-noop` proxy and an untested `capture.js`/`parseYamlLite` — do
not block delivery but should be remediated before this suite is relied on as the
authoritative pre-`models.yaml`-bump evidence gate, since both weaken confidence
in the suite's ability to catch real regressions.

---

## Re-Verification (Post-Remediation Batch, 4R gate)

**Context.** After the original PASS WITH WARNINGS above, a 4R review gate found
1 CRITICAL + 7 WARNING + 2 SUGGESTION. Per `approval-001` (`state.yaml`), the user
approved remediating the CRITICAL plus 2 WARNINGs (`document-update-noop` weak
proxy; `GIT-BASELINE.json` path traversal) in a follow-up `sdd-apply` batch; the
remaining 5 WARNINGs + 2 SUGGESTIONs were explicitly deferred as documented
follow-up debt. This section re-verifies ONLY the 3 remediated fixes and their
self-reported side-fix. The deferred items are NOT re-raised as new findings.

**Full-suite re-run (independent, this pass).** `npm test` →
`tests 1112 / pass 1112 / fail 0`, plus `All checks passed.` (target generations
validate). The implementer's claimed **1112/1112** is confirmed exactly. The
+11 delta over the original 1101 matches the 11 new remediation unit tests
(5 in `fixtures.test.js`, 6 in `assertions.test.js`).

### Fix 1 — CRITICAL: half-materialized workspace silently reused → **SOUND (closed)**

- `fixtures.js` adds `markMaterialized`/`isMaterialized` backed by a marker at
  `.eval-capture/materialized.json` (single named constant
  `MATERIALIZED_MARKER_REL_PATH`). Evidence level: **runtime-test** for the
  detection layer.
- The 5 new `fixtures.test.js` cases genuinely exercise the gap, not a
  tautology. The load-bearing one — *"a half-copied/corrupted workspace (dir
  exists, marker absent) is detected as NOT materialized"* (L165-181) — asserts
  BOTH `fs.existsSync(workspaceRoot) === true` AND `isMaterialized(...) === false`
  on the same directory, which is exactly the "present but not ready" condition
  the bare `fs.existsSync` gate could not distinguish. The recovery case
  (L183-201) proves a rebuild discards the stray partial file and re-marks.
- Wiring (`run.js`, ADR-004 keeps it out of the `*.test.js` glob, so this is
  **inspection-proof + manual-proof**, the same accepted layer as the original
  4.1/4.2 evidence): `cmdRun` (L377) gates reuse on
  `isMaterialized(workspaceRootFor(name)) ? ... : setupScenario(name)` — a
  marker-less directory falls through to a full `setupScenario` rebuild, which
  `materializeFixture` `rmSync`s first. `scoreScenario` (L305) throws when
  `!isMaterialized(...)`. `setupScenario` (L264) calls `markMaterialized` ONLY
  after both `materializeFixture` AND `applyGitBaseline` return, so a throw in
  either leaves the workspace correctly unmarked. Confirmed: the gap is closed.

### Fix 2 — WARNING: `document-update-noop` proxy too weak → **SOUND (closed)**

- `assertions.js` adds `checkFileTreeUnchanged` (+ `isHarnessOnlyPath` helper),
  wired into `assertScenario`. Evidence level: **runtime-test**.
- The fixture's `scenario.json` DOES use it: `fileTreeUnchanged: true` plus a
  7-path `baselineFileTree`, retained ALONGSIDE the pre-existing
  `state.last_updated` and `question_gate: null` checks (both guard the scenario
  now). The 7 baseline paths match the fixture's real `repo/` tree minus
  `GIT-BASELINE.json` (which `applyGitBaseline` deletes before the baseline
  commit) — verified against the on-disk tree.
- The required non-smoke case *"fileTreeUnchanged fails and names an unexpected
  new file"* (L234-253) asserts `pass === false` AND that a failure string both
  starts with `fileTreeUnchanged:` and includes the exact intruder path
  `openwiki/quickstart-v2.md` — proving it catches precisely what the old
  `last_updated`-only proxy could not. Companion cases prove missing-file
  detection and the two harness-only exclusions (`.eval-capture/**`, injected
  `.gitignore`). The residual content-rewrite-of-an-existing-file limitation is
  honestly documented (README Caveats) and remains follow-up debt.

### Fix 3 — WARNING: `GIT-BASELINE.json` path traversal → **SOUND (closed)**

- `run.js` adds `resolveContainedPath(workspaceRoot, relPath)`, used at BOTH
  `applyGitBaseline` call sites (`post_baseline_untracked` stash loop, L198;
  `gitHead_files` resolution loop, L222). Evidence level: **inspection-proof +
  manual-proof** (run.js off the `*.test.js` glob per ADR-004).
- The guard is correct on inspection: it `path.resolve`s the target and throws
  unless it equals the root or starts with `root + path.sep`. A `../..`
  traversal resolves outside the root → rejected; an absolute-path-shaped
  `relPath` resolves to itself (not under root) → rejected. The two real
  committed fixtures' safe paths (`openwiki/.last-update.json`,
  `src/leaked-notes.txt`) both resolve strictly inside the workspace → no
  regression. Verified against both committed `GIT-BASELINE.json` markers, which
  contain only these safe relative paths.

### Side-fix — inject `.gitignore` (`.eval-capture/`) into git-baselined workspaces → **COHERENT, no new masking risk**

- `ensureEvalCaptureGitignored` writes/commits a `.gitignore` line
  `.eval-capture/` before the baseline `git init`+commit (L209), so the harness
  side-channel and the new `materialized.json` marker don't surface as untracked
  inside the fixture's OWN nested repo — which is what `sdd-document`'s J5
  sandbox-inventory check runs `git status` against on `document-update-noop`.
- **The nested `.gitignore` cannot mask the OUTER harness's reads.**
  `captureWorkspace` (`capture.js`) walks the filesystem directly via
  `fs.readdirSync`, ignoring only `.git`/`node_modules`, and never consults git.
  The nested repo's ignore rules are therefore irrelevant to what the outer
  capture sees — correctly scoped, exactly as the remediation claims.
- The one deliberate consequence: the injected root `.gitignore` DOES appear in
  the captured `fileTree`, so `assertions.js` lists it in `HARNESS_ONLY_EXACT_PATHS`
  and excludes it from `fileTreeUnchanged`. This is a narrow, single-path
  exclusion (root `.gitignore` only); it would in theory also mask a
  hypothetical orchestrator that itself wrote a root `.gitignore` as output, but
  that is an accepted, well-scoped trade-off in the same class as the already-
  documented content-rewrite limitation — **not a new blocking finding**.

### Re-Verification verdict

The 3 approved fixes and their side-fix are **genuinely sound**: real,
non-tautological RED→GREEN coverage where the ADR-004 collection glob permits it,
correct wiring on inspection for the run.js-side integration points that stay
manual by design, and a coherent, correctly-scoped `.gitignore` side-fix. No new
CRITICAL or WARNING is introduced by the remediation. The overall verdict stays
**PASS WITH WARNINGS**, and those WARNINGs are now solely the pre-existing,
explicitly-deferred debt (notably `capture.js`/`parseYamlLite` still untested in
CI — WARNING-2, still open in `known-issues.md` — plus the 5 deferred 4R WARNINGs
and 2 SUGGESTIONs). The remediated `document-update-noop` weak-proxy WARNING is
now CLOSED. Ready for archive per the orchestrator's routing.
