"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { normalizeReviewEvidence } = require("../../../../scripts/lib/review-dimensions.js");

const ROOT = path.resolve(__dirname, "../../../..");
const OUT = path.join(__dirname, "working.diff");

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return result;
}

function listUntracked() {
  const result = git(["ls-files", "--others", "--exclude-standard"]);
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

function syntheticNewFile(relPath) {
  const abs = path.join(ROOT, relPath);
  const posix = relPath.replaceAll("\\", "/");
  if (posix.endsWith(".4r/working.diff") || posix.endsWith(".4r/build-diff.js") || posix.endsWith(".4r/evidence.json")) {
    return "";
  }
  if (!fs.statSync(abs).isFile()) return "";
  const raw = fs.readFileSync(abs, "utf8");
  const lines = raw.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const body = lines.map((line) => `+${line}`).join("\n");
  const count = lines.length;
  if (count === 0) {
    return [
      `diff --git a/${posix} b/${posix}`,
      "new file mode 100644",
      "index 0000000..e69de29",
      "",
    ].join("\n");
  }
  return [
    `diff --git a/${posix} b/${posix}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${posix}`,
    `@@ -0,0 +1,${count} @@`,
    body,
    "",
  ].join("\n");
}

const tracked = git(["diff", "--no-color", "HEAD"]);
if (tracked.status !== 0 && tracked.stderr) {
  console.error(tracked.stderr);
  process.exit(1);
}

let diff = tracked.stdout.replace(/\r\n/g, "\n");
if (diff && !diff.endsWith("\n")) diff += "\n";

for (const file of listUntracked()) {
  diff += syntheticNewFile(file);
}

fs.writeFileSync(OUT, diff, "utf8");

const paths = [];
const re = /^diff --git a\/(.+) b\/(.+)$/gm;
let match;
while ((match = re.exec(diff))) paths.push(match[2]);

const evidence = normalizeReviewEvidence({
  classification: "high-risk",
  verify: { status: "success", findings: [] },
  diff,
  paths,
  capabilities: ["runtime"],
  dependencies: [],
  operationTypes: ["add", "modify"],
  designRisks: [{ code: "design-risk", detail: "Independent verifier and Assurance Graph are kernel public contracts" }],
});

fs.writeFileSync(path.join(__dirname, "evidence.json"), JSON.stringify({
  fingerprint: evidence.fingerprint,
  pathCount: paths.length,
  paths,
  facts: evidence.sources.facts,
}, null, 2));

console.log(JSON.stringify({
  bytes: Buffer.byteLength(diff),
  files: paths.length,
  fingerprint: evidence.fingerprint,
  factCodes: [...new Set(evidence.sources.facts.map((f) => f.code))],
}, null, 2));
