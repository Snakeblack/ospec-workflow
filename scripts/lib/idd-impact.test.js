"use strict";

// E1.3 impact-signals: path patterns per impact signal, stack defaults and the
// `impact:` section of idd/config.yaml (openspec/specs/idd/spec.md,
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
  publishedPaths,
  resolvePatterns,
  validateImpact,
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

test("a public package publishes its main, types, bin and exports", () => {
  assert.deepStrictEqual(
    publishedPaths({
      main: "./index.js",
      types: "index.d.ts",
      typings: "index.d.ts",
      bin: { tiny: "bin/tiny.js" },
      exports: { ".": { import: "./esm/index.mjs", require: "./index.js" }, "./utils": "./lib/utils.js" },
    }),
    ["bin/tiny.js", "esm/index.mjs", "index.d.ts", "index.js", "lib/utils.js"],
  );
  assert.deepStrictEqual(publishedPaths({ bin: "cli.js", exports: "./main.js" }), ["cli.js", "main.js"]);
  assert.deepStrictEqual(publishedPaths({ private: true, main: "src/app.js" }), [], "a private package publishes nothing");
  assert.deepStrictEqual(publishedPaths(null), []);
  assert.deepStrictEqual(publishedPaths({ main: 3, exports: { ".": null } }), []);
});

test("published paths join the public-contract defaults and match by their exact path", () => {
  const patterns = resolvePatterns({ stacks: ["node"], impact: {}, published: ["index.js", "index.d.ts"] });
  assert.deepStrictEqual(patterns.published, ["index.js", "index.d.ts"]);
  assert.deepStrictEqual(matchImpact("index.d.ts", patterns), [{ signal: "public-contract", pattern: "index.d.ts" }]);
  assert.deepStrictEqual(matchImpact("src/index.d.ts", patterns), []);
  const bare = resolvePatterns({ stacks: ["node"], impact: { defaults: false }, published: ["index.js"] });
  assert.deepStrictEqual(bare["public-contract"], []);
  assert.deepStrictEqual(bare.published, []);
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

test("validateImpact normalizes the parsed impact section", () => {
  assert.deepStrictEqual(
    validateImpact({ stack: "node", defaults: "false", public_contract: "api/**", exclude: "" }),
    { stack: ["node"], defaults: false, public_contract: ["api/**"], exclude: [] },
  );
  assert.deepStrictEqual(validateImpact({}), {});
});

test("validateImpact rejects unknown impact keys and stacks", () => {
  assert.throws(() => validateImpact({ public_api: ["src/**"] }), /unknown impact key: public_api/);
  assert.throws(() => validateImpact({ stack: "cobol" }), /unknown stack: cobol/);
  assert.throws(() => validateImpact({ defaults: "maybe" }), /impact.defaults must be true or false/);
});
