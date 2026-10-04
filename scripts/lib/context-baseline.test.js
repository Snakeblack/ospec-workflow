"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  ceilingsFrom,
  findRegressions,
  measureSource,
  measureTarget,
} = require("./context-baseline.js");

const ROOT = path.resolve(__dirname, "..", "..");
const CEILINGS = path.join(ROOT, "scripts", "fixtures", "context-baseline.json");

function file(filePath, content) {
  return { path: filePath, content };
}

function kb(n) {
  return "x".repeat(n);
}

test("counts global rules as always-on and leaves scoped rules out", () => {
  const report = measureTarget([
    file("rules/global.mdc", `---\ndescription: "g"\nalwaysApply: true\n---\n${kb(100)}`),
    file("rules/scoped.mdc", `---\ndescription: "s"\nglobs: ["src/**"]\nalwaysApply: false\n---\n${kb(100)}`),
    file(".github/instructions/all.instructions.md", `---\napplyTo: "**"\n---\n${kb(50)}`),
    file("rules/vs.instructions.md", `---\napplyTo: '**'\n---\n${kb(20)}`),
    file("rules/specs.instructions.md", `---\napplyTo: 'openspec/**'\n---\n${kb(500)}`),
  ]);
  assert.deepEqual(Object.keys(report.always_on_files).sort(), [
    ".github/instructions/all.instructions.md",
    "rules/global.mdc",
    "rules/vs.instructions.md",
  ]);
  assert.equal(report.always_on_bytes, Object.values(report.always_on_files).reduce((a, b) => a + b, 0));
});

test("counts the root AGENTS.md, the Claude router and the opencode.json instruction globs as always-on", () => {
  const codex = measureTarget([
    file("AGENTS.md", kb(300)),
    file("docs/AGENTS.md", kb(10)),
    file("skills/sdd-orchestrator/SKILL.md", kb(60)),
  ]);
  assert.deepEqual(codex.always_on_files, { "AGENTS.md": 300 });
  assert.equal(codex.orchestrator.path, "skills/sdd-orchestrator/SKILL.md");

  // A Claude plugin never loads CLAUDE.md: setup:claude installs the built router (E0.4).
  const claude = measureTarget([file("global-instructions/CLAUDE.md", kb(30)), file("CLAUDE.md", kb(10))]);
  assert.deepEqual(claude.always_on_files, { "global-instructions/CLAUDE.md": 30 });

  const opencode = measureTarget([
    file("opencode.json", JSON.stringify({ instructions: [".opencode/instructions/*.md"] })),
    file(".opencode/instructions/a.md", kb(40)),
    file(".opencode/instructions/nested/b.md", kb(40)),
    file(".opencode/agents/sdd-explore.md", kb(10)),
  ]);
  assert.deepEqual(opencode.always_on_files, { ".opencode/instructions/a.md": 40 });
});

test("measures a CRLF checkout the same as an LF one", () => {
  const lf = `---\nalwaysApply: true\n---\nline\nline\n`;
  const crlf = measureTarget([file("rules/a.mdc", lf.replace(/\n/g, "\r\n"))]);
  assert.deepEqual(crlf.always_on_files, { "rules/a.mdc": Buffer.byteLength(lf) });
});

test("treats a renamed primary agent as the orchestrator, not as a phase agent", () => {
  const report = measureTarget([
    file(".opencode/agents/ospec-workflow.md", `---\nname: ospec-workflow\nmode: primary\n---\n${kb(700)}`),
    file(".opencode/agents/sdd-apply.md", `---\nname: sdd-apply\nmode: subagent\n---\n${kb(70)}`),
  ]);
  assert.equal(report.orchestrator.path, ".opencode/agents/ospec-workflow.md");
  assert.deepEqual(Object.keys(report.agents), ["sdd-apply"]);
});

test("prefers a dedicated orchestrator file and lists only model-invocable skills", () => {
  const report = measureTarget([
    file("AGENTS.md", kb(5)),
    file("agents/sdd-orchestrator.agent.md", `---\nname: sdd-orchestrator\n---\n${kb(900)}`),
    file("skills/tdd/SKILL.md", "---\nname: tdd\ndescription: \"Write tests first.\"\n---\nbody"),
    file("skills/commands/sdd-new/SKILL.md", "---\nname: sdd-new\ndescription: >\n  Start a change.\n---\nbody"),
    file("skills/_shared/SKILL.md", "---\nname: _shared\ndisable-model-invocation: true\n---\nbody"),
  ]);
  assert.equal(report.orchestrator.path, "agents/sdd-orchestrator.agent.md");
  assert.equal(report.skills_installed, 1);
  assert.equal(report.skills_listed, 2);
  const listing = 'name: tdd\ndescription: "Write tests first."' + "name: sdd-new\ndescription: >\n  Start a change.";
  assert.equal(report.skill_listing_bytes, Buffer.byteLength(listing));
});

test("measures each agent with the skill and _shared references it declares", () => {
  const report = measureTarget([
    file(".github/agents/sdd-explore.agent.md", `${kb(10)} read \`skills/sdd-explore/SKILL.md\` and [common](skills/_shared/common.md)`),
    file(".codex/agents/review-risk.toml", `developer_instructions = "read skills/review-risk/SKILL.md"`),
    file("skills/sdd-explore/SKILL.md", `${kb(100)} follow skills/_shared/convention.md and skills/_shared/common.md`),
    file("skills/review-risk/SKILL.md", `${kb(30)} see _shared/judgment.md and skills/_shared/gone.md`),
    file("skills/_shared/common.md", `${kb(1000)} see skills/_shared/unrelated.md`),
    file("skills/_shared/convention.md", kb(2000)),
    file("skills/_shared/judgment.md", kb(400)),
    file("skills/_shared/unrelated.md", kb(5000)),
  ]);
  const explore = report.agents["sdd-explore"];
  assert.deepEqual(Object.keys(explore.reads), [
    "skills/_shared/common.md",
    "skills/_shared/convention.md",
    "skills/sdd-explore/SKILL.md",
  ]);
  assert.equal(explore.reads["skills/_shared/convention.md"], 2000);
  assert.equal(explore.read_bytes, Object.values(explore.reads).reduce((a, b) => a + b, explore.agent_bytes));
  assert.deepEqual(explore.missing, []);
  assert.deepEqual(report.agents["review-risk"].missing, ["skills/_shared/gone.md"]);
  assert.ok(report.agents["review-risk"].reads["skills/_shared/judgment.md"]);
});

test("counts embedded references in the agent's bytes without following what they name", () => {
  const agent = `${kb(10)} read «sdd-apply»\n\n## Embedded references\n\n### «sdd-apply»\n\n${kb(100)} see \`_shared/deep.md\` (installed ospec skills, not this project)\n`;
  const report = measureTarget([
    file("agents/sdd-apply.md", agent),
    file("skills/_shared/deep.md", kb(5000)),
  ]);
  const apply = report.agents["sdd-apply"];
  assert.deepEqual(apply.reads, {});
  assert.equal(apply.read_bytes, apply.agent_bytes);
});

test("flags any metric above its ceiling and any metric without one", () => {
  const report = {
    targets: {
      cursor: {
        always_on_bytes: 101, orchestrator: { bytes: 50 }, skills_installed: 2, skills_listed: 3, skill_listing_bytes: 10,
        agents: { "sdd-explore": { read_bytes: 70 }, "sdd-new": { read_bytes: 5 } },
      },
      fresh: { always_on_bytes: 0, orchestrator: { bytes: 0 }, skills_installed: 0, skills_listed: 0, skill_listing_bytes: 0, agents: {} },
    },
  };
  const ceilings = ceilingsFrom(report);
  assert.deepEqual(findRegressions(report, ceilings), []);

  ceilings.targets.cursor.always_on_bytes = 100;
  ceilings.targets.cursor.agent_read_bytes["sdd-explore"] = 80;
  delete ceilings.targets.cursor.agent_read_bytes["sdd-new"];
  delete ceilings.targets.fresh;
  assert.deepEqual(findRegressions(report, ceilings), [
    { target: "cursor", metric: "always_on_bytes", value: 101, ceiling: 100 },
    { target: "cursor", metric: "agent_read_bytes.sdd-new", value: 5, ceiling: null },
    { target: "fresh", metric: "target", value: null, ceiling: null },
  ]);
});

test("the generated targets stay within the versioned context ceilings", () => {
  const report = measureSource(ROOT);
  assert.deepEqual(Object.keys(report.targets).sort(), [
    "antigravity", "claude", "codex", "cursor", "github-copilot", "opencode", "vscode",
  ]);
  const ceilings = JSON.parse(fs.readFileSync(CEILINGS, "utf8"));
  const regressions = findRegressions(report, ceilings);
  assert.deepEqual(regressions, [], "context grew; reduce it or run `node scripts/measure-context-baseline.js --update` with a justification in the PR");
});
