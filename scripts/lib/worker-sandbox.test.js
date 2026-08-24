"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  executeSandboxedCommand,
  makeSandboxedWorkerPrimitive,
  makeSandboxedIsolationPrimitive,
  makeRogueIsolationPrimitive,
} = require("./worker-sandbox.js");

test("worker-sandbox: executes allowed writes inside allowed_paths within workspace", async (t) => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "ws-sandbox-allowed-"));
  t.after(() => {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
  });

  const targetFile = path.join(ws, "dist", "output.txt");
  const script = "const fs = require('fs'); fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/output.txt', 'hello from sandbox');";

  const result = await executeSandboxedCommand({
    command: process.execPath,
    args: ["-e", script],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.exit_code, 0);
  assert.ok(fs.existsSync(targetFile));
  assert.equal(fs.readFileSync(targetFile, "utf8"), "hello from sandbox");
});

test("worker-sandbox: physically blocks writes outside workspace root (external root write)", async (t) => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "ws-sandbox-ext-"));
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-sandbox-ext-out-"));
  const extTarget = path.join(extDir, "escape.txt");
  t.after(() => {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(extDir, { recursive: true, force: true }); } catch {}
  });

  const script = `const fs = require('fs'); fs.writeFileSync(${JSON.stringify(extTarget)}, 'escaped');`;

  const result = await executeSandboxedCommand({
    command: process.execPath,
    args: ["-e", script],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
  });

  assert.equal(result.ok, false);
  assert.notEqual(result.exit_code, 0);
  assert.equal(fs.existsSync(extTarget), false, "External target must not be created");
});

test("worker-sandbox: physically blocks undeclared writes inside workspace", async (t) => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "ws-sandbox-undec-"));
  t.after(() => {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
  });

  const undeclaredFile = path.join(ws, "unauthorized", "leak.txt");
  const script = "const fs = require('fs'); fs.mkdirSync('unauthorized', { recursive: true }); fs.writeFileSync('unauthorized/leak.txt', 'pwn');";

  const result = await executeSandboxedCommand({
    command: process.execPath,
    args: ["-e", script],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
  });

  assert.equal(result.ok, false);
  assert.notEqual(result.exit_code, 0);
  assert.equal(fs.existsSync(undeclaredFile), false, "Undeclared file must not be created");
});

test("makeSandboxedWorkerPrimitive: handles probe challenges and command execution", async (t) => {
  const primitive = makeSandboxedWorkerPrimitive();

  // 1. WorkerTransport live probe
  const tProbe = await primitive({ probe: true, parallel: true });
  assert.equal(tProbe.ok, true);
  assert.ok(tProbe.value.worker_id);

  // 2. WorkerIsolation live probe
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "ws-prim-probe-"));
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), "ws-prim-probe-out-"));
  t.after(() => {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(ext, { recursive: true, force: true }); } catch {}
  });

  const attempts = [
    { id: "allowed_write", path: path.join(ws, "allowed", "ok.txt"), content: "ok" },
    { id: "undeclared_workspace_write", path: path.join(ws, "leak.txt"), content: "leak" },
    { id: "external_root_write", path: path.join(ext, "ext.txt"), content: "ext" },
  ];

  const isoProbe = await primitive({ probe: true, isolation: true, workspace_root: ws, attempts });
  assert.equal(isoProbe.ok, true);
  assert.equal(isoProbe.value.attempts[0].wrote, true);
  assert.equal(isoProbe.value.attempts[1].blocked, true);
  assert.equal(isoProbe.value.attempts[2].blocked, true);

  // 3. Command execution in sandbox
  const cmdRes = await primitive({
    command: process.execPath,
    args: ["-e", "const fs = require('fs'); fs.mkdirSync('allowed', { recursive: true }); fs.writeFileSync('allowed/run.txt', 'done');"],
    cwd: ws,
    workspace_root: ws,
    allowed_paths: ["allowed/**"],
  });
  assert.equal(cmdRes.ok, true);
  assert.ok(fs.existsSync(path.join(ws, "allowed", "run.txt")));
});
