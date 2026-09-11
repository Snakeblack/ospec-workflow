# Review Judgment

Shared protocol for discovery specialists only: the four live quality domains and legacy 4R reviewers. `review-change` remains a residual router; `review-correction` follows its targeted validation contract instead. This file does not grant either agent discovery authority.

## Context and authority

Use injected Project Standards first, including applicable stack rules. Architectural proportionality and quality tradeoffs are defined only in [engineering-judgment.md](engineering-judgment.md): use its injected rules, or read that reference once when they are absent. Apply them within this review scope. Do not load unrelated skills or start design/apply workflows.

Review the supplied candidate, diff, permitted paths, and selected owner. Read referenced requirements, design decisions, caller contracts, and test evidence only as needed to establish behavior and assess a candidate finding. Context reads do not expand finding scope. Do not invent requirements, workloads, deployment assumptions, or approvals when context is absent.

Use `Read` and `Grep` only. You MUST NOT write, edit, delete, execute tests or scans, or delegate. Existing test/scan output is evidence only for the candidate and conditions it actually covers. Never claim to have run it. If essential scope or candidate evidence is unavailable, report the limitation through the existing return envelope; do not claim a completed clean review.

## Evidence before findings

For each candidate finding, establish:

1. **Trigger and trace:** identify a supported input, caller, failure sequence, or maintenance task and trace it through the changed behavior. Cite a precise path and line or snippet. A keyword, checklist match, or classifier signal is a reason to inspect, not proof of a defect.
2. **Consequence:** explain the violated contract or concrete quality cost and who or what is affected. Distinguish an observed defect from a conditional risk; state the condition and uncertainty. Naming a missing test, catch block, abstraction, or pattern alone is insufficient.
3. **Counterevidence:** check relevant callers, upstream validation, framework guarantees, recovery boundaries, tests, and documented tradeoffs. A comment or test is evidence to assess, not automatic immunity from a demonstrated failure.
4. **Actionable outcome:** give a correction direction and a verifiable outcome for the demonstrated problem. Apply `engineering-judgment.md` when assessing the correction's proportionality and material tradeoffs; record the rationale in the existing finding prose.

Group manifestations of one cause within your assigned owner when they share a correction and acceptance criterion. Do not invent cross-owner findings or allocate IDs. Outside-scope observations do not become blockers for this candidate.

## Finding output and lineage

Preserve the specialist finding fields:

| Field | Content |
|-------|---------|
| `severity` | Exactly `BLOCKER`, `CRITICAL`, `WARNING`, or `SUGGESTION` |
| `affected_files` | At least one affected path inside the supplied review scope |
| `evidence` | Precise reference plus trigger and causal trace; distinguish inspected source from supplied test/scan output |
| `why_it_matters` | One-sentence concrete impact, qualified by any necessary condition |

Keep the owner defined by the matching skill: v2 uses `trust`, `runtime`, `evolution`, `efficiency`; v1 uses `risk`, `reliability`, `resilience`, `readability`. Never mix taxonomies or rename the supplied owner.

For bounded lineage dispatches, include the already-required `summary` and `acceptance_criteria` fields (non-empty, at most 1000 characters each). `scripts/lib/review-lineage.js` retains those fields and severity: put the essential reference, trigger, and impact in `summary`, and the observable correction outcome in `acceptance_criteria` so they survive normalization. Put a concise correction direction and any material tradeoff in the existing prose fields; do not add a new output schema. Acceptance criteria must test the reported problem, not require your preferred implementation.

Calibrate severity to demonstrated impact and supported exposure, not code size, pattern absence, or preference. `BLOCKER`/`CRITICAL` remain blocking under the existing gate; `WARNING`/`SUGGESTION` remain advisory. Suggestions still need an actionable benefit supported by evidence. Do not escalate a speculative concern to force a redesign.

The reducer owns IDs, freeze, executions, and budgets. Each selected specialist runs once; after findings freeze only `review-correction` validates the authorized active slice. Never reset or extend a lineage, rewrite frozen acceptance criteria, or request another discovery sweep.

## Completion

Preserve the outer return envelope required by `skills/_shared/sdd-phase-common.md` or the dispatch contract, including reply language and `skill_resolution`. After a completed review with no supported findings, the **findings report text** is exactly:

```text
No findings.
```

The literal governs the findings report, not the surrounding machine envelope: put it in `detailed_report` when that field carries the report, and use `findings: []` where structured findings are required. The orchestrator passes `{ findings: [] }` as the clean lens result to `recordLensResult`; the reducer does not accept the literal string as its input. If a dispatch explicitly requests only a plain-text review without an outer envelope, return the literal alone. Do not append findings, mentorship prose, or placeholders to the clean report. `review-change` and `review-correction` keep their own exact payloads and never use this clean-specialist convention.
