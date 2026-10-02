# Archive Report: add-engram-session-memory

**Change**: add-engram-session-memory  
**Route**: standard (high-risk)  
**Date**: 2026-10-02  
**Status**: PASS WITH WARNINGS (W1 resolved by archive spec rewrite; W2–W4 resolved in remediation commit 55363668)

## Summary

Engram session-memory integration for ospec-workflow: optional, non-authoritative recall adapter composed via the official upstream plugin for Claude Code. Five new specs (session-memory, and deltas for project-memory, install, generator, skills). 32/32 tasks complete; npm test 3561/3561 green. Verify lineage approved (0 BLOCKER, 0 CRITICAL, 3 WARNING advisory, 6 SUGGESTION advisory). W1 (project-memory baseline rewrite) completed at archive; W2–W4 resolved by remediation in 55363668. Three ADRs proposed for promotion.

## Specs Prepared (Change-Local, Pre-Archive Merge)

| Domain | Action | Details |
|--------|--------|---------|
| session-memory | NEW | 121 lines; full spec from delta; no pre-existing baseline |
| project-memory | MODIFIED | Purpose sentence and "Session memory" row rewritten per REQ-project-memory-001 to describe optional adapter; all other requirements preserved |
| install | ADDED | Three requirements (REQ-install-028/029/030) for Engram detection and fail-open setup |
| generator | ADDED | One requirement (REQ-generator-018) for Claude-only addendum confinement |
| skills | ADDED | One requirement (REQ-skills-020) for neutral Session memory table row in sdd-phase-common |

**Spec Merge Notes**:
- project-memory baseline rewrite resolves WARNING-1 (spec-gap). Archive note from delta REQ-project-memory-001 explicitly assigned responsibility to sdd-archive (confirmed by user in sdd-design-003); edit completed.
- session-memory is a new spec; delta used as-is (no merge conflict).
- install, generator, and skills deltas are all ADDED sections; no merge required.
- Baseline fingerprints recorded in state.yaml verified unchanged:
  - project-memory: accd3fe99040b11acd54a43194c126e469e84012c136806c072da5e1c9950e8c (unchanged, before archive edit)
  - install, generator, skills: fingerprints confirmed; no pre-merge changes detected

## Archive Inventory

All change artifacts will be archived:

- openspec/changes/add-engram-session-memory/proposal.md
- openspec/changes/add-engram-session-memory/proposal-lite.md (if present)
- openspec/changes/add-engram-session-memory/specs/ (all domains: session-memory, project-memory, install, generator, skills)
- openspec/changes/add-engram-session-memory/design.md
- openspec/changes/add-engram-session-memory/decisions/ (adr-001.md, adr-002.md, adr-003.md)
- openspec/changes/add-engram-session-memory/tasks.md
- openspec/changes/add-engram-session-memory/apply-progress.md
- openspec/changes/add-engram-session-memory/verify-report.md
- openspec/changes/add-engram-session-memory/state.yaml

## Task Completion

- **Tasks**: 32/32 complete
- **Evidence**: npm test 3561/3561 green (per apply and verify)
- **Review lineage**: approved, 0 unresolved findings

## Quality Gate Resolution

### Verification Warnings (Resolved)

| ID | Category | Status | Resolution |
|----|----------|--------|-----------|
| W1 | spec-gap | RESOLVED BY ARCHIVE | project-memory Purpose and Session memory row rewritten to describe Engram as optional, non-authoritative adapter composed via upstream plugin; cross-link to session-memory spec added |
| W2 | code-bug | RESOLVED (commit 55363668) | engram-setup.js guidance now prints bash/jq/curl warning in the "binary found, plugin not registered" branch; runtime test with RED→GREEN proof |
| W3 | tasks-gap | RESOLVED (commit 55363668) | Task 7.4 reworded to state simulated-spawn-only coverage honestly; new doctor test asserts error|timeout handling through runEngramStep |
| W4 | design-gap | RESOLVED (commit 55363668) | design.md Data Flow and Interfaces updated to reflect sdd-design-002 correction (plugin OR mcp registered → configured; engram setup fallback); engram-setup.js comment updated |

## Quality Review Gate — 4R Findings (Advisory Follow-Ups)

Per the approval context, all 9 4R findings are advisory (0 BLOCKER, 0 CRITICAL; 3 WARNING, 6 SUGGESTION). No findings block archive. The following are recorded as explicit follow-up work (see `## Follow-Up Work Plan` below).

### 4R Finding Details

| ID | Owner | Severity | Summary | Acceptance Criteria | Issue Type |
|---|---|---|---|---|---|
| F-34b6de94c2a9574f | trust | WARNING | Supply chain & consent: third-party marketplace and plugin hooks installed without pre-execution notice or ref pinning. Guidance text doesn't warn of marketplace addition. | Installer prints exact command list and declares third-party marketplace with unpinned hooks before first spawn; test ensures notice appears before mutation. | engram-setup supply-chain |
| F-93567284b9ffe78e | trust | SUGGESTION | Marketplace probe laxness: MARKETPLACE_RE matches any line mentioning 'engram'; PLUGIN_RE accepts any marketplace version of engram. | MARKETPLACE_RE/PLUGIN_RE anchored to exact name/source; test with engram-fork or engram@other that does not count as registered. | engram-setup regex-tightening |
| F-1b39c2aedeef89dd | trust | SUGGESTION | Contract test coverage gap: SCAN_TARGETS does not include scripts/*.js, .claude-plugin, or .plugin.json; ALLOWLIST_PREFIXES exempts entire target-profiles/ prefix. | Extend SCAN_TARGETS or use explicit allowlist for engram-setup.js and test; restrict target-profiles exemption to drop entries only. | engram-setup contract-test-scope |
| F-7f783c5d1b9486bc | runtime | WARNING | Partial failure without short-circuit: marketplace-add failure does not prevent plugin-install; both failures then trigger setup fallback. Three mutant spawns instead of abort. Regex patterns lax. | Short-circuit after marketplace-add failure; only fallback after plugin-install failure. Anchor PLUGIN_RE/MARKETPLACE_RE (e.g. `(^|\\s)engram@engram\\b`); test negative case my-engram@x. | engram-setup failure-handling |
| F-3c8dc631ccd42c0d | runtime | SUGGESTION | Efficiency: detectEngram runs 5 sondas (2 × engram version, doctor --json, 3 × claude list) with 10s each even without opt-in. Doctor probe runs for guidance only → up to 50s latency added to default setup:claude. | Skip claude/doctor probes without opt-in, or limit doctor to 3s timeout. With plugin already registered, skip marketplace/mcp re-probe. Tests verify probe count in each scenario. | engram-setup perf-probes |
| F-314666dab6a3813c | evolution | SUGGESTION | Hardcoded path in 6 profiles: "rules/engram-session-memory.instructions.md" literal repeated in antigravity.js:42, codex.js:81, cursor.js:79, github-copilot.js:69, vscode.js:15, opencode.js:93. Renaming requires 7 edits. | Shared constant (e.g. CLAUDE_ONLY_RULES in target-profiles module) or test asserting all non-Claude profiles include the drop path. | engram-setup shared-drop-constant |
| F-548375a8f4754339 | evolution | SUGGESTION | Contract test leniency: session-memory-contract.test.js:34 exempts entire scripts/lib/target-profiles/ prefix. Test should verify drop entries only, not permit arbitrary Engram logic in profiles. | Test admits only the exact drop literal in target-profiles files; other Engram mentions fail. | engram-setup contract-test-scope |
| F-70f16bda4945f306 | evolution | SUGGESTION | Detection regex coupling: MARKETPLACE_RE / PLUGIN_RE lax to upstream name changes; no test fixes their coherence with MARKETPLACE_NAME / PLUGIN_ID constants. | Derive MARKETPLACE_RE / PLUGIN_RE from constants, or test coherence with source name Gentleman-Programming/engram; test covers fork/similar-name cases. | engram-setup regex-constants |
| F-94cc4a879085247c | efficiency | WARNING | Detector efficiency: detectEngram runs 5 probes in series (10s each) unconditionally; without opt-in and without binary, claude list probes still execute though only binary.found is used. doctor probe runs without opt-in for a guidance message. | Skip claude/doctor probes if binary not found. Without opt-in, skip doctor (or 3s max). If plugin already registered, skip marketplace/mcp re-probe. Inject test fixtures; verify probe count. | engram-setup perf-probes |

## Verify Phase Suggestions and Late Observations (Follow-Ups)

| ID | Category | Summary | Follow-Up Action |
|---|---|---|---|
| S1 | inspection | operative-memory-contract.test.js Phase-Read Table check uses rows.slice(0, 5); skips 6th row (sdd-archive). | Iterate all rows in phase-read table check. |
| S2 | code-style | target-transform.js mixes `key:` and `"key":` to dodge pre-commit false positive; prefer fixing scanner pattern. | Fix pre-commit scanner pattern instead of mixing quote styles. |
| S3 | code-scope | session-memory-contract.test.js allowlists entire target-profiles/ prefix; narrow to exact drop string only. | Restrict allowlist to exact drop path in target-profiles files. |
| S4 | evidence | REQ-generator-018 "only neutral table text differs" proven by verify before/after diff, not by suite test. | Add suite test for generation diff (allowlist stand-in → explicit diff assertion). |
| F1 | design-drift | decisions/adr-002.md and design.md:157 Open Questions still describe pre-sdd-design-002 semantics. | Align ADR-002 and design.md:157 with corrected logic (plugin OR mcp = configured; engram setup = fallback). |
| F2 | code-behavior | New doctor test asserts /(error\|timeout)/ on both iterations; should pin error for exit 1, timeout for ETIMEDOUT. | Separate doctor failure classification: exit 1 → "error", ETIMEDOUT → "timeout". |
| F3 | spec-gap | design.md Interfaces omits `marketplace` field returned by detectEngram. | Add `marketplace` field to Interfaces block in design.md. |

## Follow-Up Work Plan

All nine 4R findings (F-34b6de94c2a9574f through F-94cc4a879085247c) plus the three verify suggestions (S1–S3) and two additional observations (F1–F3) are recorded as **one proposed follow-up patch change** (`engram-setup.js`: supply-chain notice, short-circuit failure handling, regex anchoring, probe efficiency; contract-test scope/allowlist; shared drop constant; probe count tests; pre-commit scanner fix; ADR-002 alignment; doctor classification; marketplace field). This change is non-blocking to archive and release but MUST be reviewed and prioritized for the next maintenance cycle (target: v2.72.0 or follow-up hotfix patch).

**Rationale**: All findings are advisory (no blocker or critical severity). W1–W4 verification warnings resolved. The project-memory spec rewrite (W1 archive obligation) is complete. These follow-ups address future robustness, test coverage tightening, and design alignment without material impact on the Engram integration correctness or authority model.

---

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/add-engram-session-memory/phase-costs.jsonl` shows all token fields as 0 with cost_observability: `cost-fields-unavailable`).

**Total user questions asked**: 2 (intent-briefing gate + one user approval during apply/verify for W2–W4 remediation)

---

## ADR Promotions

Three ADRs are proposed for promotion to `docs/adr/`:

| Change-Local | Target Path | Content SHA256 | Promotion Rationale |
|---|---|---|---|
| decisions/adr-001.md | docs/adr/adr-20261002-001-claude-only-engram-addendum-via-rules-drop-collectrules.md | 50834f3603db8734c81168e12f97bda5ba9112b992632884224f9305f1e36782 | Decision authority: Claude-only encoding via rules + profile drop + collectRules behavior change |
| decisions/adr-002.md | docs/adr/adr-20261002-002-setup-claude-engram-opt-in-via-flag-fail-open-engram-setup.md | b6d42b0c2ce2642e02fb05abd89ef0bbfbed67f3bc9afe895d7ac26e321005e8 | Decision authority: opt-in UX (--with-engram) + fail-open detection strategy (note: requires alignment with sdd-design-002 correction as F1 follow-up) |
| decisions/adr-003.md | docs/adr/adr-20261002-003-orchestrator-only-engram-saves-recall-after-state-non-authority.md | a206f6522c360d3346464c243fba9184efccbac1043fbf3c9f3813020b0fba7b | Decision authority: orchestrator-only memory saves + non-authority principle + no ospec hook changes |

---

## Gate Acceptance Summary

| Gate | Decision | Evidence |
|---|---|---|
| Close Gate (PASS WITH WARNINGS) | ACCEPT | W1–W4 resolved; 9 4R findings recorded as advisory follow-ups; no blockers or criticals |
| Accepted Warnings | archive-warning-001 + archive-warning-002 | W2–W4 remediated in 55363668; W1 fixed by archive spec rewrite; 4R findings advisory |
| Verification Verdict | PASS WITH WARNINGS | 32/32 tasks; npm test 3561/3561; verify lineage approved |

---

## Artifacts Written

- `openspec/changes/add-engram-session-memory/archive-report.md` (this file)
- `openspec/changes/add-engram-session-memory/specs/project-memory/spec-prepared.md` (W1 rewrite: Purpose + Session memory row)
- `openspec/changes/add-engram-session-memory/specs/session-memory/spec.md` (unchanged; new spec)
- Prepared content hashes and baseline fingerprints recorded in `archive-plan.json`

---

## Next Steps (Runtime-Owned)

1. **Archive Transaction Runtime**: Execute `node scripts/archive-transaction-run.js add-engram-session-memory` to commit prepared specs and ADR promotions to live targets.
2. **Post-Archive Release Flow**: Per AGENTS.md, initiate version bump (patch or minor), CHANGELOG update, and GitHub release.
3. **Follow-Up Patch**: Schedule a maintenance patch change to address 4R findings and verify observations (engram-setup.js supply-chain, failure handling, regex tightening; contract-test scope; shared constants; design alignment).
