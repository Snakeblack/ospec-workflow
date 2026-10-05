"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { run } = require("../src/cli.js");

function session() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tasks-"));
  const env = { TASKS_FILE: path.join(dir, "tasks.json") };
  return (...argv) => {
    let out = "";
    let err = "";
    const status = run(argv, {
      env,
      stdout: { write: (text) => { out += text; } },
      stderr: { write: (text) => { err += text; } },
    });
    return { status, out, err };
  };
}

test("add and list keep insertion order", () => {
  const tasks = session();
  assert.equal(tasks("add", "comprar", "pan").status, 0);
  assert.equal(tasks("add", "llamar").status, 0);
  assert.equal(tasks("list").out, "[ ] 1 comprar pan\n[ ] 2 llamar\n");
});

test("done marks a task", () => {
  const tasks = session();
  tasks("add", "regar");
  assert.equal(tasks("done", "1").status, 0);
  assert.equal(tasks("list").out, "[x] 1 regar\n");
});

test("unknown task and usage errors", () => {
  const tasks = session();
  assert.equal(tasks("done", "9").status, 1);
  assert.equal(tasks("add").status, 2);
  assert.equal(tasks("borrar").status, 2);
});
