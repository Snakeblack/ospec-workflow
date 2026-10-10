# decision-gap-engine

## Intent and acceptance

ospec foundation next ranks knowledge-map gaps into a deterministic round and foundation record persists answers and assumptions.

Acceptance: The same engine returns distinct deterministic rounds for a local CLI, a small SaaS and a regulated product, and a resumed map does not repeat a slot that already has an answer.

## Plan

1. Score each catalog slot as impact × uncertainty × irreversibility × profile weight, and return at most four slots from the single highest dimension.
2. Persist one answer with `ospec foundation record` into `docs/architecture/knowledge-map.yaml`. A missing map is scored, not created.
3. Publish the contract in `openspec/specs/decision-gap/spec.md` and point the foundation skill at the engine. Ship the catalog JSON with the installed CLI.

## Decisions

- **Scoring.** Impact is the number of that slot's catalog decisions that still have an unanswered feeding slot. Uncertainty is 1 when the slot is unknown or missing and 0 otherwise. Irreversibility is 1. Profile weight is 2 when the slot is mandatory for the profile and 1 when it is optional. Ties keep catalog order.
- **Theme.** A theme is the slot dimension. A round takes only the highest-priority dimension, at most four slots, and does not fill from another dimension.
- **Drafts.** `next` and `record` accept a map whose mandatory slots are still unknown. `validateKnowledgeMap` stays unchanged and still rejects that draft.
- **Missing file.** `foundation next --profile` computes the round as if every catalog slot were unknown, returns that blank map as `template`, and writes nothing. `record` refuses until the file exists.
- **Profiles for the done criterion.** `prototype` (local CLI), `product` (small SaaS) and `regulated`.
- **No question prose.** The engine returns the slots and the decisions they unblock. The model phrases the question and the recommended answer. "I don't know" is recorded as `assumed`.
- **On-disk shape.** The map stays JSON text at `docs/architecture/knowledge-map.yaml` (valid YAML 1.2). No YAML parser.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-10T13:04:29.064Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-10T13:04:29.064Z)
- ev-3: living-doc-current for living-doc (2026-10-10T13:04:37.008Z)
<!-- ospec:evidence:end -->
