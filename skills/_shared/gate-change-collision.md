# Change Collision Gate (multi-team, same repo)

Circumstantial handler — load via the orchestrator pointer table ONLY when its
trigger fires: before dispatching `sdd-apply` while at least one OTHER active
(non-terminal) change exists.

## Purpose

Two people (or two sessions) can open changes that touch the same specs or
files, and nothing detects it until the git conflict at archive time. This gate
surfaces the overlap BEFORE apply, when coordinating is still cheap.

## Procedure

1. **Resolve the current change's file scope**: the declared scope from its
   `proposal.md` / `tasks.md` File Changes tables plus the `specs/{domain}/`
   delta domains it touches.
2. **Enumerate other active changes** via `findActiveChanges` (from
   `scripts/lib/artifact-store.js` — already used by session-start): every
   non-terminal change except the current one. For each, resolve the same
   declared scope from its artifacts.
3. **Detect overlap**: two changes collide when they share at least one file
   path/glob OR at least one delta spec domain.
4. **No overlap** → proceed to `sdd-apply` silently; record nothing.
5. **Overlap** → STOP and call `AskUserQuestion` (same pattern as the Ambient
   SDD Awareness Gate, applied between changes):

```json
{
  "questions": [{
    "header": "Change collision",
    "question": "El change '{current}' solapa con '{other}' en {files/domains}. ¿Cómo querés proceder?",
    "options": [
      {
        "label": "Continue anyway",
        "description": "Recommended when the overlap is read-only or the other change is stalled. Trade-off: possible delta-merge conflict at archive; reversible — the second archive re-verifies against the moved baseline.",
        "recommended": true
      },
      {
        "label": "Coordinate first",
        "description": "Stop and sync with the other change's owner before applying. Trade-off: slower now, no rework later; fully reversible."
      },
      {
        "label": "Re-scope this change",
        "description": "Route back to sdd-tasks to carve the overlapping files out of this change. Trade-off: planning rework now; low reversal cost."
      }
    ],
    "allowFreeformInput": true
  }]
}
```

6. **Persist the decision** in `state.yaml` under `approvals:` with
   `gate: change-collision`, plus a `collisions:` audit entry:

```yaml
collisions:
  - with: {other-change-name}
    overlap: [path/or/domain, ...]
    decision: continue | coordinate | re-scope
    decided_at: ISO-8601
```

## Ownership context (optional)

When `openspec/config.yaml` declares an `ownership:` block, enrich the question
with team context: map each overlapping path to its domain's `team` and name it
in the question text ("los archivos solapados pertenecen al dominio `auth`
(team platform)"). When `codeowners_sync: true`, also contrast against
`.github/CODEOWNERS` and mention mismatches — advisory only, never blocking on
its own.

## Owner stamping

Independent of this gate: when the orchestrator creates a new change
(`sdd-new`/`sdd-ff`/`sdd-lite`), it records the author in `state.yaml`:

```yaml
owner:
  author: {git user.name}
  branch: {current branch}
```

`git config user.name` and `git branch --show-current` resolve both values;
absence of git is non-fatal (omit the block).

## Baseline fingerprint at archive (stale-delta guard)

Companion rule enforced by `sdd-spec`, the orchestrator, and `sdd-archive`:

- `sdd-spec` DECLARES, per delta domain, the domain name under
  `touched_baseline_domains:` in its return envelope — it MUST NOT compute or
  write the SHA-256 fingerprint itself (no execute tool capable of hashing
  files).
- Immediately after `sdd-spec` returns `status: success`, the ORCHESTRATOR
  computes the SHA-256 of each declared domain's current baseline
  `openspec/specs/{domain}/spec.md` at spec-writing time (absent baseline →
  `null`) and writes it into `state.yaml`:

```yaml
baseline_fingerprints:
  {domain}: "sha256:..." | null
```

- `sdd-archive`, before merging each delta (Step 2), re-hashes the current
  baseline spec. Mismatch with the recorded fingerprint means the baseline
  moved since this delta was written (typically another change archived first):
  do NOT blind-merge — return `blocked` with `blocker_type: stale-baseline`
  so the orchestrator routes a re-verify of the delta against the new baseline.
  A missing `baseline_fingerprints` block (pre-feature changes) skips the check.
