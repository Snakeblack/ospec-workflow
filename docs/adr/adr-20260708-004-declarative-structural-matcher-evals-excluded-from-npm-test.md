# ADR-004: Declarative structural matcher, evals excluded from `npm test`

- Status: accepted
- Change: prompt-evals-golden-scenarios
- Date: 2026-07-08

## Context

REQ-002 requires structural-only assertions (no prose); REQ-003 requires per-scenario
pass/fail with the diverged field named. `check.js` auto-collects `--test
scripts/**/*.test.js`, so anything named `*.test.js` runs in CI — where no model exists.

## Decision

`scripts/evals/lib/assertions.js` exposes `assertScenario(expect, captured) → { pass,
failures[] }`, comparing only structural fields (artifacts present/absent, `state.yaml`
values, dispatched route/phase, `blocker_type`, `question_gate` shape) and naming each
diverged field. Only this matcher gets a `*.test.js` (pure-Node, CI-safe); the live
`run.js` is deliberately NOT a `*.test.js`, so the live suite is never collected by CI.

## Alternatives

- Drive scenarios from `node:test` files — they would be auto-collected by `check.js`
  and fail CI for lack of a model.

## Consequences

Easier: CI stays green and deterministic; matcher fully unit-tested; failures
attributable. Harder: contributors must remember evals are a separate manual command.
Reversible: 2.2 can add a headless CI job that opts the live suite in explicitly.
