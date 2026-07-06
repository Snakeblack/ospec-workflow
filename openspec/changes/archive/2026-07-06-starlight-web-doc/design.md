# Design: Opción D de sdd-document — OpenWiki + Starlight web

## Technical Approach

Option D = Option A (unchanged OpenWiki generation) **+** a deterministic scaffold step **+** a runtime sync script that lives in the generated project. The `sdd-document` executor reuses the entire A path to produce `openwiki/`, then materializes a static Starlight shell under `web-doc/` by copying verbatim template files — never by running installers or re-authoring code. `openwiki/` stays the single source of truth; `web-doc/src/content/docs/` is populated only at `predev`/`prebuild` time by a zero-dependency Node sync script shipped inside `web-doc/`.

This satisfies the change-local specs: REQ-014 (scaffold file set, no installers, idempotent presence-only writes), REQ-015 (sync wiring + incremental), REQ-016 (title frontmatter), REQ-017 (source-link rewrite with origin/default-branch, warn-and-skip when no origin), REQ-018 (1:1 parity + prune), the MODIFIED gate/sandbox/metadata REQs 002/006/011, and agents REQ-006 (J5 over the directory SET).

The two moving parts — the **template asset set** (author-time, in the plugin) and the **sync script** (run-time, in the user's repo) — are the crux of the design.

## Architecture Decisions

### Decision: Scaffold ships as verbatim asset files, not LLM-authored prose

**Choice**: Store the exact Starlight shell under `skills/sdd-document/assets/web-doc-template/` as real files (`package.json`, `astro.config.mjs`, `content.config.ts`, `tsconfig.json`, `src/styles/custom.css`, `scripts/sync-openwiki.mjs`). The executor copies each file byte-for-byte into `web-doc/`, writing a file only if that path is missing.
**Alternatives considered**: Embed the files as fenced code blocks inside `references/option-d-starlight.md` and have the LLM re-type them.
**Rationale**: `scripts/configure/cli.js walk()` reads every file under `skills/` as UTF-8 and copies it to all four dist targets, so asset files ship automatically. Verbatim copy is deterministic (no per-run drift), keeps the SKILL body within its ≤1000-token budget, and makes the sync script a real `.mjs` that runtime tests can execute. LLM re-typing would risk transform-logic bugs and defeat testability.

### Decision: Sync as a zero-dependency Node ESM script inside the generated project

**Choice**: `web-doc/scripts/sync-openwiki.mjs`, invoked by `predev`/`prebuild` as `node scripts/sync-openwiki.mjs`. Uses only Node built-ins (`node:fs`, `node:path`, `node:child_process` for `git`). No npm dependency, so it runs before/without `npm install` of app deps and never itself needs installation.
**Alternatives considered**: A build-time Astro content loader / remark plugin; a shell script.
**Rationale**: Repo standard is Node.js. A loader would couple the transform to Astro internals and require deps at author time; a shell script is non-portable (Windows target). `predev`/`prebuild` hooks are the standard npm lifecycle seam and keep `openwiki/` as the only authored source.

### Decision: Dual-directory sandbox modeled as an approved SET

**Choice**: For scope D the approved output is `{openwiki/, web-doc/}`. The executor may write to either; a write outside both (minus the `/AGENTS.md`, `/CLAUDE.md` exception) halts with `design-mismatch`. Route §6 J5 scopes `git status` to both dirs; agents REQ-006 makes the SET authoritative and orchestrator-resolved.
**Alternatives considered**: Treat `web-doc/` as a nested child of a single root; a second independent sandbox pass.
**Rationale**: A SET generalizes the existing single-dir contract with the least churn and keeps one J5 pass covering both. The dirs are siblings, not nested, so a single-root model does not fit.

## Data Flow

```
Author-time (plugin):  skills/sdd-document/assets/web-doc-template/*  ── configure walk() ──▶ dist targets

Generation (executor, scope D):
  Option A path ─▶ openwiki/**            (source of truth)
  copy-if-missing ─▶ web-doc/ shell files (+ scripts/sync-openwiki.mjs)
  .last-update.json ─▶ openwiki/.last-update.json  (scope_choice: "D")

Run-time (end user):  npm run dev/build
  predev/prebuild ─▶ node scripts/sync-openwiki.mjs
      openwiki/**  ──[incremental: .sync-cache.json mtime/hash]──▶ transform
        · inject title (first heading | humanized filename) + optional description
        · rewrite source-file links → {origin}/blob/{default-branch}/path  (skip+warn if no origin)
        · leave wiki-internal links relative
      ──▶ web-doc/src/content/docs/**   (1:1; prune orphans of deleted pages)
```

## File Changes

| File | Action | Description / est. delta |
|------|--------|--------------------------|
| `skills/sdd-document/SKILL.md` | Modify | Option D in Step 3 gate; Step 5 sandbox SET; new pointer to Option-D procedure; `scope_choice: A\|B\|C\|D` in Step 6.4. Keep body terse (budget). ~+35 |
| `skills/sdd-document/references/option-d-starlight.md` | Create | Full Option-D procedure: copy-if-missing scaffold, sync wiring check, metadata-under-openwiki rule. ~+110 |
| `skills/sdd-document/assets/web-doc-template/package.json` | Create | `predev`/`prebuild` → sync; pinned `astro`+`@astrojs/starlight` (versions per stack-starlight). ~+25 |
| `.../web-doc-template/astro.config.mjs` | Create | `starlight()` integration, `title`, `customCss`. ~+30 |
| `.../web-doc-template/content.config.ts` | Create | `docsLoader()` + `docsSchema()`. ~+12 |
| `.../web-doc-template/tsconfig.json` | Create | Astro strict base. ~+8 |
| `.../web-doc-template/src/styles/custom.css` | Create | `--sl-*` custom properties. ~+20 |
| `.../web-doc-template/scripts/sync-openwiki.mjs` | Create | The transform engine (see Interfaces). ~+180 |
| `skills/_shared/route-document.md` | Modify | §1 Option D; §3 dual-dir resolution; §6 J5 over the SET. ~+25 |
| `openspec/specs/agents/spec.md` | Modify (at archive) | Fold REQ-006 delta (already in change-local spec). ~+15 |
| `openspec/specs/sdd-document/spec.md` | Modify (at archive) | Fold REQ 002/006/011 + REQ 014-018. ~+180 |
| `scripts/starlight-web-doc-contract.test.js` | Create | Static anchors for new normative prose. ~+90 |
| `scripts/sync-openwiki.test.js` | Create | Runtime test of the materialized sync script. ~+150 |
| `scripts/sdd-document.test.js` | Modify | Option D gate assertion + dist-ships-assets assertion. ~+30 |

## Interfaces / Contracts

**`sync-openwiki.mjs`** (run from `web-doc/`, CWD = project root of `web-doc/`):
- Resolves `WIKI_SRC = ../openwiki`, `OUT = ./src/content/docs`, cache `./.sync-cache.json` (git-ignored).
- Per `openwiki/**/*.md` (excluding `.last-update.json`, `_plan.md`):
  - **Incremental**: skip when source mtime **and** content hash match the cache entry.
  - **Frontmatter**: if page already has YAML `title`, keep it; else inject `title` from the first `# heading`, falling back to a humanized filename; optionally add `description` from the first non-heading paragraph.
  - **Link rewrite**: rewrite Markdown links whose target is a repo source path (leading `/`, not under `openwiki/`) to `{originWebUrl}/blob/{defaultBranch}/{path}`. `originWebUrl` derived from `git remote get-url origin` (normalize `git@`→`https://`); `defaultBranch` from `git symbolic-ref --short refs/remotes/origin/HEAD` (fallback `main`). No origin → leave link untouched, print one warning, exit 0.
  - Wiki-internal links (relative `./x.md`, or `/`-links resolving under `openwiki/`) are left as-is.
- **Parity/prune**: compute expected output set; delete any `OUT` file with no corresponding source; update cache. Never throws on a missing origin.

## Testing Strategy

| Layer | What to test | Approach |
|-------|-------------|----------|
| Static contract | Option D in SKILL gate; scaffold file set enumerated; `predev`/`prebuild` wiring prose; sandbox-SET prose; route §3/§6 dual-dir; agents REQ-006 SET | `scripts/starlight-web-doc-contract.test.js` — read the `.md`/asset files, `assert.match` on load-bearing strings (mirrors `archive-move-fingerprint-contract.test.js`) |
| Runtime (unit/integration) | Title injection (heading + filename fallback); source-link rewrite; wiki-internal link untouched; no-origin warn+skip (exit 0); incremental skip; deleted-page prune (1:1) | `scripts/sync-openwiki.test.js` — `mkdtemp` a temp repo, copy the template `sync-openwiki.mjs` from `skills/.../assets/`, seed a fixture `openwiki/`, `git init` + optional origin, exec the script, assert `web-doc/src/content/docs`. Self-generates in temp; never reads gitignored `dist/` |
| Dist | Template assets present in all four targets | Extend `scripts/sdd-document.test.js`: `runConfigure` per target, assert `skills/sdd-document/assets/web-doc-template/scripts/sync-openwiki.mjs` exists in each out dir |

## Migration / Rollout

No migration. Purely additive: `web-doc/` is created only when the user picks D; A/B/C behavior is untouched. Rollback = remove Option D from gate/route, revert spec deltas, delete generated `web-doc/`.

## Open Questions

- [ ] Exact pinned versions of `astro` / `@astrojs/starlight` for `package.json` — deferred to apply, resolved against the stack-starlight reference (not a design blocker).
