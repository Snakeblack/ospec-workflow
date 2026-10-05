"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function storePath(env = process.env) {
  return env.TASKS_FILE || path.join(os.homedir(), ".tasks.json");
}

function load(file) {
  if (!fs.existsSync(file)) return { nextId: 1, tasks: [] };
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function save(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

module.exports = { storePath, load, save };
