# Verification Report: cursor-native-target

**Change**: `cursor-native-target`
**Mode**: openspec / standard route / high-risk / **Strict TDD ACTIVE**
**Branch**: `feat/cursor-native-target`
**Delivery**: `size:exception` (single PR, five slice checkpoints)
**Verified**: 2026-07-25 (pass 1) · **Re-verified**: 2026-07-25 (pass 2, after format-only evidence remediation)
**Test runner**: `npm test` (`node scripts/check.js`)

**Final verdict**: **PASS WITH WARNINGS** — 0 CRITICAL, 5 WARNING, 8 SUGGESTION

> Pass 1 returned FAIL on a single CRITICAL (C1): the authoritative
> `json:strict-tdd-evidence` record failed the repository's own schema-v1 validator while
> every behavioral scenario was already satisfied. The bounded evidence-section repair
> landed and **C1 is resolved** — `validateEvidenceRecord(..., { requireProvenanceDigest: true })`
> now returns `valid: true` with `authenticity: "live"`. All runtime evidence was
> re-executed in this pass; no behavioral finding changed.

---

## 1. Completeness

| Slice | Tasks | Complete | Notes |
|---|---|---|---|
| 1 · profile+transform | 9 | 9 | Checkpoint 1 green |
| 2 · validator | 5 | 5 | Checkpoint 2 green |
| 3 · golden+matrix | 6 | 6 | Checkpoint 3 green |
| 4 · installer+npm | 5 | 5 | Checkpoint 4 green |
| 5 · specs+docs | 5 | 5 | 5.1 ticked but **deferred to `sdd-archive`** (see W3) |
| **Total** | **30** | **30** | |

Task 5.1 (apply baseline spec deltas) is marked `[x]` while the work is intentionally
deferred to `sdd-archive`. The checkbox misrepresents state — see WARNING W3.

## 2. Build / Test / Coverage Evidence

All commands below were **re-executed in pass 2**; results are this pass's own evidence.

| Command | Result | Evidence |
|---|---|---|
| `npm test` | **PASS** | exit code 0, `All checks passed.`, 47.5 s; six-target generate+validate loop included |
| `node --test` on the 5 change-touched suites | **PASS** | `tests 142 / pass 142 / fail 0 / skipped 0`, `duration_ms 501` |
| `npm run build:cursor` | **PASS** | exit 0, `0 errors, 0 warnings`; `dist/cursor` regenerated |
| `node scripts/configure/install-cursor.js --dry-run` | **PASS** | exit 0, `install-cursor -> C:\Users\sn4ke\.cursor (dry-run)`, `dry-run: no files written` |
| `validate-cursor` on real-repo `dist/cursor` | **PASS** | 0 errors, 0 warnings (inside `build:cursor` and the `check.js` matrix) |
| `validateEvidenceRecord(record, { rootDir, requireProvenanceDigest: true })` | **PASS** | `valid: true`, `authenticity: "live"`, candidate `sha256:e1424ef7…fa054`; 16/16 snapshot digests + 16/16 genesis paths + 5/5 cycle `test_digest` revalidated against live bytes |
| `compareEvidenceRendering(record, apply-progress.md)` | **PASS** | `equivalent: true`, `format_gap: false` |
| Coverage | **SKIPPED** | `openspec/config.yaml` → `testing.coverage.available: false` |
| Linter / type-checker | **SKIPPED** | `testing.quality.linter: false`, `type_checker: false` |
| Quality gates (Step 9a) | **NO-OP** | `quality_gates:` block absent (fully commented out) in `openspec/config.yaml` — no audit block written, baseline verify behavior |

### Direct artifact inspection (runtime, pass 2)

| Check | Result |
|---|---|
| `scripts/sync-cursor.js` present? | **ABSENT** ✅ (REQ-install-006) — also absent from `HEAD` and from all git history, so it was an untracked local script; the requirement ("MUST NOT remain the implementation of `setup:cursor`") holds, but task 4.4's "DELETE" produced no tracked diff (see S8) |
| `package.json` `setup:cursor` / `reload:cursor` target | `scripts/configure/install-cursor.js` ✅ |
| `package.json` `build:cursor` | `cli.js --target cursor --out dist/cursor` ✅ |
| `scripts/check.js` target matrix | 6 entries incl. `{ target: "cursor", validate: true }` ✅ |
| `dist/cursor/hooks.json` events | `beforeSubmitPrompt`, `beforeShellExecution`, `beforeReadFile`, `afterFileEdit`, `stop`; `version: 1`; no `SubagentStop` ✅ |
| `dist/cursor/rules/` | `agents-protocol.mdc` + 4 `.mdc` rules ✅ |
| `dist/cursor/agents/` | 23 agents; exactly the 6 `review-*` carry `readonly: true` ✅ |
| 4 skill entry-point scripts in `dist/cursor/scripts/lib/` | all 4 present ✅ |
| `dist/cursor/scripts/configure/` leaked? | absent ✅ |

## 3. Spec Compliance Matrix

Evidence levels: `runtime-test` = automated test executed and passed; `static-proof` = build/validator command proved it; `static-lint` = declared-artifact inspection.

### generator

| # | Requirement / Scenario | Strength | Evidence | Level | Status |
|---|---|---|---|---|---|
| 1 | REQ-generator-006 / instruction rule emitted as `.mdc` | MUST | `target-transform.test.js` "cursor to-mdc emits .mdc…" | runtime-test | ✅ |
| 2 | REQ-generator-006 / `AGENTS.md` → `agents-protocol.mdc` | MUST | transform test + file present in `dist/cursor/rules/` | runtime-test | ✅ |
| 3 | REQ-generator-007 / mapped camelCase events | MUST | transform test + `dist/cursor/hooks.json` inspected | runtime-test | ✅ |
| 4 | REQ-generator-007 / unmapped events dropped | MUST | "cursor drops unmapped source hook events" | runtime-test | ✅ |
| 5 | REQ-generator-008 / six `review-*` are readonly | MUST | transform test + 6/6 in `dist/cursor/agents` | runtime-test | ✅ |
| 6 | REQ-generator-008 / non-reviewers omit `readonly` | MUST | transform test asserts key is `null` | runtime-test | ✅ |
| 7 | REQ-generator-009 / `cursor` accepted as CLI target | MUST | golden loop + real-repo + `check.js` + `build:cursor` | runtime-test | ✅ |
| 8 | REQ-generator-009 / toolMap native primary names | MUST | transform test (`Write`/`Grep`/`Shell`/`Task` present, abstract absent) | runtime-test | ✅ |
| 9 | REQ-generator-009 / ask tools degrade | MUST | transform test + real-repo residue scan over all `dist/cursor/agents/**` | runtime-test | ✅ |
| 10 | REQ-generator-009 / `model:` from `cursor:` column | MUST | transform test + `model-tier-contract.test.js` six targets + real-repo per-agent `model:` assert | runtime-test | ✅ |
| 11 | REQ-generator-009 / validator rejects agent residue; commands `${input:}` do not fail | MUST | `validate-cursor.test.js` (9 cases) + 2 real-repo cases | runtime-test | ✅ |
| 12 | MODIFIED / six-target runtime bundle (4 entry scripts) | MUST | `cli.test.js` `gatherRuntimeScripts` (target-agnostic) + 4/4 verified in `dist/cursor` | runtime-test | ✅ |
| 13 | MODIFIED / generator-only modules excluded | MUST | `cli.test.js` exclusion cases + `dist/cursor/scripts/configure` absent | runtime-test | ✅ |
| 14 | MODIFIED / transitive dep included | MUST | `cli.test.js` transitive-closure case | runtime-test | ✅ |
| 15 | MODIFIED Scenario 2 / routing step 6 cursor hooks | MUST | dispatch reached before `.md` passthrough; hooks test | runtime-test | ✅ |
| 16 | MODIFIED Scenario 3 / `to-mdc` strategy dispatch | MUST | to-mdc tests + golden `rules/agent-teams.mdc` | runtime-test | ✅ |
| 17 | MODIFIED Scenario 12 / six accepted targets | MUST | golden loop incl. `cursor`; unknown-target exit 2 pre-existing | runtime-test | ✅ |

Note on #7: the `--out` default (`dist/<target>`, `cli.js:487`) is target-generic shared code; no cursor-specific assertion exists, but `npm run build:cursor` passes `--out dist/cursor` explicitly and executed successfully.

### install

| # | Requirement / Scenario | Strength | Evidence | Level | Status |
|---|---|---|---|---|---|
| 18 | REQ-install-004 / first setup installs into `~/.cursor` | MUST | `syncTreeByContent` + `installHooksJson` unit-tested; `main()` non-dry-run wiring only inspected | runtime-test (decomposed) | ⚠️ W2 |
| 19 | REQ-install-004 / re-run is idempotent | MUST | "syncTreeByContent is idempotent on second run" (0 updated, user file preserved) | runtime-test | ✅ |
| 20 | REQ-install-004 / dry-run writes nothing | MUST | injected-deps test + real `--dry-run` executed | runtime-test | ✅ |
| 21 | REQ-install-005 / managed `~/.cursor` allowed | MUST | "allows a normal ~/.cursor path" | runtime-test | ✅ |
| 22 | REQ-install-005 / unsafe dest refused before writes | MUST | root / symlink / escape cases all throw | runtime-test | ✅ |
| 23 | REQ-install-006 / `setup:cursor` uses `install-cursor` | MUST (declarative) | `package.json` scripts inspected; dry-run ran through `install-cursor.js` | static-lint + runtime | ✅ |
| 24 | REQ-install-006 / ad-hoc sync not required | MUST | `scripts/sync-cursor.js` absent; install path succeeds | static-proof | ✅ |
| 25 | REQ-install-007 / real-repo matrix includes cursor | MUST | "real repo: all six targets generate non-empty trees" + cursor validator case | runtime-test | ✅ |
| 26 | REQ-install-007 / docs describe `build:cursor` / `setup:cursor` | MUST (declarative) | `docs/plugin-installation.md` (3 sections + 2 table rows), `docs/en/README.md` | static-lint | ⚠️ W5 |
| 27 | MODIFIED / six-target real-repo generation succeeds | MUST | real-repo six-target loop, cursor validator zero errors | runtime-test | ✅ |

### agents

| # | Requirement / Scenario | Strength | Evidence | Level | Status |
|---|---|---|---|---|---|
| 28 | REQ-agents-017 / orchestrator prose omits vscode ask tool | MUST | transform degrade test + real-repo residue scan (all 23 agents) | runtime-test | ✅ |
| 29 | REQ-agents-017 / envelope `question_gate` shape unchanged | MUST (declarative) | no envelope schema touched; result-envelope suites green | static-lint | ✅ |
| 30 | MODIFIED / recommendation surfaced at `sdd-apply` | MUST | pre-existing behavior, untouched | static-lint | ✅ |
| 31 | MODIFIED / recommendation is advisory | MUST | pre-existing behavior, untouched | static-lint | ✅ |
| 32 | MODIFIED / recommendation propagates to **all six** targets | MUST | build + grep this pass: advisory present in `dist/cursor/agents/sdd-orchestrator.md`, Rule 6 in `dist/cursor/skills/branch-pr/SKILL.md`. **No automated test covers cursor** | static-proof | ⚠️ W1 |
| 33 | REQ-agents-014 / six targets select identically | MUST | `selective-4r-parity.test.js` `TARGETS` incl. `cursor` | runtime-test | ✅ (S1) |
| 34 | MODIFIED / cross-target parity in generated dist | MUST | selective-4r parity + real-repo six-target clarify gate | runtime-test | ✅ |

### hooks-runtime

| # | Requirement / Scenario | Strength | Evidence | Level | Status |
|---|---|---|---|---|---|
| 35 | REQ-hooks-runtime-001 / installed hooks use absolute launcher path | MUST | "installHooksJson expands placeholder…" asserts expanded path present and placeholder absent | runtime-test | ✅ |
| 36 | REQ-hooks-runtime-001 / stdin/stdout contract unchanged | MUST | launcher + Go binary untouched; hook suites green in `npm test` | static-proof | ✅ |
| 37 | MODIFIED / cursor wiring uses mapped camelCase events | MUST | `dist/cursor/hooks.json` = exactly the 5 mapped events, no `SubagentStop` | runtime-test | ✅ |
| 38 | MODIFIED / claude+vscode 5 hooks, copilot 2 hooks | MUST | pre-existing rows, untouched | static-lint | ✅ |

**Compliance summary**: 38/38 scenarios have evidence at or above the required strength. Zero `no-proof`. Zero MUST scenarios satisfied only by `inspection-proof`.

## 4. Design Coherence

| Design decision | Implementation | Match |
|---|---|---|
| ADR-001 · `to-mdc` description from source frontmatter, fallback base name | `toMdcFile` reads `description`, falls back to `base` | ✅ |
| ADR-002 · `AGENTS.md` via `profile.sourceRoots`, routed before `.md` passthrough | `cli.js` `runConfigure` merges roots; `handleFile` synthesize branch precedes passthrough | ✅ |
| ADR-003 · frontmatter `name`/`description`/`model` + `readonly` only for listed ids | `handleAgent` readonly branch; `stripKeys` removes `tools`/`target`/`user-invocable`/`disable-model-invocation` | ✅ (S2) |
| Hook fan-out, `SubagentStop` dropped, `type`/`timeout` dropped | `cursorHooks` | ✅ |
| ADR-004 · dedicated `assertCursorPathSafe`, `assertSafeDest` not reused | `install-cursor.js` local guard; `install-target.js` only for `copyBinaryToTree` | ✅ |
| Placeholder expanded on write, quote only when path has whitespace | `expandCursorHooksPlaceholder` (`needsQuote = /\s/`) | ✅ |
| Ask degradation reuses `{ degrade }` marker, one shared `ASK_GATE` string | `cursor.js` toolMap, both keys share `ASK_GATE` | ✅ |
| Golden fixture ≈13 files | 10 files (fixture has no `AGENTS.md`, no `review-*`, as the design documents) | ✅ immaterial |

**Deviations from design**: none material. `apply-progress.md` "Deviations from Design: None" is accurate.

## 5. TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | ✅ | `TDD Cycle Evidence` table found in `apply-progress.md` (13 rows) |
| All coding tasks have rows | ✅ | 30/30 tasks mapped; docs/config rows correctly marked `Docs`/`Structural` |
| RED confirmed (test files exist) | ✅ | 5/5 test files exist on disk |
| GREEN confirmed (tests pass) | ✅ | 142/142 in focused run; full `npm test` exit 0 — no `STATIC_VALIDATED` / `DEFERRED` rows to re-run |
| Triangulation adequate | ✅ | multi-case per behavior (root/symlink/escape; clean+5 negative classes; fan-out+drop) |
| Safety net for modified files | ✅ | `target-transform.test.js` 79/79 pre-change; `N/A (new)` rows verified genuinely new files |
| Provenance digests | ✅ | **16/16** `functional_snapshot.files` digests match live bytes under the canonical CRLF-normalized SHA-256; **5/5** cycle `provenance.test_digest` values also match |
| Schema-v1 record validity | ✅ | `validateEvidenceRecord(..., { requireProvenanceDigest: true })` → **valid**, `authenticity: "live"`. The three pass-1 error codes (`evidence-mode-invalid`, `evidence-mode-cycle-mismatch`, `cycle-refactor-enum-invalid`) are all cleared |
| Derived-table equivalence | ✅ | `compareEvidenceRendering` → `equivalent: true`, `format_gap: false`; the `5.2-5.5` refactor marker change is mirrored in `## Final Derived Markdown Table` |

**TDD Compliance**: 9/9 checks passed.

### C1 remediation audit (pass 2)

| Aspect | Result |
|---|---|
| Repair kind | format-only, evidence-section scoped (`apply-progress.md` `json:strict-tdd-evidence` + derived table) |
| `evidence_mode` | `working-tree` → `live` ✅ |
| Cycle provenance | legacy `source: "working-tree"` markers removed; each cycle keeps `test_file` + `test_digest` + `command` ✅ |
| `5.2-5.5` refactor marker | `➖ None needed` → `✅ Passed`, mirrored in the derived table ✅ |
| Candidate identity | `sha256:e1424ef7…fa054`; 16 genesis paths unchanged, all 16 file digests still match live bytes → **no functional drift** ✅ |
| Source / spec / test drift | none — working tree carries exactly the 16 genesis files at the pinned digests; the only artifact touched by the remediation is `apply-progress.md` ✅ |
| Changed-line cap | well inside `strict_tdd_evidence_remediation_max_changed_lines: 40` (evidence section only) ✅ |

### Test Layer Distribution

| Layer | New/changed cases | Files | Tools |
|---|---|---|---|
| Unit | 28 | 3 (`target-transform` +9, `validate-cursor` 9, `install-cursor` 10) | Node native `--test` |
| Golden | 1 | 1 (`cli.test.js` cursor snapshot) | Node native `--test` |
| Integration | 6 | 5 (`real-repo` +2/+2, `check.test.js`, `model-tier-contract`, `selective-4r-parity`, `strict-tdd-evidence-parity`) | Node native `--test` |
| E2E | 0 | 0 | not installed (out of scope per design) |
| **Total** | **35** | **9** | |

### Changed File Coverage

Coverage analysis skipped — no coverage tool detected (`testing.coverage.available: false`).

### Assertion Quality

| File | Line | Assertion | Issue | Severity |
|---|---|---|---|---|
| `scripts/configure/install-cursor.test.js` | 128-162 | `main --dry-run with injected deps` | Mock-heavy: 7 injected stubs vs 3 assertions (threshold: mocks ≥ 7 **or** mocks > 2× assertions) | WARNING |
| `scripts/lib/target-transform.test.js` | 1343 | `assert.ok(content.includes(CURSOR_ASK_GATE) \|\| content.includes("STOP and wait"))` | Disjunctive assertion — passes on either branch; compensated by 4 preceding assertions in the same test | SUGGESTION |
| `scripts/configure/install-cursor.test.js` | 45-57 | symlink case | Self-skips via `t.skip()` when symlink creation is unavailable; passed here (0 skipped) but can silently degrade | SUGGESTION |

No tautologies, no zero-assertion tests, no ghost loops (the `real-repo` agent loop is guarded by `assert.ok(agentFiles.length > 0)`), no smoke-test-only cases, no CSS/implementation-detail coupling.

**Assertion quality**: 0 CRITICAL, 1 WARNING, 2 SUGGESTION.

### Quality Metrics

**Linter**: ➖ Not available · **Type Checker**: ➖ Not available

## 6. Assumption Reconciliation

Pass 2 received an `assumption_resolutions` block for both entries. Step 2a applied them to
`state.yaml`; **zero entries remain `unresolved`**.

| id | phase | statement | reversibility | action | status | Escalation |
|---|---|---|---|---|---|---|
| `sdd-propose-001` | sdd-propose | No new capabilities; Cursor absorbed as deltas of generator/install/agents/hooks-runtime | high | confirm | **confirmed** | none |
| `sdd-propose-002` | sdd-propose | Include `agents` and `hooks-runtime` as modified capabilities | high | confirm | **confirmed** | none |

Both confirmations are corroborated by the delivered artifacts: the change touched exactly
those four spec domains and created no new capability directory. No `reversibility: low`
entry exists, so Step 2a produces no finding.

## 7. Issues

### CRITICAL (0)

**C1 · Strict TDD evidence record fails schema-v1 validation** — **RESOLVED in pass 2**
Artifact: `openspec/changes/cursor-native-target/apply-progress.md` → `json:strict-tdd-evidence`

Pass 1 recorded three validator error codes. All three are cleared and the authoritative
record now validates:

| Pass-1 error code | Applied repair | Pass-2 state |
|---|---|---|
| `evidence-mode-invalid` | `"evidence_mode"` set to `"live"` | ✅ cleared |
| `evidence-mode-cycle-mismatch` | legacy `provenance.source: "working-tree"` removed from all 5 cycles (each retains `test_file` + `test_digest` + `command`, which satisfies the provenance predicate) | ✅ cleared |
| `cycle-refactor-enum-invalid` | cycle `5.2-5.5` `refactor` set to `✅ Passed` and mirrored in `## Final Derived Markdown Table` | ✅ cleared |

The repair was representation-only: candidate identity `sha256:e1424ef7…fa054` is unchanged,
all 16 `functional_snapshot.files` digests and all 5 cycle `test_digest` values still match
live bytes, and no source, spec, or test file was touched. No CRITICAL finding remains.

### WARNING (5)

All five WARNINGs were carried over from pass 1 and **re-confirmed as still true** in this
pass by direct inspection; none was introduced by the remediation.

**W1 · Six-target branch-advisory scenario has no automated coverage for `cursor`** — origin: `tasks-gap`
`scripts/configure.test.js:24` still declares `TARGETS = ["claude", "vscode", "github-copilot", "opencode"]`.
This change's own MODIFIED scenario (`specs/agents/spec.md`, "Recommendation propagates across
all supported targets") raised the contract from four to six targets, and `codex` was already
missing. Behavior is correct — verified by build + grep in this pass — but there is no
regression guard. Extending that `TARGETS` array is a two-line fix.

**W2 · `install-cursor.main()` non-dry-run path is not exercised** — origin: `tasks-gap`
`syncTreeByContent`, `installHooksJson`, and `assertCursorPathSafe` are each unit-tested, and
the dry-run test asserts they are *not* called. Nothing asserts that the non-dry-run branch
calls them with the right arguments (`skipNames = {hooks.json}`, `copyBinaryToTree(root, "cursor", sourceDir)`).
REQ-install-004 "First setup installs into global Cursor home" therefore rests on composition
by inspection. A mirror of the existing dry-run test with `dryRun: false` asserting the
recorded call order would close it.

**W3 · `tasks.md` 5.1 is ticked `[x]` although the work is deferred** — origin: `tasks-gap`
Task 5.1 (apply delta specs to `openspec/specs/{generator,install,agents,hooks-runtime}/spec.md`)
is explicitly deferred to `sdd-archive`, yet carries `[x]` ("implemented and verified locally").
`sdd-archive` MUST still apply those four deltas; the tick must not be read as done.

**W4 · Mock-heavy test case** — origin: `tasks-gap`
`install-cursor.test.js:128` injects 7 stubs against 3 assertions, crossing both Step 5f
thresholds. It verifies wiring absence rather than behavior; W2's positive-path test would
rebalance it.

**W5 · `docs/target-capabilities.md` capability table contradicts its own lead sentence** — origin: `tasks-gap`
The intro (line 3) was changed from "Los cuatro targets" to "Los seis targets", but the
capability table (line 12) gained only a `cursor` column — `codex` has no column. The document
now claims six targets and tabulates five. Re-confirmed this pass, plus a second residue: line
48 still reads "corre igual en los **cuatro** targets", which task 5.4 ("grep-and-fix residual
'four targets' wording") was supposed to catch.

### SUGGESTION (8)

**S1** · `selective-4r-parity.test.js:138` derives the target from the generalist path; `cursor`'s
generalist is `agents/review-change.md`, byte-identical to `claude`'s, so the branch resolves to
`claude` and the newly added `cursor:` key in `correctionPath` is unreachable. Harmless (both map
to the same path) but that sub-check is not genuinely exercised for cursor.

**S2** · `validate-cursor.js:111` enforces `readonly: true` for `REVIEW_AGENTS.has(name) || name.startsWith("review-")`,
broader than the profile's explicit six-id list. A future `review-*` agent would fail the build
until it is also added to `profile.agentReadonly.agents`. Sensible fail-closed behavior, but it
contradicts ADR-003's "explicit id list, not a heuristic" framing and is undocumented.

**S3** · The symlink safety test self-skips when symlink creation is unavailable (non-elevated
Windows). It ran here, but a CI host without the privilege would silently lose that guard.

**S4** · `target-transform.test.js:1343` uses a disjunctive assertion for the degrade string.

**S5** · `apply-progress.md` "Final Derived Markdown Table" has no header row (6 data columns,
no `|---|` separator) — renders as a broken table. Note this is *intentional* with respect to
`compareEvidenceRendering`, which only requires each rendered data line to be present in the
markdown; adding a header row would be safe, removing data lines would not.

**S6** · Two design Open Questions remain open and are explicit out-of-scope follow-ups worth
tracking: unconditional vs. whitespace-conditional hook-command quoting, and
`validateSddModelPolicy` not pinning the `cursor:` model column.

**S7** · `openspec/memory/known-issues.md` still carries the C1 entry at `severity: BLOCKER`.
The operative-memory contract is prepend-only ("existing entries are never overwritten or
reordered"), so this verify pass MUST NOT edit or remove it. Downstream readers — notably
`sdd-apply`, which reads `known-issues.md` — must treat that entry as historical; this report
is the authoritative resolution record.

**S8** · Task 4.4 ("DELETE `scripts/sync-cursor.js`") produced no tracked diff: the file exists
neither in `HEAD` nor anywhere in git history, so it was an untracked local script. REQ-install-006
is still satisfied (the file is absent and `setup:cursor` / `reload:cursor` both invoke
`install-cursor.js`), but the apply log's "DELETE" line overstates what happened.

## 8. Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 5 WARNING, 8 SUGGESTION.

- Behavior, specs, design coherence, and runtime tests are complete and green: 38/38 scenarios
  satisfied at or above required strength, 0 `no-proof`, full suite exit 0 (re-executed this pass).
- The pass-1 CRITICAL (C1) is **resolved**: the `json:strict-tdd-evidence` record validates
  under `validateEvidenceRecord(..., { requireProvenanceDigest: true })` with
  `authenticity: "live"`, derived-table rendering is equivalent, and candidate identity plus all
  16 functional digests are unchanged — the repair was representation-only.
- Step 2a assumption reconciliation is **closed**: both `reversibility: high` entries are
  `confirmed`; no entry escalates.
- The five WARNINGs are all test-coverage or documentation gaps with known two-line remedies.
  None blocks the gate; all are recorded in `openspec/memory/known-issues.md`.
- **Next**: the `4r-review-gate` is now unblocked. This change is `classification: high-risk`,
  so the gate dispatches the `review-change` generalist plus all four specialist dimensions.
