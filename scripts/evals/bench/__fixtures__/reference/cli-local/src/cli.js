"use strict";

const { storePath, load, save } = require("./store.js");

const USAGE = "uso: tasks add <título> [--priority alta|media|baja] | tasks list | tasks done <id>";
const PRIORITIES = ["alta", "media", "baja"];

function run(argv, { stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  const [command, ...rest] = argv;
  const file = storePath(env);

  if (command === "add") {
    let priority = "media";
    const flag = rest.indexOf("--priority");
    if (flag !== -1) {
      priority = rest[flag + 1];
      rest.splice(flag, 2);
      if (!PRIORITIES.includes(priority)) {
        stderr.write(`prioridad no válida: ${priority}\n${USAGE}\n`);
        return 2;
      }
    }
    const title = rest.join(" ").trim();
    if (!title) {
      stderr.write(`${USAGE}\n`);
      return 2;
    }
    const data = load(file);
    const task = { id: data.nextId, title, done: false, priority };
    data.nextId += 1;
    data.tasks.push(task);
    save(file, data);
    stdout.write(`añadida ${task.id}\n`);
    return 0;
  }

  if (command === "list") {
    const data = load(file);
    const rank = (task) => PRIORITIES.indexOf(task.priority || "media");
    const ordered = data.tasks.map((task, index) => ({ task, index }))
      .sort((a, b) => rank(a.task) - rank(b.task) || a.index - b.index);
    for (const { task } of ordered) {
      stdout.write(`${task.done ? "[x]" : "[ ]"} ${task.id} ${task.title} (${task.priority || "media"})\n`);
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
