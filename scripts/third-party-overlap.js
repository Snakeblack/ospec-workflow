#!/usr/bin/env node
"use strict";

// Measures how much text of a third-party work some files keep: the share of
// their long lines (trimmed, at least --min-length characters) identical to a
// line of any version of that work in its git history. A file the work later
// rewrote or deleted still counts, because a copy may predate the change.
//
// Usage: node scripts/third-party-overlap.js --source <git clone> [--min-length 30]
//          [--ext md,mdx,txt] [--show] [--json] <file or directory>...

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DEFAULT_MIN_LENGTH = 30;
const DEFAULT_EXTENSIONS = Object.freeze(["md", "mdx", "txt"]);
const USAGE =
  "Usage: node scripts/third-party-overlap.js --source <git clone> [--min-length 30] [--ext md,mdx,txt] [--show] [--json] <file or directory>...";

function longLines(text, minLength) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= minLength);
}

function hasExtension(file, extensions) {
  return extensions.includes(path.extname(file).slice(1).toLowerCase());
}

// A named file is measured whatever its extension; a directory contributes
// the files with one of the extensions.
function targetFiles(entries, extensions) {
  const files = [];
  const visit = (entry, named) => {
    if (fs.statSync(entry).isDirectory()) {
      for (const name of fs.readdirSync(entry).sort()) visit(path.join(entry, name), false);
    } else if (named || hasExtension(entry, extensions)) {
      files.push(entry);
    }
  };
  for (const entry of entries) visit(entry, true);
  return files;
}

// A git that exits before reading its input breaks the pipe; its exit code,
// reported on close, is what decides.
function feed(child, input, reject) {
  child.stdin.on("error", (error) => {
    if (error.code !== "EPIPE") reject(error);
  });
  child.stdin.end(input);
}

function git(source, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", source, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(chunks).toString("utf8")) : reject(new Error(`git ${args[0]} failed: ${stderr.trim()}`)),
    );
  });
}

// Every blob reachable from any ref whose path has one of the extensions.
async function historyBlobs(source, extensions) {
  const listing = await git(source, ["rev-list", "--all", "--objects"]);
  const ids = new Set();
  for (const row of listing.split("\n")) {
    const space = row.indexOf(" ");
    if (space > 0 && hasExtension(row.slice(space + 1), extensions)) ids.add(row.slice(0, space));
  }
  return [...ids];
}

// Streams the objects through `git cat-file --batch` and returns the wanted
// lines that appear in any blob, so memory depends on the targets only.
function findInBlobs(source, ids, wanted, minLength) {
  return new Promise((resolve, reject) => {
    const found = new Set();
    const child = spawn("git", ["-C", source, "cat-file", "--batch"], { stdio: ["pipe", "pipe", "pipe"] });
    let pending = Buffer.alloc(0);
    let stderr = "";
    const consume = () => {
      for (;;) {
        const headerEnd = pending.indexOf(10);
        if (headerEnd < 0) return;
        const [, type, sizeText] = pending.subarray(0, headerEnd).toString("utf8").split(" ");
        const size = Number(sizeText);
        if (type === "missing" || !Number.isInteger(size)) {
          pending = pending.subarray(headerEnd + 1);
          continue;
        }
        const end = headerEnd + 1 + size;
        if (pending.length < end + 1) return;
        if (type === "blob") {
          for (const line of longLines(pending.subarray(headerEnd + 1, end).toString("utf8"), minLength)) {
            if (wanted.has(line)) found.add(line);
          }
        }
        pending = pending.subarray(end + 1);
      }
    };
    child.stdout.on("data", (chunk) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      consume();
    });
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(found) : reject(new Error(`git cat-file failed: ${stderr.trim()}`))));
    feed(child, ids.length ? `${ids.join("\n")}\n` : "", reject);
  });
}

async function measure({ source, entries, minLength = DEFAULT_MIN_LENGTH, extensions = DEFAULT_EXTENSIONS }) {
  const files = targetFiles(entries, extensions).map((file) => ({ file, lines: longLines(fs.readFileSync(file, "utf8"), minLength) }));
  const wanted = new Set(files.flatMap((entry) => entry.lines));
  const found = await findInBlobs(source, await historyBlobs(source, extensions), wanted, minLength);
  const results = files.map(({ file, lines }) => {
    const matched = lines.filter((line) => found.has(line));
    return { file, long: lines.length, matched: matched.length, lines: matched };
  });
  const total = {
    long: results.reduce((sum, entry) => sum + entry.long, 0),
    matched: results.reduce((sum, entry) => sum + entry.matched, 0),
  };
  return { min_length: minLength, extensions: [...extensions], files: results, total };
}

function percent(matched, long) {
  return `${long ? ((100 * matched) / long).toFixed(1) : "0.0"} %`;
}

function parseArgs(argv) {
  const options = { entries: [], minLength: DEFAULT_MIN_LENGTH, extensions: [...DEFAULT_EXTENSIONS], show: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") options.source = argv[++index];
    else if (arg === "--min-length") options.minLength = Number(argv[++index]);
    else if (arg === "--ext") {
      options.extensions = String(argv[++index] || "")
        .split(",")
        .map((ext) => ext.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean);
    } else if (arg === "--show") options.show = true;
    else if (arg === "--json") options.json = true;
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else options.entries.push(arg);
  }
  if (!options.source) throw new Error("--source <git clone> is required");
  if (options.entries.length === 0) throw new Error("name at least one file or directory");
  if (!Number.isInteger(options.minLength) || options.minLength < 1) throw new Error("--min-length takes a positive integer");
  if (options.extensions.length === 0) throw new Error("--ext takes at least one extension");
  return options;
}

async function main(argv, out = process.stdout, err = process.stderr) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    err.write(`${error.message}\n${USAGE}\n`);
    return 2;
  }
  let report;
  try {
    report = await measure(options);
  } catch (error) {
    err.write(`${error.message}\n`);
    return 1;
  }
  if (options.json) {
    out.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  for (const entry of report.files) {
    out.write(`${entry.file}: ${entry.matched}/${entry.long} (${percent(entry.matched, entry.long)})\n`);
    if (options.show) for (const line of entry.lines) out.write(`  = ${line}\n`);
  }
  out.write(`total: ${report.total.matched}/${report.total.long} (${percent(report.total.matched, report.total.long)})\n`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}

module.exports = { longLines, measure, parseArgs, main, findInBlobs };
