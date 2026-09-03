---
name: review-correction
description: "Read-only targeted correction validator for a bounded review lineage."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  version: "1.1"
  delegate_only: true
---

# Review Correction

## Authority boundary

This validator is read-only. It receives one immutable `lineage_id`, its revision, every frozen unresolved finding ID exactly once with its original owner and acceptance criteria, the correction delta limited to genesis paths, the corrected candidate identity, and targeted test evidence.

It MUST decide only whether each supplied active-slice ID is `resolved|unresolved` and whether the correction caused an explicitly evidenced regression against a named passed slice. It MUST NOT run a new general review, relaunch a generalist or specialist, add a new blocking finding or ID, change an owner, expand permitted paths, alter any slice budget, or authorize a successor.

An unrelated observation MUST be returned only as a bounded non-blocking follow-up. Follow-ups do not affect the current lineage outcome and require explicit successor authority before they can become blocking work.

## Dual-schema owner validation

Owner vocabulary is schema-bound and MUST NOT mix in one lineage:

| Schema | Allowed finding owners | Allowed follow-up owners |
| ------ | ---------------------- | ------------------------ |
| v1 (`schema_version: 1`, `gates.4r-review-gate`) | `risk`, `reliability`, `resilience`, `readability` | same four 4R dimensions |
| v2 (`schema_version: 2`, `gates.quality-review-gate`) | `trust`, `runtime`, `evolution`, `efficiency` | same four quality domains |

Reject any outcome or follow-up whose `owner` is outside the lineage schema. Never accept both taxonomies in one validation payload.

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
    - owner: runtime
      summary: "Bounded observation for a separate successor"
```

`outcomes` MUST contain every frozen unresolved finding ID exactly once and no other ID. `regression.evidence` MUST be non-empty. Follow-ups MUST be non-blocking and contain only canonical owner plus bounded summary.
