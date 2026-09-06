# Design: Go Installer TUI

## Technical Approach

Mode: `design-after-spec`. A Bubble Tea state machine owns navigation; a small Node adapter owns planning and delegates installation. Existing installers remain the only destination writers. No repository copy, canonical model edit, new tier, or Go transaction implementation is required.

## Architecture Decisions

### Decision: Bubble Tea with a small local model

| Option | Tradeoff | Decision |
|---|---|---|
| Bubble Tea v1.3.4 | Dependency graph, but terminal lifecycle and testable Update | Select; retain repository Go 1.23 minimum |
| Handwritten raw-terminal loop | Fewer dependencies, more Windows/input/restoration code | Reject |

Pin `github.com/charmbracelet/bubbletea v1.3.4`; use its transitive Lip Gloss v1.0.0 directly for restrained spacing, one accent, muted help and a visible focus marker. No widget framework. Official [v1 API tutorial](https://raw.githubusercontent.com/charmbracelet/bubbletea/v1.3.10/README.md) documents Init/Update/View; [v1.3.4 go.mod](https://raw.githubusercontent.com/charmbracelet/bubbletea/v1.3.4/go.mod) supports the existing toolchain floor. Record checksums. No automatic dependency upgrade.

### Decision: One private JSON process boundary and ephemeral overrides

| Option | Tradeoff | Decision |
|---|---|---|
| Node adapter wrapping existing mains | Small integration seams; retains existing installation semantics | Select |
| Reimplement installers in Go or rewrite models.yaml | Duplicated rollback or shared mutable policy | Reject |

The adapter, Go client and generator extension ship together. This establishes a cross-language contract (ADR-002). `cli.js` currently loads canonical models and `model-resolver.js` accepts only three tiers; add an optional `modelOverrides` argument to `runConfigure`, attaching validated overrides to a fresh in-memory configuration. `resolveModel` checks an own-property per-agent/per-target override before normal tier resolution. Existing calls stay identical. Never synthesize tiers. Transformer already handles scalar, array and Codex object values.

## Interfaces / Contracts

Run from repository root: `npm run setup:tui` executes `go run ./cmd/ospec-install`. The binary requires this checkout and Node on PATH; standalone distribution is outside scope.

`node scripts/configure/installer-adapter.js plan` returns one JSON document: `{version:1, targets:[{id, label, installDescription, agents:[{id, selectable, inherited, effective, choices:[{id,label,value}]}]}]}`. Target IDs come from `PROFILES`. Agent IDs come from canonical `agents/*.agent.md`; `_default` is policy, never an agent. `effective` and `value` retain JSON scalar/array/object types; inheritance uses `effective:null`. Choice IDs are deterministic serialized canonical values, opaque to Go.

Capability policy is an explicit adapter allowlist backed by existing emission paths: Claude, VS Code, OpenCode, Codex and Cursor are selectable when valid local choices exist; GitHub Copilot and Antigravity inherit. Antigravity's `profile.model` alone is insufficient evidence. Enumerate choices from existing target tier values, deduplicated; exclude null/inherit. VS Code arrays supply individual model strings as singleton-array choices; preserve an existing fallback array as the default effective value until edited. Codex choices preserve the entire model/effort/verbosity tuple and show that tuple in labels. This selects one configured tuple per agent, not editable effort controls or a fallback editor. No hardcoded model catalog or remote model discovery.

`install` reads stdin JSON `{version:1,target, selections:{agentId:choiceId}}`. Require exactly one known target, known agents and choice IDs from a freshly computed plan; reject overrides for inherited agents. Go submits all selectable effective choices, including untouched defaults (default fallback arrays also appear as a canonical choice when needed), so changed defaults cannot silently alter reviewed selections. Never trust client-supplied raw model values or argv. Invalid JSON/schema/selection exits 2 before calling any installer. Resolve selections to fresh values, then call only the selected `main([], deps)` once. Use repository cwd and existing default destinations; expose no new destination or dry-run UI.

Plan stdout is JSON only, errors stderr. Install stdout/stderr remain native diagnostics and its exit status is the install result; install does not emit JSON. Thus inherited child-process output cannot corrupt a protocol response. Spawn Node with argument vectors, not shell strings.

## Data Flow

```mermaid
sequenceDiagram
  participant UI as Go TUI
  participant A as Node adapter
  participant I as Selected installer
  participant G as Generator
  UI->>A: plan (read-only)
  A-->>UI: targets, capabilities, choices
  Note over UI: Menu → Target → Models → Review; Back retains state
  UI->>A: install + selection JSON (only explicit Install)
  A->>A: Fresh plan and validation
  A->>I: main([], injected runConfigure)
  I->>G: Existing build with in-memory overrides
  G-->>I: Build / validation outcome
  I-->>UI: Existing diagnostics and exit code
```

Map target mains to `install-claude.js`, `install-vscode.js`, `install-global-copilot.js`, `install-global-opencode.js`, `install-codex.js`, `install-cursor.js`, `install-antigravity.js`. Claude needs a compatible `main(argv,deps={})`, numeric returns, injected output/process seams, and `buildClaudeMarketplace(options,deps={})` forwarding `deps.runConfigure`. Keep direct CLI behavior, including its existing build-only outcome when the CLI is missing; display diagnostics rather than claiming registration succeeded. Other installers already inject `runConfigure`.

The TUI stores selection maps per target. Arrow keys move focus, Enter activates, Escape/Back returns, q/Ctrl-C cancels before install. Agent list and summary scroll to terminal height; every agent remains reachable. Inherited targets skip editing and show inheritance in review. Focus Back by default on review; only activating Install emits the install command. Transition immediately to installing to suppress duplicate Enter. Suspend TUI rendering and run the subprocess with terminal diagnostics visible; supply JSON stdin through the client command. Restore terminal and return the installer exit code. No automatic retry or promise of rollback after external interruption.

## File Changes

| Files | Action |
|---|---|
| `cmd/ospec-install/main.go`, `internal/installer/{model,client}.go` | Entry, state/view, process boundary |
| `internal/installer/*_test.go` | Navigation and subprocess contracts |
| `scripts/configure/installer-adapter.js`, matching test | Plan, validation, dispatch |
| `scripts/configure/cli.js`, `scripts/lib/model-resolver.js`, matching tests | Ephemeral override resolution |
| `scripts/configure/{install-claude,claude-marketplace}.js`, matching tests | Compatible dependency seams |
| `go.mod`, `go.sum`, `package.json`, `README.md` | Pinned dependencies, launch command, scope/prerequisites |

## Testing Strategy

| Requirement / trigger | Expected response and evidence |
|---|---|
| 019: select/Back/switch target | Table-driven Update tests retain target-local choices |
| 020: single agent edit / inherited target | Other choices unchanged; no Antigravity picker; Node tests assert emitted native shapes |
| 021: review, Back, cancel, repeated Enter | Fake installer counts zero before Install and one afterward |
| 022: plan / invalid or stale request | Temporary filesystem unchanged; injected mains never called |
| 022: each of seven targets / failure | Dispatch table test checks exactly selected main and overrides; process test checks stdout/stderr/exit propagation |
| 023: complete guided path | Go state tests plus Node adapter/generator integration in temporary directories |

Run focused Go and Node tests first, then existing generator/installer regressions and `npm test`; `go test ./...` checks shared-module compatibility. Tests never install into real home. Manually inspect one interactive terminal session for clipping, focus and restoration; mocks do not establish live host authentication or model availability.

## Migration / Rollout

No migration. Auto-chain boundaries: adapter/override seams with tests; then usable TUI and docs with tests. Each slice leaves existing setup commands working. Remove entry/adapter/optional override path to roll back. No open blocking questions.
