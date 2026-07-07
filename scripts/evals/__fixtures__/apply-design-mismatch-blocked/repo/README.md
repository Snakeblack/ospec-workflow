# acme-webhooks

Fixture repo for the apply-time `design-mismatch` golden scenario. An
in-flight change (`add-webhook-retries`) already has `sdd-apply` returning
`status: blocked` with `blocker_type: design-mismatch`, because the design
assumed a `RetryQueue` module that does not exist in the codebase. The live
orchestrator must route to `sdd-design` and must never silently retry
`sdd-apply`.
