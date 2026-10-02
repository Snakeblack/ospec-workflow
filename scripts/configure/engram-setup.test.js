"use strict";

// REQ-install-028/029/030 (add-engram-session-memory): fail-open detection,
// opt-in-only mutation and idempotent registration of the optional Engram
// plugin. All process spawning is injected; nothing here touches the host.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { detectEngram, planEngramActions, runEngramStep } = require("./engram-setup.js");

const CLAUDE = "claude";

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
// (called each time, so a re-probe after an install can answer differently).
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

function writer() {
  let text = "";
  return { write(value) { text += value; }, get value() { return text; } };
}

const MUTATING = [/plugin marketplace add/, /plugin install/, /setup claude-code/];
function mutations(calls) {
  return calls.filter((call) => MUTATING.some((re) => re.test(call)));
}

const FULL_ABSENT = {
  "engram version": errored("ENOENT"),
  "engram.exe version": errored("ENOENT"),
  "claude plugin list": ok("Installed plugins:\n\n  > ospec-workflow@ospec-tools\n"),
  "claude plugin marketplace list": ok("Configured marketplaces:\n\n  > ospec-tools\n"),
  "claude mcp list": ok("context7: npx @upstash/context7-mcp - Connected\n"),
};

// --- detection (REQ-install-028) -------------------------------------------

test("detect: binary absent -> not found, doctor skipped, never throws", () => {
  const spawn = makeSpawn(FULL_ABSENT);
  const d = detectEngram({ spawn, claudeBin: CLAUDE });
  assert.equal(d.binary.found, false);
  assert.equal(d.doctor, "skipped");
  assert.equal(d.plugin, "absent");
  assert.equal(d.mcp, "absent");
});

test("detect: binary present parses the version by regex, never by pinned value", () => {
  const spawn = makeSpawn({
    ...FULL_ABSENT,
    "engram version": ok("engram v1.14.2 (commit abc)\n"),
    "engram doctor --json": ok(JSON.stringify({ status: "ok" })),
  });
  const d = detectEngram({ spawn, claudeBin: CLAUDE });
  assert.deepEqual({ found: d.binary.found, bin: d.binary.bin, version: d.binary.version }, { found: true, bin: "engram", version: "1.14.2" });
  assert.equal(d.doctor, "ok");
});

test("detect: doctor failure and warning are classified without throwing", () => {
  const base = { ...FULL_ABSENT, "engram version": ok("engram 1.0.0") };
  assert.equal(detectEngram({ spawn: makeSpawn({ ...base, "engram doctor --json": fail(1) }), claudeBin: CLAUDE }).doctor, "error");
  assert.equal(
    detectEngram({ spawn: makeSpawn({ ...base, "engram doctor --json": ok(JSON.stringify({ status: "warn" })) }), claudeBin: CLAUDE }).doctor,
    "warn",
  );
});

test("detect: a doctor timeout is reported as timeout and the rest of the probe continues", () => {
  const spawn = makeSpawn({ ...FULL_ABSENT, "engram version": ok("engram 1.0.0"), "engram doctor --json": errored("ETIMEDOUT") });
  const d = detectEngram({ spawn, claudeBin: CLAUDE });
  assert.equal(d.doctor, "timeout");
  assert.equal(d.plugin, "absent");
});

test("detect: plugin and MCP registration are recognised, including the plugin: prefix", () => {
  const spawn = makeSpawn({
    ...FULL_ABSENT,
    "claude plugin list": ok("  > engram@engram\n    Version: 1.0.0\n"),
    "claude mcp list": ok("plugin:engram:engram: engram mcp - Connected\n"),
  });
  const d = detectEngram({ spawn, claudeBin: CLAUDE });
  assert.equal(d.plugin, "registered");
  assert.equal(d.mcp, "registered");
  const bare = detectEngram({ spawn: makeSpawn({ ...FULL_ABSENT, "claude mcp list": ok("engram: engram mcp --tools=agent - Connected\n") }), claudeBin: CLAUDE });
  assert.equal(bare.mcp, "registered");
});

test("detect: lookalike plugin or MCP names do not count as registered", () => {
  const spawn = makeSpawn({
    ...FULL_ABSENT,
    "claude plugin list": ok("  > my-engram@other\n  > engram@fork\n"),
    "claude mcp list": ok("my-engram: x - Connected\nengram-fork: y - Connected\n"),
  });
  const d = detectEngram({ spawn, claudeBin: CLAUDE });
  assert.equal(d.plugin, "absent");
  assert.equal(d.mcp, "absent");
});

test("detect: does not probe the marketplace list (setup owns the marketplace)", () => {
  const spawn = makeSpawn({ ...FULL_ABSENT, "engram version": ok("engram 1.0.0"), "engram doctor --json": ok("{}") });
  detectEngram({ spawn, claudeBin: CLAUDE });
  assert.ok(!spawn.calls.some((c) => c.includes("marketplace")));
});

test("detect: claude CLI missing or failing yields unknown, not absent", () => {
  assert.equal(detectEngram({ spawn: makeSpawn(FULL_ABSENT), claudeBin: null }).plugin, "unknown");
  const spawn = makeSpawn({ ...FULL_ABSENT, "claude plugin list": errored("ETIMEDOUT"), "claude mcp list": fail(2) });
  const d = detectEngram({ spawn, claudeBin: CLAUDE });
  assert.equal(d.plugin, "unknown");
  assert.equal(d.mcp, "unknown");
});

// --- planning (REQ-install-029/030) ----------------------------------------

const FOUND = { binary: { found: true, bin: "engram", version: "1.0.0" }, doctor: "ok" };

test("plan: no opt-in never plans a mutation", () => {
  assert.deepEqual(planEngramActions({ ...FOUND, plugin: "absent", mcp: "absent" }, { optIn: false, claudeBin: CLAUDE }), []);
});

test("plan: opt-in without the claude CLI or without the binary plans nothing", () => {
  const d = { ...FOUND, plugin: "absent", mcp: "absent" };
  assert.deepEqual(planEngramActions(d, { optIn: true, claudeBin: null }), []);
  assert.deepEqual(planEngramActions({ ...d, binary: { found: false } }, { optIn: true, claudeBin: CLAUDE }), []);
});

test("plan: any unknown detection plans nothing (fail-open)", () => {
  assert.deepEqual(planEngramActions({ ...FOUND, plugin: "unknown", mcp: "absent" }, { optIn: true, claudeBin: CLAUDE }), []);
  assert.deepEqual(planEngramActions({ ...FOUND, plugin: "absent", mcp: "unknown" }, { optIn: true, claudeBin: CLAUDE }), []);
});

test("plan: opt-in with anything missing runs only the canonical upstream setup", () => {
  // `engram setup claude-code` is idempotent upstream: it adds the marketplace,
  // installs the plugin (hooks) and registers the user-scope MCP server (mem_* tools).
  for (const [plugin, mcp] of [["absent", "absent"], ["registered", "absent"], ["absent", "registered"]]) {
    const plan = planEngramActions({ ...FOUND, plugin, mcp }, { optIn: true, claudeBin: CLAUDE });
    assert.deepEqual(plan.map((a) => a.id), ["setup-claude-code"], `plugin=${plugin} mcp=${mcp}`);
    assert.equal(plan[0].bin, "engram");
    assert.deepEqual(plan[0].argv, ["setup", "claude-code"]);
  }
});

test("plan: a registered plugin without the MCP server is NOT configured (the plugin ships no MCP)", () => {
  const plan = planEngramActions({ ...FOUND, plugin: "registered", mcp: "absent" }, { optIn: true, claudeBin: CLAUDE });
  assert.notDeepEqual(plan, []);
});

test("plan: plugin and MCP both registered plans nothing (idempotent)", () => {
  assert.deepEqual(planEngramActions({ ...FOUND, plugin: "registered", mcp: "registered" }, { optIn: true, claudeBin: CLAUDE }), []);
});

// --- execution (never throws, never mutates without opt-in) -----------------

test("run: without --with-engram it prints guidance and spawns nothing mutating", () => {
  const spawn = makeSpawn(FULL_ABSENT);
  const stdout = writer();
  const stderr = writer();
  assert.equal(runEngramStep({ argv: [], claudeBin: CLAUDE, spawn, stdout, stderr }), undefined);
  assert.deepEqual(mutations(spawn.calls), []);
  assert.match(stdout.value, /Engram/);
  assert.match(stdout.value, /--with-engram/);
});

test("run: guidance for a found binary with an unregistered plugin carries the bash/jq/curl notice (REQ-install-029)", () => {
  const spawn = makeSpawn({ ...FULL_ABSENT, "engram version": ok("engram 1.0.0"), "engram doctor --json": ok("{}") });
  const stdout = writer();
  runEngramStep({ argv: [], claudeBin: CLAUDE, spawn, stdout, stderr: writer() });
  assert.match(stdout.value, /not registered/);
  assert.match(stdout.value, /bash/);
  assert.match(stdout.value, /jq/);
  assert.match(stdout.value, /curl/);
  assert.deepEqual(mutations(spawn.calls), []);
});

test("run: an engram doctor failure or timeout is warned through runEngramStep without mutating or throwing", () => {
  for (const doctor of [fail(1, "doctor broke"), errored("ETIMEDOUT")]) {
    const spawn = makeSpawn({ ...FULL_ABSENT, "engram version": ok("engram 1.0.0"), "engram doctor --json": doctor });
    const stdout = writer();
    const stderr = writer();
    assert.equal(runEngramStep({ argv: [], claudeBin: CLAUDE, spawn, stdout, stderr }), undefined);
    assert.match(stderr.value, /warning: engram doctor reported "(error|timeout)"/);
    assert.deepEqual(mutations(spawn.calls), []);
  }
});

test("run: with opt-in and the plugin registered but no MCP, runs setup and confirms the MCP", () => {
  let setupDone = false;
  const spawn = makeSpawn({
    ...FULL_ABSENT,
    "engram version": ok("engram 1.0.0"),
    "engram doctor --json": ok("{}"),
    "claude plugin list": ok("  > engram@engram\n"),
    "claude mcp list": () => ok(setupDone ? "engram: /abs/engram mcp --tools=agent - Connected\n" : "context7: x - Connected\n"),
    "engram setup claude-code": () => { setupDone = true; return ok(); },
  });
  const stdout = writer();
  const stderr = writer();
  runEngramStep({ argv: ["--with-engram"], claudeBin: CLAUDE, spawn, stdout, stderr });
  assert.deepEqual(mutations(spawn.calls), ["engram setup claude-code"]);
  assert.match(stdout.value, /MCP server registered/);
  assert.doesNotMatch(stderr.value, /warning/);
});

test("run: with opt-in, a setup that leaves no MCP server visible warns with the manual fix", () => {
  const spawn = makeSpawn({
    ...FULL_ABSENT,
    "engram version": ok("engram 1.0.0"),
    "engram doctor --json": ok("{}"),
    "engram setup claude-code": ok(),
  });
  const stderr = writer();
  runEngramStep({ argv: ["--with-engram"], claudeBin: CLAUDE, spawn, stdout: writer(), stderr });
  assert.match(stderr.value, /warning: .*MCP server .*not visible/);
  assert.match(stderr.value, /engram setup claude-code/);
});

test("run: guidance for a registered plugin without MCP says mem_* tools are missing and mutates nothing", () => {
  const spawn = makeSpawn({
    ...FULL_ABSENT,
    "engram version": ok("engram 1.0.0"),
    "engram doctor --json": ok("{}"),
    "claude plugin list": ok("  > engram@engram\n"),
  });
  const stdout = writer();
  runEngramStep({ argv: [], claudeBin: CLAUDE, spawn, stdout, stderr: writer() });
  assert.match(stdout.value, /MCP server is not registered/);
  assert.match(stdout.value, /--with-engram/);
  assert.doesNotMatch(stdout.value, /already configured/);
  assert.deepEqual(mutations(spawn.calls), []);
});

test("run: with opt-in and everything registered reports already configured and mutates nothing", () => {
  const spawn = makeSpawn({
    ...FULL_ABSENT,
    "engram version": ok("engram 1.0.0"),
    "engram doctor --json": ok("{}"),
    "claude plugin list": ok("  > engram@engram\n"),
    "claude mcp list": ok("plugin:engram:engram: x - Connected\n"),
  });
  const stdout = writer();
  runEngramStep({ argv: ["--with-engram"], claudeBin: CLAUDE, spawn, stdout, stderr: writer() });
  assert.deepEqual(mutations(spawn.calls), []);
  assert.match(stdout.value, /already configured/i);
});

test("run: a failing or timing-out step becomes a warning and never throws", () => {
  const spawn = makeSpawn({
    ...FULL_ABSENT,
    "engram version": ok("engram 1.0.0"),
    "engram doctor --json": ok("{}"),
    "claude plugin marketplace add": errored("ETIMEDOUT"),
    "claude plugin install": fail(1, "network down"),
    "engram setup claude-code": errored("ENOENT"),
  });
  const stderr = writer();
  assert.doesNotThrow(() => runEngramStep({ argv: ["--with-engram"], claudeBin: CLAUDE, spawn, stdout: writer(), stderr }));
  assert.match(stderr.value, /warning/i);
});

test("run: a throwing spawn is swallowed", () => {
  const spawn = () => { throw new Error("kaboom"); };
  const stderr = writer();
  assert.doesNotThrow(() => runEngramStep({ argv: ["--with-engram"], claudeBin: CLAUDE, spawn, stdout: writer(), stderr }));
});

// --- scope: only the Claude installer knows about Engram (REQ-install-028) --

test("only install-claude.js references engram-setup among the installers", () => {
  const dir = __dirname;
  const installers = fs.readdirSync(dir).filter((name) => /^install-.*\.js$/.test(name) && !name.endsWith(".test.js"));
  assert.ok(installers.includes("install-claude.js"));
  for (const name of installers) {
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    if (name === "install-claude.js") {
      assert.match(text, /engram-setup/);
    } else {
      assert.doesNotMatch(text, /engram/i, `${name} must not reference Engram`);
    }
  }
});
