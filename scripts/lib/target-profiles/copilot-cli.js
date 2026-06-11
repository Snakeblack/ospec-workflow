"use strict";

// Declarative GitHub Copilot CLI target profile. The CLI loader is tolerant and
// accepts the *.agent.md / *.prompt.md suffixes, so file renames are identity.
// Model defaults to inherit (the resolver returns OMIT -> no model: key).
// See design.md; several CLI-specific mappings remain open findings.

module.exports = {
  id: "copilot-cli",
  agentFile: { from: ".agent.md", to: ".agent.md" },
  commandFile: { from: ".prompt.md", to: ".prompt.md" },
  manifest: {
    location: ".claude-plugin/plugin.json",
    dropFields: ["rules"],
  },
  // hooks: flat (no nested shape) — CLI accepts the VS Code form.
  frontmatter: {
    stripKeys: ["target"], // remove warning noise
  },
  toolMap: {
    "vscode/askQuestions": "ask_user",
  },
  model: { format: "name-vendor", default: "OMIT" },
  rules: { strategy: "inline-into-agent", agent: "sdd-orchestrator" },
  validate: null,
};
