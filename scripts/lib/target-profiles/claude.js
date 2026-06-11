"use strict";

// Declarative Claude Code target profile. Consumed by target-transform.js;
// all per-target format knowledge lives here so preview-format churn touches
// one file. See design.md "Target profile object".

module.exports = {
  id: "claude",
  agentFile: { from: ".agent.md", to: ".md" },
  commandFile: { from: ".prompt.md", to: ".md" },
  manifest: {
    location: ".claude-plugin/plugin.json",
    // string component paths Claude discovers by convention -> omit them
    omitFields: ["agents", "commands", "skills", "hooks", "mcpServers"],
    dropFields: ["rules"],
  },
  hooks: { shape: "nested", location: "hooks/hooks.json" },
  frontmatter: {
    stripKeys: ["target", "user-invocable", "disable-model-invocation"],
    commandRouting: { addKeys: { context: "fork" }, keep: ["agent"] },
  },
  toolMap: {
    "vscode/askQuestions": "AskUserQuestion",
    read: "Read",
    edit: "Edit",
    execute: "Bash",
    search: ["Grep", "Glob"],
    agent: "Agent",
  },
  commandVars: { positional: "$ARGUMENTS", named: "arguments-frontmatter" },
  model: { format: "alias" },
  rules: { strategy: "inline-into-agent", agent: "sdd-orchestrator" },
  validate: 'claude plugin validate --strict "{out}"',
};
