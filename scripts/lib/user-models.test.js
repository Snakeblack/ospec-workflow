"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  formatUserModels,
  parseModelFlags,
  parseUserModels,
  prepareUserModels,
  readUserModels,
  userModelsPath,
  writeUserModels,
} = require("./user-models.js");

function home(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-user-models-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { homedir: () => dir, env: {}, platform: process.platform };
}
function file(options) {
  return userModelsPath(options);
}

test("the assignment lives in the user's config dir, never in a project", () => {
  const homedir = () => "/home/u";
  assert.equal(userModelsPath({ homedir, env: {}, platform: "linux" }), "/home/u/.config/ospec/models.yaml");
  assert.equal(userModelsPath({ homedir, env: { XDG_CONFIG_HOME: "/xdg" }, platform: "linux" }), "/xdg/ospec/models.yaml");
  assert.equal(userModelsPath({ homedir, env: { XDG_CONFIG_HOME: "relative" }, platform: "darwin" }), "/home/u/.config/ospec/models.yaml");
  assert.equal(userModelsPath({ homedir: () => "C:\\Users\\u", env: { APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, platform: "win32" }), "C:\\Users\\u\\AppData\\Roaming\\ospec\\models.yaml");
  assert.equal(userModelsPath({ homedir: () => "C:\\Users\\u", env: {}, platform: "win32" }), "C:\\Users\\u\\AppData\\Roaming\\ospec\\models.yaml");
});

test("the reader takes hosts, tiers and free-text models, quoted or bare", () => {
  const models = parseUserModels([
    "# comment",
    "codex:",
    '  premium: "gpt-6.1-sol"',
    "  cheap: gpt-6-luna",
    "vscode:",
    '  default: "gpt-6 Terra (copilot)"',
    "cursor:",
    "  default: grok-4.6[fast=false]",
    "",
  ].join("\r\n"));
  assert.deepEqual(models, {
    codex: { premium: "gpt-6.1-sol", cheap: "gpt-6-luna" },
    vscode: { default: "gpt-6 Terra (copilot)" },
    cursor: { default: "grok-4.6[fast=false]" },
  });
});

test("the reader rejects the whole file on anything it does not know", () => {
  for (const [text, reason] of [
    ["antigravity:\n  premium: x\n", /unknown host/],
    ["codex:\n  ultra: x\n", /unknown tier/],
    ["  premium: x\n", /needs its host/],
    ["codex:\n  premium: x\n  premium: y\n", /duplicate tier/],
    ["codex:\ncodex:\n", /duplicate host/],
    ["codex:\n  premium: \"\"\n", /invalid model/],
    ["codex:\n  premium: \"a\\u0007b\"\n", /invalid model/],
    ["codex:\n    premium: x\n", /expected/],
  ]) {
    assert.throws(() => parseUserModels(text), reason, text);
  }
});

test("format and parse round-trip any model name", () => {
  const models = { codex: { premium: 'a "quoted" #name' }, claude: { cheap: "fable" } };
  assert.deepEqual(parseUserModels(formatUserModels(models)), models);
});

test("a missing file is an empty assignment; a broken one is ignored with a warning", (t) => {
  const options = home(t);
  assert.deepEqual(readUserModels(options), { file: file(options), models: {}, warning: null });
  fs.mkdirSync(path.dirname(file(options)), { recursive: true });
  fs.writeFileSync(file(options), "codex:\n  ultra: x\n");
  const result = readUserModels(options);
  assert.deepEqual(result.models, {});
  assert.match(result.warning, /se ignora .*unknown tier.*heredan el modelo de la sesión/);
});

test("writing sets and clears tiers of one host and keeps the others", (t) => {
  const options = home(t);
  writeUserModels("codex", { premium: "gpt-sol", cheap: "gpt-luna" }, options);
  writeUserModels("opencode", { default: "zai/glm" }, options);
  writeUserModels("codex", { cheap: null, premium: " gpt-sol-2 " }, options);
  assert.deepEqual(readUserModels(options).models, { codex: { premium: "gpt-sol-2" }, opencode: { default: "zai/glm" } });
  writeUserModels("opencode", { default: "" }, options);
  assert.deepEqual(readUserModels(options).models, { codex: { premium: "gpt-sol-2" } });
  assert.throws(() => writeUserModels("antigravity", { premium: "x" }, options), /hereda/);
  assert.throws(() => writeUserModels("codex", { premium: "a\nb" }, options), /no válido/);
});

test("a broken file is never overwritten", (t) => {
  const options = home(t);
  fs.mkdirSync(path.dirname(file(options)), { recursive: true });
  fs.writeFileSync(file(options), "codex:\n  ultra: x\n");
  assert.throws(() => writeUserModels("codex", { premium: "x" }, options), /corrige o borra/);
  assert.equal(fs.readFileSync(file(options), "utf8"), "codex:\n  ultra: x\n");
});

test("--model flags leave the argv and set or clear tiers", () => {
  assert.deepEqual(parseModelFlags(["--dry-run", "--model", "premium=gpt-x", "--model=cheap=", "--with-sdd"]), {
    argv: ["--dry-run", "--with-sdd"],
    updates: { premium: "gpt-x", cheap: null },
    error: null,
  });
  assert.deepEqual(parseModelFlags(["--model", "default=gpt 6 = Terra"]).updates, { default: "gpt 6 = Terra" });
  assert.match(parseModelFlags(["--model"]).error, /necesita/);
  assert.match(parseModelFlags(["--model", "ultra=x"]).error, /premium, default, cheap/);
  assert.match(parseModelFlags(["--model", "premium"]).error, /necesita/);
});

test("an installer saves its flags and gets the host's assignment and unassigned tiers", (t) => {
  const options = home(t);
  const prepared = prepareUserModels(["--model", "premium=gpt-x", "--with-sdd"], "codex", options);
  assert.equal(prepared.error, null);
  assert.deepEqual(prepared.argv, ["--with-sdd"]);
  assert.equal(prepared.saved, file(options));
  assert.deepEqual(prepared.userModels, { premium: "gpt-x" });
  assert.deepEqual(prepared.unassigned, ["default", "cheap"]);
  assert.deepEqual(prepareUserModels([], "claude", options).unassigned, [], "Claude falls back to its aliases");
});

test("a dry run applies the flags to this run only", (t) => {
  const options = home(t);
  const prepared = prepareUserModels(["--model", "cheap=gpt-luna"], "cursor", { ...options, persist: false });
  assert.deepEqual(prepared.userModels, { cheap: "gpt-luna" });
  assert.equal(prepared.saved, null);
  assert.equal(fs.existsSync(file(options)), false);
});

test("an inherited host refuses --model and takes no assignment", (t) => {
  const options = home(t);
  assert.match(prepareUserModels(["--model", "premium=x"], "antigravity", options).error, /hereda/);
  assert.deepEqual(prepareUserModels([], "antigravity", options), { argv: [], userModels: {}, saved: null, warning: null, unassigned: [], file: file(options), error: null });
});
