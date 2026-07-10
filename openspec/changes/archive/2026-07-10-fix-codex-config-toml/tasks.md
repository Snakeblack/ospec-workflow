# Tasks: Retire unsupported Codex config.toml and publish the documented Codex marketplace

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| Generated Codex output MUST omit `.codex/config.toml`; installation MUST preserve user-owned configuration. | MUST | Completed generator, validator, installer, and regression work recorded in `apply-progress.md`. | covered-by-design | Retained as verified completed work; no replacement agent-limit policy. |
| The release branch MUST publish a Codex catalog at `.agents/plugins/marketplace.json` and an isolated `plugins/codex/ospec-workflow/` payload while preserving Claude paths. | MUST | `scripts/configure/codex-marketplace.js`, its tests, and `.github/workflows/publish-marketplace.yml`. | covered-by-design | ADR-002 defines the target-specific layout and relative local source path. |
| Remote registration MUST use `--ref release` and both documented sparse paths; guidance MUST use `/plugins` for installation. | MUST | Workflow smoke check, static contracts, `README.md`, and `docs/plugin-installation.md`. | covered-by-design | ADR-001 rejects `#release` and `codex plugin add`. |
| CI MUST prove supported marketplace registration without claiming an undocumented noninteractive install; published acceptance MUST include manual `/plugins` evidence unless documentation changes before apply. | MUST | Post-push workflow check plus release acceptance task. | covered-by-design | The design explicitly bounds CI proof to registration. |
| The install baseline SHOULD describe the corrected published flow after release acceptance is captured. | SHOULD | `openspec/specs/install/spec.md`. | covered-by-design | Update only with evidence; do not promote an unverified live-install claim. |

### Reconciliation Verdict
- MUST coverage: complete.
- SHOULD/MAY gaps: none.
- Ambiguities to track: no documented noninteractive Codex install exists at planning time; retain manual `/plugins` acceptance unless one is documented before apply.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 360–480 remaining; 1,000–1,240 total change including completed config removal |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Unit 1: catalog/payload and TDD contracts. Unit 2: workflow registration proof, documentation, and release acceptance. |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Preserve the verified config-removal contract. | Completed | Existing verified work; not reopened. |
| 2 | Correct the Codex catalog/payload layout with RED-GREEN-REFACTOR contracts. | PR 1 / review slice | Independently reviewable; targets `fix/codex-config-toml`. |
| 3 | Correct supported registration, guidance, and published-release acceptance. | PR 2 / review slice | May remain in the approved size-exception PR; depends on Unit 2. |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Preserve Completed Config Removal

- [x] 1.1 Keep the completed `scripts/configure/{cli,validate-codex,real-repo,install-codex}.test.js` contracts proving generated `.codex/config.toml` is forbidden and user-owned destination config is unchanged. [REQ-config-001, REQ-config-002]
- [x] 1.2 Keep the completed source, fixture, validator, installer, documentation, and baseline removal work; do not modify unrelated `models.yaml`. [REQ-config-001, REQ-config-002]

## Phase 2: Documented Marketplace Contracts (RED)

- [x] 2.1 In `scripts/configure/codex-marketplace.test.js`, replace root-manifest expectations with failing release-tree assertions for `.agents/plugins/marketplace.json`, the exact `ospec-tools` object entry, policy/category metadata, relative path, isolated payload, and preserved Claude paths. [REQ-release-001]
- [x] 2.2 Add failing static workflow assertions for `--ref release`, `--sparse .agents/plugins`, and `--sparse plugins/codex/ospec-workflow`, and reject `#release` and `codex plugin add`. [REQ-release-002]
- [x] 2.3 Add failing documentation-contract assertions requiring the add-plus-interactive-`/plugins` procedure and prohibiting a claim that CI performs a noninteractive install. [REQ-release-002]

## Phase 3: Correct Release Assembly and Guidance (GREEN)

- [x] 3.1 Update `scripts/configure/codex-marketplace.js` to emit `.agents/plugins/marketplace.json` with the documented entry and copy only the Codex payload to `plugins/codex/ospec-workflow/`; retain safe output-root validation. [REQ-release-001]
- [x] 3.2 Update `.github/workflows/publish-marketplace.yml` to publish the corrected dual-marketplace tree and, after push under an isolated home, register it with the documented `--ref` and sparse paths then inspect marketplace registration; do not run an undocumented install command. [REQ-release-001, REQ-release-002]
- [x] 3.3 Update `README.md` and `docs/plugin-installation.md` with the exact documented registration command, explicit interactive `/plugins` selection/install steps, sparse-path rationale, and separation from `npm run setup:codex`. [REQ-release-002]

## Phase 4: Refactor and Acceptance Boundaries (REFACTOR)

- [x] 4.1 Run the marketplace and workflow/documentation contract tests, then refactor only duplicated constants or staging helpers while retaining all Phase 2 assertions. [REQ-release-001, REQ-release-002]
- [x] 4.2 Run `npm test` and inspect a locally staged release tree for the two Codex paths and unchanged Claude manifest/payload; confirm no active source, test, workflow, or guidance contains `#release` or `codex plugin add`. [REQ-release-001, REQ-release-002]
- [ ] 4.3 Trigger the corrected publish workflow and retain its run URL/logs showing isolated-home marketplace registration; capture manual `/plugins` installation evidence from the published release unless a documented noninteractive replacement is verified before apply. [REQ-release-002]
- [ ] 4.4 After task 4.3 succeeds, update `openspec/specs/install/spec.md` with the verified catalog location, registration command, interactive acceptance boundary, and no-`config.toml` preservation contract. [REQ-config-001, REQ-config-002, REQ-release-001, REQ-release-002]
