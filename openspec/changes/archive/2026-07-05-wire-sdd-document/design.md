# Design: Wire sdd-document into the Orchestrator (J1 + J4 + J5 + contract test)

## Technical Approach

The `sdd-document` executor is complete but unreachable: `agents/sdd-orchestrator.agent.md`
never references it. This change wires it through the three routing surfaces the
orchestrator uses (frontmatter `agents:` allowlist, CORE command index, Circumstantial
Handler Pointer Table) and puts the full route protocol in a new instruction-only
handler `skills/_shared/route-document.md`, following the exact `route-brownfield.md` /
`route-federation.md` pattern already normative under §15. All four behaviors map to the
change-local specs: J1 → REQ-agents-005, J5 → REQ-agents-006, contract test → REQ-agents-007,
J4 → REQ-sdd-document-002/-006/-011. The hard constraint is the sub-500-line orchestrator
guard (`real-repo.test.js`, body currently 491 lines): only three inline rows are added.

## Architecture Decisions

### Decision: Minimal inline wiring, full protocol in a _shared handler

**Choice**: Add only (a) `'sdd-document'` to the frontmatter `agents:` array (in-place,
0 net lines), (b) one command-index bullet, (c) one pointer-table row. Everything else
lives in `skills/_shared/route-document.md`.
**Alternatives considered**: inline the launch/persist/relaunch/J5 protocol in the CORE body.
**Rationale**: §15 Orchestrator Body Partitioning forbids inlining circumstantial protocol;
the 491→493 headroom cannot absorb it. Matches the established handler pattern and keeps the
size guard green. See ADR-001.

### Decision: J5 verification is orchestrator-owned and git-scoped

**Choice**: The orchestrator resolves the output dir itself from `scope_choice`/`custom_path`
(A→`openwiki/`, B→`docs/wiki/`, C→the passed `custom_path`), rejects Option C paths outside
the repo working tree at the gate, then runs a `git status` scoped to that dir + `/AGENTS.md`
+ `/CLAUDE.md` after the executor returns `success`. Any path outside that set halts with a
two-option abort/acknowledge `question_gate`. The executor never self-certifies.
**Alternatives considered**: trust the executor's return report; unscoped `git status`.
**Rationale**: Generalizes the "declared cross-file contract, no verification" defect class;
scoping avoids false positives from pre-existing untracked paths (e.g. the current untracked
`openwiki/`). See ADR-002.

### Decision: Batched single gate + `.last-update.json` persistence schema

**Choice**: Language + scope asked in ONE `question_gate` (two independent questions, single
`vscode/askQuestions`); both answers persist as `doc_language`/`scope_choice` in
`.last-update.json`; update-mode runs skip the gate when both are present, gated by a yes/no
keep/change pre-question. **Alternatives considered**: keep two sequential gates; store
answers only in `state.yaml`.
**Rationale**: `.last-update.json` is the wiki's own durable metadata read by update runs, so
skip-in-update needs those fields there. See ADR-003.

### Decision: Contract test parses the §3.2 "Routes to" column

**Choice**: The static test iterates `commands/*.prompt.md`, looks each up in the §3.2 Command
Roster table, extracts the substring after `→` as the routing target, reads the router agent
named in the command's `agent:` frontmatter, and asserts the target ∈ that router's `agents:`
allowlist. Rows with no `→` (route only to `sdd-orchestrator`) are skipped.
**Alternatives considered**: parse each command body heuristically for agent mentions.
**Rationale**: The clarification fixes §3.2 as the single source of truth; frontmatter `agent:`
is always `sdd-orchestrator`, so the real target must come from the roster. See ADR-001.

## Data Flow

    /sdd-document
        │
        ▼
    orchestrator ── read once ──► skills/_shared/route-document.md
        │
        │  init: batched question_gate (lang + scope) ─► vscode/askQuestions ─► user
        │  update: keep/change pre-question ─► reuse or re-ask overridden field(s)
        │
        ├─ resolve output dir (A→openwiki/ | B→docs/wiki/ | C→custom_path, reject if outside repo)
        ├─ persist approvals (state.yaml) + doc_language/scope_choice (.last-update.json)
        ▼
    delegate ─► sdd-document (doc_language, scope_choice, custom_path)
        │
        ▼ status: success
    orchestrator J5: git status scoped to {output_dir, /AGENTS.md, /CLAUDE.md}
        │
        ├─ all inside set ─► close route
        └─ path outside set ─► halt: abort (default) | acknowledge question_gate

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `agents/sdd-orchestrator.agent.md` | Modify | +`'sdd-document'` in `agents:` (line 5, 0 net); +1 command-index bullet; +1 pointer-table row → 491→493 lines |
| `skills/_shared/route-document.md` | Create | Full document-route protocol (launch gates, persistence, relaunch, J4, J5) — prose only, no frontmatter/tool grants |
| `skills/sdd-document/SKILL.md` | Modify | J4: batched single gate wording (Steps 3/4), `.last-update.json` gains `doc_language`+`scope_choice` (Step 6.4), skip-in-update behavior |
| `openspec/specs/agents/spec.md` | Modify | Apply REQ-agents-005/006/007 deltas; §15 pointer-table + handler-parity coverage of `route-document.md` |
| `openspec/specs/sdd-document/spec.md` | Modify | Apply REQ-sdd-document-002/-006/-011 deltas |
| `scripts/commands-agents-contract.test.js` | Create | Static commands↔agents wiring test (REQ-agents-007) |
| `scripts/configure/real-repo.test.js` | Modify | Add `route-document.md` sentinel-absence + `sentinelFiles` migration entry |

## Interfaces / Contracts

**Inline additions (exact shape):**

- Frontmatter (line 5): append `, 'sdd-document'` to the existing `agents:` array — no new line.
- Command index (under `### Commands` → Skills list): one bullet
  `` - `/sdd-document` → generate/update the repository technical wiki (delegates to sdd-document) ``.
- Pointer table row:
  `` | Document Route Handler | `/sdd-document` invoked (or route dispatch selects the `sdd-document` phase) | `skills/_shared/route-document.md` | At route dispatch, before the batched language+scope gate | ``

**`route-document.md` content outline** (mirrors `route-brownfield.md` structure):
1. *Trigger & read-once note* — loaded once per route via the pointer table.
2. *Launch protocol (init mode)* — build ONE `question_gate` with two questions (language:
   English recommended + Spanish, freeform; scope: A/B/C); a single `vscode/askQuestions`.
3. *Update-mode pre-question* — yes/no "Keep previous documentation language and scope, or
   change them?"; "keep" reuses persisted values (gate skipped); "change" acts as the
   explicit override, re-asking only the selected field(s).
4. *Output-dir resolution* — A→`openwiki/`, B→`docs/wiki/`, C→validated `custom_path`; reject
   Option C paths resolving outside the repo root at gate time (block, re-prompt).
5. *Persistence* — approval-ledger entry under `state.yaml approvals:`; write `doc_language` +
   `scope_choice` into `.last-update.json` in the resolved output dir.
6. *Dispatch* — delegate to `sdd-document` passing `doc_language`, `scope_choice`, `custom_path`.
7. *J5 post-run inventory* — after `status: success`, run `git status` scoped to the resolved
   output dir + `/AGENTS.md` + `/CLAUDE.md`; on any out-of-set path, halt with a two-option
   `question_gate` (abort=default/recommended | acknowledge accepted-risk); never close without
   an explicit choice; the executor's report is not sufficient evidence.

**Contract test API**: uses `scripts/lib/frontmatter.js` `parse(text)` +
`getField(frontmatter, 'agents')`; roster parsed from `openspec/specs/agents/spec.md` §3.2 by
regex over table rows (`| file | cmd | routes |`), taking the substring after `→`.

## Testing Strategy

Strict TDD — RED before GREEN.

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (new) | `scripts/commands-agents-contract.test.js`: every command's §3.2 `→` target ∈ router `agents:`; rows without `→` skipped; failure names offending file + missing agent | Static parse of spec + command frontmatter + orchestrator frontmatter. RED first: fails because `sdd-document` absent from allowlist |
| Unit (extend) | `real-repo.test.js`: body `< 500` lines after wiring; pointer ref `route-document.md` resolves; new sentinel absent from body but present in handler | Add `doesNotMatch` sentinel (`Acknowledge and close the route anyway`) + `sentinelFiles` entry `{ sentinel, file: "skills/_shared/route-document.md" }` |
| Unit (extend) | `scripts/sdd-document.test.js`: `.last-update.json` schema includes `doc_language`+`scope_choice`; SKILL describes one batched gate | Assert on SKILL.md text |
| Dist-parity | `route-document.md` emitted to all four targets | `skills/` is a `SOURCE_ROOTS` entry in `cli.js` and is walked recursively, so the file is emitted automatically — add per-target presence assertions in `sdd-document.test.js` (RED until file exists) |

RED cases to write first: (1) contract test with current allowlist → fail; (2) real-repo
pointer ref for `route-document.md` → fail (file missing); (3) per-target dist presence → fail.

## Migration / Rollout

No data migration. Existing `.last-update.json` files without the new fields are treated as
init-mode/incomplete metadata and trigger the batched gate — backward-compatible. Rollback =
revert the commit(s): remove the three inline rows, delete `route-document.md`, revert the
SKILL.md/spec edits, drop the new test; the executor reverts to its current unreachable state
with no cross-route impact.

## Open Questions

- [ ] None — all clarifications are encoded in the change-local specs and treated as normative.
