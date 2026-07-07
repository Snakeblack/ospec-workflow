# Apply Progress: add-webhook-retries

### Deviations from Design
`src/webhooks/delivery-worker.js` already owns its own inline retry loop with
a fixed 3-attempt cap; there is no existing queueing abstraction to slot a new
`RetryQueue` module into without rewriting the worker's dispatch loop, which
the design assumed already existed as a pluggable seam. This is a genuine
`design-mismatch`, not a cosmetic naming difference.

### Status
Blocked: `design-mismatch` — the design's assumed `RetryQueue` seam does not
exist in `delivery-worker.js`. Persisted partial progress on 1.1 only; stopped
before 1.2.
