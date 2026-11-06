---
name: handbook
description: "Write and update the repository handbook and its optional docs website. Trigger: document the repository, handbook, docs website."
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
runtime_capabilities:
  execute: true
  mcp: false
  write: true
---

## When to Use

Load this skill when the user asks to document the repository, to write or
update its handbook, or to build its documentation website. It writes the
handbook from what the repository really contains: a quickstart, one folder
per group of pages, and the `handbook.json` manifest that orders them. It
never edits code, specs or configuration outside its write boundary.

## How it runs

- **Direct** (the user, the router or IDD loads this skill): ask the user
  yourself with the host's question tool; when the host has none, end your
  turn with the questions and wait for the answer.
- **Delegated** (the SDD orchestrator launches the `handbook` agent): never
  ask the user. Return `status: blocked` with a `question_gate` holding the
  questions; the orchestrator asks and relaunches you with the answers.

Either way the handbook on disk is the state: `handbook.json` holds the
settings, `.state.json` the last run. Never rely on the conversation.

## Settings

On the first run, when `handbook/handbook.json` does not exist, ask once, in
one round:

1. **Language** of the handbook (recommend English; offer the language the
   user writes in).
2. **Website**: also build the Starlight website in `web-doc/`, yes or no
   (recommend no for a repository that only needs Markdown).

Write the answers to `handbook.json` (`language`, `web`) before writing any
page. Later runs read them and ask nothing; a user who wants to change one
says so, and you edit only that field.

### Migrate an `openwiki/` directory

When the repository has `openwiki/` and no `handbook/`, ask once whether to
migrate it. On yes: `git mv openwiki handbook`; build `handbook.json` from
`openwiki/.last-update.json` (`doc_language` → `language`, `scope_choice`
`D` → `web: true`, otherwise `false`, `section_labels` → group labels) with
the groups in the order the quickstart first links them; turn the rest of
that file into `.state.json` and delete it; in `web-doc/`, rename
`scripts/sync-openwiki.mjs` to `scripts/sync-handbook.mjs` and point the
`package.json` scripts at it. On no, stop: the handbook does not write
beside an `openwiki/` it was told to leave alone.

## Files

| Path | Who writes it | Content |
|---|---|---|
| `handbook/handbook.json` | this skill, then the user by hand | settings and groups |
| `handbook/.state.json` | this skill, every run | last run, for the next update |
| `handbook/quickstart.md` | this skill | the index page |
| `handbook/<group>/<page>.md` | this skill | the pages of a group |
| `web-doc/` | this skill, only with `web: true` | the website, see [references/web.md](references/web.md) |

`handbook.json`:

```json
{
  "language": "es",
  "web": true,
  "groups": [
    { "directory": "empezar", "label": "Empezar", "audience": "Usuarios" },
    { "directory": "interno", "label": "Cómo está hecho", "audience": "Contribuidores" }
  ]
}
```

- `groups` is the reading order of the website and of the quickstart. Each
  group names a top-level directory of the handbook, a `label` written in
  `language`, and an optional `audience` (who the group is for, in
  `language`), shown as a text badge in the website sidebar.
- Every directory of the handbook has exactly one group; a directory without
  one goes last, with its folder name. The order of pages inside a group is
  the `sidebar.order` field of each page's frontmatter.
- The user may edit this file by hand. Keep their order, labels and
  audiences; add a group only for a directory you create, and remove one
  only for a directory you delete.

`.state.json`:

```json
{
  "updatedAt": "ISO-8601 UTC timestamp",
  "command": "init | update",
  "gitHead": "git rev-parse --short HEAD",
  "generator": "handbook",
  "version": "1.0",
  "pages": ["every *.md page path relative to handbook/"],
  "stats": {
    "filesGenerated": 0,
    "filesUpdated": 0,
    "filesSkipped": [{ "file": "<path>", "reason": "<why>" }]
  }
}
```

`pages` always equals the set of `*.md` files under `handbook/` after the
run. If writing `.state.json` fails, report it as a warning and finish: the
next run only loses its diff window and works as an init.

## Write boundary

Write only inside `handbook/`, inside `web-doc/` when `web` is true, and the
handbook block of the top-level `AGENTS.md` and `CLAUDE.md` (see Agent
instructions). During a migration the user approved, the boundary also
covers `openwiki/`, only to move it to `handbook/` and delete its
`.last-update.json`. Never write into `web-doc/src/content/docs/`: the sync
script generates it. A write outside the boundary stops the run: report it
instead. `web` is the value `handbook.json` had when the run started, or the
value the user set in this run; never change it on your own to widen the
boundary.

Before the first write, record `git status --porcelain`. At the end, run it
again and compare: every path the run changed outside the boundary goes in
the result. In delegated mode the orchestrator also checks the boundary
after the run, and your check does not replace it.

Do not read or document secrets, credentials, private keys, tokens or `.env`
files. When one matters, say only that the configuration exists and where
the non-secret setup lives.

## Run

### 1. Read the repository

Read the README, the existing docs, the configuration files that reveal the
stack (`package.json`, `go.mod`, `pyproject.toml` and the like), the folder
structure and the entry points. Use git to learn why code exists:
`git log --oneline -20`, `git log --oneline -- <path>` and `git blame` on a
few high-signal files. Load `skills/cognitive-doc-design/SKILL.md` as the
quality reference for every page.

The mode is **init** when `handbook/` has no `quickstart.md` and no
`.state.json`; otherwise it is **update**.

### 2. Plan

Before writing a page, write `handbook/_plan.md` with one row per page:

| page | group | category | evidence | substance | canonical for |
|---|---|---|---|---|---|
| idd/flujo.md | idd | flow | scripts/ospec.js | high | the IDD loop |

- `category` is `flow` for a page that explains a flow or an architecture;
  those pages need a Mermaid diagram.
- Merge every `low` page into a broader one or into the quickstart, and
  flatten a group with a single thin page.
- One concept has its main content on exactly one page (`canonical for`);
  other pages summarize it and link there.
- In update mode, add a `coverage proposals` section before editing
  anything: new or merged pages for code that no page covers yet.

Delete `_plan.md` when the run ends. It is never published.

### 3. Write

**Init**: at most 16 pages (the quickstart plus 15). Discover the groups
from the repository; never reuse a fixed list of topics. Order the groups
for a first-time reader: getting started, how it is used, then how it is
built and its history.

**Update**: check that the `gitHead` of `.state.json` matches
`^[0-9a-f]{7,40}$` and that `git cat-file -e <gitHead>^{commit}` succeeds;
otherwise run as an init. Then run `git diff --name-only <gitHead>..HEAD`
and edit only the pages whose evidence changed, plus the accepted coverage
proposals. Replace stale sentences, not whole sections,
and make no formatting-only edits. Re-check the volatile facts (counts,
versions, thresholds, target lists) on every run, even outside the diff.
When nothing changed, edit no page and refresh only `updatedAt` and
`gitHead`. If you believe more than three pages need edits after a diff of
fewer than five files, justify each one.

`quickstart.md`: the title, one paragraph on what the repository does, what
it lets you do, a "Start here" list linking every group in the order of
`handbook.json`, the key source files, notes for future agents (coupling
points, invariants, pitfalls) and a source map.

Each page: the title, an opening paragraph on its role, how it works, the
technical details, why it is shaped this way (omit when obvious), how to
extend it, what to watch when editing, and a source map with commit hashes.

Rules for every page:

- Derive every statement from the repository; never invent.
- Paragraphs of at most four sentences, tables for structured data,
  headings with imperative verbs ("Install the CLI").
- Link pages with relative links. Link repository files with paths that
  start at the repository root (`/package.json`), never with `file://` URLs.
- Link existing accurate documents instead of copying them.

### 4. Check

Before the state file, check every page and fix what fails:

| Check | Pass |
|---|---|
| Substance | at least 30 lines that are not blank, not headings and not in the source map |
| Links | at least one link to another handbook page and one link from another page |
| Diagram | a `flow` page has a non-empty Mermaid block |
| Diagram syntax | each Mermaid block starts with a known diagram type and quotes labels holding `[ ] ( ) { } *` |

A page that cannot pass a check (an orphan the user wants kept, for example)
is listed with its reason in the result; nothing else ships failing.

Then check the facts: compare every number, version, threshold, path,
command and configuration key on the pages you touched with the repository,
and correct or remove what does not match. Keep that record in your work,
never on the pages.

With `web: true`, run the sync from `web-doc/` (`node scripts/sync-handbook.mjs`).
It validates `handbook.json` and orders the groups; each warning it prints
(an invalid manifest, a directory without a group, a group without pages) is
a defect to fix before finishing.

### 5. Agent instructions

Unless the user says not to, keep this block in the top-level `AGENTS.md`
and `CLAUDE.md` (both when both exist; create `AGENTS.md` with only this
block when neither exists). Replace an older `## OpenWiki` block instead of
adding a second one, and touch nothing else in those files:

```markdown
## Handbook

This repository's documentation lives in /handbook.

Start here:
- [Handbook quickstart](handbook/quickstart.md)

The handbook covers what the repository does, how it is used, how it is
built, and a source map for each area. Read the quickstart first, then
follow its links to the area you are working on.
```

### 6. Finish

Write `.state.json`, delete `_plan.md`, run `git status --porcelain` again
and compare it with the one you recorded before the first write: every path
the run changed must be inside the write boundary.

## Result

Direct: tell the user the mode, the pages created and updated, the groups in
order, the checks you could not pass and why, whether the website was
synced, and every path the run changed outside the write boundary (none,
normally); the user reviewing the diff is the only other check in this
mode. Delegated: return `status`, `executive_summary` (mode, page count,
skipped pages), `artifacts` (every file written, with `handbook/` and
`web-doc/` apart), `next_recommended` (`none`), `risks` (sections you could
not finish, facts you had to correct, a failed `.state.json` write, any
path changed outside the write boundary),
`skill_resolution`, and a `checklist` with the counts of each page:

```json
{
  "checklist": {
    "results": [
      { "page": "idd/flujo.md", "substantiveLines": 42, "outgoingLinks": 3, "incomingLinks": 2, "mermaid": true }
    ],
    "justifiedExceptions": [{ "page": "...", "check": "...", "reason": "..." }]
  }
}
```

Never certify the quality of the content yourself ("facts verified",
"readability OK"): in delegated mode the orchestrator reviews it after the
run, and in direct mode the user does.
