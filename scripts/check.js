"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

function runStep(name, args) {
  process.stdout.write(`\n==> ${name}\n`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    process.stderr.write(`${name} failed to start: ${result.error.message}\n`);
    process.exit(result.status || 1);
  }
  if (result.status !== 0) {
    process.stderr.write(`${name} failed with exit code ${result.status}\n`);
    process.exit(result.status || 1);
  }
}

function main() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-github-copilot-"));

  try {
    runStep("Native Node tests", ["--test", "scripts/**/*.test.js"]);
    runStep("Generate and profile-validate GitHub Copilot output", [
      "scripts/configure/cli.js",
      "--target",
      "github-copilot",
      "--out",
      outDir,
    ]);
    process.stdout.write("\nAll checks passed.\n");
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, runStep };
