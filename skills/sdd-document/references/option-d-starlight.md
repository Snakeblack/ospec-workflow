# Option D — OpenWiki + Starlight Web Procedure

Full procedure for `scope_choice: D`. Read this file only when scope D is
resolved; Options A/B/C never need it.

## 1. Dual-directory sandbox

Scope D approves the write sandbox as the SET `{openwiki/, web-doc/}` — two
sibling directories, not one nested inside the other. You MAY write to
either directory in the same run; a write outside both (and outside the
`/AGENTS.md`/`/CLAUDE.md` exception) MUST halt with `blocker_type:
design-mismatch`, per Step 5 of `SKILL.md`.

## 2. Generate `openwiki/` (Option A path, unchanged)

Run the full Option A generation (Steps 5b–6.6 of `SKILL.md`) against
`openwiki/` exactly as you would for a plain Option A run. `openwiki/`
remains the single source of truth for content; nothing about its
generation changes for scope D.

## 3. Materialize the `web-doc/` scaffold

Copy the following files from `skills/sdd-document/assets/web-doc-template/`
into `web-doc/`, preserving their relative paths:

- `package.json`
- `astro.config.mjs`
- `content.config.ts`
- `tsconfig.json`
- `src/styles/custom.css`
- `scripts/sync-openwiki.mjs`

**Copy-if-missing rule (idempotent, uniform across init and update mode)**:
for each of these scaffold file paths, write it only if that specific file
is currently missing under `web-doc/`. If a file already exists at that
path — whether it was written by a prior Option D run, or was simply
already present the very first time this agent runs with scope D (init
mode) — do NOT overwrite it. Never inspect or judge the origin of an
existing file at a scaffold slot; presence alone is the only check. This
uniform rule avoids needing a separate "foreign content" detection path.

**No installers**: you MUST NOT run `npm create astro`, `npm create`, `npm
install`, or any other package-manager install/scaffold command. Every
scaffold file is written directly via the `edit`/`write` tool as templated
static content — copying the asset bytes verbatim.

**Never author into the sync target**: you MUST NOT write any content
directly into `web-doc/src/content/docs/`. That directory is populated
exclusively by `scripts/sync-openwiki.mjs` at `predev`/`prebuild` time, never
by direct agent writes, during generation or on any later run.

On an update-mode run with scope D, after confirming the scaffold files are
present (or writing any that are missing), you MAY re-run only a lightweight
wiring check: confirm `web-doc/package.json` still declares `predev` and
`prebuild` scripts that invoke `node scripts/sync-openwiki.mjs`. Do not
otherwise touch existing scaffold files.

## 4. `.last-update.json` placement

When the resolved scope is D, write `.last-update.json` under
`openwiki/.last-update.json` — the source-of-truth directory. `web-doc/`
does NOT carry its own separate `.last-update.json`. Set `scope_choice:
"D"` in that file, per Step 6.4 of `SKILL.md`.

## 5. Report

In the return envelope, list both `openwiki/` and `web-doc/` artifacts
touched this run (created vs. already-present/skipped for scaffold files),
so the orchestrator's J5 post-run sandbox inventory (see
`skills/_shared/route-document.md` §6) can be cross-checked against a
dual-directory SET.
