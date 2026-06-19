---
name: token-budget-advisor
description: "Guidelines to optimize token consumption and suggest context compaction. Trigger: When the user requires regulating token depth and consumption in the session."
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
---

## When to Use

Load this skill when you need to regulate token consumption, optimize the active context of the agent, or when the `PreToolUse` hook alerts about heavy consumption.

## Rules

| Rule | Requirement |
|------|-------------|
| Estimate before reading | Heuristically calculate the file cost before opening it (`characters / 4` for code, `words * 1.3` for prose). |
| Avoid redundant reads | Do not re-read files already read in the same turn unless they have changed. |
| Preventative compaction | If the session cumulative token count exceeds 90,000, explicitly ask the user to compact context (`PreCompact`). |
| Respect the bypass | If `DISABLE_TOKEN_ADVISOR=true`, bypass weight warnings and allow execution. |

## Token Heuristics

To estimate token consumption before reading a file:
* **Programming code and structured files**: `characters / 4`.
* **Prose and free text**: `words * 1.3` or `(characters / 6) * 1.3`.

## Recommended Responses to Blocks

If the `PreToolUse` hook pauses your execution with a token warning:
1. **Analyze size**: Verify if you really need to read the entire file or if a line range is sufficient (e.g., using `view_file` with `StartLine` and `EndLine`).
2. **Compact**: If cumulative tokens are high, suggest the user runs compaction.
