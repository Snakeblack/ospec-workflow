"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  normalizeReviewEvidence,
  validateGeneralistDecision,
  deriveReviewDimensions,
  validateReviewDecision,
} = require("./lib/review-dimensions.js");

const clear = { status: "clear", specialists: [], reason: "signals=none;dimensions=none" };

function evidence(overrides = {}) {
  return normalizeReviewEvidence({
    classification: "normal",
    verify: { status: "success", findings: [] },
    diff: "diff --git a/docs/a.md b/docs/a.md\n--- a/docs/a.md\n+++ b/docs/a.md\n@@ -0,0 +1 @@\n+documentation only",
    paths: ["docs\\a.md", "docs/a.md"],
    capabilities: ["docs"],
    operationTypes: ["modify"],
    dependencies: [],
    designRisks: [],
    ...overrides,
  });
}

test("normalization is deterministic, deduplicated, and excludes raw diff", () => {
  const a = evidence();
  const b = evidence({ paths: ["docs/a.md", "docs\\a.md"], capabilities: ["docs", "docs"] });
  assert.deepEqual(a, b);
  assert.match(a.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(a.sources.paths, ["docs/a.md"]);
  assert.equal(JSON.stringify(a).includes("documentation only"), false);
});

test("real diff signals outrank metadata and normal selection is capped deterministically", () => {
  const normalized = evidence({
    diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1,3 @@\n+spawnSync(command)\n+writeFileSync(globalConfig)\n+fetch(url) retry timeout",
  });
  const decision = deriveReviewDimensions(normalized, clear);
  assert.deepEqual(decision.selected_specialists, ["risk", "reliability"]);
  assert.equal(decision.dimensions.resilience.selected, false);
  assert.ok(decision.dimensions.resilience.reasons.some((r) => r.code === "normal-cap-excluded"));
  assert.equal(validateReviewDecision(decision).valid, true);
});

test("equal-precedence candidates use canonical dimension order before reason details", () => {
  const normalized = evidence({
    diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1,2 @@\n+spawnSync(command)\n+fetch(url)",
  });
  const decision = deriveReviewDimensions(normalized, clear);
  assert.deepEqual(decision.selected_specialists, ["risk", "reliability"]);
  assert.equal(decision.dimensions.resilience.selected, false);
  assert.ok(decision.dimensions.resilience.reasons.some((entry) => entry.code === "normal-cap-excluded"));
});

test("candidate ranking is stable across fact permutations and honors stronger precedence first", () => {
  const diffA = "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1,3 @@\n+spawnSync(command)\n+fetch(url)\n+switch (mode)";
  const diffB = "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1,3 @@\n+switch (mode)\n+fetch(url)\n+spawnSync(command)";
  const first = deriveReviewDimensions(evidence({ diff: diffA }), clear);
  const permuted = deriveReviewDimensions(evidence({ diff: diffB }), clear);
  assert.deepEqual(first.selected_specialists, ["risk", "reliability"]);
  assert.deepEqual(permuted.selected_specialists, first.selected_specialists);

  const verifyWins = deriveReviewDimensions(evidence({
    verify: { status: "success", findings: [{ code: "verify-readability", detail: "verified complexity" }] },
    diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1,2 @@\n+spawnSync(command)\n+fetch(url)",
  }), clear);
  assert.deepEqual(verifyWins.selected_specialists, ["risk", "readability"]);
  assert.equal(validateReviewDecision(verifyWins).valid, true);
});

test("zero normal specialists and high-risk full 4R are both explicit", () => {
  const none = deriveReviewDimensions(evidence(), clear);
  assert.deepEqual(none.selected_specialists, []);
  for (const dimension of Object.values(none.dimensions)) assert.match(dimension.reasons[0].code, /^no-.+-signal$/);

  const high = deriveReviewDimensions(evidence({ classification: "high-risk" }), clear);
  assert.deepEqual(high.selected_specialists, ["risk", "reliability", "resilience", "readability"]);
  for (const dimension of Object.values(high.dimensions)) assert.equal(dimension.reasons[0].code, "high-risk-override");
});

test("generalist validation rejects extra keys, mismatches, duplicates, and unknown dimensions", () => {
  assert.equal(validateGeneralistDecision(clear).valid, true);
  for (const value of [
    { ...clear, extra: true },
    { status: "clear", specialists: ["risk"], reason: "Mismatch" },
    { status: "needs-specialist", specialists: [], reason: "Mismatch" },
    { status: "needs-specialist", specialists: ["risk", "risk"], reason: "Duplicate" },
    { status: "needs-specialist", specialists: ["security"], reason: "Unknown" },
  ]) assert.equal(validateGeneralistDecision(value).valid, false);
});

test("generalist reason rejects arbitrary material before persistence", () => {
  const syntheticToken = "sk-live-SYNTHETIC_REVIEW_TOKEN_123456";
  for (const reason of [
    `Credential observed: ${syntheticToken}`,
    "password=synthetic-password",
    "+ const token = process.env.REVIEW_TOKEN",
    "x".repeat(513),
  ]) {
    assert.equal(validateGeneralistDecision({ status: "needs-specialist", specialists: ["risk"], reason }).valid, false);
  }
  const safe = { status: "needs-specialist", specialists: ["risk"], reason: "signals=diff-auth-permission;dimensions=risk" };
  const decision = deriveReviewDimensions(evidence(), safe);
  assert.equal(validateReviewDecision(decision).valid, true);
  assert.equal(JSON.stringify(decision).includes(syntheticToken), false);
});

test("generalist reason accepts only canonical classifier references", () => {
  const valid = {
    status: "needs-specialist",
    specialists: ["risk", "reliability"],
    reason: "signals=diff-auth-permission,diff-process-execution;dimensions=risk,reliability",
  };
  assert.equal(validateGeneralistDecision(valid).valid, true);
  assert.equal(validateGeneralistDecision({ status: "clear", specialists: [], reason: "signals=none;dimensions=none" }).valid, true);

  for (const reason of [
    "signals=diff-auth-permission;dimensions=risk;note=Authorization: Bearer synthetic-value",
    "signals=diff-auth-permission;dimensions=risk;note=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.synthetic",
    "signals=diff-auth-permission;dimensions=risk;note=AKIAIOSFODNN7EXAMPLE",
    "signals=invented-signal;dimensions=risk",
    "Permission handling changed in the runtime adapter.",
  ]) assert.equal(validateGeneralistDecision({ status: "needs-specialist", specialists: ["risk"], reason }).valid, false, reason);
});

test("normalization requires every declared evidence array before fingerprinting", () => {
  const base = {
    classification: "normal",
    verify: { status: "success", findings: [] },
    diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1 @@\n+throw new Error('x')",
    paths: ["scripts/run.js"],
    capabilities: ["runtime"],
    dependencies: [],
    operationTypes: ["modify"],
    designRisks: [],
  };
  for (const path of ["paths", "capabilities", "dependencies", "operationTypes", "designRisks"]) {
    const omitted = { ...base };
    delete omitted[path];
    assert.throws(() => normalizeReviewEvidence(omitted), new RegExp(path, "i"));
    assert.throws(() => normalizeReviewEvidence({ ...base, [path]: "not-an-array" }), new RegExp(path, "i"));
  }
  const missingFindings = structuredClone(base);
  delete missingFindings.verify.findings;
  assert.throws(() => normalizeReviewEvidence(missingFindings), /verify\.findings/i);
  assert.throws(() => normalizeReviewEvidence({ ...base, verify: { status: "success", findings: {} } }), /verify\.findings/i);
});

test("normalization rejects non-string entries at every string-list boundary", () => {
  const invalidValues = [{ injected: "[object Object]" }, 42, null, ["nested"]];
  for (const field of ["paths", "capabilities", "dependencies", "operationTypes"]) {
    for (const invalid of invalidValues) {
      assert.throws(() => evidence({ [field]: ["valid", invalid] }), new RegExp(field, "i"), `${field}: ${String(invalid)}`);
    }
  }
});

test("real diff facts use only per-file production additions and exact attribution", () => {
  const normalized = evidence({
    paths: ["docs/guide.md", "scripts/review.test.js", "scripts/runtime.js"],
    capabilities: ["runtime"],
    diff: [
      "diff --git a/docs/guide.md b/docs/guide.md",
      "--- a/docs/guide.md", "+++ b/docs/guide.md", "@@ -1 +1 @@", "-old", "+spawnSync(secret)",
      "diff --git a/scripts/review.test.js b/scripts/review.test.js",
      "--- a/scripts/review.test.js", "+++ b/scripts/review.test.js", "@@ -0,0 +1 @@", "+fetch(url)",
      "diff --git a/scripts/runtime.js b/scripts/runtime.js",
      "--- a/scripts/runtime.js", "+++ b/scripts/runtime.js", "@@ -1,2 +1,2 @@", " const auth = false;", "-throw oldError", "+switch (runtimeMode) { default: break; }",
    ].join("\n"),
  });
  const realDiffFacts = normalized.sources.facts.filter((fact) => fact.source === "real-diff");
  assert.deepEqual(realDiffFacts, [{ code: "diff-structural-complexity", source: "real-diff", detail: "scripts/runtime.js" }]);

  const generalist = { status: "needs-specialist", specialists: ["risk"], reason: "signals=diff-auth-permission;dimensions=risk" };
  assert.deepEqual(deriveReviewDimensions(normalized, generalist).selected_specialists, ["risk", "readability"]);
});

test("real diff parser ignores comments, block comments, shebangs, and documentation strings", () => {
  const normalized = evidence({
    paths: ["scripts/runtime.js"],
    capabilities: ["runtime"],
    diff: [
      "diff --git a/scripts/runtime.js b/scripts/runtime.js",
      "--- a/scripts/runtime.js", "+++ b/scripts/runtime.js", "@@ -0,0 +1,8 @@",
      "+#!/usr/bin/env node",
      "+// fetch retry timeout only documented here",
      "+/* spawnSync(secret)",
      "+ * authorize(role)",
      "+ */",
      "+const note = \"fetch retry timeout throw fallback switch\";",
      "+const result = fetch(url);",
      "+authorize(user);",
    ].join("\n"),
  });
  assert.deepEqual(normalized.sources.facts.filter((fact) => fact.source === "real-diff"), [
    { code: "diff-auth-permission", source: "real-diff", detail: "scripts/runtime.js" },
    { code: "diff-network-flow", source: "real-diff", detail: "scripts/runtime.js" },
  ]);
  const generalist = { status: "needs-specialist", specialists: ["risk"], reason: "signals=diff-auth-permission;dimensions=risk" };
  assert.deepEqual(deriveReviewDimensions(normalized, generalist).selected_specialists, ["risk", "reliability"]);
});

test("real diff parser ignores multiline documentation strings", () => {
  const normalized = evidence({
    paths: ["src/runtime.py"],
    capabilities: ["runtime"],
    diff: [
      "diff --git a/src/runtime.py b/src/runtime.py",
      "--- a/src/runtime.py", "+++ b/src/runtime.py", "@@ -0,0 +1,5 @@",
      "+\"\"\"fetch retry timeout",
      "+spawnSync authorize throw switch",
      "+\"\"\"",
      "+request(url)",
      "+authorize(user)",
    ].join("\n"),
  });
  assert.deepEqual(normalized.sources.facts.filter((fact) => fact.source === "real-diff"), [
    { code: "diff-auth-permission", source: "real-diff", detail: "src/runtime.py" },
    { code: "diff-network-flow", source: "real-diff", detail: "src/runtime.py" },
  ]);
});

test("language-aware lexer preserves executable interpolation and JavaScript decrement", () => {
  const normalized = evidence({
    paths: ["scripts/runtime.js", "src/runtime.py"],
    capabilities: ["runtime"],
    diff: [
      "diff --git a/scripts/runtime.js b/scripts/runtime.js",
      "--- a/scripts/runtime.js", "+++ b/scripts/runtime.js", "@@ -0,0 +1,4 @@",
      "+counter--; fetch(url)",
      "+const live = `documentation ${request(url)}`;",
      "+const nested = `literal ${flag ? `inner ${authorize(user)}` : 'none'}`;",
      "+const documentary = `fetch(url) authorize(user)`;",
      "diff --git a/src/runtime.py b/src/runtime.py",
      "--- a/src/runtime.py", "+++ b/src/runtime.py", "@@ -0,0 +1,2 @@",
      "+live = f\"documentation {request(url)}\"",
      "+documentary = \"request(url) authorize(user)\"",
    ].join("\n"),
  });
  assert.deepEqual(normalized.sources.facts.filter((fact) => fact.source === "real-diff"), [
    { code: "diff-auth-permission", source: "real-diff", detail: "scripts/runtime.js" },
    { code: "diff-network-flow", source: "real-diff", detail: "scripts/runtime.js,src/runtime.py" },
  ]);
});

test("multiline JavaScript template literal text remains documentary", () => {
  const normalized = evidence({
    paths: ["scripts/runtime.js"],
    capabilities: ["runtime"],
    diff: [
      "diff --git a/scripts/runtime.js b/scripts/runtime.js",
      "--- a/scripts/runtime.js", "+++ b/scripts/runtime.js", "@@ -0,0 +1,3 @@",
      "+const documentary = `",
      "+authorize(user) throw fallback()",
      "+`; request(url)",
    ].join("\n"),
  });
  assert.deepEqual(normalized.sources.facts.filter((fact) => fact.source === "real-diff"), [
    { code: "diff-network-flow", source: "real-diff", detail: "scripts/runtime.js" },
  ]);
});

test("Ruby multiline comments suppress facts across context and added lines", () => {
  const normalized = evidence({
    paths: ["src/runtime.rb"],
    capabilities: ["runtime"],
    diff: [
      "diff --git a/src/runtime.rb b/src/runtime.rb",
      "--- a/src/runtime.rb", "+++ b/src/runtime.rb", "@@ -1,3 +1,6 @@",
      " =begin",
      "+fetch(url)",
      "+throw fallback()",
      " authorize(user)",
      " =end",
      "+request(url)",
    ].join("\n"),
  });
  assert.deepEqual(normalized.sources.facts.filter((fact) => fact.source === "real-diff"), [
    { code: "diff-network-flow", source: "real-diff", detail: "src/runtime.rb" },
  ]);
});

test("hash-comment languages preserve executable prefixes and ignore inline comment suffixes", () => {
  const normalized = evidence({
    paths: ["src/app.py", "src/app.rb", "scripts/run.sh"],
    capabilities: ["runtime"],
    diff: [
      "diff --git a/src/app.py b/src/app.py",
      "--- a/src/app.py", "+++ b/src/app.py", "@@ -0,0 +1 @@",
      "+authorize(user); label = \"# fetch(url)\" # throw fallback()",
      "diff --git a/src/app.rb b/src/app.rb",
      "--- a/src/app.rb", "+++ b/src/app.rb", "@@ -0,0 +1 @@",
      "+request(url); label = '# authorize(user)' # throw fallback()",
      "diff --git a/scripts/run.sh b/scripts/run.sh",
      "--- a/scripts/run.sh", "+++ b/scripts/run.sh", "@@ -0,0 +1 @@",
      "+spawnSync(command); label='#' # fetch(url)",
    ].join("\n"),
  });

  assert.deepEqual(normalized.sources.facts.filter((fact) => fact.source === "real-diff"), [
    { code: "diff-auth-permission", source: "real-diff", detail: "src/app.py" },
    { code: "diff-network-flow", source: "real-diff", detail: "src/app.rb" },
    { code: "diff-process-execution", source: "real-diff", detail: "scripts/run.sh" },
  ]);
});

test("shell keeps embedded unquoted hashes executable while stripping token-boundary comments", () => {
  const normalized = evidence({
    paths: ["scripts/run.sh"],
    capabilities: ["runtime"],
    diff: [
      "diff --git a/scripts/run.sh b/scripts/run.sh",
      "--- a/scripts/run.sh", "+++ b/scripts/run.sh", "@@ -0,0 +1 @@",
      "+label=prefix#suffix; fetch(url) # authorize(user)",
    ].join("\n"),
  });

  assert.deepEqual(normalized.sources.facts.filter((fact) => fact.source === "real-diff"), [
    { code: "diff-network-flow", source: "real-diff", detail: "scripts/run.sh" },
  ]);
});

test("shell hash comments start at lexer word boundaries without swallowing executable prefixes", () => {
  const cases = [
    ["authorize(user);# request(url) throw fallback()", ["diff-auth-permission"]],
    ["authorize(user) # request(url) throw fallback()", ["diff-auth-permission"]],
    ["# request(url) throw fallback()", []],
    ["authorize(user)|# request(url)", ["diff-auth-permission"]],
    ["authorize(user)&# request(url)", ["diff-auth-permission"]],
    ["authorize(user)(# request(url)", ["diff-auth-permission"]],
    ["authorize(user))# request(url)", ["diff-auth-permission"]],
    ["authorize(user)># request(url)", ["diff-auth-permission"]],
    ["authorize(user)<# request(url)", ["diff-auth-permission"]],
    ["label='# request(url)'; authorize(user)", ["diff-auth-permission"]],
    ["label=\"# request(url)\"; authorize(user)", ["diff-auth-permission"]],
    [String.raw`\#; request(url)`, ["diff-network-flow"]],
    ["label=${var#pattern}; request(url)", ["diff-network-flow"]],
    ["label=word#hash; request(url)", ["diff-network-flow"]],
    ["#!/usr/bin/env bash", []],
  ];

  for (const [line, expectedCodes] of cases) {
    const normalized = evidence({
      paths: ["scripts/run.sh"],
      capabilities: ["runtime"],
      diff: [
        "diff --git a/scripts/run.sh b/scripts/run.sh",
        "--- a/scripts/run.sh", "+++ b/scripts/run.sh", "@@ -0,0 +1 @@",
        `+${line}`,
      ].join("\n"),
    });
    assert.deepEqual(
      normalized.sources.facts.filter((fact) => fact.source === "real-diff").map((fact) => fact.code),
      expectedCodes,
      line,
    );
  }
});

test("real diff parser excludes nested test, spec, fixture, and documentation paths", () => {
  const paths = ["src/tests/a.js", "src/specs/a.js", "src/fixtures/a.js", "src/documentation/a.js"];
  const normalized = evidence({
    paths,
    capabilities: ["runtime"],
    diff: paths.flatMap((file) => [
      `diff --git a/${file} b/${file}`,
      `--- a/${file}`,
      `+++ b/${file}`,
      "@@ -0,0 +1 @@",
      "+fetch(url)",
    ]).join("\n"),
  });
  assert.deepEqual(normalized.sources.facts.filter((fact) => fact.source === "real-diff"), []);
});

test("malformed evidence and final decisions fail closed", () => {
  for (const value of [{}, { classification: "normal", verify: { status: "success" } }, { classification: "small", verify: { status: "success" }, diff: "x" }]) {
    assert.throws(() => normalizeReviewEvidence(value), /classification|verify|diff/i);
  }
  const valid = deriveReviewDimensions(evidence(), clear);
  assert.equal(validateReviewDecision({ ...valid, selected_specialists: ["risk"] }).valid, false);
  assert.equal(validateReviewDecision({ ...valid, dimensions: { risk: valid.dimensions.risk } }).valid, false);
  const unknownReason = structuredClone(valid);
  unknownReason.dimensions.risk.reasons[0].code = "invented-reason";
  assert.equal(validateReviewDecision(unknownReason).valid, false);
  const wrongPrecedence = structuredClone(valid);
  wrongPrecedence.dimensions.risk.reasons[0].precedence = 0;
  assert.equal(validateReviewDecision(wrongPrecedence).valid, false);
});

test("normalization rejects non-real diff input, unsafe paths, and unknown fact sources", () => {
  assert.throws(() => evidence({ diff: "" }), /diff/i);
  assert.throws(() => evidence({ diff: "this is not a unified diff" }), /diff/i);
  assert.throws(() => evidence({ diff: "diff --git a/scripts/run.js b/scripts/run.js\n@@ -0,0 +1 @@\n+fetch(url)" }), /marker|diff/i);
  assert.throws(() => evidence({ diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js" }), /hunk|diff/i);
  assert.throws(() => evidence({ diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1,2 @@\n+fetch(url)" }), /truncated|hunk|diff/i);
  assert.throws(() => evidence({ diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1 @@\n+fetch(url)\ntrailing junk" }), /hunk|diff/i);
  assert.throws(() => evidence({ paths: ["../outside.js"] }), /path/i);
  assert.throws(() => evidence({
    verify: {
      status: "success",
      findings: [{ code: "verify-risk", source: "proposal-prose", detail: "untrusted source" }],
    },
  }), /source/i);
});

test("final validation recomputes evidence identity and enforces dimension applicability", () => {
  const valid = deriveReviewDimensions(evidence({
    diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1 @@\n+spawnSync(command)",
  }), clear);

  const tamperedSources = structuredClone(valid);
  tamperedSources.evidence.sources.paths = ["scripts/other.js"];
  assert.equal(validateReviewDecision(tamperedSources).valid, false);

  const mismatchedClassification = structuredClone(valid);
  mismatchedClassification.evidence.classification = "high-risk";
  assert.equal(validateReviewDecision(mismatchedClassification).valid, false);

  const nonCanonicalSources = structuredClone(valid);
  nonCanonicalSources.evidence.sources.paths = ["z.js", "a.js"];
  nonCanonicalSources.evidence.fingerprint = evidenceFingerprint(nonCanonicalSources.classification, nonCanonicalSources.evidence.sources);
  assert.equal(validateReviewDecision(nonCanonicalSources).valid, false);

  const misplacedReason = structuredClone(valid);
  misplacedReason.dimensions.readability.reasons = [{
    code: "diff-process-execution",
    source: "real-diff",
    detail: "scripts/run.js",
    precedence: 2,
  }];
  assert.equal(validateReviewDecision(misplacedReason).valid, false);
});

function evidenceFingerprint(classification, sources) {
  return `sha256:${crypto.createHash("sha256").update(stableStringify({ classification, sources })).digest("hex")}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
