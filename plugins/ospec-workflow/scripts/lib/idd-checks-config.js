"use strict";

// Read-only suggestions, never commands to run or configuration to write.
const fs = require("node:fs");
const path = require("node:path");
const { CONFIG_FILE } = require("./idd-config.js");

function candidateCheckCommand(root) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  } catch {
    return null;
  }
  const script = manifest?.scripts?.test;
  if (typeof script !== "string" || !script.trim() || /no test specified/i.test(script)) return null;
  // Honor an explicit manager. Lockfiles only disambiguate an undeclared one.
  const commands = { npm: "npm test", pnpm: "pnpm test", yarn: "yarn test", bun: "bun run test" };
  if (manifest.packageManager !== undefined) {
    if (typeof manifest.packageManager !== "string") return null;
    const manager = /^(npm|pnpm|yarn|bun)@[^\s]+$/.exec(manifest.packageManager);
    return manager ? commands[manager[1]] : null;
  }
  const locks = { npm: ["package-lock.json", "npm-shrinkwrap.json"], pnpm: ["pnpm-lock.yaml"], yarn: ["yarn.lock"], bun: ["bun.lock", "bun.lockb"] };
  const managers = Object.entries(locks).filter(([, files]) => files.some((file) => fs.existsSync(path.join(root, file)))).map(([manager]) => manager);
  if (managers.length > 1) return null;
  return commands[managers[0] || "npm"];
}

// The user approves the command at checks-changed (E1.49): ospec check opens
// it for a command written to the configuration and runs nothing until then.
function configureChecksStep(candidateCommand = null) {
  const proposal = candidateCommand
    ? `Proposed command: ${candidateCommand}.`
    : "No command is known: ask the user which project check command to declare.";
  return {
    action: "configure-checks",
    obligation: "checks-pass",
    file: CONFIG_FILE,
    candidate_command: candidateCommand,
    requires_approval: true,
    how: `${proposal} Write it under checks: in ${CONFIG_FILE}, preserving the other configuration keys, and run ospec check: it runs nothing and opens checks-changed for the user's explicit approval. If the user declines, restore ${CONFIG_FILE}.`,
  };
}

module.exports = { candidateCheckCommand, configureChecksStep };
