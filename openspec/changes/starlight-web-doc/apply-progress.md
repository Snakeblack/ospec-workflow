# Apply Progress: starlight-web-doc

Mode: **Strict TDD**
Delivery: `size:exception` — single PR, 6 internal work-unit commits (per `tasks.md` Review Workload Forecast, `approval-002`).

## Batch 1 (this batch) — all 6 phases

All 6 work units from `tasks.md` were implemented in this single batch, per the
DELIVERY instruction to complete the full `size:exception` single PR in one run.

### Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `scripts/starlight-web-doc-contract.test.js` | Created | Static contract test: Option D gate/scope_choice prose, option-d-starlight.md existence + rules, scaffold asset file set, route-document.md dual-dir/J5 prose. Mirrors `archive-move-fingerprint-contract.test.js`. |
| `scripts/sync-openwiki.test.js` | Created | Runtime integration test for the materialized `sync-openwiki.mjs`: title injection, source-link rewrite (+ SSH normalization), no-origin warn+skip, wiki-internal link preservation, 1:1 parity, incremental skip, prune-on-delete. |
| `scripts/sdd-document.test.js` | Modified | Added dist assertion: `sync-openwiki.mjs` ships under all 4 targets via `runConfigure`. |
| `skills/sdd-document/SKILL.md` | Modified | Option D added to the batched gate (Step 3); Step 5 sandbox states the `{openwiki/, web-doc/}` SET; Step 6.4 schema accepts `scope_choice: A\|B\|C\|D` and documents metadata placement for scope D; pointer to `references/option-d-starlight.md`. |
| `skills/sdd-document/references/option-d-starlight.md` | Created | Full Option D procedure: dual-dir sandbox, Option A reuse for `openwiki/`, copy-if-missing scaffold rule (uniform init/update, presence-only, no installers, never authors into the sync target), `.last-update.json` under `openwiki/`, reporting note for J5. |
| `skills/sdd-document/assets/web-doc-template/package.json` | Created | `predev`/`prebuild` invoke `node scripts/sync-openwiki.mjs`; pins `astro`/`@astrojs/starlight`. |
| `skills/sdd-document/assets/web-doc-template/astro.config.mjs` | Created | `starlight()` integration with `title` + `customCss`. |
| `skills/sdd-document/assets/web-doc-template/content.config.ts` | Created | `docsLoader()` + `docsSchema()`. |
| `skills/sdd-document/assets/web-doc-template/tsconfig.json` | Created | Astro strict base config. |
| `skills/sdd-document/assets/web-doc-template/src/styles/custom.css` | Created | `--sl-*` custom property overrides. |
| `skills/sdd-document/assets/web-doc-template/scripts/sync-openwiki.mjs` | Created | The transform engine: title/frontmatter injection, source-link rewrite with origin normalization + default-branch resolution, no-origin warn+skip (exit 0), `.sync-cache.json` incremental mtime/hash comparison, 1:1 parity + prune. |
| `skills/_shared/route-document.md` | Modified | §1 lists Option D; §3 resolves scope D to the dual-directory pair; §6 J5 scopes `git status` to both `openwiki/` and `web-doc/`. |
| `openspec/changes/starlight-web-doc/tasks.md` | Modified | All 36 sub-tasks marked `[x]`. |

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|--------------------|
| 1.1 | `scripts/starlight-web-doc-contract.test.js` | Unit (static/prose contract) | N/A (new) | ✅ Written — all 7 assertions failed against absent files/prose | ✅ Passed after Phase 2/3/5 implementation | ➖ Single (static-contract style; each assertion targets one distinct prose/file anchor, mirrors `archive-move-fingerprint-contract.test.js` precedent) | ✅ Clean — no changes needed after GREEN | Confirmed RED via full run before any prose/asset was written |
| 1.2 | `scripts/sync-openwiki.test.js` | Integration (subprocess exec against materialized `.mjs`) | N/A (new) | ✅ Written — all cases failed with `ENOENT` (template script absent) | ✅ Passed on first execution after `sync-openwiki.mjs` was implemented | ✅ 11 cases total (9 base + 2 triangulation cases folded in at authoring time: SSH-origin normalization and multi-page parity) | ✅ Clean — helpers already extracted (see 6.2) | Real subprocess execution (`spawnSync`) against a `mkdtemp` temp project; never reads `dist/` |
| 1.3 | `scripts/sdd-document.test.js` (extension) | Unit (dist/config generation) | ✅ 17/17 pre-existing tests in this file still passing (safety net run before editing) | ✅ Written — failed (`ENOENT` on the new asset path in each of the 4 targets) | ✅ Passed after Phase 3 assets existed | ➖ Single (structural: one file path assertion × 4 targets, no branching logic) | ➖ None needed | `configure/cli.js walk()` ships every file under `skills/` automatically; no code change needed to `cli.js` itself |
| 2.1 | `starlight-web-doc-contract.test.js` (SKILL.md subset) | Unit (static/prose) | ✅ Ran 1.1's full file before editing — pre-edit subset failed as expected (RED) | (see 1.1) | ✅ Passed — 3/3 SKILL.md-scoped assertions green | ➖ Single | ✅ Clean | Net delta +21/-4 lines — see Deviations for the pre-existing token-budget note |
| 2.2 | `starlight-web-doc-contract.test.js` (option-d-starlight.md subset) | Unit (static/prose) | N/A (new file) | (see 1.1) | ✅ Passed — 1/1 assertion green (4 sub-checks: copy-if-missing, no-installer, `.last-update.json`, dual-dir) | ➖ Single | ✅ Clean | |
| 3.1–3.5 | `starlight-web-doc-contract.test.js` (scaffold subset) + `sdd-document.test.js` (dist subset) | Unit (file existence + JSON schema + dist) | (see 1.3) | (see 1.1/1.3) | ✅ Passed — scaffold-file-set assertion (6/6 paths) and package.json wiring assertion both green | ➖ Single (structural asset files, no branching logic — per strict-tdd.md's explicit skip condition) | ✅ Clean | Versions pinned per stack-starlight reference guidance (exact pin left to apply per design's Open Questions, not a design blocker) |
| 4.1–4.3 | `scripts/sync-openwiki.test.js` | Integration | (see 1.2) | (see 1.2) | ✅ 9/9 base scenario tests passed on first execution | ✅ Triangulated in 4.5 | ✅ Clean | `description` frontmatter injection (spec: MAY) was deliberately NOT implemented — no test drives it; deferred per strict-TDD "don't write untested code" |
| 4.4 | `scripts/sync-openwiki.test.js` | Integration | — | — | ✅ All 9 base cases green | — | — | Verification step for 4.1-4.3 |
| 4.5 | `scripts/sync-openwiki.test.js` (triangulation cases) | Integration | — | ✅ Written together with the base suite (git@ SSH origin test + 2-page parity test + pre-existing-title test) | ✅ All 3 triangulation cases passed without broadening production logic beyond `resolveOriginUrl`'s existing SSH branch and the existing frontmatter/parity logic | ✅ 3 cases: SSH-origin normalization, 2-page parity count, pre-existing-title preservation | ✅ Clean | No production code change was needed for triangulation — confirms the GREEN implementation already generalized correctly (real logic, not Fake-It) |
| 5.1 | `starlight-web-doc-contract.test.js` (route-document.md subset) | Unit (static/prose) | ✅ Ran full pre-existing `sdd-document.test.js` (17/17) + full `starlight-web-doc-contract.test.js` before editing route-document.md | ✅ Ran assertion pre-edit — failed (`route-document.md §1 must list Option D`) | ✅ Passed — 1/1 assertion green (§1, §3, §6 sub-checks) | ➖ Single | ✅ Clean | |
| 5.2 | `starlight-web-doc-contract.test.js` | Unit | — | — | ✅ Confirmed via full-file re-run: 7/7 green | — | — | |
| 6.1 | (doc-only, no test) | N/A | N/A | N/A | N/A | N/A | ✅ Reviewed — see Deviations below | Confirmed the *delta* stayed terse and detail lives in `references/`; the file's pre-existing absolute size already exceeds a literal 1000-token count independent of this change |
| 6.2 | `scripts/sync-openwiki.test.js` | Integration | ✅ 11/11 passing before the review pass | N/A (refactor, no new test) | ✅ Re-ran full file — 11/11 still passing | N/A | ✅ Helpers were already extracted during the initial GREEN implementation (`classifyLinkTarget`, `rewriteLinks`, `loadCache`, `saveCache`, `hashContent`, `resolveOriginUrl`, `resolveDefaultBranch`, `parseFrontmatter`, `buildFrontmatter`) — no further extraction needed | Approval-testing pattern followed: ran tests before and after touching the file, both green |
| 6.3 | Full suite (`npm test` / `node scripts/check.js`) | All layers | ✅ Full pre-existing suite | N/A | ✅ 1007/1007 passing on re-run (see Issues Found for one transient failure on first run) | N/A | N/A | |
| 6.4 | N/A (no-code note) | N/A | N/A | N/A | N/A | N/A | N/A | Confirmed: no apply-phase edits to `openspec/specs/*.md` were made; those fold at `sdd-archive` |

### Test Summary
- **Total tests written**: 18 (7 in `starlight-web-doc-contract.test.js` + 11 in `sync-openwiki.test.js`) + 1 extension to `sdd-document.test.js`.
- **Total tests passing**: 1007/1007 (full suite, on re-run).
- **Layers used**: Unit/static-contract (8), Integration/subprocess (11), Dist/config-generation (1, extended existing file).
- **Approval tests** (refactoring): 1 — `sync-openwiki.test.js` run before/after the 6.2 review pass (already-extracted helpers confirmed unchanged in behavior).
- **Pure functions created**: 9 (`classifyLinkTarget`, `rewriteLinks`, `parseFrontmatter`, `serializeFrontmatter`, `extractFirstHeading`, `humanizeFilename`, `buildFrontmatter`, `hashContent`, plus the two git-resolution helpers which are impure but isolated at the I/O boundary).

## Deviations from Design

1. **`description` frontmatter injection (REQ-sdd-document-016, marked MAY) was not implemented.** The spec/design list it as an optional field derived from the page's opening paragraph, but no test in `tasks.md` (1.2/4.5) requires it, and strict TDD forbids writing untested production code. `title` (the MUST requirement) is always injected and never overwritten. This is a scope-narrowing deviation, not a contradiction — safe to add later behind a dedicated test.
2. **SKILL.md's absolute ≤1000-token body budget predates this change and was already exceeded** (baseline: 2919 words / 337 lines before this batch, vs. the ~500-line/1000-token convention that `openspec/memory/conventions.md` scopes explicitly to `stack-*` technology skills, not phase/domain skills like `sdd-document`). Task 6.1 was satisfied in spirit: the Option D delta was kept minimal (+21/-4 lines, well under the design's own ~+35 estimate) and all procedural detail was moved to `references/option-d-starlight.md`. No design contradiction — the design's File Changes table itself only estimated a small delta for `SKILL.md`, consistent with what was implemented.
3. **Exact `astro`/`@astrojs/starlight` version pins** were resolved as `^5.0.0` / `^0.34.0` — reasonable current-generation ranges consistent with the `docsLoader()`/`docsSchema()` content-layer API referenced in `content.config.ts`. The design explicitly deferred exact pinning to apply as a non-blocking open question, resolved here as an internal implementation detail (Assumption Materiality Rule: no observable-behavior/public-contract impact beyond "a working, current Starlight version" — recorded below).

## Issues Found

- One transient failure was observed on the FIRST full-suite run: `scripts/lib/ospec-state.test.js` → `appendRuntimeEvent serializes concurrent writers without corrupting lines` failed with `EPERM: operation not permitted, open '...\.ospec\runtime\subagent-events.jsonl.lock'`. This is a pre-existing Windows file-lock race in a test file untouched by this change (`scripts/lib/ospec-state.js`/`.test.js` — no starlight-web-doc task touches this file). Re-running the file in isolation (52/52 passing) and re-running the full suite (1007/1007 passing) both confirmed this was a transient/environmental flake, not caused by this change. No workaround was needed; flagged here for visibility rather than as a blocker.

## Assumptions Recorded This Batch

- `sdd-apply-001` — phase: `sdd-apply` — statement: "Pinned `astro: ^5.0.0` and `@astrojs/starlight: ^0.34.0` in the generated `web-doc/package.json`, consistent with the `docsLoader()`/`docsSchema()` content-layer API used in `content.config.ts`." — reversibility: `high` (a version bump in the shipped template is a one-line, low-risk change) — basis: "`skills/stack-starlight/SKILL.md` and its references document the current Starlight API shape (content-layer loader/schema) but do not pin an exact version; design.md explicitly defers exact pinning to apply as a non-blocking open question."
- `sdd-apply-002` — phase: `sdd-apply` — statement: "Deferred the optional `description` frontmatter injection (REQ-sdd-document-016, marked MAY) rather than implementing it speculatively." — reversibility: `high` (additive; can be implemented later behind a dedicated failing test without touching existing behavior) — basis: "Strict TDD's Three Laws forbid writing production code not driven by a failing test; no task in `tasks.md` (1.2/4.5) specifies a `description`-injection test case."

## Workload / PR Boundary

- Mode: `size:exception` — single PR (per `approval-002` in `state.yaml`), organized as the 6 work-unit commits described in `tasks.md`.
- Current work unit: All 6 — full batch completed in this apply run, per the DELIVERY instruction.
- Boundary: Starts from an empty diff on `feat/starlight-web-doc` (branched from `main`) and ends with the full Option D implementation, all `tasks.md` sub-tasks checked, and the full test suite green.
- Estimated review budget impact: ~910 lines forecast (design.md File Changes table); actual diff is close to that estimate — dominated by the two generated/templated surfaces (`sync-openwiki.mjs` + its test, and the Starlight asset scaffold), as anticipated by the `size:exception` rationale in `tasks.md`. No workload-escalation triggered.

### Status
36/36 tasks complete. Ready for `sdd-verify`.
