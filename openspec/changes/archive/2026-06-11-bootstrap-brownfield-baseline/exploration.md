# Exploration: bootstrap-brownfield-baseline

## Current State

### openspec/specs/ — How It Gets Populated Today

`openspec/specs/` is always empty at init time. It exists as a skeleton directory created by
`sdd-init` but contains no files until a change is archived. The only mechanism that writes to
it today is `sdd-archive` (Step 2: Sync Delta Specs to Main Specs):

1. `sdd-init` creates `openspec/specs/` as an empty directory skeleton.
2. `sdd-spec` writes delta specs to `openspec/changes/{change-name}/specs/{domain}/spec.md` —
   never directly to `openspec/specs/`.
3. `sdd-archive` promotes those delta specs to `openspec/specs/{domain}/spec.md` and moves the
   change folder to archive.

Consumption is sparse: no phase agent today requires `openspec/specs/` as an explicit input.
The orchestrator references it as background context, but phase agents depend on change-local
artifacts (`openspec/changes/{change-name}/specs/`) during active work.

The result: on a brownfield project running `sdd-init` for the first time, `openspec/specs/` is
empty and there is no automated path to populate it with descriptions of existing behavior.

Key files:
- `skills/sdd-init/SKILL.md` — creates skeleton, writes `openspec/config.yaml`
- `skills/sdd-init/references/init-details.md` — OpenSpec Skeleton section
- `skills/sdd-archive/SKILL.md` — Step 2 (delta sync), Step 3 (archive move)
- `skills/_shared/openspec-convention.md` — canonical artifact paths table
- `openspec/config.yaml` — the only file currently in openspec/

### sdd-init Surface

`sdd-init` (SKILL v3.0) runs 7 execution steps: inspect project files, detect testing, resolve
Strict TDD, initialize persistence, build `.atl/skill-registry.md`, persist to
`openspec/config.yaml`, and return envelope.

The current `next_recommended` logic is binary: `sdd-foundation` for empty projects,
`sdd-explore` or `sdd-new` for everything else. There is no brownfield branch — projects with
existing code and empty `openspec/specs/` get the same response as projects mid-development.

The SKILL's Hard Rule "If `openspec/` already exists, report what exists and ask before updating
it" is a reinit guard, not a brownfield baseline trigger.

Key files:
- `agents/sdd-init.agent.md` — executor boundary and result contract
- `skills/sdd-init/SKILL.md` — execution steps and decision gates
- `commands/sdd-init.prompt.md` — entry point
- `skills/sdd-init/references/init-details.md` — detection checklist

### Foundation Guard (Precedent for Brownfield Guard)

The foundation guard lives in two places:
1. `skills/sdd-foundation/SKILL.md` — Activation Contract: triggered when `openspec/config.yaml`
   exists but the project has little or no detected stack.
2. `agents/sdd-orchestrator.agent.md` — Foundation Guard (MANDATORY): checks `openspec/config.yaml`
   for `project.status: empty`, empty stack arrays, `architecture: none-detected`.

The guard is activated by a sentinel value in `openspec/config.yaml` and routes the user through
guided Q&A before normal SDD work. It asks one blocking question at a time and loops until
`sdd-foundation` returns `success`.

There is no equivalent guard for brownfield projects. A new baseline guard would be parallel —
advisory by default — activated when `openspec/specs/` is empty and existing code is detected.

Key files:
- `agents/sdd-orchestrator.agent.md` — Foundation Guard (MANDATORY) section
- `skills/sdd-foundation/SKILL.md` — Activation Contract and Decision Gates
- `agents/sdd-foundation.agent.md`

### Apply-Progress Batching Pattern (Primary Precedent for Baseline Manifest)

From `skills/sdd-apply/SKILL.md` Step 6 (Merge Protocol):
1. Read existing progress before appending — preserve history.
2. Prefer atomic append-only edits.
3. Every appended entry: task id, status, evidence, blockers/deviations.
4. Never rewrite untouched historical sections.

From `docs/sdd-workflows.md` Section 6:
- Orchestrator checks `apply-progress.md` before re-launching apply.
- Sends "PREVIOUS PROGRESS EXISTS at path — MERGE, do NOT overwrite."
- Sub-agent reads → merges → saves combined result.

The baseline manifest (`openspec/specs/_baseline/manifest.md`) should follow this same contract:
each batch explores N domains, writes per-domain `openspec/specs/{domain}/spec.md`, appends
domain completion status to the manifest. On the next batch: reads manifest, skips completed
domains, continues from first pending.

Key files:
- `skills/sdd-apply/SKILL.md` — Steps 2b, 6
- `docs/sdd-workflows.md` — Section 6
- `agents/sdd-orchestrator.agent.md` — Apply-Progress Continuity (MANDATORY) section

### Hooks Runtime

`SessionStart` (`scripts/hooks/session-start.js`) only activates when `openspec/config.yaml`
exists. It performs skill registry freshness checks only. It has no awareness of `openspec/specs/`
content, baseline status, or brownfield conditions.

`PreCompact` and `Stop` look for active changes via `scripts/lib/ospec-state.js`.
`findActiveChanges` reads `openspec/changes/*/state.yaml` — it does not scan `openspec/specs/`.

No hook currently signals "baseline is pending" or "baseline is partial" to the orchestrator at
session start. A baseline-aware session start would need a new check: if `config.yaml` has
`baseline.status: pending|partial`, emit a hint.

Key files:
- `hooks/hooks.json`
- `scripts/hooks/session-start.js`
- `scripts/lib/ospec-state.js` — `findActiveChanges`, `findOpenSpecRoot`
- `scripts/hooks/stop.js`, `scripts/hooks/pre-compact.js`

### Orchestrator Routing

The orchestrator runs two mandatory guards before any SDD command:
1. **Init Guard**: check `openspec/config.yaml`, run `sdd-init` if missing.
2. **Foundation Guard**: check for empty project, route to `sdd-foundation` if needed.

The brownfield baseline hook would plug between the Init Guard completion and the first
`/sdd-new` or `/sdd-explore` invocation — either as a new third guard or as an advisory
surfaced via `sdd-init`'s `next_recommended`.

Key files:
- `agents/sdd-orchestrator.agent.md` — SDD Init Guard, Foundation Guard sections
- `commands/sdd-new.prompt.md`, `commands/sdd-continue.prompt.md`

---

## Insertion Points

| Location | What changes | Complexity |
|---|---|---|
| `sdd-init` SKILL `next_recommended` logic | Add brownfield branch: set `baseline.status: pending` in config; return `next_recommended: sdd-baseline` | Low |
| `openspec/config.yaml` schema | New `baseline` block: `status`, `domains_pending`, `domains_done` | Low |
| Orchestrator (new Baseline Guard) | After Init Guard, before Foundation Guard: check `baseline` block; prompt user | Medium |
| `SessionStart` hook | Check baseline status and emit hint at session open | Low (additive) |
| New `openspec/specs/_baseline/manifest.md` | Append-first batch progress tracker (mirrors apply-progress) | New file |
| New `openspec/specs/_baseline/index.md` | LLM-first domain index with per-domain references | New file |
| `skills/_shared/openspec-convention.md` | Add two new rows to artifact paths table | Low |

---

## Precedents to Reuse

| Precedent | Source | How to Apply |
|---|---|---|
| Apply-progress append-first merge | `skills/sdd-apply/SKILL.md` Steps 2b, 6 | Baseline manifest MUST follow same merge protocol: read → skip completed → append → save |
| Foundation guard pattern | `agents/sdd-orchestrator.agent.md` Foundation Guard | New Baseline Guard mirrors this: check config flag, delegate to executor, loop until done or deferred |
| `next_recommended` advisory | `skills/sdd-init/SKILL.md` Output Contract | Add `baseline.status: pending` to config and return `sdd-baseline` as next_recommended for brownfield |
| OpenSpec convention artifact path table | `skills/_shared/openspec-convention.md` | Extend with `baseline index` and `baseline manifest` rows under `openspec/specs/_baseline/` |
| `sdd-foundation` loop pattern | `agents/sdd-orchestrator.agent.md` Foundation Guard | Baseline executor returns `partial` after each batch; orchestrator relaunches for next batch |
| Hook-based session observability | `scripts/hooks/session-start.js` | SessionStart emits hint when `baseline.status` is `pending` or `partial` |

---

## Open Questions for Proposal

1. **Trigger mode**: Should baseline run automatically on the first post-init `sdd-new` (blocking
   or advisory), or only when the user explicitly invokes `sdd-baseline`?
2. **Granularity unit**: What is a "domain" for baseline purposes — a directory, a capability
   cluster, an agent/command pair? The answer determines batch size and manifest shape.
3. **Bypass path**: Can a user skip baseline and run `sdd-new` on an empty `openspec/specs/`?
   If yes, what warning is shown?
4. **Update cycle**: When a change is archived and delta specs are promoted to `openspec/specs/`,
   does that update the baseline index, or are baseline specs and change-driven specs separate
   tracks?
5. **Federated anticipation**: Should `_baseline/index.md` already carry a `source: local` marker
   so a future federation step can merge without re-architecting?

---

## Approaches

### Option A: New sdd-baseline Agent + sdd-init Brownfield Detection (RECOMMENDED)

`sdd-init` detects brownfield (existing code detected, `openspec/specs/` empty), sets
`baseline.status: pending` in `openspec/config.yaml`, and returns `next_recommended: sdd-baseline`.
A new `sdd-baseline` agent, skill, and command are added to the roster.
`openspec/specs/_baseline/manifest.md` tracks batch progress (append-first).

Spec layout:

```
openspec/specs/
  _baseline/
    manifest.md    # append-first batch tracker: domain, status, batch, timestamp
    index.md       # LLM-first overview: one line per domain + reference to spec.md
  {domain}/
    spec.md        # per-domain baseline spec (written by sdd-baseline, updated by sdd-archive)
```

New files: `agents/sdd-baseline.agent.md`, `skills/sdd-baseline/SKILL.md`,
`commands/sdd-baseline.prompt.md`. Updates: `openspec-convention.md`, orchestrator
(Baseline Guard section), `sdd-init` SKILL (brownfield branch).

- **Pros**: Clean separation; sdd-baseline is independently testable and deferrable; manifest
  directly reuses apply-progress precedent; `source: local` marker anticipates federated
  roadmap without building it now.
- **Cons**: New surface area (3 files); `openspec/specs/` now has two write paths (sdd-archive
  and sdd-baseline) requiring explicit ownership rules in openspec-convention.md.
- **Effort**: High

### Option B: Orchestrator Baseline Guard + sdd-explore Extension

`sdd-init` adds `baseline.status: pending`. The orchestrator gains a Baseline Guard that
delegates to `sdd-explore` with a `--baseline` flag; explore writes to `openspec/specs/`
rather than a change folder.

- **Pros**: Reuses sdd-explore; no new agent file.
- **Cons**: `sdd-explore` is scoped to named changes; repurposing it for whole-codebase baseline
  conflates two different intents; batching is harder to express in sdd-explore's single-shot
  return contract; the `--baseline` flag would require significant SKILL changes.
- **Effort**: Medium

### Option C: sdd-foundation Extension

Extend `sdd-foundation` to cover both empty-project and brownfield scenarios.

- **Pros**: One less agent file.
- **Cons**: `sdd-foundation` Activation Contract explicitly targets projects with "little or no
  detected stack"; brownfield projects have a rich detectable stack; conflating the two creates
  a semantically confusing phase and violates the existing contract.
- **Effort**: Medium-High

### Recommendation

**Option A.** The feature is orthogonal to existing phases, benefits from independent
resumability, and its apply-progress-style batching is most naturally expressed as a first-class
agent with a dedicated manifest. The two-path concern is manageable: baseline writes under
`_baseline/` and per-domain initial specs; sdd-archive updates domain specs when changes land.
`openspec-convention.md` needs explicit ownership language. `_baseline/index.md` should carry
`source: local` to anticipate the federated roadmap without building it now.

---

## Risks

- **Two write paths to openspec/specs/**: Without explicit ownership rules, a domain spec
  written by baseline could be stomped by an sdd-archive that treats "no existing main spec"
  as "fresh write." The convention needs: sdd-archive MUST check for baseline specs and
  MODIFIED-merge rather than fresh-write when baseline content exists.
- **Batch cost and context limits**: Batch sizing (how many domains per run) is undefined. A
  poorly sized batch could hit context limits mid-run without a completed manifest entry,
  leaving the manifest in an unlabeled partial state.
- **Baseline staleness**: Once written, baseline specs may diverge from actual code as the repo
  evolves without SDD changes. No invalidation mechanism exists today.
- **Index drift**: If the index is rebuilt per batch, it may drift from detail files between
  batches. The proposal should specify whether the index is rebuilt on every batch or
  accumulated append-first.

### Ready for Proposal

Yes. Territory is mapped, insertion points are clear, approach is defined, and open questions
are bounded. The proposal should resolve: trigger mode, domain granularity definition, bypass
path, and how sdd-archive's merge logic changes when baseline specs exist.
