"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  main,
  parseArgs,
  renderHooksValue,
  getHooksRootPosix,
  getDestinationRoots,
} = require("./install-antigravity.js");

test("parseArgs handles arguments cleanly", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), {
    dryRun: true,
    validate: true,
    source: undefined,
    dest: undefined,
  });
  assert.deepEqual(parseArgs(["--dest", "/custom/dest"]), {
    dryRun: false,
    validate: true,
    source: undefined,
    dest: "/custom/dest",
  });
});

// The agy bench installs from the checkout: --out builds the target outside
// the source's dist/, which other test files digest while they run (PR #519).
test("--out builds the target in that directory and leaves the source's dist untouched", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-install-out-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, "source");
  fs.mkdirSync(sourceDir);
  assert.equal(parseArgs(["--out", "build"]).out, "build");
  assert.match(parseArgs(["--out"]).error, /missing value for --out/);
  const built = [];
  const exitCode = main(["--dry-run", "--source", sourceDir, "--out", path.join(root, "build")], {
    runConfigure: ({ outDir }) => {
      built.push(outDir);
      return { exitCode: 0, validation: { errors: [] } };
    },
    stdout: { write() {} },
    stderr: { write() {} },
  });
  assert.equal(exitCode, 0);
  assert.deepEqual(built, [path.join(root, "build")]);
});

test("getHooksRootPosix translates paths properly", () => {
  assert.equal(
    getHooksRootPosix("/home/user/.gemini/config"),
    "/home/user/.gemini/config",
  );
  assert.equal(
    getHooksRootPosix("/mnt/c/Users/sn4ke/.gemini/config"),
    "C:/Users/sn4ke/.gemini/config",
  );
  assert.equal(
    getHooksRootPosix("/mnt/d/custom/path"),
    "D:/custom/path",
  );
});

test("getDestinationRoots returns explicit dest when provided", () => {
  const roots = getDestinationRoots("/custom/target", {
    fs: { existsSync: () => false },
  });
  assert.deepEqual(roots, [path.resolve("/custom/target")]);
});

test("getDestinationRoots discovers both WSL and Windows in WSL environment", () => {
  const fakeFs = {
    existsSync(p) {
      if (p === "/proc/version") return true;
      if (p === "/mnt/c/Users") return true;
      if (p === "/mnt/c/Users/sn4ke/.gemini/config") return true;
      return false;
    },
    readFileSync(p) {
      if (p === "/proc/version") return "Linux version 5.15.167.4-microsoft-standard-WSL2";
      return "";
    },
    readdirSync(p) {
      if (p === "/mnt/c/Users") return ["sn4ke", "Public", "Default"];
      return [];
    },
  };

  const roots = getDestinationRoots(undefined, {
    fs: fakeFs,
    homedir: () => "/home/sn4ke",
    platform: "linux",
    env: { WSL_DISTRO_NAME: "Ubuntu", USER: "sn4ke" },
  });

  assert.deepEqual(roots, [
    path.posix.resolve("/home/sn4ke/.gemini/config"),
    path.posix.resolve("/mnt/c/Users/sn4ke/.gemini/config"),
  ]);
});

test("renderHooksValue expands placeholder", () => {
  const rendered = renderHooksValue(
    "node __OSPEC_ANTIGRAVITY_ROOT__/scripts/hooks/ospec-hooks-launch.js session-start",
    "/home/user/.gemini/config",
  );
  assert.equal(
    rendered,
    "node /home/user/.gemini/config/scripts/hooks/ospec-hooks-launch.js session-start",
  );
});

test("pruneStaleFiles exhaustion diagnosis specifies target: antigravity", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-prune-exhaust-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const sourceDir = path.join(root, "source");
  const destDir = path.join(root, "dest");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(destDir, { recursive: true });

  fs.writeFileSync(path.join(sourceDir, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
  fs.writeFileSync(path.join(sourceDir, "hooks.json"), JSON.stringify({ hooks: {} }));
  fs.writeFileSync(path.join(destDir, "stale-file.txt"), "stale");
  fs.writeFileSync(
    path.join(destDir, ".ospec-workflow-install.json"),
    JSON.stringify({ target: "antigravity", files: ["stale-file.txt"] }),
  );

  const stderr = [];
  const delays = [];
  const fsImpl = new Proxy(fs, {
    get(target, property) {
      if (property === "rmSync") {
        return (p, ...args) => {
          if (typeof p === "string" && p.includes("stale-file.txt")) {
            const err = new Error("locked stale file");
            err.code = "EPERM";
            throw err;
          }
          return target[property](p, ...args);
        };
      }
      return target[property];
    },
  });

  const exitCode = main(["--dest", destDir], {
    sourceDir,
    fs: fsImpl,
    outDir: sourceDir,
    runConfigure: () => ({ exitCode: 0, validation: { errors: [] } }),
    validateInstalled: () => ({ errors: [] }),
    copyBinaryToTree: () => {},
    syncTargetTree: () => ({ updated: [], unchanged: [], ownedFiles: [] }),
    installHooksJson: () => {},
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    retryOptions: { maxRetries: 2, sleep: (d) => delays.push(d) },
  });

  assert.equal(exitCode, 1);
  const errOutput = stderr.join("");
  assert.match(errOutput, /antigravity:/i);
  assert.match(errOutput, /no se pudo borrar/i);
  assert.match(errOutput, /tras 3 intentos/i);
  assert.match(errOutput, /Cierra Antigravity \(o el proceso que use esa ruta\)/);
});

// --- uvx prerequisite warning (foundation document conversion) -------------

function uvxBox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-uvx-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, "source");
  const destDir = path.join(root, "dest");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "package.json"), JSON.stringify({ name: "ospec-workflow", version: "1.0.0" }));
  fs.writeFileSync(path.join(sourceDir, "hooks.json"), JSON.stringify({ hooks: {} }));
  fs.writeFileSync(
    path.join(sourceDir, ".mcp.json"),
    JSON.stringify({ mcpServers: { markitdown: { command: "uvx", args: ["markitdown-mcp@0.0.1a7"] } } }),
  );
  return { sourceDir, destDir };
}

function installBox(sourceDir, destDir, overrides = {}) {
  return main(["--dest", destDir], {
    sourceDir,
    outDir: sourceDir,
    runConfigure: () => ({ exitCode: 0, validation: { errors: [] } }),
    validateInstalled: () => ({ errors: [] }),
    copyBinaryToTree: () => {},
    syncTargetTree: () => ({ updated: [], unchanged: [], ownedFiles: [] }),
    installHooksJson: () => {},
    stdout: { write() {} },
    ...overrides,
  });
}

test("main warns when the source ships a uvx MCP server and the binary is missing", (t) => {
  const { sourceDir, destDir } = uvxBox(t);
  const stderr = [];
  const exitCode = installBox(sourceDir, destDir, {
    spawnSync: () => ({ error: new Error("ENOENT") }),
    stderr: { write: (chunk) => stderr.push(chunk) },
  });
  assert.equal(exitCode, 0);
  assert.match(stderr.join(""), /uvx/);
  assert.match(stderr.join(""), /docs\.astral\.sh\/uv/);
});

test("main stays silent when uvx answers", (t) => {
  const { sourceDir, destDir } = uvxBox(t);
  const stderr = [];
  const probes = [];
  const exitCode = installBox(sourceDir, destDir, {
    spawnSync(command, args) {
      probes.push([command, ...args]);
      return { status: 0 };
    },
    stderr: { write: (chunk) => stderr.push(chunk) },
  });
  assert.equal(exitCode, 0);
  assert.deepEqual(probes, [["uvx", "--version"]]);
  assert.doesNotMatch(stderr.join(""), /uvx/);
});

test("main forwards validated --model tier aliases, prints Modelos, and rejects concrete model IDs", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-install-models-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const seen = [], out = [], err = [];
  const io = (buf) => ({ write: (c) => buf.push(String(c)) });
  const base = { homedir: () => root, stdout: io(out), stderr: io(err) };
  const ok = main(["--dry-run", "--dest", path.join(root, "d"), "--model", "cheap=FLASH_LITE"], {
    ...base,
    runConfigure: (o) => { seen.push(o.userModels); return { exitCode: 0, validation: { errors: [] } }; },
  });
  assert.equal(ok, 0, err.join(""));
  assert.deepEqual(seen, [{ cheap: "flash_lite" }]);
  assert.match(out.join(""), /Modelos\s+premium alias por defecto · default alias por defecto · cheap flash_lite/);
  let called = false;
  assert.equal(main(["--dry-run", "--dest", path.join(root, "d"), "--model", "premium=gemini-4-neon-high"], { ...base, runConfigure: () => { called = true; return { exitCode: 0 }; } }), 2);
  assert.equal(called, false);
  assert.match(err.join(""), /pro, inherit, flash, flash_lite/);
});

function makeValidBuild(outDir, { withSdd = false } = {}) {
  const put = (rel, c) => { const f = path.join(outDir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };
  const cmd = (ev) => `node "./scripts/hooks/ospec-antigravity-hook.js" ${ev}`;
  put(".antigravity-plugin/plugin.json", JSON.stringify({ name: "ospec-workflow", version: "2.186.0", description: "OSpec", logo: "assets/logo.svg" }));
  put("assets/logo.svg", "<svg/>\n");
  put("agents/review-trust.agent.md", "---\nname: review-trust\ndescription: Trust.\ntools: ['read_file']\nmainAgent: false\nsubagent: true\ninheritMcp: false\ncommandExecutionPolicy: off\n---\nbody\n");
  if (withSdd) put("agents/sdd-orchestrator.agent.md", "---\nname: sdd-orchestrator\ndescription: Orch.\ntools: ['read_file']\n---\n__OSPEC_SHARED_DIR__/sdd.md\n");
  put("rules/ospec-router.instructions.md", "---\ntrigger: always_on\n---\nrouter\n");
  put("skills/idd/SKILL.md", "---\nname: idd\ndescription: IDD.\n---\nRun `__OSPEC_RUNTIME_DIR__/bin/ospec`.\n");
  put("scripts/hooks/ospec-hooks-launch.js", "// launch\n");
  put("scripts/hooks/ospec-antigravity-hook.js", "// agy\n");
  put("hooks.json", JSON.stringify({
    "ospec-session-start": { enabled: true, SessionStart: [{ type: "command", command: cmd("session-start") }] },
    "ospec-pre-tool-use": { enabled: true, PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: cmd("pre-tool-use") }] }] },
    "ospec-stop": { enabled: true, Stop: [{ type: "command", command: cmd("stop") }] },
  }));
}

test("global setup installs native plugin, migrates legacy owned files/hooks atomically, and preserves SDD and user files", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-plugin-migrate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, "source"), home = path.join(root, "home");
  const cfg = path.join(home, ".gemini", "config"), pluginDir = path.join(cfg, "plugins", "ospec-workflow");
  const put = (f, c) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };
  put(path.join(sourceDir, "package.json"), JSON.stringify({ name: "ospec-workflow", version: "2.186.0" }));
  put(path.join(cfg, "agents", "sdd-apply.agent.md"), "legacy sdd\n");
  put(path.join(cfg, "agents", "my-custom.agent.md"), "user agent\n");
  put(path.join(cfg, "rules", "ospec-router.instructions.md"), "legacy router\n");
  put(path.join(cfg, "mcp_config.json"), '{"mcpServers":{"engram":{}}}\n');
  put(path.join(cfg, "hooks.json"), JSON.stringify({ "ospec-stop": { Stop: [] }, "user-hook": { PreToolUse: [] } }));
  put(path.join(cfg, ".ospec-workflow-install.json"), JSON.stringify({ version: "2.185.0", target: "antigravity", files: ["agents/sdd-apply.agent.md", "rules/ospec-router.instructions.md", "hooks.json", ".ospec-workflow-install.json"] }));
  const seenSdd = [];
  const runConfigure = ({ outDir, withSdd }) => { seenSdd.push(withSdd); makeValidBuild(outDir, { withSdd }); return { exitCode: 0, validation: { errors: [] } }; };
  const baseDeps = { env: {}, runConfigure, copyBinaryToTree: () => {}, stdout: { write() {} }, stderr: { write() {} } };
  assert.equal(main(["--source", sourceDir, "--no-engram"], { ...baseDeps, homedir: () => home }), 0);
  assert.deepEqual(seenSdd, [true]);
  assert.ok(fs.existsSync(path.join(pluginDir, ".antigravity-plugin", "plugin.json")) && fs.existsSync(path.join(pluginDir, "hooks.json")));
  assert.equal(fs.existsSync(path.join(cfg, ".ospec-workflow-install.json")), false);
  assert.equal(fs.existsSync(path.join(cfg, "agents", "sdd-apply.agent.md")), false);
  assert.equal(fs.existsSync(path.join(cfg, "rules")), false);
  assert.equal(fs.readFileSync(path.join(cfg, "agents", "my-custom.agent.md"), "utf8"), "user agent\n");
  assert.ok(fs.existsSync(path.join(cfg, "mcp_config.json")));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cfg, "hooks.json"), "utf8")), { "user-hook": { PreToolUse: [] } });
  // Owned hooks.json with only ospec-* groups is removed cleanly; corrupt legacy hooks.json rolls back atomically.
  const onlyHome = path.join(root, "only-home"), onlyCfg = path.join(onlyHome, ".gemini", "config");
  put(path.join(onlyCfg, "hooks.json"), JSON.stringify({ "ospec-stop": { Stop: [] } }));
  put(path.join(onlyCfg, ".ospec-workflow-install.json"), JSON.stringify({ target: "antigravity", files: ["hooks.json"] }));
  assert.equal(main(["--source", sourceDir, "--no-engram"], { ...baseDeps, homedir: () => onlyHome }), 0);
  assert.equal(fs.existsSync(path.join(onlyCfg, "hooks.json")), false);
  const badHome = path.join(root, "bad-home"), badCfg = path.join(badHome, ".gemini", "config");
  put(path.join(badCfg, "hooks.json"), "{broken");
  put(path.join(badCfg, ".ospec-workflow-install.json"), JSON.stringify({ target: "antigravity", files: ["hooks.json"] }));
  assert.equal(main(["--source", sourceDir, "--no-engram"], { ...baseDeps, homedir: () => badHome }), 1);
  assert.equal(fs.readFileSync(path.join(badCfg, "hooks.json"), "utf8"), "{broken");
  assert.equal(fs.existsSync(path.join(badCfg, "plugins")), false);
});

test("--workspace installs into <repo>/.agents/plugins/ospec-workflow with relative paths, skips Engram, and conflicts with --dest", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-workspace-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, "source"), repoDir = path.join(root, "repo"), home = path.join(root, "home");
  fs.mkdirSync(sourceDir, { recursive: true }); fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "package.json"), JSON.stringify({ name: "ospec-workflow", version: "2.186.0" }));
  assert.match(parseArgs(["--dest", "/a", "--workspace", "/b"]).error, /cannot be combined/);
  let engramRan = false;
  const code = main(["--source", sourceDir, "--workspace", repoDir, "--with-sdd"], {
    homedir: () => home, env: {}, copyBinaryToTree: () => {},
    runConfigure: ({ outDir, withSdd }) => { makeValidBuild(outDir, { withSdd }); return { exitCode: 0, validation: { errors: [] } }; },
    engramStep: () => { engramRan = true; }, stdout: { write() {} }, stderr: { write() {} },
  });
  assert.equal(code, 0);
  assert.equal(engramRan, false);
  assert.equal(fs.existsSync(path.join(home, ".gemini")), false);
  const pluginDir = path.join(repoDir, ".agents", "plugins", "ospec-workflow");
  assert.match(fs.readFileSync(path.join(pluginDir, "skills", "idd", "SKILL.md"), "utf8"), /\.agents\/plugins\/ospec-workflow\/bin\/ospec/);
  assert.match(fs.readFileSync(path.join(pluginDir, "agents", "sdd-orchestrator.agent.md"), "utf8"), /\.agents\/plugins\/ospec-workflow\/skills\/_shared\/sdd\.md/);
});

