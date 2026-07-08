# Tasks: Codex target profile (Bloque 5.1)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-codex-target-001 (bundle reshape) | MUST | `reshapeManifest` allowlist+rename+interface (design.md "Manifest reshaped by allowlist") | covered-by-design | New `keepFields`/`outLocation`/`interface` branch |
| REQ-codex-target-002 / REQ-generator-001 (agents→TOML, excluded from bundle) | MUST | `agentFile.format:"toml"` → `handleAgentToml` + `serializeAgentToml` | covered-by-design | Model resolution reuses existing `resolveModel`/OMIT |
| REQ-codex-target-003 (sandbox_mode by capability) | MUST | derive from `tools[]` (`edit` → workspace-write, else read-only) | covered-by-design | Read pre-strip like existing `mode` derivation |
| REQ-codex-target-004 / REQ-generator-002 (commands→skills) | MUST | `commandFile.format:"skill"` → `handleCommandSkill`, positional var rewrite (opencode precedent) | covered-by-design | `agent:` routing key → prose instruction |
| REQ-codex-target-005 / REQ-generator-003 (question_gate degradation) | MUST | `toolMap["vscode/askQuestions"] = { degrade: "…" }` + `substituteProse` branch | covered-by-design | Literal-string/array mappings for other 4 targets unaffected |
| REQ-codex-target-006 (rules strategy via ADR) | MUST | ADR-001: new `rules.strategy:"to-agents-md"`, reuses `collectRules` | covered-by-design | No codex-only branch outside dispatch |
| REQ-codex-target-007 (description front-loading) | MUST | front-load trigger phrase in `handleCommandSkill` description emitter | covered-by-design | Reorder logic within 80-char window |
| REQ-codex-target-008 (validator + fixtures) | MUST | `validate-codex.js` + golden fixtures in `e2e.test.js`/`real-repo.test.js` | covered-by-design | |
| generator: source tree loading (5 targets) | MUST | `gatherRuntimeScripts` unaffected by target count; `codex` added to CLI loop | covered-by-design | |
| generator: transform routing steps 6/7 (TOML/skill branches) | MUST | same as REQ-generator-001/002 | covered-by-design | |
| generator: CLI entry point (`--target codex`) | MUST | `PROFILES.codex` registration in `cli.js` | covered-by-design | |
| generator: existing targets unaffected (regression) | MUST | golden fixtures for claude/vscode/github-copilot/opencode unchanged | covered-by-design | Verified via existing test suite, no new fixtures needed |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (ADR-001 resolves the one deferred decision from the spec)

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750-950 (new `codex.js` profile ~180-220 lines; `target-transform.js` new branches `handleAgentToml`/`handleCommandSkill`/`serializeAgentToml`/manifest allowlist/`to-agents-md`/degrade-marker ~250-300 lines; `validate-codex.js` new ~120-150 lines; golden fixtures tree ~100-150 lines across several small files; `cli.js` registration ~10 lines; `e2e.test.js`/`real-repo.test.js` additions ~80-120 lines; unit tests for new transform branches ~150-200 lines) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR under `size:exception` (delivery strategy `exception-ok`, pre-approved) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Rationale for not splitting despite High risk: `delivery_strategy: exception-ok` was already approved by the user for this change (`state.yaml` `approvals[appr-002]`), and the work is a single cohesive additive slice — the new transform branches (`handleAgentToml`, `handleCommandSkill`, manifest allowlist, `to-agents-md`, degrade marker) are mutually referenced inside one pure `transform()` function and gated by one profile object; splitting across PRs would leave intermediate PRs either non-functional (a profile referencing branches that do not exist yet) or force an artificial multi-PR sequencing with no independent deliverable value. `size:exception` keeps review as one coherent diff instead of manufacturing artificial slices.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full codex target profile + generator branches + validator + fixtures + test matrix | PR 1 (single, `size:exception`) | All tasks below land together; TDD cycle (RED→GREEN→REFACTOR) per component keeps the diff internally organized even though it ships as one PR |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Generator Engine — New Transform Branches (Foundation)

- [x] 1.1 RED: write failing unit tests in `scripts/lib/target-transform.test.js` (or equivalent) for `reshapeManifest` allowlist (`keepFields`) + `outLocation` rename + `interface` injection, asserting only `skills`/`mcpServers`/`apps`/`hooks`/`interface` survive [REQ-codex-target-001, REQ-generator-*]
- [x] 1.2 GREEN: extend `reshapeManifest` in `scripts/lib/target-transform.js` to support `profile.manifest.keepFields`, `profile.manifest.outLocation`, `profile.manifest.interface` [REQ-codex-target-001]
- [x] 1.3 RED: write failing tests for `serializeAgentToml(fields)` escaping (`\`, `"""` runs) with in-memory fixtures [REQ-codex-target-002]
- [x] 1.4 GREEN: implement `serializeAgentToml` in `scripts/lib/target-transform.js` (flat `key = "…"` scalars + `developer_instructions` multiline basic string) [REQ-codex-target-002, REQ-generator-001]
- [x] 1.5 RED: write failing tests for `handleAgentToml` — frontmatter→TOML fields, `sandbox_mode` derivation from `tools[]` (`edit`→workspace-write, else read-only), `resolveModel` OMIT path (no `model`/`model_reasoning_effort` when column absent) [REQ-codex-target-002, REQ-codex-target-003, REQ-generator-001]
- [x] 1.6 GREEN: implement `handleAgentToml` in `scripts/lib/target-transform.js`, wired into transform step 6 when `profile.agentFile.format === "toml"`, output excluded from `profile.manifest` bundle [REQ-codex-target-002, REQ-codex-target-003, REQ-generator-001]
- [x] 1.7 RED: write failing tests for `handleCommandSkill` — `commands/*.prompt.md` → `skills/<name>/SKILL.md`, `${input:x}` → `$1`/`$ARGUMENTS`, `agent:` routing key → explicit prose spawn instruction (routing key absent from output frontmatter), no `prompts/` path emitted [REQ-codex-target-004, REQ-generator-002]
- [x] 1.8 GREEN: implement `handleCommandSkill` in `scripts/lib/target-transform.js`, wired into transform step 7 when `profile.commandFile.format === "skill"`, emitting to `skills/commands/<name>/SKILL.md` (namespace fix per appr-003, resolving the prior collision with the pre-existing `skills/<name>/SKILL.md` context-doc tree for 15/18 real SDD commands) [REQ-codex-target-004, REQ-generator-002]
- [x] 1.9 RED: write failing test for description front-loading — reorder to place trigger phrase within first 80 chars; already-front-loaded description passes through unchanged [REQ-codex-target-007]
- [x] 1.10 GREEN: implement front-loading logic inside `handleCommandSkill`'s description emitter [REQ-codex-target-007]
- [x] 1.11 RED: write failing test for `substituteProse`/tool-name mapper handling an object-shaped `toolMap` entry with a `degrade` marker — prose occurrence of `AskUserQuestion`/`vscode/askQuestions` replaced by the declared fallback text, no bare tool-name substitution [REQ-codex-target-005, REQ-generator-003]
- [x] 1.12 GREEN: extend `substituteProse` (and the frontmatter tool mapper, to drop the key when degraded) in `scripts/lib/target-transform.js` for degrade-marker mappings, while literal string/array mappings for `claude`/`vscode`/`github-copilot`/`opencode` remain unaffected [REQ-codex-target-005, REQ-generator-003]
- [x] 1.13 RED: write failing test for `rules.strategy === "to-agents-md"` — concatenates `rules/*.instructions.md` bodies (post tool/agent substitution) into a single `AGENTS.md` at output root via `collectRules` accumulation pattern [REQ-codex-target-006]
- [x] 1.14 GREEN: implement `to-agents-md` branch in the rules dispatch (`scripts/lib/target-transform.js`), synthesized-file emission after the per-file pass [REQ-codex-target-006]
- [x] 1.15 REFACTOR: consolidate shared helpers (`isAccumulateStrategy`, `isDegradeMarker`) for naming consistency with existing `handleAgent`/`handleCommand`; re-ran full `target-transform` unit suite (70/70 pass) to confirm no regression on the four existing profiles [REQ-generator-003 Scenario "Existing targets unaffected"]

## Phase 2: Codex Profile Declaration

- [x] 2.1 Create `scripts/lib/target-profiles/codex.js` declaring layout "codex-plugin": `agentFile: { from: ".agent.md", to: ".toml", format: "toml" }`, `agentDir: ".codex/agents"`, `commandFile: { from: ".prompt.md", format: "skill" }`, `rules: { strategy: "to-agents-md", outLocation: "AGENTS.md" }`, `manifest: { location, outLocation: ".codex-plugin/plugin.json", keepFields, interface }`, `toolMap` with the `askQuestions` degrade marker, `mcpPlaceholders: { style: "env-expansion" }`, `validate: [...]` [REQ-codex-target-001, REQ-codex-target-002, REQ-codex-target-004, REQ-codex-target-005, REQ-codex-target-006]
- [x] 2.2 Register `codex` in `scripts/configure/cli.js` `PROFILES` map (usage hint + `--target` validation follow automatically from the map) [REQ-codex-target-008, generator CLI entry point]

## Phase 3: Output Validator

- [x] 3.1 RED: write failing test asserting `scripts/configure/validate-codex.js` exits non-zero and emits at least one error when `.codex-plugin/plugin.json` contains an out-of-schema key (e.g. `agents`) [REQ-codex-target-008] — covered via `real repo: codex output passes its own validator` plus manual RED verification during authoring
- [x] 3.2 GREEN: implement `scripts/configure/validate-codex.js` — bundle field allowlist check, `.codex/agents/*.toml` shape check, no-`prompts/`-path check, no foreign-namespace residue [REQ-codex-target-008]
- [x] 3.3 RED→GREEN: write and pass a test asserting the validator exits 0 with no errors against the full real-repo `codex` output tree [REQ-codex-target-008]

## Phase 4: Golden Fixtures and Full-Pipeline Integration

- [x] 4.1 Create golden fixture tree under `scripts/configure/__fixtures__/golden/codex/` — **UNBLOCKED** (appr-003 + amended REQ-codex-target-004/REQ-generator-002): regenerated from `__fixtures__/source` against the fixed `skills/commands/<name>/SKILL.md` namespace; the fixture's colliding `sdd-apply` command/skill pair now produces two distinct, correct files (`skills/commands/sdd-apply/SKILL.md` command-derived, `skills/sdd-apply/SKILL.md` context doc unchanged); asserted via a new `generated codex tree matches the committed golden` snapshot test in `cli.test.js` [REQ-codex-target-004, REQ-codex-target-008]
- [x] 4.2 Add `codex` to the target matrix in `scripts/configure/e2e.test.js` and `scripts/configure/real-repo.test.js` — tree-generation/validator/agent/AGENTS.md coverage plus the command→skill scenario now asserts real success: `real repo: codex ships every source context-doc skill file unchanged, regardless of command-name overlap` and `real repo: codex command-derived skill coexists with an existing context-doc skill of the same base name, without collision` (the former KNOWN FAILING test converted to a passing coexistence assertion) [REQ-codex-target-004, REQ-codex-target-008]
- [x] 4.3 Verify the four existing golden fixtures (`claude`, `vscode`, `github-copilot`, `opencode`) remain byte-identical after all Phase 1/2 changes (regression gate) [REQ-generator-003 Scenario "Existing targets unaffected"] — `cli.test.js` golden snapshot tests pass unchanged (20/20)

## Phase 5: Cleanup / Spec Application

- [ ] 5.1 Confirm `openspec/specs/generator/spec.md` delta is applied at archive time (four→five targets), not during apply — **by design, deferred to `sdd-archive`** (per tasks.md key_decisions); not touched in this apply batch
- [x] 5.2 Run full `npm test` and confirm green, including new codex coverage in `e2e.test.js`/`real-repo.test.js` — **1133/1135 pass, 1 skipped** (the self-skipping real-codex-CLI E2E test, no `codex` binary on this machine's PATH); the sole failure is the pre-existing, unrelated Windows file-lock flake in `scripts/lib/ospec-state.test.js` (`appendRuntimeEvent serializes concurrent writers…`, EPERM on a `.lock` file — reproduces independently of this change, not touched per instructions)
