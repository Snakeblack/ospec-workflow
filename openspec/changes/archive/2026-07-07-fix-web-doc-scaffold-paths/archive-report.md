# Archive Report: fix-web-doc-scaffold-paths

**Change**: fix-web-doc-scaffold-paths  
**Archive date**: 2026-07-07  
**Mode**: openspec (lite change)  
**Status**: Archived with verification PASS

## Overview

This is a small bugfix to the Option D (OpenWiki + Starlight) web-doc template scaffold. The template was generating broken sites due to three issues:

1. `content.config.ts` lived at the root instead of `src/content.config.ts` (Astro 5 requirement)
2. Import was singular `/loader` instead of plural `/loaders`
3. No root redirect from `/` to `/quickstart`

This change fixed the template source, synchronized docs and delta spec, and added contract tests to prevent regression.

## Acceptance Checks — All PASS

| Check | Evidence | Status |
|-------|----------|--------|
| Template has `src/content.config.ts` (not root) with `@astrojs/starlight/loaders` import | runtime-test | ✅ PASS |
| `astro.config.mjs` declares `redirects: { "/": "/quickstart" }` | runtime-test | ✅ PASS |
| `node --test scripts/starlight-web-doc-contract.test.js` passes covering the regression | runtime-test (11/11) | ✅ PASS |
| MODIFIED delta of `REQ-sdd-document-014` exists in the change folder | inspection | ✅ PASS |

## Specs Synced to Baseline

| Domain | Requirement | Action | Details |
|--------|-------------|--------|---------|
| sdd-document | REQ-sdd-document-014 (Option D OpenWiki + Starlight Web Scaffold Generation) | MODIFIED | Updated file-set references: `content.config.ts` → `src/content.config.ts` in requirement body (L317) and scenario (L328). Baseline now reflects Astro 5 placement. |

**Merge strategy**: Surgical replacement of two path references in the existing requirement, preserving all other normative text, heading hierarchy, and acceptance criteria. No content deleted or reordered.

## Test Coverage and Evidence

- **Contract test**: `scripts/starlight-web-doc-contract.test.js` → 11/11 pass, 0 fail
- **Full suite**: `node --test scripts/**/*.test.js` → 767/767 pass, 0 fail, exit 0
- **TDD compliance**: RED→GREEN→cierre, all phases complete, 4/4 tasks in Phase 4 done

## Diff Scope

**In-scope changed files** (4 total, ~36 lines):
- `scripts/starlight-web-doc-contract.test.js` (M)
- `skills/sdd-document/assets/web-doc-template/astro.config.mjs` (M)
- `skills/sdd-document/assets/web-doc-template/{→ src}/content.config.ts` (RM / git mv)
- `skills/sdd-document/references/option-d-starlight.md` (M)

**Change folder artifacts** (6 files):
- `proposal-lite.md` (initial scope and risk assessment)
- `tasks.md` (4 phases: RED, GREEN, docs/spec sync, closure)
- `apply-progress.md` (implementation details and evidence)
- `verify-report.md` (TDD compliance and acceptance evidence)
- `specs/sdd-document/spec.md` (delta MODIFIED of REQ-014)
- `state.yaml` (workflow state)

Baseline `openspec/specs/sdd-document/spec.md` was NOT modified until archive sync (as per lite-mode protocol).

## Risk Assessment

- **Risk level**: Low
- **Rationale**: Scoped changes to static template files, documentation, and contract test. No production runtime affected. Template uses copy-if-missing idempotency, so existing generated `web-doc/` directories are unaffected.
- **Rollback**: Revert the commit; no special migration needed.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/fix-web-doc-scaffold-paths/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 2
(route-selection override + execution-mode auto-approval, both at proposal gate)

## Verification Verdict

**PASS** ✅

All four acceptance checks satisfied with runtime-test evidence and inspection-proof. Full suite green (767/767). Zero CRITICAL or WARNING findings. One cosmetic SUGGESTION about task checkboxes already resolved during apply phase.

## Archive Completion

This report was generated and persisted in the change folder while the source directory still exists at `openspec/changes/fix-web-doc-scaffold-paths/`. The folder copy to the archive destination (`openspec/changes/archive/2026-07-07-fix-web-doc-scaffold-paths/`) and subsequent source deletion are orchestrator-owned post-archive operations. The inventory of files copied is listed in the return envelope's `copy_inventory` field.
