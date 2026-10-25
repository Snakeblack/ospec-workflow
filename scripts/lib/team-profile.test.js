"use strict";

// Team profile defaults (openspec/specs/idd/spec.md, REQ-idd-023).

const test = require("node:test");
const assert = require("node:assert");

const { parseIddConfig } = require("./idd-config.js");
const { TeamProfileError, readOpenspecTeam, resolveTeam, teamDefaults, validateTeam } = require("./team-profile.js");

test("each size decides delivery, branching, changelog, release, review and Strict TDD", () => {
  assert.deepStrictEqual(teamDefaults({ size: "solo" }), {
    delivery_strategy: "single-pr",
    branching: "serial",
    changelog: "CHANGELOG.md",
    release: "per-change",
    review: { quality_review: false, traceability: "advisory", budget_lines: 400 },
    strict_tdd: false,
    tdd_mode: "standard",
    mentorship: "balanced",
  });
  assert.deepStrictEqual(teamDefaults({ size: "small" }), {
    delivery_strategy: "ask-on-risk",
    branching: "parallel",
    changelog: "CHANGELOG.md",
    release: "batched",
    review: { quality_review: true, traceability: "advisory", budget_lines: 400 },
    strict_tdd: true,
    tdd_mode: "focused",
    mentorship: "balanced",
  });
  assert.deepStrictEqual(teamDefaults({ size: "multi-team" }), {
    delivery_strategy: "auto-chain",
    branching: "parallel",
    changelog: "CHANGELOG.md",
    release: "batched",
    review: { quality_review: true, traceability: "required", budget_lines: 400 },
    strict_tdd: true,
    tdd_mode: "strict",
    mentorship: "balanced",
  });
});

test("experience decides mentorship, and a junior team always gets Strict TDD", () => {
  assert.strictEqual(teamDefaults({ size: "solo", experience: "senior" }).mentorship, "expert");
  assert.strictEqual(teamDefaults({ size: "solo", experience: "mixed" }).mentorship, "balanced");
  const junior = teamDefaults({ size: "solo", experience: "junior" });
  assert.strictEqual(junior.mentorship, "mentor");
  assert.strictEqual(junior.strict_tdd, true);
  assert.strictEqual(junior.tdd_mode, "strict");
  assert.strictEqual(junior.delivery_strategy, "single-pr");
});

test("a profile needs a known size and accepts only known keys", () => {
  assert.deepStrictEqual(validateTeam({ size: "small" }), { size: "small", experience: null });
  for (const [section, pattern] of [
    [{}, /team.size must be solo, small, multi-team, got nothing/],
    [{ size: "team" }, /got team/],
    [{ size: "solo", experience: "expert" }, /team.experience must be junior, mixed, senior/],
    [{ size: "solo", seniority: "senior" }, /unknown team key: seniority/],
  ]) {
    assert.throws(() => validateTeam(section), (error) => error instanceof TeamProfileError && error.code === "team-invalid" && pattern.test(error.message));
  }
});

test("openspec/config.yaml gives its top-level team section and scale only", () => {
  const text = [
    "schema: spec-driven",
    "# scale: enterprise",
    "testing:",
    "  size: ignored",
    "team:   # the team profile",
    "  size: \"multi-team\"",
    "",
    "  # comment inside",
    "  experience: junior   # new hires",
    "mentorship:",
    "  mode: expert",
    "scale: solo",
  ].join("\r\n");
  assert.deepStrictEqual(readOpenspecTeam(text), { team: { size: "multi-team", experience: "junior" }, scale: "solo" });
  assert.deepStrictEqual(readOpenspecTeam("schema: spec-driven\n"), { team: null, scale: null });
});

test("two projects with different teams get different defaults without a question", () => {
  const solo = resolveTeam({ idd: parseIddConfig("team:\n  size: solo\n  experience: senior\n") });
  const multi = resolveTeam({ idd: parseIddConfig("team:\n  size: multi-team\n  experience: junior\n") });
  assert.deepStrictEqual([solo.mode, solo.source, solo.profile], ["idd", "idd/config.yaml", { size: "solo", experience: "senior" }]);
  assert.deepStrictEqual([multi.mode, multi.source], ["idd", "idd/config.yaml"]);
  for (const key of ["delivery_strategy", "review", "strict_tdd", "mentorship"]) {
    assert.notDeepStrictEqual(solo.defaults[key], multi.defaults[key], `${key} must differ`);
  }
});

test("each mode reads only its own declaration (ADR 0011)", () => {
  const openspecText = "team:\n  size: small\n";
  // IDD never reads openspec/, even when it holds a profile.
  const { branching, changelog, release, ...iddTeam } = resolveTeam({ idd: parseIddConfig("checks:\n  test: npm test\n"), openspecText });
  assert.deepStrictEqual(iddTeam, { mode: "idd", profile: null, source: null, defaults: null });
  assert.strictEqual(branching.source, "recommended");
  // SDD (mode: sdd, or no idd/config.yaml) never reads the IDD team section.
  const sdd = resolveTeam({ idd: parseIddConfig("mode: sdd\nteam:\n  size: solo\n"), openspecText });
  assert.deepStrictEqual([sdd.mode, sdd.source, sdd.profile], ["sdd", "openspec/config.yaml", { size: "small", experience: null }]);
  assert.strictEqual(resolveTeam({ openspecText }).source, "openspec/config.yaml");
  // A requested mode reads that mode's declaration whatever mode is active.
  const idd = parseIddConfig("team:\n  size: solo\n");
  assert.strictEqual(resolveTeam({ idd, openspecText, mode: "sdd" }).profile.size, "small");
  assert.strictEqual(resolveTeam({ idd: parseIddConfig("mode: sdd\nteam:\n  size: solo\n"), openspecText, mode: "idd" }).profile.size, "solo");
  assert.strictEqual(resolveTeam({ openspecText, mode: "idd" }).profile, null);
});

test("SDD falls back to the legacy scale, and no profile keeps today's behavior", () => {
  const legacy = (scale) => resolveTeam({ openspecText: `scale: ${scale}\n` });
  assert.deepStrictEqual(legacy("solo").profile, { size: "solo", experience: null });
  assert.deepStrictEqual(legacy("team").profile, { size: "small", experience: null });
  assert.deepStrictEqual(legacy("enterprise").profile, { size: "multi-team", experience: null });
  assert.strictEqual(legacy("team").source, "openspec/config.yaml scale");
  assert.strictEqual(resolveTeam({ openspecText: "team:\n  size: solo\nscale: enterprise\n" }).profile.size, "solo");
  assert.throws(() => legacy("huge"), (error) => error.code === "team-invalid" && /scale must be solo, team, enterprise/.test(error.message));
  assert.throws(() => resolveTeam({ openspecText: "team:\n  size: big\n" }), (error) => error.code === "team-invalid");
  const { branching, changelog, release, ...none } = resolveTeam({});
  assert.deepStrictEqual(none, { mode: "sdd", profile: null, source: null, defaults: null });
  assert.deepStrictEqual([branching.value, branching.source], ["serial", "recommended"]);
});

test("[REQ-idd-023] delivery.branching wins over the profile, and without either serial is recommended", () => {
  const explicit = resolveTeam({ idd: parseIddConfig("team:\n  size: solo\ndelivery:\n  branching: parallel\n") }).branching;
  assert.deepStrictEqual([explicit.value, explicit.source], ["parallel", "idd/config.yaml"]);
  assert.match(explicit.reasons[0], /delivery.branching is declared in idd\/config.yaml/);
  const profiled = resolveTeam({ idd: parseIddConfig("team:\n  size: multi-team\n") }).branching;
  assert.deepStrictEqual([profiled.value, profiled.source], ["parallel", "team profile"]);
  assert.match(profiled.reasons[0], /team.size multi-team recommends it/);
  const none = resolveTeam({ idd: parseIddConfig("checks:\n  test: npm test\n") }).branching;
  assert.deepStrictEqual([none.value, none.source], ["serial", "recommended"]);
  assert.match(none.how, /^before a new branch, merge the open pull request/);
  // Every answer says why it fits and what to do, and no rule rewrites pushed history.
  for (const branching of [explicit, profiled, none]) {
    assert.ok(branching.reasons.length > 1, "a source reason and the reasons of the value");
    assert.match(branching.how, /never by rewriting pushed history/);
    assert.match(branching.how, /delete the branch after its merge/);
  }
  // SDD keeps its own configuration (ADR 0011): the IDD delivery section is not read.
  const sdd = resolveTeam({ idd: parseIddConfig("mode: sdd\ndelivery:\n  branching: parallel\n"), openspecText: "team:\n  size: solo\n" });
  assert.deepStrictEqual([sdd.branching.value, sdd.branching.source], ["serial", "team profile"]);
});

test("[REQ-idd-025] delivery.changelog and delivery.release win over the profile, which only recommends them", () => {
  const explicit = resolveTeam({ idd: parseIddConfig("team:\n  size: small\ndelivery:\n  changelog: docs/HISTORY.md\n  release: per-change\n") });
  assert.deepStrictEqual([explicit.changelog.value, explicit.changelog.source], ["docs/HISTORY.md", "idd/config.yaml"]);
  assert.match(explicit.changelog.reasons[0], /delivery.changelog is declared in idd\/config.yaml/);
  assert.match(explicit.changelog.how, /under ## \[Unreleased\] of docs\/HISTORY.md/);
  assert.deepStrictEqual([explicit.release.value, explicit.release.source], ["per-change", "idd/config.yaml"]);
  // Two sizes recommend different cadences, each with its reasons.
  const solo = resolveTeam({ idd: parseIddConfig("team:\n  size: solo\n") });
  const multi = resolveTeam({ idd: parseIddConfig("team:\n  size: multi-team\n") });
  assert.deepStrictEqual([solo.release.value, solo.release.source, multi.release.value], ["per-change", "team profile", "batched"]);
  assert.match(multi.release.reasons[0], /team.size multi-team recommends it/);
  assert.match(multi.release.how, /only when the user asks/);
  assert.deepStrictEqual([multi.changelog.value, multi.changelog.source], ["CHANGELOG.md", "team profile"]);
  const none = resolveTeam({ idd: parseIddConfig("checks:\n  test: npm test\n") });
  assert.deepStrictEqual([none.changelog.value, none.changelog.source, none.release.value], ["CHANGELOG.md", "recommended", "per-change"]);
  assert.match(none.release.reasons[0], /no team profile or delivery.release is declared/);
  // Every cadence that proposes a release leaves it to the user's OK.
  for (const release of [solo.release, multi.release]) assert.match(release.how, /user's OK/);
  const off = resolveTeam({ idd: parseIddConfig("delivery:\n  changelog: none\n  release: none\n") });
  assert.deepStrictEqual([off.changelog.how, off.release.how], ["no changelog entry is written", "no release is proposed"]);
  // SDD does not read the IDD delivery section (ADR 0011).
  const sdd = resolveTeam({ idd: parseIddConfig("mode: sdd\ndelivery:\n  release: none\n"), openspecText: "team:\n  size: solo\n" });
  assert.deepStrictEqual([sdd.release.value, sdd.release.source], ["per-change", "team profile"]);
});
