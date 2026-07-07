# Tasks: Add webhook delivery retries

## Phase 1: Implementation

- [~] 1.1 Create `src/webhooks/retry-queue.js` implementing `RetryQueue`. [REQ-webhooks-001]
- [ ] 1.2 Wire `delivery-worker.js` to enqueue failed deliveries onto `RetryQueue`. [REQ-webhooks-001]
