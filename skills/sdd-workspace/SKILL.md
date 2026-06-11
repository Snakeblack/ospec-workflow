---
name: sdd-workspace
description: "Trigger: sdd workspace, federated, multi-repo, atlas, cross-repo impact, artifact_store.backend workspace-federated. Manage the federation atlas and surface cross-repo state."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
  delegate_only: true
---

> **ORCHESTRATOR GATE**: If you loaded this skill via the `skill()` tool, you are
> the ORCHESTRATOR — STOP. Do NOT execute these instructions inline. Delegate to
> the dedicated `sdd-workspace` sub-agent. This skill is for EXECUTORS only.

## Activation Contract

Run this phase when the user invokes `/sdd-workspace`, or when a cross-repo change needs
the federation atlas (`artifact_store.backend: workspace-federated`). You are the
executor: do the work yourself, do not delegate.

The harness backend is resolved from `openspec/config.yaml` `artifact_store.backend`.
The atlas at `openspec/workspace.yaml` is the coordinator's declaration of member repos
and cross-repo contracts (see `_shared/persistence-contract.md`).

## Hard Rules

- **Read-only to members**: NEVER create or modify any file inside a member repo. The
  only writes allowed are `openspec/workspace.yaml` and (on `init` confirmation)
  `artifact_store.backend` in `openspec/config.yaml`.
- **Update, never clobber**: on `init` re-run, read the existing atlas and append/merge
  members; never drop members the user did not ask to remove.
- **Confirm before writing the atlas**: `init` MUST return `blocked` with a
  `question_gate` carrying the proposed member list; only write after approval.
- **Fail-open reporting**: an unreachable or non-OpenSpec member is reported as
  unreachable, never a hard error — `status`/`impact` still complete.
- **v1 is read-and-link**: do not attempt to create or apply changes inside member
  repos. Cross-repo writes are out of scope.

## Decision Gates

| Condition | Action |
|---|---|
| `init`, no atlas yet | Scan siblings → propose members → return `blocked/question_gate`. |
| `init`, atlas exists | Read it; propose additions/edits → confirm → merge-write. |
| `status` | Aggregate active changes across reachable members; flag unreachable. |
| `impact`, change touches a provider | List provider plus its contract consumers. |
| `impact`, no contract for the touched member | Report the member affects only itself. |

## Execution Steps

### `init`

1. Scan sibling directories of the coordinator workspace for candidate members: a
   directory containing an `openspec/` root.
2. Propose a member list: `id` (directory name), `path` (relative to the coordinator),
   and a guessed `role` for the user to confirm or edit.
3. Return `status: blocked` with `question_gate` containing the proposed members. Do
   NOT write the atlas yet.
4. On relaunch with the approved/edited list:
   - Read any existing `openspec/workspace.yaml`; merge the approved members (preserve
     existing entries and `contracts`).
   - Write `openspec/workspace.yaml` in the supported subset (see Atlas Format).
   - Optionally set `artifact_store.backend: workspace-federated` in
     `openspec/config.yaml` (preserve all other keys) when the user opts in.
   - Return `success` with `next_recommended: sdd-workspace status`.

### `status`

1. Parse `openspec/workspace.yaml`. For each member, resolve its OpenSpec root
   (`path` + `openspec_root`, default `openspec`).
2. For each reachable member, list active changes (exclude `archive/` and terminal
   states), tagged by member id; tag coordinator changes `source: "."`.
3. Flag members whose root is missing or has no `changes/` directory as unreachable.
4. Return `success` with the per-member report inline. Writes nothing.

### `impact <change>`

1. Determine which member the change touches (from the change's `federation.yaml`
   slices, or the user-named member).
2. Walk `contracts`: the affected set is the touched member plus the `consumers` of
   every contract whose `provider` is that member.
3. Return `success` with the affected member set so the orchestrator can scope reviewer
   load before planning. Writes nothing.

## Atlas Format (supported subset)

```yaml
schema: workspace-federated
version: 1
members:
  - id: api
    path: ../services/api      # relative to the coordinator workspace, or absolute
    role: backend
    openspec_root: openspec    # optional; default "openspec"
  - id: web
    path: ../apps/web
    role: frontend
contracts:
  - id: api-public-v1
    provider: api
    consumers: [web]
    surface: openapi           # free-form tag for where the contract truth lives
```

Keep the atlas within this subset (top-level scalars, `members` and `contracts` as a
list of maps, an inline `consumers` list). Deeper nesting is ignored by the harness
parser — do not rely on it.

## Output Contract

Return `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, and
`skill_resolution`. For `init`, include `question_gate` with the proposed member list
before any write.
