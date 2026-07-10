# Verification Report

**Change**: fix-codex-config-toml
**Version**: N/A (bugfix route; requirements reconciled in `tasks.md`)
**Mode**: Strict TDD

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 21 |
| Tasks complete | 21 |
| Tasks incomplete | 0 |

All task checkboxes are complete. The inspected branch is `fix/codex-config-toml`; the pre-existing `models.yaml` modification remains outside this change and was not modified during verification.

## Build & Tests Execution

**Build**: ➖ No separate build command is configured (`rules.verify.build_command` is empty). `npm test` exercises generation and validation for all targets.

**Focused tests**: ✅ 106 passed / 0 failed / 0 skipped
```text
node --test scripts/configure/cli.test.js scripts/configure/validate-codex.test.js scripts/configure/real-repo.test.js scripts/configure/install-codex.test.js scripts/configure/codex-marketplace.test.js scripts/configure/claude-marketplace.test.js
```

**Full suite**: ✅ 1217 passed / 0 failed / 0 skipped
```text
npm test
All checks passed.
```

**Static integrity**: ✅ `git diff --check` completed with no whitespace errors.
**Manual verification**: Performed through the focused integration tests and the full harness. The live remote Codex CLI smoke cannot be run locally because it requires the workflow to first publish the `release` branch artifact.

**Coverage**: ➖ Not available; `openspec/config.yaml` declares no coverage command or threshold.

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD evidence reported | ✅ | Both apply batches contain a `TDD Cycle Evidence` table. |
| All tasks have corresponding evidence | ✅ | 21/21 task units are covered by 12 grouped evidence rows. |
| RED confirmed (required marker and test existence) | ❌ | The relevant test files exist and pass, but no coding row uses the required `✅ Written` RED marker. |
| GREEN confirmed (required marker and execution) | ❌ | The related test files pass, but coding rows record counts such as `✅ 91/91 focused` rather than required `✅ Passed`, `STATIC_VALIDATED`, or `DEFERRED`. |
| Triangulation adequate | ✅ | The evidence records distinct output, validator, installer-preservation, release-layout, workflow-order, and documentation cases. |
| Safety net for modified/new test files | ✅ | Safety-net evidence is recorded for the modified suites; the new marketplace suite is explicitly marked new and was executed. |

**TDD Compliance**: 4/6 checks passed. Strict-TDD evidence-format violations are CRITICAL even though all executable tests passed.

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|------:|------:|-------|
| Unit | 42 | 3 | Node.js native `node:test` |
| Integration | 61 | 4 | Node.js native `node:test`, filesystem/temp trees, generator/validator |
| Static contract | 3 | 1 | Node.js native `node:test` reading workflow/docs/contracts |
| E2E | 0 | 0 | Not available for this change locally |
| **Total focused** | **106** | **6** | |

The release workflow's remote CLI commands are static-contract-tested locally; their actual GitHub-hosted execution remains pending publication.

### Changed File Coverage

Coverage analysis skipped — no coverage tool detected.

### Assertion Quality

Reviewed the six relevant test files for tautologies, no-production-call tests, zero-assertion cases, ghost loops, smoke-only checks, and mock-heavy assertions. The loops in the changed/related suites iterate fixed fixture or document sets and are paired with concrete assertions.

**Assertion quality**: ✅ All assertions verify real behavior.

### Quality Metrics

**Linter**: ➖ Not available
**Type Checker**: ➖ Not available
**Quality Gates**: ➖ No `quality_gates` policy is declared in `openspec/config.yaml`.

## Spec Compliance Matrix

| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| Config retirement | Codex generation omits `.codex/config.toml` and validator rejects its reintroduction. | `runtime-test` | `cli.test.js`, `real-repo.test.js`, `validate-codex.test.js` | PASS | Focused suite executed; generated real repository output validates. |
| Installer preservation | Global and repository installs copy TOML agents without creating or changing user `config.toml`. | `runtime-test` | `install-codex.test.js` | PASS | Covers unavailable/available CLI paths, repository preservation, dry run, and managed-path safety. |
| Regression contract | Generator, validator, real-repository, and installer contracts remain executable. | `runtime-test` | Six focused test files; `npm test` | PASS | 106 focused and 1217 full-suite tests passed. |
| Documentation/baseline | Public guidance describes agent-only installation and manual stale-config cleanup. | `static-lint` | `install-codex.test.js`; `README.md`; `docs/plugin-installation.md`; `openspec/specs/install/spec.md` | PASS | Declarative documentation contract is checked by test. |
| REQ-release-001 | Release artifact assembles an independent root Codex marketplace at `plugins/codex/ospec-workflow` without replacing Claude paths. | `runtime-test` | `codex-marketplace.test.js` | PASS | The assembler is executed against a staging tree and preserves an existing Claude manifest/payload. |
| REQ-release-001 | The `release` branch actually publishes the combined artifact. | `no-proof` | Workflow inspected at `.github/workflows/publish-marketplace.yml` | FAIL | The workflow declares the publication, but this verification has no executed GitHub Actions run or resulting release-branch artifact. A workflow string contract is not a runtime proof of publishing. |
| REQ-release-002 | Public docs provide the two remote commands and explain `#release` separately from local setup. | `static-lint` | `codex-marketplace.test.js`; `README.md`; `docs/plugin-installation.md` | PASS | Both documents contain the exact repository URL/ref, plugin identifier, and local setup distinction. |
| REQ-release-002 | Automation proves that Codex resolves the published `#release` marketplace and installs the plugin. | `no-proof` | Workflow inspected at `.github/workflows/publish-marketplace.yml:85-91` | FAIL | The workflow is correctly ordered and fail-fast by shell semantics, but no real Codex CLI execution against a published release branch was available. A static workflow test cannot prove remote branch-fragment resolution. |

**Compliance summary**: 6/8 scenarios have acceptable evidence. The two failed scenarios are MUST runtime behaviors lacking runtime/static-proof evidence.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| No managed unsupported config | ✅ Implemented | `.codex/config.toml` and fixtures are deleted; `runConfigure()` no longer includes the Codex-only source root; validator forbids the path. |
| Preserve user configuration | ✅ Implemented | `install-codex.js` removed config extraction/merge/write paths and retains agent copy, marketplace registration, dry-run, and path safety. |
| Dual marketplace isolation | ✅ Implemented | `codex-marketplace.js` writes root `marketplace.json` and generates only under `plugins/codex/ospec-workflow`; it does not wipe the Claude staging tree. |
| Release workflow ordering | ✅ Implemented | The workflow builds Claude then Codex into one staging tree, pushes `release`, then installs Codex and adds marketplace before plugin. |
| Published remote behavior | ❌ Unverified | No post-push GitHub Actions evidence was available. |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Retire unsupported config rather than invent replacement limits | ✅ Yes | No replacement configuration policy was added. |
| Preserve user-owned configs | ✅ Yes | Installer behavior and docs agree. |
| Keep Claude and Codex release payloads separate | ✅ Yes | Claude remains under `plugins/ospec-workflow`; Codex uses `plugins/codex/ospec-workflow`. |
| Prove `#release` through the real CLI after publish | ⚠️ Pending | The workflow contains the right smoke command, but the required post-push execution has not yet occurred. |

## Issues Found

### CRITICAL

1. **[design-gap] No executed proof that the `release` branch publishes the dual marketplace or that Codex resolves `https://github.com/${GITHUB_REPOSITORY}.git#release`.** The requirements and tasks demand a real post-push CLI smoke. Current evidence is only the declared workflow and its static contract test, which cannot satisfy a MUST runtime behavior. **Recommendation:** trigger the release workflow (or an equivalent authenticated staging publication), retain its successful run URL/logs and release-branch layout evidence, then re-run verification.
2. **[tasks-gap] Strict-TDD evidence does not use the mandatory RED/GREEN markers.** `apply-progress.md` reports test counts and failures/passes but no coding row says `✅ Written` in RED or `✅ Passed`/`STATIC_VALIDATED`/`DEFERRED` in GREEN as required by `strict-tdd-verify.md`. **Recommendation:** repair the TDD evidence artifact in a follow-up apply pass without changing production code, preserving the already executed commands and their results.

### WARNING

None.

### SUGGESTION

None.

## Assumptions

[]

## Risks

- The live marketplace smoke has intentionally not run on a published release branch, so remote Git URL fragment behavior and CLI compatibility remain unproven.
- The repository contains unrelated pre-existing work in `models.yaml`; it was excluded from this review and remains unmodified.

## Verdict

**FAIL**

All local focused and full-suite checks pass, and the implementation matches the retirement and dual-artifact design. Verification cannot certify completion in Strict TDD because the evidence format is nonconforming and the two MUST published-runtime scenarios lack executed remote evidence.
