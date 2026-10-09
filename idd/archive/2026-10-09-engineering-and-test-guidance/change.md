# engineering-and-test-guidance

## Intent and acceptance

IDD, the default path, carries no guidance on solution simplicity, test selection by risk, unit-test isolation or multi-service changes; Strict TDD apply demands a red test of every task while verify lets any task mark it N/A

Acceptance: The idd protocol (within 12 KB) says how to build simply, which tests to write by risk and how to keep unit tests deterministic and offline, how a refactor records its safety net, and how changes span repositories or monorepo services; engineering-judgment.md holds the canonical test-by-risk criteria; Strict TDD apply and verify agree on the N/A cases and verify flags N/A on a behavior change

## Plan

1. `skills/idd/SKILL.md` gains three short sections: **Build it simply** (smallest change, reuse, a new layer only for a present need, unrelated defects reported), **Tests by risk** (what to test and what not, tests that fail when the behavior is wrong, deterministic offline unit tests with doubles at the boundary, a refactor's safety net through `ospec check` before the first edit) and **Several services or repositories** (one IDD change per repository, compatible contracts, `impact:` for monorepo services). It stays under 12 KB (9.7 KB).
2. `skills/_shared/engineering-judgment.md` holds the canonical test-by-risk paragraph that design, apply and the reviewers already read.
3. Strict TDD: apply (`strict-tdd.md`, `rules/sdd-strict-tdd.instructions.md`) and verify (`strict-tdd-verify.md`) agree that only non-coding tasks and behavior-preserving refactors mark RED/GREEN `N/A`, and verify flags `N/A` on any task that changes behavior.

## Decisions

- **The protocol carries its own compact guidance instead of reading `_shared`.** The installed protocol must not depend on the `_shared` directory marker (`idd-protocol.test.js` pins this), and IDD is the default path: guidance it has to load separately is guidance most changes never see. The canonical, longer form stays in `engineering-judgment.md`.
- **Risk decides tests, not coverage.** No coverage threshold is introduced; the criteria name what to test, what to skip and what makes a test worth keeping.
- **Context ceilings rise by 725 bytes for the four specialist reviewers.** They judge test adequacy, so they need the same criteria; the ceilings move only for `review-efficiency`, `-evolution`, `-runtime` and `-trust` in each target, nothing else changes.
- **Verify closes the `N/A` loophole.** Before, any coding task marked `N/A` skipped validation, while apply demanded a red test of every task, docs included. Now both list the same two exemptions, and a refactor still needs its safety net.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-09T12:49:45.013Z)
- ev-2: living-doc-current for living-doc (2026-10-09T12:49:45.167Z)
<!-- ospec:evidence:end -->
