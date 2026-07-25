# Archive Report: cursor-native-target

**Change**: `cursor-native-target`
**Archived**: 2026-07-25
**Route**: standard / high-risk
**Delivery**: `size:exception` (single PR)
**Verify verdict**: PASS WITH WARNINGS (0 CRITICAL) — accepted for archive

---

## Close Gate

| Gate | Status | Notes |
|------|--------|-------|
| verify | PASS WITH WARNINGS | 0 CRITICAL, 5 WARNING, 8 SUGGESTION; pass 2 re-executed runtime evidence |
| 4r-review-gate | approved | `terminal_reason: all-frozen-findings-resolved`, `archive_allowed: true` |
| stale-baseline | pass | All four `baseline_fingerprints` matched before merge |

Two CRITICAL installer findings were remediated and targeted-validated before archive
(per-dest assert, always-quote hooks, fail-closed hooks missing, write-sequence abort).

---

## Spec Sync Summary

| Domain | Action | Details |
|--------|--------|---------|
| generator | Updated | 4 ADDED (REQ-generator-006..009); 4 MODIFIED (source tree, routing, rules dispatch, CLI) |
| install | Updated | 4 ADDED (REQ-install-004..007); 1 MODIFIED (real-repo six-target matrix) |
| agents | Updated | 1 ADDED (REQ-agents-017); 3 MODIFIED (branch advisory, REQ-agents-014, cross-target parity) |
| hooks-runtime | Updated | 1 ADDED (REQ-hooks-runtime-001); 1 MODIFIED (per-target wiring table + cursor scenario) |

Task 5.1 (deferred baseline sync) completed in this archive phase.

### Source of Truth Updated

- `openspec/specs/generator/spec.md`
- `openspec/specs/install/spec.md`
- `openspec/specs/agents/spec.md`
- `openspec/specs/hooks-runtime/spec.md`

---

## Accepted Risks and Follow-Ups

Six WARNING findings remain as non-blocking follow-ups, explicitly accepted for archive
and planned minor release (2.34.0):

| ID | Summary | Origin |
|----|---------|--------|
| W1 | Six-target branch-advisory scenario lacks automated `cursor` coverage | tasks-gap |
| W2 | `install-cursor.main()` non-dry-run path not exercised end-to-end | tasks-gap |
| W3 | `tasks.md` 5.1 ticked while work deferred to archive (resolved by this archive) | tasks-gap |
| W4 | Mock-heavy dry-run test in `install-cursor.test.js` | tasks-gap |
| W5 | `docs/target-capabilities.md` table still omits `codex` column | tasks-gap |
| (4r) | Six WARNING review follow-ups from bounded 4R lineage | review-gate |

No CRITICAL issues remain open.

---

## ADRs Promoted

| Change-local | Project memory |
|--------------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260725-006-to-mdc-derives-rule-metadata-from-source-frontmatter.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260725-007-agents-md-enters-tree-via-profile-scoped-source-root.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260725-008-cursor-agent-frontmatter-name-description-model-plus-optional-readonly.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260725-009-dedicated-installer-owns-cursor-home-sync-cursor-retired.md` |

Change-local copies remain in the archived folder for audit.

---

## Implementation Summary

Cursor is now a sixth first-class generator target: declarative profile, `to-mdc` rules,
camelCase hooks with install-time placeholder expansion, native toolMap with ask-tool
degradation, `validate-cursor`, and `install-cursor.js` replacing the ad-hoc
`sync-cursor.js` path. `npm test` green (38/38 spec scenarios, 142/142 focused suites).

---

## Archive Contents

| Artifact | Present |
|----------|---------|
| exploration.md | ✅ |
| proposal.md | ✅ |
| specs/ (4 domains) | ✅ |
| design.md | ✅ |
| tasks.md (30/30 complete) | ✅ |
| apply-progress.md | ✅ |
| verify-report.md | ✅ |
| archive-report.md | ✅ |
| decisions/ (4 ADRs) | ✅ |
| state.yaml | ✅ |

Helper scripts (`.review-*.json`, `_bootstrap-4r.js`, `_close-4r.js`, `.review-diff.patch`)
travel with the archive; they are not product code.

---

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/cursor-native-target/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Move Completion Pending (orchestrator-owned)

Artifacts were copied to `openspec/changes/archive/2026-07-25-cursor-native-target/`.
The source directory `openspec/changes/cursor-native-target/` still exists until the
orchestrator verifies the copy inventory and deletes it.
