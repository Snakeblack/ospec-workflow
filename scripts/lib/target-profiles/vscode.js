"use strict";

// Declarative VS Code target profile. The canonical source is already VS Code
// format, so this is an identity transform: no renames, no manifest/hooks
// reshaping, no tool substitution, no model injection (the source intentionally
// omits model:, routing is controlled by docs/local config). Emitted only for
// parity/CI so all three targets share one code path. See design.md.

module.exports = {
  id: "vscode",
  agentFile: { from: ".agent.md", to: ".agent.md" },
  commandFile: { from: ".prompt.md", to: ".prompt.md" },
  model: true,
  validate: null,
};
