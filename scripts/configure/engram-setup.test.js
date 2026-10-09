"use strict";

// REQ-install-028/029/030 (engram-per-target, adr-20261003-001): fail-open detection,
// automatic idempotent registration on every supported target, `--no-engram`
// opt-out, the Windows safe-mode probe and the bash prefix for bare .sh hooks. Spawning, the filesystem,
// the home directory, the platform and the clock are injected; nothing here
// touches the host.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { detectEngram, planEngramActions, runEngramStep, withEngramStep, parseJsonc, TARGETS, SAFE_MODE_VAR } = require("./engram-setup.js");
const { PROFILES } = require("./cli.js");

const CLAUDE = "claude";
const HOME = path.resolve("/home/dev");
const homedir = () => HOME;

function ok(stdout = "") {
  return { status: 0, stdout, stderr: "" };
}
function fail(status = 1, stderr = "boom") {
  return { status, stdout: "", stderr };
}
function errored(code) {
  const error = new Error(code);
  error.code = code;
  return { error, status: null, stdout: "", stderr: "" };
}

// Fake spawn: `table` maps "bin arg arg" prefixes to a result or a function
// (called each time, so a re-probe after a setup can answer differently).
function makeSpawn(table) {
  const calls = [];
  const spawn = (bin, args = []) => {
    const key = `${bin} ${args.join(" ")}`.trim();
    calls.push(key);
    const hit = Object.keys(table).find((prefix) => key === prefix || key.startsWith(`${prefix} `));
    if (!hit) return errored("ENOENT");
    const value = table[hit];
    return typeof value === "function" ? value(calls) : value;
  };
  spawn.calls = calls;
  return spawn;
}

// In-memory fs keyed by path.resolve()d paths. A value of Error is thrown on read.
function makeFs(files = {}) {
  const store = new Map(Object.entries(files).map(([file, content]) => [path.resolve(file), content]));
  const writes = [];
  return {
    store,
    writes,
    readFileSync(file) {
      const key = path.resolve(file);
      if (!store.has(key)) {
        const error = new Error(`ENOENT: ${key}`);
        error.code = "ENOENT";
        throw error;
      }
      const value = store.get(key);
      if (value instanceof Error) throw value;
      return value;
    },
    existsSync(file) {
      return store.has(path.resolve(file));
    },
    mkdirSync() {},
    writeFileSync(file, content) {
      writes.push(path.resolve(file));
      store.set(path.resolve(file), String(content));
    },
  };
}

function home(...parts) {
  return path.join(HOME, ...parts);
}

function writer() {
  let text = "";
  return { write(value) { text += value; }, get value() { return text; } };
}

const MUTATING = [/plugin marketplace add/, /plugin install/, /^engram(\.exe)? setup /];
function mutations(calls) {
  return calls.filter((call) => MUTATING.some((re) => re.test(call)));
}

const ENGRAM = { "engram version": ok("engram 3.0.0\n"), "engram doctor --json": ok("{}") };
const NO_ENGRAM = { "engram version": errored("ENOENT"), "engram.exe version": errored("ENOENT") };
const CLAUDE_ABSENT = {
  "claude plugin list": ok("Installed plugins:\n\n  > ospec-workflow@ospec-tools\n"),
  "claude mcp list": ok("context7: npx @upstash/context7-mcp - Connected\n"),
};

function run(options) {
  const stdout = writer();
  const stderr = writer();
  const result = runEngramStep({ homedir, platform: "linux", env: {}, fs: makeFs(), stdout, stderr, ...options });
  return { result, stdout: stdout.value, stderr: stderr.value };
}

// --- target table -------------------------------------------------------------

test("every generator target has an Engram mapping", () => {
  assert.deepEqual(Object.keys(TARGETS).sort(), Object.keys(PROFILES).sort());
  for (const [target, spec] of Object.entries(TARGETS)) {
    assert.match(spec.script, /^setup:/, `${target} names its npm script`);
  }
  assert.equal(TARGETS["github-copilot"].agent, null, "Copilot CLI has no upstream setup");
});

// --- detection (REQ-install-028) ------------------------------------------------

test("detect: binary absent -> not found, doctor skipped, never throws", () => {
  const d = detectEngram({ spawn: makeSpawn({ ...NO_ENGRAM, ...CLAUDE_ABSENT }), hostBin: CLAUDE });
  assert.equal(d.binary.found, false);
  assert.equal(d.doctor, "skipped");
  assert.equal(d.protocol, "absent");
  assert.equal(d.mcp, "absent");
});

test("detect: binary present parses the version by regex, never by pinned value", () => {
  const spawn = makeSpawn({ ...CLAUDE_ABSENT, "engram version": ok("engram v1.14.2 (commit abc)\n"), "engram doctor --json": ok(JSON.stringify({ status: "ok" })) });
  const d = detectEngram({ spawn, hostBin: CLAUDE });
  assert.deepEqual(d.binary, { found: true, bin: "engram", version: "1.14.2" });
  assert.equal(d.doctor, "ok");
});

test("detect: doctor failure, warning and timeout are classified without throwing", () => {
  const base = { ...CLAUDE_ABSENT, "engram version": ok("engram 1.0.0") };
  assert.equal(detectEngram({ spawn: makeSpawn({ ...base, "engram doctor --json": fail(1) }), hostBin: CLAUDE }).doctor, "error");
  assert.equal(detectEngram({ spawn: makeSpawn({ ...base, "engram doctor --json": ok(JSON.stringify({ status: "warn" })) }), hostBin: CLAUDE }).doctor, "warn");
  assert.equal(detectEngram({ spawn: makeSpawn({ ...base, "engram doctor --json": ok(JSON.stringify({ status: "blocked" })) }), hostBin: CLAUDE }).doctor, "warn");
  const d = detectEngram({ spawn: makeSpawn({ ...base, "engram doctor --json": errored("ETIMEDOUT") }), hostBin: CLAUDE });
  assert.equal(d.doctor, "timeout");
  assert.equal(d.protocol, "absent");
});

test("detect: the store probe can be skipped without losing host detection", () => {
  const spawn = makeSpawn({ ...ENGRAM, ...CLAUDE_ABSENT });
  const d = detectEngram({ spawn, hostBin: CLAUDE, includeDoctor: false });
  assert.equal(d.doctor, "skipped");
  assert.equal(d.binary.found, true);
  assert.equal(d.protocol, "absent");
  assert.equal(d.mcp, "absent");
  assert.equal(spawn.calls.includes("engram doctor --json"), false);
});

test("detect claude: plugin and MCP recognised (with the plugin: prefix); lookalikes are not", () => {
  const spawn = makeSpawn({ ...ENGRAM, "claude plugin list": ok("  > engram@engram\n"), "claude mcp list": ok("plugin:engram:engram: engram mcp - Connected\n") });
  const d = detectEngram({ spawn, hostBin: CLAUDE });
  assert.equal(d.protocol, "registered");
  assert.equal(d.mcp, "registered");
  const fake = makeSpawn({ ...ENGRAM, "claude plugin list": ok("  > my-engram@other\n  > engram@fork\n"), "claude mcp list": ok("engram-fork: y - Connected\n") });
  const f = detectEngram({ spawn: fake, hostBin: CLAUDE });
  assert.equal(f.protocol, "absent");
  assert.equal(f.mcp, "absent");
});

test("detect claude: CLI missing or failing yields unknown, not absent", () => {
  assert.equal(detectEngram({ spawn: makeSpawn(ENGRAM), hostBin: null }).protocol, "unknown");
  const d = detectEngram({ spawn: makeSpawn({ ...ENGRAM, "claude plugin list": errored("ETIMEDOUT"), "claude mcp list": fail(2) }), hostBin: CLAUDE });
  assert.equal(d.protocol, "unknown");
  assert.equal(d.mcp, "unknown");
});

test("detect codex: config.toml MCP block (honoring CODEX_HOME) plus the Codex plugin", () => {
  const spawn = makeSpawn({ ...ENGRAM, "codex plugin list": ok("PLUGIN STATUS\nengram@engram installed\n") });
  const files = makeFs({ [home(".codex", "config.toml")]: "model = \"x\"\n\n[mcp_servers.engram]\ncommand = \"engram\"\n" });
  const d = detectEngram({ target: "codex", spawn, hostBin: "codex", fs: files, homedir, env: {} });
  assert.deepEqual([d.protocol, d.mcp], ["registered", "registered"]);
  const custom = path.resolve("/opt/codex");
  const elsewhere = makeFs({ [path.join(custom, "config.toml")]: "[mcp_servers.engram]\n" });
  assert.equal(detectEngram({ target: "codex", spawn, hostBin: "codex", fs: elsewhere, homedir, env: { CODEX_HOME: custom } }).mcp, "registered");
  assert.equal(detectEngram({ target: "codex", spawn, hostBin: "codex", fs: makeFs(), homedir, env: {} }).mcp, "absent");
  assert.equal(detectEngram({ target: "codex", spawn, hostBin: null, fs: files, homedir, env: {} }).protocol, "unknown");
});

test("detect codex: a launcher invocation (Windows npm shim) prefixes the listing args", () => {
  const spawn = makeSpawn({ ...ENGRAM, "node codex.js plugin list": ok("engram@engram\n") });
  const d = detectEngram({ target: "codex", spawn, hostBin: { command: "node", args: ["codex.js"] }, fs: makeFs(), homedir, env: {} });
  assert.equal(d.protocol, "registered");
  assert.ok(spawn.calls.includes("node codex.js plugin list"));
});

// #264: plugin/MCP presence cannot prove that the binary supports the plugin's
// session lifecycle. Empty input probes capability without registering a host.
test("detect codex: unsupported lifecycle is separate from installed plugin and MCP", () => {
  const spawn = makeSpawn({ ...ENGRAM, "codex plugin list": ok("engram@engram\n"), "engram hook": fail(1, "usage: engram hook codex-pre-tool-use") });
  const files = makeFs({ [home(".codex", "config.toml")]: "[mcp_servers.engram]\n" });
  const d = detectEngram({ target: "codex", spawn, hostBin: "codex", fs: files, homedir, env: {} });
  assert.deepEqual([d.protocol, d.mcp], ["registered", "registered"]);
  assert.equal(d.lifecycle, "unsupported");
});

test("detect codex: probes every lifecycle operation with empty input and a bounded timeout", () => {
  const calls = [];
  const base = makeSpawn({ ...ENGRAM, "codex plugin list": ok("engram@engram\n"), "engram hook": ok() });
  const spawn = (bin, args, options) => { calls.push({ args, options }); return base(bin, args); };
  const d = detectEngram({ target: "codex", spawn, hostBin: "codex", fs: makeFs(), homedir });
  assert.equal(d.lifecycle, "available");
  const probes = calls.filter((call) => call.args[0] === "hook");
  assert.deepEqual(probes.map((call) => call.args[1]), ["codex-register", "codex-resolve", "codex-session-end"]);
  for (const { options } of probes) {
    assert.equal(options.input, "{}");
    assert.ok(options.timeout <= 3000);
    assert.equal(options.shell, false);
  }
});

test("detect codex: lifecycle errors and timeouts remain unknown, missing binary is skipped", () => {
  for (const result of [errored("ETIMEDOUT"), errored("EACCES"), fail(2, "transport error")]) {
    const spawn = makeSpawn({ ...ENGRAM, "engram hook": result });
    assert.equal(detectEngram({ target: "codex", spawn, fs: makeFs(), homedir }).lifecycle, "unknown");
  }
  const spawn = makeSpawn(NO_ENGRAM);
  assert.equal(detectEngram({ target: "codex", spawn, fs: makeFs(), homedir }).lifecycle, "skipped");
  assert.equal(spawn.calls.some((call) => call.includes(" hook ")), false);
});

test("detect codex: accepting registration alone does not establish lifecycle compatibility", () => {
  const spawn = makeSpawn({ ...ENGRAM, "engram hook codex-register": ok(), "engram hook codex-resolve": fail(1, "usage: engram hook") });
  assert.equal(detectEngram({ target: "codex", spawn, fs: makeFs(), homedir }).lifecycle, "unsupported");
});

test("run codex: identifies the failed hook and exit status without exposing arbitrary stderr", () => {
  const spawn = makeSpawn({ ...ENGRAM, "codex plugin list": ok("engram@engram\n"),
    "engram hook codex-register": ok(), "engram hook codex-resolve": fail(2, "private transport details"), "engram hook codex-session-end": ok() });
  const files = makeFs({ [home(".codex", "config.toml")]: "[mcp_servers.engram]\n" });
  const { stdout } = run({ target: "codex", spawn, hostBin: "codex", fs: files });
  assert.match(stdout, /engram hook codex-resolve: unknown \(exit 2\)/);
  assert.doesNotMatch(stdout, /private transport details/);
});

test("detect codex: unexpected lifecycle output cannot confirm capability", () => {
  const spawn = makeSpawn({ ...ENGRAM, "engram hook": ok('{"session_id":"unexpected"}') });
  assert.equal(detectEngram({ target: "codex", spawn, fs: makeFs(), homedir }).lifecycle, "unknown");
});

test("run codex: incompatible or unknown lifecycle gives actionable guidance without setup or false success", () => {
  for (const lifecycle of [fail(1, "usage: engram hook"), errored("ETIMEDOUT")]) {
    for (const installed of [true, false]) {
      const spawn = makeSpawn({ ...ENGRAM, "codex plugin list": ok(installed ? "engram@engram\n" : ""), "engram hook": lifecycle });
      const files = makeFs(installed ? { [home(".codex", "config.toml")]: "[mcp_servers.engram]\n" } : {});
      const { stdout } = run({ target: "codex", spawn, hostBin: "codex", fs: files });
      assert.match(stdout, /codex-register.*codex-resolve.*codex-session-end/);
      assert.match(stdout, /engram setup codex/);
      assert.match(stdout, /CODEX_HOME/);
      assert.doesNotMatch(stdout, /already configured|Engram configured for/);
      assert.deepEqual(mutations(spawn.calls), []);
    }
  }
});

test("run codex: available lifecycle and installed pieces still require host startup/resume verification", () => {
  const spawn = makeSpawn({ ...ENGRAM, "codex plugin list": ok("engram@engram\n"), "engram hook": ok() });
  const files = makeFs({ [home(".codex", "config.toml")]: "[mcp_servers.engram]\n" });
  const { stdout } = run({ target: "codex", spawn, hostBin: "codex", fs: files });
  assert.match(stdout, /plugin y el MCP de Engram están presentes/);
  assert.match(stdout, /no verifica el registro de la sesión/);
  assert.match(stdout, /SessionStart.*resume/);
  assert.doesNotMatch(stdout, /already configured/);
  assert.deepEqual(mutations(spawn.calls), []);
});

test("detect antigravity: mcp_config.json server plus the marked GEMINI.md block", () => {
  const files = makeFs({
    [home(".gemini", "config", "mcp_config.json")]: JSON.stringify({ mcpServers: { engram: { command: "engram" } } }),
    [home(".gemini", "GEMINI.md")]: "# mine\n<!-- BEGIN ENGRAM MEMORY PROTOCOL — managed by engram setup -->\n...\n",
  });
  const d = detectEngram({ target: "antigravity", spawn: makeSpawn(ENGRAM), fs: files, homedir });
  assert.deepEqual([d.protocol, d.mcp], ["registered", "registered"]);
  const broken = makeFs({ [home(".gemini", "config", "mcp_config.json")]: "{not json" });
  assert.equal(detectEngram({ target: "antigravity", spawn: makeSpawn(ENGRAM), fs: broken, homedir }).mcp, "unknown");
});

test("detect opencode: JSONC config with comments plus the engram.ts plugin, honoring XDG_CONFIG_HOME", () => {
  const xdg = path.resolve("/xdg");
  const files = makeFs({
    [path.join(xdg, "opencode", "opencode.jsonc")]: "{\n  // mine\n  \"mcp\": { \"engram\": { \"type\": \"local\" }, },\n}\n",
    [path.join(xdg, "opencode", "plugins", "engram.ts")]: "export {}",
  });
  const d = detectEngram({ target: "opencode", spawn: makeSpawn(ENGRAM), fs: files, homedir, env: { XDG_CONFIG_HOME: xdg } });
  assert.deepEqual([d.protocol, d.mcp], ["registered", "registered"]);
  const plain = makeFs({ [home(".config", "opencode", "opencode.json")]: JSON.stringify({ mcp: { context7: {} } }) });
  assert.equal(detectEngram({ target: "opencode", spawn: makeSpawn(ENGRAM), fs: plain, homedir, env: {} }).mcp, "absent");
});

test("detect cursor and vscode: per-platform User dir, MCP key and protocol file", () => {
  const cursor = makeFs({
    [home(".cursor", "mcp.json")]: JSON.stringify({ mcpServers: { engram: {} } }),
    [home(".cursor", "engram-memory-protocol.md")]: "protocol",
  });
  const c = detectEngram({ target: "cursor", spawn: makeSpawn(ENGRAM), fs: cursor, homedir });
  assert.deepEqual([c.protocol, c.mcp], ["registered", "registered"]);

  const appData = path.resolve("/appdata");
  const vscode = makeFs({
    [path.join(appData, "Code", "User", "mcp.json")]: "{ \"servers\": { \"engram\": {} } }",
    [path.join(appData, "Code", "User", "prompts", "engram.instructions.md")]: "x",
  });
  const v = detectEngram({ target: "vscode", spawn: makeSpawn(ENGRAM), fs: vscode, homedir, env: { APPDATA: appData }, platform: "win32" });
  assert.deepEqual([v.protocol, v.mcp], ["registered", "registered"]);
  const mac = detectEngram({ target: "vscode", spawn: makeSpawn(ENGRAM), fs: vscode, homedir, env: {}, platform: "darwin" });
  assert.equal(mac.mcp, "absent", "darwin reads Library/Application Support, not APPDATA");
});

test("detect github-copilot: only the MCP entry matters (no upstream protocol piece)", () => {
  const files = makeFs({ [home(".copilot", "mcp-config.json")]: JSON.stringify({ mcpServers: { engram: {} } }) });
  const d = detectEngram({ target: "github-copilot", spawn: makeSpawn(ENGRAM), fs: files, homedir });
  assert.equal(d.protocol, "n/a");
  assert.equal(d.mcp, "registered");
});

test("parseJsonc keeps comment-like text inside strings", () => {
  assert.deepEqual(parseJsonc("{ \"url\": \"http://x/*y*/\", // c\n \"a\": [1,], }"), { url: "http://x/*y*/", a: [1] });
});

// --- planning (REQ-install-029/030) --------------------------------------------

const FOUND = { binary: { found: true, bin: "engram", version: "1.0.0" }, doctor: "ok" };

test("plan: disabled, binary missing, unknown state or already configured plans nothing", () => {
  const d = { ...FOUND, target: "claude", protocol: "absent", mcp: "absent" };
  assert.deepEqual(planEngramActions(d, { enabled: false }), []);
  assert.deepEqual(planEngramActions({ ...d, binary: { found: false } }), []);
  assert.deepEqual(planEngramActions({ ...d, protocol: "unknown" }), []);
  assert.deepEqual(planEngramActions({ ...d, mcp: "unknown" }), []);
  assert.deepEqual(planEngramActions({ ...d, protocol: "registered", mcp: "registered" }), []);
});

test("plan: any missing piece runs only the target's upstream setup", () => {
  const expected = { claude: "claude-code", codex: "codex", antigravity: "antigravity-cli", opencode: "opencode", cursor: "cursor", vscode: "vscode-copilot" };
  for (const [target, agent] of Object.entries(expected)) {
    for (const [protocol, mcp] of [["absent", "absent"], ["registered", "absent"], ["absent", "registered"]]) {
      const plan = planEngramActions({ ...FOUND, target, protocol, mcp });
      assert.deepEqual(plan.map((a) => [a.kind, a.bin, a.argv]), [["spawn", "engram", ["setup", agent]]], `${target} ${protocol}/${mcp}`);
    }
  }
});

test("plan: Copilot CLI falls back to an engram stdio MCP entry in ~/.copilot/mcp-config.json", () => {
  const plan = planEngramActions({ ...FOUND, target: "github-copilot", protocol: "n/a", mcp: "absent" }, { homedir });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, "mcp-json");
  assert.equal(plan[0].file, home(".copilot", "mcp-config.json"));
  assert.deepEqual(plan[0].entry, { type: "stdio", command: "engram", args: ["mcp", "--tools=agent"] });
});

// --- execution: automatic by default, --no-engram opts out ------------------------

for (const target of Object.keys(TARGETS)) {
  test(`E1.23: ${target} setup and re-check never scan the Engram store`, () => {
    let done = false;
    const files = makeFs();
    const configure = () => {
      done = true;
      const configs = {
        codex: [home(".codex", "config.toml"), "[mcp_servers.engram]\n"],
        antigravity: [home(".gemini", "config", "mcp_config.json"), '{"mcpServers":{"engram":{}}}'],
        opencode: [home(".config", "opencode", "opencode.json"), '{"mcp":{"engram":{}}}'],
        cursor: [home(".cursor", "mcp.json"), '{"mcpServers":{"engram":{}}}'],
        vscode: [home(".config", "Code", "User", "mcp.json"), '{"servers":{"engram":{}}}'],
      };
      const protocols = {
        antigravity: [home(".gemini", "GEMINI.md"), "<!-- BEGIN ENGRAM MEMORY PROTOCOL -->"],
        opencode: [home(".config", "opencode", "plugins", "engram.ts"), "plugin"],
        cursor: [home(".cursor", "engram-memory-protocol.md"), "protocol"],
        vscode: [home(".config", "Code", "User", "prompts", "engram.instructions.md"), "protocol"],
      };
      for (const entry of [configs[target], protocols[target]].filter(Boolean)) {
        files.store.set(entry[0], entry[1]);
      }
      return ok();
    };
    const host = TARGETS[target].host;
    const spawn = makeSpawn({
      ...ENGRAM,
      "engram doctor --json": errored("ETIMEDOUT"),
      "engram hook": ok(),
      ...(host ? {
        [`${host} plugin list`]: () => ok(done ? "  > engram@engram\n" : ""),
        [`${host} mcp list`]: () => ok(done ? "engram: x\n" : ""),
      } : {}),
      ...(TARGETS[target].agent ? { [`engram setup ${TARGETS[target].agent}`]: configure } : {}),
    });
    const result = run({ target, spawn, hostBin: host, fs: files });
    assert.deepEqual(spawn.calls.filter((call) => /^engram(?:\.exe)? doctor\b/.test(call)), []);
    assert.equal(spawn.calls.filter((call) => call === "engram version").length, 2, "checks before and after setup");
    assert.match(result.stdout, /Engram configurado|plugin y el MCP de Engram están presentes/);
    assert.equal(result.stderr, "");
    assert.deepEqual(mutations(spawn.calls), TARGETS[target].agent ? [`engram setup ${TARGETS[target].agent}`] : []);
  });
}

test("run: binary absent prints install guidance and mutates nothing", () => {
  const spawn = makeSpawn({ ...NO_ENGRAM, ...CLAUDE_ABSENT });
  const { result, stdout } = run({ spawn, hostBin: CLAUDE });
  assert.equal(result, undefined);
  assert.deepEqual(mutations(spawn.calls), []);
  assert.match(stdout, /No se encontró el binario engram/);
  assert.match(stdout, /npm run setup:claude/);
  assert.match(stdout, /bash, jq y curl/);
});

test("run: by default a found binary configures Claude and confirms the result", () => {
  let done = false;
  const spawn = makeSpawn({
    ...ENGRAM,
    "claude plugin list": () => ok(done ? "  > engram@engram\n" : ""),
    "claude mcp list": () => ok(done ? "engram: /abs/engram mcp --tools=agent - Connected\n" : "context7: x\n"),
    "engram setup claude-code": () => { done = true; return ok(); },
  });
  const { stdout, stderr } = run({ spawn, hostBin: CLAUDE });
  assert.deepEqual(mutations(spawn.calls), ["engram setup claude-code"]);
  assert.match(stdout, /desactívala con --no-engram/);
  assert.match(stdout, /Engram configurado para Claude Code/);
  assert.equal(stderr, "");
});

test("run: --no-engram never mutates and says how to enable it", () => {
  const spawn = makeSpawn({ ...ENGRAM, ...CLAUDE_ABSENT });
  const { stdout } = run({ spawn, hostBin: CLAUDE, argv: ["--no-engram"] });
  assert.deepEqual(mutations(spawn.calls), []);
  assert.match(stdout, /omitido por --no-engram/);
  assert.match(stdout, /engram setup claude-code/);
});

test("run: the legacy --with-engram flag is harmless (the step is already automatic)", () => {
  const spawn = makeSpawn({ ...ENGRAM, "claude plugin list": ok("  > engram@engram\n"), "claude mcp list": ok("engram: x\n") });
  const { stdout } = run({ spawn, hostBin: CLAUDE, argv: ["--with-engram"] });
  assert.match(stdout, /ya está configurado para Claude Code/);
  assert.deepEqual(mutations(spawn.calls), []);
});

test("run: a setup that leaves a piece missing warns with the manual fix", () => {
  const spawn = makeSpawn({ ...ENGRAM, ...CLAUDE_ABSENT, "engram setup claude-code": ok() });
  const { stderr } = run({ spawn, hostBin: CLAUDE });
  assert.match(stderr, /sigue incompleto para Claude Code \(falta: plugin, servidor MCP\)/);
  assert.match(stderr, /engram setup claude-code/);
});

test("run: unknown host state (CLI missing) explains and mutates nothing", () => {
  const spawn = makeSpawn(ENGRAM);
  const { stdout } = run({ spawn, hostBin: null });
  assert.match(stdout, /no se pudo leer el estado de memoria de .*; no se ha cambiado nada/);
  assert.deepEqual(mutations(spawn.calls), []);
});

test("run: failing or throwing steps never throw", () => {
  const failing = makeSpawn({ ...ENGRAM, ...CLAUDE_ABSENT, "engram setup claude-code": fail(3, "network down") });
  assert.match(run({ spawn: failing, hostBin: CLAUDE }).stderr, /`engram setup claude-code` falló \(exit 3\)/);
  const throwing = () => { throw new Error("kaboom"); };
  assert.doesNotThrow(() => run({ spawn: throwing, hostBin: CLAUDE }));
  assert.match(run({ target: "nope", spawn: makeSpawn(ENGRAM) }).stderr, /paso Engram omitido \(unknown Engram target: nope\)/);
});

test("run: file-based targets re-check their config after the upstream setup", () => {
  const files = makeFs();
  const spawn = makeSpawn({
    ...ENGRAM,
    "engram setup antigravity-cli": () => {
      files.store.set(home(".gemini", "config", "mcp_config.json"), JSON.stringify({ mcpServers: { engram: {} } }));
      files.store.set(home(".gemini", "GEMINI.md"), "<!-- BEGIN ENGRAM MEMORY PROTOCOL -->");
      return ok();
    },
  });
  const { stdout, stderr } = run({ target: "antigravity", spawn, fs: files });
  assert.deepEqual(mutations(spawn.calls), ["engram setup antigravity-cli"]);
  assert.match(stdout, /Engram configurado para Antigravity/);
  assert.equal(stderr, "");
});

test("run: Copilot CLI merges the engram entry and keeps existing servers", () => {
  const file = home(".copilot", "mcp-config.json");
  const files = makeFs({ [file]: JSON.stringify({ mcpServers: { context7: { command: "npx" } }, other: true }) });
  const { stdout, stderr } = run({ target: "github-copilot", spawn: makeSpawn(ENGRAM), fs: files });
  const doc = JSON.parse(files.store.get(path.resolve(file)));
  assert.deepEqual(Object.keys(doc.mcpServers), ["context7", "engram"]);
  assert.equal(doc.other, true);
  assert.deepEqual(doc.mcpServers.engram.args, ["mcp", "--tools=agent"]);
  assert.match(stdout, /Engram configurado para Copilot CLI/);
  assert.equal(stderr, "");
  // Idempotent: a second run changes nothing.
  const again = run({ target: "github-copilot", spawn: makeSpawn(ENGRAM), fs: files });
  assert.match(again.stdout, /ya está configurado para Copilot CLI/);
  assert.equal(files.writes.length, 1);
});

test("run: Copilot CLI never overwrites an unparseable mcp-config.json", () => {
  const file = home(".copilot", "mcp-config.json");
  const files = makeFs({ [file]: "{broken" });
  const { stdout } = run({ target: "github-copilot", spawn: makeSpawn(ENGRAM), fs: files });
  assert.match(stdout, /no se pudo leer el estado de memoria de .*; no se ha cambiado nada/);
  assert.equal(files.writes.length, 0);
});

test("run: Cursor reminds the one-time User Rules paste once configured", () => {
  const files = makeFs({ [home(".cursor", "mcp.json")]: "{\"mcpServers\":{\"engram\":{}}}", [home(".cursor", "engram-memory-protocol.md")]: "x" });
  assert.match(run({ target: "cursor", spawn: makeSpawn(ENGRAM), fs: files }).stdout, /User Rules/);
});

// --- Windows safe mode of the upstream Claude hook --------------------------------

const BASH = path.resolve("/git/bin/bash.exe");
function windowsRun({ settings, forkResult = ok(), elapsed = 200, env = {} } = {}) {
  const files = makeFs({ [BASH]: "", ...(settings === undefined ? {} : { [home(".claude", "settings.json")]: settings }) });
  const spawn = makeSpawn({
    ...ENGRAM,
    "claude plugin list": ok("  > engram@engram\n"),
    "claude mcp list": ok("engram: x\n"),
    git: ok(`${path.resolve("/git/mingw64/libexec/git-core")}\n`),
    [BASH]: forkResult,
  });
  let tick = 0;
  const now = () => (tick++ === 0 ? 1000 : 1000 + elapsed);
  const out = run({ spawn, hostBin: CLAUDE, fs: files, platform: "win32", env, now });
  const raw = files.store.get(path.resolve(home(".claude", "settings.json")));
  let parsed = raw;
  try { parsed = raw === undefined ? undefined : JSON.parse(raw); } catch { /* keep the raw text */ }
  return { ...out, spawn, settings: parsed };
}

test("windows: fast forks turn the safe mode off and keep existing settings", () => {
  const { stdout, settings } = windowsRun({ settings: JSON.stringify({ env: { FOO: "1" }, theme: "dark" }) });
  assert.equal(settings.env[SAFE_MODE_VAR], "0");
  assert.equal(settings.env.FOO, "1");
  assert.equal(settings.theme, "dark");
  assert.match(stdout, /Modo seguro de Windows desactivado \(sonda de fork 200 ms\)/);
});

test("windows: a missing settings.json is created", () => {
  assert.equal(windowsRun().settings.env[SAFE_MODE_VAR], "0");
});

test("windows: slow or failing forks keep the safe mode and write nothing", () => {
  const slow = windowsRun({ settings: "{}", elapsed: 4000 });
  assert.deepEqual(slow.settings, {});
  assert.match(slow.stdout, /modo seguro de Windows: los fork son lentos \(4000 ms\)/);
  const failing = windowsRun({ settings: "{}", forkResult: fail(127, "jq: not found") });
  assert.deepEqual(failing.settings, {});
  assert.match(failing.stdout, /falló la sonda de fork/);
});

test("windows: a value the user already set is never overwritten", () => {
  const set = windowsRun({ settings: JSON.stringify({ env: { [SAFE_MODE_VAR]: "1" } }) });
  assert.equal(set.settings.env[SAFE_MODE_VAR], "1");
  assert.match(set.stdout, /ya está definido; se deja igual/);
  assert.ok(!set.spawn.calls.some((call) => call.startsWith(BASH)), "no probe when the user decided");
  const fromEnv = windowsRun({ settings: "{}", env: { [SAFE_MODE_VAR]: "auto" } });
  assert.deepEqual(fromEnv.settings, {});
});

test("windows: an unparseable settings.json is left untouched with a warning", () => {
  const { stderr, spawn, settings } = windowsRun({ settings: "{oops" });
  assert.equal(settings, "{oops");
  assert.match(stderr, /no se puede leer .*settings\.json/);
  assert.ok(!spawn.calls.some((call) => call.startsWith(BASH)));
});

test("windows: the probe is Claude- and win32-only", () => {
  const files = makeFs({ [BASH]: "" });
  const spawn = makeSpawn({ ...ENGRAM, "claude plugin list": ok("  > engram@engram\n"), "claude mcp list": ok("engram: x\n"), git: ok("/git/mingw64/libexec/git-core\n") });
  run({ spawn, hostBin: CLAUDE, fs: files, platform: "linux" });
  assert.ok(!spawn.calls.some((call) => call.startsWith("git")));
});

// --- Windows: CreateProcess does not read shebangs, so bare .sh hooks open in the
// associated editor. Upstream already launches SessionEnd with bash. -------------------

const PLUGIN_ROOT = home(".claude", "plugins", "cache", "engram", "engram", "0.1.5");
const HOOKS_FILE = path.join(PLUGIN_ROOT, "hooks", "hooks.json");
const quotedScript = (name) => `"\${CLAUDE_PLUGIN_ROOT}/scripts/${name}"`;

function engramHooksDocument() {
  return {
    hooks: {
      SessionStart: [{
        matcher: "startup|resume|clear|compact",
        hooks: [
          { type: "command", command: quotedScript("session-start.sh"), timeout: 10 },
          { type: "command", command: quotedScript("post-compaction.sh"), timeout: 10 },
        ],
      }],
      UserPromptSubmit: [{ hooks: [{ type: "command", command: quotedScript("user-prompt-submit.sh"), timeout: 10 }] }],
      SubagentStop: [{ hooks: [{ type: "command", command: quotedScript("subagent-stop.sh"), timeout: 10, async: true }] }],
      SessionEnd: [{ hooks: [{ type: "command", command: `bash ${quotedScript("session-end.sh")}`, timeout: 5 }] }],
      PreToolUse: [{ hooks: [{ type: "command", command: "engram hook claude-pre-tool-use", timeout: 5 }] }],
      Custom: [{ hooks: [{ type: "command", command: `sh ${quotedScript("custom.sh")}` }] }],
    },
  };
}

function pluginRegistry(installPaths = [PLUGIN_ROOT]) {
  return JSON.stringify({
    version: 2,
    plugins: {
      "engram@engram": installPaths.map((installPath) => ({ scope: "user", installPath, version: "0.1.5" })),
    },
  });
}

function bashHooksRun({ hooksText, platform = "win32", argv = [], registryText = pluginRegistry(), includeHooks = true, includeRegistry = true, extraFiles = {} } = {}) {
  const files = makeFs({
    [BASH]: "",
    [home(".claude", "settings.json")]: "{}",
    ...(includeRegistry ? { [home(".claude", "plugins", "installed_plugins.json")]: registryText } : {}),
    ...(includeHooks ? { [HOOKS_FILE]: hooksText } : {}),
    ...extraFiles,
  });
  const spawn = makeSpawn({
    ...ENGRAM,
    "claude plugin list": ok("  > engram@engram\n"),
    "claude mcp list": ok("engram: x\n"),
    git: ok(`${path.resolve("/git/mingw64/libexec/git-core")}\n`),
    [BASH]: ok(),
  });
  let tick = 0;
  const now = () => (tick++ === 0 ? 1000 : 1200);
  const out = run({ spawn, hostBin: CLAUDE, fs: files, platform, env: {}, now, argv });
  const raw = files.store.get(path.resolve(HOOKS_FILE));
  return { ...out, files, spawn, raw };
}

function hookWrites(files) {
  return files.writes.filter((file) => file === path.resolve(HOOKS_FILE));
}

test("windows bash hooks: bare sh commands gain a bash launcher without a second rewrite", () => {
  const original = `${JSON.stringify(engramHooksDocument(), null, 2)}\n`;
  const first = bashHooksRun({ hooksText: original });
  const doc = JSON.parse(first.raw);
  assert.equal(doc.hooks.SessionStart[0].hooks[0].command, `bash ${quotedScript("session-start.sh")}`);
  assert.equal(doc.hooks.SessionStart[0].hooks[0].timeout, 10);
  assert.equal(doc.hooks.SessionStart[0].hooks[1].command, `bash ${quotedScript("post-compaction.sh")}`);
  assert.equal(doc.hooks.UserPromptSubmit[0].hooks[0].command, `bash ${quotedScript("user-prompt-submit.sh")}`);
  assert.equal(doc.hooks.SubagentStop[0].hooks[0].command, `bash ${quotedScript("subagent-stop.sh")}`);
  assert.equal(doc.hooks.SubagentStop[0].hooks[0].async, true);
  assert.equal(doc.hooks.SessionEnd[0].hooks[0].command, `bash ${quotedScript("session-end.sh")}`);
  assert.equal(doc.hooks.PreToolUse[0].hooks[0].command, "engram hook claude-pre-tool-use");
  assert.equal(doc.hooks.Custom[0].hooks[0].command, `sh ${quotedScript("custom.sh")}`);
  assert.ok(!first.spawn.calls.some((call) => call.startsWith("engram setup")));
  assert.equal(hookWrites(first.files).length, 1);

  const second = bashHooksRun({ hooksText: first.raw });
  assert.equal(hookWrites(second.files).length, 0);
  assert.equal(second.raw, first.raw);
});

test("windows bash hooks: an unparseable hooks.json is left untouched", () => {
  const { raw, files, stderr } = bashHooksRun({ hooksText: "{oops" });
  assert.equal(raw, "{oops");
  assert.equal(hookWrites(files).length, 0);
  assert.match(stderr, /hooks\.json/);
});

test("windows bash hooks: linux and --no-engram leave the plugin untouched", () => {
  const text = `${JSON.stringify(engramHooksDocument())}\n`;
  const linux = bashHooksRun({ hooksText: text, platform: "linux" });
  assert.equal(linux.raw, text);
  assert.equal(hookWrites(linux.files).length, 0);
  const skipped = bashHooksRun({ hooksText: text, argv: ["--no-engram"] });
  assert.equal(skipped.raw, text);
  assert.equal(hookWrites(skipped.files).length, 0);
});

test("windows bash hooks: every registered install is patched", () => {
  const otherRoot = home(".claude", "plugins", "cache", "engram", "engram", "0.1.4");
  const otherHooks = path.join(otherRoot, "hooks", "hooks.json");
  const text = `${JSON.stringify(engramHooksDocument(), null, 2)}\n`;
  const { files } = bashHooksRun({
    hooksText: text,
    registryText: pluginRegistry([PLUGIN_ROOT, otherRoot]),
    extraFiles: { [otherHooks]: text },
  });
  const other = JSON.parse(files.store.get(path.resolve(otherHooks)));
  assert.equal(other.hooks.UserPromptSubmit[0].hooks[0].command, `bash ${quotedScript("user-prompt-submit.sh")}`);
  assert.equal(files.writes.filter((file) => file === path.resolve(otherHooks)).length, 1);
});

test("windows bash hooks: a missing hooks file warns and is not created", () => {
  const { files, stderr } = bashHooksRun({ includeHooks: false });
  assert.match(stderr, /hooks\.json/);
  assert.equal(files.store.has(path.resolve(HOOKS_FILE)), false);
});

test("windows bash hooks: a missing or unreadable registry does not rewrite hooks", () => {
  const text = `${JSON.stringify(engramHooksDocument())}\n`;
  const missing = bashHooksRun({ hooksText: text, includeRegistry: false });
  assert.equal(missing.raw, text);
  assert.match(missing.stderr, /installed_plugins\.json/);
  const broken = bashHooksRun({ hooksText: text, registryText: "{oops" });
  assert.equal(broken.raw, text);
  assert.equal(hookWrites(broken.files).length, 0);
  assert.match(broken.stderr, /installed_plugins\.json/);
});

// --- installer wrapper ------------------------------------------------------------

test("withEngramStep strips the Engram flags, runs only on success and only with an injected step", () => {
  const seen = [];
  const install = (argv) => { seen.push(argv); return argv.includes("--fail") ? 1 : 0; };
  const main = withEngramStep("codex", install, { eligible: (argv) => !argv.includes("--dry-run"), hostBin: () => "codex" });
  const calls = [];
  const engramStep = (options) => calls.push(options);

  assert.equal(main(["--no-engram", "--with-engram", "x"], { engramStep, stdout: writer(), stderr: writer() }), 0);
  assert.deepEqual(seen.at(-1), ["x"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, "codex");
  assert.equal(calls[0].hostBin, "codex");
  assert.deepEqual(calls[0].argv, ["--no-engram", "--with-engram", "x"]);

  assert.equal(main(["--fail"], { engramStep }), 1);
  assert.equal(main(["--dry-run"], { engramStep }), 0);
  assert.equal(main([], {}), 0, "no injected step: nothing runs");
  assert.equal(calls.length, 1);
});

test("withEngramStep swallows a throwing step and keeps the exit code", () => {
  const stderr = writer();
  const main = withEngramStep("cursor", () => 0);
  assert.equal(main([], { engramStep() { throw new Error("kaboom"); }, stderr }), 0);
  assert.match(stderr.value, /aviso: paso Engram omitido \(kaboom\)/);
});

// --- scope: every global installer runs the shared step (REQ-install-028) --------

test("every target installer wires engram-setup and the CLI entry injects the real step", () => {
  const installers = {
    claude: "install-claude.js",
    codex: "install-codex.js",
    antigravity: "install-antigravity.js",
    opencode: "install-global-opencode.js",
    cursor: "install-cursor.js",
    vscode: "install-vscode.js",
    "github-copilot": "install-global-copilot.js",
  };
  assert.deepEqual(Object.keys(installers).sort(), Object.keys(TARGETS).sort());
  for (const [target, name] of Object.entries(installers)) {
    const source = fs.readFileSync(path.join(__dirname, name), "utf8");
    assert.match(source, /require\("\.\/engram-setup\.js"\)/, `${name} requires engram-setup`);
    assert.match(source, /engramStep: runEngramStep/, `${name} injects the real step only from its CLI entry`);
    if (target !== "claude") assert.match(source, new RegExp(`withEngramStep\\("${target}"`), `${name} wraps its main`);
  }
});
