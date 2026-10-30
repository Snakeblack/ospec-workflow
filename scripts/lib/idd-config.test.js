"use strict";

// IDD project configuration in idd/config.yaml, never in openspec/
// (openspec/specs/idd/spec.md, REQ-idd-013).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { CONFIG_FILE, CONFIG_KEYS, IddConfigError, parseIddConfig } = require("./idd-config.js");

function refused(text, pattern) {
  assert.throws(
    () => parseIddConfig(text),
    (error) => error instanceof IddConfigError && error.code === "config-invalid" && pattern.test(error.message),
  );
}

test("the configuration lives under idd/, outside openspec/", () => {
  assert.strictEqual(CONFIG_FILE, "idd/config.yaml");
  assert.deepStrictEqual(CONFIG_KEYS, ["mode", "strict_tdd", "team", "delivery", "checks", "impact", "contracts"]);
});

test("checks are named commands kept in their declared order", () => {
  const config = parseIddConfig(
    ["checks:", "  test: npm test", "  type-check: npx tsc --noEmit   # types", '  lint: "eslint . # all"'].join("\n"),
  );
  assert.deepStrictEqual(config.checks, [
    { name: "test", command: "npm test" },
    { name: "type-check", command: "npx tsc --noEmit" },
    { name: "lint", command: "eslint . # all" },
  ]);
  assert.throws(() => parseIddConfig("checks:\n  test:\n    - npm test\n"), /check test must be one command/);
  assert.throws(() => parseIddConfig('checks:\n  test: ""\n'), /check test must be one command/);
  assert.throws(() => parseIddConfig("checks: npm test\n"), /checks must be a section/);
});

test("an absent or empty configuration yields the defaults", () => {
  const defaults = { mode: null, strictTdd: false, team: null, delivery: { branching: null, changelog: null, release: null, integration_branch: null, production_branch: null }, checks: [], impact: {}, contracts: {} };
  assert.deepStrictEqual(parseIddConfig(""), defaults);
  assert.deepStrictEqual(parseIddConfig("# only a comment\n\n"), defaults);
});

test("mode, strict_tdd and the impact section are read", () => {
  const config = parseIddConfig(
    [
      "# IDD configuration",
      "mode: idd   # project default",
      "strict_tdd: true",
      "impact:",
      "  stack: [node, go]",
      "  defaults: true",
      "  public_contract:",
      '    - "scripts/ospec.js"',
      "    - hooks/hooks.json   # hook contract",
      "",
      "  persistent_data: ['scripts/lib/idd-store.js']",
      "  exclude: []",
    ].join("\r\n"),
  );
  assert.deepStrictEqual(config, {
    mode: "idd",
    strictTdd: true,
    team: null,
    delivery: { branching: null, changelog: null, release: null, integration_branch: null, production_branch: null },
    checks: [],
    impact: {
      stack: ["node", "go"],
      defaults: true,
      public_contract: ["scripts/ospec.js", "hooks/hooks.json"],
      persistent_data: ["scripts/lib/idd-store.js"],
      exclude: [],
    },
    contracts: {},
  });
});

test("an empty impact section is an empty map", () => {
  assert.deepStrictEqual(parseIddConfig("impact:\nstrict_tdd: false\n").impact, {});
});

test("unknown keys and invalid values are refused with config-invalid", () => {
  refused("schema: spec-driven\n", /unknown idd config key: schema/);
  refused("workflow:\n  mode: idd\n", /unknown idd config key: workflow/);
  refused("mode: odd\n", /mode must be idd or sdd/);
  refused("strict_tdd: yes\n", /strict_tdd must be true or false/);
  refused("strict_tdd: true\nstrict_tdd: false\n", /duplicate idd config key: strict_tdd/);
  refused("  stray: 1\n", /unreadable idd config line/);
  refused("impact:\n  - src/**\n", /unreadable impact line/);
});

test("the team section declares the profile and decides strict_tdd unless it is explicit", () => {
  assert.deepStrictEqual(parseIddConfig("team:\n  size: small   # three people\n  experience: senior\n").team, { size: "small", experience: "senior" });
  assert.deepStrictEqual(parseIddConfig("team:\n  size: solo\n").team, { size: "solo", experience: null });
  assert.strictEqual(parseIddConfig("team:\n  size: solo\n").strictTdd, false);
  assert.strictEqual(parseIddConfig("team:\n  size: small\n").strictTdd, true);
  assert.strictEqual(parseIddConfig("team:\n  size: solo\n  experience: junior\n").strictTdd, true);
  assert.strictEqual(parseIddConfig("strict_tdd: false\nteam:\n  size: multi-team\n").strictTdd, false);
  assert.strictEqual(parseIddConfig("strict_tdd: true\nteam:\n  size: solo\n").strictTdd, true);
  refused("team:\n  size: enterprise\n", /team.size must be solo, small, multi-team, got enterprise/);
  refused("team:\n  experience: senior\n", /team.size must be/);
  refused("team:\n  size: solo\n  experience: expert\n", /team.experience must be junior, mixed, senior/);
  refused("team:\n  size: solo\n  scale: team\n", /unknown team key: scale/);
  refused("team: solo\n", /team must be a section/);
});

test("[REQ-idd-023] the delivery section declares the branching and refuses any other key or value", () => {
  const only = (branching) => ({ branching, changelog: null, release: null, integration_branch: null, production_branch: null });
  assert.deepStrictEqual(parseIddConfig("delivery:\n  branching: serial   # one PR in flight\n").delivery, only("serial"));
  assert.deepStrictEqual(parseIddConfig("delivery:\n  branching: parallel\n").delivery, only("parallel"));
  assert.deepStrictEqual(parseIddConfig("delivery:\n").delivery, only(null));
  refused("delivery:\n  branching: rebase\n", /delivery.branching must be serial or parallel, got rebase/);
  // Values are case-sensitive, like every other value of the file.
  refused("delivery:\n  branching: Serial\n", /got Serial/);
  refused("delivery:\n  branching:\n", /delivery.branching must be serial or parallel, got nothing/);
  refused("delivery:\n  merge: squash\n", /unknown delivery key: merge/);
  refused("delivery: serial\n", /delivery must be a section/);
});

test("[REQ-idd-025] the delivery section declares the changelog and the release cadence", () => {
  const delivery = (text) => parseIddConfig(`delivery:\n${text}`).delivery;
  assert.deepStrictEqual(delivery("  changelog: CHANGELOG.md\n  release: per-change\n"), { branching: null, changelog: "CHANGELOG.md", release: "per-change", integration_branch: null, production_branch: null });
  assert.deepStrictEqual(delivery('  changelog: "docs/release notes.md"\n  release: batched\n'), { branching: null, changelog: "docs/release notes.md", release: "batched", integration_branch: null, production_branch: null });
  assert.deepStrictEqual(delivery("  changelog: none\n  release: none\n"), { branching: null, changelog: "none", release: "none", integration_branch: null, production_branch: null });
  // close writes the changelog, so it stays a relative path inside the project.
  for (const outside of ["/etc/CHANGELOG.md", "../CHANGELOG.md", "docs/../../CHANGELOG.md", "C:/CHANGELOG.md", "docs\\CHANGELOG.md", "./CHANGELOG.md", "docs/"]) {
    refused(`delivery:\n  changelog: ${outside}\n`, /delivery.changelog must be a relative path inside the project or none, got /);
  }
  refused("delivery:\n  changelog: [a.md, b.md]\n", /delivery.changelog must be a relative path inside the project or none, got nothing/);
  refused("delivery:\n  release: weekly\n", /delivery.release must be per-change, batched, none, got weekly/);
  refused("delivery:\n  release:\n", /delivery.release must be per-change, batched, none, got nothing/);
});

test("[REQ-idd-023] the delivery section declares an integration branch apart from production", () => {
  const delivery = (text) => parseIddConfig(`delivery:\n${text}`).delivery;
  assert.deepStrictEqual(delivery("  branching: parallel\n  integration_branch: dev\n  production_branch: main\n  release: batched\n"), {
    branching: "parallel",
    changelog: null,
    release: "batched",
    integration_branch: "dev",
    production_branch: "main",
  });
  // Without production_branch, production is the default branch, unnamed.
  assert.deepStrictEqual([delivery("  integration_branch: feature/next.1\n").integration_branch, delivery("  integration_branch: dev\n").production_branch], ["feature/next.1", null]);
  // A name git refuses (git check-ref-format --branch) is refused here, without running git.
  for (const bad of ['""', "[dev, main]", '"my dev"', "-dev", "dev..next", "dev~1", "dev^", "a:b", "dev?", "dev*", "dev[1]", '"a\\\\b"', "dev@{1}", "@", "/dev", "dev/", "a//b", ".dev", "a/.b", "dev.lock", "dev."]) {
    refused(`delivery:\n  integration_branch: ${bad}\n`, /delivery.integration_branch must be a branch name git accepts, got /);
  }
  refused("delivery:\n  integration_branch:\n", /delivery.integration_branch must be a branch name git accepts, got nothing/);
  refused("delivery:\n  integration_branch: dev\n  production_branch: ma in\n", /delivery.production_branch must be a branch name git accepts/);
  refused("delivery:\n  integration_branch: main\n  production_branch: main\n", /delivery.integration_branch must differ from delivery.production_branch, got main for both/);
  refused("delivery:\n  production_branch: main\n", /delivery.production_branch needs delivery.integration_branch/);
  // Each promotion to production is a version, never each merge into the integration branch.
  refused("delivery:\n  integration_branch: dev\n  release: per-change\n", /delivery.release must be batched or none with delivery.integration_branch, got per-change/);
  assert.strictEqual(delivery("  integration_branch: dev\n  release: none\n").release, "none");
  // Branch names are case-sensitive, as in git.
  assert.strictEqual(delivery("  integration_branch: Main\n  production_branch: main\n").integration_branch, "Main");
});

test("the contracts section lists documents and tests", () => {
  const config = parseIddConfig("contracts:\n  documents:\n    - openspec/specs/**\n  tests: [scripts/**]\n");
  assert.deepStrictEqual(config.contracts, { documents: ["openspec/specs/**"], tests: ["scripts/**"] });
  assert.throws(
    () => parseIddConfig("contracts:\n  docs: [a]\n"),
    (error) => error instanceof IddConfigError && /unknown contracts key: docs/.test(error.message),
  );
});

test("impact contents keep their own validation code", () => {
  assert.throws(() => parseIddConfig("impact:\n  public_api: [src/**]\n"), (error) => error.code === "impact-config-invalid");
  assert.throws(() => parseIddConfig("impact:\n  stack: cobol\n"), /unknown stack: cobol/);
  assert.throws(() => parseIddConfig("impact:\n  defaults: maybe\n"), /impact.defaults must be true or false/);
});

test("REQ-idd-013 names the file, every key and both error codes", () => {
  const spec = fs.readFileSync(path.join(__dirname, "..", "..", "openspec", "specs", "idd", "spec.md"), "utf8");
  const start = spec.indexOf("{#REQ-idd-013}");
  assert.ok(start !== -1, "REQ-idd-013 is missing");
  const end = spec.indexOf("### Requirement:", start);
  const section = spec.slice(start, end === -1 ? undefined : end);
  for (const name of [CONFIG_FILE, ...CONFIG_KEYS, "config-invalid", "impact-config-invalid"]) {
    assert.ok(section.includes(`\`${name}\``), `REQ-idd-013 must name ${name}`);
  }
});
