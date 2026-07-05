# Design: Harden Archive Move + Baseline Fingerprints (Bloque 1.2 / I1)

## Technical Approach

Two SDD contracts demand capabilities their executor lacks (bug class I1). This
change relocates BOTH operations to the orchestrator and rewrites the executor
contracts to match its actual tools, then anchors the load-bearing instruction
strings with static tests so drift fails `npm test`. It is a prompt/spec/test
change only — no runtime code path moves.

Mode: `design-after-spec`. Every MUST scenario in `specs/agents/spec.md`
(REQ-agents-008, REQ-agents-009) and `specs/skills/spec.md` (Baseline Fingerprint
Recording; sdd-archive Copy-and-Report Contract) maps to a concrete file edit and
a static anchor below.

The design pivots on two placement calls (ADR-001, ADR-002) driven by WHERE each
orchestrator responsibility must be loaded and whether it fires on every route:

- **Archive move-completion** is a POST-return, archive-route-only responsibility.
  `gate-archive-quality.md` is already read at the archive hook point and, per the
  Circumstantial Handler Pointer Table rule, "its content then stays in your
  context for the rest of this route." Appending the move-completion protocol to
  that same file means it is already loaded when `sdd-archive` returns — **zero
  new pointer rows, zero inline orchestrator lines**. This is the archive analogue
  of `route-document.md`'s §6 J5 "orchestrator-owned post-run inventory" precedent.
- **Baseline fingerprint computation** is a STANDING responsibility (every change
  touching a baseline domain) that MUST run immediately post-`sdd-spec`. No
  circumstantial handler reliably fires there on every route (`clarify-routing.md`
  is conditional on the clarify gate). So it lives as a small inline standing block
  next to the existing Assumption Ledger Protocol — the established pattern for
  always-fires orchestrator duties.

## Architecture Decisions

### Decision: Archive move-completion extends gate-archive-quality.md

**Choice**: Append a `## Post-Return Move Completion` section to
`skills/_shared/gate-archive-quality.md` rather than create a new
`route-archive-move.md` handler.
**Alternatives considered**: New `_shared/route-archive-move.md` (cleaner
separation, but costs one of the ~8 remaining pointer-table lines under the <500
guard and a redundant load); inline in orchestrator body (violates the handler
pattern and the 500-line ratchet).
**Rationale**: The handler is already loaded and retained in context across the
`sdd-archive` return, so the post-return protocol needs no separate load; it keeps
the full orchestrator-side archive lifecycle (pre-dispatch quality gate +
post-return move completion) cohesive in one file; net zero inline orchestrator
lines. Trade-off: the file now spans two hook points — mitigated by an explicit
section header. Significant (cross-cutting handler pattern) → ADR-001.

### Decision: Fingerprint computation is a standing inline orchestrator block

**Choice**: Add a compact, self-contained standing block to the orchestrator body
(adjacent to the Assumption Ledger Protocol) instructing: after `sdd-spec` returns
`success`, compute SHA-256 of each `touched_baseline_domains` entry's current
`openspec/specs/{domain}/spec.md` (or `null` if absent) and write it to
`state.yaml.baseline_fingerprints`; never as a per-change `assumptions:` entry.
**Alternatives considered**: Host it in `clarify-routing.md` (post-sdd-spec hook,
but conditional — not standing); host it in `gate-change-collision.md` (loaded
pre-apply, too late for a spec-time snapshot).
**Rationale**: The snapshot must be taken at spec time to detect a later baseline
move; only a standing responsibility guarantees that on every route, exactly like
the Assumption Ledger Protocol which is explicitly "not a circumstantial handler."
Cost: ~6 inline lines (492 → ~498, still under the guard). Significant (contract
ownership move + cross-cutting pattern) → ADR-002.

### Decision: One dedicated static contract test file + real-repo sentinel extension

**Choice**: New `scripts/archive-move-fingerprint-contract.test.js` (two `test()`
cases: archive-move contract, fingerprint ownership) plus new sentinel entries in
`scripts/configure/real-repo.test.js`.
**Alternatives considered**: Fold assertions into an existing suite (dilutes the
concern; harder to locate on drift).
**Rationale**: Matches the static-anchor style of `commands-agents-contract.test.js`
and `sdd-document.test.js`; keeps the load-bearing strings for this change in one
discoverable file. Because the move-completion protocol lives in an existing
sentinel-tracked handler, no NEW `_shared` file is created, so the real-repo
sentinel table gains rows (not a new-file entry). → ADR-003.

## Data Flow

```
sdd-spec ──success (envelope: touched_baseline_domains:[…]) ──► ORCHESTRATOR
                                                                    │ standing block
                                                                    ▼
                                              compute sha256 per domain (null if absent)
                                                                    │
                                                                    ▼
                                              state.yaml.baseline_fingerprints  (no assumptions entry)

sdd-archive ──success (envelope: copy-inventory list; NO "moved"/delete) ──► ORCHESTRATOR
   (Step 2 sync, Step 3 report, Step 5 copy-only)                              │ gate-archive-quality.md
                                                                               ▼ Post-Return Move Completion
                                              recursive diff dest vs source (path + content)
                                                          │ match                 │ mismatch/copy-fail
                                                          ▼                        ▼
                                              delete source dir           HALT, source intact, surface to user
                                              (the only true "move")       (no delete, route not closed)
```

The executor's reported copy-inventory is the STARTING manifest only; the
orchestrator re-verifies against the actual filesystem (trust-but-verify, re-runnable
diff) before any deletion.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `skills/_shared/gate-archive-quality.md` | Modify | Append `## Post-Return Move Completion`: recursive dest-vs-source inventory diff (path+content) using executor manifest as starting point; delete source only on full match; halt-with-source-intact on any mismatch/copy failure; executor never deletes/self-certifies. |
| `skills/sdd-archive/SKILL.md` | Modify | Rewrite Step 5 (~lines 200-213): executor syncs (Step 2) + reports (Step 3) + copies artifacts to destination + reports a copy-inventory list in its envelope; MUST NOT delete the source or claim "moved"/"complete". Remove the "then delete the source folder" instruction. |
| `skills/sdd-spec/SKILL.md` | Modify | Rewrite Step 5b: declare each delta domain under `touched_baseline_domains` in the return envelope; MUST NOT compute/write SHA-256 or touch `state.yaml.baseline_fingerprints`. |
| `agents/sdd-orchestrator.agent.md` | Modify | Add ~6-line standing "Baseline Fingerprint Computation" block near the Assumption Ledger Protocol. No new pointer row (archive move reuses the existing `gate-archive-quality.md` pointer). |
| `skills/_shared/gate-change-collision.md` | Modify | Consistency: update the "Baseline fingerprint at archive" companion section (~lines 87-105) so `sdd-spec` DECLARES and the orchestrator COMPUTES (currently says "`sdd-spec` records"). |
| `scripts/archive-move-fingerprint-contract.test.js` | Create | Static contract test: archive-move anchors (gate-archive-quality.md + sdd-archive SKILL) and fingerprint-ownership anchors (orchestrator + sdd-spec SKILL). |
| `scripts/configure/real-repo.test.js` | Modify | Add sentinel rows for the new gate-archive-quality.md move-completion strings; assert those protocol strings are ABSENT from the orchestrator body; line guard <500 unchanged. |

Baseline `openspec/specs/skills/spec.md` §14 and `openspec/specs/agents/spec.md`
are updated by the delta at ARCHIVE time (via the change-local specs), NOT edited
during apply.

## Interfaces / Contracts

Return-envelope additions (prose fields, no schema change to `result-envelope.js`):
- `sdd-spec` → `touched_baseline_domains: [domain, …]` (declare-only).
- `sdd-archive` → a copy-inventory list of files copied to the destination.

Load-bearing sentinel strings (verbatim, tested):
- gate-archive-quality.md: `recursively diff the destination`, `halt with the source directory left intact`.
- sdd-archive/SKILL.md Step 5: `copy inventory`, `MUST NOT` … `delete the source`, `never claim` … `moved`.
- sdd-spec/SKILL.md Step 5b + orchestrator: `touched_baseline_domains`, `declares` … `orchestrator computes`.

## Testing Strategy (strict TDD — RED first)

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Static contract | sdd-archive Step 5 copy-and-report (executor never deletes/claims moved; reports inventory) | New test asserts presence of copy-inventory + MUST-NOT strings and ABSENCE of a "delete the source folder" instruction in SKILL.md |
| Static contract | Orchestrator-owned move completion strings present in gate-archive-quality.md | New test asserts verification-before-delete + halt-with-source-intact strings |
| Static contract | Fingerprint ownership: sdd-spec declares only; orchestrator computes; no per-change assumption | New test asserts declare-only strings in sdd-spec SKILL + standing block in orchestrator |
| Repo integrity | Move-completion protocol NOT re-inlined in orchestrator body; body <500 lines; new sentinels resolve | Extend `real-repo.test.js` sentinel table + absence assertions |

RED-first order:
1. Write `scripts/archive-move-fingerprint-contract.test.js` → **RED** (SKILL still
   says "delete the source folder"; gate-archive-quality lacks move-completion;
   sdd-spec still computes hashes).
2. Add sentinel/absence rows to `real-repo.test.js` → **RED** (new
   gate-archive-quality strings absent).
3. Implement edits (gate-archive-quality append → sdd-archive Step 5 → sdd-spec
   Step 5b → orchestrator standing block → gate-change-collision consistency) →
   **GREEN**, all 4 dist targets green via the `skills/` walk.

## Migration / Rollout

No migration. Single PR, prompts/specs/tests only; `exception-ok` delivery strategy
already recorded (appr-002). Rollback = revert the merge commit.

## Estimated Size / Risk

~140-170 changed lines (test file ~70; gate-archive-quality ~35; SKILL edits ~15;
orchestrator ~6; gate-change-collision ~5; real-repo test ~8). Risk: low-medium —
no runtime code; main risks are the 500-line guard (mitigated: only ~6 inline
lines, ~498 total) and sentinel drift (mitigated by exact-string anchors).

## Open Questions

- None. Clarify fast-path resolved inventory-match semantics (path + content),
  recovery (re-runnable filesystem diff; executor list = starting manifest), and
  new-domain null handling.
