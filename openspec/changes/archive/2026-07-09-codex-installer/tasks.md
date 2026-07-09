# Tasks: Codex installer

## 4R Remediation Batch (2026-07-09)

## Spec/Design Reconciliation Addendum

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-install-003 / Source `dist/codex/.codex/config.toml` missing or invalid fails before destination merge | MUST | `install-codex.js` preflight extraction + `install-codex.test.js` error-path coverage | covered-by-design | Design failure mode already requires abort before destination merge. |
| REQ-install-001 / `codex plugin marketplace add` and `codex plugin add` non-zero exits fail predictably | MUST | CLI command status handling in `main()` + command failure tests | covered-by-design | Failure mode requires non-zero exit plus manual recovery text. |
| REQ-install-001 / Global setup avoids partial install when plugin registration fails | MUST | Reorder registration before global writes or add explicit rollback around global writes | covered-by-design | Remediation must leave no partial global state on registration failure. |
| REQ-install-002 / Repo-local destination validation runs before `runConfigure()` side effects | MUST | `parseArgs()` / destination guard ordering in `install-codex.js` | covered-by-design | Design already says invalid destination returns before build-side effects. |
| REQ-install-002 / REQ-install-003 / Canonical path and symlink protection for Codex destinations | SHOULD | Harden `assertSafeDest()` reuse and destination resolution for `~/.codex` writes | covered-by-design | Minimal security hardening for redirected writes. |
| REQ-install-001 / Incomplete `--source` argument is rejected | SHOULD | `parseArgs()` validation + CLI usage tests | covered-by-design | Input validation is internal to installer contract. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 260-360 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single remediation PR: tests -> ordering/guards -> regression pass |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| R1 | Add failing coverage for config preflight, CLI command failures, bad args, invalid dests, and symlink/canonical guards | Single PR | Locks the error contract before touching installer ordering. |
| R2 | Reorder installer flow and add path hardening so failures happen before writes or leave no partial global state | Single PR | Minimal code changes only; keep existing happy-path behavior green. |
| R3 | Run focused installer suites plus `npm test`, then update apply progress against this remediation batch | Single PR | Close with regression evidence for archive readiness. |

## Historical Plan Snapshot

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-install-001 / Setup codex installs through the CLI when available | MUST | `scripts/configure/install-codex.js`, `package.json`, marketplace wrapper flow | covered-by-design | Dedicated installer module owns build + registration path. |
| REQ-install-001 / Setup codex degrades to manual instructions when the CLI is unavailable | MUST | `findCodexBin()`, `main()`, installer stdout/stderr messaging | covered-by-design | Fallback is explicit and non-fatal. |
| REQ-install-002 / Setup codex copies global agents | MUST | `copyCodexAgents()`, global destination resolution in `install-codex.js` | covered-by-design | Copy is limited to `.codex/agents/*.toml`. |
| REQ-install-002 / Install codex copies repo-local agents | MUST | `assertSafeDest()` reuse + repo-local copy branch in `install-codex.js` | covered-by-design | Existing safe-destination guard is reused. |
| REQ-install-003 / Managed keys are added to an existing config | MUST | `.codex/config.toml`, `extractManagedCodexConfig()`, `mergeManagedCodexConfig()` | covered-by-design | Generated config is the only source of managed keys. |
| REQ-install-003 / Unrelated user configuration is preserved during merge | MUST | text-preserving merge logic + targeted merge fixtures/tests | covered-by-design | Requires RED/GREEN coverage before implementation. |
| REQ-install-003 / Managed keys come from the generated source config only | MUST | `.codex/config.toml`, `scripts/configure/cli.js`, `scripts/configure/validate-codex.js` | covered-by-design | Generator must emit the merge payload into `dist/codex`. |
| REQ-install-004 / Documentation and release metadata reflect Codex install behavior | MUST | `README.md`, `docs/plugin-installation.md`, release marketplace metadata writer | covered-by-design | Docs and metadata are called out in design file changes. |
| REQ-install-004 / Test suite covers Codex installer safety guarantees | MUST | `scripts/configure/install-codex.test.js`, `cli.test.js`, `real-repo.test.js`, `validate-codex.js` | covered-by-design | Node native tests remain the verification path. |
| REQ-codex-target-002 / Installer consumes emitted agent TOML separately from the plugin bundle | MUST | `install-codex.js`, `.codex-plugin/plugin.json` unchanged, `.codex/agents/*.toml` copy flow | covered-by-design | Confirms installer handoff without changing plugin bundle shape. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 520-760 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 generator+validator -> PR 2 installer+tests -> PR 3 docs+metadata |
| Delivery strategy | exception-ok |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Emit generated Codex config and tighten validation fixtures | PR 1 | Keeps generator/validator diff reviewable before installer IO. |
| 2 | Add installer module with marketplace fallback, agent copy, TOML merge, and TDD coverage | PR 2 | Depends on PR 1 outputs and carries most executable risk. |
| 3 | Update scripts/docs/release metadata and run full regression pass | PR 3 | Finishes user-facing contract and release readiness. |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Foundation / Generator Contract

- [x] 1.1 RED: extend `scripts/configure/cli.test.js` and `scripts/configure/real-repo.test.js` to fail until `dist/codex/.codex/config.toml` is emitted and validated. [REQ-install-003, REQ-install-004]
- [x] 1.2 GREEN: create source `.codex/config.toml`, add `scripts/configure/__fixtures__/source/.codex/config.toml`, `scripts/configure/__fixtures__/golden/codex/.codex/config.toml`, and update `scripts/configure/cli.js` `SOURCE_ROOTS` so `runConfigure()` ships the file. [REQ-install-003, REQ-install-004]
- [x] 1.3 REFACTOR: update `scripts/configure/validate-codex.js` and related tests to require the generated config source while keeping `.codex-plugin/plugin.json` agent-free. [REQ-install-003, REQ-codex-target-002]

## Phase 2: Installer TDD / Core Behavior

- [x] 2.1 RED: add `scripts/configure/install-codex.test.js` cases for arg parsing, missing CLI fallback, global vs repo agent copy, non-destructive config merge, and dry-run/no-validate behavior. [REQ-install-001, REQ-install-002, REQ-install-003, REQ-install-004]
- [x] 2.2 GREEN: create `scripts/configure/install-codex.js` with `parseArgs`, `findCodexBin`, `buildCodexMarketplace`, and `main()` that calls `runConfigure({ target: "codex", outDir: "dist/codex", validate })`. [REQ-install-001, REQ-install-004]
- [x] 2.3 GREEN: implement `copyCodexAgents()` and destination resolution for `~/.codex/agents` vs `<destRepo>/.codex/agents`, reusing `assertSafeDest()` from `scripts/configure/install-target.js`. [REQ-install-002, REQ-codex-target-002]
- [x] 2.4 GREEN: implement `extractManagedCodexConfig()` and `mergeManagedCodexConfig()` so only `[agents]` and `skills.config` lines from generated `.codex/config.toml` are inserted/replaced and unrelated TOML text is preserved. [REQ-install-003]
- [x] 2.5 REFACTOR: export only the minimal shared helpers from `scripts/configure/install-target.js`, collapse duplicated path logic, and keep current opencode/copilot flows green. [REQ-install-001, REQ-install-002]

## Phase 3: Script Wiring / Marketplace Integration

- [x] 3.1 RED: add script-level assertions in `scripts/configure/install-codex.test.js` or adjacent CLI tests for `setup:codex` and `install:codex -- <destRepo>` entrypoints and emitted manual fallback commands. [REQ-install-001, REQ-install-004]
- [x] 3.2 GREEN: update `package.json` with `build:codex`, `setup:codex`, `install:codex`, and any approved `reload:codex` alias wired to the new installer/build commands. [REQ-install-001, REQ-install-004]
- [x] 3.3 GREEN: implement marketplace wrapper output under `dist/codex-marketplace/` and CLI invocation flow (`codex plugin marketplace add`, `codex plugin add`) with actionable non-fatal fallback messaging when Codex is absent. [REQ-install-001]
- [x] 3.4 REFACTOR: verify installer stderr/stdout paths, exit codes, and dry-run output remain deterministic for native Node tests and future docs snippets. [REQ-install-001, REQ-install-004]

## Phase 4: Documentation / Release Metadata

- [x] 4.1 RED: add or extend doc-oriented assertions covering README target table, Codex command examples, separate agent-copy behavior, and config merge expectations. [REQ-install-004]
- [x] 4.2 GREEN: update `README.md` and `docs/plugin-installation.md` with global setup, repo-local install, CLI-missing fallback, and managed TOML merge semantics. [REQ-install-004]
- [x] 4.3 GREEN: update the release marketplace metadata writer/path used for distribution so Codex appears as a supported install target with the marketplace wrapper contract. [REQ-install-004]

## Phase 5: Full Verification / Cleanup

- [x] 5.1 REFACTOR: run `npm test`, fix regressions in `scripts/configure/install-target.test.js`, `validate-codex.test.js`, and any Codex golden snapshots, then mark any completed checklist items in this file during apply. [REQ-install-004]
- [x] 5.2 Verify that no task copies `.codex-plugin/plugin.json` into repo-local destinations and that only `.codex/agents/*.toml` plus `.codex/config.toml` are installer-managed outputs. [REQ-install-002, REQ-codex-target-002]
- [x] 5.3 REMEDIATION: extend `scripts/configure/install-codex.test.js` with a runtime test that executes `main([])` (or equivalent setup entry) with a fake available Codex binary and asserts `codex plugin marketplace add <marketplaceDir>` and `codex plugin add ospec-workflow@ospec-tools` are both attempted in order. [REQ-install-001]

## Phase 6: 4R Remediation / Safe Failure Ordering

- [x] 6.1 RED: extend `scripts/configure/install-codex.test.js` to prove `main()` aborts before any copy/merge when `dist/codex/.codex/config.toml` is absent or invalid, including assertions that no global/repo destination files are written. [REQ-install-003, REQ-install-004]
- [x] 6.2 RED: add failing tests for `command.status !== 0` on both `codex plugin marketplace add` and `codex plugin add`, for incomplete `--source` usage, and for repo-local invalid destinations being rejected before `runConfigure()` is invoked. [REQ-install-001, REQ-install-002, REQ-install-004]
- [x] 6.3 RED: add path-safety tests covering symlinked/canonicalized `~/.codex/agents`, `~/.codex/config.toml`, and repo-local `.codex` destinations that escape the approved target root. [REQ-install-002, REQ-install-003]
- [x] 6.4 GREEN: update `scripts/configure/install-codex.js` so argument parsing and repo-local destination validation happen before `runConfigure()`, and reject incomplete `--source` input with deterministic usage output. [REQ-install-001, REQ-install-002]
- [x] 6.5 GREEN: preflight `extractManagedCodexConfig()` immediately after build/validation and before any destination writes; fail fast with a non-zero exit and no partial install when the generated source config is missing or malformed. [REQ-install-003]
- [x] 6.6 GREEN: reorder global setup so Codex marketplace/plugin registration succeeds before global copy/merge, or add equivalent rollback that removes managed writes when registration fails; preserve actionable recovery messaging. [REQ-install-001, REQ-install-002, REQ-install-003]
- [x] 6.7 GREEN: harden `scripts/configure/install-target.js` helpers and/or Codex destination resolution to compare canonical paths, reject symlink redirects, and keep managed writes inside the intended global or repo-local `.codex` roots only. [REQ-install-002, REQ-install-003]
- [x] 6.8 REFACTOR: run `node --test scripts/configure/install-codex.test.js scripts/configure/install-target.test.js scripts/configure/cli.test.js scripts/configure/real-repo.test.js` and `npm test`, then append the remediation evidence to `openspec/changes/codex-installer/apply-progress.md` before closing the batch. [REQ-install-001, REQ-install-004]
