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

function configureChecksStep(candidateCommand = null) {
  const proposal = candidateCommand
    ? `Proposed command: ${candidateCommand}; ask the user to approve it or provide another command.`
    : "Ask the user which project check command to declare.";
  return {
    action: "configure-checks",
    obligation: "checks-pass",
    file: CONFIG_FILE,
    candidate_command: candidateCommand,
    requires_approval: true,
    how: `Declare checks: in ${CONFIG_FILE} only after explicit user approval. ${proposal} Preserve the other configuration keys; then run ospec next again.`,
  };
}

module.exports = { candidateCheckCommand, configureChecksStep };
