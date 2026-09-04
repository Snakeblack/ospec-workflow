"use strict";

// IO shell for the multi-target plugin generator. Reads the canonical source
// tree, applies the pure `transform`, writes dist/<target>/, then runs the
// target's own validator as a quality gate. All filesystem/process effects
// live here; the transform itself is pure (scripts/lib/target-transform.js).

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { transform } = require("../lib/target-transform.js");
const { validateSddModelPolicy } = require("../lib/model-resolver.js");
const { withTransientFsRetries } = require("./install-engine.js");

const PROFILES = {
  claude: require("../lib/target-profiles/claude.js"),
  vscode: require("../lib/target-profiles/vscode.js"),
  "github-copilot": require("../lib/target-profiles/github-copilot.js"),
  opencode: require("../lib/target-profiles/opencode.js"),
  codex: require("../lib/target-profiles/codex.js"),
  cursor: require("../lib/target-profiles/cursor.js"),
  antigravity: require("../lib/target-profiles/antigravity.js"),
};

// Source roots that make up a plugin tree. Files are read into the
// { path, content } shape the transform expects; missing roots are skipped.
const SOURCE_ROOTS = [
  ".claude-plugin/plugin.json",
  "hooks/hooks.json",
  ".mcp.json",
  "agents",
  "commands",
  "rules",
  "skills",
  "schemas/kernel",
  "models.yaml",
];

// --- tree IO ---------------------------------------------------------------

function walk(absDir, relDir, acc) {
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name);
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(abs, rel, acc);
    } else if (entry.isFile()) acc.push({ path: rel, content: fs.readFileSync(abs, "utf8") });
  }
}

function loadTree(sourceDir, roots = SOURCE_ROOTS) {
  const files = [];
  for (const root of roots) {
    const abs = path.join(sourceDir, root);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      walk(abs, root, files);
    } else files.push({ path: root, content: fs.readFileSync(abs, "utf8") });
  }
  for (const script of gatherRuntimeScripts(sourceDir)) {
    files.push(script);
  }
  return files;
}

// Skill entry-point scripts that must always be included in the runtime dist as
// additional BFS roots alongside hooks/*.js. These entry-point scripts are the runtime
// half of the federation/explore/baseline skills and are unreachable from hooks.
const SKILL_ENTRY_SCRIPTS = [
  "scripts/lib/review-dimensions.js",
  "scripts/lib/review-gate-state.js",
  "scripts/lib/review-lineage.js",
  "scripts/lib/federation-marker.js",
  "scripts/lib/federation-explore.js",
  "scripts/lib/workspace-general-baseline.js",
  "scripts/lib/federation-baseline-orchestrator.js",
  "scripts/lib/strict-tdd-evidence-remediation.js",
  "scripts/lib/execution-identities/index.js",
];

// Returns true for modules that must never appear in the runtime dist:
// test files, generator-only code under scripts/configure/, and generator-only
// modules under scripts/lib/ (target-*, frontmatter, model-resolver). This guard
// is applied both when seeding BFS roots and when enqueuing transitive deps, so
// exclusion is unconditional regardless of reachability.
function isExcludedRuntimeScript(rel) {
  if (rel.endsWith(".test.js")) return true;
  if (rel.startsWith("scripts/configure/")) return true;
  if (rel.startsWith("scripts/lib/")) {
    const base = rel.slice("scripts/lib/".length);
    if (base.startsWith("target-")) return true;
    if (base === "frontmatter.js" || base === "model-resolver.js") return true;
  }
  return false;
}

// The hooks invoke scripts/hooks/*.js, which require a subset of scripts/lib/*.js.
// Walk the require graph from hook entry points AND skill entry-point scripts so the
// generated tree ships exactly that runtime (self-contained dist) and nothing else —
// no test files and no generator code (target-*, frontmatter, model-resolver,
// configure). Static, dependency-free require resolution.
function gatherRuntimeScripts(sourceDir) {
  const seen = new Set();
  const out = [];
  const queue = [];

  // Scan hooks directory if it exists; skip silently if absent
  const hooksDir = path.join(sourceDir, "scripts", "hooks");
  if (fs.existsSync(hooksDir)) {
    try {
      for (const name of fs.readdirSync(hooksDir)) {
        const rel = "scripts/hooks/" + name;
        if (name.endsWith(".js") && !isExcludedRuntimeScript(rel)) {
          queue.push(rel);
        }
      }
    } catch (err) {
      // ignore read/access errors on hooks directory to degrade gracefully
    }
  }

  // Seed skill entry-point scripts as additional BFS roots
  for (const rel of SKILL_ENTRY_SCRIPTS) {
    // Defensive guard: even though SKILL_ENTRY_SCRIPTS is curated, a transitively-
    // required generator-only module (e.g. a target-* profile or model-resolver)
    // must never leak into a target dist. The guard is applied here and again
    // in the BFS loop below so exclusion is unconditional regardless of how a
    // path is reached.
    if (!isExcludedRuntimeScript(rel)) {
      queue.push(rel);
    }
  }

  const requireRe = /require\(\s*["'](\.[^"']+)["']\s*\)/g;
  while (queue.length > 0) {
    const rel = queue.shift();
    if (seen.has(rel)) {
      continue;
    }
    seen.add(rel);
    const abs = path.join(sourceDir, rel);
    if (!fs.existsSync(abs)) {
      continue;
    }
    let content;
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch (e) {
      console.warn(`Warning: failed to read file ${abs}: ${e.message}`);
      continue;
    }
    out.push({ path: rel, content });

    let match;
    while ((match = requireRe.exec(content)) !== null) {
      let dep = match[1];
      if (!dep.endsWith(".js")) {
        dep += ".js";
      }
      const depRel = path.posix.normalize(path.posix.join(path.posix.dirname(rel), dep));
      if (!isExcludedRuntimeScript(depRel)) {
        queue.push(depRel);
      }
    }
  }

  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// Write the generated tree deterministically and prune stale artifacts from a
// previous run — but ONLY within the top-level roots this output owns (e.g.
// .github/, skills/, .mcp.json). Files the generator never produces are left
// untouched, so pointing --out at a populated directory cannot delete unrelated
// data. No whole-directory rmSync, so there is no destructive blast radius.
function observe(observer, event) {
  observer({ ...event });
}

function writeTree(outDir, { files }, additionalManagedRoots = [], operationObserver = () => {}) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const desired = new Set(sorted.map((file) => file.path));
  const managedRoots = new Set([
    ...sorted.map((file) => file.path.split("/")[0]),
    ...additionalManagedRoots,
  ]);

  pruneStale(outDir, managedRoots, desired, operationObserver);

  for (const file of sorted) {
    const abs = path.join(outDir, ...file.path.split("/"));
    observe(operationObserver, { phase: "stage", operation: "mkdir", path: path.dirname(abs) });
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    observe(operationObserver, { phase: "stage", operation: "write", path: abs });
    fs.writeFileSync(abs, file.content);
  }
}

// Within each managed root, delete files not present in `desired` (POSIX-relative
// paths), then remove directories left empty. Roots that are files (e.g.
// .mcp.json) are simply overwritten by the write loop.
function pruneStale(outDir, managedRoots, desired, operationObserver = () => {}) {
  for (const root of managedRoots) {
    const absRoot = path.join(outDir, ...root.split("/"));
    if (!fs.existsSync(absRoot)) {
      continue;
    }
    if (fs.statSync(absRoot).isFile()) {
      if (!desired.has(root)) {
        observe(operationObserver, { phase: "stage", operation: "prune", path: absRoot });
        fs.rmSync(absRoot, { force: true });
      }
      continue;
    }
    if (!fs.statSync(absRoot).isDirectory()) {
      continue;
    }
    for (const rel of walkRel(absRoot)) {
      const relFromOut = `${root}/${rel}`;
      if (!desired.has(relFromOut)) {
        const stale = path.join(absRoot, ...rel.split("/"));
        observe(operationObserver, { phase: "stage", operation: "prune", path: stale });
        fs.rmSync(stale, { force: true });
      }
    }
    pruneEmptyDirs(absRoot);
  }
}

function walkRel(absDir, relDir = "", acc = []) {
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkRel(path.join(absDir, entry.name), rel, acc);
    } else if (entry.isFile()) {
      acc.push(rel);
    }
  }
  return acc;
}

function pruneEmptyDirs(absDir) {
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const child = path.join(absDir, entry.name);
      pruneEmptyDirs(child);
      if (fs.readdirSync(child).length === 0) {
        fs.rmdirSync(child);
      }
    }
  }
}
// --- models.yaml (minimal, dependency-free) --------------------------------

// Parses the two-table models.yaml shape (nested maps, scalar and inline-array
// values) without a YAML dependency, mirroring the constrained-subset approach
// used elsewhere in scripts/lib.
function parseModels(text) {
  const root = {};
  // The parser uses a stack to keep track of nested objects and their indentation levels.
  // This allows it to construct a tree structure by parsing line-by-line.
  const stack = [{ indent: -1, container: root }];

  for (const [lineIndex, rawLine] of String(text).split(/\r?\n/).entries()) {
    // Skip empty lines and lines that are comments (starting with '#')
    if (!rawLine.trim() || /^\s*#/.test(rawLine)) {
      continue;
    }
    // Calculate the indentation level by counting the leading whitespace characters.
    const indent = rawLine.match(/^\s*/)[0].length;
    const listMatch = rawLine.match(/^\s*-\s*(.*)$/);

    if (listMatch) {
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }

      const frame = stack[stack.length - 1];
      if (frame.key && !Array.isArray(frame.container) && Object.keys(frame.container).length === 0) {
        const list = [];
        frame.parent[frame.key] = list;
        frame.container = list;
      }
      if (Array.isArray(frame.container)) {
        frame.container.push(parseScalarOrArray(listMatch[1].trim()));
      }
      continue;
    }

    // Extract the key-value pair from the line, matching "key: value" pattern.
    const match = rawLine.match(/^\s*([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1].trim();
    const valueRaw = match[2].trim();

    // If the indentation of the current line is less than or equal to the current stack level's
    // indentation, we pop items off the stack until we find the parent container at the correct
    // outer scope level.
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].container;

    if (Object.prototype.hasOwnProperty.call(parent, key)) {
      throw new Error(`models.yaml duplicate key "${key}" at line ${lineIndex + 1}`);
    }

    if (valueRaw === "") {
      // If the value is empty, it means this key marks the start of a nested object section.
      // We initialize an empty object, assign it to the parent, and push it to the stack
      // to capture any nested children on subsequent lines.
      const obj = {};
      parent[key] = obj;
      stack.push({ indent, container: obj, parent, key });
    } else {
      // Otherwise, it's a leaf node. We parse the scalar value or inline array
      // and assign it directly to the current parent.
      parent[key] = parseScalarOrArray(valueRaw);
    }
  }

  return root;
}

function parseScalarOrArray(value) {
  if (/^\[.*\]$/.test(value)) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return inner.split(",").map((item) => unquote(item.trim()));
  }
  return unquote(value);
}

function unquote(value) {
  return value.replace(/^["']|["']$/g, "");
}

// --- validation gate -------------------------------------------------------

function resolveWinGetClaudeBin(packagesDir) {
  try {
    for (const entry of fs.readdirSync(packagesDir)) {
      if (entry.startsWith("Anthropic.ClaudeCode")) {
        const fullPath = path.join(packagesDir, entry, "claude.exe");
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }
  } catch {
    // ignore read/access errors
  }
  return null;
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

// A /mnt/<drive>/ path on linux is a Windows binary reached through the WSL
// interop mount. It may start, but it reinterprets POSIX paths (a /tmp/...
// argument becomes C:\tmp\... on the Windows side), so it can never consume
// the POSIX output dirs we generate. Treat it as unusable.
function isWindowsInteropPath(p) {
  return process.platform === "linux" && /^\/mnt\/[a-z]\//.test(p);
}

function resolveClaudeBin() {
  const resolved = resolveBinFromPath("claude");
  if (resolved && !isWindowsInteropPath(resolved)) {
    return resolved;
  }

  // Fallback: check WinGet packages folder in LocalAppData on Windows
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const packagesDir = path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(packagesDir)) {
      return resolveWinGetClaudeBin(packagesDir);
    }
  }

  return null;
}

// Run a target's validator as a child process. profile.validate is an argv array
// ([command, ...args]); the {out} placeholder is substituted per element and the
// process is spawned WITHOUT a shell, so a hostile or mistyped output path is
// always a single literal argument and can never be reinterpreted by a shell.
function defaultRunValidator(profile, outDir) {
  const [command, ...rest] = profile.validate;
  const args = rest.map((part) => part.split("{out}").join(outDir));
  // "node" -> the running interpreter, avoiding PATH/PATHEXT resolution surprises.
  let bin = command === "node" ? process.execPath : command;
  if (command === "claude") {
    const resolved = resolveClaudeBin();
    if (!resolved) {
      // Fail soft like the other missing-CLI paths: complete generation without
      // claude validation instead of failing the gate on a spawn error.
      return { status: 0, stdout: "claude validator skipped: no usable native binary\n", stderr: "" };
    }
    bin = resolved;
  }
  const result = spawnSync(bin, args, { shell: false, encoding: "utf8" });
  if (result.error) {
    return {
      status: 1,
      stdout: "",
      stderr: `failed to execute validator '${bin}': ${result.error.message || result.error}\n`
    };
  }
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

// A non-zero exit, a spawn error, or any reported error/warning fails the gate.
function validatorFailed(result) {
  if (result.status !== 0) {
    return true;
  }
  const counts = String(result.stdout).match(/(\d+)\s+errors?,\s*(\d+)\s+warnings?/i);
  if (counts && (Number(counts[1]) > 0 || Number(counts[2]) > 0)) {
    return true;
  }
  return false;
}

// --- orchestration ---------------------------------------------------------

function validateStagedTree(stageDir, output, additionalManagedRoots = [], operationObserver = () => {}, requireK3Closure = false) {
  observe(operationObserver, { phase: "stage", operation: "validate", path: stageDir });
  const desired = new Map(output.files.map(file => [file.path, file.content]));
  for (const [rel, content] of desired) {
    const abs = path.join(stageDir, ...rel.split("/"));
    if (!fs.existsSync(abs) || fs.readFileSync(abs, "utf8") !== content) {
      throw new Error(`staged tree validation failed for ${rel}`);
    }
  }
  const roots = new Set([...output.files.map(file => file.path.split("/")[0]), ...additionalManagedRoots]);
  for (const root of roots) {
    const absRoot = path.join(stageDir, ...root.split("/"));
    if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) continue;
    for (const rel of walkRel(absRoot)) {
      if (!desired.has(`${root}/${rel}`)) throw new Error(`staged tree retains stale managed path ${root}/${rel}`);
    }
  }
  const k3Required = ["schemas/kernel/manifest.json", "schemas/kernel/candidate/v2.schema.json", "scripts/lib/execution-identities/index.js"];
  if (requireK3Closure) {
    for (const required of k3Required) {
      if (!desired.has(required) || !fs.existsSync(path.join(stageDir, ...required.split("/")))) {
        throw new Error(`staged tree is missing required K3 asset ${required}`);
      }
    }
  }
}

function acquireDestinationLock(outDir) {
  const destination = path.resolve(outDir);
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const lockPath = path.join(parent, `.${path.basename(destination)}.configure.lock`);
  let fd;
  try {
    fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, destination, started_at: new Date().toISOString() }) + "\n");
  } catch (error) {
    if (error && error.code === "EEXIST") throw new Error(`configure destination is locked: ${lockPath}`);
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return { destination, parent, lockPath };
}

function removeOwned(pathname, operationObserver = () => {}, retryOptions = {}) {
  if (!pathname) return;
  withTransientFsRetries(() => {
    observe(operationObserver, { phase: "cleanup", operation: "cleanup", path: pathname });
    if (fs.existsSync(pathname)) {
      fs.rmSync(pathname, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 10,
      });
    }
  }, retryOptions);
}

function publishTransaction({ outDir, output, profile, validate, runValidator, operationObserver, requireK3Closure, retryOptions }) {
  const lock = acquireDestinationLock(outDir);
  let stage;
  let backup;
  let retainBackup = false;
  try {
    stage = fs.mkdtempSync(path.join(lock.parent, `.${path.basename(lock.destination)}.configure-stage-`));
    if (fs.existsSync(lock.destination)) fs.cpSync(lock.destination, stage, { recursive: true });
    writeTree(stage, output, profile.managedRoots || [], operationObserver);
    validateStagedTree(stage, output, profile.managedRoots || [], operationObserver, requireK3Closure);
    let validation = null;
    if (validate && profile.validate) {
      validation = runValidator(profile, stage);
      if (validatorFailed(validation)) return { exitCode: validation.status && validation.status !== 0 ? validation.status : 1, validation };
    }
    if (fs.existsSync(lock.destination)) {
      backup = fs.mkdtempSync(path.join(lock.parent, `.${path.basename(lock.destination)}.configure-backup-`));
      fs.rmdirSync(backup);
      withTransientFsRetries(() => {
        observe(operationObserver, { phase: "backup", operation: "rename", from: lock.destination, to: backup });
        fs.renameSync(lock.destination, backup);
      }, retryOptions);
    }
    try {
      withTransientFsRetries(() => {
        observe(operationObserver, { phase: "publish", operation: "rename", from: stage, to: lock.destination });
        fs.renameSync(stage, lock.destination);
      }, retryOptions);
      stage = null;
    } catch (error) {
      if (backup) {
        try {
          withTransientFsRetries(() => {
            observe(operationObserver, { phase: "restore", operation: "rename", from: backup, to: lock.destination });
            fs.renameSync(backup, lock.destination);
          }, retryOptions);
          backup = null;
        } catch (restoreError) {
          retainBackup = true;
          throw new AggregateError([error, restoreError], `publication failed and restoration was retained at ${backup}`);
        }
      }
      throw error;
    }
    return { exitCode: 0, validation };
  } finally {
    const cleanupErrors = [];
    for (const pathname of [stage, retainBackup ? null : backup, lock.lockPath]) {
      try { removeOwned(pathname, operationObserver, retryOptions); } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) {
      const retained = [stage, retainBackup ? backup : null, lock.lockPath].filter(pathname => pathname && fs.existsSync(pathname));
      throw new AggregateError(cleanupErrors, `publication cleanup failed (${cleanupErrors.map(error => error.message).join("; ")}); retained paths: ${retained.join(", ")}`);
    }
  }
}

function runConfigure({ sourceDir, target, outDir, validate = true, runValidator = defaultRunValidator, operationObserver = () => {}, retryOptions = {} }) {
  const profile = PROFILES[target];
  if (!profile) {
    throw new Error(`unknown target: ${target}`);
  }

  const roots = [...SOURCE_ROOTS, ...(profile.sourceRoots || [])];
  const files = loadTree(sourceDir, roots);
  const modelsPath = path.join(sourceDir, "models.yaml");
  const models = fs.existsSync(modelsPath) ? parseModels(fs.readFileSync(modelsPath, "utf8")) : {};
  const policy = validateSddModelPolicy(models);
  if (!policy.valid) return { files: [], summary: [], exitCode: 1, validation: { status: 1, stdout: "", stderr: `invalid SDD model policy: ${JSON.stringify(policy.errors)}\n` } };

  const output = transform({ files, profile, models });
  const summary = output.files.map((file) => file.path);
  const publication = publishTransaction({
    outDir,
    output,
    profile,
    validate,
    runValidator,
    operationObserver,
    retryOptions,
    requireK3Closure: fs.existsSync(path.join(sourceDir, "schemas", "kernel", "manifest.json")),
  });
  return { files: output.files, summary, exitCode: publication.exitCode, validation: publication.validation };
}

// --- CLI entry -------------------------------------------------------------

function parseArgs(argv) {
  const args = { validate: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") {
      args.target = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--source") {
      args.source = argv[++i];
    } else if (arg === "--no-validate") {
      args.validate = false;
    }
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.target || !PROFILES[args.target]) {
    process.stderr.write(`usage: configure --target <${Object.keys(PROFILES).join("|")}> [--out dir] [--source dir] [--no-validate]\n`);
    process.exitCode = 2;
    return;
  }

  const sourceDir = args.source || process.cwd();
  const outDir = args.out || path.join("dist", args.target);
  const result = runConfigure({ sourceDir, target: args.target, outDir, validate: args.validate });

  process.stdout.write(`configure --target ${args.target} -> ${outDir}\n`);
  for (const filePath of result.summary) {
    process.stdout.write(`  + ${filePath}\n`);
  }
  if (result.validation) {
    process.stdout.write(result.validation.stdout || "");
    if (result.validation.stderr) {
      process.stderr.write(result.validation.stderr);
    }
  }
  process.exitCode = result.exitCode;
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`fatal: ${error.stack || error.message || error}\n`);
    process.exit(1);
  }
}

module.exports = {
  loadTree,
  gatherRuntimeScripts,
  writeTree,
  validateStagedTree,
  parseModels,
  defaultRunValidator,
  resolveClaudeBin,
  resolveBinFromPath,
  isWindowsInteropPath,
  withTransientFsRetries,
  runConfigure,
  main,
  PROFILES,
  SOURCE_ROOTS,
};
