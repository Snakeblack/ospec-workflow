"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { runConfigure } = require("./cli.js");
const { assertSafeDest } = require("./install-target.js");

const SUPPORTED_CODEX_MCPS = Object.freeze({
  context7: Object.freeze({ command: "npx", args: Object.freeze(["@upstash/context7-mcp@1.0.31"]) }),
  markitdown: Object.freeze({ command: "uvx", args: Object.freeze(["markitdown-mcp@0.0.1a4"]) }),
});

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

function copyCodexRuntime(outDir, runtimeDir, deps = {}) {
  const fsImpl = deps.fs || fs;
  const result = { updated: [], unchanged: [] };
  const scriptsSource = path.join(outDir, "scripts");
  if (fsImpl.existsSync(scriptsSource)) {
    syncTreeByContent(scriptsSource, path.join(runtimeDir, "scripts"), fsImpl, result);
  }
  const schemasSource = path.join(outDir, "schemas");
  const schemasDestination = path.join(runtimeDir, "schemas");
  if (fsImpl.existsSync(schemasSource)) {
    pruneManagedTree(schemasSource, schemasDestination, fsImpl);
    syncTreeByContent(schemasSource, schemasDestination, fsImpl, result);
  }
  return result;
}

function filesMatch(source, destination, fsImpl = fs) {
  try {
    return fsImpl.readFileSync(source).equals(fsImpl.readFileSync(destination));
  } catch {
    return false;
  }
}

function syncTreeByContent(sourceDir, destDir, fsImpl = fs, result = { updated: [], unchanged: [] }) {
  fsImpl.mkdirSync(destDir, { recursive: true });
  for (const entry of fsImpl.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      syncTreeByContent(source, destination, fsImpl, result);
    } else if (entry.isFile()) {
      if (filesMatch(source, destination, fsImpl)) {
        result.unchanged.push(destination);
      } else {
        fsImpl.mkdirSync(path.dirname(destination), { recursive: true });
        fsImpl.copyFileSync(source, destination);
        result.updated.push(destination);
      }
    }
  }
  return result;
}

function pruneManagedTree(sourceDir, destDir, fsImpl = fs) {
  if (!fsImpl.existsSync(destDir)) return;
  const sourceEntries = new Map(fsImpl.readdirSync(sourceDir, { withFileTypes: true }).map((entry) => [entry.name, entry]));
  for (const entry of fsImpl.readdirSync(destDir, { withFileTypes: true })) {
    const sourceEntry = sourceEntries.get(entry.name);
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destDir, entry.name);
    if (!sourceEntry || sourceEntry.isDirectory() !== entry.isDirectory()) {
      fsImpl.rmSync(destination, { recursive: true, force: true });
    } else if (sourceEntry.isDirectory()) {
      pruneManagedTree(source, destination, fsImpl);
    }
  }
}

function preflightManagedTree(sourceDir, destDir, approvedRoot, fsImpl = fs) {
  const sourceStat = lstatIfExists(sourceDir, fsImpl);
  if (!sourceStat?.isDirectory() || sourceStat.isSymbolicLink()) {
    throw new Error(`generated Codex skills root must be a real directory: ${sourceDir}`);
  }

  for (const entry of fsImpl.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destDir, entry.name);
    assertManagedPathSafe(approvedRoot, destination, "Codex skill destination", fsImpl);
    if (entry.isDirectory()) {
      preflightManagedTree(source, destination, approvedRoot, fsImpl);
    } else if (!entry.isFile()) {
      throw new Error(`generated Codex skill entry must be a regular file or directory: ${source}`);
    }
  }
}

function syncCodexSkills(outDir, skillsRoot, deps = {}) {
  const fsImpl = deps.fs || fs;
  const source = path.join(outDir, "skills");
  const approvedRoot = deps.approvedRoot || path.dirname(path.dirname(skillsRoot));
  preflightManagedTree(source, skillsRoot, approvedRoot, fsImpl);
  return syncTreeByContent(source, skillsRoot, fsImpl);
}

function appendAgentSkillConfig(agentPath, skillPath, fsImpl = fs) {
  const text = fsImpl.readFileSync(agentPath, "utf8");
  const config = `\n[[skills.config]]\npath = ${JSON.stringify(skillPath)}\nenabled = true\n`;
  fsImpl.writeFileSync(agentPath, text.replace(/\n?\[\[skills\.config\]\][\s\S]*$/m, "").replace(/\s*$/, "\n") + config);
}

function isManagedHookGroup(group) {
  return JSON.stringify(group).includes("OSPEC_TARGET=codex") &&
    JSON.stringify(group).includes("ospec-workflow");
}

function installCodexHooks(outDir, codexRoot, runtimeDir, deps = {}) {
  const fsImpl = deps.fs || fs;
  const sourcePath = path.join(outDir, "hooks.json");
  const destPath = path.join(codexRoot, "hooks.json");
  if (!fsImpl.existsSync(sourcePath)) {
    return;
  }

  const generated = JSON.parse(fsImpl.readFileSync(sourcePath, "utf8"));
  if (!generated.hooks || typeof generated.hooks !== "object" || Array.isArray(generated.hooks)) {
    throw new Error("generated Codex hooks.json must contain a hooks object");
  }

  let existing = { hooks: {} };
  if (fsImpl.existsSync(destPath)) {
    existing = JSON.parse(fsImpl.readFileSync(destPath, "utf8"));
    if (!existing.hooks || typeof existing.hooks !== "object" || Array.isArray(existing.hooks)) {
      throw new Error("existing Codex hooks.json must contain a hooks object");
    }
  }

  const runtimePosix = path.resolve(runtimeDir).split(path.sep).join("/");
  const runtimeWindows = path.resolve(runtimeDir).split(path.sep).join("\\");
  const renderValue = (value, key) => {
    if (typeof value === "string") {
      return value.replaceAll("__OSPEC_RUNTIME__", key === "commandWindows" ? runtimeWindows : runtimePosix);
    }
    if (Array.isArray(value)) {
      return value.map((entry) => renderValue(entry));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        renderValue(childValue, childKey),
      ]));
    }
    return value;
  };
  for (const [event, groups] of Object.entries(generated.hooks)) {
    const rendered = renderValue(groups);
    const preserved = Array.isArray(existing.hooks[event])
      ? existing.hooks[event].filter((group) => !isManagedHookGroup(group))
      : [];
    existing.hooks[event] = [...preserved, ...rendered];
  }
  fsImpl.mkdirSync(codexRoot, { recursive: true });
  fsImpl.writeFileSync(destPath, JSON.stringify(existing, null, 2) + "\n");
}



function normalizeCodexMcpName(name) {
  const leaf = String(name).split("/").filter(Boolean).pop() || "mcp";
  const normalized = leaf.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) {
    throw new Error("source .mcp.json contains an unsupported Codex MCP definition");
  }
  return normalized;
}

function isSupportedCodexMcpDefinition(definition) {
  const supported = definition && SUPPORTED_CODEX_MCPS[definition.name];
  return Boolean(supported) && definition.command === supported.command &&
    sameStringArray(definition.args, supported.args);
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
      throw new Error("source .mcp.json contains an unsupported Codex MCP definition");
    }
    const name = normalizeCodexMcpName(sourceName);
    const args = Array.isArray(server.args) ? server.args.map(String) : [];
    const definition = { name, command: server.command, args };
    if (!isSupportedCodexMcpDefinition(definition)) {
      throw new Error("source .mcp.json contains an unsupported Codex MCP definition");
    }
    if (names.has(name)) {
      throw new Error(`multiple MCP definitions normalize to the Codex name: ${name}`);
    }
    names.add(name);
    definitions.push(definition);
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

function createMcpMutationJournal(codexBin, deps, stderr) {
  const addedNames = [];
  let active = true;
  return {
    record(name) {
      if (active && !addedNames.includes(name)) addedNames.push(name);
    },
    forget(name) {
      const index = addedNames.indexOf(name);
      if (index >= 0) addedNames.splice(index, 1);
    },
    commit() {
      active = false;
      addedNames.length = 0;
    },
    rollback() {
      if (!active) return;
      active = false;
      const names = addedNames.splice(0).reverse();
      const runCodexCommand = deps.runCodexCommand || defaultRunCodexCommand;
      for (const name of names) {
        let removed;
        try {
          removed = runCodexCommand(codexBin, ["mcp", "remove", name], deps);
        } catch {
          stderr.write("failed to roll back a newly added Codex MCP server; pre-existing servers were preserved\n");
          continue;
        }
        const exitCode = removed.status === null || removed.status === undefined ? 1 : removed.status;
        if (exitCode !== 0) {
          stderr.write("failed to roll back a newly added Codex MCP server; pre-existing servers were preserved\n");
        }
      }
    },
  };
}

function ensureCodexMcps(codexBin, definitions, deps = {}) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    return 0;
  }
  const runCodexCommand = deps.runCodexCommand || defaultRunCodexCommand;
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  if (definitions.some((definition) => !isSupportedCodexMcpDefinition(definition))) {
    stderr.write("unsupported Codex MCP definition; no MCP configuration was changed\n");
    return 1;
  }
  let listed;
  try {
    listed = runCodexCommand(codexBin, ["mcp", "list", "--json"], deps);
  } catch {
    stderr.write("codex command failed while listing MCP servers; no MCP configuration was changed\n");
    return 1;
  }
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

  const addedNames = [];
  const rollbackAdditions = () => {
    for (const name of [...addedNames].reverse()) {
      deps.mcpMutationJournal?.forget(name);
      let removed;
      try {
        removed = runCodexCommand(codexBin, ["mcp", "remove", name], deps);
      } catch {
        stderr.write("failed to roll back a newly added Codex MCP server; pre-existing servers were preserved\n");
        continue;
      }
      const removeExitCode = removed.status === null || removed.status === undefined ? 1 : removed.status;
      if (removeExitCode !== 0) {
        stderr.write("failed to roll back a newly added Codex MCP server; pre-existing servers were preserved\n");
      }
    }
  };

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
    let added;
    try {
      added = runCodexCommand(codexBin, commandArgs, deps);
    } catch {
      stderr.write("codex command failed while adding a supported MCP server\n");
      rollbackAdditions();
      return 1;
    }
    if (added.stdout) stdout.write(added.stdout);
    if (added.stderr) stderr.write(added.stderr);
    const addExitCode = added.status === null || added.status === undefined ? 1 : added.status;
    if (addExitCode !== 0) {
      stderr.write(`codex command failed: ${codexBin} ${commandArgs.join(" ")}\n`);
      rollbackAdditions();
      return addExitCode;
    }
    addedNames.push(definition.name);
    deps.mcpMutationJournal?.record(definition.name);
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
  const skillsRoot = deps.skillsRoot;
  const agentsDir = path.join(outDir, ".codex", "agents");
  const copied = [];
  if (!dryRun) fsImpl.mkdirSync(destDir, { recursive: true });
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
      if (skillsRoot) {
        appendAgentSkillConfig(dest, path.join(skillsRoot, path.basename(entry.name, ".toml")), fsImpl);
      }
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
  const missingSegments = [];
  let candidate = path.resolve(targetPath);
  while (true) {
    try {
      return path.resolve(fsImpl.realpathSync(candidate), ...missingSegments.reverse());
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) {
        throw error;
      }
      missingSegments.push(path.basename(candidate));
      candidate = parent;
    }
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

function snapshotPath(targetPath, fsImpl) {
  const stat = lstatIfExists(targetPath, fsImpl);
  if (!stat) return { type: "missing" };
  if (stat.isFile()) {
    return { type: "file", bytes: fsImpl.readFileSync(targetPath), mode: stat.mode };
  }
  if (stat.isSymbolicLink()) {
    return { type: "symlink", link: fsImpl.readlinkSync(targetPath) };
  }
  if (stat.isDirectory()) {
    return {
      type: "directory",
      mode: stat.mode,
      entries: fsImpl.readdirSync(targetPath).map((name) => [name, snapshotPath(path.join(targetPath, name), fsImpl)]),
    };
  }
  throw new Error(`cannot transact unsupported filesystem entry: ${targetPath}`);
}

function removePathIfPresent(targetPath, fsImpl) {
  if (lstatIfExists(targetPath, fsImpl)) {
    fsImpl.rmSync(targetPath, { recursive: true, force: true });
  }
}

function restorePath(targetPath, snapshot, fsImpl) {
  if (snapshot.type === "missing") {
    const stat = lstatIfExists(targetPath, fsImpl);
    if (!stat) return;
    if (stat.isDirectory()) {
      try {
        fsImpl.rmdirSync(targetPath);
      } catch (error) {
        if (error.code !== "ENOTEMPTY" && error.code !== "EEXIST") throw error;
      }
    } else {
      fsImpl.rmSync(targetPath, { force: true });
    }
    return;
  }

  removePathIfPresent(targetPath, fsImpl);
  fsImpl.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (snapshot.type === "file") {
    fsImpl.writeFileSync(targetPath, snapshot.bytes);
    fsImpl.chmodSync(targetPath, snapshot.mode);
  } else if (snapshot.type === "symlink") {
    fsImpl.symlinkSync(snapshot.link, targetPath);
  } else if (snapshot.type === "directory") {
    fsImpl.mkdirSync(targetPath, { recursive: true });
    for (const [name, child] of snapshot.entries) {
      restorePath(path.join(targetPath, name), child, fsImpl);
    }
    fsImpl.chmodSync(targetPath, snapshot.mode);
  }
}

function createFilesystemTransaction(fsImpl = fs) {
  const snapshots = new Map();
  let active = true;
  const capture = (targetPath) => {
    const absolute = path.resolve(targetPath);
    if (!snapshots.has(absolute)) snapshots.set(absolute, snapshotPath(absolute, fsImpl));
  };
  const captureMissingDirectories = (targetPath) => {
    const missing = [];
    let current = path.resolve(targetPath);
    while (!lstatIfExists(current, fsImpl)) {
      missing.push(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    for (const directory of missing.reverse()) capture(directory);
  };
  const transactionalFs = new Proxy(fsImpl, {
    get(target, property) {
      if (property === "mkdirSync") {
        return (targetPath, options) => {
          captureMissingDirectories(targetPath);
          return target.mkdirSync(targetPath, options);
        };
      }
      if (property === "copyFileSync") {
        return (source, destination, ...args) => {
          capture(destination);
          return target.copyFileSync(source, destination, ...args);
        };
      }
      if (property === "writeFileSync") {
        return (targetPath, ...args) => {
          capture(targetPath);
          return target.writeFileSync(targetPath, ...args);
        };
      }
      if (property === "rmSync") {
        return (targetPath, options) => {
          capture(targetPath);
          return target.rmSync(targetPath, options);
        };
      }
      return target[property];
    },
  });
  return {
    fs: transactionalFs,
    commit() {
      active = false;
      snapshots.clear();
    },
    rollback() {
      if (!active) return [];
      const errors = [];
      for (const [targetPath, snapshot] of [...snapshots.entries()].reverse()) {
        try {
          restorePath(targetPath, snapshot, fsImpl);
        } catch (error) {
          errors.push(error);
        }
      }
      active = false;
      snapshots.clear();
      return errors;
    },
  };
}

function preflightCodexAgents(outDir, destDir, approvedRoot, fsImpl = fs) {
  const agentsDir = path.join(outDir, ".codex", "agents");
  for (const entry of fsImpl.readdirSync(agentsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".toml")) {
      assertManagedPathSafe(approvedRoot, path.join(destDir, entry.name), "Codex agent file destination", fsImpl);
    }
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
  let fileTransaction;
  let mcpMutationJournal;

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

    // Callers embedding the installer (notably concurrent integration tests)
    // may supply an owned build destination. CLI installs retain dist/codex.
    const outDir = deps.outDir || path.join(sourceDir, "dist", "codex");
    const result = runConfigureImpl({ sourceDir, target: "codex", outDir, validate: args.validate });
    if (result.validation?.stdout) stdout.write(result.validation.stdout);
    if (result.validation?.stderr) stderr.write(result.validation.stderr);
    if (result.exitCode !== 0) {
      stderr.write("\nbuild/validation failed; nothing installed\n");
      return result.exitCode;
    }

    const agentsDest = path.join(codexRoot, "agents");
    const agentDestFile = isRepoInstall
      ? path.join(path.dirname(codexRoot), "AGENTS.md")
      : path.join(codexRoot, "AGENTS.md");

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
        mcpMutationJournal = createMcpMutationJournal(codexBin, deps, stderr);
        const mcpExitCode = ensureCodexMcps(codexBin, mcpDefinitions, { ...deps, mcpMutationJournal });
        if (mcpExitCode !== 0) {
          return mcpExitCode;
        }
      }
    }

    // Perform security checks immediately before writing to avoid TOCTOU window
    assertManagedPathSafe(codexRoot, agentsDest, "Codex agents destination", fsImpl);
    assertManagedPathSafe(isRepoInstall ? path.dirname(codexRoot) : codexRoot, agentDestFile, "Codex agent file destination", fsImpl);

    const userHome = isRepoInstall ? undefined : path.resolve(homedir());
    const globalSkillsRoot = isRepoInstall ? undefined : path.join(userHome, ".agents", "skills");
    preflightCodexAgents(outDir, agentsDest, codexRoot, fsImpl);
    if (!isRepoInstall) {
      const runtimeDir = path.join(codexRoot, "ospec-workflow");
      const hooksDest = path.join(codexRoot, "hooks.json");
      const runtimeSource = path.join(outDir, "scripts");
      const schemasSource = path.join(outDir, "schemas");
      const legacyRuntimeSkills = path.join(runtimeDir, "skills");
      const orchestratorAgent = path.join(agentsDest, "sdd-orchestrator.toml");
      assertManagedPathSafe(codexRoot, runtimeDir, "Codex runtime destination", fsImpl);
      assertManagedPathSafe(codexRoot, hooksDest, "Codex hooks destination", fsImpl);
      assertManagedPathSafe(codexRoot, legacyRuntimeSkills, "Codex legacy skills destination", fsImpl);
      assertManagedPathSafe(codexRoot, orchestratorAgent, "Codex orchestrator agent destination", fsImpl);
      if (fsImpl.existsSync(runtimeSource)) {
        preflightManagedTree(runtimeSource, path.join(runtimeDir, "scripts"), codexRoot, fsImpl);
      }
      if (fsImpl.existsSync(schemasSource)) {
        preflightManagedTree(schemasSource, path.join(runtimeDir, "schemas"), codexRoot, fsImpl);
      }
      preflightManagedTree(path.join(outDir, "skills"), globalSkillsRoot, userHome, fsImpl);
    }

    const writeFs = args.dryRun ? fsImpl : (fileTransaction = createFilesystemTransaction(fsImpl)).fs;
    copyCodexAgents(outDir, agentsDest, { fs: writeFs, dryRun: args.dryRun, skillsRoot: globalSkillsRoot });

    if (!args.dryRun) {
      writeFs.copyFileSync(path.join(outDir, "AGENTS.md"), agentDestFile);
      if (!isRepoInstall) {
        const runtimeDir = path.join(codexRoot, "ospec-workflow");
        const hooksDest = path.join(codexRoot, "hooks.json");
        copyCodexRuntime(outDir, runtimeDir, { fs: writeFs });
        const legacyRuntimeSkills = path.join(runtimeDir, "skills");
        if (writeFs.existsSync(legacyRuntimeSkills)) {
          writeFs.rmSync(legacyRuntimeSkills, { recursive: true, force: true });
        }
        syncCodexSkills(outDir, globalSkillsRoot, { fs: writeFs, approvedRoot: userHome });
        writeFs.rmSync(path.join(agentsDest, "sdd-orchestrator.toml"), { force: true });
        installCodexHooks(outDir, codexRoot, runtimeDir, { fs: writeFs });
      }
      fileTransaction.commit();
      mcpMutationJournal?.commit();
    }

    if (args.dryRun) {
      stdout.write(`[dry-run] Codex agents and AGENTS.md prepared; no files were written.\n`);
      return 0;
    }

    if (isRepoInstall) {
      stdout.write(`Done. Codex AGENTS.md and custom agents synced into ${path.dirname(codexRoot)}.\n`);
      return 0;
    }

    stdout.write("Done. Codex AGENTS.md, custom agents, skills, and native hooks are ready.\n");
    return 0;
  } catch (error) {
    const rollbackErrors = fileTransaction?.rollback() || [];
    mcpMutationJournal?.rollback();
    stderr.write(`${error.message}\n`);
    if (rollbackErrors.length > 0) {
      stderr.write(`filesystem rollback was incomplete (${rollbackErrors.length} managed path(s)); user config and auth were not targeted\n`);
    }
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
  resolveBinFromPath,
  findCodexBin,
  resolveCodexInvocation,
  copyCodexAgents,
  copyCodexRuntime,
  syncCodexSkills,
  installCodexHooks,
  readCodexMcpDefinitions,
  ensureCodexMcps,
  assertManagedPathSafe,
  main,
};
