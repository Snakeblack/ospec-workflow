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
  isLiveIsolationProbeEvidence,
} = require("./worker-sandbox.js");
const {
  isAuthorizedNodeRuntime,
  confineChildEnv,
} = require("./worker-sandbox-confine.js");

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

test("worker-sandbox: rejects non-Node unconfined commands fail-closed without execution", async (t) => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "ws-sandbox-non-node-"));
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-sandbox-non-node-ext-"));
  const extTarget = path.join(extDir, "non-node-escape.txt");
  t.after(() => {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(extDir, { recursive: true, force: true }); } catch {}
  });

  const result = await executeSandboxedCommand({
    command: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    args: process.platform === "win32" ? ["/c", `echo escaped > "${extTarget}"`] : ["-c", `echo escaped > "${extTarget}"`],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure_class, "sandbox_rejection");
  assert.equal(fs.existsSync(extTarget), false, "External target must NOT be created");
});

test("worker-sandbox: blocks child_process shell/unconfined execution from inside Node process", async (t) => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "ws-sandbox-cp-"));
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-sandbox-cp-ext-"));
  const extTarget = path.join(extDir, "cp-escape.txt");
  t.after(() => {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(extDir, { recursive: true, force: true }); } catch {}
  });

  const script = `
    const cp = require('node:child_process');
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const arg = process.platform === 'win32' ? ['/c', 'echo leak > "${extTarget.replace(/\\/g, "/")}"'] : ['-c', 'echo leak > "${extTarget}"'];
    cp.execFileSync(shell, arg);
  `;

  const result = await executeSandboxedCommand({
    command: process.execPath,
    args: ["-e", script],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
  });

  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(extTarget), false, "External target must NOT exist after child_process attempt");
});

test("worker-sandbox: blocks symlink escaping destination and write through escaping symlink", async (t) => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "ws-sandbox-sym-"));
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-sandbox-sym-ext-"));
  const extTarget = path.join(extDir, "sym-escape.txt");
  t.after(() => {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(extDir, { recursive: true, force: true }); } catch {}
  });

  // Attempt 1: create symlink inside dist pointing outside workspace
  const symlinkScript = `
    const fs = require('node:fs');
    const path = require('node:path');
    fs.mkdirSync('dist', { recursive: true });
    try {
      fs.symlinkSync(${JSON.stringify(extDir)}, 'dist/external_link', 'dir');
    } catch (e) {
      // If symlink creation was blocked, test is passed
      process.exit(0);
    }
    // If symlink somehow succeeded, write through it MUST be blocked
    fs.writeFileSync('dist/external_link/sym-escape.txt', 'leak');
  `;

  const result = await executeSandboxedCommand({
    command: process.execPath,
    args: ["-e", symlinkScript],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
  });

  assert.equal(fs.existsSync(extTarget), false, "External target must NOT exist via escaping symlink");
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

  const isoProbe = await primitive({
    probe: true,
    isolation: true,
    workspace_root: ws,
    allowed_paths: ["allowed/**"],
    attempts,
  });
  assert.equal(isoProbe.ok, true);
  assert.equal(isoProbe.value.attempts[0].attempted, true);
  assert.equal(isoProbe.value.attempts[0].wrote, true);
  assert.equal(isoProbe.value.attempts[1].attempted, true);
  assert.equal(isoProbe.value.attempts[1].wrote, false);
  assert.equal(isoProbe.value.attempts[2].attempted, true);
  assert.equal(isoProbe.value.attempts[2].wrote, false);

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

function makeEscapeHarness(t, label) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `ws-sandbox-${label}-`));
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), `ws-sandbox-${label}-out-`));
  const extTarget = path.join(extDir, `${label}.txt`);
  t.after(() => {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(extDir, { recursive: true, force: true }); } catch {}
  });
  return { ws, extDir, extTarget };
}

test("worker-sandbox: nested Node spawnSync with empty env cannot write outside workspace", async (t) => {
  const { ws, extTarget } = makeEscapeHarness(t, "env-empty");
  const inner = `require("fs").writeFileSync(${JSON.stringify(extTarget)}, "escaped")`;
  const script = `
    const { spawnSync } = require("node:child_process");
    spawnSync(process.execPath, ${JSON.stringify(["-e", inner])}, { env: {} });
  `;

  await executeSandboxedCommand({
    command: process.execPath,
    args: ["-e", script],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
  });

  assert.equal(fs.existsSync(extTarget), false, "Nested Node with env:{} must not create the external file");
});

test("worker-sandbox: nested execFileSync with stripped sandbox env cannot write outside workspace", async (t) => {
  const { ws, extTarget } = makeEscapeHarness(t, "env-stripped");
  const inner = `require("fs").writeFileSync(${JSON.stringify(extTarget)}, "escaped")`;
  const script = `
    const { execFileSync, spawnSync } = require("node:child_process");
    const stripped = {
      PATH: process.env.PATH,
      NODE_OPTIONS: "",
      OSPEC_SANDBOX_WORKSPACE_ROOT: "",
      OSPEC_SANDBOX_ALLOWED_PATHS: "",
    };
    try { execFileSync(process.execPath, ${JSON.stringify(["-e", inner])}, { env: stripped }); } catch {}
    spawnSync(process.execPath, ${JSON.stringify(["-e", inner])}, { env: { NODE_OPTIONS: "" } });
  `;

  await executeSandboxedCommand({
    command: process.execPath,
    args: ["-e", script],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
  });

  assert.equal(fs.existsSync(extTarget), false, "Stripping NODE_OPTIONS / sandbox env must not allow an external write");
});

test("worker-sandbox: nested fork with empty env cannot write outside workspace", async (t) => {
  const { ws, extTarget } = makeEscapeHarness(t, "fork-empty");
  const childScript = path.join(ws, "dist", "fork-child.js");
  fs.mkdirSync(path.dirname(childScript), { recursive: true });
  fs.writeFileSync(childScript, `require("fs").writeFileSync(${JSON.stringify(extTarget)}, "escaped");`);
  const script = `
    const { fork } = require("node:child_process");
    const child = fork(${JSON.stringify(childScript)}, [], { env: {}, stdio: "ignore" });
    child.on("error", () => {});
    setTimeout(() => process.exit(0), 250);
  `;

  await executeSandboxedCommand({
    command: process.execPath,
    args: ["-e", script],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
    timeoutMs: 5000,
  });

  assert.equal(fs.existsSync(extTarget), false, "fork() with env:{} must not create the external file");
});

test("worker-sandbox: nested worker_threads.Worker with eval and empty execArgv cannot write outside workspace", async (t) => {
  const { ws, extTarget } = makeEscapeHarness(t, "wt-eval-empty");
  const inner = `require("fs").writeFileSync(${JSON.stringify(extTarget)}, "escaped")`;
  const script = `
    const { Worker } = require("node:worker_threads");
    const w = new Worker(${JSON.stringify(inner)}, { eval: true, execArgv: [] });
    w.on("error", () => {});
    w.on("exit", () => process.exit(0));
    setTimeout(() => process.exit(0), 400);
  `;

  await executeSandboxedCommand({
    command: process.execPath,
    args: ["-e", script],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
    timeoutMs: 5000,
  });

  assert.equal(fs.existsSync(extTarget), false, "Worker({ eval: true, execArgv: [] }) must not create the external file");
});

test("worker-sandbox: rejects a fake executable whose basename is node", async (t) => {
  const { ws, extTarget } = makeEscapeHarness(t, "fake-node");
  const fakeDir = path.join(ws, "tmp");
  fs.mkdirSync(fakeDir, { recursive: true });
  const fakeNode = path.join(fakeDir, process.platform === "win32" ? "node.exe" : "node");
  const payload = process.platform === "win32"
    ? `@echo escaped> "${extTarget}"\r\n`
    : `#!/bin/sh\necho escaped > ${JSON.stringify(extTarget)}\n`;
  fs.writeFileSync(fakeNode, payload);
  if (process.platform !== "win32") {
    fs.chmodSync(fakeNode, 0o755);
  }

  const result = await executeSandboxedCommand({
    command: fakeNode,
    args: [],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["tmp/**", "dist/**"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure_class, "sandbox_rejection");
  assert.equal(fs.existsSync(extTarget), false, "Fake node binary must not execute");
});

test("worker-sandbox: sandboxed process cannot spawn a fake node by basename", async (t) => {
  const { ws, extTarget } = makeEscapeHarness(t, "spawn-fake-node");
  const fakeDir = path.join(ws, "tmp");
  fs.mkdirSync(fakeDir, { recursive: true });
  const fakeNode = path.join(fakeDir, "node");
  const payload = process.platform === "win32"
    ? `@echo escaped> "${extTarget}"\r\n`
    : `#!/bin/sh\necho escaped > ${JSON.stringify(extTarget)}\n`;
  fs.writeFileSync(fakeNode, payload);
  if (process.platform !== "win32") {
    fs.chmodSync(fakeNode, 0o755);
  }

  const script = `
    const { spawnSync } = require("node:child_process");
    spawnSync(${JSON.stringify(fakeNode)}, []);
  `;

  const result = await executeSandboxedCommand({
    command: process.execPath,
    args: ["-e", script],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["tmp/**", "dist/**"],
  });

  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(extTarget), false, "In-sandbox spawn of ./node must not execute the fake binary");
});

test("worker-sandbox: bare node alias still runs the authorized runtime inside the sandbox", async (t) => {
  const { ws } = makeEscapeHarness(t, "bare-node-alias");
  const targetFile = path.join(ws, "dist", "alias.txt");
  const result = await executeSandboxedCommand({
    command: process.platform === "win32" ? "node.exe" : "node",
    args: ["-e", "const fs = require('fs'); fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/alias.txt', 'ok');"],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
  });

  assert.equal(result.ok, true);
  assert.equal(fs.readFileSync(targetFile, "utf8"), "ok");
});

test("worker-sandbox-confine: Node identity is the authorized runtime realpath, not basename", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ws-confine-id-"));
  t.after(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  });
  const fakeNode = path.join(tmp, "node");
  fs.writeFileSync(fakeNode, "#!/bin/sh\n");

  assert.equal(isAuthorizedNodeRuntime(process.execPath), true);
  assert.equal(isAuthorizedNodeRuntime("node"), true);
  assert.equal(isAuthorizedNodeRuntime("node.exe"), true);
  assert.equal(isAuthorizedNodeRuntime(fakeNode), false);
  assert.equal(isAuthorizedNodeRuntime(path.join(tmp, "node.exe")), false);
});

test("worker-sandbox-confine: child env cannot drop or replace sandbox keys", () => {
  const capturedPolicy = {
    workspaceRoot: "/ws",
    allowedPaths: ["dist/**"],
  };
  const preload = path.join("scripts", "lib", "worker-sandbox-preload.js");
  const confined = confineChildEnv({
    NODE_OPTIONS: "",
    OSPEC_SANDBOX_WORKSPACE_ROOT: "/tmp/evil",
    OSPEC_SANDBOX_ALLOWED_PATHS: '["**"]',
  }, capturedPolicy, preload);

  assert.equal(confined.OSPEC_SANDBOX_WORKSPACE_ROOT, "/ws");
  assert.equal(confined.OSPEC_SANDBOX_ALLOWED_PATHS, JSON.stringify(["dist/**"]));
  assert.match(confined.NODE_OPTIONS, /--require /);
  assert.match(confined.NODE_OPTIONS, /worker-sandbox-preload\.js/);
  assert.doesNotMatch(confined.NODE_OPTIONS, /max-old-space-size/);

  const fromEmpty = confineChildEnv({}, capturedPolicy, preload);
  assert.equal(fromEmpty.OSPEC_SANDBOX_WORKSPACE_ROOT, "/ws");
  assert.match(fromEmpty.NODE_OPTIONS, /--require /);
});

test("worker-sandbox: mutated OSPEC_SANDBOX_* does not expand nested spawn/execFile/fork allowed_paths", async (t) => {
  for (const kind of ["spawn", "execFile", "fork"]) {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), `ws-sandbox-p01-${kind}-`));
    t.after(() => {
      try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
    });
    fs.mkdirSync(path.join(ws, "dist"), { recursive: true });
    const leak = path.join(ws, "unauthorized", "leak.txt");
    const innerWrite = `require("fs").mkdirSync("unauthorized",{recursive:true});require("fs").writeFileSync("unauthorized/leak.txt","pwn");`;
    let script;
    if (kind === "fork") {
      const childScript = path.join(ws, "dist", "fork-mutated-child.js");
      fs.writeFileSync(childScript, `${innerWrite}\nprocess.stdout.write(process.env.OSPEC_SANDBOX_ALLOWED_PATHS || "");`);
      script = `
        process.env.OSPEC_SANDBOX_ALLOWED_PATHS = JSON.stringify(["**"]);
        process.env.OSPEC_SANDBOX_WORKSPACE_ROOT = ${JSON.stringify(path.join(ws, "other"))};
        const { fork } = require("node:child_process");
        const child = fork(${JSON.stringify(childScript)}, [], { stdio: ["ignore", "pipe", "pipe"] });
        child.on("error", () => process.exit(0));
        setTimeout(() => process.exit(0), 400);
      `;
    } else {
      const api = kind === "spawn" ? "spawnSync" : "execFileSync";
      script = `
        process.env.OSPEC_SANDBOX_ALLOWED_PATHS = JSON.stringify(["**"]);
        process.env.OSPEC_SANDBOX_WORKSPACE_ROOT = ${JSON.stringify(path.join(ws, "other"))};
        const cp = require("node:child_process");
        try {
          cp.${api}(process.execPath, ["-e", ${JSON.stringify(innerWrite)}], { encoding: "utf8" });
        } catch {}
      `;
    }
    const result = await executeSandboxedCommand({
      command: process.execPath,
      args: ["-e", script],
      cwd: ws,
      workspaceRoot: ws,
      allowedPaths: ["dist/**"],
      timeoutMs: 8000,
    });
    assert.equal(fs.existsSync(leak), false, `${kind}: mutated env must not expand child allowed_paths`);
    void result;
  }
});

test("worker-sandbox: Node 22 mutating fs inventory fails closed for undeclared targets", async (t) => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "ws-sandbox-fs-inv-"));
  t.after(() => {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
  });
  fs.mkdirSync(path.join(ws, "dist"), { recursive: true });
  const hostFs = require("node:fs");
  const mutating = [];
  const prefixes = [
    "mkdtemp", "chmod", "lchmod", "chown", "lchown", "utimes", "lutimes",
    "mkdtempDisposable", "fchmod", "fchown", "futimes", "ftruncate",
  ];
  for (const key of Object.keys(hostFs)) {
    if (prefixes.some((p) => key === p || key === `${p}Sync` || key.startsWith(p))) {
      if (typeof hostFs[key] === "function") mutating.push(`fs.${key}`);
    }
  }
  if (hostFs.promises) {
    for (const key of Object.keys(hostFs.promises)) {
      if (prefixes.some((p) => key === p || key.startsWith(p))) {
        if (typeof hostFs.promises[key] === "function") mutating.push(`fs.promises.${key}`);
      }
    }
  }
  assert.ok(mutating.includes("fs.mkdtempSync"));
  assert.ok(mutating.includes("fs.chmodSync") || mutating.includes("fs.chmod"));
  const script = `
    const fs = require("node:fs");
    const path = require("node:path");
    const os = require("node:os");
    const target = path.join(${JSON.stringify(ws)}, "unauthorized", "probe");
    const results = {};
    function catchDenied(label, fn) {
      try { fn(); results[label] = "ran"; } catch (err) {
        results[label] = err && err.code === "EACCES" ? "denied" : String(err && err.code || err);
      }
    }
    catchDenied("mkdtempSync", () => fs.mkdtempSync(target + "-"));
    catchDenied("chmodSync", () => fs.chmodSync(target, 0o644));
    catchDenied("chownSync", () => fs.chownSync(target, 0, 0));
    catchDenied("utimesSync", () => fs.utimesSync(target, new Date(), new Date()));
    if (typeof fs.lutimesSync === "function") {
      catchDenied("lutimesSync", () => fs.lutimesSync(target, new Date(), new Date()));
    }
    if (typeof fs.lchownSync === "function") {
      catchDenied("lchownSync", () => fs.lchownSync(target, 0, 0));
    }
    if (typeof fs.lchmodSync === "function") {
      catchDenied("lchmodSync", () => fs.lchmodSync(target, 0o644));
    }
    if (typeof fs.mkdtempDisposableSync === "function") {
      catchDenied("mkdtempDisposableSync", () => fs.mkdtempDisposableSync(target + "-d-"));
    }
    Promise.resolve()
      .then(async () => {
        const deny = async (label, fn) => {
          try { await fn(); results[label] = "ran"; } catch (err) {
            results[label] = err && err.code === "EACCES" ? "denied" : String(err && err.code || err);
          }
        };
        await deny("promises.mkdtemp", () => fs.promises.mkdtemp(target + "-p-"));
        await deny("promises.chmod", () => fs.promises.chmod(target, 0o644));
        await deny("promises.chown", () => fs.promises.chown(target, 0, 0));
        await deny("promises.utimes", () => fs.promises.utimes(target, new Date(), new Date()));
        if (typeof fs.promises.lutimes === "function") {
          await deny("promises.lutimes", () => fs.promises.lutimes(target, new Date(), new Date()));
        }
        if (typeof fs.promises.mkdtempDisposable === "function") {
          await deny("promises.mkdtempDisposable", () => fs.promises.mkdtempDisposable(target + "-pd-"));
        }
      })
      .then(() => { process.stdout.write(JSON.stringify(results)); })
      .catch((err) => { process.stdout.write(JSON.stringify({ fatal: String(err) })); process.exitCode = 1; });
  `;
  const result = await executeSandboxedCommand({
    command: process.execPath,
    args: ["-e", script],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
    timeoutMs: 8000,
  });
  assert.equal(result.ok, true, result.stderr);
  const results = JSON.parse(result.stdout);
  for (const [label, status] of Object.entries(results)) {
    assert.equal(status, "denied", `${label} must fail closed at wrapper, got ${status}`);
  }
  assert.equal(fs.existsSync(path.join(ws, "unauthorized")), false);
});

test("worker-sandbox: allowed mutating fs APIs succeed inside captured paths and post-flight still applies", async (t) => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "ws-sandbox-fs-ok-"));
  t.after(() => {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
  });
  const script = `
    const fs = require("node:fs");
    const path = require("node:path");
    fs.mkdirSync("dist", { recursive: true });
    const prefix = path.join("dist", "tmp-");
    const dir = fs.mkdtempSync(path.resolve("dist", "tmp-"));
    fs.writeFileSync(path.join(dir, "f.txt"), "ok");
    fs.chmodSync(path.join(dir, "f.txt"), 0o644);
    fs.utimesSync(path.join(dir, "f.txt"), new Date(), new Date());
    process.stdout.write(dir);
  `;
  const result = await executeSandboxedCommand({
    command: process.execPath,
    args: ["-e", script],
    cwd: ws,
    workspaceRoot: ws,
    allowedPaths: ["dist/**"],
  });
  assert.equal(result.ok, true, result.stderr);
  assert.ok(result.stdout.includes("tmp-"));
  assert.ok(fs.existsSync(result.stdout.trim()));
});

test("worker-sandbox: isolation probe attempts three writes; vacuous blocked is not evidence", async (t) => {
  const primitive = makeSandboxedWorkerPrimitive();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "ws-probe-live-"));
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), "ws-probe-live-out-"));
  t.after(() => {
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(ext, { recursive: true, force: true }); } catch {}
  });
  fs.mkdirSync(path.join(ws, "allowed"), { recursive: true });
  const attempts = [
    { id: "allowed_write", path: path.join(ws, "allowed", "ok.txt"), content: "ok" },
    { id: "undeclared_workspace_write", path: path.join(ws, "leak.txt"), content: "leak" },
    { id: "external_root_write", path: path.join(ext, "ext.txt"), content: "ext" },
  ];
  const isoProbe = await primitive({
    probe: true,
    isolation: true,
    workspace_root: ws,
    allowed_paths: ["allowed/**"],
    attempts,
  });
  assert.equal(isoProbe.ok, true);
  assert.equal(isoProbe.value.attempts.length, 3);
  for (const rec of isoProbe.value.attempts) {
    assert.equal(rec.attempted, true);
    assert.equal(typeof rec.wrote, "boolean");
  }
  assert.equal(isoProbe.value.attempts[0].wrote, true);
  assert.equal(isoProbe.value.attempts[1].wrote, false);
  assert.equal(isoProbe.value.attempts[2].wrote, false);
  assert.equal(fs.existsSync(attempts[0].path), true);
  assert.equal(fs.existsSync(attempts[1].path), false);
  assert.equal(fs.existsSync(attempts[2].path), false);

  assert.equal(isLiveIsolationProbeEvidence({ blocked: true }), false);
  assert.equal(isLiveIsolationProbeEvidence({
    containment: {
      allowed_write: "PASS",
      undeclared_workspace_write: "BLOCKED",
      external_root_write: "BLOCKED",
    },
    attempts: isoProbe.value.attempts,
  }), true);
});
