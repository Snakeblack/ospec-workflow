"use strict";

// E1.3 impact-signals: path patterns per impact signal, stack defaults and the
// `impact:` section of openspec/config.yaml (openspec/specs/idd/spec.md,
// REQ-idd-012).

const test = require("node:test");
const assert = require("node:assert");

const {
  BASE_PATTERNS,
  DEFAULT_EXCLUDE,
  IMPACT_SIGNALS,
  STACK_PATTERNS,
  detectStacks,
  globToRegExp,
  matchImpact,
  parseProjectConfig,
  resolvePatterns,
} = require("./idd-impact.js");

test("impact signals are the three path-driven signals of the catalog", () => {
  assert.deepStrictEqual(IMPACT_SIGNALS, ["public-contract", "persistent-data", "security-boundary"]);
  for (const signal of IMPACT_SIGNALS) {
    assert.ok(BASE_PATTERNS[signal].length > 0, `${signal} needs base patterns`);
  }
  for (const [stack, patterns] of Object.entries(STACK_PATTERNS)) {
    for (const signal of Object.keys(patterns)) {
      assert.ok(IMPACT_SIGNALS.includes(signal), `${stack} declares unknown signal ${signal}`);
    }
  }
});

test("globs match any depth, one segment, braces and ignore case", () => {
  assert.ok(globToRegExp("**/api/**").test("api/orders.js"));
  assert.ok(globToRegExp("**/api/**").test("src/api/v1/orders.js"));
  assert.ok(!globToRegExp("**/api/**").test("src/apis/orders.js"));
  assert.ok(globToRegExp("src/*.js").test("src/a.js"));
  assert.ok(!globToRegExp("src/*.js").test("src/lib/a.js"));
  assert.ok(globToRegExp("**/openapi*.{yaml,yml,json}").test("docs/openapi.v2.yml"));
  assert.ok(globToRegExp("**/migrations/**").test("src/Data/Migrations/20261005_Init.cs"));
  assert.ok(globToRegExp("file?.txt").test("file1.txt"));
  assert.ok(!globToRegExp("file?.txt").test("file/.txt"));
  assert.ok(globToRegExp("a+b.(c).js").test("a+b.(c).js"), "regex metacharacters are literal");
});

test("stacks are detected from the manifest files at the project root", () => {
  assert.deepStrictEqual(detectStacks(["package.json", "README.md"]), ["node"]);
  assert.deepStrictEqual(detectStacks(["pom.xml"]), ["jvm"]);
  assert.deepStrictEqual(detectStacks(["build.gradle.kts", "go.mod"]), ["go", "jvm"]);
  assert.deepStrictEqual(detectStacks(["Api.csproj"]), ["dotnet"]);
  assert.deepStrictEqual(detectStacks(["pyproject.toml"]), ["python"]);
  assert.deepStrictEqual(detectStacks(["Makefile"]), []);
});

test("resolved patterns are the base plus the stack defaults plus the project's own", () => {
  const patterns = resolvePatterns({
    stacks: ["dotnet"],
    impact: { public_contract: ["contracts/**"], exclude: ["legacy/**"] },
  });
  for (const signal of IMPACT_SIGNALS) {
    for (const pattern of BASE_PATTERNS[signal]) assert.ok(patterns[signal].includes(pattern));
    for (const pattern of STACK_PATTERNS.dotnet[signal] || []) assert.ok(patterns[signal].includes(pattern));
  }
  assert.ok(patterns["public-contract"].includes("contracts/**"));
  assert.deepStrictEqual(patterns.exclude, [...DEFAULT_EXCLUDE, "legacy/**"]);
});

test("defaults: false keeps only the project's patterns", () => {
  const patterns = resolvePatterns({
    stacks: ["node"],
    impact: { defaults: false, security_boundary: ["src/guard/**"] },
  });
  assert.deepStrictEqual(patterns["security-boundary"], ["src/guard/**"]);
  assert.deepStrictEqual(patterns["public-contract"], []);
  assert.deepStrictEqual(patterns.exclude, []);
});

test("a declared stack replaces the detected ones", () => {
  const patterns = resolvePatterns({ stacks: ["node"], impact: { stack: ["jvm"] } });
  for (const pattern of STACK_PATTERNS.jvm["public-contract"]) {
    assert.ok(patterns["public-contract"].includes(pattern));
  }
  for (const pattern of STACK_PATTERNS.node["public-contract"]) {
    assert.ok(!patterns["public-contract"].includes(pattern));
  }
});

test("matchImpact names the first matching pattern per signal and honours exclusions", () => {
  const patterns = resolvePatterns({ stacks: [], impact: {} });
  assert.deepStrictEqual(matchImpact("src/api/orders.js", patterns), [
    { signal: "public-contract", pattern: "**/api/**" },
  ]);
  assert.deepStrictEqual(matchImpact("src/auth/migrations/001.sql", patterns).map((m) => m.signal), [
    "persistent-data",
    "security-boundary",
  ]);
  assert.deepStrictEqual(matchImpact("docs/api/orders.md", patterns), [], "documentation is excluded by default");
  assert.deepStrictEqual(matchImpact("src\\auth\\login.js", patterns).map((m) => m.signal), ["security-boundary"]);
});

test("parseProjectConfig reads strict_tdd and the impact section", () => {
  const config = parseProjectConfig(
    [
      "schema: spec-driven",
      "strict_tdd: true",
      "testing:",
      "  runner: node",
      "impact:",
      "  stack: [node, go]",
      "  defaults: true",
      "  public_contract:",
      '    - "scripts/ospec.js"',
      "    - hooks/hooks.json   # hook contract",
      "  persistent_data: ['scripts/lib/idd-store.js']",
      "  exclude: []",
      "routing:",
      "  - name: lite",
    ].join("\n"),
  );
  assert.deepStrictEqual(config, {
    strictTdd: true,
    impact: {
      stack: ["node", "go"],
      defaults: true,
      public_contract: ["scripts/ospec.js", "hooks/hooks.json"],
      persistent_data: ["scripts/lib/idd-store.js"],
      exclude: [],
    },
  });
});

test("parseProjectConfig tolerates a missing or empty impact section", () => {
  assert.deepStrictEqual(parseProjectConfig(""), { strictTdd: false, impact: {} });
  assert.deepStrictEqual(parseProjectConfig("impact:\nother: 1\n"), { strictTdd: false, impact: {} });
  assert.deepStrictEqual(parseProjectConfig("strict_tdd: false\n"), { strictTdd: false, impact: {} });
});

test("parseProjectConfig rejects unknown impact keys and stacks", () => {
  assert.throws(() => parseProjectConfig("impact:\n  public_api: [src/**]\n"), /unknown impact key: public_api/);
  assert.throws(() => parseProjectConfig("impact:\n  stack: cobol\n"), /unknown stack: cobol/);
  assert.throws(() => parseProjectConfig("impact:\n  defaults: maybe\n"), /impact.defaults must be true or false/);
});
