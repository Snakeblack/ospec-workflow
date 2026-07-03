---
name: sdd-init
description: "Trigger: sdd init, iniciar sdd, openspec init. Initialize SDD context, testing capabilities, registry, and persistence."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "3.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `sdd-init` sub-agent using your platform's delegation primitive
> (e.g., `task(...)`, sub-agent invocation, etc.). This skill is for EXECUTORS
> only.

## Activation Contract

Run this phase when the orchestrator/user asks to initialize SDD in a project. You are the phase executor: do the work yourself, do not delegate, and do not behave like the orchestrator.

## Hard Rules

- Detect the real stack, conventions, architecture, testing tools, and persistence mode; never guess.
- In `openspec` mode, follow `../_shared/openspec-convention.md` and write file artifacts.
- In `openspec` mode, treat OpenSpec files on disk as canonical workflow state for continuation and recovery; never rely on conversation history.
- In `none` mode, return detected context only; write no SDD artifacts except the skill registry cache if required.
- Always persist testing capabilities in `openspec/config.yaml` `testing:` when mode is `openspec`.
- Always build `.ospec/cache/skill-registry.cache.json`.
- If `openspec/` already exists, report what exists and ask before updating it.

## Decision Gates

| Input | Action |
|---|---|
| `mode=openspec` | Create/update openspec bootstrap files only. |
| `mode=none` | Return detected context only; write no SDD artifacts except the skill registry cache if required. |
| strict TDD marker/config found | Use that value. |
| no marker/config but test runner exists | Default `strict_tdd: true`. |
| no test runner | Set `strict_tdd: false` and explain unavailable. |
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

1. Inspect project files (`package.json`, `go.mod`, `pyproject.toml`, CI, lint/test config) and summarize stack/conventions.
2. Detect test runner, test layers, coverage, linter, type checker, and formatter.
3. Resolve Strict TDD from agent marker, `openspec/config.yaml`, detected runner fallback, or no-runner fallback.
4. Initialize persistence for the resolved mode.
5. Build `.ospec/cache/skill-registry.cache.json` using the skill-registry scan rules.
6. Persist testing capabilities and project context.
6b. **Scale preset** (openspec mode only): read the `scale: <solo|team|enterprise>` line from the `## Parameters` prompt block (the orchestrator asks the user once at first init; absent → default `team`, ask nothing yourself). Write `scale: {value}` into `openspec/config.yaml` and materialize its preset:
   - `solo`: keep everything advisory — no extra blocks; routing prefers `lite` for trivial/small; clarify fires only on `residual_ambiguity`; 4R stays out of default route gates.
   - `team` (default): current defaults unchanged; the Change Collision Gate applies (it is always-on when other active changes exist); traceability trailers stay advisory.
   - `enterprise`: uncomment/write `strict_tdd: true` (when a runner exists), `traceability: { trailers: required }`, and `mentorship: { mode: balanced }`; keep 4R in the standard route gates; recommend declaring `quality_gates:` with `on_fail: halt`.
   On re-init with an existing `scale:` key, preserve it unchanged (same rule as the `baseline` block).
7. **Brownfield branch** (openspec mode only): if existing application code is detected outside `openspec/`, `docs/`, and dotfiles AND `openspec/specs/` is empty AND `openspec/config.yaml` has no `baseline` block, write the `baseline` block with `status: pending`, empty `domains_pending`, `domains_done`, `stale_domains`, and `last_checked: ""`. On re-init, if a `baseline` block already exists, preserve it unchanged.
8. Return the structured initialization envelope.

## Output Contract

Return a structured result with these fields:
- `status`: `success` | `blocked` | `partial`
- `executive_summary`: one-sentence description of what was initialized
- `artifacts`: OpenSpec paths and registry paths written
- `next_recommended`: `sdd-foundation` for empty projects, otherwise `sdd-explore` or `sdd-new`
- `risks`: warnings about detected stack, Strict TDD status, or persistence setup
- `skill_resolution`: `injected`, `fallback-registry`, `fallback-path`, or `none`

Include project, stack, persistence mode, Strict TDD status, testing capability table, and saved paths in the detailed body.

## References

- [references/init-details.md](references/init-details.md) — detection checklist, config skeleton, and output templates.
- `../_shared/openspec-convention.md` — openspec layout and rules.
