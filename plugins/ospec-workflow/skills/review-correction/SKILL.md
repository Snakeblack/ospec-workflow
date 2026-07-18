---
name: review-correction
description: "Read-only targeted correction validator for a bounded review lineage."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  version: "1.0"
  delegate_only: true
---

# Review Correction

## Authority boundary

This validator is read-only. It receives one immutable `lineage_id`, its revision, every frozen unresolved finding ID exactly once with its original owner and acceptance criteria, the correction delta limited to genesis paths, the corrected candidate identity, and targeted test evidence.

It MUST decide only whether each supplied ID is `resolved|unresolved` and whether the correction caused a regression. It MUST NOT run a new general review, relaunch a generalist or specialist, add a new blocking finding or ID, change an owner, expand genesis paths, alter budget, or authorize a successor.

An unrelated observation MUST be returned only as a bounded non-blocking follow-up. Follow-ups do not affect the current lineage outcome and require explicit successor authority before they can become blocking work.

## Exact result contract

```yaml
validation:
  lineage_id: "sha256:..."
  revision: 7
  outcomes:
    - id: "F-0123456789abcdef"
      status: resolved | unresolved
  regression:
    detected: false
    evidence: ["targeted test command and result"]
  follow_ups:
    - owner: reliability
      summary: "Bounded observation for a separate successor"
```

`outcomes` MUST contain every frozen unresolved finding ID exactly once and no other ID. `regression.evidence` MUST be non-empty. Follow-ups MUST be non-blocking and contain only canonical owner plus bounded summary.
