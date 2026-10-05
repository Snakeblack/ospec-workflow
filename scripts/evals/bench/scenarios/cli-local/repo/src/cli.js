"use strict";

const { storePath, load, save } = require("./store.js");

const USAGE = "uso: tasks add <título> | tasks list | tasks done <id>";

// Exit codes: 0 ok, 1 the task does not exist, 2 usage error.
function run(argv, { stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  const [command, ...rest] = argv;
  const file = storePath(env);

  if (command === "add") {
    const title = rest.join(" ").trim();
    if (!title) {
      stderr.write(`${USAGE}\n`);
      return 2;
    }
    const data = load(file);
    const task = { id: data.nextId, title, done: false };
    data.nextId += 1;
    data.tasks.push(task);
    save(file, data);
    stdout.write(`añadida ${task.id}\n`);
    return 0;
  }

  if (command === "list") {
    const data = load(file);
    for (const task of data.tasks) {
      stdout.write(`${task.done ? "[x]" : "[ ]"} ${task.id} ${task.title}\n`);
    }
    return 0;
  }

  if (command === "done") {
    const id = Number(rest[0]);
    const data = load(file);
    const task = data.tasks.find((item) => item.id === id);
    if (!task) {
      stderr.write(`no existe la tarea ${rest[0]}\n`);
      return 1;
    }
    task.done = true;
    save(file, data);
    stdout.write(`completada ${task.id}\n`);
    return 0;
  }

  stderr.write(`${USAGE}\n`);
  return 2;
}

module.exports = { run, USAGE };
