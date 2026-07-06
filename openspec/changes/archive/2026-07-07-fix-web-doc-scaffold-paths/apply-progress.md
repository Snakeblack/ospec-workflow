# Apply Progress: fix-web-doc-scaffold-paths

**Mode**: Strict TDD
**Delivery strategy**: exception-ok (single batch, well under 400-line budget)
**Batch**: 1 of 1 (all tasks completed in this batch)

## Batch 1 — All phases (2026-07-07)

### Completed Tasks

- [x] 1.1 `scripts/starlight-web-doc-contract.test.js`: "ships the exact scaffold file set" now expects `path.join("src", "content.config.ts")` instead of root `content.config.ts`.
- [x] 1.2 New test asserting `src/content.config.ts` imports `docsLoader` from the plural `@astrojs/starlight/loaders` entry point, and rejects the singular `/loader` import.
- [x] 1.3 New test asserting `astro.config.mjs` declares `redirects: { "/": "/quickstart" }`.
- [x] 1.4 Confirmed RED: 3 new/modified assertions failed against the pre-fix template (`node --test scripts/starlight-web-doc-contract.test.js` → 8 pass / 3 fail).
- [x] 2.1 `git mv skills/sdd-document/assets/web-doc-template/content.config.ts skills/sdd-document/assets/web-doc-template/src/content.config.ts`.
- [x] 2.2 Fixed import in the moved file to `import { docsLoader } from "@astrojs/starlight/loaders";` (plural).
- [x] 2.3 Added `redirects: { "/": "/quickstart" }` to `defineConfig({...})` in `skills/sdd-document/assets/web-doc-template/astro.config.mjs`.
- [x] 2.4 Confirmed GREEN: `node --test scripts/starlight-web-doc-contract.test.js` → 11/11 pass.
- [x] 3.1 `skills/sdd-document/references/option-d-starlight.md` §3 scaffold file list: `content.config.ts` → `src/content.config.ts`.
- [x] 3.2 Created `openspec/changes/fix-web-doc-scaffold-paths/specs/sdd-document/spec.md` — MODIFIED delta for `REQ-sdd-document-014`: file set in the requirement body and in the "Option D output generated" scenario now cites `src/content.config.ts`; no other normative text changed (verbatim preserved otherwise). Baseline `openspec/specs/sdd-document/spec.md` left untouched — `sdd-archive` will merge this delta.
- [x] 3.3 Full `npm test` run (with `DISABLE_AGENT_SHIELD`/`DISABLE_GIT_COLLABORATION_GUARD`/`DISABLE_TOKEN_ADVISOR` unset so hook tests run for real): exit code 0, `fail 0` across the whole suite — no regression in tests referencing these paths (`route-document.md`, `SKILL.md`, etc.).
- [x] 4.1 `git diff --stat` reviewed: 4 files touched (test + 2 template files + docs reference), ~36 changed lines total (well under the 400-line budget); `web-doc/` (generated output) and the sync script (`skills/sdd-document/assets/web-doc-template/scripts/sync-openwiki.mjs`) were NOT touched, per proposal boundaries.
- [x] 4.2 `state.yaml` updated below (`phases.apply.status: done`, top-level `status: ready-for-verify`).

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | `scripts/starlight-web-doc-contract.test.js` | Unit (static file/regex contract) | ✅ 9/9 (baseline run before edits) | ✅ Written (path assertion changed to `src/content.config.ts`) | ✅ Passed after 2.1 | ➖ Single (structural path assertion, one expected location) | ➖ None needed | Structural — no branching logic; triangulation skipped per strict-tdd.md exemption (config/path assertion, one possible correct output) |
| 1.2 | `scripts/starlight-web-doc-contract.test.js` | Unit (static file/regex contract) | N/A (new test) | ✅ Written — asserted BOTH the required plural import (`match`) AND the forbidden singular import (`doesNotMatch`) before the fix existed | ✅ Passed after 2.2 | ✅ 2 cases (positive: plural import present; negative: singular import absent) | ➖ None needed | Both assertions call `fs.readFileSync` on real production template content and regex-match real strings — not tautological |
| 1.3 | `scripts/starlight-web-doc-contract.test.js` | Unit (static file/regex contract) | N/A (new test) | ✅ Written — regex requires literal `redirects: { "/": "/quickstart" }` shape | ✅ Passed after 2.3 | ➖ Single (one redirect target defined in the proposal contract) | ➖ None needed | Triangulation skipped: purely structural config assertion, one possible correct output, noted per strict-tdd.md skip criteria |
| 2.1-2.4 | (implementation, verified by 1.1-1.3 tests) | — | — | — | ✅ 11/11 full file pass | — | ➖ None needed — minimal diffs (git mv + 1-line import fix + 3-line redirects block) | Fake-It not applicable — real template files edited directly, no stubs |
| 3.1 | (docs sync, no test — prose reference file) | — | N/A | N/A | N/A | N/A | N/A | Documentation-only change, not covered by the contract test suite; verified by manual re-read of the edited line |
| 3.2 | (delta spec, no executable test — OpenSpec artifact) | — | N/A | N/A | N/A | N/A | N/A | Delta spec is a normative-text artifact for `sdd-archive` to merge; verified by side-by-side diff against baseline REQ-014 confirming only the file-set string changed |
| 3.3 | Full suite: `node --test scripts/**/*.test.js` (via `npm test`) | — | ✅ (full suite baseline = this run) | — | ✅ exit 0, `fail 0` | — | — | Regression check across the whole repo, not a new TDD cycle |

### Test Summary

- **Total tests written**: 2 new (1.2, 1.3) + 1 modified assertion (1.1) = 3 test-level changes in `scripts/starlight-web-doc-contract.test.js`
- **Total tests passing**: 11/11 in the contract test file; full suite `fail 0` (exit 0)
- **Layers used**: Unit (3 — static file/regex contract tests), Integration (0), E2E (0)
- **Approval tests** (refactoring): None — no refactoring tasks; this batch fixed a defect in static template assets, not a behavioral refactor of existing logic
- **Pure functions created**: 0 (all changes are static asset files: `.ts`, `.mjs`, `.md` templates)

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/starlight-web-doc-contract.test.js` | Modified | Expected scaffold path changed to `src/content.config.ts`; added 2 new tests for the plural `loaders` import and the `redirects` root mapping |
| `skills/sdd-document/assets/web-doc-template/content.config.ts` → `.../src/content.config.ts` | Renamed (git mv) + Modified | Moved into `src/` (Astro 5 requirement); import fixed to `@astrojs/starlight/loaders` (plural) |
| `skills/sdd-document/assets/web-doc-template/astro.config.mjs` | Modified | Added `redirects: { "/": "/quickstart" }` to `defineConfig({...})` |
| `skills/sdd-document/references/option-d-starlight.md` | Modified | §3 scaffold file list now cites `src/content.config.ts` |
| `openspec/changes/fix-web-doc-scaffold-paths/specs/sdd-document/spec.md` | Created | MODIFIED delta for `REQ-sdd-document-014` (file set path correction only) |
| `openspec/changes/fix-web-doc-scaffold-paths/tasks.md` | Modified | All Phase 1-4 checkboxes marked `[x]` |

### Deviations from Design

None — no `design.md` exists for this lite-mode change; implementation matches `proposal-lite.md` exactly (change class: small, acceptance checks all satisfied).

### Issues Found

None. `web-doc/` (generated output, pre-existing uncommitted changes from a prior documentation run) and `openwiki/` were left untouched, per the "out of scope" boundary in `proposal-lite.md`.

### Workload / PR Boundary

- Mode: single PR, `size:exception` accepted per `appr-003` in `state.yaml` (though the actual diff, ~36 changed lines, is well under the 400-line budget — no exception actually needed)
- Current work unit: Unit 1 (the only unit) — "Fix completo: test RED→GREEN, template, docs y delta spec"
- Boundary: starts at the RED test edits, ends at the delta spec + full-suite regression pass
- Estimated review budget impact: Low — ~36 changed lines across 4 files plus 1 new delta-spec file

### Status

All tasks (1.1-4.2) complete and locally verified. Ready for `sdd-verify`.
