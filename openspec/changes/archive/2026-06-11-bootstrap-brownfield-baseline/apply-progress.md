# Apply Progress: Bootstrap Brownfield Baseline

## Batch 1 (2026-06-10)

### Work Unit A — JS Runtime (TDD)

**Tasks covered**: 1.1, 1.2, 2.1, 2.2
**Status**: done

**Evidence**:
```
node --test "scripts/**/*.test.js"
tests 50 | pass 50 | fail 0 | duration_ms ~175
```

RED → GREEN cycle confirmed:
- Task 1.1 (RED): 8 new tests added for `readBaselineState`; all 8 failed with `TypeError: readBaselineState is not a function`.
- Task 1.2 (GREEN): `readBaselineState(configContent)` implemented in `scripts/lib/ospec-state.js`; all 8 tests pass.
- Task 2.1 (RED): 5 new tests added for baseline hint in `runSessionStart`; 3 failed (hint assertions), 2 already passed (no-hint boundaries).
- Task 2.2 (GREEN): `buildBaselineHint` + config-read logic added to `scripts/hooks/session-start.js`; all 5 tests pass.

**Files touched**:
- `scripts/lib/ospec-state.js` — added `readBaselineState`, `BASELINE_LIST_KEYS`, `BASELINE_SCALAR_KEYS`, `BASELINE_TOP_KEY`, `BASELINE_FIELD_INDENT`, `BASELINE_LIST_ITEM_INDENT` constants; exported `readBaselineState`
- `scripts/lib/ospec-state.test.js` — added `readBaselineState` import + 8 unit tests
- `scripts/hooks/session-start.js` — imported `readBaselineState`; added `buildBaselineHint`; updated `runSessionStart` to read config, build hint, and include `baseline` in result when non-null
- `scripts/hooks/session-start.test.js` — extended `createFixture` with `configContent` param; added `baselineConfig` helper + 5 integration tests

**Deviations**: None. Implementation mirrors `readStatus` pattern exactly as designed.

---

### Work Unit B — New Markdown Trio: agent + skill + command

**Tasks covered**: 3.1, 3.2, 3.3
**Status**: done

**Evidence**: Self-review against sdd-baseline spec and design. All required elements present:
- `agents/sdd-baseline.agent.md`: executor boundary, required skill paths, result contract with `partial`/`blocked` semantics.
- `skills/sdd-baseline/SKILL.md`: activation contract, hard rules (skip rule, append-first, completion-only writes), batch-0 protocol, per-domain protocol, manifest/index formats, output contract.
- `commands/sdd-baseline.prompt.md`: YAML frontmatter with `agent: sdd-orchestrator`, `argument-hint`, routing prompt, `${input}` passthrough.

**Files touched**:
- `agents/sdd-baseline.agent.md` — created
- `skills/sdd-baseline/SKILL.md` — created
- `commands/sdd-baseline.prompt.md` — created

**Deviations**: None. All three files mirror the sdd-foundation trio pattern.

---

### Work Unit C — Modified Prompt/Markdown Surfaces

**Tasks covered**: 4.1, 4.2, 4.3, 4.4
**Status**: done

**Evidence**: Self-review against sdd-init spec, sdd-orchestrator spec, design.

- `skills/sdd-init/SKILL.md`: brownfield branch added to Decision Gates and Execution Steps (step 7). Conditions match spec: existing code + empty specs + no baseline block → write block; re-init preserves existing block; `done` → no re-activation.
- `skills/sdd-init/references/init-details.md`: Brownfield Detection Checklist added at top, before Testing Capability Checklist. Lists condition 1 (code files), condition 2 (empty specs), and exclusions.
- `agents/sdd-orchestrator.agent.md`: Baseline Advisory section inserted between Init Guard and Foundation Guard. Covers all 4 mandatory points. Routes only on explicit consent. `sdd-baseline` added to `agents` frontmatter list.
- `skills/_shared/openspec-convention.md`: Two `sdd-baseline` rows added to Artifact File Paths table. Spec ownership rule paragraph added below the table.

**Files touched**:
- `skills/sdd-init/SKILL.md`
- `skills/sdd-init/references/init-details.md`
- `agents/sdd-orchestrator.agent.md`
- `skills/_shared/openspec-convention.md`

**Deviations**: None.

---

### Work Unit D — Documentation

**Tasks covered**: 5.1, 5.2
**Status**: done

**Evidence**: Self-review against spec requirements.

- `docs/sdd-workflows.md`: Section 12 "Baseline para repos brownfield" added with batch-0 flow, per-domain flow, resume flow, staleness/refresh flow, skip rule, and advisory cross-reference.
- `README.md`: `/sdd-baseline` row inserted in the command reference table between `/sdd-init` and `/sdd-new`.

**Files touched**:
- `docs/sdd-workflows.md`
- `README.md`

**Deviations**: None.
