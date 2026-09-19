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

// INSTALL-026 (FU1): the quality-review attribution behavior must ship through
// the Claude plugin's runtime scripts and shared gate skill. The external
// `claude plugin validate` CLI cannot be extended, so the marketplace builder
// enforces the same sentinels in-repo; a stale build (or an unmapped kernel
// tool reference) fails the build.
const ATTRIBUTION_SENTINELS = [
  { rel: "scripts/lib/review-dimensions.js", needles: ["kernel-contract-change", "validateAttributionOverride"] },
  { rel: "scripts/lib/review-gate-state.js", needles: ["attributionOverride", "attribution-override-invalid"] },
  { rel: "scripts/lib/review-lineage.js", needles: ["taxonomy mismatch: a schema v2 predecessor"] },
  { rel: "scripts/route-dispatch-run.js", needles: ["extractAttributionOverride"] },
  { rel: "skills/_shared/gate-4r-review.md", needles: ["attribution_override"] },
];

function validateAttributionSentinels(pluginDir) {
  const errors = [];
  for (const { rel, needles } of ATTRIBUTION_SENTINELS) {
    const abs = path.join(pluginDir, rel);
    if (!fs.existsSync(abs)) {
      errors.push(`attribution sentinel missing (unmapped kernel tool reference): ${rel}`);
      continue;
    }
    const content = fs.readFileSync(abs, "utf8");
    for (const needle of needles) {
      if (!content.includes(needle)) errors.push(`attribution sentinel stale in ${rel}: missing ${needle}`);
    }
  }
  return errors;
}

function buildClaudeMarketplace(options, deps = {}) {
  const outDir = path.resolve(options.out);
  const pluginDir = path.join(outDir, "plugins", options.pluginName);

  assertSafeOutDir(outDir, options.source);
  fs.rmSync(outDir, { recursive: true, force: true });

  const runConfigureImpl = deps.runConfigure || runConfigure;
  const validateAttributionSentinelsImpl = deps.validateAttributionSentinels || validateAttributionSentinels;
  const result = runConfigureImpl({
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

  const sentinelErrors = validateAttributionSentinelsImpl(pluginDir);

  return {
    outDir,
    pluginDir,
    exitCode: sentinelErrors.length ? 1 : result.exitCode,
    validation: sentinelErrors.length
      ? { ...result.validation, stderr: `${(result.validation && result.validation.stderr) || ""}${sentinelErrors.map((error) => `error: ${error}\n`).join("")}` }
      : result.validation,
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
  validateAttributionSentinels,
};
