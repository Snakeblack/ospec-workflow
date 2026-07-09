# Delta for contract-lint

## ADDED Requirements

None

## MODIFIED Requirements

### Requirement: I3 Declared-Budget↔Runtime-Constant Checker {#REQ-contract-lint-004}

The registry MUST include, as one registered checker, the existing coherence check between a config-declared budget/timeout and its runtime constant counterpart — the reference instance being `hooks/hooks.json`'s `SessionStart` timeout versus the lock module's `LOCK_STALE_MS`/`LOCK_RETRY_ATTEMPTS`/`LOCK_RETRY_DELAY_MS` constants. This checker MUST also validate the `SessionStart` timeout budget declared in Codex target `hooks/hooks.json` against `LOCK_STALE_MS` constants. This checker generalizes the pattern "every declared budget in a manifest/config file has a corresponding runtime constant, and the declared relationship between them MUST hold" so future budget/constant pairs can be registered under the same checker shape without inventing a new one.

(Previously: The checker verified the session startup timeout budget only for the claude target config.)

#### Scenario: Existing lock/hook guard preserved after integration

- GIVEN `hooks/hooks.json`'s `SessionStart` timeout and the lock module's
  stale-window constant
- WHEN the integrated I3 checker runs inside the unified registry
- THEN it MUST still fail if `LOCK_STALE_MS` exceeds the timeout budget or
  falls below the retry-window floor, identical to the pre-integration
  standalone test's behavior

#### Scenario: Codex lock/hook guard verified

- GIVEN the Codex target's `hooks/hooks.json` `SessionStart` timeout budget and the lock module's stale-window constant
- WHEN the integrated I3 checker runs inside the unified registry
- THEN it MUST fail if Codex `SessionStart` timeout budget is violated by `LOCK_STALE_MS`

#### Scenario: New budget pair reusing the same checker shape

- GIVEN a future config declares a new timeout/budget alongside a runtime
  constant meant to stay within it
- WHEN a maintainer registers this pair under the I3 checker pattern
- THEN no new checker type MUST be invented — the existing generalized shape
  (declared value in, runtime constant in, relationship assertion) MUST be
  reused
