"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { runConfigure } = require("./cli.js");
const { assertSafeDest } = require("./install-target.js");

const MARKETPLACE_NAME = "ospec-tools";
const PLUGIN_NAME = "ospec-workflow";

function usage() {
  return (
    "usage: install-codex [<destRepo>] [--dry-run] [--no-validate] [--source <sourceRepo>]\n" +
    "  e.g. npm run install:codex -- ../my-project\n"
  );
}

function parseArgs(argv) {
  const args = { dryRun: false, validate: true, source: undefined, destRepo: undefined };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-validate") args.validate = false;
    else if (arg === "--source") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args.error = "missing value for --source";
        return args;
      }
      args.source = next;
      i += 1;
    }
    else positional.push(arg);
  }
  [args.destRepo] = positional;
  return args;
}

function resolveBinFromPath(binName) {
  const pathEnv = process.env.PATH || "";
  const delimiter = process.platform === "win32" ? ";" : ":";
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];

  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const fullPath = path.join(dir, binName + ext);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          return fullPath;
        }
      } catch {
        // ignore access/existence errors
      }
    }
  }
  return null;
}

function findCodexBin(deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  const resolveBin = deps.resolveBinFromPath || resolveBinFromPath;
  const resolved = resolveBin("codex");
  if (resolved) {
    const probe = spawn(resolved, ["--version"], { stdio: "ignore", shell: false });
    if (!probe.error) {
      return resolved;
    }
  }
  return null;
}

function copyTree(sourceDir, destDir, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(destDir), { recursive: true });
  fsImpl.cpSync(sourceDir, destDir, { recursive: true, force: true });
}

function buildCodexMarketplace(sourceDir, outDir, deps = {}) {
  const fsImpl = deps.fs || fs;
  fsImpl.rmSync(outDir, { recursive: true, force: true });
  const pluginDir = path.join(outDir, "plugins", PLUGIN_NAME);
  copyTree(sourceDir, pluginDir, fsImpl);
  fsImpl.mkdirSync(outDir, { recursive: true });
  fsImpl.writeFileSync(
    path.join(outDir, "marketplace.json"),
    JSON.stringify(
      {
        name: MARKETPLACE_NAME,
        plugins: [
          {
            name: PLUGIN_NAME,
            source: `./plugins/${PLUGIN_NAME}`,
          },
        ],
      },
      null,
      2,
    ) + "\n",
  );
  return { marketplaceDir: outDir, pluginDir };
}

function copyCodexAgents(outDir, destDir, deps = {}) {
  const fsImpl = deps.fs || fs;
  const dryRun = deps.dryRun || false;
  const agentsDir = path.join(outDir, ".codex", "agents");
  const copied = [];
  fsImpl.mkdirSync(destDir, { recursive: true });
  for (const entry of fsImpl.readdirSync(agentsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".toml")) {
      continue;
    }
    const src = path.join(agentsDir, entry.name);
    const dest = path.join(destDir, entry.name);
    assertManagedPathSafe(destDir, dest, "Codex agent file destination", fsImpl);
    copied.push(dest);
    if (!dryRun) {
      fsImpl.copyFileSync(src, dest);
    }
  }
  return copied;
}

function extractManagedCodexConfig(sourceText) {
  const text = String(sourceText);
  const lines = text.split(/\r?\n/);
  const agentsHeaderIndex = lines.findIndex((line) => /^\[agents\]\s*$/.test(line));
  if (agentsHeaderIndex === -1) {
    throw new Error("source .codex/config.toml is missing [agents]");
  }

  const agentsLines = [];
  for (let i = agentsHeaderIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\[.+\]\s*$/.test(line)) {
      break;
    }
    if (line.trim()) {
      agentsLines.push(line);
    }
  }
  if (agentsLines.length === 0) {
    throw new Error("source .codex/config.toml has no managed [agents] assignments");
  }

  const skillsConfigLine = lines.find((line) => /^skills\.config\s*=/.test(line));
  if (!skillsConfigLine) {
    throw new Error("source .codex/config.toml is missing skills.config");
  }

  return { agentsLines, skillsConfigLine };
}

function replaceAgentsBlock(lines, agentsLines) {
  // Find the [agents] section header in the config file lines.
  const headerIndex = lines.findIndex((line) => /^\[agents\]\s*$/.test(line));
  if (headerIndex === -1) {
    // If the section doesn't exist, append it at the end of the file
    // with a leading blank line for proper separation.
    if (lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push("[agents]", ...agentsLines);
    return lines;
  }

  // If the section exists, find where it ends (next section starting with '[')
  let endIndex = lines.length;
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    if (/^\[.+\]\s*$/.test(lines[i])) {
      endIndex = i;
      break;
    }
  }
  // Replace only the lines inside the [agents] block. splice removes the old lines
  // starting at headerIndex + 1 and inserts the new agentsLines.
  lines.splice(headerIndex + 1, endIndex - (headerIndex + 1), ...agentsLines);
  return lines;
}

function replaceSkillsConfig(lines, skillsConfigLine) {
  // Search for an existing skills.config property assignment.
  const skillsIndex = lines.findIndex((line) => /^skills\.config\s*=/.test(line));
  if (skillsIndex === -1) {
    // If not found, insert it right before the first section header (e.g. [agents])
    // to keep top-level parameters grouped at the beginning.
    const firstSectionIndex = lines.findIndex((line) => /^\[.+\]\s*$/.test(line));
    const insertionIndex = firstSectionIndex === -1 ? 0 : firstSectionIndex;
    const prefix = insertionIndex > 0 && lines[insertionIndex - 1] !== "" ? [""] : [];
    lines.splice(insertionIndex, 0, skillsConfigLine, ...prefix);
    return lines;
  }
  // If already present, replace the line content directly.
  lines[skillsIndex] = skillsConfigLine;
  return lines;
}

function mergeManagedCodexConfig(sourceText, destText) {
  const managed = extractManagedCodexConfig(sourceText);
  const destLines = String(destText || "").split(/\r?\n/);
  replaceAgentsBlock(destLines, managed.agentsLines);
  replaceSkillsConfig(destLines, managed.skillsConfigLine);
  return destLines.join("\n").replace(/\n*$/, "\n");
}

function mergeCodexConfig(sourceConfigPath, destConfigPath, deps = {}) {
  const fsImpl = deps.fs || fs;
  const dryRun = deps.dryRun || false;
  const sourceText = fsImpl.readFileSync(sourceConfigPath, "utf8");
  const destText = fsImpl.existsSync(destConfigPath) ? fsImpl.readFileSync(destConfigPath, "utf8") : "";
  const merged = mergeManagedCodexConfig(sourceText, destText);
  if (!dryRun) {
    fsImpl.mkdirSync(path.dirname(destConfigPath), { recursive: true });
    fsImpl.writeFileSync(destConfigPath, merged);
  }
  return merged;
}

function defaultRunCodexCommand(bin, args, deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  const result = spawn(bin, args, { encoding: "utf8", shell: false });
  if (result.error) {
    return {
      status: 1,
      stdout: "",
      stderr: `failed to execute codex command '${bin}': ${result.error.message || result.error}\n`
    };
  }
  return result;
}

function lstatIfExists(targetPath, fsImpl = fs) {
  try {
    return fsImpl.lstatSync(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function realpathIfExists(targetPath, fsImpl = fs) {
  try {
    return fsImpl.realpathSync(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return path.resolve(targetPath);
    }
    throw error;
  }
}

function assertManagedPathSafe(rootPath, managedPath, label, fsImpl = fs) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedManaged = path.resolve(managedPath);
  const rootStat = lstatIfExists(resolvedRoot, fsImpl);
  if (rootStat?.isSymbolicLink()) {
    throw new Error(`${label} redirects through a symlinked or canonicalized root: ${resolvedRoot}`);
  }
  const managedStat = lstatIfExists(resolvedManaged, fsImpl);
  if (managedStat?.isSymbolicLink()) {
    throw new Error(`${label} redirects through a symlinked or canonicalized path: ${resolvedManaged}`);
  }
  const canonicalRoot = realpathIfExists(resolvedRoot, fsImpl);
  const canonicalManaged = realpathIfExists(path.dirname(resolvedManaged), fsImpl);
  const relative = path.relative(canonicalRoot, canonicalManaged);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the approved Codex root via canonical path redirection`);
  }
}

function registerCodexPlugins(codexBin, marketplaceDir, pluginId, deps) {
  const runCodexCommand = deps.runCodexCommand || defaultRunCodexCommand;
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;

  for (const commandArgs of [
    ["plugin", "marketplace", "add", marketplaceDir],
    ["plugin", "add", pluginId],
  ]) {
    const command = runCodexCommand(codexBin, commandArgs, deps);
    if (command.stdout) stdout.write(command.stdout);
    if (command.stderr) stderr.write(command.stderr);
    
    const exitCode = command.status === null || command.status === undefined ? 1 : command.status;
    if (exitCode !== 0) {
      stderr.write(
        `codex command failed: ${codexBin} ${commandArgs.join(" ")}\n` +
          `manual recovery: codex plugin marketplace add \"${marketplaceDir}\" && codex plugin add ${pluginId}\n`,
      );
      return exitCode;
    }
  }
  return 0;
}

function main(argv, deps = {}) {
  const args = parseArgs(argv);
  const cwd = deps.cwd || process.cwd();
  const fsImpl = deps.fs || fs;
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const runConfigureImpl = deps.runConfigure || runConfigure;
  const findCodexBinImpl = deps.findCodexBin || findCodexBin;
  const homedir = deps.homedir || os.homedir;
  const assertSafeDestImpl = deps.assertSafeDest || assertSafeDest;

  if (args.error) {
    stderr.write(`${usage()}${args.error}\n`);
    return 2;
  }

  const sourceDir = path.resolve(args.source || cwd);
  const isRepoInstall = Boolean(args.destRepo);
  try {
    let codexRoot;
    if (isRepoInstall) {
      const destRepo = path.resolve(args.destRepo);
      assertSafeDestImpl(destRepo, sourceDir);
      if (!fsImpl.existsSync(destRepo) || !fsImpl.statSync(destRepo).isDirectory()) {
        stderr.write(`destination is not an existing directory: ${destRepo}\n`);
        return 2;
      }
      codexRoot = path.join(destRepo, ".codex");
    } else {
      codexRoot = path.join(homedir(), ".codex");
    }

    const outDir = path.join(sourceDir, "dist", "codex");
    const result = runConfigureImpl({ sourceDir, target: "codex", outDir, validate: args.validate });
    if (result.validation?.stdout) stdout.write(result.validation.stdout);
    if (result.validation?.stderr) stderr.write(result.validation.stderr);
    if (result.exitCode !== 0) {
      stderr.write("\nbuild/validation failed; nothing installed\n");
      return result.exitCode;
    }

    const agentsDest = path.join(codexRoot, "agents");
    const configDest = path.join(codexRoot, "config.toml");
    const sourceConfigPath = path.join(outDir, ".codex", "config.toml");
    const sourceConfigText = fsImpl.readFileSync(sourceConfigPath, "utf8");
    extractManagedCodexConfig(sourceConfigText);

    const marketplaceDir = path.join(sourceDir, "dist", "codex-marketplace");
    const pluginId = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

    if (!args.dryRun && !isRepoInstall) {
      buildCodexMarketplace(outDir, marketplaceDir, { fs: fsImpl });
      const codexBin = findCodexBinImpl();
      if (!codexBin) {
        stdout.write(
          "codex CLI not found on PATH; built artifacts are ready for manual installation.\n" +
            `codex plugin marketplace add \"${marketplaceDir}\"\n` +
            `codex plugin add ${pluginId}\n`,
        );
      } else {
        const exitCode = registerCodexPlugins(codexBin, marketplaceDir, pluginId, deps);
        if (exitCode !== 0) {
          return exitCode;
        }
      }
    }

    // Perform security checks immediately before writing to avoid TOCTOU window
    assertManagedPathSafe(codexRoot, agentsDest, "Codex agents destination", fsImpl);
    assertManagedPathSafe(codexRoot, configDest, "Codex config destination", fsImpl);

    copyCodexAgents(outDir, agentsDest, { fs: fsImpl, dryRun: args.dryRun });
    mergeCodexConfig(sourceConfigPath, configDest, { fs: fsImpl, dryRun: args.dryRun });

    if (args.dryRun) {
      stdout.write("[dry-run] Codex agents/config prepared; no files were written.\n");
      return 0;
    }

    if (isRepoInstall) {
      stdout.write(`Done. Codex agents/config synced into ${path.dirname(codexRoot)}.\n`);
      return 0;
    }

    stdout.write("Done. Codex marketplace, plugin, agents, and config are installed.\n");
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  findCodexBin,
  buildCodexMarketplace,
  copyCodexAgents,
  extractManagedCodexConfig,
  mergeManagedCodexConfig,
  assertManagedPathSafe,
  main,
};
