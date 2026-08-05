# ADR-003: Claude Enforced Only After Live Probe

- Status: proposed
- Change: k2a-1-live-capability-probes-async-transports
- Date: 2026-08-05

## Context
The Claude reference adapter marks all five transports `enforced` from fixture
CapabilityProof digests without exercising real host primitives. That invents
enforcement authority and blocks honest K3 capability consumption.

## Decision
Without live host primitives that complete an accepted probe (worker
spawn/cancel/fail, observable delivery hook, real question exchange, or an
explicit instructional path that does not claim enforcement), Claude capability
resolution MUST be `unavailable`, `instructional`, or `partial` — never
`enforced`. `enforced` requires a successful live probe plus
`verifyCapabilityProof` against expected live identity and `expectedProbeDigest`.
Fixture-only digests never authorize `enforced`.

## Alternatives
- Keep fixture-backed `enforced` (status quo): rejected — CRITICAL 4 remains open.
- Force all capabilities to `instructional` forever: rejected — blocks legitimate live demos.
- Trust declarative profile maps alone: rejected — no probe evidence.

## Consequences
Default Claude adapter without primitives degrades honestly. Registry/conformance
tests stop treating fixture proofs as enforcement. Live probe harnesses become
the only path to `enforced` for Claude.
