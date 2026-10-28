"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  BUDGET_SCHEMA,
  CEILING_METRICS,
  ceilingsFrom,
  findRegressions,
  measureSource,
  measureTarget,
  updateCeilings,
} = require("./context-baseline.js");

const ROOT = path.resolve(__dirname, "..", "..");
const CEILINGS = path.join(ROOT, "scripts", "fixtures", "context-baseline.json");
const BUDGET = path.join(ROOT, "scripts", "fixtures", "context-budget.json");

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

test("measures router plus the IDD protocol, alone and with the memory loop it reads on demand", () => {
  const report = measureTarget([
    file("AGENTS.md", kb(300)),
    file("skills/idd/SKILL.md", kb(1000)),
    file("skills/idd/references/memory-loop.md", kb(200)),
    file("skills/idd/references/repository.md", kb(5000)),
  ]);
  assert.equal(report.idd_protocol_bytes, 1000);
  assert.equal(report.default_flow_bytes, 1300);
  assert.equal(report.memory_flow_bytes, 1500);

  const bare = measureTarget([file("AGENTS.md", kb(300))]);
  assert.deepEqual([bare.idd_protocol_bytes, bare.default_flow_bytes, bare.memory_flow_bytes], [0, 300, 300]);
});

function measured(alwaysOn, agents, extra = {}) {
  return {
    always_on_bytes: alwaysOn, orchestrator: { bytes: 0 }, skills_installed: 2, skills_listed: 3, skill_listing_bytes: 10,
    idd_protocol_bytes: 1000, default_flow_bytes: alwaysOn + 1000, memory_flow_bytes: alwaysOn + 1200,
    agents: Object.fromEntries(Object.entries(agents).map(([name, readBytes]) => [name, { read_bytes: readBytes }])),
    ...extra,
  };
}

test("flags a metric above its ceiling, without one, or below it, and a ceiling nothing measures", () => {
  const report = { targets: { cursor: measured(101, { "sdd-explore": 70, "sdd-new": 5 }), fresh: measured(0, {}) } };
  const ceilings = ceilingsFrom(report);
  assert.deepEqual(findRegressions(report, ceilings), []);

  ceilings.targets.cursor.always_on_bytes = 100;
  ceilings.targets.cursor.agent_read_bytes["sdd-explore"] = 80;
  ceilings.targets.cursor.agent_read_bytes["sdd-gone"] = 9;
  delete ceilings.targets.cursor.agent_read_bytes["sdd-new"];
  ceilings.targets.retired = ceilings.targets.fresh;
  delete ceilings.targets.fresh;
  assert.deepEqual(findRegressions(report, ceilings), [
    { kind: "over", target: "cursor", metric: "always_on_bytes", value: 101, ceiling: 100 },
    { kind: "slack", target: "cursor", metric: "agent_read_bytes.sdd-explore", value: 70, ceiling: 80 },
    { kind: "missing", target: "cursor", metric: "agent_read_bytes.sdd-new", value: 5, ceiling: null },
    { kind: "slack", target: "cursor", metric: "agent_read_bytes.sdd-gone", value: null, ceiling: 9 },
    { kind: "missing", target: "fresh", metric: "target", value: null, ceiling: null },
    { kind: "slack", target: "retired", metric: "target", value: null, ceiling: null },
  ]);
});

test("flags every value above the absolute budget, with agent_read_bytes applying to each agent", () => {
  const report = { targets: { codex: measured(4097, { "review-trust": 16001, "review-change": 4000 }) } };
  const budget = { schema: BUDGET_SCHEMA, limits: { always_on_bytes: 4096, default_flow_bytes: 6000, agent_read_bytes: 16000 } };
  assert.deepEqual(findRegressions(report, ceilingsFrom(report), budget), [
    { kind: "budget", target: "codex", metric: "always_on_bytes", value: 4097, ceiling: 4096 },
    { kind: "budget", target: "codex", metric: "agent_read_bytes.review-trust", value: 16001, ceiling: 16000 },
  ]);
});

test("--update lowers ceilings freely and refuses a rise, a new agent or a new target without a grant", () => {
  const previous = ceilingsFrom({ targets: { claude: measured(3400, { "review-trust": 14000 }) } });
  const report = { targets: { claude: measured(3300, { "review-trust": 14100, "review-new": 10 }), codex: measured(3000, {}) } };
  const refused = updateCeilings(report, previous, { version: "2.163.0" });
  assert.equal(refused.ceilings, undefined);
  assert.deepEqual(refused.ungranted.map(({ metric }) => metric), [
    "agent_read_bytes.review-trust", "agent_read_bytes.review-new",
    ...CEILING_METRICS,
  ]);
  assert.deepEqual(refused.ungranted[0].targets, { claude: [14000, 14100] });
  assert.deepEqual(refused.ungranted[1].targets, { claude: [null, 10] });
  assert.deepEqual(refused.ungranted[2].targets, { codex: [null, 3000] });

  const lower = updateCeilings({ targets: { claude: measured(3300, { "review-trust": 13900 }) } }, previous, { version: "2.163.0" });
  assert.equal(lower.ceilings.targets.claude.always_on_bytes, 3300);
  assert.equal(lower.ceilings.targets.claude.agent_read_bytes["review-trust"], 13900);
  assert.equal(lower.ceilings.growth, undefined);
});

test("--update writes each granted rise, with its reason, after the growth already recorded", () => {
  const previous = {
    ...ceilingsFrom({ targets: { claude: measured(3400, { "review-trust": 14000 }), codex: measured(3400, { "review-trust": 14000 }) } }),
    growth: [{ version: "2.100.0", metric: "always_on_bytes", targets: { claude: [3300, 3400] }, reason: "router" }],
  };
  const report = { targets: { claude: measured(3400, { "review-trust": 14100 }), codex: measured(3400, { "review-trust": 14050 }) } };
  const grants = [{ metric: "agent_read_bytes.review-trust", reason: "the trust lens names a new check" }];
  const { ceilings } = updateCeilings(report, previous, { grants, version: "2.163.0" });
  assert.equal(ceilings.targets.codex.agent_read_bytes["review-trust"], 14050);
  assert.deepEqual(ceilings.growth, [
    previous.growth[0],
    { version: "2.163.0", metric: "agent_read_bytes.review-trust", targets: { claude: [14000, 14100], codex: [14000, 14050] }, reason: "the trust lens names a new check" },
  ]);
});

test("--update reads ceilings written before E4.3, without growth or the default-flow metrics", () => {
  const previous = ceilingsFrom({ targets: { claude: measured(3400, { "review-trust": 14000 }) } });
  for (const metric of ["idd_protocol_bytes", "default_flow_bytes", "memory_flow_bytes"]) delete previous.targets.claude[metric];
  const report = { targets: { claude: measured(3400, { "review-trust": 14000 }) } };
  assert.deepEqual(findRegressions(report, previous).map(({ kind, metric }) => `${kind} ${metric}`), [
    "missing idd_protocol_bytes", "missing default_flow_bytes", "missing memory_flow_bytes",
  ]);
  const refused = updateCeilings(report, previous, { version: "2.163.0" });
  assert.deepEqual(refused.ungranted.map(({ metric }) => metric), ["idd_protocol_bytes", "default_flow_bytes", "memory_flow_bytes"]);
  const grants = refused.ungranted.map(({ metric }) => ({ metric, reason: "E4.3" }));
  const { ceilings } = updateCeilings(report, previous, { grants, version: "2.163.0" });
  assert.equal(ceilings.schema, "ospec-context-baseline/v1");
  assert.equal(ceilings.targets.claude.agent_read_bytes["review-trust"], 14000);
  assert.deepEqual(ceilings.growth.map(({ metric, targets }) => [metric, targets.claude[0]]), [
    ["idd_protocol_bytes", null], ["default_flow_bytes", null], ["memory_flow_bytes", null],
  ]);
});

test("--update reports a grant for a metric that does not rise", () => {
  const previous = ceilingsFrom({ targets: { claude: measured(3400, {}) } });
  const result = updateCeilings({ targets: { claude: measured(3400, {}) } }, previous, {
    grants: [{ metric: "always_on_bytes", reason: "router" }], version: "2.163.0",
  });
  assert.equal(result.ceilings, undefined);
  assert.deepEqual(result.unused, ["always_on_bytes"]);
});

test("--update writes nothing above the absolute budget, even with a grant", () => {
  const previous = ceilingsFrom({ targets: { claude: measured(3400, {}) } });
  const budget = { schema: BUDGET_SCHEMA, limits: { always_on_bytes: 4096 } };
  const result = updateCeilings({ targets: { claude: measured(4100, {}) } }, previous, {
    grants: [{ metric: "always_on_bytes", reason: "router" }], budget, version: "2.163.0",
  });
  assert.equal(result.ceilings, undefined);
  assert.deepEqual(result.overBudget, [{ kind: "budget", target: "claude", metric: "always_on_bytes", value: 4100, ceiling: 4096 }]);
});

test("the generated targets stay within the versioned context ceilings", () => {
  const report = measureSource(ROOT);
  assert.deepEqual(Object.keys(report.targets).sort(), [
    "antigravity", "claude", "codex", "cursor", "github-copilot", "opencode", "vscode",
  ]);
  const ceilings = JSON.parse(fs.readFileSync(CEILINGS, "utf8"));
  const budget = JSON.parse(fs.readFileSync(BUDGET, "utf8"));
  assert.equal(budget.schema, BUDGET_SCHEMA);
  for (const metric of Object.keys(budget.limits)) {
    assert.ok([...CEILING_METRICS, "agent_read_bytes"].includes(metric), `${metric}: the budget names no measured metric`);
  }
  const regressions = findRegressions(report, ceilings, budget);
  assert.deepEqual(regressions, [], "context changed; run `node scripts/measure-context-baseline.js` and follow what it prints");
});
