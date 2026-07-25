# Design: Cursor as a first-class native generator target

Mode: `design-after-spec` (deltas for `generator`, `install`, `agents`, `hooks-runtime`).

## Technical Approach

Cursor becomes the sixth entry in `PROFILES` (`scripts/configure/cli.js`) with a declarative
profile at `scripts/lib/target-profiles/cursor.js`. All Cursor-specific knowledge that
`scripts/sync-cursor.js` hardcoded imperatively moves into that profile plus four small
branches in the pure transform (`to-mdc` rules, `cursor` hooks, agent `readonly`, Cursor
`toolMap`), so `dist/cursor` becomes the single source of truth. `install-cursor.js` then
syncs the validated `dist/cursor` into `~/.cursor` and expands the hook launcher
placeholder. The profile is a hybrid: agent/model handling follows `claude.js`, the global
`$HOME` install and runtime placeholder follow `install-codex.js` / `codexHooks`, and the
emitted layout is pinned to the verified live `~/.cursor` tree.

## Architecture Decisions

### Decision: Rule metadata derives from source frontmatter, not a profile table

**Choice**: `rules.strategy: "to-mdc"` emits `rules/<base>.mdc` with `description` taken
from the source `rules/*.instructions.md` frontmatter (fallback: base name), plus
profile-declared `globs` (`["*"]`) and `alwaysApply: true`. `applyTo` is dropped (Cursor has
no equivalent). `AGENTS.md` is remapped to `rules/agents-protocol.mdc` via a single
`rules.synthesize` entry that carries its own `description`.
**Alternatives considered**: port `sync-cursor.js`'s five-entry `RULE_FRONTMATTER` map into
the profile; map `applyTo` globs into Cursor `globs`.
**Rationale**: the source already carries curated descriptions, so the map was duplicated
state that silently rots when a rule is added. Keeping `globs: ["*"] / alwaysApply: true`
matches the verified live install, where all five rules load unconditionally. See ADR-001.

### Decision: `AGENTS.md` enters the tree as a profile-scoped source root

**Choice**: add optional `profile.sourceRoots` and have `runConfigure` call
`loadTree(sourceDir, [...SOURCE_ROOTS, ...(profile.sourceRoots || [])])`. Only `cursor`
declares `["AGENTS.md"]`, and the transform routes a declared `rules.synthesize.source`
before the `.md` passthrough branch.
**Alternatives considered**: add `AGENTS.md` to the global `SOURCE_ROOTS` and `drop` it in
the five other profiles.
**Rationale**: the global root would change four goldens and collide with the `codex`
profile, which *synthesizes* its own root `AGENTS.md` from `to-agents-md`. See ADR-002.

### Decision: Cursor agent frontmatter is `name` / `description` / `model` / optional `readonly`

**Choice**: strip `tools` (plus `target`, `user-invocable`, `disable-model-invocation`);
emit `readonly: true` only for the six ids in `profile.agentReadonly.agents`, and omit the
key elsewhere.
**Alternatives considered**: keep a Cursor-mapped `tools:` array; emit `readonly: false`
explicitly as `sync-cursor.js` did; derive readonly from `tools` lacking `edit`.
**Rationale**: only the four keys are confirmed in the live `~/.cursor` tree, and REQ-generator-008
forbids `readonly: true` on non-listed agents while saying nothing about a `false` marker.
An explicit id list is auditable, unlike a capability heuristic. See ADR-003.

### Decision: One hook source event may fan out to several Cursor events

**Choice**: `hooks.format: "cursor"` reshapes `hooks/hooks.json` into
`{ version: 1, hooks: { <camelCase>: [{ command }] } }`, with `eventMap` values allowed to be
arrays (`PreToolUse → [beforeShellExecution, beforeReadFile]`). `${CLAUDE_PLUGIN_ROOT}`
becomes `__OSPEC_CURSOR_ROOT__`; `type` and `timeout` are dropped (absent in the live tree);
unmapped events, `SubagentStop` included, disappear.
**Alternatives considered**: reuse `copilotHooks` (one-to-one map only); rewrite hooks in the
installer as `sync-cursor.js` did.
**Rationale**: Cursor splits the pre-tool surface in two, and keeping the reshape in the
pure transform makes it golden-testable instead of install-only.

### Decision: A dedicated installer owns `~/.cursor`, and `sync-cursor.js` is deleted

**Choice**: `install-cursor.js` resolves `path.join(os.homedir(), ".cursor")`, applies its own
`assertCursorPathSafe` (refuse filesystem root, symlinked root or destination, canonical
escape), copies by content comparison, and writes `hooks.json` with the placeholder already
expanded. `setup:cursor` / `reload:cursor` point at it and `scripts/sync-cursor.js` is
removed in the same change.
**Alternatives considered**: reuse `install-target.js` `assertSafeDest` (refuses `$HOME`);
keep `sync-cursor.js` as a thin delegating wrapper for one release cycle.
**Rationale**: `$HOME` is the intended destination here, so the shared guard is wrong by
construction. The wrapper is dead weight: `sync-cursor.js` is untracked and was never
released, so nothing external can depend on the path. See ADR-004.

### Decision: Placeholder expansion happens on write, and quotes only when needed

**Choice**: the installer reads `dist/cursor/hooks.json`, replaces `__OSPEC_CURSOR_ROOT__`
with the POSIX-slashed absolute `~/.cursor`, and wraps the launcher path in double quotes
**only** when the expanded path contains whitespace.
**Alternatives considered**: always quote (codex precedent); never quote (live-tree parity).
**Rationale**: the verified working install is unquoted, so unconditional quoting would
deviate from the only runtime evidence we have; conditional quoting keeps that byte-for-byte
parity for ordinary `$HOME` values while not breaking on `C:/Users/Name Surname`.
Expanding before the write also means no transient unexpanded file exists and the
content-comparison idempotency check sees the final bytes.

### Decision: Ask-tool degradation reuses the existing `{ degrade }` marker

**Choice**: `vscode/askQuestions` and `AskUserQuestion` both map to the same degrade string
(below); no literal ask-tool name is emitted, and `mapToolsFrontmatter` already skips
degraded entries.
**Alternatives considered**: map to `vscode/askQuestions` verbatim; invent a Cursor ask tool.
**Rationale**: REQ-generator-003 already defines this mechanism for `codex`; the Cursor
harness exposes no callable ask tool, so a literal name would be a dangling reference.

## Data Flow

```
npm run setup:cursor
  │
  ▼
install-cursor.js
  ├─1─ runConfigure({ target:"cursor", outDir:"dist/cursor", validate:true })
  │      ├─2─ loadTree(SOURCE_ROOTS + profile.sourceRoots)      → + AGENTS.md
  │      ├─3─ transform(files, cursorProfile, models)
  │      │      agents/*.agent.md   → agents/<name>.md      (model, readonly, toolMap)
  │      │      commands/*.prompt.md→ commands/<name>.md    (${input:} kept)
  │      │      rules/*.instructions.md → rules/<base>.mdc
  │      │      AGENTS.md           → rules/agents-protocol.mdc
  │      │      hooks/hooks.json    → hooks.json  (__OSPEC_CURSOR_ROOT__)
  │      │      skills/**, scripts/{hooks,lib}/**, models.yaml → passthrough
  │      ├─4─ writeTree("dist/cursor")
  │      └─5─ validate-cursor.js dist/cursor
  │             └─ errors > 0 ─► exitCode ≠ 0 ─► nothing installed (return early)
  ├─6─ assertCursorPathSafe(~/.cursor, dest)          ← throws before any write
  ├─7─ syncTreeByContent(dist/cursor → ~/.cursor)     ← every path except hooks.json
  ├─8─ hooks.json: __OSPEC_CURSOR_ROOT__ → <abs ~/.cursor, POSIX slashes>, then write
  └─9─ copyBinaryToTree(~/.cursor, "cursor", sourceDir) → ~/.cursor/scripts/hooks/ospec-hooks[.exe]

--dry-run short-circuits steps 7-9 (steps 1-6 still run, so validation still gates).
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/target-profiles/cursor.js` | Create | Declarative profile (layout, `to-mdc`, cursor hooks, readonly list, toolMap, `sourceRoots`, validate hook) |
| `scripts/lib/target-transform.js` | Modify | `cursorHooks`, `toMdcFile`, synthesize-source routing, `readonly` injection in `handleAgent` |
| `scripts/configure/cli.js` | Modify | Register `cursor` in `PROFILES`; honor `profile.sourceRoots` in `runConfigure` |
| `scripts/configure/validate-cursor.js` | Create | Structural + residue validator (agents, rules, hooks, forbidden text scoped to `agents/`) |
| `scripts/configure/install-cursor.js` | Create | `runConfigure` → `~/.cursor` sync, safety guard, placeholder expansion, `--dry-run` |
| `scripts/sync-cursor.js` | Delete | Ad-hoc source→`~/.cursor` copy replaced by the generator-first path |
| `package.json` | Modify | Add `build:cursor`; repoint `setup:cursor` / `reload:cursor` |
| `scripts/check.js` | Modify | Add `{ target: "cursor", validate: true }` |
| `scripts/configure/real-repo.test.js` | Modify | Six-target matrix + cursor validator/residue assertions |
| `scripts/configure/cli.test.js` | Modify | Add `cursor` to the golden-snapshot loop |
| `scripts/lib/target-transform.test.js` | Modify | Unit coverage for the four new branches (readonly, `to-mdc`, synthesize, cursor hooks) |
| `scripts/configure/validate-cursor.test.js` | Create | Positive tree + one negative case per error class |
| `scripts/configure/install-cursor.test.js` | Create | Safety guard, idempotency, dry-run, win32 placeholder expansion (injected `fs`/`homedir`) |
| `scripts/{model-tier-contract,selective-4r-parity,strict-tdd-evidence-parity}.test.js` | Modify | Extend target arrays with `cursor` |
| `scripts/configure/__fixtures__/golden/cursor/**` | Create | Golden tree (~13 files, ≈130 lines, mirroring the other goldens) |
| `openspec/specs/{generator,install,agents,hooks-runtime}/spec.md` | Modify | Apply deltas at archive; five→six target wording |
| `openspec/config.yaml` | Modify | Architecture blurb: four → six targets |
| `docs/` (install/README rows) | Modify | Document `build:cursor` / `setup:cursor` (REQ-install-007) |

## Interfaces / Contracts

```js
// scripts/lib/target-profiles/cursor.js (shape; comments omitted)
module.exports = {
  id: "cursor",
  layout: "dot-cursor",
  sourceRoots: ["AGENTS.md"],              // NEW generator field, profile-scoped
  agentFile: { from: ".agent.md", to: ".md" },
  commandFile: { from: ".prompt.md", to: ".md" },
  model: { format: "alias" },              // models.yaml `cursor:` column
  agentReadonly: { agents: ["review-change", "review-correction", "review-risk",
                            "review-readability", "review-reliability", "review-resilience"] },
  frontmatter: { stripKeys: ["target", "user-invocable", "disable-model-invocation", "tools"] },
  rules: {
    strategy: "to-mdc", dir: "rules", globs: ["*"], alwaysApply: true,
    synthesize: [{ source: "AGENTS.md", base: "agents-protocol",
                   description: "Post-archive release flow and bounded review lifecycle rules." }],
  },
  hooks: {
    format: "cursor", source: "hooks/hooks.json", location: "hooks.json",
    runtimePlaceholder: "__OSPEC_CURSOR_ROOT__",
    eventMap: { SessionStart: ["beforeSubmitPrompt"],
                PreToolUse: ["beforeShellExecution", "beforeReadFile"],
                PreCompact: ["afterFileEdit"], Stop: ["stop"] },
  },
  toolMap: {
    read: "Read", edit: ["Write", "StrReplace"], search: ["Grep", "Glob"],
    execute: "Shell", agent: "Task",
    "vscode/askQuestions": { degrade: ASK_GATE }, AskUserQuestion: { degrade: ASK_GATE },
  },
  drop: [".claude-plugin/", ".mcp.json"],
  validate: ["node", "scripts/configure/validate-cursor.js", "{out}"],
};
```

Degrade contract (`ASK_GATE`, one literal string shared by both keys):

> present blocking gate questions as a structured numbered markdown list in chat (e.g. "1) Option A  2) Option B"), then STOP and wait for the user's reply — do not invoke any tool to ask — and persist the accepted decision in `state.yaml`

`validate-cursor.js` exposes the repo-standard `{ validate(root, deps) → { errors, warnings } }`
plus `main(argv)` printing `N errors, M warnings`. Error classes:

| Class | Rule |
|---|---|
| structure | `agents/`, `commands/`, `rules/`, `skills/`, `scripts/hooks/` and `hooks.json` present |
| agent frontmatter | every `agents/*.md` has `name`, `description`, `model`; each `review-*` has `readonly: true` |
| rules | every `rules/*.mdc` has `description`, `globs`, `alwaysApply`; `agents-protocol.mdc` present |
| hooks | `version: 1`, only mapped camelCase events, no `SubagentStop`, every command carries `__OSPEC_CURSOR_ROOT__` |
| residue (agents only) | no `vscode/`, no bare `AskUserQuestion`, no backticked abstract tool token (`read`/`edit`/`search`/`execute`/`agent`) |

Per the locked clarification, `${input:…}` and `agent:` in `commands/**` are **not** validator
errors in this change.

## Testing Strategy

Strict TDD order per work unit: RED (test first) → GREEN (`npm test` or the focused
`node --test <file>`) → TRIANGULATE (boundary/negative case) → REFACTOR.

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (transform) | `to-mdc` frontmatter + `applyTo` dropped; `agents-protocol.mdc` from an in-memory `AGENTS.md`; `readonly: true` only for listed reviewers; cursor hooks fan-out, `version: 1`, `SubagentStop` dropped, placeholder present; degrade markers erase both ask-tool names | `node --test scripts/lib/target-transform.test.js` with hand-built `{ path, content }` arrays — no filesystem |
| Unit (validator) | one negative case per error class above, plus a clean tree returning zero errors, plus commands retaining `${input:…}` NOT failing | `node --test scripts/configure/validate-cursor.test.js` over `fs.mkdtemp` trees |
| Unit (installer) | `assertCursorPathSafe` refuses root/symlink/escape before any write; `--dry-run` writes nothing; second run reports all-unchanged; placeholder expansion produces an absolute POSIX path (win32 `platform` injected) and quotes only when the path has a space | `node --test scripts/configure/install-cursor.test.js` with injected `fs`/`homedir`/`platform` deps, mirroring `install-codex.test.js` |
| Golden | `dist/cursor` from `__fixtures__/source` byte-matches `__fixtures__/golden/cursor` | existing loop in `cli.test.js`; the shared fixture has no `AGENTS.md` and no `review-*` agent, so synthesize + readonly stay unit-covered rather than mutating the fixture (which would churn four other goldens) |
| Integration | real-repo six-target generation non-empty; cursor passes its validator; no ask/abstract residue in `dist/cursor/agents/**`; every SDD agent has a `model:`; branch-recommendation and review-agent parity across six targets | `scripts/configure/real-repo.test.js` + `check.js` matrix + the three parity suites |
| E2E | none | Cursor ships no headless validate/CLI; `e2e.test.js` stays untouched (out of scope per exploration) |

`npm test` (`scripts/check.js`) is the gate; it runs every `scripts/**/*.test.js` then
generates + validates all six targets.

## Migration / Rollout

Existing `~/.cursor` installs converge on the next `setup:cursor`: managed same-path files
are overwritten, unrelated user files are preserved. Two intentional behavior changes:
`~/.cursor/scripts/configure/**` is no longer shipped (the generator's runtime bundle excludes
generator-only modules), and the redundant `~/.cursor/ospec-hooks.exe` root copy is dropped in
favor of `scripts/hooks/ospec-hooks[.exe]`, which is where `ospec-hooks-launch.js` already
looks. The installer does not prune, so those leftovers stay inert until manually removed.
Rollback is the proposal's plan: revert the branch (or `git revert` the merge) — `~/.cursor`
is fully regenerable.

**400-line budget risk: High** (≈1100-1300 changed lines). Recommended slices for
`sdd-tasks`, each independently verifiable:

| Slice | Content | Est. lines |
|---|---|---|
| 1 | Profile + transform branches + `cli.js` registration + transform unit tests | ~330 |
| 2 | `validate-cursor.js` + its tests | ~330 |
| 3 | Golden fixture tree + `cli.test.js` loop + six-target matrix (`check.js`, real-repo, parity suites) | ~250 |
| 4 | `install-cursor.js` + tests + `package.json` scripts + delete `sync-cursor.js` | ~400 |
| 5 | Spec deltas, `config.yaml`, docs | ~150 |

Slices 1-3 are generation-only and leave `setup:cursor` on the current script until slice 4,
so no intermediate state breaks a released path.

## Open Questions

- [ ] Should hook launcher commands be quoted unconditionally (codex-style) instead of only
      when the expanded `$HOME` path contains whitespace? Needs a Cursor host that actually
      has a spaced home directory to settle empirically.
- [ ] `validateSddModelPolicy` still pins only Codex tiers; pinning the `cursor:` column is an
      explicit out-of-scope follow-up.
