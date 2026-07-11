"use strict";

// Declarative OpenAI Codex CLI target profile (Bloque 5.1). Consumed by
// target-transform.js. Layout is closest to `claude` (a real plugin bundle),
// but with two emission branches that do not exist for any other target:
// agents are emitted as TOML (outside the plugin bundle) and commands are
// emitted as invocable skills (never as deprecated "prompts"). See design.md
// "Codex target profile" and decisions/adr-001.md for the rules strategy.
//   - agents   -> .codex/agents/<name>.toml (agentFile.format:"toml"), never
//     referenced from the plugin manifest.
//   - commands -> skills/commands/<name>/SKILL.md (commandFile.format:"skill"),
//     invocable as $sdd-*; no `prompts/` path is ever emitted (deprecated).
//   - rules    -> concatenated into a single synthesized AGENTS.md at the
//     output root (ADR-001: to-agents-md), Codex's native layered-instructions
//     file, read automatically for the main thread and every spawned subagent.
//   - manifest -> .codex-plugin/plugin.json, reshaped via an allowlist
//     (keepFields) + interface injection + rename (NOT the omit/drop deny-list
//     used by claude): future-proof against new canonical manifest keys, and
//     agents are naturally absent since they are not in the allowlist.
//   - question_gate -> Codex has no structured ask-tool, so both the
//     namespaced marker `vscode/askQuestions` and the abstract alias
//     `AskUserQuestion` degrade to the same numbered plain-chat protocol via
//     toolMap degradation markers instead of a literal tool name; this covers
//     both target-specific and cross-target source prose.

module.exports = {
  id: "codex",
  layout: "dot-codex",

  agentFile: { from: ".agent.md", to: ".toml", format: "toml" },
  agentDir: ".codex/agents",

  // Codex custom-agent TOML files are configuration layers. Pin the maximum
  // depth in every generated agent so an SDD coordinator can dispatch a phase
  // worker, but that worker cannot fan out another layer of agents. This keeps
  // the coordinator/worker boundary enforceable even when a user's global
  // config has raised the default for a different workflow.
  agentSettings: { max_depth: 1 },

  commandFile: { from: ".prompt.md", format: "skill" },

  // All rules/*.instructions.md are folded into the root agent.md orchestrator
  rules: { strategy: "inline-into-orchestrator" },

  orchestrator: {
    agent: "sdd-orchestrator",
    emitAs: "root-agent-md",
    agentPath: "agent.md"
  },

  // sandbox_mode derives from the tools[] capability declaration (edit ->
  // workspace-write; everything else, e.g. the 4R reviewers' read/search-only
  // grants, -> read-only). No new frontmatter field is introduced.
  sandboxByCapability: { writeTool: "edit", write: "workspace-write", read: "read-only" },

  // Codex has no structured ask-tool: both the namespaced target tool
  // (vscode/askQuestions) and the abstract cross-target alias
  // (AskUserQuestion) degrade to the same numbered plain-chat protocol instead
  // of a literal tool name (REQ-codex-target-005 / generator
  // REQ-generator-003). Every other abstract tool maps to its closest
  // Codex-native equivalent.
  toolMap: {
    "vscode/askQuestions": {
      degrade:
        "ask blocking gate questions as a numbered plain-chat list (e.g. \"1) Option A  2) Option B\") and wait for the user to reply with a number — do not invoke any tool to ask",
    },
    AskUserQuestion: {
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

  // Codex loads native lifecycle hooks from hooks.json.  The installer expands
  // the runtime placeholder to ~/.codex/ospec-workflow, so this remains a
  // plugin-free global installation.
  hooks: { format: "codex", source: "hooks/hooks.json", location: "hooks.json" },

  // Drop the Claude/VS Code/plugin specific files since Codex is no longer a plugin.
  drop: [".claude-plugin/", ".mcp.json"],
  managedRoots: [".mcp.json"],

  validate: ["node", "scripts/configure/validate-codex.js", "{out}"],
};
