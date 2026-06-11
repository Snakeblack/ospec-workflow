"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { runConfigure } = require("./cli.js");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv) {
  const args = {
    source: process.cwd(),
    out: path.join("dist", "claude-marketplace"),
    validate: true,
    marketplaceName: "ospec-tools",
    pluginName: "ospec-workflow",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--source") args.source = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--marketplace-name") args.marketplaceName = argv[++i];
    else if (arg === "--plugin-name") args.pluginName = argv[++i];
    else if (arg === "--no-validate") args.validate = false;
  }

  return args;
}

function buildClaudeMarketplace(options) {
  const outDir = path.resolve(options.out);
  const pluginDir = path.join(outDir, "plugins", options.pluginName);

  fs.rmSync(outDir, { recursive: true, force: true });

  const result = runConfigure({
    sourceDir: path.resolve(options.source),
    target: "claude",
    outDir: pluginDir,
    validate: options.validate,
  });

  const marketplace = {
    name: options.marketplaceName,
    description: "OSpec Workflow Claude Code local marketplace",
    owner: {
      name: "Manuel Michael Retamozo García",
      email: "mretamozo@hiberus.com",
    },
    plugins: [
      {
        name: options.pluginName,
        displayName: "OSpec Workflow",
        description:
          "Spec-Driven Development workflow with OpenSpec, strict TDD, phase agents, skills, hooks, and verification contracts.",
        source: `./plugins/${options.pluginName}`,
        repository: "https://github.com/mretamozo-hiberuscom/ospec-workflow",
        license: "MIT",
        keywords: ["sdd", "openspec", "tdd", "agents", "workflow"],
        category: "development",
      },
    ],
  };

  writeJson(path.join(outDir, ".claude-plugin", "marketplace.json"), marketplace);

  return {
    outDir,
    pluginDir,
    exitCode: result.exitCode,
    validation: result.validation,
  };
}

function main(argv) {
  const args = parseArgs(argv);
  const result = buildClaudeMarketplace(args);

  process.stdout.write(`claude marketplace -> ${result.outDir}\n`);
  process.stdout.write(`plugin -> ${result.pluginDir}\n`);

  if (result.validation?.stdout) process.stdout.write(result.validation.stdout);
  if (result.validation?.stderr) process.stderr.write(result.validation.stderr);

  process.exitCode = result.exitCode;
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  buildClaudeMarketplace,
};