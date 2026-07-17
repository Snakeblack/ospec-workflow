---
name: review-change
description: "Read-only generalist screening contract for selective 4R review."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  version: "1.0"
  delegate_only: true
---

# Review Change

## Read-only boundary

Inspect the verified proposal/spec/design/tasks/apply-progress/verify-report and real diff. MUST NOT write, edit, delete, fix, or remediate files. Return `artifacts: []`.

## Screening

Check basic correctness and screen with high sensitivity for:

- risk signals such as authentication, permission, credentials, privileged process execution, or dependency trust;
- reliability signals such as public contracts, validation, persistence, global configuration, and nondeterminism;
- resilience signals such as network, retry, timeout, rollback, partial failure, or error flow;
- readability signals such as structural complexity or non-obvious control flow.

Concrete basic correctness defects, including missing files or contradictions with verified artifacts, may trigger escalation. Escalate when dimension-specific expertise is needed.

`reason` is not free-form prose. It MUST use only this structural, allowlisted classifier-reference grammar:

```text
signals=<canonical-comma-separated-signal-codes>;dimensions=<canonical-comma-separated-dimensions>
```

Allowed signal codes are `verify-risk`, `verify-reliability`, `verify-resilience`, `verify-readability`, `diff-process-execution`, `diff-auth-permission`, `diff-global-config-write`, `diff-network-flow`, `diff-error-flow`, `diff-structural-complexity`, `dependency-change`, `design-risk`, `metadata-runtime`, and `metadata-docs-only`. `dimensions` MUST exactly equal `specialists`. A clear decision MUST use `signals=none;dimensions=none`. Arbitrary paths, diff text, explanations, credentials, secrets, tokens, and any extra field or suffix MUST NOT appear in `reason`; the validator rejects everything outside the grammar structurally.

## Exact decision contract

The standard successful result envelope MUST contain exactly one nested `decision` payload with exactly `status`, `specialists`, and `reason`:

```yaml
artifacts: []
decision:
  status: clear | needs-specialist
  specialists: [] # canonical subset of risk, reliability, resilience, readability
  reason: "signals=diff-auth-permission,diff-process-execution;dimensions=risk,reliability"
```

`clear` requires an empty list. `needs-specialist` requires a deduplicated, canonical-order, non-empty list. MUST NOT emit specialist findings, assign severity, claim a deep exploit/proof/guarantee, or prescribe domain-deep remediation. Specialists remain authoritative.
