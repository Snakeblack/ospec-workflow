"use strict";

// Build + sync installer for the targets that have NO plugin marketplace:
// opencode and github-copilot. Unlike Claude Code (register marketplace +
// `plugin install`), these tools consume the workflow by having the generated
// tree copied into the ROOT of a destination repo, where they auto-discover it
// (.opencode/ + opencode.json for opencode; .github/ + .mcp.json for copilot).
//
// This collapses "build to dist/, then copy the right folders by hand" into one
// command:
//   node scripts/configure/install-target.js opencode <destRepo>
//   node scripts/configure/install-target.js github-copilot <destRepo>
//
// Copy semantics: overwrite. Generated entries are copied over the destination,
// replacing files of the same path; unrelated files in the destination are left
// untouched. Pass --dry-run to preview without writing.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runConfigure } = require("./cli.js");

const TARGETS = new Set(["opencode", "github-copilot"]);

function parseArgs(argv) {
  const args = { dryRun: false, validate: true };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-validate") args.validate = false;
    else if (arg === "--source") args.source = argv[++i];
    else positional.push(arg);
  }
  [args.target, args.dest] = positional;
  return args;
}

// Refuse to copy a generated tree on top of paths we must never clobber: the
// filesystem root, the home dir, and — critically — the source repo itself.
// The copilot tree carries `.github/` and `scripts/`, so syncing into our own
// repo would overwrite the real harness. Compare resolved paths.
function assertSafeDest(destDir, sourceDir) {
  const abs = path.resolve(destDir);
  const refuse = (reason) => {
    throw new Error(`refusing to sync into ${abs}: ${reason}`);
  };

  if (abs === path.parse(abs).root) refuse("filesystem root");
  const home = os.homedir();
  if (home && abs === path.resolve(home)) refuse("home directory");
  if (abs === path.resolve(sourceDir)) refuse("equals the source repo (would overwrite the harness)");
}

function main(argv) {
  const args = parseArgs(argv);
  const sourceDir = path.resolve(args.source || process.cwd());

  if (!TARGETS.has(args.target) || !args.dest) {
    process.stderr.write(
      "usage: install-target <opencode|github-copilot> <destRepo> [--dry-run] [--no-validate]\n" +
        "  e.g. npm run install:opencode -- ../my-project\n",
    );
    process.exitCode = 2;
    return;
  }

  const destDir = path.resolve(args.dest);
  assertSafeDest(destDir, sourceDir);
  if (!fs.existsSync(destDir) || !fs.statSync(destDir).isDirectory()) {
    process.stderr.write(`destination is not an existing directory: ${destDir}\n`);
    process.exitCode = 2;
    return;
  }

  // Build into dist/<target>. The opencode/copilot validators are pure Node, so
  // validation is safe to run here (no external CLI needed, unlike claude).
  const outDir = path.join(sourceDir, "dist", args.target);
  const result = runConfigure({ sourceDir, target: args.target, outDir, validate: args.validate });

  if (result.validation?.stdout) process.stdout.write(result.validation.stdout);
  if (result.validation?.stderr) process.stderr.write(result.validation.stderr);
  if (result.exitCode !== 0) {
    process.stderr.write("\nbuild/validation failed; nothing synced\n");
    process.exitCode = result.exitCode;
    return;
  }

  // Copy each top-level generated entry (including dotfiles) into the dest root,
  // overwriting same-path files. force:true replaces; recursive walks dirs.
  const entries = fs.readdirSync(outDir);
  process.stdout.write(`\n${args.dryRun ? "[dry-run] would sync" : "sync"} ${outDir} -> ${destDir}\n`);
  for (const entry of entries) {
    const src = path.join(outDir, entry);
    const dst = path.join(destDir, entry);
    process.stdout.write(`  ${args.dryRun ? "·" : "+"} ${entry}\n`);
    if (!args.dryRun) {
      fs.cpSync(src, dst, { recursive: true, force: true });
    }
  }

  if (args.dryRun) {
    process.stdout.write("\n[dry-run] no files written.\n");
  } else {
    process.stdout.write(`\nDone. ${args.target} workflow synced into ${destDir}.\n`);
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { main, assertSafeDest, parseArgs };
