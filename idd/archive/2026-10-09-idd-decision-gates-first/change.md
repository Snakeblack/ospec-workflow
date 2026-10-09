# idd-decision-gates-first

## Intent and acceptance

ospec next and the session hooks send the agent to build while an adr-amend-or-contradict or irreversible-operation gate is open, and the IDD protocol never says how to open the ADR gate, so resolving it fails with gate-not-open

Acceptance: With any gate open, next_step is resolve-gate for it (gate order) before the plan and every obligation, in the CLI and in both hook runtimes; the IDD protocol says how to open adr-amend-or-contradict and that a pending_decision is asked first; signals reports a recorded plan

## Plan

1. CLI and hooks: `nextForChange` (`scripts/lib/idd-next.js`) returns `resolve-gate` for the first open gate, in gate order, before `declare-plan` and every obligation; the Go port `DescribeStep` (`internal/iddsession`) follows. The JS hooks read `nextForChange`, so they follow without a change.
2. Contract and protocol: REQ-idd-011 states the new order and REQ-idd-008 who opens the ADR gate; the `destructive-migration` fixture expects the gate first; the `idd` skill says how to open `adr-amend-or-contradict` and that `resolve-gate` comes first. `ospec signals` says when it recorded only the plan.

## Decisions

- **Every open gate comes first, not only the intent gates.** REQ-idd-008 makes each gate a user decision taken before the operation it decides, and the `destructive-migration` fixture's own acceptance says the data loss is approved before it runs. The old order sent the agent to write and run the migration test, or to build against a contradicted ADR, while the decision was still open. One branch replaces three, and the trailing "first open gate" branch became unreachable, so it is gone.
- **The agent opens the ADR gate.** No derivation detects ADR impact until E3.1 (the `adr-or-quality-attribute` signal stays inactive), so the protocol names the command and where ADRs live. Activating the E3.1 obligation is out of scope.
- **A Go unit test instead of a new shared golden case.** The JS hooks have no ordering of their own (they call `nextForChange`, covered by `idd-next.test.js`), and the `s-gate` golden already pins the `resolve-gate` line byte for byte in both runtimes. A new golden case would edit `scripts/hooks/idd-session.test.js`, a security-boundary path whose trust review needs an independent reviewer agent this session may not launch unasked.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-09T12:41:54.998Z)
- ev-2: check-run for checks-pass (2026-10-09T12:43:21.227Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-09T12:43:21.227Z)
- ev-4: living-doc-current for living-doc (2026-10-09T12:43:30.815Z)
<!-- ospec:evidence:end -->
