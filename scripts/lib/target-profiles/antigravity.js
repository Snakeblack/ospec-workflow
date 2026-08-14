"use strict";

// Declarative Antigravity target profile. Consumed by target-transform.js.
// Maps agent prompts, commands, skills, rules, and hooks for Antigravity IDE
// (~/.gemini/config/).

module.exports = {
  id: "antigravity",

  agentFile: { from: ".agent.md", to: ".agent.md" },
  commandFile: { from: ".prompt.md", to: ".prompt.md" },

  model: { format: "alias" },

  frontmatter: {
    stripKeys: ["target", "disable-model-invocation"],
  },

  hooks: {
    format: "antigravity",
    source: "hooks/hooks.json",
    location: "hooks.json",
    runtimePlaceholder: "__OSPEC_ANTIGRAVITY_ROOT__",
  },

  toolMap: {
    "vscode/askQuestions": "ask_question",
    AskUserQuestion: "ask_question",
    read: "view_file",
    edit: ["write_to_file", "replace_file_content", "multi_replace_file_content"],
    execute: "run_command",
    search: ["grep_search", "list_dir"],
    agent: "invoke_subagent",
  },

  rules: {
    strategy: "to-instructions",
    dir: "rules",
    applyTo: "**",
  },

  drop: [".claude-plugin/", ".codex-plugin/", ".github/", ".opencode/"],

  validate: ["node", "scripts/configure/validate-antigravity.js", "{out}"],
};
