"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runConfigure } = require("./cli.js");

const MARKETPLACE_NAME = "ospec-tools";
const PLUGIN_NAME = "ospec-workflow";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function assertSafeOutDir(outDir, sourceDir) {
  const abs = path.resolve(outDir);
  const refuse = (reason) => {
    throw new Error(`refusing to write Codex marketplace into ${abs}: ${reason}`);
  };

  if (abs === path.parse(abs).root) refuse("filesystem root");
  if (abs === path.resolve(os.homedir())) refuse("home directory");
  if (abs === path.resolve(sourceDir)) refuse("equals --source");

  for (const protectedDir of [path.resolve(sourceDir), process.cwd()]) {
    if (protectedDir.startsWith(abs + path.sep)) refuse(`is an ancestor of ${protectedDir}`);
  }
}

function buildCodexMarketplace(options) {
  const outDir = path.resolve(options.out);
  const pluginDir = path.join(outDir, "plugins", "codex", PLUGIN_NAME);
  assertSafeOutDir(outDir, options.source);
  const result = runConfigure({
    sourceDir: path.resolve(options.source),
    target: "codex",
    outDir: pluginDir,
    validate: options.validate,
  });

  if (result.exitCode === 0) {
    writeJson(path.join(outDir, ".agents", "plugins", "marketplace.json"), {
      name: MARKETPLACE_NAME,
      interface: { displayName: "OSpec Tools" },
      plugins: [
        {
          name: PLUGIN_NAME,
          source: { source: "local", path: `./plugins/codex/${PLUGIN_NAME}` },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: "Productivity",
        },
      ],
    });
  }

  return { outDir, pluginDir, exitCode: result.exitCode, validation: result.validation };
}

function main(argv) {
  const options = {
    source: process.cwd(),
    out: path.join("dist", "claude-marketplace"),
    validate: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--source") options.source = argv[++index];
    else if (argv[index] === "--out") options.out = argv[++index];
    else if (argv[index] === "--no-validate") options.validate = false;
  }

  const result = buildCodexMarketplace(options);
  process.stdout.write(`codex marketplace -> ${result.outDir}\n`);
  process.stdout.write(`plugin -> ${result.pluginDir}\n`);
  if (result.validation?.stdout) process.stdout.write(result.validation.stdout);
  if (result.validation?.stderr) process.stderr.write(result.validation.stderr);
  process.exitCode = result.exitCode;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { assertSafeOutDir, buildCodexMarketplace };
