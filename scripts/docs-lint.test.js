"use strict";

// Content lint: YAML forbids tabs for indentation, so a ```yaml fenced example
// that uses tabs is invalid and misleads anyone who copies it. Scan every source
// markdown file (the generated dist/ tree is excluded — it mirrors source).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);

function markdownFiles(dir = ROOT, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        markdownFiles(path.join(dir, entry.name), acc);
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

function yamlFenceTabLines(text) {
  const lines = text.split(/\r?\n/);
  const offenders = [];
  let inYaml = false;
  for (let i = 0; i < lines.length; i += 1) {
    const fence = lines[i].match(/^\s*```\s*(\w+)?/);
    if (fence) {
      inYaml = !inYaml && (fence[1] || "").toLowerCase() === "yaml" ? true : false;
      continue;
    }
    if (inYaml && lines[i].includes("\t")) {
      offenders.push(i + 1);
    }
  }
  return offenders;
}

test("no ```yaml fenced example uses tabs for indentation", () => {
  const problems = [];
  for (const file of markdownFiles()) {
    const offenders = yamlFenceTabLines(fs.readFileSync(file, "utf8"));
    if (offenders.length > 0) {
      problems.push(`${path.relative(ROOT, file)}: lines ${offenders.join(", ")}`);
    }
  }
  assert.deepEqual(problems, [], `tabs in yaml fences:\n${problems.join("\n")}`);
});
