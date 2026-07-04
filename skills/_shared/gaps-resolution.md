# Gaps Resolution Handler (on-demand)

Fires when `sdd-foundation` returns `status: blocked` with a `question_gate`
indicating unresolved functional or technical gaps. The orchestrator MUST:

1. Intercept the block and call `vscode/askQuestions` with the gap resolution options.
2. Record the user's resolution decision under the `approvals` ledger in
   `openspec/changes/{change-name}/state.yaml` and append it to `gaps_resolutions`
   in `openspec/config.yaml`.
3. Relaunch `sdd-foundation` with the resolved gaps decisions context so it can
   generate the finalized `docs/roadmap-gaps.md` and consolidated `docs/roadmap.md`.

Do not continue to downstream phases while a gaps question is unresolved.
