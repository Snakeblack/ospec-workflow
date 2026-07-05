# Tasks: Add Documenter Agent

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-agents-002 Catalog Registration | MUST | `openspec/specs/agents/spec.md`, catalog additions | covered-by-design | Add `sdd-document` to agents spec catalog |
| REQ-agents-003 Command Roster | MUST | `openspec/specs/agents/spec.md`, command roster additions | covered-by-design | Add `/sdd-document` mapping to agents spec |
| REQ-agents-004 Launch Gate Mapping | MUST | `openspec/specs/agents/spec.md`, launch gate mapping | covered-by-design | Details launch-blocking `question_gate` |
| REQ-sdd-document-001 Agent Registration | MUST | `agents/sdd-document.agent.md`, `commands/sdd-document.prompt.md`, `models.yaml`, `openspec/specs/sdd-document/spec.md` | covered-by-design | Define files, tier mapping, and copy delta spec |
| REQ-sdd-document-002 Launch Gate | MUST | `skills/sdd-document/SKILL.md`, `agents/sdd-document.agent.md` | covered-by-design | Implement gate return on startup without scope |
| REQ-sdd-document-003 Option A Layout | MUST | `skills/sdd-document/SKILL.md` | covered-by-design | Generates OpenWiki structure under `openwiki/` |
| REQ-sdd-document-004 Option B Layout | MUST | `skills/sdd-document/SKILL.md` | covered-by-design | Generates SDD specs and status under `docs/wiki/` |
| REQ-sdd-document-005 Option C Layout | MUST | `skills/sdd-document/SKILL.md` | covered-by-design | Generates in validated user-defined custom path |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~400 source lines (+ ~1000 generated target lines) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Register and define the `sdd-document` agent, command, skill, and config | PR 1 | Base implementation and generator updates. |
| 2 | Create unit and integration tests for transforms, launch gate, options A/B/C and sandboxing | PR 1 | Verification tests. |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Foundation & Registration

- [x] 1.1 Add `sdd-document: default` in `models.yaml` under `agents:` [REQ-sdd-document-001]
- [x] 1.2 Merge delta spec requirements (`#REQ-agents-002`, `#REQ-agents-003`, `#REQ-agents-004`) from `openspec/changes/add-documenter-agent/specs/agents/spec.md` into baseline `openspec/specs/agents/spec.md` [REQ-agents-002, REQ-agents-003, REQ-agents-004]
- [x] 1.3 Copy/create baseline spec `openspec/specs/sdd-document/spec.md` from `openspec/changes/add-documenter-agent/specs/sdd-document/spec.md` [REQ-sdd-document-001]

## Phase 2: Core Implementation

- [x] 2.1 Create `agents/sdd-document.agent.md` referencing `skills/sdd-document/SKILL.md` and setting tools, model-tier [REQ-agents-002, REQ-sdd-document-001]
- [x] 2.2 Create `commands/sdd-document.prompt.md` mapping `/sdd-document` command to orchestrator [REQ-agents-003, REQ-sdd-document-001]
- [x] 2.3 Create `skills/sdd-document/SKILL.md` implementing the documentation generation, launch gate options, Option C path check, and write sandboxing boundaries [REQ-agents-004, REQ-sdd-document-002, REQ-sdd-document-003, REQ-sdd-document-004, REQ-sdd-document-005]

## Phase 3: Integration & Target Generation

- [x] 3.1 Run generator script `node scripts/configure/cli.js --target vscode` to build VS Code target [REQ-agents-002, REQ-agents-003]
- [x] 3.2 Run generator script for claude, github-copilot, opencode targets (`node scripts/check.js` will build all targets) [REQ-agents-002, REQ-agents-003]

## Phase 4: Testing & Verification

- [x] 4.1 Create test file `scripts/sdd-document.test.js` to assert CLI transform results under `dist/` [REQ-agents-002, REQ-agents-003]
- [x] 4.2 Add test cases in `scripts/sdd-document.test.js` to mock launch gate blocking behavior and verify validation logic [REQ-agents-004, REQ-sdd-document-002]
- [x] 4.3 Add test cases in `scripts/sdd-document.test.js` to mock generation for Option A, Option B, and Option C validated paths [REQ-sdd-document-003, REQ-sdd-document-004, REQ-sdd-document-005]
- [x] 4.4 Run all tests using node runner: `npm test` or `node scripts/check.js` [REQ-sdd-document-001]
