# Tasks: Cursor as a first-class native generator target

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-generator-006 / to-mdc + agents-protocol.mdc | MUST | `toMdcFile`, `rules.synthesize` routing, `cursor.js` profile | covered-by-design | Description from source frontmatter (ADR-001) |
| REQ-generator-007 / cursor hooks camelCase fan-out | MUST | `cursorHooks` in `target-transform.js`, profile `eventMap` | covered-by-design | `SubagentStop` dropped; placeholder `__OSPEC_CURSOR_ROOT__` |
| REQ-generator-008 / readonly on six review-* | MUST | `handleAgent` readonly branch, `profile.agentReadonly.agents` | covered-by-design | Omit key on non-reviewers (ADR-003) |
| REQ-generator-009 / cursor profile + toolMap + model | MUST | `scripts/lib/target-profiles/cursor.js`, degrade ASK_GATE, `resolveModel` | covered-by-design | Residue scoped to agents only per clarify |
| REQ-generator-009 / validator rejects agent residue | MUST | `validate-cursor.js` residue class | covered-by-design | Commands MAY keep `${input:…}` |
| generator / source tree six targets + sourceRoots | MUST | `cli.js` `runConfigure` + `profile.sourceRoots` (ADR-002) | covered-by-design | Only cursor loads `AGENTS.md` |
| generator / transform routing step 6 cursor hooks | MUST | `target-transform.js` dispatch order | covered-by-design | |
| generator / CLI `--target cursor` | MUST | `PROFILES.cursor` in `cli.js` | covered-by-design | Default `--out dist/cursor` |
| REQ-install-004 / build:cursor + setup:cursor idempotent | MUST | `install-cursor.js`, `package.json` scripts | covered-by-design | `--dry-run` no writes |
| REQ-install-005 / assertCursorPathSafe | MUST | `install-cursor.js` local guard | covered-by-design | Not `assertSafeDest` (ADR-004) |
| REQ-install-006 / sync-cursor retired | MUST | Delete `scripts/sync-cursor.js`, repoint npm scripts | covered-by-design | |
| REQ-install-007 / six-target matrix + docs | MUST | `check.js`, parity suites, `docs/` | covered-by-design | |
| REQ-agents-017 / chat question_gate prose | MUST | Cursor `toolMap` degrade markers in transform | covered-by-design | Envelope shape unchanged |
| REQ-agents-014 / branch + review parity six targets | MUST | Real-repo + parity tests extended to `cursor` | covered-by-design | |
| REQ-hooks-runtime-001 / placeholder expansion at install | MUST | `install-cursor.js` hooks.json write path | covered-by-design | Conditional quoting when path has space |
| hooks-runtime / per-target wiring table cursor row | MUST | Generated `hooks.json` + install expansion | covered-by-design | |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (command `${input:…}`/`agent:` strip explicitly deferred per clarify-001)

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1100–1300 |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR under `size:exception` with five slice-internal checkpoints (see Delivery Path) |
| Delivery strategy | exception-ok (single change + auto-until-verify pre-approved in `state.yaml`) |
| Chain strategy | size-exception |

**Delivery path (orchestrator gate):** Ship as **one PR under `size:exception`**, not stacked PRs. User approved single change + auto-until-verify; stacked-to-main would split mutually dependent transform/profile/validator/fixture code across reviewable-but-non-functional intermediate states. Apply in dependency order using **slice-internal checkpoints** (run focused `node --test …` or full `npm test` after each slice) so TDD evidence stays auditable within the oversized diff.

### Suggested Work Units

| Unit | Goal | Checkpoint | Est. lines |
|------|------|------------|------------|
| 1 | Profile + transform + cli registration | `node --test scripts/lib/target-transform.test.js` green | ~330 |
| 2 | `validate-cursor.js` + unit tests | `node --test scripts/configure/validate-cursor.test.js` green | ~330 |
| 3 | Golden fixture + six-target matrix | `npm test` green for generation targets (setup still on sync until unit 4) | ~250 |
| 4 | `install-cursor.js` + npm scripts + delete sync | `node --test scripts/configure/install-cursor.test.js` + full `npm test` | ~400 |
| 5 | Baseline spec deltas (archive), `config.yaml`, docs | Grep: no residual "four/five targets" in touched specs/docs | ~150 |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Slice 1: Profile + Transform (`profile+transform`)

- [x] 1.1 RED: add failing cases in `scripts/lib/target-transform.test.js` for `rules.strategy: "to-mdc"` — `.mdc` output with `description`/`globs`/`alwaysApply`, `applyTo` dropped [REQ-generator-006]
- [x] 1.2 RED: failing test for `rules.synthesize` routing `AGENTS.md` → `rules/agents-protocol.mdc` with profile `description` [REQ-generator-006, ADR-002]
- [x] 1.3 RED: failing tests for `hooks.format: "cursor"` — `version: 1`, camelCase fan-out (`PreToolUse` → two events), `SubagentStop` absent, `__OSPEC_CURSOR_ROOT__` in commands [REQ-generator-007]
- [x] 1.4 RED: failing tests for `readonly: true` only on listed six `review-*` ids; non-reviewers omit key [REQ-generator-008]
- [x] 1.5 RED: failing tests for cursor `toolMap` — native names in prose, both ask-tools degrade to ASK_GATE without literal names [REQ-generator-009, REQ-agents-017]
- [x] 1.6 GREEN: implement `toMdcFile`, synthesize-source routing, `cursorHooks`, readonly injection, and reuse existing degrade/`substituteProse` paths in `scripts/lib/target-transform.js` [REQ-generator-006, REQ-generator-007, REQ-generator-008, REQ-generator-009]
- [x] 1.7 GREEN: create `scripts/lib/target-profiles/cursor.js` (layout, `sourceRoots`, `to-mdc`, hooks, readonly list, toolMap, validate hook) [REQ-generator-009, ADR-001–003]
- [x] 1.8 GREEN: register `cursor` in `scripts/configure/cli.js` `PROFILES`; extend `runConfigure`/`loadTree` to honor `profile.sourceRoots` [REQ-generator-009, ADR-002]
- [x] 1.9 REFACTOR: confirm four existing golden targets unchanged; run `node --test scripts/lib/target-transform.test.js` — **Checkpoint 1**

## Slice 2: Validator (`validator`)

- [x] 2.1 RED: create `scripts/configure/validate-cursor.test.js` — clean tree → zero errors; one negative fixture per error class (structure, agent frontmatter, rules, hooks, agent residue) [REQ-generator-009]
- [x] 2.2 RED: assert commands with `${input:…}`/`agent:` alone do NOT fail validation [REQ-generator-009, clarify-001]
- [x] 2.3 GREEN: implement `scripts/configure/validate-cursor.js` with `{ validate, main }` contract and residue scoped to `agents/` [REQ-generator-009]
- [x] 2.4 TRIANGULATE: add boundary cases — missing `agents-protocol.mdc`, stray `vscode/` in agent body, unmapped abstract tool token [REQ-generator-009]
- [x] 2.5 Run `node --test scripts/configure/validate-cursor.test.js` — **Checkpoint 2**

## Slice 3: Golden + Six-Target Matrix (`golden+matrix`)

- [x] 3.1 RED: extend `scripts/configure/cli.test.js` golden loop to include `cursor`; test fails until fixture exists [REQ-generator-009, REQ-install-007]
- [x] 3.2 GREEN: commit `scripts/configure/__fixtures__/golden/cursor/**` (~13 files) from `__fixtures__/source` after slice 1 output stabilizes [REQ-generator-009]
- [x] 3.3 RED: extend `scripts/check.js` with `{ target: "cursor", validate: true }` [REQ-install-007]
- [x] 3.4 RED: extend `scripts/configure/real-repo.test.js` — six targets non-empty, cursor passes validator, no agent ask/abstract residue, every SDD agent has `model:` [REQ-install-007, REQ-agents-014, REQ-agents-017]
- [x] 3.5 GREEN: extend `scripts/{model-tier-contract,selective-4r-parity,strict-tdd-evidence-parity}.test.js` target arrays with `cursor` [REQ-agents-014]
- [x] 3.6 VERIFY: four existing goldens byte-identical; run `npm test` (generation matrix green; `setup:cursor` still points at sync until slice 4) — **Checkpoint 3**

## Slice 4: Installer + npm (`installer+npm`)

- [x] 4.1 RED: create `scripts/configure/install-cursor.test.js` — `assertCursorPathSafe` refuses root/symlink/escape; `--dry-run` writes nothing; idempotent second run; win32 placeholder expansion (POSIX slashes, quote only when path contains space) [REQ-install-004, REQ-install-005, REQ-hooks-runtime-001]
- [x] 4.2 GREEN: implement `scripts/configure/install-cursor.js` — `runConfigure({ target:"cursor", validate:true })` → sync to `~/.cursor`, expand `__OSPEC_CURSOR_ROOT__` on hooks write, `copyBinaryToTree` [REQ-install-004, REQ-install-005, REQ-hooks-runtime-001, ADR-004]
- [x] 4.3 GREEN: add `build:cursor` to `package.json`; repoint `setup:cursor` / `reload:cursor` to `install-cursor.js` [REQ-install-004, REQ-install-006]
- [x] 4.4 DELETE: remove `scripts/sync-cursor.js` [REQ-install-006]
- [x] 4.5 Run `node --test scripts/configure/install-cursor.test.js` then full `npm test` — **Checkpoint 4**

## Slice 5: Specs + Docs (`specs+docs`)

- [x] 5.1 Apply delta specs to `openspec/specs/{generator,install,agents,hooks-runtime}/spec.md` at **sdd-archive** (not during apply) [REQ-install-007]
- [x] 5.2 Update `openspec/config.yaml` architecture blurb four → six targets [REQ-install-007]
- [x] 5.3 Update install docs (`docs/` / README rows) documenting `build:cursor` and `setup:cursor` as supported flow [REQ-install-007]
- [x] 5.4 Grep-and-fix residual "four targets" / "five targets" wording in touched baseline specs and docs [REQ-agents-014, REQ-install-007]
- [x] 5.5 Final `npm test` green; record TDD evidence table in `apply-progress.md` — **Checkpoint 5**
