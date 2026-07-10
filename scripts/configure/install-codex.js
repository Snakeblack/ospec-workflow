"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { runConfigure } = require("./cli.js");
const { assertSafeDest } = require("./install-target.js");

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

function resolveCodexInvocation(bin, args, deps = {}) {
  const platform = deps.platform || process.platform;
  const execPath = deps.execPath || process.execPath;
  const fsImpl = deps.fs || fs;
  if (platform === "win32" && /\.(?:cmd|bat|ps1)$/i.test(bin)) {
    const cliPath = path.join(
      path.dirname(bin),
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js",
    );
    if (fsImpl.existsSync(cliPath)) {
      return { command: execPath, args: [cliPath, ...args] };
    }
  }
  return { command: bin, args };
}

function findCodexBin(deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  const resolveBin = deps.resolveBinFromPath || resolveBinFromPath;
  const resolveInvocation = deps.resolveCodexInvocation || resolveCodexInvocation;
  const resolved = resolveBin("codex");
  if (resolved) {
    const invocation = resolveInvocation(resolved, ["--version"], deps);
    const probe = spawn(invocation.command, invocation.args, { stdio: "ignore", shell: false });
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



function normalizeCodexMcpName(name) {
  const leaf = String(name).split("/").filter(Boolean).pop() || "mcp";
  const normalized = leaf.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) {
    throw new Error(`cannot derive a valid Codex MCP name from: ${name}`);
  }
  return normalized;
}

function readCodexMcpDefinitions(sourceDir, fsImpl = fs) {
  const mcpPath = path.join(sourceDir, ".mcp.json");
  if (!fsImpl.existsSync(mcpPath)) {
    return [];
  }
  const parsed = JSON.parse(fsImpl.readFileSync(mcpPath, "utf8"));
  const servers = parsed?.mcpServers || parsed?.mcp_servers || parsed;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error("source .mcp.json must contain an MCP server map");
  }

  const definitions = [];
  const names = new Set();
  for (const [sourceName, server] of Object.entries(servers)) {
    if (!server || typeof server !== "object" || typeof server.command !== "string") {
      continue;
    }
    const name = normalizeCodexMcpName(sourceName);
    if (names.has(name)) {
      throw new Error(`multiple MCP definitions normalize to the Codex name: ${name}`);
    }
    names.add(name);
    definitions.push({
      name,
      command: server.command,
      args: Array.isArray(server.args) ? server.args.map(String) : [],
    });
  }
  return definitions;
}

function sameStringArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameMcpIdentity(existing, definition) {
  const transport = existing?.transport || existing;
  return transport?.type !== "http" &&
    transport?.command === definition.command &&
    sameStringArray(transport?.args || [], definition.args || []);
}

function ensureCodexMcps(codexBin, definitions, deps = {}) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    return 0;
  }
  const runCodexCommand = deps.runCodexCommand || defaultRunCodexCommand;
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const listed = runCodexCommand(codexBin, ["mcp", "list", "--json"], deps);
  if (listed.stderr) stderr.write(listed.stderr);
  const listExitCode = listed.status === null || listed.status === undefined ? 1 : listed.status;
  if (listExitCode !== 0) {
    stderr.write("codex command failed while listing MCP servers; no MCP configuration was changed\n");
    return listExitCode;
  }

  let existing;
  try {
    existing = JSON.parse(listed.stdout || "[]");
  } catch (error) {
    stderr.write(`codex mcp list returned invalid JSON: ${error.message}\n`);
    return 1;
  }
  if (!Array.isArray(existing)) {
    stderr.write("codex mcp list returned an unexpected JSON shape\n");
    return 1;
  }

  for (const definition of definitions) {
    const equivalent = existing.find((server) => sameMcpIdentity(server, definition));
    if (equivalent) {
      stdout.write(`reusing existing MCP '${equivalent.name}' for ${definition.name}; no duplicate added\n`);
      continue;
    }
    const nameCollision = existing.find((server) => server?.name === definition.name);
    if (nameCollision) {
      stderr.write(
        `MCP '${definition.name}' already exists with a different command; preserving the user-owned entry\n`,
      );
      continue;
    }

    const commandArgs = ["mcp", "add", definition.name, "--", definition.command, ...definition.args];
    const added = runCodexCommand(codexBin, commandArgs, deps);
    if (added.stdout) stdout.write(added.stdout);
    if (added.stderr) stderr.write(added.stderr);
    const addExitCode = added.status === null || added.status === undefined ? 1 : added.status;
    if (addExitCode !== 0) {
      stderr.write(`codex command failed: ${codexBin} ${commandArgs.join(" ")}\n`);
      return addExitCode;
    }
    existing.push({
      name: definition.name,
      transport: { type: "stdio", command: definition.command, args: definition.args },
    });
  }
  return 0;
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

function defaultRunCodexCommand(bin, args, deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
  const invocation = resolveCodexInvocation(bin, args, deps);
  const result = spawn(invocation.command, invocation.args, { encoding: "utf8", shell: false });
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
    const agentDestFile = isRepoInstall
      ? path.join(path.dirname(codexRoot), "agent.md")
      : path.join(codexRoot, "agent.md");

    if (!args.dryRun && !isRepoInstall) {
      const codexBin = findCodexBinImpl();
      const mcpDefinitions = readCodexMcpDefinitions(sourceDir, fsImpl);
      if (!codexBin) {
        stdout.write(
          "codex CLI not found on PATH; built agent instructions and MCP command(s) are ready:\n" +
            mcpDefinitions.map((server) =>
              `codex mcp add ${server.name} -- ${server.command} ${server.args.join(" ")}\n`,
            ).join(""),
        );
      } else {
        const mcpExitCode = ensureCodexMcps(codexBin, mcpDefinitions, deps);
        if (mcpExitCode !== 0) {
          return mcpExitCode;
        }
      }
    }

    // Perform security checks immediately before writing to avoid TOCTOU window
    assertManagedPathSafe(codexRoot, agentsDest, "Codex agents destination", fsImpl);
    assertManagedPathSafe(isRepoInstall ? path.dirname(codexRoot) : codexRoot, agentDestFile, "Codex agent file destination", fsImpl);

    copyCodexAgents(outDir, agentsDest, { fs: fsImpl, dryRun: args.dryRun });

    if (!args.dryRun) {
      fsImpl.copyFileSync(path.join(outDir, "agent.md"), agentDestFile);
    }

    if (args.dryRun) {
      stdout.write("[dry-run] Codex agents and agent.md prepared; no files were written.\n");
      return 0;
    }

    if (isRepoInstall) {
      stdout.write(`Done. Codex agent.md and custom agents synced into ${path.dirname(codexRoot)}.\n`);
      return 0;
    }

    stdout.write("Done. Codex agent.md and custom agents are ready.\n");
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
  resolveCodexInvocation,
  copyCodexAgents,
  readCodexMcpDefinitions,
  ensureCodexMcps,
  assertManagedPathSafe,
  main,
};
