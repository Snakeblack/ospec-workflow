# Contributing to ospec-workflow

Thanks for your interest in improving this plugin. The repository is built
with its own workflow: every code change runs through IDD (impact-driven
development) with the `ospec` CLI, and SDD stays available on request.

## Ground rules

- **Trust surface first.** Any change to `.plugin.json`, `.claude-plugin/plugin.json`,
  `.mcp.json`, `hooks/hooks.json`, or `scripts/hooks/` changes the local execution and trust
  surface. Call it out explicitly in the PR description.
- **Single source of truth.** The README, the manifest, and the actual repo
  structure must agree. If you add a command, agent, hook, or MCP server,
  update the README and the relevant `docs/` page in the same PR.
- **The repository is the state.** An IDD change lives in `idd/<change>/`
  and is archived under `idd/archive/` by `ospec close`; an SDD change lives in
  `openspec/changes/`. `.ospec/cache` and `.ospec/session` are auxiliary hints,
  never the source of truth.

## Workflow

- Open each change with `node scripts/ospec.js record intent`, declare its plan
  with `ospec signals` and follow `ospec next` until `ospec close` succeeds
  (`skills/idd/SKILL.md` is the protocol). The obligations follow the impact:
  `idd/config.yaml` maps this repository's contract, data and hook paths.
- Use SDD (`/sdd-new`) only when you want the proposal, specs and design written
  and approved before any code.

## Tests

Use the same local gate as CI (`ospec check` runs it):

```powershell
node scripts/check.js
```

A change to `cmd/` or `internal/` also runs the Go gate of the `build-hooks`
workflow, which `ospec check` does not run:

```powershell
gofmt -l cmd internal
go vet ./...
go test ./...
```

Choose tests by risk, as `skills/_shared/engineering-judgment.md` describes:
cover the behavior that could break, keep unit tests deterministic and offline,
and skip code with nothing to get wrong.

Hook scripts use CommonJS `require` and `node:*` builtins only — no
third-party runtime dependencies.

## Commits and versioning

- Use conventional-commit style prefixes (`feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`) — the history already follows this.
- **No model/tool attribution.** Commit messages and pull requests (title, body,
  comments) MUST NOT credit an AI model or coding tool: no `Co-Authored-By:` model
  trailers, no "Generated with/by", no 🤖 footer, and no mention of Claude, Claude
  Code, Anthropic, GPT, OpenAI, Codex, Copilot, Gemini, or any other model/vendor.
  This applies to human and AI contributors alike — see
  `rules/no-model-attribution.instructions.md`.
- Bump the version in `package.json`, `openspec/config.yaml`, `.plugin.json`
  and `.claude-plugin/plugin.json` together (`scripts/manifest-sync.test.js`
  keeps them equal) per [SemVer](https://semver.org/): patch for non-behavioral fixes, minor for
  backward-compatible capability, major for breaking the trust surface or phase
  contracts. Record the change in `CHANGELOG.md`.

## Reporting issues

Open a GitHub issue with the plugin version, your VS Code version, and whether
hooks/MCP were enabled. For security-sensitive reports, follow
[`SECURITY.md`](SECURITY.md) instead of opening a public issue.
