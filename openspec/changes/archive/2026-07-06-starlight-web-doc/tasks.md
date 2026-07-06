# Tasks: Opción D de sdd-document — OpenWiki + Starlight web

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-sdd-document-002 (gate offers D + dual-dir sandbox SET) | MUST | `skills/sdd-document/SKILL.md` Step 3/5, `skills/_shared/route-document.md` §3/§6 | covered-by-design | ADR-003 (SET model) |
| REQ-sdd-document-006 (batched gate, `scope_choice A\|B\|C\|D`) | MUST | `skills/sdd-document/SKILL.md` Step 3/6.4 | covered-by-design | |
| REQ-sdd-document-011 (`.last-update.json` under `openwiki/` for scope D) | MUST | `skills/sdd-document/references/option-d-starlight.md` | covered-by-design | |
| REQ-sdd-document-014 (scaffold file set, no installers, idempotent presence-only) | MUST | `assets/web-doc-template/*`, `references/option-d-starlight.md` | covered-by-design | ADR-001 (verbatim assets) |
| REQ-sdd-document-015 (sync wiring `predev`/`prebuild` + incremental) | MUST | `assets/web-doc-template/package.json`, `scripts/sync-openwiki.mjs` | covered-by-design | ADR-002 |
| REQ-sdd-document-016 (title frontmatter injection) | MUST | `scripts/sync-openwiki.mjs` | covered-by-design | |
| REQ-sdd-document-017 (source-link rewrite, origin/default-branch, no-origin warn) | MUST | `scripts/sync-openwiki.mjs` | covered-by-design | Clarify Q2/Q3 resolved |
| REQ-sdd-document-018 (1:1 parity + prune) | MUST | `scripts/sync-openwiki.mjs` | covered-by-design | |
| REQ-agents-006 (J5 post-run sandbox inventory over the SET) | MUST | `skills/_shared/route-document.md` §6 | covered-by-design | ADR-003 |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (all 3 clarify-phase ambiguities resolved and encoded in the spec deltas: idempotent scaffold in init mode too; no-origin warn-and-skip; default-branch ref not SHA)

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

| Field | Value |
|-------|-------|
| Estimated changed lines | ~910 (sum of design.md File Changes table estimates, docs+code+tests) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR, organized as 6 internal work-unit commits (see below) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

`exception-ok` was cached by the orchestrator at session start and confirmed via `approval-002` in `state.yaml` — the maintainer has already accepted `size:exception` for this change, so no further chain-strategy decision gate is needed before `sdd-apply`. The ~910-line estimate is dominated by two generated/templated surfaces (the Starlight asset scaffold and the runtime sync script + its test), which are natural single-PR review units (generated code / vendor-shaped diffs per the `size:exception` rationale), not organically-authored business logic spread across many files.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | RED: contract + runtime + dist test scaffolding, all failing | PR 1 (single PR, commit 1) | `starlight-web-doc-contract.test.js`, `sync-openwiki.test.js`, extend `sdd-document.test.js` |
| 2 | GREEN: gate/procedure prose (SKILL.md + option-d-starlight.md) | PR 1 (commit 2) | Makes SKILL/procedure contract assertions pass |
| 3 | GREEN: Starlight scaffold assets | PR 1 (commit 3) | package.json/astro.config.mjs/content.config.ts/tsconfig.json/custom.css; makes scaffold-set + dist assertions pass |
| 4 | GREEN+TRIANGULATE: sync-openwiki.mjs | PR 1 (commit 4) | Runtime logic; makes `sync-openwiki.test.js` pass, then extends coverage |
| 5 | GREEN: route-document.md dual-dir + J5 wiring | PR 1 (commit 5) | Makes remaining contract assertions pass |
| 6 | REFACTOR + full verification | PR 1 (commit 6) | Token-budget check, dedup, `npm test` green end to end |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Test Scaffolding (RED)

- [x] 1.1 Write `scripts/starlight-web-doc-contract.test.js` (mirrors `archive-move-fingerprint-contract.test.js`): `assert.match` on SKILL.md Option D gate + `scope_choice A|B|C|D` prose, `option-d-starlight.md` existence + copy-if-missing/no-installer prose, scaffold asset file set existence under `skills/sdd-document/assets/web-doc-template/`, and `route-document.md` Option D + dual-dir SET + J5 prose. [REQ-sdd-document-002, REQ-sdd-document-014, REQ-agents-006]
- [x] 1.2 Write `scripts/sync-openwiki.test.js` with failing cases (script does not exist yet): title from first heading, humanized-filename fallback, existing-title not overwritten, source-link rewrite to `{origin}/blob/{branch}/path`, no-origin warn+skip (exit 0), wiki-internal link untouched, incremental skip of unchanged pages, 1:1 parity, deleted-page prune. [REQ-sdd-document-015, REQ-sdd-document-016, REQ-sdd-document-017, REQ-sdd-document-018]
- [x] 1.3 Extend `scripts/sdd-document.test.js` with a failing dist assertion: run `runConfigure` per target and assert `skills/sdd-document/assets/web-doc-template/scripts/sync-openwiki.mjs` exists in each output dir. [REQ-sdd-document-014]
- [x] 1.4 Run `npm test` and confirm the three (new/extended) test files fail as the RED baseline before any implementation.

## Phase 2: Gate & Procedure Prose (GREEN)

- [x] 2.1 Edit `skills/sdd-document/SKILL.md`: Step 3 gate adds Option D alongside A/B/C; Step 5 sandbox states the SET `{openwiki/, web-doc/}` for scope D; Step 6.4 accepts `scope_choice: A|B|C|D`; add a pointer to `references/option-d-starlight.md`. [REQ-sdd-document-002, REQ-sdd-document-006, REQ-sdd-document-011]
- [x] 2.2 Create `skills/sdd-document/references/option-d-starlight.md`: full Option-D procedure — copy-if-missing scaffold rule (uniform across init/update, presence-only check, never inspects file origin), sync-wiring verification step, `.last-update.json` lives under `openwiki/` for scope D, dual-directory sandbox note. [REQ-sdd-document-014, REQ-sdd-document-011]
- [x] 2.3 Re-run the SKILL.md/option-d-starlight.md subset of `scripts/starlight-web-doc-contract.test.js` (from 1.1) and confirm those assertions now pass.

## Phase 3: Starlight Scaffold Assets (GREEN)

- [x] 3.1 Create `skills/sdd-document/assets/web-doc-template/package.json`: `predev`/`prebuild` scripts invoke `node scripts/sync-openwiki.mjs`; pin `astro` + `@astrojs/starlight` versions per the stack-starlight reference. [REQ-sdd-document-014, REQ-sdd-document-015]
- [x] 3.2 Create `skills/sdd-document/assets/web-doc-template/astro.config.mjs` with the `starlight()` integration, `title`, and `customCss`. [REQ-sdd-document-014]
- [x] 3.3 Create `skills/sdd-document/assets/web-doc-template/content.config.ts` with `docsLoader()` + `docsSchema()`. [REQ-sdd-document-014]
- [x] 3.4 Create `skills/sdd-document/assets/web-doc-template/tsconfig.json` (Astro strict base). [REQ-sdd-document-014]
- [x] 3.5 Create `skills/sdd-document/assets/web-doc-template/src/styles/custom.css` with `--sl-*` custom properties. [REQ-sdd-document-014]
- [x] 3.6 Re-run the scaffold-file-set assertions in `scripts/starlight-web-doc-contract.test.js` (1.1) and the dist assertion in `scripts/sdd-document.test.js` (1.3); confirm both pass — `configure/cli.js walk()` ships the new assets to all four dist targets automatically.

## Phase 4: Sync Script Runtime Logic (GREEN + TRIANGULATE)

- [x] 4.1 Create `skills/sdd-document/assets/web-doc-template/scripts/sync-openwiki.mjs`: resolve `WIKI_SRC`/`OUT`/cache paths; implement title injection (first `# heading`, else humanized filename; never overwrite an existing `title`) plus optional `description`. [REQ-sdd-document-016]
- [x] 4.2 Add source-link rewrite in the same script: detect repo-source-path links, resolve `origin` web URL (normalize `git@`→`https://`) and default branch via `git`, rewrite to `{origin}/blob/{branch}/{path}`; skip+warn (exit 0, never fail `predev`/`prebuild`) when no origin is configured; leave wiki-internal links untouched. [REQ-sdd-document-017]
- [x] 4.3 Add incremental mtime/content-hash cache comparison (`.sync-cache.json`) and 1:1 parity + prune-on-delete logic. [REQ-sdd-document-015, REQ-sdd-document-018]
- [x] 4.4 Run `scripts/sync-openwiki.test.js` (1.2) and confirm all cases pass (GREEN).
- [x] 4.5 TRIANGULATE: extend `scripts/sync-openwiki.test.js` with a second wiki page (parity count), a page with pre-existing `title` frontmatter (must not be overwritten), and an `origin` in `git@` SSH form (must normalize to `https://`); confirm all pass without broadening production logic beyond what's needed. [REQ-sdd-document-016, REQ-sdd-document-017, REQ-sdd-document-018]

## Phase 5: Route Document Wiring (GREEN)

- [x] 5.1 Edit `skills/_shared/route-document.md`: §1 lists Option D; §3 adds dual-directory resolution (scope D → the SET); §6 scopes the J5 post-run sandbox inventory check to both `openwiki/` and `web-doc/`. [REQ-agents-006, REQ-sdd-document-002]
- [x] 5.2 Re-run the route-document.md assertions in `scripts/starlight-web-doc-contract.test.js` (1.1) and confirm they pass.

## Phase 6: Refactor & Full Verification

- [x] 6.1 REFACTOR `skills/sdd-document/SKILL.md`: confirm the body stays within the ≤1000-token budget after the Option D additions; move any excess detail into `references/option-d-starlight.md`. (Note: the pre-existing SKILL.md body already exceeds an absolute 1000-token count before this change — see apply-progress Deviations. The Option D delta itself was kept minimal (+21/-4 lines) and all procedural detail lives in `references/option-d-starlight.md`, matching the design's intent.)
- [x] 6.2 REFACTOR `scripts/sync-openwiki.mjs`: extract helper functions for link classification and cache I/O without changing observable behavior; re-run `scripts/sync-openwiki.test.js` to confirm still green. (Implemented with extracted helpers from the initial GREEN pass: `classifyLinkTarget`/`rewriteLinks`, `loadCache`/`saveCache`/`hashContent`, `resolveOriginUrl`/`resolveDefaultBranch`, `parseFrontmatter`/`buildFrontmatter`.)
- [x] 6.3 Run the full suite `npm test` and confirm `starlight-web-doc-contract.test.js`, `sync-openwiki.test.js`, `sdd-document.test.js`, and the pre-existing suite all pass.
- [x] 6.4 No-code note: `openspec/specs/sdd-document/spec.md` and `openspec/specs/agents/spec.md` are folded from these change-local deltas automatically during `sdd-archive` — no separate apply-phase task edits them directly.

## Phase 7: 4R Remediation (approval-006)

`sdd-verify`'s 4R gate returned PASS WITH WARNINGS and found findings requiring
remediation in strict TDD (reproduce → fix → green), approved by the user as
`approval-006`. All findings below are remediated in
`skills/sdd-document/assets/web-doc-template/scripts/sync-openwiki.mjs` (+
`scripts/sync-openwiki.test.js`), `skills/_shared/route-document.md`, and
`skills/sdd-document/references/option-d-starlight.md`.

- [x] 7.1 BLOCKER — guard against pruning `src/content/docs/` to nothing when `openwiki/` is missing or empty; abort with a warning, exit 0, before touching the output directory at all. Tests: source absent, source empty — both against a previously-populated output → output intact.
- [x] 7.2 CRITICAL — stop losing nested/multiline YAML frontmatter (indented keys, lists) on re-serialization. Fix: byte-for-byte passthrough of the original frontmatter block when a root-level `title` already exists; PREPEND a `title:` line onto the original raw block (never re-serialize the rest) when frontmatter exists but has no `title`. Tests: nested `sidebar`/`badge`/`tags` structure preserved with an existing title; title prepended while preserving nested `sidebar.order` when no title exists yet.
- [x] 7.3 CRITICAL — wrap the per-page transform loop in try/catch: a single page's EACCES/EBUSY/ENOTDIR no longer crashes the whole run; the page is skipped with a warning naming its path, the rest of the pages still sync, the cache still saves for the successful ones, and a final failure summary is warned. Exit code stays 0 (degradation, not a hard failure). Test: one page's output directory pre-blocked by a same-named file → exit 0, other page still synced, warning names the failing page.
- [x] 7.4 CRITICAL — wrap `saveCache`'s write in try/catch: a `.sync-cache.json` write failure no longer fails an already-successful sync; warns and continues. Test: `.sync-cache.json` pre-created as a directory (forces `EISDIR`) → exit 0, page still transformed, warning emitted.
- [x] 7.5 WARNING — `loadCache` now warns (instead of silently swallowing) when the cache file is unreadable/corrupt, and performs a full re-sync. Test: corrupt `.sync-cache.json` → exit 0 + warning.
- [x] 7.6 WARNING — wrap the prune `rmSync` call per output file in try/catch: an EPERM/EBUSY mid-prune warns and leaves that file in place instead of losing the whole run. No dedicated reproducing test was constructed (a portable, deterministic simulation of a delete-time permission failure was not achievable on Windows within this batch — see apply-progress Issues Found); the pre-existing prune test serves as the approval/regression test (still green before and after).
- [x] 7.7 WARNING — `resolveDefaultBranch` now warns when it falls back to `"main"` instead of silently degrading. Covered incidentally by the existing no-origin/no-git tests plus the new 7.8 test.
- [x] 7.8 WARNING — added a test for the "no git repository at all" path (`withGit: false`): `resolveOriginUrl`/`resolveDefaultBranch` both degrade cleanly with a warning, exit 0, link left untouched.
- [x] 7.9 WARNING (prose) — `skills/_shared/route-document.md` §4 point 2 now explicitly states `.last-update.json` is written under `openwiki/` ONLY for scope D, never under `web-doc/`, resolving the singular-vs-SET ambiguity. Elevated to static-proof via a new `starlight-web-doc-contract.test.js` assertion.
- [x] 7.10 WARNING (prose) — `skills/sdd-document/references/option-d-starlight.md` §3 now documents a partial-scaffold-materialization recovery policy: retry the failing file write once, then WARNING in the envelope and continue; a file's mere presence is never proof it is complete/valid. Elevated to static-proof via a new contract test assertion.
- [x] 7.11 Readability (cheap) — renamed the double-purpose `searchText` variable away (superseded by the `splitFrontmatter`/`buildFrontmatterBlock` restructuring in 7.2, which no longer has that variable at all); documented why `JSON.stringify` is a safe minimal YAML-string quoter (`quoteYamlString` docstring); documented the `listSourcePages` vs. `listOutputPages` filtering asymmetry (source excludes `.last-update.json`/`_plan.md`; output needs no such list because this script is the only writer of `OUT_DIR`).
- [x] 7.12 Run the full suite `npm test` and confirm `starlight-web-doc-contract.test.js` (9 tests, +2 vs. batch 1), `sync-openwiki.test.js` (18 tests, +8 vs. batch 1's actual 10), `sdd-document.test.js`, and the pre-existing suite all pass.

**Not remediated this batch (approved as follow-up, per the coordinator's message):** case-insensitive filename collisions, unicode/whitespace in page filenames, and a leading `---` being misread as a horizontal rule instead of a frontmatter fence. Noted in `apply-progress.md` for a future batch.
