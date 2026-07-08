# Design: Codex target profile (Bloque 5.1)

## Technical Approach

Add `codex` as the fifth declarative profile (`scripts/lib/target-profiles/codex.js`) consumed
by the pure `transform` in `target-transform.js`, register it in `cli.js`, and ship a
`validate-codex.js` gate plus golden fixtures. The profile is layout "codex-plugin": closest to
`claude` (a real plugin bundle) but with two emission branches that do not exist today — every
current output is markdown. Per `specs/codex-target/spec.md` and `specs/generator/spec.md`, the
new engine capabilities are declared generically and gated by profile flags so the four existing
targets stay byte-identical (REQ-generator-003 Scenario "Existing targets unaffected").

Mapping of MUST scenarios to design allocations:

| Spec requirement | Allocation |
|---|---|
| REQ-codex-target-001 / REQ-generator (manifest) | `reshapeManifest` allowlist + rename branch → `.codex-plugin/plugin.json` |
| REQ-codex-target-002 / REQ-generator-001 | `agentFile.format:"toml"` branch → `handleAgentToml` |
| REQ-codex-target-003 | `sandbox_mode` derived from the agent `tools` array |
| REQ-codex-target-004 / REQ-generator-002 | `commandFile.format:"skill"` branch → `handleCommandSkill` |
| REQ-codex-target-005 / REQ-generator-003 | `toolMap` degradation marker + prose substitution |
| REQ-codex-target-006 | ADR-001 selects `rules.strategy:"to-agents-md"` |
| REQ-codex-target-007 | front-load `description` in the skill emitter |
| REQ-codex-target-008 | `validate-codex.js` + fixtures in `e2e`/`real-repo` |

## Architecture Decisions

### Decision: Rules emitted as a single synthesized AGENTS.md (ADR-001)

**Choice**: Add a new `rules.strategy: "to-agents-md"` value. The transform concatenates every
`rules/*.instructions.md` body (after tool/agent substitution) into one synthesized `AGENTS.md`
at the output root, reusing the existing `collectRules` accumulation pattern.
**Alternatives considered**: inject the concatenated rules into each agent TOML
`developer_instructions`.
**Rationale**: Codex reads `AGENTS.md` natively in layers (global → repo → subfolder) for the
main thread AND spawned subagents with zero config, so a single file gives always-on coverage
DRY. Injecting into ~21 agent TOMLs duplicates the rules text N times, bloats each file, leaves
commands→skills uncovered, and must be re-synced on every rules edit. REQ-codex-target-006
explicitly permits a documented new `rules.strategy` value. See `decisions/adr-001.md`.

### Decision: Manifest reshaped by allowlist + output rename (not omit/drop)

**Choice**: Extend `reshapeManifest` with a `keepFields` allowlist and an `outLocation` rename.
For codex: keep only `skills`, `mcpServers`, `apps`, `hooks`; inject a profile-declared
`interface` block; write to `.codex-plugin/plugin.json`. The source `.claude-plugin/plugin.json`
is NOT in `drop` (drop runs first and would delete it before reshape); the rename replaces it.
**Alternatives considered**: reuse claude's `omitFields`/`dropFields` (deny-list) — fragile, would
have to enumerate every non-Codex key and cannot add `interface`.
**Rationale**: Allowlist is future-proof against new canonical manifest keys and satisfies the
"no other top-level keys" MUST in REQ-codex-target-001. Agents are naturally absent (not in the
allowlist), satisfying "TOML agents excluded from bundle" (REQ-generator-001 Scenario 3).

### Decision: sandbox_mode derived from the existing `tools` array

**Choice**: `workspace-write` when the agent's `tools` array contains `edit`; `read-only`
otherwise. The 4R reviewers (`review-readability|reliability|resilience|risk`) declare
`tools: ['read','search']` → `read-only`; `sdd-apply`/`sdd-verify` declare `edit` →
`workspace-write`.
**Alternatives considered**: a new `sandbox:` frontmatter field.
**Rationale**: REQ-codex-target-003 mandates derivation from the existing capability declaration
without a new field. The `tools` array IS that declaration and is read pre-strip, exactly like
the existing `mode` derivation from `user-invocable`.

### Decision: Minimal inline TOML serializer (no dependency)

**Choice**: Add `serializeAgentToml(fields)` in `target-transform.js` emitting flat `key = "…"`
scalars plus `developer_instructions` as a TOML multiline basic string (`"""…"""`), escaping
`\` and any `"""` run.
**Rationale**: Node 22 has no core TOML writer and the project forbids runtime deps (CommonJS
pure). The agent shape is flat and known, so a ~15-line emitter mirrors the constrained-subset
`parseModels` approach already in `cli.js`.

### Decision: question_gate degradation via a toolMap marker

**Choice**: `toolMap["vscode/askQuestions"] = { degrade: "<numbered plain-chat protocol text>" }`.
`substituteProse` replaces prose occurrences with the `degrade` text; the frontmatter tool mapper
drops the key (no tool name emitted). Literal-string/array mappings for the four existing targets
are untouched (marker is an object).
**Rationale**: Codex has no structured ask-tool (REQ-generator-003). A declarative marker keeps
the degradation in the profile, not in a codex-specific code branch.

## Data Flow

    cli.loadTree (source + runtime scripts)
         │  { path, content }[]
         ▼
    transform({ files, profile:codex, models })
         │
         ├─ .claude-plugin/plugin.json → reshapeManifest(keep+interface+rename) → .codex-plugin/plugin.json
         ├─ agents/*.agent.md          → handleAgentToml → .codex/agents/<name>.toml   (outside bundle)
         ├─ commands/*.prompt.md       → handleCommandSkill → skills/commands/<name>/SKILL.md ($sdd-*)
         ├─ rules/*.instructions.md    → collectRules (accumulate) ─┐
         ├─ .mcp.json                  → normalizeMcpPlaceholders     │
         └─ skills/**, docs            → passthrough + prose subst.   │
                                                                      ▼
                     synthesizeFiles → AGENTS.md (to-agents-md)
         ▼
    sort by path → writeTree(dist/codex) → validate-codex.js gate

Sequence for the agent TOML branch (complex flow):

    handleFile(agents/sdd-apply.agent.md)
      └─ isAgent? yes, agentFile.format==="toml"
           ├─ parse frontmatter+body
           ├─ derive sandbox_mode from tools[]  (edit → workspace-write)
           ├─ resolveModel("sdd-apply","codex",models) → OMIT (no codex column in 5.1)
           │     └─ omit model AND model_reasoning_effort
           ├─ substituteProse(body, toolMap)  (askQuestions → chat protocol)
           └─ serializeAgentToml({name,description,sandbox_mode,developer_instructions:body})
                → { path:".codex/agents/sdd-apply.toml", content }

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/target-profiles/codex.js` | Create | Declarative codex profile (layout, agentFile.format toml, commandFile.format skill, toolMap w/ degrade marker, rules to-agents-md, manifest keep+interface+rename, mcpPlaceholders, validate) |
| `scripts/lib/target-transform.js` | Modify | New branches: `handleAgentToml`, `handleCommandSkill`, `serializeAgentToml`, `reshapeManifest` keep/rename/interface, `rules.strategy:"to-agents-md"` synthesized AGENTS.md, degrade-marker handling in `substituteProse`/tool mappers |
| `scripts/configure/cli.js` | Modify | Register `codex` in `PROFILES` (usage hint + `--target` validation follow automatically) |
| `scripts/configure/validate-codex.js` | Create | Validate bundle allowlist, `.codex/agents/*.toml` shape, no `prompts/` path, no foreign namespace residue |
| `scripts/configure/__fixtures__/golden/codex/**` | Create | Golden output tree (plugin.json, skills/, .mcp.json, .codex/agents/*.toml, AGENTS.md) |
| `scripts/configure/e2e.test.js`, `real-repo.test.js` | Modify | Add codex to the target matrix |
| `openspec/specs/generator/spec.md` | Modify | Four → five targets (applied at archive from the change delta) |

## Interfaces / Contracts

New profile flags (additive; ignored by existing profiles):

```js
agentFile: { from: ".agent.md", to: ".toml", format: "toml" },
agentDir: ".codex/agents",
commandFile: { from: ".prompt.md", format: "skill" },   // → skills/commands/<name>/SKILL.md (namespace separado de los context-docs skills/<name>/ — appr-003)
rules: { strategy: "to-agents-md", outLocation: "AGENTS.md" },
manifest: {
  location: ".claude-plugin/plugin.json",               // source path (intercept)
  outLocation: ".codex-plugin/plugin.json",             // rename on emit
  keepFields: ["skills", "mcpServers", "apps", "hooks"], // allowlist
  interface: { displayName: "ospec-workflow", icon: "…" },
},
toolMap: { "vscode/askQuestions": { degrade: "Ask blocking gate questions as a numbered plain-chat list; the user replies with a number." }, read: "read", … },
sandboxByCapability: { writeTool: "edit", write: "workspace-write", read: "read-only" },
mcpPlaceholders: { style: "env-expansion" },
validate: ["node", "scripts/configure/validate-codex.js", "{out}"],
```

TOML agent output shape:

```toml
name = "sdd-apply"
description = "Implement assigned SDD tasks …"
sandbox_mode = "workspace-write"
# model / model_reasoning_effort omitted in 5.1 (no codex column in models.yaml)
developer_instructions = """
# SDD Apply
…body…
"""
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `serializeAgentToml` escaping; sandbox_mode derivation (edit vs read-only); manifest allowlist+rename+interface; degrade marker in prose & tool mapper; positional var reuse; description front-loading | `node --test` against `transform()` with in-memory fixtures — RED first (branches absent) then GREEN |
| Unit | `resolveModel` OMIT path → no `model`/`model_reasoning_effort` key | assert absence with codex column missing |
| Integration | Full `transform({profile:codex})` produces `.codex-plugin/plugin.json` (allowlist only), `.codex/agents/*.toml` outside bundle, `skills/commands/sdd-*/SKILL.md` (sin colisión con los context-docs `skills/<name>/SKILL.md`), `AGENTS.md`, no `prompts/` | compare against golden fixture tree |
| Integration | Four existing targets byte-identical (regression) | existing golden fixtures unchanged |
| E2E | `validate-codex.js` fails on out-of-schema bundle key, passes on golden tree; codex in `e2e.test.js`/`real-repo.test.js` matrix | spawn validator, assert exit code |

Strict TDD: each new transform branch gets a failing test first (branch returns markdown/absent),
then the branch is added to reach GREEN.

## Migration / Rollout

No migration. Purely additive: revert = delete `codex.js`, `validate-codex.js`, codex fixtures,
and the `PROFILES` entry; the new transform branches go inert without a profile that sets the
flags. The four existing golden fixtures verify no regression.

## Open Questions

- [ ] `model_reasoning_effort` per-tier source in `models.yaml` is defined by 5.4; in 5.1 it is
  omitted together with `model` via the fail-soft resolver. Confirmed out of scope here.
- [ ] Exact Codex `interface` icon field name/format and `hooks/hooks.json` bundle schema are
  finalized in 5.2/5.3; 5.1 emits a minimal `interface` and passes hooks.json through unmodified.
