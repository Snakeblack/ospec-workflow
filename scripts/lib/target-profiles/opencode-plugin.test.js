"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { PLUGIN_SOURCE } = require("./opencode-plugin.js");

function extractResolveBinary() {
  const match = PLUGIN_SOURCE.match(/export function resolveBinary\(([^)]*)\) \{([\s\S]*?)\n\}/);
  assert.ok(match, "plugin must export resolveBinary for layout tests");
  return new Function("resolve", "join", "existsSync", `return function resolveBinary(${match[1]}) {${match[2]}\n};`)(
    path.win32.resolve,
    path.win32.join,
    () => false,
  );
}

function extractResolvePluginRoot() {
  const match = PLUGIN_SOURCE.match(/export function resolvePluginRoot\(([^)]*)\) \{([\s\S]*?)\n\}/);
  assert.ok(match, "plugin must export resolvePluginRoot for layout tests");
  return new Function("resolve", "join", "existsSync", `return function resolvePluginRoot(${match[1]}) {${match[2]}\n};`)(
    path.win32.resolve,
    path.win32.join,
    () => false,
  );
}

test("resolveBinary prefers the global OpenCode release directory", () => {
  const resolveBinary = extractResolveBinary();
  const pluginDir = "C:\\Users\\ManuelRetamozoGarcía\\.config\\opencode\\plugins";
  const globalBinary = "C:\\Users\\ManuelRetamozoGarcía\\.config\\opencode\\release\\dist\\ospec-hooks.exe";
  const localBinary = "C:\\Users\\ManuelRetamozoGarcía\\.config\\release\\dist\\ospec-hooks.exe";

  assert.equal(
    resolveBinary({ here: pluginDir, extension: ".exe", exists: (candidate) => candidate === globalBinary || candidate === localBinary }),
    globalBinary,
  );
});

test("resolveBinary falls back to the project-local release directory", () => {
  const resolveBinary = extractResolveBinary();
  const pluginDir = "C:\\repos\\proyecto\\.opencode\\plugins";
  const localBinary = "C:\\repos\\proyecto\\release\\dist\\ospec-hooks.exe";

  assert.equal(
    resolveBinary({ here: pluginDir, extension: ".exe", exists: (candidate) => candidate === localBinary }),
    localBinary,
  );
});

test("resolveBinary uses PATH only when neither managed layout contains a binary", () => {
  const resolveBinary = extractResolveBinary();

  assert.equal(
    resolveBinary({ here: "C:\\repos\\proyecto\\.opencode\\plugins", extension: ".exe", exists: () => false }),
    "ospec-hooks.exe",
  );
});

test("resolvePluginRoot prefers the global bundle root that carries skills/", () => {
  const resolvePluginRoot = extractResolvePluginRoot();
  const pluginDir = "C:\\Users\\ManuelRetamozoGarcía\\.config\\opencode\\plugins";
  const globalSkills = "C:\\Users\\ManuelRetamozoGarcía\\.config\\opencode\\skills";

  assert.equal(
    resolvePluginRoot({ here: pluginDir, exists: (candidate) => candidate === globalSkills }),
    "C:\\Users\\ManuelRetamozoGarcía\\.config\\opencode",
  );
});

test("resolvePluginRoot falls back to the project root for project plugins", () => {
  const resolvePluginRoot = extractResolvePluginRoot();
  const pluginDir = "C:\\repos\\proyecto\\.opencode\\plugins";
  const projectSkills = "C:\\repos\\proyecto\\skills";

  assert.equal(
    resolvePluginRoot({ here: pluginDir, exists: (candidate) => candidate === projectSkills }),
    "C:\\repos\\proyecto",
  );
});

test("resolvePluginRoot reports the global root when no bundle carries skills/", () => {
  const resolvePluginRoot = extractResolvePluginRoot();

  assert.equal(
    resolvePluginRoot({ here: "C:\\repos\\proyecto\\.opencode\\plugins", exists: () => false }),
    "C:\\repos\\proyecto\\.opencode",
  );
});

test("plugin source default-exports the dual v1/v2 definition OpenCode v2 loads", () => {
  // OpenCode v2 rejects a module without a default plugin definition
  // (PluginModule.LoadError: id plus setup or effect). The server entry keeps
  // the v1 object entrypoint working on OpenCode >= 1.18.29.
  assert.match(PLUGIN_SOURCE, /export default \{/);
  assert.match(PLUGIN_SOURCE, /id: "ospec"/);
  assert.match(PLUGIN_SOURCE, /server: OspecWorkflowPlugin/);
  assert.match(PLUGIN_SOURCE, /setup: setupOspecWorkflow/);
  // The v2 setup registers the same bridge: tool hook plus session.created subscription.
  assert.match(PLUGIN_SOURCE, /ctx\.tool\.hook\("execute\.before"/);
  assert.match(PLUGIN_SOURCE, /ctx\.event\.subscribe\(/);
  assert.match(PLUGIN_SOURCE, /ctx\.location\.directory/);
});

test("the plugin hands the binary the bundle root and the workspace cwd", () => {
  // A global plugin host runs with the opencode server's cwd: session-start
  // needs plugin_root to find skills/, and both hooks need cwd pinned to the
  // session workspace for relative paths and the git collaboration guard.
  assert.match(PLUGIN_SOURCE, /plugin_root: resolvePluginRoot\(\)/);
  assert.match(PLUGIN_SOURCE, /\{ cwd: directory \}/);
  assert.match(PLUGIN_SOURCE, /hookVerdict\(input && input\.tool, output && output\.args, directory\)/);
  assert.match(PLUGIN_SOURCE, /hookVerdict\(event && event\.tool, event && event\.input, directory\)/);
});

test("emitted plugin loads as ESM and exercises both the v1 and v2 entrypoints", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-plugin-load-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "ospec.mjs");
  fs.writeFileSync(file, PLUGIN_SOURCE);

  const mod = await import(pathToFileURL(file).href);

  assert.equal(mod.default.id, "ospec");
  assert.equal(typeof mod.default.server, "function");
  assert.equal(typeof mod.default.setup, "function");

  // v1 entrypoint: OpenCode 1.x calls server() and consumes the hooks object.
  const v1Hooks = await mod.default.server({ directory: "/repo" });
  assert.equal(typeof v1Hooks.event, "function");
  assert.equal(typeof v1Hooks["tool.execute.before"], "function");

  // v2 entrypoint: setup() registers the tool hook and the event subscription.
  const registrations = [];
  const ctx = {
    location: { directory: "/repo" },
    tool: {
      hook: async (name, callback) => {
        registrations.push({ name, callback });
      },
    },
    permission: { hook: async () => {} },
    event: { subscribe: () => (async function* () {})() },
  };
  const cleanup = await mod.default.setup(ctx);

  assert.deepEqual(registrations.map((entry) => entry.name), ["execute.before"]);
  assert.equal(typeof registrations[0].callback, "function");
  assert.equal(typeof cleanup, "function");
});

// --- guard verdict -> native ask (E1.26) -----------------------------------

// The emitted module is exercised with the spawnSync boundary stubbed so the
// test drives the real hook wiring and observes what the bridge asks the host.
async function loadStubbedPlugin(t, verdict) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-plugin-ask-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "ospec.mjs");
  const stubbed = PLUGIN_SOURCE.replace(
    "return spawnSync(resolveBinary(), [subcommand], options);",
    "return globalThis.__ospecHookStub(options);",
  );
  assert.notEqual(stubbed, PLUGIN_SOURCE, "plugin source must spawn the hook through the stubbable call");
  globalThis.__ospecHookStub = () => ({
    status: 0,
    stdout: JSON.stringify(verdict ? { hookSpecificOutput: verdict } : {}),
  });
  t.after(() => {
    delete globalThis.__ospecHookStub;
  });
  fs.writeFileSync(file, stubbed);
  return import(pathToFileURL(file).href);
}

function fakeContext({ nativeAsk = true } = {}) {
  const registrations = { tool: [], permission: [], asserts: [] };
  const ctx = {
    location: { directory: "/repo" },
    registrations,
    tool: {
      hook: async (name, callback) => {
        registrations.tool.push({ name, callback });
      },
    },
    permission: {
      hook: async (name, callback) => {
        registrations.permission.push({ name, callback });
      },
    },
    event: { subscribe: () => (async function* () {})() },
  };
  if (nativeAsk) {
    ctx.permission.assert = async (input) => {
      registrations.asserts.push(input);
    };
  }
  return ctx;
}

function toolEvent() {
  return {
    tool: "bash",
    input: { command: "pwd" },
    sessionID: "ses_ask",
    agent: "build",
    messageID: "msg_ask",
    id: "call_ask",
  };
}

function findHook(ctx, domain, name) {
  const registration = ctx.registrations[domain].find((entry) => entry.name === name);
  assert.ok(registration, `setup must register ${domain} hook ${name}`);
  return registration.callback;
}

test("v2 bridges an ask verdict to the host's native permission surface", async (t) => {
  const mod = await loadStubbedPlugin(t, { permissionDecision: "ask", permissionDecisionReason: "aviso del guard" });
  const ctx = fakeContext();
  await mod.default.setup(ctx);

  await findHook(ctx, "tool", "execute.before")(toolEvent());

  assert.deepEqual(ctx.registrations.asserts, [
    {
      sessionID: "ses_ask",
      agent: "build",
      action: "ospec",
      resources: ["bash", "pwd"],
      metadata: { reason: "aviso del guard" },
      source: { type: "tool", messageID: "msg_ask", id: "call_ask" },
    },
  ]);
});

test("v2 escalates the ospec action to ask in the permission evaluate hook", async (t) => {
  const mod = await loadStubbedPlugin(t, null);
  const ctx = fakeContext();
  await mod.default.setup(ctx);
  const evaluate = findHook(ctx, "permission", "evaluate");

  const ospec = { sessionID: "ses_ask", action: "ospec", resources: ["bash"], metadata: { reason: "aviso del guard" }, effect: "allow" };
  await evaluate(ospec);
  assert.equal(ospec.effect, "ask");
  assert.equal(ospec.message, "aviso del guard");

  const shell = { sessionID: "ses_ask", action: "shell", resources: ["*"], effect: "allow" };
  await evaluate(shell);
  assert.equal(shell.effect, "allow");
  assert.equal(shell.message, undefined);
});

test("v2 keeps deny as a hard block and never prompts", async (t) => {
  const mod = await loadStubbedPlugin(t, { permissionDecision: "deny", permissionDecisionReason: "orden destructiva" });
  const ctx = fakeContext();
  await mod.default.setup(ctx);

  await assert.rejects(findHook(ctx, "tool", "execute.before")(toolEvent()), /orden destructiva/);
  assert.deepEqual(ctx.registrations.asserts, []);
});

test("v2 blocks an ask verdict when the runtime has no permission.assert (fail closed)", async (t) => {
  const mod = await loadStubbedPlugin(t, { permissionDecision: "ask", permissionDecisionReason: "aviso del guard" });
  const ctx = fakeContext({ nativeAsk: false });
  await mod.default.setup(ctx);

  await assert.rejects(findHook(ctx, "tool", "execute.before")(toolEvent()), /aviso del guard/);
  assert.deepEqual(ctx.registrations.asserts, []);
});

test("v2 setup succeeds and fails closed when ctx.permission is absent on older v2 runtimes", async (t) => {
  const mod = await loadStubbedPlugin(t, { permissionDecision: "ask", permissionDecisionReason: "aviso del guard" });
  const ctx = fakeContext({ nativeAsk: false });
  delete ctx.permission;

  await mod.default.setup(ctx);

  await assert.rejects(findHook(ctx, "tool", "execute.before")(toolEvent()), /aviso del guard/);
});

test("v2 omits source when messageID or id is absent and extracts file_path/target_file details", async (t) => {
  const mod = await loadStubbedPlugin(t, { permissionDecision: "ask", permissionDecisionReason: "lectura sensible" });
  const ctx = fakeContext();
  await mod.default.setup(ctx);

  await findHook(ctx, "tool", "execute.before")({
    tool: "read",
    input: { file_path: ".env.local" },
    sessionID: "ses_ask",
  });

  assert.deepEqual(ctx.registrations.asserts, [
    {
      sessionID: "ses_ask",
      action: "ospec",
      resources: ["read", ".env.local"],
      metadata: { reason: "lectura sensible" },
    },
  ]);
});

test("v1 keeps collapsing ask to a hard block (no native surface)", async (t) => {
  const mod = await loadStubbedPlugin(t, { permissionDecision: "ask", permissionDecisionReason: "aviso del guard" });
  const hooks = await mod.default.server({ directory: "/repo" });

  await assert.rejects(hooks["tool.execute.before"]({ tool: "bash" }, { args: { command: "pwd" } }), /aviso del guard/);
});

