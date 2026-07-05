"use strict";

// Static contract test for the harden-archive-move-fingerprints change.
//
// Anchors two agent-instruction prose contracts as load-bearing strings so
// drift fails `npm test` instead of silently regressing:
//
// 1. Archive-move contract (REQ-agents-008): the orchestrator — never the
//    `sdd-archive` executor — verifies destination-vs-source inventory before
//    deleting the source change folder. `gate-archive-quality.md` carries the
//    orchestrator-side verification-before-delete / halt-with-source-intact
//    protocol; `sdd-archive/SKILL.md` Step 5 is scoped to copy + report-only
//    and must NOT instruct the executor to delete the source folder.
// 2. Fingerprint-ownership contract (REQ-agents-009): `sdd-spec` declares
//    touched baseline domains only (never computes/writes the SHA-256);
//    the orchestrator owns the standing post-`sdd-spec` computation step.
//
// This test is fully static: no LLM invocation, no sub-agent execution.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

test("archive-move contract: orchestrator verifies inventory before delete; executor never deletes/claims moved", () => {
  const gateArchiveQualityPath = path.join(ROOT, "skills", "_shared", "gate-archive-quality.md");
  const sddArchiveSkillPath = path.join(ROOT, "skills", "sdd-archive", "SKILL.md");

  assert.ok(fs.existsSync(gateArchiveQualityPath), "skills/_shared/gate-archive-quality.md must exist");
  assert.ok(fs.existsSync(sddArchiveSkillPath), "skills/sdd-archive/SKILL.md must exist");

  const gateText = fs.readFileSync(gateArchiveQualityPath, "utf8");
  const skillText = fs.readFileSync(sddArchiveSkillPath, "utf8");

  assert.match(
    gateText,
    /recursively diff the destination/,
    "gate-archive-quality.md must document the orchestrator recursively diffing the destination inventory against the source"
  );
  assert.match(
    gateText,
    /halt with the source directory left intact/,
    "gate-archive-quality.md must document halting with the source directory left intact on mismatch/copy failure"
  );

  assert.match(
    skillText,
    /copy inventory/,
    "sdd-archive/SKILL.md Step 5 must require the executor to report a copy inventory list"
  );
  assert.match(
    skillText,
    /MUST NOT[\s\S]{0,120}delete the source/,
    "sdd-archive/SKILL.md Step 5 must forbid the executor from deleting the source directory"
  );
  assert.doesNotMatch(
    skillText,
    /then delete the source folder/,
    "sdd-archive/SKILL.md must NOT instruct the executor to delete the source folder (that is now the orchestrator's responsibility)"
  );
});

test("fingerprint-ownership contract: sdd-spec declares touched domains only; orchestrator computes and writes baseline_fingerprints", () => {
  const sddSpecSkillPath = path.join(ROOT, "skills", "sdd-spec", "SKILL.md");
  const orchestratorPath = path.join(ROOT, "agents", "sdd-orchestrator.agent.md");

  assert.ok(fs.existsSync(sddSpecSkillPath), "skills/sdd-spec/SKILL.md must exist");
  assert.ok(fs.existsSync(orchestratorPath), "agents/sdd-orchestrator.agent.md must exist");

  const sddSpecText = fs.readFileSync(sddSpecSkillPath, "utf8");
  const orchestratorText = fs.readFileSync(orchestratorPath, "utf8");

  assert.match(
    sddSpecText,
    /touched_baseline_domains/,
    "sdd-spec/SKILL.md Step 5b must declare touched domains under touched_baseline_domains"
  );
  assert.doesNotMatch(
    sddSpecText,
    /record in `state\.yaml` the SHA-256/,
    "sdd-spec/SKILL.md must NOT instruct sdd-spec to compute/write a SHA-256 value itself"
  );

  assert.match(
    orchestratorText,
    /touched_baseline_domains/,
    "orchestrator body must reference touched_baseline_domains in its standing fingerprint-computation block"
  );
  assert.match(
    orchestratorText,
    /baseline_fingerprints/,
    "orchestrator body must reference baseline_fingerprints in its standing fingerprint-computation block"
  );
});
