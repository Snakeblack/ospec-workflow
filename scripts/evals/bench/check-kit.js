"use strict";

// Helpers handed to every hidden check. A check runs in its own Node process
// (check-runner.js) against the delivered workspace, so module state never
// leaks between checks.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// RFC 4180: quoted fields may hold commas, line breaks, and doubled quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === "\"" && text[i + 1] === "\"") { field += "\""; i += 1; }
      else if (char === "\"") quoted = false;
      else field += char;
    } else if (char === "\"") quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function createKit(root) {
  const temps = [];
  return {
    root,
    assert,
    parseCsv,
    node(args, { env = {} } = {}) {
      const result = spawnSync(process.execPath, args, {
        cwd: root,
        env: { ...process.env, ...env },
        encoding: "utf8",
        timeout: 120000,
      });
      return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
    },
    tempDir() {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-check-"));
      temps.push(dir);
      return dir;
    },
    load(relative) {
      const full = path.join(root, relative);
      for (const key of Object.keys(require.cache)) {
        if (key.startsWith(root)) delete require.cache[key];
      }
      return require(full);
    },
    read(relative) {
      return fs.readFileSync(path.join(root, relative), "utf8");
    },
    writeJson(file, value) {
      fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
    },
    cleanup() {
      for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

module.exports = { createKit, parseCsv };
