---
name: sdd-init
description: "Trigger: sdd init, iniciar sdd, openspec init. Set up SDD in a project: its context, testing capabilities, skill registry and artifact store."
disable-model-invocation: true
user-invocable: false
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "3.0"
  delegate_only: true
runtime_capabilities:
  execute: true
  mcp: false
  write: true
---

> **ORCHESTRATOR GATE**: an orchestrator that loaded this skill hands it to the
> `sdd-init` executor through its host's sub-agent mechanism and does not run
> it in its own thread. Only that executor follows the steps below.

## Activation Contract

The orchestrator launches this phase to set up SDD in a project. The executor does the work itself and launches no other agent.

## Hard Rules

- Stack, conventions, architecture, testing tools and artifact store come from the files that were read, never from a guess.
- With `openspec`, the artifacts are files, laid out as `../_shared/openspec-convention.md` sets.
- In `openspec` mode, treat OpenSpec files on disk as canonical workflow state for continuation and recovery; never rely on conversation history.
- In `none` mode, return detected context only; write no SDD artifacts except the skill registry cache if required.
- Always persist testing capabilities in `openspec/config.yaml` `testing:` when mode is `openspec`.
- Always build `.ospec/cache/skill-registry.cache.json`.
- When `openspec/` already exists, the result says what it holds, and nothing in it changes until the user approves through a `question_gate`.

## Decision Gates

| Input | Action |
|---|---|
| `mode=openspec` | Write or update only the bootstrap files of `openspec/`. |
| `mode=none` | Return detected context only; write no SDD artifacts except the skill registry cache if required. |
| `testing.tdd_mode` marker/config found | Preserve explicitly configured TDD mode in `testing.tdd_mode`. |
| no marker/config but `team` specified | Resolve `testing.tdd_mode` from the profile: `solo` → `standard`, `small` → `focused`, `multi-team` → `strict`; `experience: junior` → `strict`. |
| no marker/config and no team | Default `testing.tdd_mode: focused` if test runner exists; otherwise `standard`. |
| existing code detected AND `openspec/specs/` empty AND no `baseline` block | Activate brownfield branch: write `baseline` block, return `next_recommended: sdd-baseline`. |
| `baseline` block already present (any status) | Preserve it unchanged; if `status` is `pending` or `partial`, return `next_recommended: sdd-baseline`. |
| `baseline.status: done` | Brownfield branch does not activate; fall back to standard `next_recommended` logic. |

## Pre-Execution: Federated Bridge (`target_dir` + Multirepo Detection)

Run this resolution BEFORE any of the Execution Steps below. It resolves the base path
and gates federated workspaces. No artifact is written until this resolution passes.

### Step 0a — Resolve the base path from `target_dir`

- Read `target_dir` from the `## Parameters` prompt block (the `target_dir: <path>` line),
  using the same injection pattern as `## Project Standards`. There is no env var and no
  dynamic frontmatter field.
- When the `## Parameters` block is **absent** or the `target_dir` key is **missing**, fall
  back to the current working directory (cwd). This is the backward-compatible default.
- When `target_dir` is **present**, `fs.stat` the path:
  - If it does not exist (`ENOENT`), STOP immediately and return `status: blocked` with a
    `question_gate(invalid-path)` describing the non-existent path. Do NOT create files at
    any location — the invalid-path gate fires before any artifact write.
  - If it exists, use it as the resolved base path; all artifact reads/writes are relative
    to it.

### Step 0b — Multirepo container detection gate

After resolving a valid base path, scan its immediate children (depth-1 only, no recursion):

- If the resolved base path has **no own `.git`** (no `.git` of its own) AND has **two or more** (≥2) immediate children that each contain `.git` (directory OR file), treat it as a
  workspace container and STOP: return `status: blocked` with a `question_gate` listing
  exactly two options — `federated` (initialize as a federated workspace) and `normal`
  (initialize as a single repo). Never auto-select the federated path. This gate fires
  **before any artifact write**; no files are created until the user responds.
- If the base path has its own `.git` (single-repo), the container gate does NOT trigger and
  init falls through to the normal flow unchanged.
- If there are fewer than two children with `.git` (threshold is ≥2), the gate does NOT fire
  and init continues as a normal single-repo init.

## Execution Steps

1. Read the manifests (`package.json`, `go.mod`, `pyproject.toml`), the CI and the lint and test configuration, and sum up the stack and its conventions.
2. Find the test runner, the test layers, coverage, the linter, the type checker and the formatter.
3. Resolve test runner availability and initialize `testing.tdd_mode` in `openspec/config.yaml` from the team profile (step 6b).
4. Set up the artifact store the mode names.
5. Build `.ospec/cache/skill-registry.cache.json` using the skill-registry scan rules.
6. Save the testing capabilities and the project context.
6b. **Team profile** (openspec mode only): read the `team: { size, experience }` line from the `## Parameters` prompt block (the orchestrator asks the user once at first init; ask nothing yourself). Write it as a top-level `team:` section (`size:` and `experience:`) into `openspec/config.yaml`; never write `idd/config.yaml` (ADR 0011). Then run `node "{{ospec-runtime}}/scripts/ospec.js" team --mode sdd --json --root <projectRoot>` and materialize its `defaults`, never your own reading of the profile:
   - `tdd_mode` → `testing: { tdd_mode }` (when a runner exists);
   - `review.traceability: required` → `traceability: { trailers: required }`;
   - `mentorship` other than `balanced` → `mentorship: { mode }`;
   - `review.quality_review: false` → keep 4R out of default route gates and prefer `lite` for trivial/small; `true` keeps 4R in the standard route gates.
   Without `team` in the parameters, write no profile and keep today's defaults. On re-init, preserve an existing `team:` or legacy `scale:` key and every block the user edited (same rule as the `baseline` block).
7. **Brownfield branch** (openspec mode only): if existing application code is detected outside `openspec/`, `docs/`, and dotfiles AND `openspec/specs/` is empty AND `openspec/config.yaml` has no `baseline` block, write the `baseline` block with `status: pending`, empty `domains_pending`, `domains_done`, `stale_domains`, and `last_checked: ""`. On re-init, if a `baseline` block already exists, preserve it unchanged.
8. Return the result described below.

## Output Contract

The envelope carries:
- `status`: `success` | `blocked` | `partial`
- `executive_summary`: in one sentence, what was set up
- `artifacts`: OpenSpec paths and registry paths written
- `next_recommended`: `foundation` for empty projects, otherwise `sdd-explore` or `sdd-new`
- `risks`: warnings about detected stack, Strict TDD status, or persistence setup
- `skill_resolution`: `injected`, `fallback-registry`, `fallback-path`, or `none`

Include project, stack, persistence mode, Strict TDD status, testing capability table, and saved paths in the detailed body.

## References

- [references/init-details.md](references/init-details.md) — detection checklist, config skeleton, and output templates.
- `../_shared/openspec-convention.md`: where each `openspec/` file lives and its rules.
