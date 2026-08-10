"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Phase 10: k3-readiness-remediation state.yaml and archive-report.md have terminal archived status", () => {
  const archivedFolder = path.resolve(__dirname, "../../openspec/changes/archive/2026-08-10-k3-readiness-remediation");
  assert.equal(fs.existsSync(archivedFolder), true, "Archived folder must exist");

  const statePath = path.join(archivedFolder, "state.yaml");
  const stateContent = fs.readFileSync(statePath, "utf8");

  assert.match(stateContent, /^status:\s*archived$/m, "Archived change state.yaml must report top-level status: archived");
  assert.match(stateContent, /archive:\s*\r?\n\s*status:\s*done/m, "Archived change state.yaml must report archive status: done");

  const archiveReportPath = path.join(archivedFolder, "archive-report.md");
  const reportContent = fs.readFileSync(archiveReportPath, "utf8");
  assert.match(reportContent, /\*\*Status\*\*:\s*Completed/m, "Archived change archive-report.md must report Status: Completed");
});

test("Phase 10: roadmap evolution docs reflect reconciled k3-readiness-remediation and K4a next-eligible status", () => {
  const archDoc = fs.readFileSync(path.resolve(__dirname, "../../docs/architecture/harness-evolution.md"), "utf8");
  const roadmapDoc = fs.readFileSync(path.resolve(__dirname, "../../docs/roadmaps/harness-evolution.md"), "utf8");

  assert.equal(archDoc.includes("`k3-readiness-remediation` debe verificar y archivarse"), false, "Architecture doc must not report stale k3-readiness-remediation requirement");
  assert.equal(roadmapDoc.includes("| `blocked` | **K4a** |"), false, "Roadmap doc must not report K4a as blocked by k3-readiness-remediation");
  assert.match(roadmapDoc, /\| `next-eligible` \| \*\*K4a\*\* \|/m, "Roadmap doc must report K4a as next-eligible");
});
