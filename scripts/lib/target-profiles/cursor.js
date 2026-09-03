"use strict";

// Declarative Cursor IDE target profile. Hybrid of Claude-style agent/model
// handling and Codex-style global $HOME install. Layout matches the verified
// live ~/.cursor tree. See openspec/changes/cursor-native-target/design.md.

const ASK_GATE =
  'present blocking gate questions as a structured numbered markdown list in chat (e.g. "1) Option A  2) Option B"), then STOP and wait for the user\'s reply — do not invoke any tool to ask — and persist the accepted decision in `state.yaml`';

module.exports = {
  id: "cursor",
  layout: "dot-cursor",

  // AGENTS.md is only needed by cursor (→ agents-protocol.mdc). Scoped here so
  // other targets never see it (ADR-002).
  sourceRoots: ["AGENTS.md"],

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

  rules: {
    strategy: "to-mdc",
    dir: "rules",
    globs: ["*"],
    alwaysApply: true,
    synthesize: [
      {
        source: "AGENTS.md",
        base: "agents-protocol",
        description: "Post-archive release flow and bounded review lifecycle rules.",
      },
    ],
  },

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
