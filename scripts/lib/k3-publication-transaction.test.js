"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("../configure/cli.js");

const SOURCE = process.cwd();

function tree(dir) {
  const files = {};
  if (!fs.existsSync(dir)) return files;
  const walk = (current, rel = "") => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child, childRel);
      else if (entry.isFile()) files[childRel] = fs.readFileSync(child, "utf8");
    }
  };
  walk(dir);
  return files;
}

function siblingArtifacts(parent, name) {
  return fs.readdirSync(parent).filter(entry => entry.startsWith(`.${name}.configure-`) || entry === `.${name}.configure.lock`);
}

test("RED: a staged write failure preserves an existing destination byte-for-byte and cleans owned artifacts", t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "k3-transaction-"));
  const out = path.join(parent, "claude");
  fs.mkdirSync(path.join(out, "skills", "legacy"), { recursive: true });
  fs.writeFileSync(path.join(out, "skills", "legacy", "STALE.md"), "stale\n");
  fs.writeFileSync(path.join(out, "NOTES.md"), "unmanaged\n");
  const before = tree(out);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));

  assert.throws(() => runConfigure({
    sourceDir: SOURCE,
    target: "claude",
    outDir: out,
    validate: false,
    operationObserver: event => {
      if (event.operation === "write") throw new Error("injected write failure");
    },
  }), /injected write failure/);

  assert.deepEqual(tree(out), before);
  assert.deepEqual(siblingArtifacts(parent, "claude"), []);
});

test("RED: a stage-to-destination rename failure restores an existing destination and absent output is never partial", t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "k3-transaction-"));
  const existing = path.join(parent, "existing");
  fs.mkdirSync(existing, { recursive: true });
  fs.writeFileSync(path.join(existing, "NOTES.md"), "old\n");
  const before = tree(existing);
  const failPublish = event => {
    if (event.operation === "rename" && event.phase === "publish") throw new Error("injected publish failure");
  };
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));

  assert.throws(() => runConfigure({ sourceDir: SOURCE, target: "claude", outDir: existing, validate: false, operationObserver: failPublish }), /injected publish failure/);
  assert.deepEqual(tree(existing), before);

  const absent = path.join(parent, "absent");
  assert.throws(() => runConfigure({ sourceDir: SOURCE, target: "claude", outDir: absent, validate: false, operationObserver: event => {
    if (event.operation === "validate") throw new Error("injected validation failure");
  } }), /injected validation failure/);
  assert.equal(fs.existsSync(absent), false);
  assert.deepEqual(siblingArtifacts(parent, "absent"), []);
});

test("RED: failed restoration retains the only backup and reports its recovery path", t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "k3-transaction-"));
  const out = path.join(parent, "claude");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "NOTES.md"), "old\n");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));

  assert.throws(() => runConfigure({ sourceDir: SOURCE, target: "claude", outDir: out, validate: false, operationObserver: event => {
    if (event.operation === "rename" && event.phase === "publish") throw new Error("publish boom");
    if (event.operation === "rename" && event.phase === "restore") throw new Error("restore boom");
  } }), error => error instanceof AggregateError && /retained at/.test(error.message));
  assert.equal(fs.existsSync(out), false);
  assert.equal(siblingArtifacts(parent, "claude").filter(name => name.includes("backup")).length, 1);
  assert.equal(siblingArtifacts(parent, "claude").includes(".claude.configure.lock"), false);
});

test("permanent fault matrix covers prune, mkdir, backup rename, and lock collision without leaking owned stage or lock", t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "k3-fault-matrix-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  for (const [name, setup, fails] of [
    ["prune", out => { fs.mkdirSync(path.join(out, "skills"), { recursive: true }); fs.writeFileSync(path.join(out, "skills", "stale.md"), "stale\n"); }, event => event.operation === "prune"],
    ["mkdir", () => {}, event => event.operation === "mkdir"],
    ["backup", out => { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, "NOTES.md"), "old\n"); }, event => event.operation === "rename" && event.phase === "backup"],
  ]) {
    const out = path.join(parent, name); setup(out); const before = tree(out);
    assert.throws(() => runConfigure({ sourceDir: SOURCE, target: "claude", outDir: out, validate: false, operationObserver: event => { if (fails(event)) throw new Error(`${name} fault`); } }), new RegExp(`${name} fault`));
    assert.deepEqual(tree(out), before, name);
    assert.deepEqual(siblingArtifacts(parent, name), [], name);
  }
  const locked = path.join(parent, "locked");
  fs.writeFileSync(path.join(parent, ".locked.configure.lock"), "stale lock\n");
  assert.throws(() => runConfigure({ sourceDir: SOURCE, target: "claude", outDir: locked, validate: false }), /is locked/);
  assert.equal(fs.existsSync(locked), false);
  assert.deepEqual(siblingArtifacts(parent, "locked"), [".locked.configure.lock"]);
});

test("RED: cleanup failure still attempts later lock cleanup and reports the retained stage path", t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "k3-cleanup-"));
  const out = path.join(parent, "claude");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const seen = [];
  assert.throws(() => runConfigure({ sourceDir: SOURCE, target: "claude", outDir: out, validate: false, operationObserver: event => {
    seen.push(event);
    if (event.operation === "validate") throw new Error("primary failure");
    if (event.operation === "cleanup" && event.path.includes("configure-stage")) throw new Error("cleanup failure");
  } }), /cleanup failure/);
  assert.ok(seen.some(event => event.operation === "cleanup" && typeof event.path === "string" && event.path.endsWith(".configure.lock")));
  assert.equal(siblingArtifacts(parent, "claude").includes(".claude.configure.lock"), false);
});

test("Windows transient rename failures retry with bounded deterministic backoff and converge", t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "k3-retry-converges-"));
  const out = path.join(parent, "codex");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "NOTES.md"), "old\n");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  let attempts = 0;
  const delays = [];

  const result = runConfigure({
    sourceDir: SOURCE,
    target: "codex",
    outDir: out,
    validate: false,
    retryOptions: { sleep: delay => delays.push(delay) },
    operationObserver: event => {
      if (event.operation === "rename" && event.phase === "backup" && attempts++ < 2) {
        const error = new Error("temporarily locked");
        error.code = "EPERM";
        throw error;
      }
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);
  assert.deepEqual(siblingArtifacts(parent, "codex"), []);
});

test("transient publish retries exhaust at the bound and restore the previous destination", t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "k3-retry-exhausted-"));
  const out = path.join(parent, "codex");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "NOTES.md"), "old\n");
  const before = tree(out);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  let attempts = 0;
  const delays = [];

  assert.throws(() => runConfigure({
    sourceDir: SOURCE,
    target: "codex",
    outDir: out,
    validate: false,
    retryOptions: { sleep: delay => delays.push(delay) },
    operationObserver: event => {
      if (event.operation === "rename" && event.phase === "publish") {
        attempts += 1;
        const error = new Error("still locked");
        error.code = "EBUSY";
        throw error;
      }
    },
  }), error => error.code === "EBUSY");

  assert.equal(attempts, 4);
  assert.deepEqual(delays, [10, 20, 30]);
  assert.deepEqual(tree(out), before);
  assert.deepEqual(siblingArtifacts(parent, "codex"), []);
});

test("logical rename errors are not retried", t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "k3-no-logical-retry-"));
  const out = path.join(parent, "codex");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "NOTES.md"), "old\n");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  let attempts = 0;
  const delays = [];

  assert.throws(() => runConfigure({
    sourceDir: SOURCE,
    target: "codex",
    outDir: out,
    validate: false,
    retryOptions: { sleep: delay => delays.push(delay) },
    operationObserver: event => {
      if (event.operation === "rename" && event.phase === "backup") {
        attempts += 1;
        const error = new Error("logical collision");
        error.code = "EEXIST";
        throw error;
      }
    },
  }), error => error.code === "EEXIST");

  assert.equal(attempts, 1);
  assert.deepEqual(delays, []);
});

test("restore and cleanup tolerate transient Windows locks", t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "k3-restore-retry-"));
  const out = path.join(parent, "codex");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "NOTES.md"), "old\n");
  const before = tree(out);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  let restoreAttempts = 0;
  let cleanupAttempts = 0;

  assert.throws(() => runConfigure({
    sourceDir: SOURCE,
    target: "codex",
    outDir: out,
    validate: false,
    retryOptions: { sleep() {} },
    operationObserver: event => {
      if (event.operation === "rename" && event.phase === "publish") {
        const error = new Error("publish failed");
        error.code = "EIO";
        throw error;
      }
      if (event.operation === "rename" && event.phase === "restore" && restoreAttempts++ < 2) {
        const error = new Error("restore locked");
        error.code = "EACCES";
        throw error;
      }
      if (event.operation === "cleanup" && event.path.includes("configure-stage") && cleanupAttempts++ < 1) {
        const error = new Error("cleanup locked");
        error.code = "EPERM";
        throw error;
      }
    },
  }), error => error.code === "EIO");

  assert.equal(restoreAttempts, 3);
  assert.equal(cleanupAttempts, 2);
  assert.deepEqual(tree(out), before);
  assert.deepEqual(siblingArtifacts(parent, "codex"), []);
});

test("transactional publication runs independently for all six configured destinations", t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "k3-six-target-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  for (const target of ["claude", "vscode", "github-copilot", "opencode", "codex", "cursor"]) {
    const out = path.join(parent, target);
    const result = runConfigure({ sourceDir: SOURCE, target, outDir: out, validate: false });
    assert.equal(result.exitCode, 0);
    assert.ok(fs.existsSync(path.join(out, "schemas", "kernel", "candidate", "v2.schema.json")), target);
    assert.ok(fs.existsSync(path.join(out, "scripts", "lib", "execution-identities", "index.js")), target);
  }
});
