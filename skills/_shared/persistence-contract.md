# Persistence Contract

Where every SDD phase reads and writes its work. All phase skills and the
orchestrator follow it.

## Mode Resolution

A phase receives `artifact_store.mode` in its launch prompt: `openspec` or
`none`.

The orchestrator always passes `openspec` to the phases of an SDD change and
does not ask the user for a mode. `none` is for a phase launched without a mode,
or one asked to return its work inline only: it then writes no project file.

## Mode Roles

- **`openspec`**: the files under `openspec/` are the record. They live in the
  repository, travel with git and can be reviewed and shared.
- **`none`**: nothing outlives the conversation.

> **Prompt-layer mode vs. harness backend.** This `artifact_store.mode`
> (`openspec | none`) is a *prompt-layer* decision: it tells a phase agent
> whether to persist to files or return inline. It is distinct from the
> *harness* backend adapter in `{{ospec-runtime}}/scripts/lib/artifact-store.js`, whose modes
> (`openspec | workspace-federated`) decide **where and how** the runtime
> resolves the on-disk layout for hooks. The two are aligned on `openspec` but
> answer different questions. `workspace-federated` (multi-repo) is implemented
> for reads (aggregated cross-repo active changes); coordinated multi-repo
> **writes** remain roadmapped.

## Workspace Federation (harness backend: `workspace-federated`)

Selected by `artifact_store.backend: workspace-federated` in `openspec/config.yaml`.
A **coordinator** repo declares its members in `openspec/workspace.yaml` (the atlas);
each member stays a standard OpenSpec repo. The harness aggregates active changes across
all reachable members, tagging each with a `source` member id (coordinator entries use
`source: "."`). Unreachable members are skipped fail-open, never fatal. See
`sdd-workspace` (`init`/`status`/`impact`) and `docs/harness-runtime.md`.

**Change-linking model.** A cross-repo change is coordinated centrally: the coordinator
change folder holds the cross-cutting `proposal.md`/`design.md` plus `federation.yaml`
linking each member to its slice change:

```yaml
federation_id: rollout-auth-v2
coordinator_change: rollout-auth-v2
slices:
  - member: api
    change: add-token-endpoint
  - member: web
    change: consume-token-endpoint
```

**v1 boundary (read-and-link).** The federated store reads and reconciles member state
but MUST NOT write into a member repo; `changeDirectory`/`writeSessionSummary`/`readConfig`
stay coordinator-local, and the derived `.ospec/` surface stays in the coordinator
workspace. Slices are authored inside each member with the normal single-repo workflow.

### Atlas as Derived Cache (C1 marker inversion)

C1 inverts the federation source-of-truth contract. The distributed markers
`openspec/federation.member.yaml` in each member repo are the **sole source of truth**;
`openspec/workspace.yaml` (the atlas) is demoted to a **derived, regenerable cache**. The
cache is gitignored and MUST NOT be committed as a canonical artifact — it is rebuilt from
the markers on demand.

Atlas load contract (realized in `{{ospec-runtime}}/scripts/lib/artifact-store.js` `loadAtlas`):

- **Valid cache is trusted.** A `workspace.yaml` that parses to a usable atlas is used as-is
  (the federated happy path is unchanged); `sdd-workspace explore` is responsible for
  refreshing it after `enroll`.
- **Absent or corrupt → regenerate.** When `workspace.yaml` is missing (ENOENT) or fails to
  parse (corrupt/unparseable), the loader regenerates the atlas from the available member
  markers (`scanMemberMarkers` → `mergeMarkersIntoAtlas` → `serializeAtlas`), writes the
  rebuilt cache, and emits a warning before proceeding when the prior cache was corrupt.
- **Warn-on-detect when git-tracked.** On every load the system runs
  `git ls-files openspec/workspace.yaml` (fail-open if git is absent). If the result is
  non-empty the file is tracked, so it emits a warn-on-detect warning instructing the user to
  run `git rm --cached openspec/workspace.yaml` manually, then continues loading normally.
- **No destructive git ops.** C1 MUST NOT execute `git rm --cached` or any other destructive
  or automatic git operation; cache migration is always manual.

## Behavior Per Mode

| Mode | Reads | Writes | Touches project files |
|---|---|---|---|
| `openspec` | files on disk | files on disk | yes |
| `none` | the launch prompt | nothing | no |

## State Persistence

`openspec/changes/{change-name}/state.yaml` is where a change resumes from,
even after the conversation is compacted. Who writes it:

- **The runtime** projects each phase result into it: `phases.*`, the top-level
  `status`, `last_updated` and `blocking_questions`, a blocked result included.
  It reads the phase's `json:result-envelope` through `SubagentStop` where the
  host has that hook, and through the orchestrator's `phase-completion-run.js`
  on every host.
- **The orchestrator** writes what it decides or runs: `route` and `owner`,
  `approvals`, `assumptions`, `baseline_fingerprints`, the audit of the gates
  it runs and `lifecycle_hooks`, and it sets `status: blocked` when one of its
  own checks fails closed.
- **A phase** writes only the blocks its own skill names, such as
  `verify_lineage`, `gates.quality-gates` or the resolutions of `assumptions`.
  It never writes `phases.*` or the top-level `status`.

| Mode | Saving state | Recovering state |
|---|---|---|
| `openspec` | the writers above, each on its own blocks | read `openspec/changes/{change-name}/state.yaml` |
| `none` | there is nowhere to save it; tell the user | not available |

## Common Rules

- In `openspec` mode, write only to the paths that `openspec-convention.md`
  lists.
- In `none` mode, create and change no project file; the result travels
  inline.
- Create `openspec/` only when the launch prompt passed `openspec`.
- A phase launched without a mode works as `none`.

## Sub-Agent Context Rules

Sub-agents launch with a fresh context and NO access to the orchestrator's instructions.

Who reads, who writes:
- Non-SDD (general task): orchestrator passes relevant prior context in the prompt; sub-agent reports discoveries in its return envelope.
- SDD (phase with dependencies): sub-agent reads artifacts directly from the active backend; sub-agent saves its artifact.
- SDD (phase without dependencies, e.g. explore): nobody reads; sub-agent saves its artifact when persistence is active.

Why this split:
- Orchestrator reads for non-SDD: it knows what context is relevant; sub-agents doing broad searches waste tokens on irrelevant results.
- Sub-agents read for SDD: SDD artifacts are large; inlining them in the orchestrator prompt would consume the context window.
- Sub-agents always write: they have the complete detail on what happened; nuance is lost by the time results flow back to the orchestrator.

## Launch Prompt Blocks

Blocks the orchestrator adds to a sub-agent's launch prompt.

Any task outside SDD:
```text
CONTEXT REPORTING (MANDATORY):
If you make important discoveries, decisions, or fix bugs, include them in your final return envelope under `discoveries` or `risks` with affected paths and rationale.
```

An SDD phase that depends on earlier artifacts:
```text
Artifact store mode: {openspec|none}

In `openspec` mode, read what your phase needs from:
- openspec/changes/{change-name}/proposal.md
- openspec/changes/{change-name}/proposal-lite.md
- openspec/changes/{change-name}/specs/**/spec.md
- openspec/changes/{change-name}/design.md
- openspec/changes/{change-name}/tasks.md
- openspec/changes/{change-name}/state.yaml
- openspec/config.yaml

PERSISTENCE (MANDATORY when mode is `openspec`):
Save your phase artifact at its OpenSpec path before you return; the next
phase reads it from there and cannot run without it. Do not write `phases.*`
or the top-level `status` of state.yaml: the runtime projects them from your
json:result-envelope.
```

An SDD phase with no earlier artifact, such as explore:
```text
Artifact store mode: {openspec|none}

PERSISTENCE (MANDATORY when mode is `openspec`):
Save your phase artifact at its OpenSpec path before you return. Do not write
`phases.*` or the top-level `status` of state.yaml: the runtime projects them
from your json:result-envelope. In `none` mode, return the artifact inline.
```

## Skill Registry

When the orchestrator found compact rules for the task, it pastes them into
the launch prompt under `## Project Standards (auto-resolved)`. A sub-agent that
has them reads neither the registry nor the `SKILL.md` of those skills. Its own
phase `SKILL.md` and `sdd-phase-common.md` are a different matter: it always
reads them (`sdd-phase-common.md` §A).

The registry is built by the `skill-registry` skill or by `sdd-init`.

Without that block, a sub-agent goes down the Resolution Order of
`skill-resolver.md` and reports in `skill_resolution` the source it used;
finding none is not an error.

## Detail Level

The orchestrator may pass `detail_level`: `concise | standard | deep`. This controls output verbosity but does NOT affect what gets persisted — always persist the full artifact when mode is `openspec`.
