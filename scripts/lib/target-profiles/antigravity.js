"use strict";

// Declarative Antigravity target profile. Consumed by target-transform.js.
// Maps agent prompts, commands, skills, rules, and hooks for Antigravity IDE
// (~/.gemini/config/).

module.exports = {
  id: "antigravity",

  agentFile: { from: ".agent.md", to: ".agent.md" },
  // Antigravity ignores commands/*.prompt.md; emit only non-colliding SDD
  // meta-commands as flat slash-invocable skills while keeping phase skills
  // intact (REQ-generator-019).
  commandFile: {
    from: ".prompt.md",
    format: "skill",
    dir: "skills",
    skipCollidingSkills: true,
    disableModelInvocation: true,
    frontLoadDescription: false,
  },

  // Antigravity agent frontmatter accepts only its 4 stable tier aliases
  // (pro, inherit, flash, flash_lite); concrete model IDs cause the loader to
  // skip the agent. `inherit` omits `model:` so the agent uses the session model.
  model: { format: "alias" },

  frontmatter: {
    stripKeys: ["target", "user-invocable"],
  },

  // Antigravity ignores VS Code's `user-invocable: false`; subagent-only
  // agents must set `mainAgent: false` + `subagent: true` so they do not
  // pollute `agy agents`.
  agentSubagentFields: {
    mainAgent: "false",
    subagent: "true",
  },

  // Agents without `execute` get `commandExecutionPolicy: off`; agents with
  // `execute` omit the key to inherit the user's session policy (avoiding
  // forced sandbox breakage on `~/.gemini/config/bin/ospec`).
  commandExecutionPolicyByCapability: {
    executeTool: "execute",
    withoutExecute: "off",
  },

  // Read-only review subagents must not inherit user MCP tools.
  agentIsolatedMcp: {
    agents: [
      "review-change",
      "review-correction",
      "review-trust",
      "review-runtime",
      "review-evolution",
      "review-efficiency",
    ],
  },

  // Internal skills declaring `user-invocable: false` translate to
  // `disable-slash-command: true` while preserving `disable-model-invocation`.
  skillFrontmatter: {
    nonUserInvocableField: "disable-slash-command",
    stripKeys: ["user-invocable"],
  },

  hooks: {
    format: "antigravity",
    source: "hooks/hooks.json",
    location: "hooks.json",
    runtimePlaceholder: "__OSPEC_ANTIGRAVITY_ROOT__",
  },

  // Canonical AGY 1.5.14 tool names; `search` (`grep_search`/`list_dir`) does
  // not exist in AGY 1.5+ and is dropped from frontmatter grants.
  dropTools: ["search"],
  toolMap: {
    "vscode/askQuestions": "ask_question",
    AskUserQuestion: "ask_question",
    read: "read_file",
    edit: ["write_file", "edit_file"],
    execute: "run_command",
    agent: "invoke_subagent",
  },

  // Antigravity rules scope with `trigger: always_on | glob` plus `globs`, not
  // applyTo (antigravity.google/docs/rules, checked for E0.2). Antigravity
  // matches globs against absolute paths, so relative globs need a `**/` prefix.
  rules: {
    strategy: "to-instructions",
    dir: "rules",
    scopeField: "trigger",
    prefixRelativeGlobs: true,
  },

  drop: [".claude-plugin/", ".codex-plugin/", ".github/", ".opencode/", ".mcp.json"],
  managedRoots: [".mcp.json", "commands"],

  validate: ["node", "scripts/configure/validate-antigravity.js", "{out}"],
};
