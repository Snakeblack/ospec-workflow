"use strict";

// E4.3 (#338): `--update` never raises a ceiling without a grant and its
// reason, and the check fails on a ceiling the measurement no longer reaches.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { main } = require("./measure-context-baseline.js");
const { BUDGET_SCHEMA, ceilingsFrom } = require("./lib/context-baseline.js");

function target(alwaysOn, trust) {
  return {
    always_on_bytes: alwaysOn, always_on_files: {}, orchestrator: { path: null, bytes: 0 },
    skills_installed: 1, skills_listed: 1, skill_listing_bytes: 10,
    idd_protocol_bytes: 1000, default_flow_bytes: alwaysOn + 1000, memory_flow_bytes: alwaysOn + 1200,
    agents: { "review-trust": { read_bytes: trust } },
  };
}

function setup(t, { alwaysOn = 3400, trust = 14000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-context-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ceilingsPath = path.join(dir, "context-baseline.json");
  const budgetPath = path.join(dir, "context-budget.json");
  fs.writeFileSync(ceilingsPath, `${JSON.stringify(ceilingsFrom({ targets: { claude: target(3400, 14000) } }), null, 2)}\n`);
  fs.writeFileSync(budgetPath, JSON.stringify({ schema: BUDGET_SCHEMA, limits: { always_on_bytes: 4096, agent_read_bytes: 16000 } }));
  const out = { stdout: "", stderr: "" };
  const run = (argv) => main(argv, {
    measure: () => ({ schema: "ospec-context-baseline/v1", targets: { claude: target(alwaysOn, trust) } }),
    ceilingsPath, budgetPath, version: "2.163.0",
    stdout: { write: (text) => { out.stdout += text; } },
    stderr: { write: (text) => { out.stderr += text; } },
  });
  return { ceilingsPath, out, run, read: () => JSON.parse(fs.readFileSync(ceilingsPath, "utf8")) };
}

test("--update refuses a rise without --allow-growth and leaves the ceilings as they were", (t) => {
  const { ceilingsPath, out, run } = setup(t, { trust: 14100 });
  const before = fs.readFileSync(ceilingsPath, "utf8");
  assert.equal(run(["--update"]), 1);
  assert.equal(fs.readFileSync(ceilingsPath, "utf8"), before);
  assert.match(out.stderr, /grows: agent_read_bytes\.review-trust \(claude 14000 → 14100\); rerun with --allow-growth agent_read_bytes\.review-trust --reason "<why>"/);
});

test("--update with --allow-growth and --reason writes the ceiling and the reason", (t) => {
  const { out, read, run } = setup(t, { trust: 14100 });
  assert.equal(run(["--update", "--allow-growth", "agent_read_bytes.review-trust", "--reason", "the lens names a new check"]), 0);
  const ceilings = read();
  assert.equal(ceilings.targets.claude.agent_read_bytes["review-trust"], 14100);
  assert.deepEqual(ceilings.growth, [
    { version: "2.163.0", metric: "agent_read_bytes.review-trust", targets: { claude: [14000, 14100] }, reason: "the lens names a new check" },
  ]);
  assert.match(out.stdout, /ceilings written to/);
});

test("--update refuses a value above the budget even with a grant", (t) => {
  const { out, run } = setup(t, { alwaysOn: 4100 });
  assert.equal(run(["--update", "--allow-growth", "always_on_bytes", "--reason", "router"]), 1);
  assert.match(out.stderr, /over budget: claude always_on_bytes = 4100 \(budget 4096\)/);
});

test("a grant without its reason, a reason without --update or a grant that does not rise is a usage error", (t) => {
  for (const argv of [
    ["--update", "--allow-growth", "always_on_bytes"],
    ["--update", "--allow-growth", "always_on_bytes", "--reason"],
    ["--update", "--allow-growth", "always_on_bytes", "--reason", "a", "--allow-growth", "always_on_bytes", "--reason", "b"],
    ["--allow-growth", "always_on_bytes", "--reason", "router"],
    ["--update", "--allow-growth", "always_on_bytes", "--reason", "router"],
  ]) {
    const { out, run } = setup(t);
    assert.equal(run(argv), 2, argv.join(" "));
    assert.match(out.stderr, /^usage: /m, argv.join(" "));
  }
});

test("the check fails on a ceiling above the measurement and asks for --update", (t) => {
  const { out, run } = setup(t, { alwaysOn: 3300 });
  assert.equal(run([]), 1);
  assert.match(out.stderr, /below ceiling: claude always_on_bytes = 3300 \(ceiling 3400\); run --update/);
  assert.equal(run(["--update"]), 0);
  assert.equal(run([]), 0);
});
