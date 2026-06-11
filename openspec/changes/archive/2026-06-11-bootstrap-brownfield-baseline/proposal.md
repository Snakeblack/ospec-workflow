# Proposal: Bootstrap Brownfield Baseline

## Intent

On brownfield repos, `sdd-init` leaves `openspec/specs/` empty because today only `sdd-archive` writes main specs. Future changes therefore plan against nothing — no current-state source of truth, weaker archive merges, no grounding. This change adds a resumable, batched capability that seeds `openspec/specs/` with baseline specs of existing behavior, plus brownfield detection in `sdd-init` and an advisory in the orchestrator. Approach Option A (new `sdd-baseline` agent) is approved.

## Scope

### In Scope
- New `sdd-baseline` agent/skill/command that explores in resumable batches.
- **Batch 0** scans the repo and proposes a reviewable **domain map** (capability clusters, not directories); later batches spec one domain per run.
- `sdd-init` brownfield branch: existing code detected AND `openspec/specs/` empty → set `baseline.status: pending` in `openspec/config.yaml` and return `next_recommended: sdd-baseline`. **Advisory only** — nothing blocks, nothing auto-runs.
- Orchestrator **Baseline Advisory** (after Init Guard) whose text contract MUST cover: what `/sdd-baseline` is (baseline specs of existing behavior that become the source of truth in `openspec/specs/`), gains (grounded changes, accurate archive merges), costs (batched exploration, token spend, resumable across sessions), and the skip-rule loss (below).
- `openspec/specs/_baseline/manifest.md` (append-first batch tracker, mirroring apply-progress merge protocol; per-domain git commit hash) and `index.md` (LLM-first lazy index: one line + reference per domain; `source: local` marker).
- **Skip rule (no merge logic v1):** `sdd-baseline` only seeds empty domains; it NEVER touches a domain that already has `openspec/specs/{domain}/spec.md`. Refreshing a stale **baseline-owned** domain is allowed and is not a skip-rule violation.
- Staleness: `sdd-status` and SessionStart hint flag domains whose files changed since their recorded commit hash; refresh re-specs only stale or pending domains.

### Out of Scope
- Federated mode (only the `source: local` marker is left as an anchor).
- A classify/router agent.
- Any new `sdd-archive` merge algorithm — single-track ownership stands; archive keeps merging deltas as today.

## Capabilities

> Contract for sdd-spec. `openspec/specs/` is currently empty (brownfield), so all specs below are authored fresh; "Modified" denotes behavior changes to existing prompt-layer surfaces.

### New Capabilities
- `sdd-baseline`: batched brownfield exploration, domain-map run, per-domain baseline specs, append-first manifest, LLM-first lazy index, staleness/refresh.

### Modified Capabilities
- `sdd-init`: brownfield detection branch and `baseline` config block.
- `sdd-orchestrator`: Baseline Advisory text contract and routing on `baseline.status`.
- `sdd-session-hooks`: SessionStart emits a baseline pending/partial/stale hint.

## Approach

`sdd-init` writes `baseline.status` (pending → partial → done) plus `domains_pending`/`domains_done` to `config.yaml`. The orchestrator surfaces the advisory and routes only on user consent. `sdd-baseline` runs batch 0 (domain map review), then one domain per batch: read manifest → skip done/archive-owned → spec next pending → append manifest entry (domain, status, batch, commit hash, timestamp) → save. The manifest is the single source of batch progress; the index accumulates **append-first** (one line per domain added on completion, never rebuilt) to avoid drift. Single-track: `openspec/specs/{domain}/spec.md` is THE spec; `_baseline/` holds only `manifest.md` and `index.md`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `agents/sdd-baseline.agent.md` | New | Executor boundary + result contract |
| `skills/sdd-baseline/SKILL.md` | New | Batch protocol, domain map, manifest/index rules |
| `commands/sdd-baseline.prompt.md` | New | Entry point |
| `skills/sdd-init/SKILL.md` | Modified | Brownfield branch + `baseline` config block |
| `skills/sdd-init/references/init-details.md` | Modified | Brownfield detection checklist |
| `agents/sdd-orchestrator.agent.md` | Modified | Baseline Advisory section |
| `scripts/hooks/session-start.js` | Modified | Baseline status hint |
| `skills/_shared/openspec-convention.md` | Modified | `_baseline/` manifest + index rows; ownership note |
| `openspec/config.yaml` schema | Modified | `baseline` block |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Two write paths to `openspec/specs/` collide | Med | Skip rule: baseline seeds empty domains only; archive owns evolving ones. Documented in convention. |
| Domains evolve via changes before baseline → permanent loss of current-state spec | Med | Advisory MUST warn explicitly; staleness/refresh covers baseline-owned domains only, not archive-born ones. |
| Oversized batch hits context limit mid-run, manifest in unlabeled partial state | Med | One domain per batch; manifest entry written only on domain completion; orchestrator relaunches from first pending. |
| Index drift between batches | Med | Append-first index accumulation — never rebuilt; manifest is authoritative for progress. |
| Baseline specs go stale as code changes | High | Per-domain commit hash + staleness check; on-demand refresh re-specs stale/pending only. |

## Rollback Plan

The feature is additive. To revert: delete the three new `sdd-baseline` files, remove the brownfield branch and `baseline` block from `sdd-init`/`config.yaml`, drop the orchestrator Baseline Advisory and the SessionStart hint, and revert the convention rows. No data migration; `openspec/specs/_baseline/` can be deleted without affecting archived changes or active changes. Impact on hook lifecycle is limited to one additive SessionStart hint and one new config key.

## Dependencies

- None external. Reuses apply-progress merge protocol and foundation-guard routing precedents.

## Success Criteria

- [ ] Brownfield `sdd-init` sets `baseline.status: pending` and recommends `sdd-baseline` without blocking.
- [ ] Orchestrator advisory states purpose, gains, costs, and skip-rule loss before the user decides.
- [ ] Batch 0 produces a reviewable domain map; later batches spec one domain at a time and resume after interruption via the manifest.
- [ ] `sdd-baseline` never overwrites an existing `openspec/specs/{domain}/spec.md`.
- [ ] Manifest records per-domain commit hash; staleness check flags changed domains; refresh re-specs only stale/pending.
- [ ] `_baseline/index.md` carries `source: local` and accumulates append-first.
