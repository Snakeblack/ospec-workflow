"use strict";

// Declarative VS Code target profile. The canonical source is already VS Code
// format, so this is an identity transform: no renames, no manifest/hooks
// reshaping, or tool substitution. Models are injected from models.yaml per
// agent tier. Emitted only for parity/CI so all three targets share one code
// path. See design.md.

module.exports = {
  id: "vscode",
  agentFile: { from: ".agent.md", to: ".agent.md" },
  commandFile: { from: ".prompt.md", to: ".prompt.md" },
  model: true,
  // Copilot Chat's Customizations editor defaults new files to github-copilot.
  // Force the VS Code target so `model:` (string or fallback array) is honored.
  setAgentFrontmatter: { target: "vscode" },
  validate: ["node", "scripts/configure/validate-vscode.js", "{out}"],
};
