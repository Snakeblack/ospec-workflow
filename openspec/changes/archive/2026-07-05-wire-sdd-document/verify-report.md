# Verification Report: wire-sdd-document

- **Change**: wire-sdd-document
- **Mode**: openspec / standard
- **TDD**: Strict TDD ACTIVE (runtime execution evidence authoritative)
- **Test runner**: `npm test` (node --test)
- **Verdict**: **PASS WITH WARNINGS**

## Task Completeness

| Phase | Tasks | Complete | Notes |
|-------|-------|----------|-------|
| 1 RED | 1.1, 1.2, 1.3 | 3/3 | RED tests authored (contract, real-repo sentinel, sdd-document schema/wording/dist-parity) |
| 2 GREEN wiring | 2.1, 2.2, 2.3 | 3/3 | allowlist + command bullet + pointer row |
| 3 GREEN handler | 3.1–3.7 | 7/7 | route-document.md created; SKILL.md Steps 3/4/5/6.4 edited |
| 4 GREEN verify | 4.1–4.3 | 3/3 | tests confirmed passing |
| 5 Cleanup | 5.1, 5.2 | 2/2 | orchestrator body clean; wording cross-checked |

18/18 tasks complete. All checkboxes `[x]` in tasks.md.

## Build / Test / Coverage Evidence

- **Relevant tests re-run** (this verification, `env -u DISABLE_AGENT_SHIELD -u DISABLE_GIT_COLLABORATION_GUARD -u DISABLE_TOKEN_ADVISOR node --test`):
  `scripts/commands-agents-contract.test.js`, `scripts/sdd-document.test.js`, `scripts/configure/real-repo.test.js`
  → **37 pass / 0 fail** (exit 0). Runtime evidence, not report trust.
- **Coverage**: no coverage tool configured for `node --test` in this repo → coverage analysis skipped (not a failure).
- **Linter / type-checker**: none configured for markdown/config wiring → skipped.

## Spec Compliance Matrix

| Requirement | Scenario | Evidence Level | Status |
|-------------|----------|----------------|--------|
| REQ-agents-005 | Allowlist includes sdd-document | runtime-test (contract test asserts allowlist membership; frontmatter line 5 present) | PASS |
| REQ-agents-005 | Dispatch resolves handler via pointer table (read once) | static-proof (real-repo asserts `route-document.md` ref resolves; pointer row at orchestrator L472) + inspection | PASS |
| REQ-agents-005 | Body <500, no protocol inline | runtime-test (real-repo: `lines.length < 500`, got 493; sentinel-absence assertions) | PASS |
| REQ-agents-006 | Out-of-sandbox write → halt with 2 options | static-proof (real-repo asserts "Acknowledge and close the route anyway" present in route-document.md L96) + inspection (§6.4) | PASS |
| REQ-agents-006 | Clean run — scoped check passes silently | inspection-proof (route-document.md §6.3) | PASS (see WARNING-1) |
| REQ-agents-006 | Pre-existing untracked no false-positive | inspection-proof (route-document.md §6.2 scoping + §6.4 note) | PASS (see WARNING-1) |
| REQ-agents-007 | Referenced agent present → test passes | runtime-test (contract test passes for sdd-document/sdd-orchestrator pair) | PASS |
| REQ-agents-007 | Missing agent → test fails naming offender | inspection-proof (assert msg at test L94 names file + missing agent); RED originally observed per apply-progress | PASS |
| REQ-agents-007 | Runs as part of standard suite | runtime-test (file is `scripts/*.test.js`, picked up by node --test) | PASS |
| REQ-sdd-document-002 | Batched launch gate A/B/C | runtime-test (sdd-document.test.js options A/B/C + question_gate) + inspection (SKILL Step 3) | PASS |
| REQ-sdd-document-002 | Option C valid / fuzzy path | inspection-proof (SKILL Step 4.1) + static-proof (Option C validation test) | PASS |
| REQ-sdd-document-002 | Write sandbox violation → blocked design-mismatch | inspection-proof (SKILL Step 5.2–5.3) | PASS |
| REQ-sdd-document-002 | No self-certify | static-proof-adjacent + inspection (SKILL Step 5.4 explicit no-self-certification) | PASS |
| REQ-sdd-document-006 | Init — batched gate both questions | runtime-test (batched/single/question_gate assertion + negative old-wording assertion) | PASS |
| REQ-sdd-document-006 | Update — skip when resolved | inspection-proof (route-document.md §2 keep; SKILL Step 3.1 skip-in-update) | PASS |
| REQ-sdd-document-006 | Override re-asks only that question | inspection-proof (route-document.md §2 change) | PASS |
| REQ-sdd-document-011 | Metadata carries doc_language/scope_choice | runtime-test (schema block scoped to Step 6.4 fenced JSON asserts both fields) | PASS |

## Design Coherence

| Design decision (ADR) | Implemented as designed? |
|-----------------------|--------------------------|
| ADR-001 minimal inline wiring, protocol in _shared handler | Yes — exactly 3 inline additions (allowlist L5, bullet L69, pointer row L472); full protocol in route-document.md |
| ADR-002 J5 orchestrator-owned, git-scoped, out-of-repo Option C reject | Yes — route-document.md §3 reject + §6 scoped git status + 2-option halt |
| ADR-003 batched single gate + .last-update.json schema | Yes — SKILL Step 3 batched gate; Step 6.4 schema gains both fields |
| Contract test parses §3.2 "Routes to" | Yes — `parseCommandRoster` slices substring after `→`, skips rows without arrow |

No design deviations. apply-progress "Deviations from Design: None" confirmed against code. The one documented test-authoring correction (scoping the schema assertion to the Step 6.4 fenced block) is verified in the actual test (`sdd-document.test.js` L130 regex scopes to Step 6.4 JSON block, not whole file) — a genuine RED/GREEN gate, not a false-pass.

## TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Table present in apply-progress.md |
| All coding tasks have tests | ✅ (with note) | 5 test-bearing rows cover 1.1/2.1, 1.2/2.3/3.1, 1.3(schema)/3.7, 1.3(batched)/3.6, 1.3(dist-parity); prose-only edits (2.2, 3.2–3.5) verified by inspection/sentinel |
| RED confirmed | ✅ | RED failure messages in apply-progress plausible against pre-change state; assertions are genuine gates (contract test L92-95; schema regex L130; negative wording L143) |
| GREEN confirmed | ✅ | 37/37 relevant tests pass on re-run this session |
| Triangulation | ✅/➖ | dist-parity 4 cases verified (loop over 4 targets); batched-wording 2 assertions (positive+negative); others ➖ single-scenario, reasons documented |
| Safety Net | ✅ | Modified test files ran green pre-change per apply-progress; new files marked N/A (new) correctly |

**TDD Compliance**: 6/6 checks passed. TDD Cycle Evidence table cross-referenced against real files and runtime output — consistent.

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (static markdown/config assertions) | ~36 | 3 | node:test |
| Integration (real generator, dist-parity) | 1 (4-target loop) | 1 | configure/cli.js |
| E2E | 0 | 0 | not applicable |

Change is markdown/config wiring — static string-presence tests are the established and accepted static-proof mechanism for agent-prose behavior in this repo (mirrors route-brownfield/route-federation sentinel tests).

### Assertion Quality

**Assertion quality**: ✅ All assertions verify real behavior. No tautologies, no zero-assertion tests, no ghost loops. Notable defensive assertions: `checked.length > 0` (contract test L99) guards the roster loop from silently passing on an empty collection; the batched-wording test pairs a positive presence check with a negative `doesNotMatch` on the old standalone-gate phrasing (real variance).

## Assumption Reconciliation

`state.yaml assumptions:` is empty — Step 2a is a no-op. No reconciliation required.

## Issues

### CRITICAL
None.

### WARNING
- **WARNING-1 (tasks-gap)** — REQ-agents-006 J5: of its three MUST scenarios, only "out-of-sandbox halt" wording has a static string-presence assertion (`real-repo.test.js` L453 sentinel). "Clean run passes silently" and "pre-existing untracked no false-positive" (the git-status scoping/silent-close prose in `route-document.md` §6.2–6.3) rest on **inspection-proof only** — no test asserts the scoping instruction or the two-exceptions set is present in the handler. Orchestrator LLM runtime behavior cannot be runtime-tested, but a string-presence assertion on the scoping/silent-close prose is feasible and would raise these two scenarios to static-proof, matching how the halt wording is already guarded. Implementation prose is correct per spec (verified by inspection), so this is a coverage gap, not a behavioral defect.

### SUGGESTION
- **SUGGESTION-1 (tasks-gap)** — REQ-agents-005 command-index bullet (task 2.2) has no dedicated test assertion; verified present by inspection at orchestrator L69. Unlike the allowlist (contract test) and pointer row (real-repo ref-resolution), the bullet is unguarded against regression.
- **SUGGESTION-2 (tasks-gap)** — route-document.md §2 keep/change pre-question, §3 output-dir resolution, §4 persistence (tasks 3.2/3.3/3.4) have no string-presence assertions; verified by inspection only. Consider a single handler-content assertion covering the §3 A/B/C mapping and the §2 keep/change wording.

## Final Verdict

**PASS WITH WARNINGS** — 18/18 tasks complete, 37/37 relevant tests pass on runtime re-run, all MUST scenarios covered by runtime-test or accepted static-proof except two REQ-agents-006 J5 scenarios resting on inspection-proof (WARNING-1). TDD Cycle Evidence audited against real files and runtime output and found consistent; no trivial assertions. No CRITICAL defects; no design deviations.

## Re-verification (post-4R remediation)

- **Date**: 2026-07-05 (re-run)
- **Trigger**: 4R-gate remediation batch under approval `appr-003` (1 CRITICAL + 6 WARNING + 2 SUGGESTION). This section is additive; the original report above is unchanged.
- **Re-verdict**: **PASS WITH WARNINGS** (unchanged) — the original CRITICAL/WARNING set surfaced by the 4R gate is remediated and audited against real files + runtime; the one residual WARNING is the original inspection-proof coverage gap (WARNING-1), which remediation did not touch.

### 1. RED→GREEN audit of testable remediations (rel-1 / rel-2 / rel-3)

All three claimed assertions exist in the real test files and are genuine gates:

| Finding | Assertion audited | Location | Verdict |
|---------|-------------------|----------|---------|
| rel-1 | `checked.includes("sdd-document.prompt.md")` hard assertion + `missingFromRoster` collected-errors `deepEqual([])` (replaces the old silent `continue`) | `scripts/commands-agents-contract.test.js` L122-126, L135-138 | Confirmed — silent-skip drift now turns the suite RED |
| rel-2 | Arrow detection accepts both `→` and `->` (`/→|->/`); `arrowRowCount > 0` sanity guard | `scripts/commands-agents-contract.test.js` L47-49, L128-131 | Confirmed — a broken arrow regex now fails loudly |
| rel-3 | `route-document.md` §3 out-of-repo `custom_path` rejection: asserts "outside the repository working tree" + "reject it at gate time" + "do not delegate" + "re-prompt", scoped to the `#### 3.` section | `scripts/sdd-document.test.js` L150-167 | Confirmed — section-scoped, not whole-file substring |

RED evidence (temporary reversible mutations of `openspec/specs/agents/spec.md` and `route-document.md`, per apply-progress "## 4R Remediation" → RED/GREEN table) is plausible and consistent with the assertion shapes. **Git-cleanliness check**: `git status --porcelain` shows `openspec/specs/agents/spec.md` is NOT modified (rel-1/rel-2 mutations reverted byte-identical), and `skills/_shared/route-document.md` is `??` (new untracked file for this change — its normal state, no leftover permissive-wording mutation). No stray mutations remain.

### 2. Markdown remediations present and non-contradictory

| Finding | Remediation audited | Location | Verdict |
|---------|---------------------|----------|---------|
| res-1 | §6 J5: `git status` command-failure → verification INCONCLUSIVE, never auto-pass, halts with the same two-option gate | `route-document.md` L104-112 | Present |
| res-2 | Step 6.4: `.last-update.json` write failure → WARNING in envelope, route still `success`, documented fallback to init mode | `SKILL.md` L289-296 | Present |
| res-3 | §4: approval-ledger write failure → retry once, else proceed + WARNING, never block | `route-document.md` L80-84 | Present |
| read-1 | Step 3: each question carries exactly ONE `options:` array ("never repeat a sibling `options:` key per item") | `SKILL.md` L95, L109 | Present |
| read-2 | §4: fixed `gate: document-init` id named for language/scope ledger entries | `route-document.md` L73-75 | Present |
| read-3 | §2: precedence rule for multiple candidate `.last-update.json` dirs (most-recent `document-init` entry, else `openwiki/` > `docs/wiki/` > `custom_path`) | `route-document.md` L35-39 | Present |

None contradict the change-local delta specs. The agents delta (`specs/agents/spec.md` REQ-agents-006/007) is refined, not overridden — res-1's git-status-failure policy and rel-3's pre-delegation out-of-repo reject are consistent with REQ-agents-006's "authoritative, independent post-run check" and the Clarifications session. The sdd-document refinements (read-1, res-2) add structure/failure-handling the delta spec does not prohibit.

### 3. Orchestrator size guard

`agents/sdd-orchestrator.agent.md` = **492 lines** (`wc -l`), under the 500-line guard. Confirmed.

### 4. Full-suite runtime evidence

- `env -u DISABLE_AGENT_SHIELD -u DISABLE_GIT_COLLABORATION_GUARD -u DISABLE_TOKEN_ADVISOR npm test`: **tests 987 / pass 987 / fail 0**, plus all 4 target generations/validators ("All checks passed."). Exit 0.
- The documented flake (`scripts/lib/ospec-state.test.js` "appendRuntimeEvent serializes concurrent writers") **passed** under the full suite this run (1419ms) — no isolated re-run required.

### 5. Residual WARNING re-assessment (original WARNING-1)

WARNING-1 (two REQ-agents-006 J5 scenarios — "clean run passes silently" and "pre-existing untracked no false-positive" — inspection-proof only) **stands as a known issue**. Remediation did NOT close it:
- `res-1` added a git-status-*failure* policy — an orthogonal concern (execution error handling), not coverage for the silent-close / scoping-exclusion prose.
- `rel-3` added coverage for the *pre-delegation out-of-repo path reject* (§3) — a distinct fourth aspect, not the two silent/false-positive J5 scenarios (§6 steps 4-5).
- No string-presence assertion was added over the §6 scoped-set `{output dir, /AGENTS.md, /CLAUDE.md}` silent-close / pre-existing-untracked-exclusion prose. Implementation prose remains correct by inspection (`route-document.md` L113-125).

This is already recorded in `openspec/memory/known-issues.md` (change: wire-sdd-document); per the Step 10b B5 idempotency guard, no duplicate entry was written. No new qualifying findings arose from this re-verification.
