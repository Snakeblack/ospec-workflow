# Design: Bootstrap Brownfield Baseline

## Technical Approach

Add a first-class `sdd-baseline` phase (agent + skill + command, mirroring the `sdd-foundation` trio) that seeds `openspec/specs/` in resumable one-domain batches, tracked by an append-first manifest under `openspec/specs/_baseline/`. `sdd-init` gains a brownfield branch that records `baseline.status` in `openspec/config.yaml`; the orchestrator surfaces an advisory (never a block); `session-start.js` emits a hint by reading cached config state only — staleness is computed on-demand at the prompt layer.

Surface split (per `rules.design`): everything is **prompt/Markdown layer** except `scripts/hooks/session-start.js` and a new parser helper in `scripts/lib/ospec-state.js`, which are **JS runtime** and fall under Strict TDD.

## Component Architecture

### New files (mirror sibling phase structure)

| File | Contract |
|---|---|
| `agents/sdd-baseline.agent.md` | Mirrors `agents/sdd-foundation.agent.md`: executor boundary (no delegation), reads `skills/sdd-baseline/SKILL.md` + `skills/_shared/sdd-phase-common.md`, result contract `status / executive_summary / artifacts / next_recommended / risks / skill_resolution`. Returns `partial` after each completed batch with `next_recommended: sdd-baseline` so the orchestrator relaunches (Foundation Guard loop precedent). Returns `blocked` + `question_gate` for batch-0 domain-map approval. |
| `skills/sdd-baseline/SKILL.md` | Activation contract (mirrors `skills/sdd-foundation/SKILL.md`): runs when `openspec/config.yaml` has `baseline.status: pending|partial` or user invokes `/sdd-baseline`. Encodes batch protocol, domain-map rules, manifest/index merge protocol (mirrors `skills/sdd-apply/SKILL.md` Step 2b + Step 6), skip rule, refresh rule. |
| `commands/sdd-baseline.prompt.md` | Mirrors `commands/sdd-init.prompt.md`: frontmatter `agent: sdd-orchestrator`, short routing prompt, `${input}` passthrough (optional domain name to target). |

### Modified surfaces

| File | Action | Layer |
|---|---|---|
| `skills/sdd-init/SKILL.md` | Brownfield branch: existing code detected AND `openspec/specs/` empty → write `baseline` block (`status: pending`), return `next_recommended: sdd-baseline` | Prompt |
| `skills/sdd-init/references/init-details.md` | Brownfield detection checklist (source files present outside `openspec/`, `docs/`, dotfiles) | Prompt |
| `agents/sdd-orchestrator.agent.md` | New **Baseline Advisory** section after Init Guard, before Foundation Guard. Text contract MUST state: what baseline is, gains (grounded changes, accurate archive merges), costs (batched exploration, token spend, resumable), and skip-rule loss (domains evolved via archive before baselining permanently lose their current-state seed). Routes only on explicit user consent; never blocks. | Prompt |
| `skills/_shared/openspec-convention.md` | Two artifact rows (`sdd-baseline` creates `openspec/specs/_baseline/manifest.md`, `index.md`, and `openspec/specs/{domain}/spec.md` for empty domains only) + ownership rule: baseline seeds empty domains; sdd-archive owns evolving ones; baseline NEVER writes where `openspec/specs/{domain}/spec.md` exists | Prompt |
| `scripts/hooks/session-start.js` | Baseline hint from cached config state | **JS runtime (TDD)** |
| `scripts/lib/ospec-state.js` | New `readBaselineState(configContent)` line parser | **JS runtime (TDD)** |
| `docs/sdd-workflows.md` | New baseline workflow section | Prompt |

## Data Design

### `openspec/config.yaml` — `baseline` block

```yaml
baseline:
  status: pending        # pending | partial | done
  domains_pending: []    # set by batch 0 from approved domain map
  domains_done: []       # appended on each domain completion
  stale_domains: []      # written by on-demand staleness check (sdd-status / sdd-baseline)
  last_checked: ""       # UTC ISO timestamp of last staleness check
```

`status` keeps the proposal's three-value lifecycle; staleness is a separate `stale_domains` list so a `done` baseline with stale domains stays `done` (refresh re-specs only listed domains).

### `openspec/specs/_baseline/manifest.md` (append-first, authoritative for progress)

```markdown
# Baseline Manifest

## Domain Map (batch 0 — written once, user-approved)
- {domain}: {one-line scope} | sources: {path globs}

## Entries (append-only log; latest row per domain wins)
| domain | status | batch | commit | timestamp (UTC) |
|---|---|---|---|---|
| auth | done | 1 | a1b2c3d | 2026-06-10T14:00:00Z |
| auth | refreshed | 4 | e4f5a6b | 2026-06-12T09:30:00Z |
```

Rules: entry appended ONLY on domain completion (never mid-run); refresh appends a `refreshed` row, never edits history; `sources` in the domain map is the file-glob mapping used by the staleness diff; merge protocol identical to apply-progress (read → skip done → append → never rewrite history).

### `openspec/specs/_baseline/index.md` (LLM-first lazy index)

```markdown
# Baseline Index
source: local
<!-- append-first: one line per domain on completion; never rebuilt -->
- auth: session and token lifecycle → ../auth/spec.md
```

## Flow Design

### (a) sdd-init brownfield detection → advisory

```
User            Orchestrator         sdd-init              config.yaml
 │ /sdd-init        │                    │                     │
 │──────────────────►│── delegate ──────►│                     │
 │                   │                   │ detect code + empty │
 │                   │                   │ openspec/specs/     │
 │                   │                   │── write baseline:   │
 │                   │                   │   status: pending ─►│
 │                   │◄─ partial/success │                     │
 │                   │   next: sdd-baseline                    │
 │◄─ Baseline Advisory (purpose/gains/costs/skip-rule loss)    │
 │── consent or skip ►│  (skip → normal SDD, advisory recorded)│
```

### (b) Batch 0 — domain map with user review

```
Orchestrator        sdd-baseline           Repo            User
 │── launch batch 0 ──►│                     │               │
 │                     │── scan structure ──►│               │
 │                     │  cluster capabilities (not dirs)    │
 │◄─ blocked +         │                     │               │
 │   question_gate(map)│                     │               │
 │── askQuestions ─────────────────────────────────────────► │
 │◄─ approved/edited map ◄────────────────────────────────── │
 │── relaunch w/ map ─►│                     │               │
 │                     │ write manifest Domain Map (once)    │
 │                     │ set config domains_pending          │
 │◄─ partial, next: sdd-baseline (batch 1)   │               │
```

### (c) Per-domain batch N — completion-only write

```
sdd-baseline          manifest.md        specs/{domain}/      config.yaml
 │── read entries ───►│                       │                  │
 │  pick first pending (skip done + skip any  │                  │
 │  domain whose spec.md already exists)      │                  │
 │── explore domain sources, write spec ─────►│                  │
 │── capture commit: git rev-parse --short HEAD                  │
 │── APPEND entry (domain, done, batch, hash, UTC) ──►│          │
 │── append index line; move domain pending→done ───────────────►│
 │   return partial (more pending) or success (none)             │
```

### (d) Resume after interruption

Interrupted batch left NO manifest entry (completion-only) — possibly an orphan partial `spec.md`. On relaunch: read manifest → domain has no `done` entry → re-spec it fully, overwriting the orphan (safe: only baseline writes domains without manifest entries). Orchestrator relaunch loop is identical to (c).

### (e) Staleness check and refresh

On `sdd-status` (or explicit `/sdd-baseline refresh`): for each `done` domain, run `git diff --name-only {commit} -- {sources}`; non-empty → stale. Write `stale_domains` + `last_checked` to config. Refresh re-specs ONLY stale or pending baseline-owned domains, appending `refreshed` manifest rows with the new hash. SessionStart never runs git — it only reads the cached `baseline` block and emits: `pending` → "baseline not started", `partial` → "N domains pending", `stale_domains` non-empty → "N baseline domains stale".

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|
| Manifest writes | Completion-only entries | Start+end entries; in-progress marker | Mid-run context death leaves no ambiguous state; absence of entry = pending, which makes resume trivial (proposal risk #3) |
| Index maintenance | Append-first, never rebuilt | Rebuild per batch from manifest | Rebuild requires loading all specs each batch (token cost) and risks drift between rebuilds; manifest stays authoritative for progress, index is presentation only |
| Existing-spec collision | Skip rule (never touch existing `{domain}/spec.md`) | Merge baseline into existing specs | Merge needs diff semantics against archive-owned content — the exact complexity v1 excludes; single-track ownership keeps sdd-archive unchanged |
| Orchestrator integration | Advisory after Init Guard | Blocking guard (Foundation Guard style) | Baseline is valuable but optional; blocking a brownfield team's first change behind N exploration batches would kill adoption; advisory + explicit consent matches proposal |
| Staleness computation | On-demand at prompt layer (sdd-status/sdd-baseline via git CLI); hook reads cached config only | Hook-time `git diff` in session-start.js | Cheapest correct option: hook stays fs-only (no `child_process`, no manifest parsing, no domain→glob mapping in JS); git + glob reasoning already exists at agent level; cached `stale_domains` still lets the hook surface "stale" per the proposal |
| Config parsing in hook | Line-based parser in `ospec-state.js` (mirrors `readStatus`) | YAML dependency | Repo rule: `node:*` builtins only, no package.json; `readStatus` precedent proves indentation-scoped parsing suffices |

## Testing Strategy — STRICT TDD for JS runtime

Test command: `node --test "scripts/**/*.test.js"`. RED-GREEN-REFACTOR mandatory for runtime files; follow existing conventions (`node:test`, `assert/strict`, `mkdtemp` fixtures with `t.after` cleanup, injected `now`/`pluginRoot`).

| Surface | Verification level | Approach |
|---|---|---|
| `scripts/lib/ospec-state.js` `readBaselineState()` | Unit (TDD, test-first) | New cases in `ospec-state.test.js`: missing block, pending/partial/done, list parsing, comments, CRLF |
| `scripts/hooks/session-start.js` hint | Unit (TDD, test-first) | New cases in `session-start.test.js`: config fixture with/without `baseline` block → `baseline` field present/absent in result envelope; no-openspec path unchanged |
| Agent/skill/command Markdown, convention, orchestrator advisory, docs | Review + sdd-verify | Checklist against proposal success criteria: advisory text covers 4 mandated points; skip rule stated in convention AND skill; manifest/index formats match this design |
| End-to-end batch behavior | Manual scenario in verify phase | Simulated brownfield run: init → advisory → batch 0 → one domain batch → interrupt → resume |

## Migration / Rollout

No migration. Purely additive; rollback = delete 3 new files, revert 5 modified surfaces, optionally delete `openspec/specs/_baseline/` (proposal Rollback Plan stands).

## Open Questions

- [ ] None blocking. Batch size is fixed at one domain per run by design; revisit only if real-world domains prove too small to justify a launch each.
