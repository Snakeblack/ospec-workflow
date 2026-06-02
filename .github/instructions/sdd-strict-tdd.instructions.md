---
description: 'Strict TDD forwarding and evidence rules for SDD apply and verify phases.'
applyTo: '**/*.{spec.ts,test.ts,cs}'
---

> Workspace mirror: keep this file in sync with `rules/sdd-strict-tdd.instructions.md`, which is the plugin-created bundled rules location.

# Strict TDD Protocol

Load these rules only when `openspec/config.yaml` explicitly enables `strict_tdd: true`, Strict TDD Mode is active, and a test runner is available. The orchestrator should forward: `STRICT TDD MODE IS ACTIVE. Test runner: {command}.`

## Apply phase

- Follow RED -> GREEN -> TRIANGULATE -> REFACTOR for every assigned task.
- Do not write production code before a failing or newly impossible test exists.
- Execute the relevant test file for GREEN when a verified command-execution tool is available.
- If command execution is unavailable, report `blocked`; do not fake GREEN evidence.
- Persist a `TDD Cycle Evidence` table in `apply-progress.md`.

Required evidence columns:

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
| ---- | --------- | ----- | ---------- | --- | ----- | ----------- | -------- |

## Verify phase

- Read `apply-progress.md` and validate the TDD evidence against real test files and execution output.
- Runtime test execution evidence overrides static inspection when deciding compliance.
- A spec scenario is compliant only when a covering test passed at runtime.
- Audit assertion quality: no tautologies, ghost loops, type-only smoke tests, or tests that do not exercise production code.
- If Strict TDD evidence is missing or cannot be proven, report a CRITICAL issue.

Detailed rules live in `skills/sdd-apply/strict-tdd.md` and `skills/sdd-verify/strict-tdd-verify.md`.