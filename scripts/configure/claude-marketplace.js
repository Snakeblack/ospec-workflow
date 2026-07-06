"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runConfigure } = require("./cli.js");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

// Guard the recursive delete that precedes every build. `--out` is attacker- or
// fat-finger-controlled; without this an `--out C:\` or `--out .` would nuke
// unrelated data. We refuse the filesystem root, the home directory, anything
// that is (or contains) --source or the cwd, and any non-empty directory that
// is not a previous marketplace build. A prior build is recognised by its
// .claude-plugin/marketplace.json marker, so re-runs stay idempotent.
function assertSafeOutDir(outDir, sourceDir) {
  const abs = path.resolve(outDir);
  const refuse = (reason) => {
    throw new Error(`refusing to clobber --out ${abs}: ${reason}`);
  };

  if (abs === path.parse(abs).root) refuse("filesystem root");
  const home = os.homedir();
  if (home && abs === path.resolve(home)) refuse("home directory");
  if (abs === path.resolve(sourceDir)) refuse("equals --source");

  for (const protectedDir of [path.resolve(sourceDir), process.cwd()]) {
    if (protectedDir === abs || protectedDir.startsWith(abs + path.sep)) {
      refuse(`is an ancestor of ${protectedDir}`);
    }
  }

  if (fs.existsSync(abs)) {
    if (!fs.statSync(abs).isDirectory()) refuse("not a directory");
    const nonEmpty = fs.readdirSync(abs).length > 0;
    const isPriorBuild = fs.existsSync(path.join(abs, ".claude-plugin", "marketplace.json"));
    if (nonEmpty && !isPriorBuild) {
      refuse("non-empty and not a previous marketplace build (missing .claude-plugin/marketplace.json)");
    }
  }
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

  assertSafeOutDir(outDir, options.source);
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
      email: "hello@mretamozo.com",
    },
    plugins: [
      {
        name: options.pluginName,
        displayName: "OSpec Workflow",
        description:
          "Spec-Driven Development workflow with OpenSpec, strict TDD, phase agents, skills, hooks, and verification contracts.",
        source: `./plugins/${options.pluginName}`,
        repository: "https://github.com/snakeblack/ospec-workflow",
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
  assertSafeOutDir,
  buildClaudeMarketplace,
};