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
  // VS Code's PostToolUse cannot replace a tool result, so the E1.27
  // redaction hook would only inject its note over the original output.
  // hostFlag: VS Code reads a Stop decision only inside hookSpecificOutput (E1.51).
  hooks: { omitEvents: ["PostToolUse"], hostFlag: "vscode" },
  model: true,
  validate: ["node", "scripts/configure/validate-vscode.js", "{out}"],
};
