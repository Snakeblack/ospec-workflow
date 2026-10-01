# Design: Add Engram Session Memory (Claude Code first)

## Technical Approach

Mode: `design-after-spec` (session-memory, project-memory, install, generator, skills deltas). Per `approvals.architecture-001`, ospec **composes** with the upstream `engram` plugin: there is no ospec MCP entry and no ospec hook changes. ospec ships three things:

1. **A rules addendum that only Claude gets**: `rules/engram-session-memory.instructions.md`. The Claude profile (`rules.strategy: inline-into-orchestrator`) inlines it into `skills/sdd-orchestrator/SKILL.md`. Every other profile drops it.
2. **Fail-open detection in `setup:claude`**, with an explicit opt-in flag for anything that changes configuration.
3. **Contract tests and documentation fixes** that enforce non-authority and the target boundary.

Memory behavior applies only when Engram MCP tools exist in the main session. Phase agents have `tools: ['read','search','edit']` (`agents/sdd-design.agent.md:4`) and skills declare `mcp: false`, so **only the orchestrator** saves pointers and recalls.

## Architecture Decisions

### Decision: Claude-only addendum via `rules/` + profile `drop`, with `collectRules` honoring `drop` (ADR-001)

| Option | Tradeoff | Decision |
|---|---|---|
| `rules/engram-session-memory.instructions.md` + `drop` entry in the 6 non-Claude profiles | Follows the existing declarative `drop` pattern. A new target must remember the drop, so a test enumerates `PROFILES` to fail closed. | **Chosen** |
| New frontmatter `targets: [claude]` in the rules file | Excludes new targets by default, but adds a source-format contract with one consumer. vscode's identity passthrough would need a new filter too. | Rejected |
| Prose in `agents/sdd-orchestrator.agent.md` | That file ships to every target, which leaks the addendum (violates REQ-session-memory-009). | Rejected |

**Evidence**: `collectRules` (`scripts/lib/target-transform.js:501-525`) accumulates every `rules/*` file **without checking `isDropped`**. For codex (`to-agents-md`), a `drop` entry alone would still put the addendum into `AGENTS.md`. Fix: skip files where `isDropped(file.path, profile)` in `collectRules`. No profile drops a `rules/` path today, so existing output does not change. vscode has no `drop` field, so one is added. For Claude, the "rules tree" in the REQ-generator-018 scenario means the inlined orchestrator skill: Claude emits no `rules/` directory (`cli.test.js:60`).

### Decision: `--with-engram` opt-in flag and a separate `engram-setup.js` module (ADR-002)

| Option | Tradeoff | Decision |
|---|---|---|
| CLI flag `npm run setup:claude -- --with-engram` | Explicit and scriptable. Matches the existing `--build-only`. The TUI path (`installer-adapter.js` calls `main([])`) gets guidance only. | **Chosen** |
| Interactive prompt | `install-claude.js` is non-interactive. A prompt would block non-TTY runs and the Go TUI delegation. | Rejected |
| Env var `OSPEC_ENGRAM_SETUP=1` | Ambient state can leak into unrelated runs. `pre-tool-use.js:295-307` already avoids env-only switches for this reason. | Rejected |

The probing, planning and execution logic gets its own module, `scripts/configure/engram-setup.js`, with an injected `spawnSync`-compatible `spawn`. `install-claude.js` uses module-level `run`/`listOutput` that tests can't inject, and REQ-install-014 makes them abort on failure. Engram steps need the opposite semantics (warn, never fail), so they must not reuse those helpers.

### Decision: Orchestrator-only saves; recall runs after `state.yaml` (ADR-003)

- **Save**: after a phase returns `success` or `partial` and the `state.yaml` projection succeeds, the orchestrator calls `mem_save` once. Blocked returns save nothing.
- **Recall** on `/sdd-continue` or after compaction: first resolve the next phase from `state.yaml`, **then** optionally recall `sdd/{change}/` for hints.

This order makes REQ-session-memory-002/007 hold by construction. Recall cannot change routing because it runs after routing.

### Decision: No ospec hook changes (repo-verified composition)

| Surface | Fact (repo) | Interaction | Action |
|---|---|---|---|
| PreToolUse | `hooks/hooks.json` has no matcher, so ospec fires for `mcp__*engram*__mem_*` too. mem_* inputs carry no `command`, so the result is an explicit `allow` (`pre-tool-use.js:436-441`; Go mirror `internal/hooks/pretooluse.go:477`). | Additive with the upstream matcher hook. This already applies to every MCP tool. | None |
| PreToolUse shield/token advisor | `extractPaths` probes every string in `tool_input` as a file path (`pre-tool-use.js:178-206`). | A field whose value is a bare existing path triggers the secret scan and fake token accounting. | Addendum: paths go only inside multi-line `content`, never as a bare field value |
| SessionStart | ospec has no matcher. It writes registry/status JSON. | Upstream injects memory context. Outputs are additive, with no shared files. | None |
| PreCompact / Stop | ospec writes a `state.yaml`-derived summary via `store.writeSessionSummary` (`pre-compact.js:503-517`). | Upstream recovery after compaction is SessionStart(`compact`). The two use different stores. | None |
| SubagentStop | ospec checks skill resolution. Upstream captures asynchronously. | Upstream may capture sub-agent output (see Risks). | None |

### Decision: Edit the project-memory baseline at archive, not apply

`baseline_fingerprints.project-memory` is recorded. If apply edits `openspec/specs/project-memory/spec.md`, `sdd-archive` returns `stale-baseline` (`skills/_shared/gate-change-collision.md:105-110`). So the Purpose sentence and the Session memory row are edited by `sdd-archive` when it merges REQ-project-memory-001 (per its Archive note). The apply-time drift test only asserts that the file has no native/built-in claims, which is true both before and after archive.

## Data Flow

```
Phase completion (Claude main session)
  sdd-<phase> agent ──envelope──▶ orchestrator ──▶ PhaseCompletionReducer ──▶ state.yaml (canonical)
                                       │ (only if mem_* tools present AND projection ok)
                                       └──mem_save{topic_key: sdd/{change}/{phase}, capture_prompt:false}──▶ Engram
                                              error/timeout ─▶ ignored, no retry, flow continues

/sdd-continue or post-compaction
  orchestrator ──read──▶ state.yaml ──▶ next phase DECIDED
       └─(optional) mem_search sdd/{change}/ ──▶ hint ──contrast──▶ OpenSpec + git live
                                                   mismatch ─▶ report conflict, live state wins
```

```
setup:claude [--with-engram]
  build ─fail─▶ exit≠0 (Engram step skipped)
    └ ok ─▶ ospec marketplace/plugin (REQ-install-014 unchanged) ─fail─▶ exit 1 (skipped)
              └ ok / claude CLI absent ─▶ engramStep (try/catch, never alters exit code)
                   detect: engram version · doctor --json · claude plugin list · claude mcp list
                   no opt-in ─▶ guidance only
                   opt-in & claude CLI present:
                     plugin absent ─▶ marketplace add (if missing) + plugin install
                     re-probe mcp ─▶ absent ─▶ engram setup claude-code
                     each failure ─▶ warning
```

`--build-only` skips the Engram step entirely.

## File Changes

| File | Action | Description |
|---|---|---|
| `rules/engram-session-memory.instructions.md` | Create | Addendum: applicability guard, trust boundary, save/recall protocol, failure policy, non-duplication |
| `scripts/lib/target-transform.js` | Modify | `collectRules` skips `isDropped` paths |
| `scripts/lib/target-profiles/{github-copilot,opencode,codex,cursor,antigravity}.js` | Modify | Add `"rules/engram-session-memory.instructions.md"` to `drop` |
| `scripts/lib/target-profiles/vscode.js` | Modify | Add a `drop` field with that entry |
| `scripts/configure/engram-setup.js` | Create | `detectEngram`, `planEngramActions` (pure), `runEngramStep` (never throws) |
| `scripts/configure/install-claude.js` | Modify | Parse `--with-engram`; call the step on the success path and the CLI-absent path; inject `deps.engramStep` |
| `skills/_shared/sdd-phase-common.md` | Modify | Host-neutral Session memory row ("optional, non-authoritative host adapter, e.g. Engram on Claude Code; see `session-memory`") |
| `docs/comparacion-arneses.md` | Modify | Line 70: drop "Integración nativa"; describe an optional adapter |
| `README.md`, `README.es.md` | Modify | One line on `--with-engram` and the bash requirement |
| `openspec/specs/project-memory/spec.md` | Modify (archive) | Purpose and row, via sdd-archive only |
| Tests | Create/Modify | See Testing Strategy |

## Interfaces / Contracts

```js
// scripts/configure/engram-setup.js — spawn: spawnSync-compatible, injected
detectEngram({ spawn, claudeBin, timeoutMs = 10000 }) -> {
  binary: { found, bin, version },            // candidates: engram, engram.exe
  doctor: "ok" | "warn" | "error" | "timeout" | "skipped",
  plugin: "registered" | "absent" | "unknown", // /\bengram@[\w.-]+/ in `claude plugin list`
  mcp:    "registered" | "absent" | "unknown", // /^(plugin:engram:)?engram\b/m in `claude mcp list`
}
planEngramActions(detection, { optIn }) -> Array<{ id, bin, argv }> // [] unless optIn && claudeBin
runEngramStep({ argv, claudeBin, spawn, stdout, stderr }) -> void   // never throws
```

Mutating argv set (and nothing else): `plugin marketplace add`, `plugin install`, `setup claude-code`. Any `unknown` detection means no mutation.

Pointer save contract (enforced by the addendum): `topic_key: sdd/{change}/{phase}`, `capture_prompt: false`, `title: "SDD {change} {phase} ({status})"`, and `content` = `executive_summary`, a line listing repo-relative artifact paths, and `canonical: openspec/changes/{change}/state.yaml`. Never secrets, artifact bodies, diffs, prompts, or tool payloads.

Addendum prose constraint: `k1-prose-authority` scans `rules/`. Any sentence that pairs recall/conversation with state/decision words must carry a prohibition token (MUST NOT/never).

## Testing Strategy

| Requirement | Trigger and conditions | Expected response | Verification |
|---|---|---|---|
| session-memory-002 | Scan `scripts/lib/**`, `scripts/hooks/**`, `internal/**`, `cmd/**` (non-test), `schemas/kernel/**`, `hooks/hooks.json`, `.mcp.json`, `agents/**`, `commands/**`, `skills/**`, `rules/**` for `/engram\|\bmem_[a-z_]+/i` | Zero hits outside allowlist {addendum, `sdd-phase-common.md`} | `scripts/session-memory-contract.test.js` (new) |
| session-memory-003/004/005/006/007/001 | Addendum content | Contains guard, untrusted-data, conflict, no-secrets, topic_key/capture_prompt, state-first recall | Same file, landmark asserts. Gap: LLM compliance is inspection-only |
| session-memory-008/009, generator-018 | `runConfigure` from ROOT into `mkdtemp` for every `PROFILES` id | Claude: addendum heading present in orchestrator skill; no `engram` in `.mcp.json`/hooks. Non-Claude: no `engram` content except `skills/_shared/sdd-phase-common.md` | `scripts/configure/engram-scope.test.js` (new). Never reads `dist/`. Allowlist scan stands in for a before/after diff |
| codex leak path | Fixture profile `to-agents-md`/inline with `drop` on a rules path | Dropped rule is absent from AGENTS.md/orchestrator | `scripts/lib/target-transform.test.js` (modify) |
| install-028 | Fake spawn: binary absent; doctor exit 1; `ETIMEDOUT` | Guidance/warning; `main` returns 0 | `scripts/configure/engram-setup.test.js` (new) + `install-claude.test.js` |
| install-029 | No flag, unregistered; flag with registered/absent claude CLI | Zero mutating argv without opt-in; with opt-in, plugin then conditional setup; a failure is a warning with exit 0 | Spawn call log asserts |
| install-030 | Flag, plugin and MCP registered | No mutating argv; "already configured" | Same |
| install-028 (other installers) | Static scan of `scripts/configure/install-*.js` | Only `install-claude.js` references `engram-setup` | `engram-setup.test.js` |
| install-014 regression | `--build-only`; ospec install failure; engram step throws | Step skipped / exit code unchanged | `install-claude.test.js` |
| skills-020, session-memory-010 | Read the three docs | Neutral row references `session-memory`; no `/nativ\|built-in/` near Engram; Phase-Read Table unchanged | `scripts/operative-memory-contract.test.js` (modify) |

## Migration / Rollout

No migration. No `state.yaml` field depends on Engram. Forecast is about 600 changed lines (over budget 400). Suggested slices: (1) generator, addendum, contract tests, docs; (2) installer detection and opt-in. Rollback: revert the merge. Users can remove upstream with `claude plugin uninstall engram` / `claude mcp remove engram`.

## Risks

- **Upstream SubagentStop/SessionEnd capture may store sub-agent output.** ospec doesn't control it, and REQ-005 binds ospec-initiated saves only. Documented as residual next to the accepted memory-poisoning risk.
- **ospec PreToolUse already auto-`allow`s every MCP tool, mem_* included.** This predates the change; non-blocking follow-up.
- **Upstream CLI output formats are unverified here** (no execute tool in this phase). Detection regexes are pinned only by fixtures.

## Open Questions

- [ ] Apply must check the upstream `.claude-plugin/marketplace.json` `name` (assumed `engram`, source `Gentleman-Programming/engram`) and the real `claude mcp list` line format for plugin MCP servers. This is non-blocking: these are constants plus fixtures.
