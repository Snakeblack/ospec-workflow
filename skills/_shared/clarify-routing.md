# Clarify Gate Handler (on-demand)

Fires after a successful `sdd-spec` envelope passes phase-aware validation. This
handler owns the complete skip-or-run decision; route and classification do not
affect it.

Evaluate this pure predicate over the already validated signals:

```js
function shouldRunClarify(signals) {
  return signals.residual_ambiguity ||
    signals.public_contract_questions.length > 0 ||
    signals.conflicting_requirements.length > 0 ||
    signals.missing_acceptance_criteria.length > 0;
}
```

| Signals | Decision | Clarify state | Next |
|---|---|---|---|
| false + empty arrays | skip | skipped | sdd-design |
| true or any non-empty array | run clarify | done or blocked | sdd-design or user gate |

- When the predicate is `false`, write `phases.clarify.status: skipped` to
  `state.yaml` and route directly to `sdd-design` without launching
  `sdd-clarify`.
- When the predicate is `true`, run the existing handler below. Because clarify
  is a gate rather than a declared route phase, the orchestrator MUST NOT call
  `validate-phase.js` for `sdd-clarify`.

When the gate runs:

1. **On `status: success`**: record `phases.clarify.status: done` and
   `phases.clarify.questions_asked: {N}` in `state.yaml`; proceed to `sdd-design`.
2. **On `status: blocked` with `question_gate`**: call `vscode/askQuestions` with the
   `question_gate` payload; wait for all answers; relaunch `sdd-clarify` with the
   answers; record `state.yaml` `status: blocked` and `blocking_questions` while
   waiting. On relaunch success, go to step 1.
3. **User-explicit skip (pre-launch)**: if the user signals intent to skip
   clarification (e.g., "skip clarify", "no clarification needed"), set
   `phases.clarify.status: skipped` in `state.yaml` and route directly to
   `sdd-design` without launching `sdd-clarify`.

Valid values for `phases.clarify.status`: `pending | blocked | done | skipped`.
