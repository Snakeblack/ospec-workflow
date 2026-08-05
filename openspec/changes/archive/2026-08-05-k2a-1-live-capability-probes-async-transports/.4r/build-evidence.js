"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { normalizeReviewEvidence } = require("../../../../scripts/lib/review-dimensions.js");

const outDir = __dirname;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  return r.stdout || "";
}

const tracked = run("git", [
  "diff",
  "main",
  "--",
  "schemas/kernel",
  "scripts/lib",
  "openspec/memory/known-issues.md",
]);

const status = run("git", ["status", "--porcelain", "-u"]);
const untracked = [];
for (const line of status.split(/\r?\n/)) {
  if (!line.startsWith("?? ")) continue;
  let p = line.slice(3).trim().replace(/\\/g, "/");
  if (p.endsWith("/")) {
    const walk = (d) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const fp = path.join(d, ent.name).replace(/\\/g, "/");
        if (ent.isDirectory()) walk(fp);
        else if (fp.startsWith("schemas/kernel/transport-")) untracked.push(fp);
      }
    };
    walk(p.replace(/\/$/, ""));
  } else if (p.startsWith("schemas/kernel/transport-")) {
    untracked.push(p);
  }
}

function synthNewFile(filePath) {
  const body = fs.readFileSync(filePath, "utf8");
  const contentLines = body.endsWith("\n") ? body.slice(0, -1).split("\n") : body.split("\n");
  const n = contentLines.length;
  let out = `diff --git a/${filePath} b/${filePath}\n`;
  out += "new file mode 100644\n";
  out += `index 0000000..${crypto.createHash("sha1").update(body).digest("hex").slice(0, 7)}\n`;
  out += `--- /dev/null\n+++ b/${filePath}\n`;
  out += `@@ -0,0 +1,${n} @@\n`;
  for (const l of contentLines) out += `+${l}\n`;
  return out;
}

let synth = "";
for (const p of [...new Set(untracked)].sort()) synth += synthNewFile(p);
const unified = tracked + (tracked && !tracked.endsWith("\n") ? "\n" : "") + synth;
fs.writeFileSync(path.join(outDir, "diff.unified.patch"), unified);

const paths = [...new Set([...unified.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]))].sort();
const plus = (unified.match(/^\+[^+]/gm) || []).length;
const minus = (unified.match(/^-[^-]/gm) || []).length;
const newPaths = new Set(untracked);
const hasNew = paths.some((p) => newPaths.has(p));
const hasMod = paths.some((p) => !newPaths.has(p));

const input = {
  classification: "high-risk",
  verify: {
    status: "success",
    findings: [
      {
        severity: "WARNING",
        code: "verify-reliability",
        detail:
          "observeHostPort success path compares equality across runs without asserting ok===true",
      },
    ],
  },
  paths,
  capabilities: [
    "capability-proof",
    "host-adapters",
    "host-contract",
    "headless-conformance",
    "lifecycle-kernel",
    "kernel-schemas",
    "runtime",
  ],
  dependencies: ["lifecycle-kernel", "host-contract"],
  operationTypes: hasNew && hasMod ? ["add", "modify"] : hasNew ? ["add"] : ["modify"],
  designRisks: [
    { code: "design-risk", detail: "live-identity-binding for CapabilityProof" },
    { code: "design-risk", detail: "async-rejection-handling on transport ports" },
    { code: "design-risk", detail: "enforced-without-probe gate for Claude adapter" },
  ],
  diff: unified,
};

const normalized = normalizeReviewEvidence(input);
fs.writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(normalized, null, 2));
fs.writeFileSync(path.join(outDir, "paths.json"), JSON.stringify(paths, null, 2));
fs.writeFileSync(
  path.join(outDir, "meta.json"),
  JSON.stringify(
    {
      plus,
      minus,
      changed: plus + minus,
      path_count: paths.length,
      untracked: untracked.length,
      head: run("git", ["rev-parse", "HEAD"]).trim(),
      branch: run("git", ["branch", "--show-current"]).trim(),
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      fingerprint: normalized.fingerprint,
      facts: normalized.sources.facts.map((f) => f.code),
      plus,
      minus,
      changed: plus + minus,
      paths: paths.length,
      untracked: untracked.length,
      sample_paths: paths.slice(0, 8),
    },
    null,
    2
  )
);
