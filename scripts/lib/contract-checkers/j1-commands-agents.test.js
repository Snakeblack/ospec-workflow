"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { check, checkDetailed } = require("./j1-commands-agents.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

test("check({root: ROOT}) returns [] against the real repo (mirrors the legacy test's happy path)", () => {
  assert.deepEqual(check({ root: ROOT }), []);
});

test("checkDetailed({root: ROOT}) exercises sdd-document.prompt.md's routing (anchor preserved)", () => {
  const { offenders, checked, missingFromRoster, arrowRowCount } = checkDetailed({ root: ROOT });

  assert.deepEqual(offenders, []);
  assert.deepEqual(missingFromRoster, []);
  assert.ok(arrowRowCount > 0, "rel-2 guard: at least one roster row must contain a routing arrow");
  assert.ok(
    checked.includes("sdd-document.prompt.md"),
    "rel-1 guard: sdd-document.prompt.md must be present in checked[] — the exact command " +
      "this contract was written to protect"
  );
});

function makeFixtureRoot(t, { rosterRow, agentAllowlist }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "j1-fixture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const specDir = path.join(root, "openspec", "specs", "agents");
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, "spec.md"),
    [
      "# Agents Domain Spec",
      "",
      "### 3.2 Command Roster",
      "",
      "| Command | Description | Routes to |",
      "|---|---|---|",
      rosterRow,
      "",
      "---",
      "",
    ].join("\n")
  );

  const commandsDir = path.join(root, "commands");
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.writeFileSync(
    path.join(commandsDir, "sdd-fake.prompt.md"),
    ["---", "agent: sdd-fake-router", "---", "", "Fake command body."].join("\n")
  );

  const agentsDir = path.join(root, "agents");
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentsDir, "sdd-fake-router.agent.md"),
    [
      "---",
      "name: sdd-fake-router",
      `agents: [${agentAllowlist.map((a) => `'${a}'`).join(", ")}]`,
      "---",
      "",
      "Fake router body.",
    ].join("\n")
  );

  return root;
}

test("synthetic-offender case: roster/allowlist mismatch returns one offender, not a thrown assert", (t) => {
  const root = makeFixtureRoot(t, {
    rosterRow: "| `commands/sdd-fake.prompt.md` | fake | -> sdd-fake-target |",
    agentAllowlist: ["sdd-other-target"], // deliberately missing 'sdd-fake-target'
  });

  const offenders = check({ root });

  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].checker, "j1-commands-agents");
  assert.match(offenders[0].message, /sdd-fake-target/);
});

test("rel-1 guard preserved: a command file missing from the roster is a hard offender, not a silent skip", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "j1-fixture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const specDir = path.join(root, "openspec", "specs", "agents");
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, "spec.md"),
    [
      "# Agents Domain Spec",
      "",
      "### 3.2 Command Roster",
      "",
      "| Command | Description | Routes to |",
      "|---|---|---|",
      "| `commands/unrelated.prompt.md` | other | -> some-agent |",
      "",
      "---",
      "",
    ].join("\n")
  );

  const commandsDir = path.join(root, "commands");
  fs.mkdirSync(commandsDir, { recursive: true });
  // This command file has NO matching roster row — simulates a deleted/reformatted row.
  fs.writeFileSync(
    path.join(commandsDir, "sdd-orphan.prompt.md"),
    ["---", "agent: sdd-fake-router", "---", "", "Orphan command body."].join("\n")
  );

  fs.mkdirSync(path.join(root, "agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "agents", "sdd-fake-router.agent.md"),
    ["---", "name: sdd-fake-router", "agents: []", "---", "", "Fake router body."].join("\n")
  );

  const { offenders, missingFromRoster } = checkDetailed({ root });

  assert.deepEqual(missingFromRoster, ["sdd-orphan.prompt.md"]);
  assert.ok(offenders.some((o) => /rel-1/.test(o.message)));
});

test("WARNING 1 fix: missing agentsSpecPath yields an explicit offender instead of throwing ENOENT", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "j1-missing-spec-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Deliberately do NOT create openspec/specs/agents/spec.md.

  const offenders = check({ root });

  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].checker, "j1-commands-agents");
  assert.match(offenders[0].message, /agents[\\/]spec\.md/);
  assert.match(offenders[0].message, /could not be read/);
});

test("WARNING 1 fix: agentsSpecPath being a directory (not a file) also yields an offender, not a thrown error", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "j1-dir-spec-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Create spec.md AS A DIRECTORY, forcing a different fs error (EISDIR) than
  // the plain-ENOENT case above — proves the try/catch is generic, not
  // matching only the ENOENT code.
  fs.mkdirSync(path.join(root, "openspec", "specs", "agents", "spec.md"), { recursive: true });

  const offenders = check({ root });

  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].checker, "j1-commands-agents");
  assert.match(offenders[0].message, /could not be read/);
});

test("WARNING 2 coverage: command file with an absent 'agent:' frontmatter field yields an offender", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "j1-no-agent-field-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const specDir = path.join(root, "openspec", "specs", "agents");
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, "spec.md"),
    [
      "# Agents Domain Spec",
      "",
      "### 3.2 Command Roster",
      "",
      "| Command | Description | Routes to |",
      "|---|---|---|",
      "| `commands/sdd-fake.prompt.md` | fake | -> sdd-fake-target |",
      "",
      "---",
      "",
    ].join("\n")
  );

  const commandsDir = path.join(root, "commands");
  fs.mkdirSync(commandsDir, { recursive: true });
  // No 'agent:' frontmatter field at all.
  fs.writeFileSync(
    path.join(commandsDir, "sdd-fake.prompt.md"),
    ["---", "description: fake command with no agent field", "---", "", "Fake command body."].join("\n")
  );

  fs.mkdirSync(path.join(root, "agents"), { recursive: true });

  const { offenders } = checkDetailed({ root });

  assert.ok(
    offenders.some((o) => /must declare an 'agent:' frontmatter field/.test(o.message)),
    "must report the missing 'agent:' field as an offender"
  );
});

test("WARNING 2 coverage: command file whose declared router agent file does not exist yields an offender", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "j1-missing-router-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const specDir = path.join(root, "openspec", "specs", "agents");
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, "spec.md"),
    [
      "# Agents Domain Spec",
      "",
      "### 3.2 Command Roster",
      "",
      "| Command | Description | Routes to |",
      "|---|---|---|",
      "| `commands/sdd-fake.prompt.md` | fake | -> sdd-fake-target |",
      "",
      "---",
      "",
    ].join("\n")
  );

  const commandsDir = path.join(root, "commands");
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.writeFileSync(
    path.join(commandsDir, "sdd-fake.prompt.md"),
    ["---", "agent: sdd-ghost-router", "---", "", "Fake command body."].join("\n")
  );

  // Deliberately do NOT create agents/sdd-ghost-router.agent.md.
  fs.mkdirSync(path.join(root, "agents"), { recursive: true });

  const { offenders } = checkDetailed({ root });

  assert.ok(
    offenders.some(
      (o) => /router agent file agents[\\/]sdd-ghost-router\.agent\.md/.test(o.message) && /must exist/.test(o.message)
    ),
    "must report the missing router agent file as an offender"
  );
});

test("rel-2 guard preserved: zero arrow rows is reported as an offender", (t) => {
  const root = makeFixtureRoot(t, {
    rosterRow: "| `commands/sdd-fake.prompt.md` | fake | (no arrow here) |",
    agentAllowlist: [],
  });

  const { offenders } = checkDetailed({ root });

  assert.ok(offenders.some((o) => /rel-2/.test(o.message)));
});
