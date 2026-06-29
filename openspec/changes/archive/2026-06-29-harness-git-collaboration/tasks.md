# Tasks: Preparar el harness para colaboración git multi-desarrollador

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| Default branch resolution — per-field fail-open | MUST | `scripts/hooks/lib/git-state.js` + `internal/hooks/gitstate.go` `resolveGitState()` | covered-by-design | Three probes run independently; failure on one never suppresses the others |
| Working tree state via `git status --porcelain` | MUST | `resolveGitState()` dirty probe in both runtimes | covered-by-design | Non-empty output = dirty |
| `dirty:false` (clean) distinct from `dirty:null` (failed) | MUST | `*bool` in Go; separate try/catch per probe in Node | covered-by-design | Go nil=omit, Go &false=clean; Node null=failed, false=clean |
| Untracked-only state classified dirty | MUST | dirty probe returns non-empty for `??` entries | covered-by-design | Spec §Working Tree State Detection explicitly includes untracked files; `DISABLE_GIT_COLLABORATION_GUARD` is the user noise mitigation |
| Risky action = file-write tool OR `\bgit\s+commit\b` | MUST | `isRiskyAction()` in both runtimes | covered-by-design | Normalized tool name set: edit, write, createfile, writefile, editfile, applyedits, strreplaceeditor |
| Advisory-first: always `ask`, never `deny` | MUST | Step 5b after deny-pass, returns `ask` | covered-by-design | Guard cannot deny; DENY rules still fire in Step 5 before Step 5b |
| Combined advisory — single `ask` when both conditions hold | MUST | `composeAdvisory()` three-variant builder | covered-by-design | Spec §Combined advisory rule: no double prompts |
| Per-field fail-open — other checks continue when one probe fails | MUST | per-probe try/catch (Node) / per-probe CommandContext (Go) | covered-by-design | |
| Env-var bypass `DISABLE_GIT_COLLABORATION_GUARD=true` | MUST | checked first, before any git call, in both hooks and both runtimes | covered-by-design | Mirrors DISABLE_AGENT_SHIELD / DISABLE_TOKEN_ADVISOR pattern |
| Deny beats guard: DENY rules (Step 5) before Step 5b | MUST | insertion order in `evaluateToolUse()` / `Run()` | covered-by-design | Verified by deny-precedence test case |
| Go/Node parity — identical decisions for same inputs | MUST | shared fixture table replicated in both test suites | covered-by-design | Divergence = defect per spec |
| PreToolUse Step 5b position (after Step 5 + attribution, before Step 6) | MUST | data flow diagram in design | covered-by-design | Attribution-deny check also precedes Step 5b |
| SessionStart `gitCollaboration` field with `dirtyTree` | MUST | `sessionstart.js` + `sessionstart.go` | covered-by-design | Field omitted entirely when both conditions absent |
| `dirtyTree` OMITTED (not false) when `git status` fails | MUST | `*bool nil` in Go with `omitempty`; spread conditional in Node | covered-by-design | Never falsely reports clean |
| SessionStart `systemMessage` append | MUST | `result.systemMessage += "\n" + message` | covered-by-design | |
| Bypass suppresses SessionStart advisory | MUST | DISABLE env-var checked before any git call in sessionstart | covered-by-design | |
| branch-before-code Step 0 in branch-pr Workflow | MUST | `skills/branch-pr/SKILL.md` Workflow section | covered-by-design | Must precede current Step 1 |
| Multi-Developer Collaboration section (5 strategies) | MUST | `skills/branch-pr/SKILL.md` new section | covered-by-design | After Workflow, before Commands; 10–20 lines |
| branch-before-code + default-branch rule in Critical Rules | MUST | `skills/branch-pr/SKILL.md` Critical Rules | covered-by-design | Required for compact-rule extraction |
| Orchestrator branch recommendation in CORE zone | MUST | `agents/sdd-orchestrator.agent.md` | covered-by-design | SHOULD (advisory), MUST NOT gate sdd-apply dispatch |
| sdd-propose branch advisory on success envelope | MUST | `agents/sdd-propose.agent.md` | covered-by-design | Omitted on blocked envelopes |
| sdd-apply branch-status note in executive_summary | MUST | `agents/sdd-apply.agent.md` | covered-by-design | Non-blocking; no status:blocked for branch reasons |
| dist/ propagation to all four targets | MUST | `scripts/configure` regeneration post skill/agent edits | covered-by-design | claude, vscode, github-copilot, opencode |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none — untracked-files inclusion in dirty detection is settled by spec §Working Tree State Detection; bypass env-var is the designated user mitigation for high-ask-rate environments

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 850–1 100 source+tests (excl. dist/); ~1 200–1 500 including dist/ regeneration |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Unit 1: Node foundation + hook integration + Node tests; Unit 2: Go parity + Go tests; Unit 3: skills/agents + dist/ build |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | `git-state.js` + `pre-tool-use.js` + `session-start.js` modifications + all Node tests | PR 1 | Self-contained; settles Node interface that Go mirrors |
| 2 | `gitstate.go` + `pretooluse.go` + `sessionstart.go` modifications + all Go tests | PR 2 | Mirrors Unit 1; depends on Unit 1 interfaces being stable |
| 3 | `skills/branch-pr/SKILL.md` + three agent files + `scripts/configure` build + dist/ | PR 3 | Prose + build only; no runtime tests; mergeable independently |

> With `exception-ok`, a single oversized PR with `size:exception` label is the accepted path. The unit split above is provided for implementation-order clarity, not as a required PR chain.

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Node git-state foundation (new helper module)

- [x] 1.1 **RED** — Create `scripts/hooks/lib/git-state.test.js`; write failing tests for `resolveGitState(gitRunner?)`: (a) default-branch probe fails → dirty probe still runs; (b) dirty probe fails → `dirty` field is `null`, not `false`; (c) empty `--porcelain` output → `dirty:false`; (d) `?? newfile.txt` untracked-only output → `dirty:true` (validates spec decision: untracked files ARE dirty per spec §Working Tree State Detection; bypass is the noise mitigation); (e) git binary absent → all fields `null`; (f) non-zero exit on current-branch probe → `currentBranch:null`, other fields unaffected. Run `npm test` — expect failures.
- [x] 1.2 **RED** — In `scripts/hooks/lib/git-state.test.js`, add failing tests for `isRiskyAction(toolName, commands)`: write-tool names (`edit`, `write`, `createfile`, `writefile`, `editfile`, `applyedits`, `strreplaceeditor`) resolve to `true` after normalize; read-only names (`read`, `grep`, `glob`) resolve to `false`; command matching `\bgit\s+commit\b` returns `true` regardless of tool name; command not matching returns `false`. Run `npm test` — expect failures.
- [x] 1.3 **RED** — In `scripts/hooks/lib/git-state.test.js`, add failing tests for `composeAdvisory(onDefault, dirty, branchName)`: (a) default-only (`dirty:false`) → contains branch name and "rama por defecto", does NOT contain "sin commitear"; (b) dirty-only (`onDefault:false`) → contains "sin commitear", does NOT contain "rama por defecto"; (c) combined → contains both "rama por defecto" and "sin commitear" in a single string. Run `npm test` — expect failures.
- [x] 1.4 **GREEN** — Create `scripts/hooks/lib/` directory and `scripts/hooks/lib/git-state.js`; implement `resolveGitState(gitRunner?)` (three independent `execFileSync` probes, each in its own try/catch with a 5 s timeout, returning `{defaultBranch, currentBranch, dirty}`), `isRiskyAction(toolName, commands)`, and `composeAdvisory(onDefault, dirty, branchName)` (three Spanish message variants). Export all three. Run `npm test` — all Phase 1 RED tests must pass.

## Phase 2: Go git-state foundation (new gitstate.go)

- [x] 2.1 **RED** — Create `internal/hooks/gitstate_test.go`; write failing tests: (a) stubbed runner returns error on default-branch probe but succeeds on dirty probe → `dirty` non-nil; (b) empty porcelain output → `dirty = &false`; status probe error → `dirty = nil`; (c) `?? file.txt` porcelain line → `dirty = &true` (untracked-only triggers); (d) context deadline exhausted → all fields nil; (e) parity assertions: for each scenario (default-branch only, dirty-only, combined, clean-feature, bypass), record expected `permissionDecision` matching Phase 3/5 Node expectations. Run `go test ./internal/hooks/ -run TestGitState` — expect failures (file does not exist yet).
- [x] 2.2 **GREEN** — Create `internal/hooks/gitstate.go` in `package hooks`: define `gitStateResult{defaultBranch *string, currentBranch *string, dirty *bool}`; implement `resolveGitState(ctx context.Context)` with `exec.CommandContext` per probe under a shared 5 s deadline via `context.WithTimeout`; expose package-level `var gitRunner = defaultGitRunner` for test injection; implement `composeAdvisory(onDefault bool, dirty *bool, branchName string) string` (three Spanish variants matching Node). Run `go test ./internal/hooks/ -run TestGitState` — all 2.1 tests must pass.

## Phase 3: Node PreToolUse Step 5b integration

- [x] 3.1 **RED** — Extend `scripts/hooks/pre-tool-use.test.js` with Step 5b integration cases against temp-repo stubs or injected git runner: (a) file-write tool on default branch, clean tree → `ask`, reason contains "rama por defecto", not "sin commitear"; (b) file-write tool on `feat/x`, dirty tree → `ask`, reason contains "sin commitear", not "rama por defecto"; (c) file-write tool on default branch AND dirty tree → exactly one `ask`, reason contains both "rama por defecto" and "sin commitear"; (d) clean feature branch, write tool → `allow`; (e) `DISABLE_GIT_COLLABORATION_GUARD=true` + dirty main → `allow`, git runner not invoked; (f) `git push --force` command on dirty main → `deny` (DENY rule wins at Step 5, guard never reached); (g) read-only tool (`Grep`) on dirty main → `allow`; (h) `git commit -m "mensaje"` on default branch → `ask` from guard (guard fires before ASK loop on commit commands). Run `npm test` — expect failures on new cases.
- [x] 3.2 **GREEN** — Modify `scripts/hooks/pre-tool-use.js`: (a) require `{resolveGitState, isRiskyAction, composeAdvisory}` from `./lib/git-state.js`; (b) in `evaluateToolUse`, after the attribution-deny check and before the ASK loop, insert Step 5b: skip if `DISABLE_GIT_COLLABORATION_GUARD==="true"`, then check `isRiskyAction(toolName, commands)`, resolve git state, build advisory, and return `makeDecision("ask", advisory)` when applicable; (c) add `DISABLE_GIT_COLLABORATION_GUARD` check to the initial bypass guard chain; (d) export `isRiskyAction` in `module.exports`. Run `npm test` — all Phase 3 RED tests must pass.

## Phase 4: Node SessionStart advisory integration

- [x] 4.1 **RED** — Extend `scripts/hooks/session-start.test.js` with `gitCollaboration` advisory cases (inject git runner into `runSessionStart` opts or via temp repos): (a) default branch + clean tree → result has `gitCollaboration.status:"warning"` with `dirtyTree:false`, `systemMessage` contains "rama por defecto"; (b) feature branch + dirty tree → `gitCollaboration.dirtyTree:true`, `systemMessage` contains "sin commitear"; (c) default branch AND dirty tree → single `gitCollaboration` entry with `dirtyTree:true`, message mentions both conditions; (d) clean feature branch → `gitCollaboration` key absent from result; (e) `DISABLE_GIT_COLLABORATION_GUARD=true` → no `gitCollaboration` key, `systemMessage` unaffected; (f) git binary absent → no `gitCollaboration`, registry/baseline/security outputs unaffected; (g) `git status --porcelain` fails but branch resolves to default → `gitCollaboration` present for default-branch condition, `dirtyTree` field NOT present in output (not `false`). Run `npm test` — expect failures.
- [x] 4.2 **GREEN** — Modify `scripts/hooks/session-start.js`: after the `result.security` block (and guarded by `DISABLE_GIT_COLLABORATION_GUARD !== "true"`), call `resolveGitState()`; when `onDefault || (dirty === true)`, build `gitCollaboration = {status:"warning", currentBranch, defaultBranch, ...(dirty !== null && {dirtyTree: dirty}), message}`, assign to `result.gitCollaboration`, and append message to `result.systemMessage` (with newline separator). Run `npm test` — all Phase 4 RED tests must pass.

## Phase 5: Go PreToolUse Step 5b integration

- [x] 5.1 **RED** — Extend `internal/hooks/pretooluse_test.go` with Step 5b cases mirroring the Node corpus: (a) write tool on default branch, clean → `permissionDecision:"ask"`, reason contains "rama por defecto"; (b) write tool on feature branch, dirty → `ask`, reason contains "sin commitear"; (c) combined → single `ask`, reason contains both; (d) clean feature branch → `allow`; (e) `DISABLE_GIT_COLLABORATION_GUARD=true` → `allow`; (f) `git push --force` command → `deny` (deny-pass wins); (g) read-only tool → `allow`. Run `go test ./internal/hooks/ -run TestPreToolUse` — expect failures on Step 5b cases.
- [x] 5.2 **GREEN** — Modify `internal/hooks/pretooluse.go`: (a) add `isRiskyToolName(name string) bool` helper using same normalized-name set as Node; (b) in `Run()`, after the attribution-check deny-pass and before the ASK-pass, insert Step 5b block: check `os.Getenv("DISABLE_GIT_COLLABORATION_GUARD")`, call `isRiskyAction()`, call `resolveGitState()` with a 5 s context, call `composeAdvisory()`, and return `makeDecision("ask", reason)` when applicable. Run `go test ./internal/hooks/ -run TestPreToolUse` — all Phase 5 RED tests must pass.

## Phase 6: Go SessionStart advisory integration

- [x] 6.1 **RED** — Extend `internal/hooks/sessionstart_test.go` mirroring Node SessionStart advisory corpus: (a) default+clean → `GitCollaboration` non-nil with `DirtyTree: &false`; (b) feature+dirty → `DirtyTree: &true`; (c) combined → single entry, `DirtyTree: &true`, message contains both conditions; (d) clean feature → `GitCollaboration` nil; (e) bypass env var → nil; (f) git absent → nil, rest of `sessionStartOutput` unaffected; (g) status probe fails + branch resolves to default → `GitCollaboration` non-nil, `DirtyTree` field nil (JSON `omitempty` drops it from output). Run `go test ./internal/hooks/ -run TestSessionStart` — expect failures on advisory cases.
- [x] 6.2 **GREEN** — Modify `internal/hooks/sessionstart.go`: (a) define `gitCollaborationResult` struct with `Status string`, `CurrentBranch *string`, `DefaultBranch *string`, `DirtyTree *bool json:"dirtyTree,omitempty"`, `Message string`; (b) add `GitCollaboration *gitCollaborationResult json:"gitCollaboration,omitempty"` field to `sessionStartOutput`; (c) after the security block and guarded by `DISABLE_GIT_COLLABORATION_GUARD`, call `resolveGitState()` with a 5 s context and compose + assign advisory; append to `out.SystemMessage`. Run `go test ./internal/hooks/ -run TestSessionStart` — all Phase 6 RED tests must pass.

## Phase 7: Skills and agent prompt updates

- [x] 7.1 Modify `skills/branch-pr/SKILL.md`: (a) in the Workflow code block, insert Step 0 `"0. Crear una rama de feature: git checkout -b <tipo>/<descripción> main"` as the first entry, before current Step 1; (b) add `## Multi-Developer Collaboration` section after the Workflow section and before the Commands section — include all five strategies: branch hygiene (one branch per task, `<type>/<description>`, delete after merge), default-branch protection (NEVER edit or commit on `main`), sync coordination (pull before branching; rebase feature branches regularly), parallel work (dedicated branches per developer; integrate via PR only), and commit conventions (Conventional Commits, Spanish imperative, atomic and buildable); keep section to 10–20 lines; (c) append two entries to Critical Rules: "Feature branch MUST be created before any project file is edited" and "NEVER edit files or commit directly on the default branch (`main`)".
- [x] 7.2 Modify `agents/sdd-orchestrator.agent.md`: in the CORE zone, immediately before the `sdd-apply` dispatch instruction, add a branch-before-code SHOULD advisory (e.g. "Antes de despachar `sdd-apply`, se RECOMIENDA confirmar que hay una rama de feature activa — consulta el skill `branch-pr` para la convención `<tipo>/<descripción>`"); mark it explicitly advisory (MUST NOT block or gate the dispatch).
- [x] 7.3 Modify `agents/sdd-propose.agent.md`: in the success-envelope return instructions, append a branch advisory note that reads on success: reference the `branch-pr` skill and the `<type>/<description>` convention and state that a feature branch SHOULD be created before `sdd-apply` begins; note MUST appear in `executive_summary` or as a trailing paragraph in `proposal.md`.
- [x] 7.4 Modify `agents/sdd-apply.agent.md`: in the `executive_summary` instructions, require a non-blocking branch-status note — "Working on branch `<name>`" when resolvable, or "Branch status unknown — ensure a feature branch is active before merging" when not; `status` MUST NOT be `blocked` for this reason alone.

## Phase 8: Build propagation and end-to-end verification

- [x] 8.1 **RED** — Add a content assertion test (new file `scripts/configure.test.js` or equivalent) that reads the generated orchestrator output for each of the four `dist/` targets (claude, vscode, github-copilot, opencode) and asserts the branch-before-code recommendation text is present. Run `npm test` before Phase 7 changes are built into dist/ — expect failures (text absent until configure runs).
- [x] 8.2 **GREEN** — Run `scripts/configure` (or the equivalent project build command) to regenerate all `dist/**` targets from the modified skill and agent sources; the Phase 7 edits must propagate to all four output targets. Run `npm test` — 8.1 assertions must now pass.
- [x] 8.3 Final verification: run `npm test` for complete Node suite (all phases); run `go test ./internal/...` for full Go suite; set `DISABLE_GIT_COLLABORATION_GUARD=true` and confirm no advisory fires in both Node and Go hook paths; in a temp repo with an untracked file on a feature branch, confirm the dirty-tree advisory fires at PreToolUse for a write tool (validates the untracked-only decision from Phase 1).
