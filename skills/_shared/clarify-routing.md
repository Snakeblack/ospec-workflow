# Clarify Gate Handler (on-demand)

Fires after `sdd-spec` returns `status: success` when the clarify gate RUNS per the
conditions in the orchestrator's `#### sdd-clarify Routing` section (which also owns
the SKIP conditions — this file only covers handling a gate that runs).

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
