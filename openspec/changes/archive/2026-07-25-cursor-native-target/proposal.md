# Proposal: Cursor as a first-class native generator target

## Intent

Cursor is installed today by an untracked ad-hoc script (`scripts/sync-cursor.js`) that copies source files into `~/.cursor` without running the generator's `toolMap` substitution. Result: live Cursor agents still reference `vscode/askQuestions` and `${input:…}`, and Cursor drifts from the five supported targets. We want Cursor to be the **sixth generator target** with full generation parity, Cursor-native tool names, and a generator-first install (`npm run setup:cursor` from `dist/cursor` → `~/.cursor`).

## Scope

### In Scope

- Sixth generator target `cursor`: declarative profile + registration in `cli.js` `PROFILES`.
- Transform additions: `rules.strategy: "to-mdc"` (plus `agents-protocol.mdc` synthesized from `AGENTS.md`), `hooks.format: "cursor"`, agent `readonly: true` for `review-*`, model injection from the `models.yaml` `cursor:` column.
- Cursor-native `toolMap`: `read→Read`, `edit→Write`+`StrReplace`, `search→Grep`+`Glob`, `execute→Shell`, `agent→Task`; `vscode/askQuestions` / `AskUserQuestion` → **degrade marker** (REQ-generator-003) to a structured chat gate, since the Cursor harness exposes no callable Ask tool.
- Structural validator + golden fixtures; six-target matrix in `check.js` and the integration/parity suites.
- Generator-first install: `build:cursor` → `dist/cursor`, `setup:cursor` → `install-cursor.js` (validate, copy to `~/.cursor`, expand `__OSPEC_CURSOR_ROOT__` hook paths, copy binary, `--dry-run`); `sync-cursor.js` retired.
- Spec deltas plus target-count drift fixes.

### Out of Scope

- Repo-local `.cursor/` install (`install:cursor -- <destRepo>`).
- Emitting or merging `~/.cursor/mcp.json`; Cursor CLI E2E; Antigravity sync changes.
- Cursor-specific hook env markers; pinning Cursor tiers in `validateSddModelPolicy`.

## Capabilities

### New Capabilities

- None — Cursor is absorbed by the existing `generator`, `install`, `agents`, and `hooks-runtime` domains.

### Modified Capabilities

- `generator`: sixth target `cursor`; new `rules.strategy: to-mdc`, `hooks.format: cursor`, agent `readonly` frontmatter, Cursor `toolMap` with ask-tool degradation; runtime-script bundle scenarios extended five → six.
- `install`: new §1.x "Cursor — Native Global Installation" (`build:cursor`, `setup:cursor`, `install-cursor.js`, home-dir safety, idempotency).
- `agents`: cross-target propagation scenarios generalized from "four targets" to the current target set.
- `hooks-runtime`: Cursor hook invocation surface (camelCase events, launcher path expansion).

## Approach

Exploration Approach 1 (recommended), delivered as **one change**: Cursor is a hybrid of the **Claude** profile (`toolMap` + model injection + runtime script bundle) and the **Codex installer** (global `$HOME` install with hook placeholder expansion), using the verified `~/.cursor` layout as the target truth. Strict TDD order: golden/validator tests RED → profile + transform branches → `validate-cursor.js` GREEN → wire `cli.js`/`check.js`/six-target matrix → `install-cursor.js` + npm scripts → spec deltas and drift fixes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/target-profiles/cursor.js` | New | Declarative Cursor profile |
| `scripts/lib/target-transform.js` | Modified | `to-mdc`, `cursorHooks`, `readonly` agents |
| `scripts/configure/cli.js` | Modified | Register `cursor`; usage = six targets |
| `scripts/configure/validate-cursor.js` | New | Structural validator + residue checks |
| `scripts/configure/install-cursor.js` | New | Generator-first `~/.cursor` install |
| `scripts/sync-cursor.js` | Removed | Wrapper for one cycle, then deleted |
| `package.json` | Modified | `build:cursor`; repoint setup/reload |
| `scripts/check.js`, `real-repo.test.js`, `e2e.test.js`, parity tests | Modified | Six-target matrix |
| `scripts/configure/__fixtures__/golden/cursor/**` | New | Golden tree |
| `openspec/specs/{generator,install,agents,hooks-runtime}/spec.md` | Modified | Spec deltas |
| `openspec/config.yaml`, `docs/` | Modified | Architecture blurb + Cursor docs row |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| 400-line review budget exceeded | High | Installer as a straight port of `sync-cursor.js`; minimal validator; defer MCP emit; `sdd-tasks` must decide chained/stacked slices or `size:exception` (budget risk **Medium–High**) |
| Blocking gates without a native Ask tool | Med | Degrade prose defines an explicit STOP-and-wait chat protocol; approvals persisted in `state.yaml`; document the limitation |
| Unsafe `$HOME` install | Med | Dedicated installer with Codex-style `assertManagedPathSafe`; never reuse `install-target.js` `assertSafeDest` |
| Target-count spec drift ("four/five targets") | High | Grep-and-update specs + `config.yaml` in the same change to avoid verify contradictions |
| Windows hook path expansion | Med | Tests cover `__OSPEC_CURSOR_ROOT__` expansion on win32 (forward slashes, verified live) |
| Command frontmatter residue (`${input:…}`, `agent:`) | Low | Validator rejects `vscode/` residue; frontmatter tightening deferred unless UX breaks |

## Rollback Plan

1. Revert the change branch (single feature branch, no released artifacts). `sync-cursor.js` and its `package.json` wiring return with it.
2. If already merged: `git revert` the merge commit, then re-run `npm run setup:cursor` (restored sync path) to rebuild `~/.cursor`.
3. Partial rollback: remove `cursor` from `PROFILES` and `check.js` — the other five targets are untouched, so generation and CI recover without touching shared transform code.
4. `~/.cursor` is a regenerable install tree; recovery never requires manual editing of user files.

## Dependencies

- `models.yaml` `cursor:` tier column (already populated).
- `release/dist/ospec-hooks*` binary for hook runtime copy (existing).
- Verified `~/.cursor` reference layout as the parity oracle.

## Success Criteria

- [ ] `npm run build:cursor` produces `dist/cursor` matching the golden fixture, with zero VS Code ask-tool / abstract-tool residue in cursor agents; command `${input:}` strip is out of scope for this change.
- [ ] `validate-cursor.js` passes and `npm test` is green with the six-target matrix.
- [ ] Every SDD agent in `dist/cursor/agents/` carries a `model:` from the `cursor:` column; the six `review-*` agents carry `readonly: true`.
- [ ] Rules emit as `.mdc` with `description` / `globs` / `alwaysApply`, including `agents-protocol.mdc`.
- [ ] `npm run setup:cursor` installs `dist/cursor` into `~/.cursor` idempotently with absolute hook launcher paths; `--dry-run` changes nothing.
- [ ] Specs and `config.yaml` state six targets with no residual "four/five targets" contradiction.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention from the `branch-pr` skill (e.g. `git checkout -b feat/cursor-native-target main`).
