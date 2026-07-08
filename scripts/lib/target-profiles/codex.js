"use strict";

// Declarative OpenAI Codex CLI target profile (Bloque 5.1). Consumed by
// target-transform.js. Layout is closest to `claude` (a real plugin bundle),
// but with two emission branches that do not exist for any other target:
// agents are emitted as TOML (outside the plugin bundle) and commands are
// emitted as invocable skills (never as deprecated "prompts"). See design.md
// "Codex target profile" and decisions/adr-001.md for the rules strategy.
//   - agents   -> .codex/agents/<name>.toml (agentFile.format:"toml"), never
//     referenced from the plugin manifest.
//   - commands -> skills/<name>/SKILL.md (commandFile.format:"skill"),
//     invocable as $sdd-*; no `prompts/` path is ever emitted (deprecated).
//   - rules    -> concatenated into a single synthesized AGENTS.md at the
//     output root (ADR-001: to-agents-md), Codex's native layered-instructions
//     file, read automatically for the main thread and every spawned subagent.
//   - manifest -> .codex-plugin/plugin.json, reshaped via an allowlist
//     (keepFields) + interface injection + rename (NOT the omit/drop deny-list
//     used by claude): future-proof against new canonical manifest keys, and
//     agents are naturally absent since they are not in the allowlist.
//   - question_gate -> Codex has no structured ask-tool, so the abstract
//     `vscode/askQuestions` name degrades to a numbered plain-chat protocol
//     via a toolMap degradation marker instead of a literal tool name.

module.exports = {
  id: "codex",
  layout: "codex-plugin",

  agentFile: { from: ".agent.md", to: ".toml", format: "toml" },
  agentDir: ".codex/agents",

  commandFile: { from: ".prompt.md", format: "skill" },

  // ADR-001: all rules/*.instructions.md bodies (post tool/agent substitution)
  // concatenate into one synthesized AGENTS.md at the output root, via the
  // existing collectRules accumulation pattern — no codex-only rules branch
  // outside the generator's rules.strategy dispatch (REQ-codex-target-006).
  rules: { strategy: "to-agents-md", outLocation: "AGENTS.md" },

  manifest: {
    location: ".claude-plugin/plugin.json",
    outLocation: ".codex-plugin/plugin.json",
    keepFields: ["skills", "mcpServers", "apps", "hooks"],
    interface: { displayName: "ospec-workflow", icon: "icon.png" },
  },

  // sandbox_mode derives from the tools[] capability declaration (edit ->
  // workspace-write; everything else, e.g. the 4R reviewers' read/search-only
  // grants, -> read-only). No new frontmatter field is introduced.
  sandboxByCapability: { writeTool: "edit", write: "workspace-write", read: "read-only" },

  // Codex has no structured ask-tool: the abstract vscode/askQuestions name
  // degrades to a numbered plain-chat protocol instead of a literal tool name
  // (REQ-codex-target-005 / generator REQ-generator-003). Every other abstract
  // tool maps to its closest Codex-native equivalent.
  toolMap: {
    "vscode/askQuestions": {
      degrade:
        "ask blocking gate questions as a numbered plain-chat list (e.g. \"1) Option A  2) Option B\") and wait for the user to reply with a number — do not invoke any tool to ask",
    },
    read: "read",
    search: "read",
    edit: "edit",
    execute: "shell",
    agent: "spawn a subagent",
  },

  // Rewrite ${input:NAME} -> ${NAME:-} in .mcp.json env/args/url/headers, same
  // env-expansion convention as claude/github-copilot.
  mcpPlaceholders: { style: "env-expansion" },

  // The Claude plugin manifest is NOT in `drop`: reshapeManifest intercepts it
  // by `profile.manifest.location` and renames it to `.codex-plugin/plugin.json`
  // before any drop check would run; hooks.json is passed through unmodified
  // (the hooks bridge itself is finalized in 5.2/5.3).

  validate: ["node", "scripts/configure/validate-codex.js", "{out}"],
};
