# Design: Strict TDD Evidence Remediation Fast Path

## Technical Approach

Use `scripts/lib/strict-tdd-evidence-remediation.js` as the authority for normalization, classification, identity, budgets, and transitions. `apply-progress.md` carries one parseable `json:strict-tdd-evidence` record plus the existing table as its deterministic rendering. Only drift from a complete, verifiable record is repairable; missing, malformed, or unverifiable records remain CRITICAL.

Working-tree provenance is preserved as `legacy-unverifiable` and is never
promoted to live proof. Classification freezes an external reconciled receipt,
safe authorized change name, candidate, test digest and command; write and focal
boundaries recheck that frozen receipt and the exact real artifact path.
The frozen authorization stores both real root and evidence paths; malformed list fields normalize to deterministic invalid records.

The orchestrator remains the I/O adapter. `sdd-apply` reclassifies a representation-only finding, freezes the original finding/candidate, replaces only the evidence section, and proves before/after identity equality. The orchestrator then invokes `sdd-verify` once in focal mode. Any material delta, mismatch, budget breach, or failed recheck preserves the original failure and returns to ordinary routing. O6A receipts, archive finalization, reviewers, and adaptive routing are excluded.

The approved scope extension makes the checked-in `models.yaml` mapping intentional policy. The existing parser and fail-soft `resolveModel`/target transforms remain the generation path, while a pure policy validator and real-repository parity suite pin the complete SDD partition, unchanged reviewer/default assignments, target-specific model columns, and exact Codex model/effort pairs. Missing target columns still omit model fields; they do not invent fallbacks.

## Requirement Allocation

| Spec scenario | Design allocation |
|---|---|
| `REQ-agents-012`: equivalent gap repaired | Freeze identity/finding, replace only the rendering, then focal-recheck it. |
| `REQ-agents-012`: missing/fabricated evidence | Record validator returns CRITICAL `ordinary-routing`; no repair payload is produced. |
| `REQ-agents-012`: functional delta/identity drift | Exact allowlist and before/after digest reject the fast path. |
| `REQ-agents-012`: focal failure | One-shot failure returns ordinary routing with the original finding. |
| `REQ-agents-012`: routing/cost guards | Unit/parity tests cover classification, scope, lines, and rechecks. |
| `REQ-routing-006`: equivalent drift | Canonical inputs produce the same `evidence-format-gap` decision and candidate ID. |
| `REQ-routing-006`: functional/task failure | Preserve the ordinary origin; never upgrade it. |
| `REQ-routing-006`: mismatch/unauthorized write | Reject identity drift or changes outside the allowlist. |
| `REQ-routing-006`: missing/fabricated record | Preserve CRITICAL; never emit `evidence-format-gap`. |
| `REQ-routing-006`: repeated/oversized repair | Permit one bounded write and one focal recheck. |
| `REQ-skills-008`: valid structured record | Validate task/test, cycle markers, provenance, and snapshot. |
| `REQ-skills-008`: missing/fabricated record | Apply/verify instructions prohibit synthesis and require ordinary remediation. |
| `REQ-skills-008`: immutable allowlist/identity | Store exact path/section, genesis paths, and candidate ID. |
| `REQ-skills-008`: bounded focal recheck | Check frozen state/candidate and consume the sole recheck. |
| `REQ-skills-008`: boundary tests | Triangulate all success, material, tamper, and budget cases. |
| `REQ-generator-005`: complete partition | Parse `models.yaml`; validate all 17 SDD agents exactly once against the approved 5/6/6 tier sets. |
| `REQ-generator-005`: proposal premium | Generate `sdd-propose` from each supported premium column; assert Codex Sol/medium. |
| `REQ-generator-005`: Codex default | Assert every generated default SDD TOML uses Terra/medium. |
| `REQ-generator-005`: Codex cheap | Assert generated cheap SDD TOML uses Luna/low, including the four named agents. |
| `REQ-generator-005`: stale prior tier | Mutate proposal/document to default and require validator plus parity failure. |
| `REQ-generator-005`: model-capable parity | Resolve every generated SDD agent from Claude, VS Code, OpenCode, and Codex tier columns. |
| `REQ-generator-005`: absent model column | Assert GitHub Copilot agents omit model fields and `resolveModel` returns `OMIT`. |
| `REQ-sdd-document-001`: command route | Preserve the command/orchestrator routing assertion in `scripts/sdd-document.test.js`. |
| `REQ-sdd-document-001`: cheap tier | Replace the stale default assertion with cheap source/output assertions. |
| `REQ-sdd-document-001`: tools | Preserve the exact read/search/edit/execute frontmatter assertion. |

## Architecture Decisions

### Decision: Make structured JSON authoritative and Markdown derived

**Choice**: Add exactly one `json:strict-tdd-evidence` block to `apply-progress.md` containing task/test references, cycle statuses, provenance, and functional snapshot. Render the existing table canonically from it. A valid record plus noncanonical table is a representation gap; a missing/invalid record is not repairable.

**Alternatives considered**: Parse the Markdown table as authority; repair malformed JSON heuristically; infer missing provenance from current tests.

**Rationale**: Markdown markers cannot distinguish equivalent drift from fabricated evidence. Strict JSON is reproducible and retains the readable report. See `decisions/adr-001.md`.

### Decision: Use an independent pure remediation reducer with frozen identity

**Choice**: The helper owns schema-v1 `strict_tdd_evidence_remediation` state with immutable original finding, candidate/genesis paths, exact allowlist, and budget. Candidate identity hashes base tree plus sorted non-evidence paths/content digests; `apply-progress.md` is excluded from identity but guarded at section level.

**Alternatives considered**: Reuse `review-lineage.js`; compare the whole Git tree; keep identity only in prose.

**Rationale**: Whole-tree identity changes with evidence, while review lineage owns unrelated reviewer semantics. A namespaced reducer avoids coupling O4.2 to 4R/O6A. See `decisions/adr-002.md`.

### Decision: Focal verify is a one-shot continuation, not a new route

**Choice**: Only `run-focal-recheck` permits a focal `sdd-verify`. It revalidates candidate, record, rendering, original finding, and referenced tests; then merges the result into report/state. Pass resumes the prior result; failure returns `ordinary-routing`.

**Alternatives considered**: Redispatch the full apply/verify route; let apply invoke verify; retry focal checks.

**Rationale**: Executor boundaries prohibit nested dispatch; one persisted transition avoids the full rerun and cannot loop.

### Decision: Validate `models.yaml` as policy without hardwiring target fallbacks

**Choice**: Keep `models.yaml` as the generation source. Extend `parseModels` to reject duplicate keys, add a pure exact-partition/Codex-contract validator beside `resolveModel`, and run it in a real-source contract suite before five-target parity. The generic transform still consumes declared columns and omits a model when the selected target has none. Reviewer tiers and `_default` are pinned unchanged.

**Alternatives considered**: Encode tiers in target profiles; make every target column mandatory; update only stale assertions; enforce the full roster on minimal generator fixtures.

**Rationale**: Profiles should describe target capabilities, not agent policy. This keeps one runtime mapping, detects stale/incomplete/duplicate assignments, and preserves intentional fail-soft behavior for GitHub Copilot and special orchestrator emissions. See `decisions/adr-003.md`.

## Data Flow

```text
regular sdd-verify finds marker drift
              |
              v
orchestrator preserves original finding/origin
              |
              v
sdd-apply -> extract/validate JSON -> classify + freeze candidate
              | invalid/material/over budget
              +---------------------------> ordinary origin-priority routing
              |
              v evidence-format-gap
generated section replacement -> allowlist check -> write apply-progress
              |
              v
recompute functional identity == frozen identity?
              | no
              +---------------------------> ordinary routing
              |
              v yes
orchestrator dispatches one focal sdd-verify
              | pass                         | fail/drift
              v                              v
resolve original representation finding  ordinary routing
```

Persist state before each write/dispatch. Reconcile an unknown write from artifact/digests or fall back; never replay it blindly.

```text
models.yaml bytes -> parseModels() --duplicate--> contract failure
                         |
                         v
              validateSddModelPolicy()
                 | stale/missing/wrong Codex pair
                 +---------------------------> contract failure; no parity pass
                         |
                         v
                 transform(profile, models)
       claude / vscode / opencode / codex       github-copilot
                    |                                  |
                    v                                  v
          declared tier model fields             omit model (fail-soft)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/strict-tdd-evidence-remediation.js` | Create | Pure validator, identity, reducer, invariants, and action. |
| `scripts/strict-tdd-evidence-remediation.test.js`, `scripts/strict-tdd-evidence-parity.test.js` | Create | State/routing tests plus five-target runtime and mutation parity. |
| `scripts/configure/cli.js` | Modify | Ship the helper as a runtime BFS root. |
| `skills/sdd-apply/{SKILL.md,strict-tdd.md}` | Modify | Define record, focal mode, legal writes, provenance, and fallback. |
| `skills/sdd-verify/{SKILL.md,strict-tdd-verify.md}` | Modify | Validate evidence/tests and define one-shot focal mode. |
| `agents/sdd-{orchestrator,apply,verify}.agent.md` | Modify | Add recovery, authorized repair, focal recheck, and fallback. |
| `rules/sdd-{strict-tdd,common,openspec}.instructions.md` | Modify | Synchronize bundled TDD, routing, and state contracts. |
| `skills/sdd-init/references/init-details.md` | Modify | Document the optional line cap and fail-closed absence semantics. |
| `openspec/config.yaml` | Modify | Set `rules.verify.strict_tdd_evidence_remediation_max_changed_lines: 40` for this repository. |
| `openspec/specs/{agents,routing,skills}/spec.md` | Promote at archive | Merge change-local deltas only through `sdd-archive`. |
| `models.yaml` | Modify | Make the approved 17-agent partition and Codex Sol/medium, Terra/medium, Luna/low pairs explicit; correct stale comments. |
| `scripts/lib/model-resolver.js` | Modify | Export the exact SDD/reviewer policy validator while preserving `OMIT`. |
| `scripts/configure/cli.js` | Modify | Reject duplicate YAML keys without imposing unavailable target columns. |
| `scripts/lib/model-resolver.test.js`, `scripts/configure/cli.test.js` | Modify | Cover exact policy errors, missing tiers, duplicate keys, and fail-soft resolution. |
| `scripts/model-tier-contract.test.js` | Create | Validate the real mapping and all five generated targets, including moved-agent and Codex effort assertions. |
| `scripts/lib/target-transform.test.js` | Modify | Pin premium/default/cheap Codex objects and target-column omission behavior. |
| `scripts/sdd-document.test.js` | Modify | Change the expected tier to cheap; preserve route/tools checks and assert generated cheap models where supported. |
| `scripts/hooks/subagent-stop.test.js` | Modify | Assert telemetry resolves moved proposal/document tiers from the same source. |
| `openspec/specs/{generator,sdd-document}/spec.md` | Promote at archive | Merge the approved tier policy only during archive. |

## Interfaces / Contracts

```js
// json:strict-tdd-evidence (machine source of truth in apply-progress.md)
{
  schema_version: 1,
  change: "change-name",
  functional_snapshot: {
    projection: "strict-tdd-functional-v1",
    base_tree: "<stable id>",
    genesis_paths: ["scripts/lib/example.js", "scripts/example.test.js"],
    files: [{ path: "scripts/lib/example.js", digest: "sha256:..." }]
  },
  cycles: [{ task, test_file, layer, safety_net, red, green, triangulate, refactor, provenance }]
}

// state.yaml top-level audit, reducer-owned after classification
strict_tdd_evidence_remediation: {
  schema_version: 1,
  revision: 0,
  status: "classified" | "repair-pending" | "recheck-pending" | "resolved" | "ordinary-routing",
  classification: "evidence-format-gap",
  original_finding: { id, severity: "CRITICAL", origin, digest },
  candidate: { id: "sha256:...", projection, genesis_paths },
  evidence: { path, section, before_digest, repaired_digest },
  budget: { max_changed_lines, used_changed_lines, max_focal_rechecks: 1, focal_rechecks_used },
  reason_code: "equivalent-representation-drift" | "...deterministic fallback code...",
  recheck: null | { outcome: "pass" | "fail", result_digest }
}
```

`max_changed_lines` comes from `rules.verify.strict_tdd_evidence_remediation_max_changed_lines` and cannot exceed 40; absent/invalid configuration disables the fast path. Phase envelopes remain unchanged: persisted `next_action` drives dispatch, so no new enum is introduced. Existing origin priority remains authoritative for material failures.

```js
const SDD_AGENT_TIERS = {
  premium: ["sdd-propose", "sdd-design", "sdd-verify", "sdd-foundation", "sdd-workspace"],
  default: ["sdd-orchestrator", "sdd-spec", "sdd-clarify", "sdd-apply", "sdd-reconcile", "sdd-baseline"],
  cheap: ["sdd-init", "sdd-explore", "sdd-tasks", "sdd-archive", "sdd-onboard", "sdd-document"]
};

const CODEX_TIER_POLICY = {
  premium: { model: "gpt-5.6-sol", model_reasoning_effort: "medium" },
  default: { model: "gpt-5.6-terra", model_reasoning_effort: "medium" },
  cheap: { model: "gpt-5.6-luna", model_reasoning_effort: "low" }
};

validateSddModelPolicy(models)
// -> { valid: boolean, errors: [{ code, agent?, expected?, actual? }] }
```

Validation checks exact SDD membership, known tier names, Codex pairs, six review agents plus `_default` remaining `default`, and produces stable agent-specific errors. `parseModels` rejects a repeated key before object overwrite can hide it. `resolveModel` remains fail-soft for absent target columns. Special orchestrator outputs that do not support per-agent model fields are treated like unsupported columns, not mismatches.

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit | Schema/provenance, rendering/digests, paths, immutable fields, transitions | Frozen/repeated inputs and malformed/fabricated cases. |
| Routing/reducer | Equivalent/material inputs, origin, unauthorized deltas, identity, recovery, budget | Transition tests assert exact state/reason codes. |
| Agent contract | Apply writes evidence section only; focal verify reads frozen state; CRITICAL and ordinary fallback language remains mandatory | Static contract assertions over agent/skill/rule sources. |
| Generated parity | Helper shipping and identical contracts across Claude, VS Code, GitHub Copilot, OpenCode, and Codex | Generated-tree probe plus isolated mutants for allowlist, identity, line cap, and recheck cap. |
| Model policy | Exact 5/6/6 SDD partition, unchanged reviewers/default, stale/missing/duplicate assignments | Pure validator and parser mutation tests. |
| Model generation | Tier-column parity for all five targets; Codex model/effort pairs; GitHub fail-soft omission | Generate from repository root into temporary directories and inspect every supported agent output. |
| Document regression | Cheap tier plus unchanged command route and tools | Update focused `scripts/sdd-document.test.js` assertions. |
| Regression | Existing Strict TDD, route dispatch, 4R lineage, and full repository checks | Focused Node tests followed by `npm test`; no changes to review-lineage behavior. |

## Migration / Rollout

No archive or baseline-state migration is performed. New apply runs emit both JSON and the derived table. Active legacy evidence follows ordinary remediation rather than silent synthesis.

The tier change is source/config migration only: update `models.yaml` and tests, generate all five targets into temporary test directories, and do not commit or refresh ignored `dist/**`. Minimal configure fixtures/goldens remain synthetic parser/transform coverage and are not expanded into a second canonical roster. Rollback restores the prior mapping/comments and contract expectations together; fail-soft target omission remains unchanged.

## Open Questions

None.
