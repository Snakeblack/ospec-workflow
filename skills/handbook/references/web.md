# Handbook Website

Read this file only when `handbook.json` has `web: true`.

The website is a Starlight project in `web-doc/`. The handbook stays the
only source: `web-doc/scripts/sync-handbook.mjs` turns its pages into
`web-doc/src/content/docs/` before every `dev` and `build`.

## 1. Copy the scaffold

Copy these files from `skills/handbook/assets/web-doc-template/` into
`web-doc/`, keeping their relative paths:

- `package.json`
- `astro.config.mjs`
- `src/content.config.ts`
- `tsconfig.json`
- `src/styles/custom.css`
- `scripts/sync-handbook.mjs`

Write a file only when it is missing under `web-doc/`. A file that already
exists is left as it is, whoever wrote it: presence is the only check, on
init and on update.

Run no installer: no `npm create`, `npm install` or any other package
manager command. Write each file with your edit tool, copying the asset
bytes exactly.

If a write fails, retry that file once. If it fails again, report it as a
warning and go on with the other files and the handbook.

## 2. Check the wiring

On every run, check that `web-doc/package.json` still runs
`node scripts/sync-handbook.mjs` in `predev` and `prebuild`. When the
handbook is not in `handbook/` at the repository root, those scripts pass
its path: `node scripts/sync-handbook.mjs --source ../docs/handbook`. Touch
nothing else in a scaffold file that already exists.

## 3. What the website reads

The sync script reads `handbook/handbook.json` and writes
`web-doc/src/sidebar.generated.json`, which `astro.config.mjs` reads:

- `language` sets Starlight's interface language and `<html lang>`
  (English when absent).
- `groups` sets the sidebar: the quickstart first, then each group in the
  manifest's order with its `label` and, when it has an `audience`, a text
  badge.

`web-doc/` has no state file of its own; `.state.json` lives in the
handbook.

## 4. Report

List the `handbook/` and `web-doc/` files of the run apart, and mark each
scaffold file as written or already present.
