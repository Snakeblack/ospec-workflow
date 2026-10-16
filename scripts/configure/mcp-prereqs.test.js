"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { commandNames, commandsFromSourceMcp, warnIfUvxMissing } = require("./mcp-prereqs.js");

const ROOT = path.resolve(__dirname, "..", "..");

function sink() {
  const chunks = [];
  return { chunks, write(chunk) { chunks.push(String(chunk)); return true; }, text() { return chunks.join(""); } };
}

test("the canonical .mcp.json pins markitdown-mcp@0.0.1a7", () => {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, ".mcp.json"), "utf8"));
  assert.deepEqual(doc.mcpServers.markitdown.args, ["markitdown-mcp@0.0.1a7"]);
});

test("commandNames reads .mcp.json, opencode mcp and plain server maps", () => {
  assert.deepEqual(commandNames({ mcpServers: { a: { command: "uvx" }, b: { command: ["npx", "-y"] } } }), ["uvx", "npx"]);
  assert.deepEqual(commandNames({ mcp: { a: { command: ["uvx"] } } }), ["uvx"]);
  assert.deepEqual(commandNames({ a: { command: "uvx" } }), ["uvx"]);
  assert.deepEqual(commandNames({ mcpServers: { a: {} } }), []);
  assert.deepEqual(commandNames(null), []);
  assert.deepEqual(commandNames("nope"), []);
});

test("commandsFromSourceMcp reads the source .mcp.json and tolerates absence", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-prereqs-"));
  try {
    fs.writeFileSync(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { markitdown: { command: "uvx" } } }));
    assert.deepEqual(commandsFromSourceMcp(dir), ["uvx"]);
    assert.deepEqual(commandsFromSourceMcp(path.join(dir, "missing")), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("warnIfUvxMissing warns when uvx is absent", () => {
  const stderr = sink();
  const warned = warnIfUvxMissing(["npx", "uvx"], { stderr, spawnSync: () => ({ error: new Error("ENOENT") }) });
  assert.equal(warned, true);
  assert.match(stderr.text(), /uvx/);
  assert.match(stderr.text(), /docs\.astral\.sh\/uv/);
});

test("warnIfUvxMissing treats a throwing probe as absence and scans documents", () => {
  const stderr = sink();
  const warned = warnIfUvxMissing({ mcpServers: { markitdown: { command: "uvx" } } }, {
    stderr,
    spawnSync: () => { throw new Error("probe exploded"); },
  });
  assert.equal(warned, true);
  assert.match(stderr.text(), /uvx/);
});

test("warnIfUvxMissing stays silent when uvx answers or is not needed", () => {
  const stderr = sink();
  let probes = 0;
  assert.equal(warnIfUvxMissing(["uvx"], { stderr, spawnSync: () => { probes += 1; return { status: 0 }; } }), false);
  assert.equal(probes, 1);
  assert.equal(stderr.text(), "");

  const quiet = sink();
  assert.equal(warnIfUvxMissing(["npx"], { stderr: quiet, spawnSync: () => { probes += 1; return { status: 0 }; } }), false);
  assert.equal(probes, 1, "without a uvx server the probe never runs");
  assert.equal(quiet.text(), "");
});
