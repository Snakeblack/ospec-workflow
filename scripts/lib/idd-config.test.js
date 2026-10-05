"use strict";

// IDD project configuration in idd/config.yaml, never in openspec/
// (openspec/specs/idd/spec.md, REQ-idd-013).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { CONFIG_FILE, CONFIG_KEYS, IddConfigError, parseIddConfig } = require("./idd-config.js");

test("the configuration lives under idd/, outside openspec/", () => {
  assert.strictEqual(CONFIG_FILE, "idd/config.yaml");
  assert.deepStrictEqual(CONFIG_KEYS, ["mode", "strict_tdd", "checks", "impact"]);
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
  const defaults = { mode: null, strictTdd: false, checks: [], impact: {} };
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
    checks: [],
    impact: {
      stack: ["node", "go"],
      defaults: true,
      public_contract: ["scripts/ospec.js", "hooks/hooks.json"],
      persistent_data: ["scripts/lib/idd-store.js"],
      exclude: [],
    },
  });
});

test("an empty impact section is an empty map", () => {
  assert.deepStrictEqual(parseIddConfig("impact:\nstrict_tdd: false\n").impact, {});
});

test("unknown keys and invalid values are refused with config-invalid", () => {
  const refused = (text, pattern) =>
    assert.throws(
      () => parseIddConfig(text),
      (error) => error instanceof IddConfigError && error.code === "config-invalid" && pattern.test(error.message),
    );
  refused("schema: spec-driven\n", /unknown idd config key: schema/);
  refused("workflow:\n  mode: idd\n", /unknown idd config key: workflow/);
  refused("mode: odd\n", /mode must be idd or sdd/);
  refused("strict_tdd: yes\n", /strict_tdd must be true or false/);
  refused("strict_tdd: true\nstrict_tdd: false\n", /duplicate idd config key: strict_tdd/);
  refused("  stray: 1\n", /unreadable idd config line/);
  refused("impact:\n  - src/**\n", /unreadable impact line/);
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
