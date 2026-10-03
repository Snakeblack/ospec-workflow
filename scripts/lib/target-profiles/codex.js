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
//   - question_gate -> resolve the live host's question capability and mode
//     through the shared protocol. Availability differs between desktop, CLI,
//     and planning modes; a build cannot pin one question channel for all.

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
  nativeModelFields: ["model_reasoning_effort", "model_verbosity"],

  commandFile: { from: ".prompt.md", format: "skill" },

  // All rules/*.instructions.md are folded into the root synthesized AGENTS.md (ADR-001)
  rules: { strategy: "to-agents-md" },

  orchestrator: {
    agent: "sdd-orchestrator",
    emitAs: "root-agent-md",
    agentPath: "AGENTS.md"
  },

  // sandbox_mode derives from the tools[] capability declaration (edit ->
  // workspace-write; everything else, e.g. the 4R reviewers' read/search-only
  // grants, -> read-only). No new frontmatter field is introduced.
  sandboxByCapability: { writeTool: "edit", write: "workspace-write", read: "read-only" },

  // A protocol reference avoids duplicating a long fallback at every gate.
  // rules/sdd-common.instructions.md defines native selection and chat fallback.
  toolMap: {
    "vscode/askQuestions": {
      degrade: "the active host question protocol",
    },
    AskUserQuestion: {
      degrade: "the active host question protocol",
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
