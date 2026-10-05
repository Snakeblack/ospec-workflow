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
    const status = run(argv, { env, stdout: { write: (text) => { out += text; } }, stderr: { write() {} } });
    return { status, out };
  };
}

test("add and list keep insertion order at equal priority", () => {
  const tasks = session();
  tasks("add", "comprar", "pan");
  tasks("add", "llamar");
  assert.equal(tasks("list").out, "[ ] 1 comprar pan (media)\n[ ] 2 llamar (media)\n");
});

test("priorities sort the list", () => {
  const tasks = session();
  tasks("add", "b", "--priority", "baja");
  tasks("add", "a", "--priority", "alta");
  assert.equal(tasks("list").out, "[ ] 2 a (alta)\n[ ] 1 b (baja)\n");
  assert.equal(tasks("add", "x", "--priority", "urgente").status, 2);
});
