# Approval Ledger

Blocking workflow decisions must be persisted.

## Valid approval sources

- an explicit result from a native question tool actually exposed and permitted by the active host; record the actual tool identifier, including its namespace (for example `functions.request_user_input` or `functions.request_user_input_async`)
- an explicit user chat response to the active gate when the host question protocol permits chat; record `codex/plain-chat` on Codex (`codex/plain-chat-numbered-gate` remains valid for existing numbered gates), or the corresponding truthful host/chat channel
- explicit approval already persisted in `openspec/changes/{change-name}/state.yaml`

Apply the active host question protocol from `rules/sdd-common.instructions.md` (projected into the target's root instructions). This contract also applies when this file is read directly as an untransformed fallback. An explicit answer in the current conversation is evidence; a summary claiming an answer is not. Do not reject an authorized answer because it came from another supported question channel. Never change historical source values or invent a tool result to satisfy a target-specific example.

## Invalid approval sources

- conversation summary
- inferred user intent
- previous assistant statement
- "the user probably wanted..."
- an unanswered, expired, or inferred native-tool result
- a tool identifier that was not the actual source of the answer

## State shape

```yaml
approvals:
  - id: string
    gate: execution-mode | delivery-strategy | review-workload | architecture | testing | archive-warning | intent-briefing
    decision: string
    source: codex/plain-chat # Example only: use the actual observed answer channel.
    accepted_at: ISO-8601
    applies_to:
      - sdd-apply
```

`synthesis` and `scope` are obligatory only for `intent-briefing` (agreed functional restatement and in/out-of-scope boundary) and MUST NOT appear on other gates. For `intent-briefing`, `applies_to` MUST include `change-classification`. An `intent-briefing` approval MUST NOT substitute the `confidence: advisory` route-confirmation gate.
