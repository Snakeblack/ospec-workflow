# sdd-init: details

## When a project is brownfield

The brownfield branch opens only when the repository has code and no specs.
Either one missing keeps it closed.

**It has code** when any of these holds:

- a file with a source extension (`.js`, `.ts`, `.py`, `.rb`, `.go`, `.rs`,
  `.java`, `.cs`, `.php`, `.swift`, `.kt`) lives outside `openspec/`, `docs/`
  and every file or directory whose name starts with a dot;
- the root holds a manifest: `package.json`, `pyproject.toml`, `go.mod`,
  `Cargo.toml`, `pom.xml` or `build.gradle`;
- `src/`, `lib/`, `app/` or `pkg/` exists and is not empty.

**It has no specs** when both hold:

- no `openspec/specs/{domain}/spec.md` exists;
- no archive has promoted a spec yet.

**It stays closed** when:

- nothing in the repository reveals code or a stack: that case belongs to
  `foundation`;
- `openspec/config.yaml` already has a `baseline` block, which stays as it is;
- `baseline.status` is `done`: every domain has its spec.

## What to detect for testing

| Capability | Where to look |
|---|---|
| Test runner | the scripts and dependencies of `package.json`, `pyproject.toml`, `pytest.ini`, `go.mod`, `Cargo.toml`, `Makefile` |
| Integration layer | libraries such as `testing-library`, `httpx`, `httptest`, `WebApplicationFactory` |
| End-to-end layer | `playwright`, `cypress`, `selenium`, `chromedp` |
| Coverage | `vitest --coverage`, `jest --coverage`, `c8`, `pytest-cov`, `go test -cover`, `coverlet` |
| Quality | the commands of the linter, the type checker and the formatter |

## Building the skill registry

Directories to scan, in this order of precedence when two skills share a name
(the project wins over the user):

- project: `{project-root}/.claude/skills/`, `{project-root}/.gemini/skills/`,
  `{project-root}/.agent/skills/` and `{project-root}/skills/`;
- user: `~/.claude/skills/`, `~/.config/opencode/skills/`, `~/.gemini/skills/`,
  `~/.cursor/skills/`, `~/.copilot/skills/` and the directory that holds this
  skill.

The registry leaves out `sdd-*`, `_shared` and `skill-registry`. For each
remaining skill it reads `SKILL.md`; past 200 lines, the frontmatter and the
sections of rules and patterns are enough. Each entry keeps the `name`, the
trigger taken from the `description`, the path of `SKILL.md` and between 5 and
15 lines of compact rules: limits, patterns to follow, breaking changes and
traps. Purpose, motivation, installation and long examples stay out.

The registry also lists the project's convention files: `agents.md`,
`AGENTS.md`, the project's `CLAUDE.md`, `.cursorrules`, `GEMINI.md` and
`copilot-instructions.md`. When one of them is an index, as `AGENTS.md` often
is, the files it points to enter the registry beside it.

`sdd-init` writes the registry when it does not exist yet. Keeping it fresh is
the job of the `SessionStart` hook, so an SDD command rebuilds it only when it
is missing, its fingerprint is stale, the user asks for a reindex or the stack
or the configuration of the project changed.

## How a skill is read

The registry treats skills as instructions an agent follows at run time, not
as documentation for people. What makes one usable:

- its parts: frontmatter, Activation Contract, Hard Rules, Decision Gates,
  Execution Steps, Output Contract and References;
- a `description` in quotes, on one line, that opens with its trigger and
  stays within 250 characters;
- a body of about 180 to 450 tokens, with examples, schemas, edge cases and
  background moved to the skill's own `references/` or `assets/`;
- references that are local files, stable relative to the skill directory;
- rules that can be checked, decision gates for forks that really happen, an
  output contract that says exactly what to return, and references that
  resolve locally.

## What init writes

```text
openspec/
├── config.yaml
├── specs/
└── changes/
    └── archive/

.ospec/cache/skill-registry.cache.json   compact registry as JSON
```

`openspec/config.yaml` carries:

- `context:` a summary of the project in under ten lines;
- `testing:` `tdd_mode` (`standard`, `focused` or `strict`), the detected
  runner and the other testing capabilities;
- `rules:` the defaults of each phase, from proposal to archive.

A project may also set
`rules.verify.strict_tdd_evidence_remediation_max_changed_lines` to a positive
integer no greater than 40. With no value, or a value outside that range, the
evidence fast path stays off and a CRITICAL is remediated as usual.

## Testing capabilities in the result

```markdown
## Testing Capabilities

Strict TDD: {on | off}, detected {date}

| Capability | Found | Tool or command |
|---|---|---|
| Test runner | ✅ / ❌ | `{command}` ({framework}) |
| Unit tests | ✅ / ❌ | {tool, or —} |
| Integration tests | ✅ / ❌ | {tool, or —} |
| End-to-end tests | ✅ / ❌ | {tool, or —} |
| Coverage | ✅ / ❌ | `{command}`, or — |
| Linter | ✅ / ❌ | `{command}`, or — |
| Type checker | ✅ / ❌ | `{command}`, or — |
| Formatter | ✅ / ❌ | `{command}`, or — |
```

## What the result reports

Whatever the store, the result names the project, its stack, the store, the
Strict TDD mode, the testing capabilities above, what was written and where,
any limitation found and the next steps. An empty project points to
`foundation`; with the `none` store, the result advises switching to
`openspec` before any SDD work that spans several phases.
