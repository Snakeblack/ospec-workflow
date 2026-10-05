"use strict";

// Hidden checks for cli-local. They never enter the agent's workspace.

const path = require("node:path");

function cli(kit) {
  const file = path.join(kit.tempDir(), "tasks.json");
  const call = (...args) => kit.node(["bin/tasks.js", ...args], { env: { TASKS_FILE: file } });
  return { file, call };
}

function titles(stdout) {
  return stdout.split("\n").filter(Boolean).map((line) => line.replace(/^\[[ x]\] \d+ /, "").split(/\s+/)[0]);
}

module.exports = [
  {
    id: "priority-order",
    kind: "acceptance",
    describe: "list shows higher priorities first",
    run(kit) {
      const { call } = cli(kit);
      kit.assert.equal(call("add", "bajo", "--priority", "baja").status, 0);
      kit.assert.equal(call("add", "alto", "--priority", "alta").status, 0);
      kit.assert.equal(call("add", "medio", "--priority", "media").status, 0);
      const list = call("list");
      kit.assert.equal(list.status, 0);
      kit.assert.deepEqual(titles(list.stdout), ["alto", "medio", "bajo"]);
    },
  },
  {
    id: "default-media",
    kind: "fact",
    fact: "F1",
    describe: "a task without --priority sorts as media",
    run(kit) {
      const { call } = cli(kit);
      call("add", "bajo", "--priority", "baja");
      call("add", "normal");
      call("add", "alto", "--priority", "alta");
      kit.assert.deepEqual(titles(call("list").stdout), ["alto", "normal", "bajo"]);
    },
  },
  {
    id: "invalid-priority",
    kind: "fact",
    fact: "F2",
    describe: "an unknown priority exits 2, writes stderr, and saves nothing",
    run(kit) {
      const { call } = cli(kit);
      call("add", "previa");
      const bad = call("add", "urgente", "--priority", "urgente");
      kit.assert.equal(bad.status, 2);
      kit.assert.notEqual(bad.stderr.trim(), "");
      kit.assert.deepEqual(titles(call("list").stdout), ["previa"]);
    },
  },
  {
    id: "legacy-file",
    kind: "fact",
    fact: "F3",
    describe: "tasks stored without priority list as media",
    run(kit) {
      const { file, call } = cli(kit);
      kit.writeJson(file, {
        nextId: 3,
        tasks: [{ id: 1, title: "vieja1", done: false }, { id: 2, title: "vieja2", done: false }],
      });
      call("add", "nueva", "--priority", "alta");
      call("add", "luego", "--priority", "baja");
      const list = call("list");
      kit.assert.equal(list.status, 0);
      kit.assert.deepEqual(titles(list.stdout), ["nueva", "vieja1", "vieja2", "luego"]);
    },
  },
  {
    id: "stable-ties",
    kind: "fact",
    fact: "F4",
    describe: "equal priorities keep creation order",
    run(kit) {
      const { call } = cli(kit);
      for (const title of ["uno", "dos", "tres"]) call("add", title, "--priority", "alta");
      kit.assert.deepEqual(titles(call("list").stdout), ["uno", "dos", "tres"]);
    },
  },
  {
    id: "line-prefix",
    kind: "fact",
    fact: "F5",
    describe: "each list line still starts with the status, id, and title",
    run(kit) {
      const { call } = cli(kit);
      call("add", "Comprar", "pan", "--priority", "alta");
      call("add", "Llamar");
      const lines = call("list").stdout.split("\n").filter(Boolean);
      kit.assert.match(lines[0], /^\[ \] 1 Comprar pan\b/);
      kit.assert.match(lines[1], /^\[ \] 2 Llamar\b/);
    },
  },
  {
    id: "done-still-works",
    kind: "regression",
    describe: "done keeps working and the title keeps every word",
    run(kit) {
      const { call } = cli(kit);
      call("add", "regar", "las", "plantas");
      kit.assert.equal(call("done", "1").status, 0);
      kit.assert.match(call("list").stdout, /^\[x\] 1 regar las plantas\b/);
      kit.assert.equal(call("done", "7").status, 1);
    },
  },
  {
    id: "suite",
    kind: "regression",
    describe: "the project's own test suite passes",
    run(kit) {
      const result = kit.node(["--test"]);
      kit.assert.equal(result.status, 0, result.stdout + result.stderr);
    },
  },
];
