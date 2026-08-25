# Apply Progress: harden-sdd-document-contract

**Mode**: Focused TDD
**Delivery**: size:exception (delivery-001)
**Working branch**: `docs/english-docs-wiki-remediation`
**Batch**: 1 (single work unit, tasks 1.1–7.2)

## Batch 1

### Phase 1 RED — Static contract tests

- [x] 1.1 L1 assertions added to `scripts/sdd-document.test.js` (schema regex 6.4→6.6; Step 5b canonicity; Update Mode re-discovery/volatiles/no-op; Steps 6.4–6.6; Step 7 checklist + no self-certify)
- [x] 1.2 L1 assertions for `route-document.md` §4 Step 6.6 + §7 J6
- [x] 1.3 J5 matcher tightened to stop at `#### 7.`; J6 RED assertion added in `scripts/starlight-web-doc-contract.test.js`
- [x] 1.4 Confirm RED: `node --test scripts/sdd-document.test.js scripts/starlight-web-doc-contract.test.js` — 10 new assertions failed as intended; 32 pre-existing tests passed (42 total, 10 fail / 32 pass)

### Phase 2–4 GREEN — SKILL, route handler, ripple

- [x] 2.1–2.7 `skills/sdd-document/SKILL.md`: Step 5b canonicity map + coverage proposals; Update Mode re-discovery / volatile re-verify / no-op ONLY `updatedAt`+`gitHead`; new Steps 6.4 checklist and 6.5 factual pass; metadata moved to 6.6 with complete `sections` and object `filesSkipped`; 6.7 root instructions; 6.8 cleanup deletes `_plan.md`; Step 7 mechanical `checklist` + REQ-022 no self-certify
- [x] 3.1–3.2 `skills/_shared/route-document.md`: §4 Step 6.6; new §7 J6 with `gates.content-qa`, distinct reviewer, two-option halt (re-dispatch default), inconclusive policy mirroring J5
- [x] 4.1–4.2 `option-d-starlight.md` Step 6.4→6.6 (two refs). Grep of live sources: no remaining stale metadata refs (archives and this change's tasks/design left untouched)

### Phase 5 L2 — in-test helpers (ADR-002)

- [x] 5.1 Helpers in `scripts/sdd-document.test.js` only: `countSubstantiveLines`, `evaluateLinkGraph`, `detectFlowMermaid`, `validateMermaidHeuristic`, `validateLastUpdateSchema` (no `scripts/lib/document-checklist.js`)
- [x] 5.2 Fixtures: valid mini-wiki; thin page; orphan; flow without Mermaid; unquoted Mermaid special chars; partial `sections` / numeric `filesSkipped`
- [x] 5.3 `node --test scripts/sdd-document.test.js` — 33/33 pass (L1 + L2)

### Phase 6 Integration

- [x] 6.1 `npm test` — Native Node tests 2588 pass / 0 fail / 2 skipped; generate+validate vscode, github-copilot, opencode, codex, cursor, antigravity; claude generated without CLI validator. "All checks passed."
- [x] 6.2 Consistency: Step 5b `category: flow` is the Mermaid oracle; Update Mode no-op vs volatile-drift (degrade to surgical edit) do not contradict Step 6.5; J6 halt uses the same two-option `question_gate` shape as J5 (default recommended vs accepted risk); envelope `checklist` is mechanical-only and Step 7 forbids content-quality self-certification (REQ-022)
- [x] 6.3 Dist bundles skipped: `dist/` is in `.gitignore` (install-time only). `npm test` already generated targets into temp dirs via `check.js`. Did not run `npm run build:vscode` or siblings against a committed `dist/`.

### Phase 7 Handoff

- [x] 7.1 All 22 tasks marked `[x]` in `tasks.md`. Focused TDD (not Strict TDD): RED batch then GREEN batch; no formal Strict TDD evidence table.
- [x] 7.2 Single work unit under `size:exception` (delivery-001). Ready for `sdd-verify`.

### Focused TDD batches

| Batch | Layer | RED | GREEN | Notes |
| ----- | ----- | --- | ----- | ----- |
| L1 static contract | `sdd-document.test.js` + `starlight-web-doc-contract.test.js` | 10 new asserts failed; 32 pre-existing passed | Same files after SKILL/route/ripple GREEN: 42/42 | Regex `### Step 6.4:` → `### Step 6.6:`; J5 matcher stops at `#### 7.` |
| L2 executable helpers | in-test helpers + `tmpOut` fixtures | Helpers+fixtures added in one focused cycle | 33/33 including 6 L2 cases | ADR-002: no runtime library; no new golden eval (sdd-design-003) |

### Files changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/sdd-document.test.js` | Modified | L1 contract asserts + L2 helpers/fixtures |
| `scripts/starlight-web-doc-contract.test.js` | Modified | J5 matcher bound; J6 RED/GREEN assert |
| `skills/sdd-document/SKILL.md` | Modified | P1–P6 executor contract (5b, Update Mode, 6.4–6.8, Step 7) |
| `skills/_shared/route-document.md` | Modified | §4 Step 6.6; new §7 J6 |
| `skills/sdd-document/references/option-d-starlight.md` | Modified | Two Step 6.4→6.6 ripples |
| `openspec/changes/harden-sdd-document-contract/tasks.md` | Modified | All 22 tasks `[x]` |
| `openspec/changes/harden-sdd-document-contract/apply-progress.md` | Created | This file |

### Workload

- Mode: size:exception (delivery-001, user-approved)
- Current work unit: Full contract hardening (tasks 1.1–7.2)
- Live diff (tracked sources): 581 insertions / 28 deletions (~609 changed lines) — within tasks forecast ~480–620 and below the ~650 escalation cap
- `openwiki/` not touched (sdd-propose-002)

### Deviations from Design

None — implementation matches design.md. Dist regeneration skipped because `dist/` is gitignored (documented under 6.3).

### Issues Found

None.
