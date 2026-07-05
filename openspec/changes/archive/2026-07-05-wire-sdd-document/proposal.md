# Proposal: Wire sdd-document into the Orchestrator (J1 + J4 + J5 + contract test)

## Intent

The `sdd-document` executor shipped in v2.16.0 (agent + skill + command + baseline spec with 13 REQs), but the orchestrator was never wired to it. `agents/sdd-orchestrator.agent.md` has zero mentions of `sdd-document`: it is absent from the `agents:` delegation allowlist, from the command roster, and from the Circumstantial Handler Pointer Table, and no route protocol builds the `doc_language`/`scope_choice`/`custom_path` parameters the skill expects. Per REQ-agents-003/004 and REQ-sdd-document-001, the orchestrator MUST route `/sdd-document` to the agent — today the feature is unreachable. This is a new instance of the "declared cross-file contract, no verification" class (I1) in the prompt layer.

## Scope

### In Scope
- **J1 (wiring)**: add `sdd-document` to the orchestrator frontmatter `agents:` allowlist; add a `/sdd-document` row to the command roster; add a Circumstantial Handler Pointer Table entry pointing to a NEW `skills/_shared/route-document.md`.
- **`skills/_shared/route-document.md`** (new handler): the full protocol — launch gates, answer persistence, executor relaunch with `doc_language`/`scope_choice`/`custom_path`, plus J4 and J5 behavior.
- **J4 (batched gate + memory)**: batch language + scope into ONE `question_gate` (two independent questions, single `vscode/askQuestions`); persist both answers in the wiki's `.last-update.json`; in update mode skip the gates when metadata already carries them (explicit parameter override allowed).
- **J5 (orchestrator-owned sandbox verification)**: post-run inventory check owned by the orchestrator — compare `git status` against the declared output dir, with declared exceptions `/AGENTS.md` and `/CLAUDE.md`. Never self-certified by the executor.
- **Contract test** (`scripts/`): every agent referenced by a command/prompt file exists in the `agents:` list of its router.

### Out of Scope
- J2 (runtime behavioral tests for the 13 REQs) and J3 (wiki lifecycle: archive-triggered update, staleness advisory, versioning, foundation-vs-wiki split) — deferred to E2/G5.
- Rewriting the executor's own gate logic beyond the batching/persistence contract in J4.
- Merging the `feat/sdd-documenter` branch (prerequisite, tracked separately).

## Capabilities

### New Capabilities
- None. All behavior is expressed as deltas to existing domains.

### Modified Capabilities
- `agents`: orchestrator `agents:` allowlist MUST include `sdd-document`; command roster (§3.2) already lists `/sdd-document` but the orchestrator body must gain the roster row and a pointer-table entry for `route-document.md` under §14/§15; the new `_shared/route-document.md` handler joins the §15 partition set and its dist-parity/trust-boundary requirements. Add a commands↔agents wiring requirement covering the contract test.
- `sdd-document`: J4 amends REQ-sdd-document-002 and -006 (single batched gate) and REQ-011 (`.last-update.json` gains `doc_language` + `scope_choice`, skip-in-update behavior); J5 moves the sandbox inventory verification (REQ-002 write-sandbox) to orchestrator ownership post-run.

## Approach

Follow the established `route-federation` / `route-brownfield` pattern: keep only minimal roster/pointer rows inline in the CORE body and place the entire protocol in `skills/_shared/route-document.md`. The handler is instruction-only prose (no frontmatter, no tool grants) per the §15 Shared Handler Trust Boundary. The orchestrator reads it once when `/sdd-document` fires, presents the single batched gate, persists answers to the approval ledger and to `.last-update.json`, relaunches the executor with resolved parameters, and runs the `git status` sandbox inventory check on return. The contract test statically parses every `commands/*.prompt.md` `agent:` target and asserts each referenced agent is reachable through its router's `agents:` list — generalizing the J1 defect class.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `agents/sdd-orchestrator.agent.md` | Modified | `agents:` allowlist + roster row + pointer-table row (inline minimal) |
| `skills/_shared/route-document.md` | New | Full document route protocol (gates, persistence, relaunch, J4, J5) |
| `skills/sdd-document/SKILL.md` | Modified | Batched gate + `.last-update.json` persistence + skip-in-update (J4) |
| `openspec/specs/agents/spec.md` | Modified | Wiring + partition/handler requirement, commands↔agents contract |
| `openspec/specs/sdd-document/spec.md` | Modified | J4/J5 requirement deltas |
| `scripts/*.test.js` | New/Modified | commands↔agents contract test; extend `real-repo.test.js` sentinel/pointer set for `route-document.md` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| <500-line orchestrator guard breaks (body is 491 lines; only ~9 lines headroom) | High | Keep inline additions to 3 rows; put ALL protocol in `_shared/route-document.md`; verify `real-repo.test.js` line count before commit |
| New handler not emitted to all four dist targets (§15 cross-target parity) | Med | Confirm `scripts/configure` copies `_shared/*.md`; add to dist-presence assertions |
| J5 `git status` false positives on pre-existing untracked files (e.g. current untracked `openwiki/`) | Med | Scope the diff to paths under the declared output dir plus the two declared exceptions only |
| J4 batched-gate change diverges executor from orchestrator expectations | Med | Specify the parameter contract in both `route-document.md` and the sdd-document spec delta |

## Rollback Plan

Revert the change commit(s): remove the three inline orchestrator rows, delete `skills/_shared/route-document.md`, revert the SKILL.md J4 edits, and drop the new contract test. Because `sdd-document` remains a self-contained executor, reverting the wiring returns the system to the current (unreachable-feature) state without affecting any other route.

## Dependencies

- Prerequisite: merge of the `feat/sdd-documenter` branch (executor is complete and verified; does not block planning).

## Success Criteria

- [ ] `/sdd-document` routes end-to-end: orchestrator delegates to `sdd-document` with resolved `doc_language`/`scope_choice`/`custom_path`.
- [ ] `sdd-document` appears in the orchestrator `agents:` allowlist, command roster, and pointer table; `real-repo.test.js` stays under 500 lines and its sentinel/pointer assertions pass for `route-document.md`.
- [ ] Language + scope are asked in ONE `question_gate`; both persist in `.last-update.json`; update mode skips the gate when metadata already carries them.
- [ ] Orchestrator runs the post-run sandbox inventory check (`git status` vs output dir + `/AGENTS.md`/`/CLAUDE.md` exceptions); executor never self-certifies.
- [ ] Contract test fails when a command/prompt references an agent missing from its router `agents:` list.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/wire-sdd-document main`; the recorded owner branch is already `feat/wire-sdd-document`).
