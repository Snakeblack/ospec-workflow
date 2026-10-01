# Tasks: Add Engram Session Memory (Claude Code first)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-session-memory-001: Optional integration with graceful absence | MUST | ADR-003, scripts/hooks, phase agents condition on `mem_*` tools | covered-by-design | Engram tools checked at runtime; all phases fail-open on absence or timeout |
| REQ-session-memory-002: Engram is never an authority | MUST | scripts/session-memory-contract.test.js, gate/route/approval scan | covered-by-design | Automated contract test validates no authority paths reference Engram |
| REQ-session-memory-003: Recalled observations are untrusted data | MUST | rules/engram-session-memory.instructions.md (addendum prose) | covered-by-design | Addendum instructs Claude agents on procedence, contrast, conflicts |
| REQ-session-memory-004: Contradictions are investigable conflicts | MUST | Addendum guidance + orchestrator recall logic | covered-by-design | Recall runs after state.yaml routing decision (ADR-003) |
| REQ-session-memory-005: No secrets or payloads in memory | MUST | Addendum constraints + pointer contract (topic_key, capture_prompt) | covered-by-design | Saves only summaries + repo-relative paths, never full artifacts |
| REQ-session-memory-006: SDD phase pointer convention | MUST | Orchestrator mem_save calls with topic_key `sdd/{change}/{phase}`, capture_prompt false | covered-by-design | Design specifies pointer structure and upsert semantics |
| REQ-session-memory-007: Orchestrator recall as a hint | MUST | Orchestrator mem_search after state.yaml resolved, before gate logic | covered-by-design | Recall is optional, never changes routing or gates |
| REQ-session-memory-008: No ospec-owned Engram MCP or hooks | MUST | Verify .mcp.json and hooks/hooks.json remain unchanged in apply | covered-by-design | Upstream plugin owns all Engram MCP/hook registration |
| REQ-session-memory-009: Claude-only addendum scope | MUST | ADR-001 (drop in 6 non-Claude profiles) + collectRules fix (skip isDropped) | covered-by-design | Rules file excluded from non-Claude targets via drop pattern |
| REQ-session-memory-010: Documentation makes no false integration claims | MUST | Update project-memory, sdd-phase-common, comparacion-arneses | covered-by-design | Three docs scanned for "native/built-in" claims; all changed to optional/adapter language |
| REQ-install-028: setup:claude detects Engram fail-open | MUST | scripts/configure/engram-setup.js detectEngram + install-claude.js integration | covered-by-design | Detection by capability (binary, doctor, plugin list, mcp list), never by version |
| REQ-install-029: Engram setup execution requires explicit opt-in | MUST | --with-engram CLI flag in install-claude.js, engram-setup.js planning | covered-by-design | Default: guidance only; flag: executes plugin install + setup steps |
| REQ-install-030: Engram registration is idempotent | MUST | engram-setup.js planEngramActions checks for existing plugin/MCP | covered-by-design | Re-probes after plugin install; skips setup if MCP already registered |
| REQ-generator-018: Engram addendum confined to Claude target | MUST | ADR-001 drop entries + modified collectRules + scope tests | covered-by-design | Claude: addendum present; non-Claude: excluded |
| REQ-project-memory-001 (delta): Session memory row and Purpose | MUST | Archive phase updates baseline after merge (not apply) | covered-by-design | Design specifies sdd-archive edits row; apply only verifies no native claims |
| REQ-skills-020 (delta): Neutral Session memory row in sdd-phase-common | MUST | Update sdd-phase-common.md table; neutral host language | covered-by-design | Row rewording to reference `session-memory` and optional adapter pattern |

### Reconciliation Verdict
- **MUST coverage**: Complete. All MUST requirements have clear design allocation.
- **SHOULD/MAY gaps**: None identified.
- **Ambiguities to track**: None. Architecture decisions (ADR-001/002/003) and specs are coherent.

## Review Workload Forecast

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

| Field | Value |
|-------|-------|
| Estimated changed lines | ~600 (50 new addendum + 15 collectRules fix + 120 engram-setup.js + 80 install-claude.js changes + 35 target-profiles drop entries + 30 sdd-phase-common + 20 docs + ~150 tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Slice 1: addendum + generator fixes + contract tests) → PR 2 (Slice 2: installer detection + opt-in) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

### Suggested Work Units

| Unit | Goal | PR | Dependencies | Base Branch |
|------|------|----|----|---|
| 1 | Foundation: addendum file, collectRules fix, scope/drift contract tests, docs updates | PR 1 | None | main |
| 2 | Installer: engram-setup.js module, install-claude.js --with-engram flag, installer tests and docs | PR 2 | PR 1 | main (or PR 1 branch) |

**Chain Rationale**: Slice 1 is relatively independent (rules, tests, docs) and lowers the diff surface. Slice 2 depends on Slice 1 (addendum, drop entries and collectRules fix land together in PR 1) but can be reviewed separately. Stacked-to-main allows each to merge and be tested independently, with fast feedback for potential revisions.

## Phase 1: Foundation - Addendum and collectRules (Slice 1)

- [x] 1.1 Create `rules/engram-session-memory.instructions.md` with trust boundary, save/recall protocol, failure policy, applicability guard. Content per addendum prose constraints: paths inside multi-line `content` only, prohibition tokens on imperative pairs (MUST NOT/never). [REQ-session-memory-003/005] [ADR-001]
- [x] 1.2 Modify `scripts/lib/target-transform.js` collectRules function to skip files where `isDropped(file.path, profile)` before accumulating. Verify baseline: non-Claude profiles still emit full tree minus this file. [REQ-session-memory-009] [ADR-001]
- [x] 1.3 Add `drop` entry `"rules/engram-session-memory.instructions.md"` to each non-Claude profile: `github-copilot.js`, `opencode.js`, `codex.js`, `cursor.js`, `antigravity.js`. [REQ-session-memory-009] [ADR-001]
- [x] 1.4 Add `drop: ["rules/engram-session-memory.instructions.md"]` field to `vscode.js` (previously had no drop field). [REQ-session-memory-009] [ADR-001]

## Phase 2: Generator Integration and Scope Verification (Slice 1 continued)

- [x] 2.1 Update `skills/_shared/sdd-phase-common.md` Session memory row to host-neutral language: "optional, non-authoritative host adapter, e.g. Engram on Claude Code; see `session-memory`". Remove any "native" or "built-in" language. [REQ-session-memory-010] [REQ-skills-020]
- [x] 2.2 Update `docs/comparacion-arneses.md` line 70: change "Integración nativa" to describe optional adapter pattern for Engram. [REQ-session-memory-010]
- [x] 2.3 Scan `openspec/specs/project-memory/spec.md` for "native" or "built-in" Engram claims; verify no false integration claims remain (no edit needed if clean; design specifies row/Purpose edits by sdd-archive only). [REQ-session-memory-010]

## Phase 3: Contract Tests and Verification (Slice 1 final)

- [x] 3.1 Create `scripts/session-memory-contract.test.js`: scan kernel/gate/route/approval/state code (`scripts/lib/**`, `scripts/hooks/**`, `internal/**`, `cmd/**`, `schemas/kernel/**`, `hooks/hooks.json`, `.mcp.json`, `agents/**`, `commands/**`, `skills/**`) for `/engram|\bmem_[a-z_]+/i` patterns. Assert zero hits outside allowlist {addendum, `sdd-phase-common.md`}. [REQ-session-memory-001/002]
- [x] 3.2 Create `scripts/configure/engram-scope.test.js`: for every non-Claude profile ID, run `runConfigure` into mkdtemp, verify no addendum heading in generated output and no `engram` entries in `.mcp.json`/hooks. Assert Claude output includes addendum. Never read `dist/` (self-generate in temp dir). [REQ-session-memory-009] [REQ-generator-018]
- [x] 3.3 Modify `scripts/lib/target-transform.test.js`: add fixture for profile with drop on a rules path; verify rule is absent from AGENTS.md/orchestrator output. [REQ-session-memory-009] [ADR-001]
- [x] 3.4 Create or update `scripts/operative-memory-contract.test.js`: read three docs; assert no `/native\|built-in/` language near Engram or Session memory; verify sdd-phase-common table text references `session-memory`. [REQ-session-memory-010]
- [x] 3.5 Verify assumption sdd-design-001: check `.claude-plugin/marketplace.json` for marketplace name `engram` (if file exists). Log finding or note as follow-up if file not yet present. [Design assumption validation]

## Phase 4: Installer Infrastructure (Slice 2)

- [ ] 4.1 Create `scripts/configure/engram-setup.js` with: detectEngram({ spawn, claudeBin, timeoutMs }), planEngramActions(detection, { optIn }), runEngramStep({ argv, claudeBin, spawn, stdout, stderr }). Implement fail-open semantics: detection errors/timeouts → warnings, no mutation without optIn. [REQ-install-028/029/030] [ADR-002]
- [ ] 4.2 Within detectEngram: probe for engram binary (candidates: `engram`, `engram.exe`), run `engram doctor --json` (10s timeout default, regex parse version), run `claude plugin list` (regex for `/\bengram@[\w.-]+/`), run `claude mcp list` (regex for `/^(plugin:engram:)?engram\b/m`). Return structure with binary, doctor, plugin, mcp fields. [REQ-install-028] [ADR-002]
- [ ] 4.3 Within planEngramActions: if optIn && claudeBin && binary.found, return array of argv objects: [{ id: 'plugin-marketplace-add', argv }, { id: 'plugin-install', argv }, { id: 'setup-claude-code', argv (conditional if no MCP) }]. If any detection is 'unknown', return []. [REQ-install-029/030] [ADR-002]
- [ ] 4.4 Within runEngramStep: iterate planEngramActions result, spawn each argv with injected spawn, catch errors (including ENOENT/ETIMEDOUT), log warning, never throw. Always return void. [REQ-install-028] [ADR-002]
- [ ] 4.5 Modify `scripts/configure/install-claude.js`: parse CLI flag `--with-engram` into opts.engramOptIn boolean. Inject `deps.engramStep` (module-level or testable). On success path after ospec install and if claudeBin present (or if ospec CLI absent), call `runEngramStep(detectEngram(...), opts.engramOptIn)`. Never alter exit code on Engram failure. [REQ-install-028/029/030] [ADR-002]
- [ ] 4.6 Add `--build-only` skip logic to install-claude.js: if opts.buildOnly is true, skip Engram step entirely. [Design spec: `--build-only` skips Engram]
- [ ] 4.7 Update `README.md` and `README.es.md` with one-line note on `--with-engram` flag and bash/Git Bash requirement for upstream plugin. [Design scope]

## Phase 5: Testing and Validation (Slice 2 integration)

- [ ] 5.1 Create/modify `scripts/configure/engram-setup.test.js`: mock spawn for scenarios: binary absent, doctor fails, timeout, plugin already registered, MCP already registered, both absent. Assert detect result, plan result, and run side-effects (no mutations without optIn, idempotent re-check after plugin install). [REQ-install-028/029/030]
- [ ] 5.2 Modify `scripts/configure/install-claude.test.js`: add test for --with-engram flag parsing, injection of engramStep mock, Engram failure does not alter exit code, --build-only skips Engram step entirely. [REQ-install-028] [ADR-002]
- [ ] 5.3 Static scan of `scripts/configure/install-*.js` (other installers for GitHub Copilot, opencode, etc.): verify only `install-claude.js` references `engram-setup`. Assert no Engram detection in other installers. [REQ-install-028]
- [ ] 5.4 Run full `npm test` with `env -u DISABLE_AGENT_SHIELD -u DISABLE_GIT_COLLABORATION_GUARD -u DISABLE_TOKEN_ADVISOR`: verify all tests pass, including new contract/scope tests. (Session may have exported these; unset them for test stability.) [Design testing requirement]
- [ ] 5.5 Verify assumption sdd-design-002: if test fixtures include real or mocked engram CLI output, confirm that plugin install + re-probe logic skips setup if MCP already present. [Design assumption validation]

## Phase 6: Documentation and Edge Cases (Slice 2 final)

- [ ] 6.1 Audit `openspec/specs/project-memory/spec.md` for stale claims; confirm no edit needed in apply (sdd-archive will merge REQ-project-memory-001, which includes Purpose/row updates). Note baseline_fingerprints.project-memory is recorded; manual baseline update by archive. [Design assumption sdd-design-003]
- [ ] 6.2 Verify that no test reads `dist/` (gitignored). All generator tests self-generate into `mkdtemp` and clean up. Spot-check test output paths. [Design requirement: self-generate, never read gitignored dist]
- [ ] 6.3 In addendum file: review prose for policy-adjacent phrasing. Ensure k1-prose-authority compliance: any sentence pairing recall/conversation with decision/state must carry prohibition token (MUST NOT/never). [Design constraint: k1-prose-authority]
- [ ] 6.4 Add inline comment in install-claude.js marking Engram step: "Engram integration is optional, non-authoritative, and fail-open per REQ-install-028." [Design rationale documentation]

## Phase 7: Final Integration Checks

- [ ] 7.1 Generate Claude output and inspect: verify addendum present in rules tree, `.mcp.json` has no `engram` server, hooks.json has no `engram` memory hooks. [REQ-session-memory-008/009]
- [ ] 7.2 Generate all non-Claude profiles and verify addendum is absent from each. Verify only sdd-phase-common table text differs from baseline. [REQ-generator-018]
- [ ] 7.3 Run `npm run setup:claude` with no --with-engram and verify guidance is printed only (no mutations) and exit code is 0. [REQ-install-029]
- [ ] 7.4 If Engram CLI is available locally for testing: run `npm run setup:claude -- --with-engram` and verify idempotency (second run reports "already configured"). [REQ-install-030]

---

## Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Implementation Notes

### Order and Dependencies

**Slice 1** (Phases 1–3) establishes the foundation and validates non-authority:
1. Create addendum and fix collectRules (Phase 1)
2. Update docs and verify generator integration (Phase 2)
3. Write contract tests to verify architectural boundaries (Phase 3)

**Slice 2** (Phases 4–7) adds installer capability without altering core behavior:
1. Build engram-setup.js module and install-claude.js integration (Phase 4)
2. Test installer and Engram step in isolation (Phase 5)
3. Document and verify edge cases (Phases 6–7)

### Testing Strategy

- **Contract tests** (session-memory-contract.test.js, operative-memory-contract.test.js) run *before* implementation and validate that no code path reads Engram for gates/approvals.
- **Scope tests** (engram-scope.test.js) self-generate output into `mkdtemp` and verify Claude includes, non-Claude excludes the addendum.
- **Installer tests** (engram-setup.test.js, install-claude.test.js) mock `spawn` and verify detection, planning, and fail-open semantics.
- All tests run with `env -u DISABLE_AGENT_SHIELD -u DISABLE_GIT_COLLABORATION_GUARD -u DISABLE_TOKEN_ADVISOR` (unset the session's ambient env vars).

### Delivery Strategy

**ask-on-risk** + stacked-to-main:
- User confirms chain strategy and PR split before apply begins.
- PR 1 (Slice 1: ~300 lines) merges to main; CI validates tests and docs.
- PR 2 (Slice 2: ~300 lines) targets main, depends on PR 1 being merged.
- Each PR is independently reviewable and testable.

### Design Assumptions to Verify in Apply

1. **sdd-design-001**: Marketplace name is `engram` (check `.claude-plugin/marketplace.json`), and `claude mcp list` format is confirmed for plugin MCP servers (may require real engram CLI if available).
2. **sdd-design-002**: After plugin install, re-probing `claude mcp list` shows the registered MCP, so conditional setup is idempotent.
3. **sdd-design-003**: Project-memory baseline edits happen in sdd-archive, not apply (apply only verifies no false claims remain).

### Risk Mitigation

- **Engram unavailable**: All calls wrapped in try-catch; zero impact on gates/approvals (contract test validates this).
- **Upstream hook collision**: PreToolUse already auto-allows mem_* tools; no ospec hook change needed.
- **Windows bash requirement**: README notes this; fail-open if bash not found.
- **Memory poisoning**: Addendum prose and contract test enforce non-authority; state.yaml is final arbiter.
