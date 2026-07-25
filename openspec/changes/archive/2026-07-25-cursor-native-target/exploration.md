## Exploration: Cursor as first-class native ospec-workflow target

### Current State

**Generator (five targets, no Cursor).** `scripts/configure/cli.js` registers `PROFILES` for `claude`, `vscode`, `github-copilot`, `opencode`, and `codex` only. The pure transform in `scripts/lib/target-transform.js` handles agent/command/rules remaps, `toolMap` prose + frontmatter substitution (including Codex-style `{ degrade: "…" }` markers), model injection via `resolveModel(agent, profile.id, models)`, and three hook reshapers: `nestHooks` (Claude nested), `copilotHooks`, and `codexHooks`. There is no Cursor profile, no `.mdc` rules strategy, no `readonly` agent frontmatter branch, and no Cursor hook event map.

**WIP reference installer (not generator-first).** Untracked `scripts/sync-cursor.js` (~295 lines) copies source → `~/.cursor` with ad-hoc transforms:

| Source | Emitted under `~/.cursor` |
|--------|---------------------------|
| `agents/*.agent.md` | `agents/<name>.md` — frontmatter rebuilt as `name`, `description`, `model` (from `models.yaml` `cursor:` column), `readonly` (review agents only) |
| `commands/*.prompt.md` | `commands/<name>.md` — byte copy, VS Code frontmatter preserved |
| `rules/*.instructions.md` + `AGENTS.md` | `rules/<base>.mdc` — Cursor rule frontmatter (`description`, `globs`, `alwaysApply`) |
| `skills/**`, `scripts/{hooks,lib,configure}/**` | same relative paths |
| `models.yaml` | root copy |
| `hooks/hooks.json` (source PascalCase) | root `hooks.json` with Cursor camelCase events + absolute launcher paths |
| `release/dist/ospec-hooks*.exe` | root + `scripts/hooks/` |

`package.json` already wires `setup:cursor` / `reload:cursor` → `sync-cursor.js`. There is no `build:cursor` or `dist/cursor`.

**Reference layout matches sync output.** Verified at `C:\Users\sn4ke\.cursor\`:

- Agents: `name`, `description`, `model`, `readonly` (e.g. `review-change.md` has `readonly: true`).
- Rules: `*.mdc` with JSON-quoted `description`, `globs: ["*"]`, `alwaysApply: true`.
- Hooks: `{ version: 1, hooks: { beforeSubmitPrompt, beforeShellExecution, beforeReadFile, afterFileEdit, stop } }` pointing at `node <abs>/.cursor/scripts/hooks/ospec-hooks-launch.js <phase>`.
- **Gap:** agent/command prose still references `vscode/askQuestions` and `${input:…}` — sync does not run `toolMap` substitution.

**models.yaml.** `cursor:` tier column already populated (`claude-opus-5[effort=high]`, `grok-4.5[fast=false]`, `composer-2.5[fast=false]`). `resolveModel(name, "cursor", models)` works today; `validateSddModelPolicy` only pins Codex tiers (no Cursor pin yet — optional policy follow-up).

**Policy drift.** Baseline specs and `openspec/config.yaml` still say “four/five targets”; `scripts/check.js` and `real-repo.test.js` matrix is five targets. Cursor is absent from install spec §1.

**Historical precedent (Codex trilogy).**

| Archive | What it delivered |
|---------|-------------------|
| `2026-07-08-codex-target-profile` | Profile + transform branches (TOML agents, skill commands, `to-agents-md`, degrade toolMap) + `validate-codex.js` + golden/real-repo parity |
| `2026-07-09-codex-installer` | `install-codex.js`, `build:codex`, global `~/.codex` install |
| `2026-07-10-codex-target-phase-2` / `codex-hooks-bridge` | Native hooks transform + runtime placeholder + contract lint |

Cursor is **simpler than Codex** (markdown in/out, no TOML/manifest/marketplace) but **richer than vscode** (identity transform) because of `.mdc` rules, `readonly` frontmatter, hook event remap, and global install.

### Affected Areas

- `scripts/configure/cli.js` — register `cursor` in `PROFILES`; usage string becomes six targets.
- `scripts/lib/target-profiles/cursor.js` — **new** declarative profile (create).
- `scripts/lib/target-transform.js` — new branches: `rules.strategy: "to-mdc"`, `hooks.format: "cursor"`, agent `readonly` injection, optional command frontmatter cleanup.
- `scripts/configure/validate-cursor.js` — **new** structural validator (agents, rules, hooks, forbidden residue).
- `scripts/configure/install-cursor.js` — **new** `runConfigure` + copy to `~/.cursor` + hook path expansion + binary copy (port logic from `sync-cursor.js`).
- `scripts/sync-cursor.js` — deprecate: thin wrapper → `install-cursor.js` or delete after parity.
- `package.json` — add `build:cursor`; repoint `setup:cursor` / `reload:cursor`.
- `scripts/check.js` — add `{ target: "cursor", validate: true }`.
- `scripts/configure/real-repo.test.js`, `e2e.test.js`, parity tests (`selective-4r-parity`, `model-tier-contract`, etc.) — extend target matrix to six.
- `scripts/configure/__fixtures__/golden/cursor/**` — golden tree.
- `openspec/specs/generator/spec.md` — five → **six** targets; document `to-mdc`, `cursor` hooks format, Cursor toolMap.
- `openspec/specs/install/spec.md` — new §1.x Cursor global install (`build:cursor`, `setup:cursor`).
- `openspec/specs/agents/spec.md`, `openspec/specs/hooks-runtime/spec.md` (if hook invocation surface listed per target).
- `openspec/config.yaml` — architecture blurb (still says four targets).
- `docs/` — README / plugin-installation row for Cursor (post-apply doc task).

### Approaches

#### 1. Full generator profile + native installer (recommended)

Port `sync-cursor.js` transforms into `target-profiles/cursor.js` + transform branches; emit `dist/cursor`; `install-cursor.js` syncs `dist/cursor` → `~/.cursor` with runtime path substitution (pattern: `install-codex.js` / `install-global-opencode.js`).

- **Pros:** Single source of truth; testable via golden + real-repo; parity with other targets; eliminates prose/tool drift; enables `npm run build:cursor` CI gate.
- **Cons:** Requires new transform branches (`to-mdc`, `cursorHooks`, `readonly`); ~500–700 LOC touch surface across generator/install/tests/specs.
- **Effort:** Medium–High.

**Closest template:** hybrid **Claude** (toolMap + model injection + runtime scripts bundle) + **Codex installer** (global home install, hook placeholder expansion) + **sync-cursor.js** (layout truth).

**Proposed profile sketch:**

```js
// scripts/lib/target-profiles/cursor.js (illustrative)
{
  id: "cursor",
  layout: "dot-cursor",
  agentFile: { from: ".agent.md", to: ".md" },
  agentDir: "agents",
  commandFile: { from: ".prompt.md", to: ".md" },
  commandDir: "commands",
  model: true,
  agentReadonly: { reviewers: [/* six review-* ids */] }, // or derive: no `edit` in tools → readonly
  frontmatter: {
    stripKeys: ["target", "user-invocable", "disable-model-invocation", "tools"],
    commandStripKeys: ["agent"], // Cursor routes via command body, not VS Code agent:
  },
  rules: {
    strategy: "to-mdc",
    dir: "rules",
    meta: { /* sdd-common, sdd-openspec, … description/globs/alwaysApply */ },
    synthesize: [{ source: "AGENTS.md", base: "agents-protocol" }],
  },
  hooks: {
    format: "cursor",
    source: "hooks/hooks.json",
    location: "hooks.json",
    eventMap: {
      SessionStart: ["beforeSubmitPrompt"],
      PreToolUse: ["beforeShellExecution", "beforeReadFile"],
      PreCompact: ["afterFileEdit"],
      Stop: ["stop"],
      // SubagentStop: no Cursor equivalent — drop (same as sync-cursor)
    },
    runtimePlaceholder: "__OSPEC_CURSOR_ROOT__",
  },
  toolMap: {
    read: "Read",
    search: ["Grep", "Glob"],
    edit: ["Write", "StrReplace"],
    execute: "Shell",
    agent: "Task",
    "vscode/askQuestions": { degrade: "<numbered chat gate protocol — see below>" },
    AskUserQuestion: { degrade: "<same protocol>" },
  },
  drop: [".claude-plugin/", ".mcp.json"],
  validate: ["node", "scripts/configure/validate-cursor.js", "{out}"],
}
```

**Proposed Cursor `toolMap` rationale**

| Abstract (source) | Cursor-native | Notes |
|-------------------|---------------|-------|
| `read` | `Read` | Harness tool confirmed |
| `search` | `Grep`, `Glob` | Match Claude split |
| `edit` | `Write`, `StrReplace` | Cursor uses StrReplace (not `Edit`) |
| `execute` | `Shell` | |
| `agent` | `Task` | Subagent dispatch |
| `vscode/askQuestions`, `AskUserQuestion` | **degrade marker** | No callable Ask tool in current Cursor agent harness (orchestrator falls back to chat — verified in this environment) |
| MCP (prose) | unchanged / “MCP tools via configured servers” | Configure via `~/.cursor/mcp.json` — **optional** emit normalized `.mcp.json` in dist (sync-cursor omits it today; low-priority add-on) |

**Question gate recommendation (a+b+c combined):**

1. **Prose:** use degrade markers (REQ-generator-003) replacing `vscode/askQuestions` / `AskUserQuestion` with explicit Cursor protocol: present `question_gate` as structured numbered markdown in chat, **STOP**, wait for reply; persist approvals in `state.yaml` when answered — mirror Codex degradation but keep orchestrator gate semantics.
2. **No literal tool name** in frontmatter for ask-tools (strip via degrade marker).
3. **Do not** map to `vscode/askQuestions` in Cursor output (validator should reject vscode namespace residue, as validate-codex does).
4. **Document** known limitation: unlike Copilot `ask_user`, Cursor may not render native “Ask questions” UI for subagents; chat gate remains authoritative (same class of risk as VS Code YOLO/auto-approve skipping UI — see `docs/roadmaps/targets/target-vscode.md` V.9).

**Reviewers `readonly: true`:** emit for the six `review-*` agents (sync hardcodes set; prefer profile-declared list or derive from `tools` without `edit`).

**Hooks:** add `hooks.format: "cursor"` in **transform**, not install-only rewrite.

- Transform emits `hooks.json` with `version: 1`, camelCase events, commands like `node "__OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js" session-start`.
- `install-cursor.js` replaces `__OSPEC_CURSOR_ROOT__` with absolute POSIX path (Windows forward slashes OK — matches live `~/.cursor/hooks.json`).
- Event map aligns with sync-cursor / Antigravity: drop `SubagentStop`; map `PreCompact` → `afterFileEdit`.
- Runtime wrappers unchanged (Codex hooks-bridge precedent: same `ospec-hooks-launch.js` + Go binary).

**Install story:**

```
npm run build:cursor  →  runConfigure(cursor) → dist/cursor/
npm run setup:cursor  →  install-cursor.js (build if needed, validate, copy tree, expand hooks, copy binary)
```

`install-cursor.js` should:

- Target `path.join(os.homedir(), ".cursor")` (explicit allow — unlike `install-target.js` which refuses `$HOME`).
- Call `runConfigure({ target: "cursor", outDir: dist/cursor, validate: true })`.
- Sync top-level dist entries (agents, commands, rules, skills, scripts, models.yaml, hooks.json) with overwrite semantics.
- Copy `ospec-hooks` binary via shared `copyBinaryToTree`.
- Support `--dry-run` (preserve sync-cursor UX).

**Fate of `sync-cursor.js`:** after parity, replace body with `require("./configure/install-cursor.js").main(process.argv.slice(2))` for one release cycle, then delete.

#### 2. Keep sync-cursor.js; generator profile only (no installer)

Generate `dist/cursor` for CI parity but leave `setup:cursor` on sync script.

- **Pros:** Smaller initial diff; defers home-dir safety/MCP merge questions.
- **Cons:** Two code paths drift (already happening: no toolMap in sync); fails user intent (“generator-first”).
- **Effort:** Medium.
- **Verdict:** Reject — contradicts stated end state.

#### 3. Phased delivery (Codex-style 6.1 + 6.2)

- **Phase A:** profile + transform + validate + tests + spec deltas (no installer).
- **Phase B:** `install-cursor.js`, deprecate sync, docs.

- **Pros:** Lower per-PR review load; matches historical Codex sequencing.
- **Cons:** User approved single change through verify; leaves `setup:cursor` broken or dual-path until phase B.
- **Effort:** Medium each phase.
- **Verdict:** Fallback if 400-line budget blocks apply; not preferred given working sync reference.

### Recommendation

**Proceed as ONE change (`cursor-native-target`)** with Approach 1, scoped as follows.

**In scope**

- Sixth generator target `cursor` with full layout parity to verified `~/.cursor` reference.
- Cursor-native `toolMap` (Read/Write/StrReplace/Shell/Grep/Glob/Task) + ask-tool degrade prose.
- `rules.strategy: "to-mdc"` + synthesized `agents-protocol.mdc` from `AGENTS.md`.
- `hooks.format: "cursor"` + runtime placeholder expansion in installer.
- `validate-cursor.js`, golden fixtures, six-target extensions in `check.js` / `real-repo.test.js` / parity tests.
- `build:cursor`, `install-cursor.js`, repoint `setup:cursor` / `reload:cursor`.
- Spec deltas: `generator` (six targets), `install` (Cursor §), target-count fixes in `config.yaml` and cross-target scenarios in `agents` spec.
- Model tier generation: assert all SDD agents receive `model:` from `models.yaml` `cursor:` column (O4.2 parity — same bar as other targets with model columns).

**Out of scope (explicit follow-ups)**

- Repo-local `.cursor/` install (`install:cursor -- <destRepo>`).
- Cursor CLI E2E (no headless `cursor validate` equivalent).
- Emitting / merging `~/.cursor/mcp.json` (optional doc-only unless trivial add).
- Cursor-specific hook env markers (Codex uses `OSPEC_CODEX_WRAPPER`; only add if hook runtime proves necessary).
- Antigravity sync changes.
- Pinning Cursor tier models in `validateSddModelPolicy` (Codex-only pins today).

**400-line budget:** forecast **Medium–High**. Mitigation: implement installer as a straight port of `sync-cursor.js` (~150 LOC net new after deleting sync), keep validator minimal (structure + residue checks), defer MCP emit. If apply exceeds budget, split only the **docs/README** slice to a follow-up commit within the same change branch — not a second SDD change.

**Implementation order for sdd-propose/design/tasks**

1. RED: golden + validator tests for expected `dist/cursor` tree.
2. Profile + transform (`to-mdc`, `cursorHooks`, readonly agents, toolMap).
3. `validate-cursor.js` GREEN.
4. Wire `cli.js`, `check.js`, real-repo six-target matrix.
5. `install-cursor.js`; repoint npm scripts; thin/remove `sync-cursor.js`.
6. Spec deltas + config drift fixes.

### Risks

- **Question gate without native Ask tool:** blocking gates rely on chat discipline; misconfigured auto-run modes could skip user confirmation (operational, not generator bug).
- **Command frontmatter drift:** sync currently preserves VS Code `${input:…}` and `agent:` keys; Cursor may ignore them — generator should strip or rewrite in a later tightening if UX breaks.
- **Home-directory install safety:** must not use `install-target.js` `assertSafeDest` (refuses `$HOME`); dedicated installer with managed-path checks (copy Codex `assertManagedPathSafe` patterns).
- **Target-count spec churn:** many archived references to “five targets”; grep-and-update required to avoid verify contradictions.
- **Review budget:** six-target parity tests multiply fixture surface; watch line count.
- **Windows path hooks:** absolute paths with forward slashes work in live install; tests must cover placeholder expansion on win32.

### Ready for Proposal

**Yes.** `sdd-propose` can draft from this exploration without re-discovering the codebase. Key decisions to encode in proposal/ADRs:

1. Cursor is the **sixth** generator target; closest template **Claude toolMap + Codex global install**.
2. New transform capabilities: `rules.strategy: "to-mdc"`, `hooks.format: "cursor"`, agent `readonly` frontmatter.
3. Ask-tool handling: **degrade to structured chat gate** (not `vscode/askQuestions` literal).
4. `sync-cursor.js` → **`install-cursor.js`** after parity; generator-first `dist/cursor`.
5. Single change scope with explicit out-of-scope list above.
