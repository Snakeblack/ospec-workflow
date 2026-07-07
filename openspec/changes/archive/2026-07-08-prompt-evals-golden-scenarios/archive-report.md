# Archive Report: prompt-evals-golden-scenarios

**Change**: prompt-evals-golden-scenarios  
**Capability**: orchestrator-evals (NEW baseline domain)  
**Route**: standard  
**Status**: ARCHIVED  
**Archive Date**: 2026-07-08

## Summary

Successfully archived the orchestrator-evals capability — a golden-scenario eval suite
validating the orchestrator's routing, gates, and blocking behavior end-to-end against
fixture repos. The suite provides objective, model-agnostic evidence (structural assertions
only, never prose) to gate `models.yaml` version bumps pre-release.

**Verdict**: PASS WITH WARNINGS (post-remediation re-verify). No baseline domain touched
by this change (new capability only); the change-local spec has been promoted to
`openspec/specs/orchestrator-evals/spec.md` as a new baseline domain, and
`orchestrator-evals` added to `baseline.domains_done` in `openspec/config.yaml`.

## 4R Review Gate Summary

The 4R review gate found **1 CRITICAL + 7 WARNING + 2 SUGGESTION** (10 total findings).
Per `state.yaml` approval-001, the user approved remediating the CRITICAL plus 2 most
impactful WARNINGs before archive; the remaining 5 WARNINGs + 2 SUGGESTIONs are
documented as follow-up debt.

### Remediated (3 items, all closed)

1. **CRITICAL**: Half-materialized workspace silently reused on partial apply/git-baseline
   failure
   - **Fix**: Introduced `.eval-capture/materialized.json` completion marker in
     `fixtures.js` (`markMaterialized`/`isMaterialized`). `run.js` gates reuse on
     marker presence; workspace without marker falls through to full rebuild.
   - **Evidence**: 5 new RED→GREEN unit tests in `fixtures.test.js` (manual integration
     verified: corrupted workspace correctly rebuilt).
   - **Status**: CLOSED. No new CRITICAL introduced by the fix.

2. **WARNING**: `document-update-noop` fixture's `expect` block too weak to detect new
   output files
   - **Fix**: Added `checkFileTreeUnchanged` + `baselineFileTree` to `assertions.js`,
     wired into `assertScenario`. Updated `document-update-noop/scenario.json` with
     the fixture's 7-file baseline tree.
   - **Evidence**: 6 new RED→GREEN unit tests in `assertions.test.js` (manual verified:
     old proxy missed simulated regression, new check catches it).
   - **Caveat**: Detects new files but not in-place content rewrites of existing files
     (noted in README Caveats as follow-up debt).
   - **Status**: CLOSED.

3. **WARNING**: `GIT-BASELINE.json` path traversal defense-in-depth
   - **Fix**: Added `resolveContainedPath(workspaceRoot, relPath)` to `run.js`, used at
     both `applyGitBaseline` path-consuming sites. Throws on `../..` traversal or
     absolute-path-shaped `relPath`.
   - **Evidence**: Manual RED→GREEN (run.js excluded from `*.test.js` per ADR-004):
     confirmed pre-fix traversal escape, post-fix safe paths resolve correctly.
   - **Status**: CLOSED.

### Side-fix discovered during remediation (1 item, non-blocking)

- **Issue**: Writing `.eval-capture/materialized.json` after `applyGitBaseline`'s
  baseline commit would show as untracked inside the fixture's nested git repo,
  triggering a false-positive on `document-update-noop`'s J5 sandbox check.
- **Fix**: `applyGitBaseline` now writes+commits `.gitignore (.eval-capture/)` before
  baseline commit, so the harness's own completion-marker directory never shows as
  untracked inside the fixture.
- **Evidence**: Manual verification: `git status --porcelain` in refreshly-set-up
  `document-update-noop` workspace now empty; sandbox-violation fixture still shows
  exactly `src/leaked-notes.txt` untracked (unchanged).
- **Status**: CLOSED.

### Follow-Up Debt (7 items, deferred per user approval)

These 7 items remain open and are documented here to prevent silent loss:

1. **WARNING-2**: `capture.js`/`parseYamlLite` parser ships with zero automated test
   coverage in CI. On the critical path of every scenario assertion; a parse bug would
   silently mis-populate captured state and produce false PASS/FAIL verdicts.
   - **Mitigation**: Exercised manually via end-to-end fixture runs; scope: test all
     YAML shapes the fixtures emit (nested `route:`/`phases:` maps, `blocking_questions`
     list, quoted timestamps).
   - **Reversibility**: High; isolated unit test file with no integration coupling.

2. **WARNING (from first verify)**: Residual content-rewrite limitation (not detected by
   `fileTreeUnchanged` — would need per-file hashing).
   - **Workaround**: Documented in `scripts/evals/README.md` Caveats.
   - **Reversibility**: High; feature addition, no breaking change.

3. **SUGGESTION-1**: `high-risk-clarify-route` scenario asserts route-name proxy, not
   clarify-gate membership directly.
   - **Rationale**: `routing.yaml` is versioned static config; defensible.
   - **Future improvement**: Assertion surface for gate membership would tie scenario
     directly to spec clause.
   - **Reversibility**: High; structural.

4. **SUGGESTION-2**: Consider assertion surface for gate membership more generally, so
   scenarios can assert "route X includes gate Y" structurally.
   - **Scope**: Framework enhancement, not in scope of 2.1.
   - **Reversibility**: High; additive to matcher API.

5. **WARNING (structural minor)**: Document-update-noop scenario caveat: file-set
   assertion doesn't catch in-place content rewrites of existing files.
   - **Status**: Documented in README + test case notes.
   - **Future**: Per-file content hashing (larger change).

6. **WARNING (operational)**: Evals are manual/local in 2.1; headless/CI infrastructure
   deferred to roadmap 2.2/B4.
   - **Mitigation**: README documents manual runner command; pre-bump gate is discoverable
     in `models.yaml` header comment.
   - **Future**: B4 adds GitHub Action + non-interactive CLI subset.

7. **WARNING (assumption unresolved)**: Five assumption entries remain `status:
   unresolved` with `reversibility: high` per state.yaml (ADR decisions on internal
   conventions: GIT-BASELINE.json marker, done.json completion signal, run.js glob
   exclusion, seeded-trigger fixtures, live-invocation model).
   - **Rationale**: All are non-material, fully documented, easily reversible.
   - **No escalation**: Per Verify Decision Gates, unresolved high-reversibility entries
     require no blocking action.

## Spec Promotion and Baseline Update

- **New baseline domain**: `orchestrator-evals`
- **Spec promoted to**: `openspec/specs/orchestrator-evals/spec.md`
- **Config update**: Added `orchestrator-evals` to `baseline.domains_done` in
  `openspec/config.yaml`
- **No existing domain touched** (`touched_baseline_domains: []` in state.yaml)

## ADRs Promoted to Project Memory

Four ADRs promoted to `docs/adr/` with status `accepted`:

| ADR | Title | File |
|-----|-------|------|
| ADR-001 | Agent-assisted harness instead of self-driving Node runner | `adr-20260708-001-agent-assisted-harness-not-self-driving-runner.md` |
| ADR-002 | `.eval-capture/` side-channel for interactive gate/envelope capture | `adr-20260708-002-eval-capture-side-channel-for-interactive-gates.md` |
| ADR-003 | Seeded-trigger fixtures with a `scenario.json` manifest | `adr-20260708-003-seeded-trigger-fixtures-with-scenario-manifest.md` |
| ADR-004 | Declarative structural matcher, evals excluded from `npm test` | `adr-20260708-004-declarative-structural-matcher-evals-excluded-from-npm-test.md` |

All change-local copies under `openspec/changes/archive/2026-07-08-prompt-evals-golden-scenarios/decisions/` remain as audit trail.

## Roadmap Update

Marked roadmap item "2.1 E2: evals de prompts" as COMPLETE in
`analisis-fino/roadmap-evolucion-harness.md`. Entry updated to `✅ COMPLETO sin release
aparte aún` with checkboxes marked done. Pointer moved to next item `▶ SIGUIENTE — 2.2
B4: modo headless / CI`.

## Cost Summary

Cost telemetry from `.ospec/session/prompt-evals-golden-scenarios/phase-costs.jsonl`:

**No per-phase cost data was recorded for this change** (session telemetry file absent
or empty).

Total user questions asked across all phases: 0 (from `state.yaml` `phases.*.questions_asked`).

Note: Cost metrics are optional and their absence does not gate archive per Strict TDD
protocol (ADR-REQ-agents-001).

## Artifacts Copied to Archive Destination

All change-folder artifacts copied to `openspec/changes/archive/2026-07-08-prompt-evals-golden-scenarios/`:

- `proposal.md`
- `design.md`
- `tasks.md`
- `apply-progress.md`
- `verify-report.md`
- `state.yaml`
- `specs/orchestrator-evals/spec.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `decisions/adr-004.md`

## Next Steps

- **Orchestrator**: Verify copy inventory against destination, then delete source folder
  `openspec/changes/prompt-evals-golden-scenarios/` once verified.
- **Follow-up work**: The 7 deferred items remain on the backlog for roadmap planning
  (capture.js testing, content-rewrite detection, gate membership assertions, headless
  CI integration).
- **Dependent on 2.1**: Roadmap 2.2/B4 (headless/CI mode) builds on this suite's
  structural assertion contract and driver protocol.

---

**Archive completed by**: sdd-archive executor  
**Timestamp**: 2026-07-08T12:00:00Z
