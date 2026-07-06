## Verification Report

**Change**: starlight-web-doc
**Version**: sdd-document delta (REQ-014..018 ADDED, REQ-002/006/011 MODIFIED) + agents delta (REQ-006 MODIFIED)
**Mode**: Strict TDD
**Verdict**: **PASS WITH WARNINGS**

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 36 |
| Tasks complete | 36 |
| Tasks incomplete | 0 |

### Build & Tests Execution

**Build / static gate** (`npm test` → `node scripts/check.js` dist generation + validation): PASS — `0 errors, 0 warnings. All checks passed.` The new assets (`web-doc-template/**`) and `route-document.md` ship to all four dist targets.

**Tests** (clean env `env -u DISABLE_AGENT_SHIELD -u DISABLE_GIT_COLLABORATION_GUARD -u DISABLE_TOKEN_ADVISOR`):

- `node --test scripts/sync-openwiki.test.js scripts/starlight-web-doc-contract.test.js` → **17/17 pass** (11 runtime subprocess cases + 6 static contract + 1 more) 
- `node --test scripts/sdd-document.test.js` → **18/18 pass** (incl. 2 dist assertions: `route-document.md` and `sync-openwiki.mjs` present under all 4 targets)
- Full suite `node --test scripts/**/*.test.js` → **1006/1007 pass, 1 fail**

The single failure is the pre-existing Windows flake documented in Project Standards / apply-progress: `scripts/lib/ospec-state.test.js` → `appendRuntimeEvent serializes concurrent writers` with `EPERM ...subagent-events.jsonl.lock`. Retried isolated: **52/52 pass**. Not touched by this change (no starlight-web-doc task edits `ospec-state.js`/`.test.js`). Confirmed environmental flake, not a regression.

**Manual verification**: not performed (not required — runtime subprocess tests exercise the real script).

**Coverage**: ➖ Not available (no coverage tool configured for this Node `--test` project).

### Spec Compliance Matrix

Evidence tag legend per Project Standards: `runtime-test` = code path actually executed; `static-lint` = automated grep/anchor assertion on prose or a parsed artifact (executed in `npm test`, but proves presence of prose/config, not behavior); `inspection-proof` = source inspection with rationale, no dedicated automated assertion.

| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| REQ-014 | Dual output, no installers run | `static-lint` | `starlight-web-doc-contract.test.js` (scaffold file-set + no-installer prose) | PASS | Agent-behavior MUST; prose-anchored |
| REQ-014 | `web-doc/src/content/docs/` no authored content | `inspection-proof` | `option-d-starlight.md` §3 "Never author into the sync target" | PASS | Agent-behavior; not runtime-testable |
| REQ-014 | Update-mode does not rewrite existing scaffold | `static-lint` | contract test (copy-if-missing prose) + `option-d-starlight.md` §3 | PASS | Copy-if-missing rule anchored |
| REQ-015 | predev/prebuild wired to sync | `static-lint` | contract test parses `package.json` scripts | PASS | Real artifact parsed (`static-proof` grade) |
| REQ-015 | Incremental sync skips unchanged pages | `runtime-test` | `sync-openwiki.test.js > skips re-transforming an unchanged page` | PASS | mtime/hash cache exercised |
| REQ-016 | Title injected from first heading | `runtime-test` | `sync-openwiki.test.js > injects title ... first heading` | PASS | |
| REQ-016 | Build-required title always present | `runtime-test` | `sync-openwiki.test.js` heading + humanized-filename fallback cases | PASS | |
| REQ-016 | (MAY) optional `description` injection | `no-proof` | not implemented | ACCEPTED | MAY deferred, documented; no scenario mandates it — SUGGESTION S1 |
| REQ-017 | Source-file link rewritten to remote/default branch | `runtime-test` | `sync-openwiki.test.js > rewrites a source-file link` (+ SSH normalization case) | PASS | |
| REQ-017 | Wiki-internal link untouched | `runtime-test` | `sync-openwiki.test.js > leaves a wiki-internal link untouched` | PASS | |
| REQ-017 | No-origin warn + skip, exit 0 | `runtime-test` | `sync-openwiki.test.js > leaves the link untouched and warns` | PASS | Never fails predev/prebuild |
| REQ-018 | Parity maintained after update | `runtime-test` | `sync-openwiki.test.js > maintains 1:1 parity` | PASS | |
| REQ-018 | Deleted wiki page pruned from web output | `runtime-test` | `sync-openwiki.test.js > prunes the output page` | PASS | |
| REQ-002 | Blocks on startup with A/B/C/D | `static-lint` | contract test (Option D) + `sdd-document.test.js` batched-gate | PASS | |
| REQ-002 | Option D sandbox approves both dirs | `static-lint` | contract test (SET prose) + SKILL §5 line 158 | PASS | |
| REQ-002 | Third-directory write still halts (design-mismatch) | `inspection-proof` | SKILL §5 Hard Gate + `route-document.md` §3 | PASS | Agent-behavior; pre-existing mechanism, extended to SET |
| REQ-002 | Agent does not self-certify sandbox | `inspection-proof` | SKILL §5 prose | PASS | Pre-existing scenario, unchanged by delta |
| REQ-006 | Init mode — ONE batched gate w/ A,B,C,D | `static-lint` | `sdd-document.test.js > ONE batched question_gate` + contract | PASS | |
| REQ-006 | Update-mode skip / override / propagate | `inspection-proof` | SKILL §3 + `route-document.md` §1 | PASS | Pre-existing behavior; D folded in |
| REQ-006 | Scope D resolves to dual output target | `static-lint` | `route-document.md` §3 anchored by contract test | PASS | |
| REQ-011 | Metadata on init / carries fields | `inspection-proof` | SKILL §6.4 schema | PASS | Pre-existing behavior |
| REQ-011 | scope_choice D metadata under `openwiki/` | `static-lint` | contract test anchors `openwiki/.last-update.json` + SKILL line 298-300 | PASS | |
| REQ-agents-006 | Scope D — check covers both approved dirs | `static-lint` | contract test (`web-doc/` in §6) + `route-document.md` §6 | PASS | New scenario, prose-anchored |
| REQ-agents-006 | Clean run — scoped check passes silently | `inspection-proof` | `route-document.md` §6.4 | PASS | See WARNING W1 |
| REQ-agents-006 | Pre-existing untracked → no false positive | `inspection-proof` | `route-document.md` §6.2 scoping | PASS | See WARNING W1 |
| REQ-agents-006 | Out-of-sandbox write → orchestrator halts | `inspection-proof` | `route-document.md` §6.5 (+ `real-repo.test.js` halt-wording sentinel, pre-existing) | PASS | See WARNING W1 |

**Compliance summary**: 24/24 scenarios satisfied at acceptable evidence levels (1 MAY intentionally deferred, accepted). Runtime-test covers the full sync engine (REQ-015..018); agent-prose contracts (REQ-002/006/011/014, agents-006) are covered by static-lint anchors + inspection, the established codebase pattern for prose-defined agent behavior.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Scaffold file set (6 assets) | ✅ Implemented | `package.json`, `astro.config.mjs`, `content.config.ts`, `tsconfig.json`, `src/styles/custom.css`, `scripts/sync-openwiki.mjs` all present |
| No installers in scaffold | ✅ Implemented | Files written verbatim; no `npm create`/`install` in prose or assets |
| Sync engine zero-dep | ✅ Implemented | `sync-openwiki.mjs` uses only `node:` built-ins |
| Origin SSH→https normalization | ✅ Implemented | `resolveOriginUrl()` regex `^git@([^:]+):(.+?)(\.git)?$` |
| Incremental cache | ✅ Implemented | `.sync-cache.json` mtime+hash+output-exists gate |
| 1:1 parity + prune | ✅ Implemented | `listOutputPages` diffed against source set, `rmSync` prune |
| astro/starlight pin | ✅ Implemented | `astro ^5.0.0`, `@astrojs/starlight ^0.34.0` |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| ADR-001 — scaffold as verbatim assets (copy-if-missing) | ✅ Yes | `assets/web-doc-template/`; ships via `configure/cli.js walk()` to 4 targets (dist test proves it) |
| ADR-002 — sync as Node ESM zero-dep in predev/prebuild | ✅ Yes | `sync-openwiki.mjs`, wired in template `package.json` |
| ADR-003 — sandbox as approved SET `{openwiki/, web-doc/}`, J5 covers both | ✅ Yes | SKILL §5, `route-document.md` §3/§6 |
| Procedural detail in `references/option-d-starlight.md` (SKILL delta minimal) | ✅ Yes | SKILL delta +21/-4; detail in reference (see SUGGESTION S2 re: absolute budget) |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Full TDD Cycle Evidence table in apply-progress.md |
| All tasks have tests | ✅ | Every coding task maps to a test file; 6.1/6.4 are doc/no-code (correctly N/A) |
| RED confirmed (tests exist) | ✅ | 3 test files exist; RED documented (ENOENT/absent prose before impl) |
| GREEN confirmed (tests pass) | ✅ | 17/17 + 18/18 executed by verifier; all green |
| Triangulation adequate | ✅ | `sync-openwiki.test.js` 11 cases (SSH origin, 2-page parity, pre-existing title); contract tests are single-anchor by design (structural) |
| Safety Net for modified files | ✅ | `sdd-document.test.js` (modified) had 17/17 pre-existing run before edit; SKILL/route-document guarded by contract full-file runs |

**TDD Compliance**: 6/6 checks passed

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (static/prose contract) | 7 | 1 (`starlight-web-doc-contract.test.js`) | node:test + fs |
| Integration (subprocess exec) | 11 | 1 (`sync-openwiki.test.js`) | node:test + spawnSync + git |
| Dist/config-generation | 2 | 1 (`sdd-document.test.js`, extended) | node:test + runConfigure |
| **Total (change-scoped)** | **20** | **3** | |

Cross-reference: integration tests use `git` + `spawnSync` (real subprocess) — available and exercised. No E2E tools needed for this change.

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected in this project (Node `--test`, no c8/nyc configured). Not a failure.

### Assertion Quality
✅ All assertions verify real behavior. Scan of `sync-openwiki.test.js` and `starlight-web-doc-contract.test.js`:
- No tautologies, no zero-assertion tests, no ghost loops (the contract-test `for` loop iterates a fixed non-empty `expectedFiles` array).
- Runtime tests assert real transformed output content (`readOut` + regex on materialized files) after real subprocess exec — behavioral, not smoke.
- Parity test asserts `producedFiles.length === 2` (companion non-empty), not an orphan empty check.
- Incremental test asserts an unchanged output mtime (real skip behavior), not a trivial value.
- Zero mocks/spies (real filesystem + real git subprocess), so no mock-heavy findings.

**Assertion quality**: 0 CRITICAL, 0 WARNING

### Quality Metrics
**Linter**: ➖ Not available (no linter configured)
**Type Checker**: ➖ Not available (TS assets are static templates, not type-checked in this repo's suite)

### Issues Found

**CRITICAL**: None.

**WARNING**:
- **W1 (tasks-gap)** — REQ-agents-006 behavioral J5 scenarios (`clean run scoped check passes silently`, `pre-existing unrelated untracked → no false positive`, `out-of-sandbox write → halt`) rest on `inspection-proof` of `route-document.md` §6; the change added only a `web-doc/`-string anchor in §6, no automated assertion of the false-positive-avoidance or silent-close-on-clean behavior. Largely overlaps the pre-existing known-issue recorded under `wire-sdd-document`. Recommend a handler-content assertion in `real-repo.test.js`/`sdd-document.test.js` documenting the scoped `git status` SET and the silent-close path to raise these from inspection-proof to static-proof.
- **W2 (spec-gap)** — Several MUST scenarios that describe pure agent behavior (REQ-002 third-directory halt & self-certify, REQ-006/011 update-mode reuse) are inherently non-runtime-testable and rely on `inspection-proof`/`static-lint` prose. Acceptable under the established prose-contract pattern, but flagged so the orchestrator/user acknowledge the evidence ceiling for these agent-behavior contracts.

**SUGGESTION**:
- **S1** — REQ-016 optional `description` frontmatter (MAY) is deferred (documented deviation, approved context). Add later behind a dedicated failing test; no behavior currently depends on it.
- **S2** — `skills/sdd-document/SKILL.md` absolute body exceeds the ≤1000-token convention (pre-existing; the Option D delta itself is minimal at +21/-4 and detail lives in `references/`). Convention scopes the hard budget to `stack-*` skills, so not a blocker.
- **S3** — Consider consolidating the duplicated contract-anchor style across `*-contract.test.js` files and clearly labeling static-lint vs runtime evidence at the test level (echoes an existing roadmap item).

### Traceability Matrix

| REQ | Tasks | Commits | Tests | Status |
|-----|-------|---------|-------|--------|
| REQ-sdd-document-002 | 2.1, 5.1 | fe02de1, a18e750 | `starlight-web-doc-contract.test.js` (Option D gate, SET), `sdd-document.test.js` (batched gate) — static-lint | OK |
| REQ-sdd-document-006 | 2.1 | fe02de1 | `sdd-document.test.js` (ONE batched question_gate) — static-lint | OK |
| REQ-sdd-document-011 | 2.1, 2.2 | fe02de1 | `starlight-web-doc-contract.test.js` (`openwiki/.last-update.json`) — static-lint | OK |
| REQ-sdd-document-014 | 1.1, 1.3, 2.2, 3.1-3.6 | 7c516be, fe02de1, 79ed429 | `starlight-web-doc-contract.test.js` (scaffold set/no-installer) static-lint; `sdd-document.test.js` dist runtime-test | OK |
| REQ-sdd-document-015 | 1.2, 3.1, 4.3 | 7c516be, 79ed429, 7b1ae2a | `sync-openwiki.test.js` (incremental skip) runtime-test; contract (predev/prebuild) static-lint | OK |
| REQ-sdd-document-016 | 1.2, 4.1, 4.5 | 7c516be, 7b1ae2a | `sync-openwiki.test.js` (title heading/humanized/preserve) runtime-test | OK (MAY `description` deferred) |
| REQ-sdd-document-017 | 1.2, 4.2, 4.5 | 7c516be, 7b1ae2a | `sync-openwiki.test.js` (rewrite/SSH/no-origin/wiki-internal) runtime-test | OK |
| REQ-sdd-document-018 | 1.2, 4.3, 4.5 | 7c516be, 7b1ae2a | `sync-openwiki.test.js` (parity/prune) runtime-test | OK |
| REQ-agents-006 | 5.1 | a18e750 | `starlight-web-doc-contract.test.js` (§6 `web-doc/`) static-lint | WARNING — behavioral J5 scenarios inspection-proof only (W1) |

Sources: task `[REQ-...]` tags in `tasks.md`; commit mapping by content (repo commits use Conventional Commits without `Ospec-Change`/`Ospec-Task` trailers); test names/files. Runtime-test vs static-lint distinguished per Project Standards.

### Assumption Reconciliation

All 9 `state.yaml` assumptions carry `reversibility: high`. No `assumption_resolutions` block was supplied; per orchestrator direction the verify proceeded and documents them here. Per Decision Gates, unresolved `reversibility: high` entries MUST NOT escalate — no WARNING is raised for any of them.

| id | statement | reversibility | outcome |
|----|-----------|----------------|---------|
| sdd-propose-001 | Model Option D as deltas to existing sdd-document capability, not a new capability | high | unresolved (no escalation) |
| sdd-propose-002 | Include agents/spec.md as modified (J5 dual-directory impact) | high | unresolved (no escalation) |
| sdd-spec-001 | Leave REQ-agents-004 (Launch Gate Mapping) unmodified; agents scoped to J5 only | high | unresolved (no escalation) |
| sdd-spec-002 | Frontmatter title derivation rule (first heading, humanized fallback) as internal detail | high | unresolved (no escalation) |
| sdd-design-001 | Scaffold template lives in `assets/web-doc-template/`, copied verbatim (write-if-missing) | high | unresolved (no escalation) |
| sdd-design-002 | Sync uses git-ignored `web-doc/.sync-cache.json` manifest for incremental compare | high | unresolved (no escalation) |
| sdd-design-003 | Option D procedural detail in new `references/option-d-starlight.md`, not inline in SKILL | high | unresolved (no escalation) |
| sdd-apply-001 | Pinned `astro ^5.0.0` / `@astrojs/starlight ^0.34.0` | high | unresolved (no escalation) |
| sdd-apply-002 | Deferred optional `description` frontmatter (REQ-016, MAY) | high | unresolved (no escalation) |

Note: all nine assumptions were independently corroborated during verification (e.g. sdd-spec-002 confirmed by the passing title-derivation runtime tests; sdd-design-001/002 confirmed by the dist assertion and the passing incremental test; sdd-apply-001 confirmed present in the template `package.json`). They remain formally `unresolved` in `state.yaml` because the user did not confirm them via a resolutions block; being high-reversibility, this carries no verification risk.

### Verdict
**PASS WITH WARNINGS** — All 36 tasks complete, full sync engine covered by passing runtime subprocess tests, agent-prose contracts anchored by static-lint, no regressions (sole full-suite failure is a pre-existing Windows flake passing in isolation). Two WARNINGs are advisory (J5 behavioral scenarios at inspection-proof; inherent agent-behavior evidence ceiling); no blocking defects.

---

## Re-verify (Batch 2 — 4R Remediation, approval-006)

**Date**: 2026-07-06 | **Trigger**: `gates.4r-review-gate.status: remediation-done` (1 BLOCKER + 3 CRITICAL + 8 WARNING + 5 SUGGESTION found by the 4R gate; Batch 2 remediated the 4 severe + 4 WARNING + 2 prose + 1 readability). **Scope**: incremental — focused on the remediation delta, not a full re-run of Batch 1 evidence.

### Re-verify — Tests Execution (clean env)

- `node --test scripts/sync-openwiki.test.js scripts/starlight-web-doc-contract.test.js` → **27/27 pass** (`sync-openwiki.test.js` 10→18, `starlight-web-doc-contract.test.js` 7→9).
- Full suite `node --test scripts/**/*.test.js` → **1016/1017 pass, 1 fail**. The single failure is the second documented flake from Project Standards: `scripts/hooks/parity-contract.test.js` → `parity(js) · PreToolUse · pre-tool-use-ask.json` (token-advisor cross-test contamination). Retried isolated: **9/9 pass**. Not a regression, not related to this change.

### Re-verify — RED evidence cross-check (anti-fabrication)

Per strict-TDD verify ("cross-reference reported test files against actual execution — don't trust the report blindly"), I restored the pre-remediation `sync-openwiki.mjs` (`git show 7b1ae2a:...`) and ran the current test file against it. **7 tests failed exactly as the remediation targeted** (then all pass against the fixed script — genuine RED→GREEN, not a fabricated trace). Working tree restored clean afterward.

| 4R finding (severity) | Task | Reproducing test(s) | RED against old `.mjs` | GREEN against fixed | Result |
|---|---|---|---|---|---|
| Destructive prune on missing/empty `openwiki/` (BLOCKER) | 7.1 | `does not prune ... when openwiki/ is completely missing`; `... exists but is empty` | ✖✖ (prune wiped output) | ✅✅ | REMEDIATED (`runtime-test`) |
| Lossy frontmatter re-serialization drops nested YAML (CRITICAL) | 7.2 | `preserves nested/multiline frontmatter ... when a title already exists`; `prepends a derived title ... preserving other keys` | ✖✖ (nested keys collapsed) | ✅✅ | REMEDIATED (`runtime-test`) |
| Single page failure crashes whole predev/prebuild (CRITICAL) | 7.3 | `continues syncing other pages and warns ... when a single page's transform fails` | ✖ (whole run exited non-zero) | ✅ | REMEDIATED (`runtime-test`) |
| Cache-write failure fails the sync (CRITICAL) | 7.4 | `does not fail the sync when writing the incremental cache file fails` | ✖ (EISDIR uncaught) | ✅ | REMEDIATED (`runtime-test`) |
| Corrupt cache silently swallowed, no warning (WARNING 5) | 7.5 | `warns and performs a full re-sync when .sync-cache.json is corrupt` | ✖ (no warning emitted) | ✅ | REMEDIATED (`runtime-test`) |
| Prune `rmSync` no error handling (WARNING 6) | 7.6 | — none dedicated — | N/A | N/A (approval test only) | ACCEPTED DEVIATION — see W3 |
| `resolveDefaultBranch` silent fallback (WARNING 7) | 7.7 | covered incidentally by 7.8, not isolated | ➖ | ✅ | REMEDIATED (partial isolation, disclosed) |
| No-git-at-all degradation (WARNING 8) | 7.8 | `degrades cleanly with a warning when there is no git repository at all` | (passes on old too — pre-existing `rewriteLinks` warning) | ✅ | REMEDIATED |
| `.last-update.json` singular-vs-SET ambiguity (WARNING 9, prose) | 7.9 | `route-document.md §4 point 2 clarifies .last-update.json is openwiki/-only` | ✖ (wording absent) | ✅ | REMEDIATED (`static-proof`) |
| Partial-scaffold recovery undocumented (WARNING 10, prose) | 7.10 | `option-d-starlight.md documents partial-scaffold-materialization recovery` | ✖ (section absent) | ✅ | REMEDIATED (`static-proof`) |
| `searchText` dual-purpose readability (WARNING 11) | 7.11 | full-file approval test (18/18 before+after) | N/A | ✅ | REMEDIATED (refactor) |

The BLOCKER + all 3 CRITICAL findings now have genuine, verified RED→GREEN runtime tests. Findings 9/10 were elevated from inspection-proof to `static-proof` (contract assertions on the normative prose).

### Re-verify — TDD Compliance (Batch 2)

The Batch 2 TDD Cycle Evidence table in `apply-progress.md` was validated against reality: every claimed RED was reproduced (7 tests genuinely fail against the pre-remediation script); every claimed GREEN passes on execution. The two disclosed exceptions (7.6 no dedicated test; 7.7 not independently isolated) are honestly documented in apply-progress Deviations #4/#5 and assumption `sdd-apply-003`, not silently claimed as covered. Assertion quality of the 10 new tests: clean — real subprocess execution, behavioral assertions on materialized output, portable deterministic fault injection (`ENOTDIR` via a same-named file; `EISDIR` via a directory at the cache path), no tautologies, no mocks, no ghost loops.

### Re-verify — Finding 7.6 justification assessment

**Acceptable.** Finding 7.6 (a `try/catch` around the prune-loop `rmSync`) is a WARNING-severity defensive hardening item, not one of the severe findings. Its fix (lines 311-316 of `sync-openwiki.mjs`) is structurally identical to the already-tested per-page (7.3) and cache-write (7.4) `try/catch` patterns, and the pre-existing prune test (`prunes the output page when the corresponding openwiki source page is deleted`) passes unchanged as an approval/regression test. The gap is honestly disclosed (Deviation #4, assumption `sdd-apply-003`, `reversibility: high`) rather than fabricated. A portable, deterministic delete-time filesystem fault could not be induced on the Windows execution platform without symlinks/chmod. This is a legitimate, low-risk exception recorded as WARNING W3 — not a blocker.

### Re-verify — Issues Found

**CRITICAL**: None. All prior 4R BLOCKER/CRITICAL findings remediated with verified RED→GREEN runtime tests.

**WARNING**:
- **W3 (tasks-gap)** — Finding 7.6 (prune `rmSync` try/catch) shipped without a dedicated reproducing test; covered only by the pre-existing prune approval test. Disclosed and accepted (assumption `sdd-apply-003`, high-reversibility). Add a portable fault-injection test in a future batch if a cross-platform harness becomes available.
- W1/W2 from the initial verify (J5 behavioral scenarios at inspection-proof; agent-behavior evidence ceiling) remain unchanged — outside the Batch 2 remediation scope, already tracked in `known-issues.md`.

**SUGGESTION**:
- **S4** — Finding 7.7's default-branch fallback warning is not isolated by its own dedicated test (fires alongside the pre-existing `rewriteLinks` no-origin warning). Consider a dedicated assertion that isolates the `resolveDefaultBranch` message.
- **S5** — Approved non-blocking follow-ups deferred by Batch 2: case-insensitive filename collisions, unicode/whitespace in filenames, and the literal `---` horizontal-rule vs. frontmatter-fence ambiguity in `splitFrontmatter`. Track for a future hardening batch.

### Re-verify — Assumption Reconciliation (delta)

Batch 2 added `sdd-apply-003` (`reversibility: high`). No `assumption_resolutions` block was supplied; per orchestrator direction the re-verify proceeds and documents it. Per Decision Gates, unresolved `reversibility: high` entries MUST NOT escalate — no WARNING is raised for the assumption itself (the underlying 7.6 test-gap is tracked separately as W3). All 10 assumptions remain `high` / `unresolved (no escalation)`.

| id | statement | reversibility | outcome |
|----|-----------|----------------|---------|
| sdd-apply-003 | Deferred dedicated reproducing test for finding 7.6 (prune `rmSync` try/catch); shipped with pre-existing prune test as approval/regression | high | unresolved (no escalation) |

### Re-verify — Verdict
**PASS WITH WARNINGS** — The 4R BLOCKER and all 3 CRITICAL findings are cleanly remediated in strict TDD with genuine, cross-checked RED→GREEN runtime tests (verified against the pre-remediation script); the two prose WARNINGs are elevated to static-proof; no regressions (sole full-suite failure is a documented flake passing 9/9 in isolation). One residual WARNING (W3: finding 7.6 test-gap, disclosed and accepted) and approved non-blocking deferrals remain. Ready for `sdd-archive`.
