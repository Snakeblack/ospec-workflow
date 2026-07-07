# Design: Add webhook delivery retries

## Technical Approach

Introduce a `RetryQueue` module (`src/webhooks/retry-queue.js`) that owns
backoff scheduling, and have the delivery worker enqueue failed deliveries
onto it.

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `src/webhooks/retry-queue.js` | Create | New backoff-scheduling queue |
| `src/webhooks/delivery-worker.js` | Modify | Enqueue failed deliveries onto `RetryQueue` |
