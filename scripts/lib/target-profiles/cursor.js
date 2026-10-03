"use strict";

// Declarative Cursor IDE target profile. Hybrid of Claude-style agent/model
// handling and Codex-style global $HOME install. Layout matches the verified
// live ~/.cursor tree. See openspec/changes/cursor-native-target/design.md.

const ASK_GATE =
  'present blocking gate questions as a structured numbered markdown list in chat (e.g. "1) Option A  2) Option B"), then STOP and wait for the user\'s reply — do not invoke any tool to ask — and persist the accepted decision in `state.yaml`';

module.exports = {
  id: "cursor",
  layout: "dot-cursor",

  agentFile: { from: ".agent.md", to: ".md" },
  commandFile: { from: ".prompt.md", to: ".md" },

  model: { format: "alias" },

  agentReadonly: {
    agents: [
      "review-change",
      "review-correction",
      "review-trust",
      "review-runtime",
      "review-evolution",
      "review-efficiency",
      "review-risk",
      "review-readability",
      "review-reliability",
      "review-resilience",
    ],
  },

  frontmatter: {
    stripKeys: ["target", "user-invocable", "disable-model-invocation", "tools"],
  },

  // Each rule keeps its source scope (E0.2): global -> alwaysApply, path ->
  // globs with alwaysApply: false, agents/** -> embedded in the orchestrator.
  // The repository's own AGENTS.md (release flow) is never distributed; the
  // bounded review lifecycle it once carried lives in sdd-common.
  rules: { strategy: "to-mdc", dir: "rules" },

  hooks: {
    format: "cursor",
    source: "hooks/hooks.json",
    location: "hooks.json",
    runtimePlaceholder: "__OSPEC_CURSOR_ROOT__",
    eventMap: {
      SessionStart: ["beforeSubmitPrompt"],
      PreToolUse: ["beforeShellExecution", "beforeReadFile"],
      PreCompact: ["afterFileEdit"],
      Stop: ["stop"],
    },
  },

  toolMap: {
    read: "Read",
    edit: ["Write", "StrReplace"],
    search: ["Grep", "Glob"],
    execute: "Shell",
    agent: "Task",
    "vscode/askQuestions": { degrade: ASK_GATE },
    AskUserQuestion: { degrade: ASK_GATE },
  },

  drop: [".claude-plugin/", ".mcp.json"],

  validate: ["node", "scripts/configure/validate-cursor.js", "{out}"],
};
