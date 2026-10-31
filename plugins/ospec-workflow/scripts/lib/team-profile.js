"use strict";

// Team profile and the defaults it decides (openspec/specs/idd/spec.md,
// REQ-idd-023). The profile states two facts about the team, its size and its
// experience; delivery, branching, changelog, release, review, Strict TDD and
// mentorship follow from them.
// It replaces the SDD scale preset, which is still read as a fallback. Each
// mode keeps the profile in its own configuration (ADR 0011): `resolveTeam`
// reads the active mode's declaration, as precommit-strict.js does. Pure: the
// caller reads the files and parses idd/config.yaml.

const TEAM_SIZES = Object.freeze(["solo", "small", "multi-team"]);
const TEAM_EXPERIENCE = Object.freeze(["junior", "mixed", "senior"]);
const TEAM_KEYS = Object.freeze(["size", "experience"]);
const SCALE_TO_SIZE = Object.freeze({ solo: "solo", team: "small", enterprise: "multi-team" });

const BY_SIZE = Object.freeze({
  solo: { delivery_strategy: "single-pr", branching: "serial", changelog: "CHANGELOG.md", release: "per-change", quality_review: false, traceability: "advisory", strict_tdd: false, tdd_mode: "standard" },
  small: { delivery_strategy: "ask-on-risk", branching: "parallel", changelog: "CHANGELOG.md", release: "batched", quality_review: true, traceability: "advisory", strict_tdd: true, tdd_mode: "focused" },
  "multi-team": { delivery_strategy: "auto-chain", branching: "parallel", changelog: "CHANGELOG.md", release: "batched", quality_review: true, traceability: "required", strict_tdd: true, tdd_mode: "strict" },
});
const MENTORSHIP = Object.freeze({ junior: "mentor", mixed: "balanced", senior: "expert" });
const REVIEW_BUDGET_LINES = 400;

// The branch work branches start from and merge into: the default branch, or
// the integration branch idd/config.yaml declares.
function baseBranch(integration) {
  if (!integration) return { name: "default branch", a: "a default branch" };
  return { name: `integration branch ${integration}`, a: `the integration branch ${integration}` };
}

// How a change reaches its base branch: why each value fits and the rules the
// agent follows. Guidance only: no git or pull request state is read.
const BRANCHING = Object.freeze({
  serial: (base) => ({
    reasons: [
      "one pull request is in flight at a time, so the files every change touches (version, changelog) never conflict",
      `each branch starts from ${base.a} that already holds the previous merge`,
    ],
    how: `before a new branch, merge the open pull request, with its release when the project cuts one per change; branch from the up-to-date ${base.name}; if it moved, integrate it by merge, never by rewriting pushed history; delete the branch after its merge`,
  }),
  parallel: (base) => ({
    reasons: [
      "several people deliver at once, and a single queue of pull requests would block them",
      `conflicts stay small because each branch integrates the ${base.name} before its merge`,
    ],
    how: `branch from the up-to-date ${base.name}; before each merge, integrate the ${base.name} by merge, never by rewriting pushed history; edit version and changelog last; delete the branch after its merge`,
  }),
});
const BRANCHING_VALUES = Object.freeze(Object.keys(BRANCHING));

// What a closed change leaves in the changelog and when a version is cut
// (E3.9). ospec close acts on them only once idd/config.yaml declares them.
const CHANGELOG_NONE = "none";
function changelogGuidance(file) {
  if (file === CHANGELOG_NONE) return { reasons: ["the project keeps no changelog"], how: "no changelog entry is written" };
  return {
    reasons: ["the changelog tells users what each version changed, in the Keep a Changelog format"],
    how: `ospec close adds the change's entry under ## [Unreleased] of ${file}; edit it before the release when it needs more detail`,
  };
}
const RELEASE = Object.freeze({
  "per-change": {
    reasons: ["each merged change gets its own version, so [Unreleased] never piles up and a version maps to one pull request"],
    how: "after the merge, propose the release ospec close returned (version, tag and notes) and ask whether it breaks compatibility, which makes it a major; with the user's OK update the version files, move [Unreleased] under the version and tag it",
  },
  batched: {
    reasons: ["several people merge at once, and one release groups their changes instead of a version per pull request"],
    how: "entries accumulate under [Unreleased]; propose a release only when the user asks, a minor when it holds an Added entry and else a patch, and cut it only with the user's OK",
  },
  none: { reasons: ["the project publishes no versions"], how: "no release is proposed" },
});
const RELEASE_VALUES = Object.freeze(Object.keys(RELEASE));

// The production branch the rules name: the declared one, or the default
// branch.
function productionName(production) {
  return production ?? "the default branch";
}

// With an integration branch a version is cut on each promotion to
// production, never on each merge into it (#458).
function promotedRelease({ integration, production }) {
  const prod = productionName(production);
  return {
    reasons: [`${integration} gathers the merged changes, and each promotion to ${prod} cuts one version for them`],
    how: `entries accumulate under [Unreleased] of ${integration}; propose a release when ${integration} is promoted to ${prod} or a release/x.y is cut from it, a minor when it holds an Added entry and else a patch; ask whether it breaks compatibility, which makes it a major, and cut it only with the user's OK`,
  };
}

// How the integration branch, production and an optional release/x.y relate:
// guidance only, like the branching.
function integrationGuidance({ integration, production }) {
  const prod = productionName(production);
  return {
    reasons: [
      `${integration} gathers the merged work, and ${prod} receives only what is ready to use`,
      `a version is cut on each promotion to ${prod}, not on each merge into ${integration}`,
    ],
    how: [
      `work branches start from the up-to-date ${integration} and their pull requests target ${integration}; ospec close runs on the work branch, and its entry reaches [Unreleased] of ${integration} with the merge`,
      `the commit that opens a change so its phase shows in progress, holding only idd/<change>/, goes to ${integration}`,
      `${prod} receives merges only from ${integration} or a release/x.y, each one a version with its tag even with phases pending, never rewriting published history`,
      `a release/x.y is optional pre-production: it starts from ${integration}, takes only fixes, may carry x.y.z-rc.N versions, merges into ${prod} with its tag and back into ${integration}, and is then deleted`,
      `the release commit that moves [Unreleased] under the version reaches ${integration} by merging ${prod} or the release/x.y back into it`,
    ].join("; "),
  };
}

// The value without a profile or a declaration, and why it is recommended.
const RECOMMENDED = Object.freeze({
  branching: { value: "serial", why: "serial cannot conflict" },
  changelog: { value: "CHANGELOG.md", why: "CHANGELOG.md is where Keep a Changelog keeps it" },
  release: { value: "per-change", why: "a release per change keeps each version to one change" },
});
const GUIDANCE = Object.freeze({
  branching: (value, context) => BRANCHING[value](baseBranch(context.integration)),
  changelog: changelogGuidance,
  release: (value, context) => (value === "batched" && context.integration ? promotedRelease(context) : RELEASE[value]),
});

class TeamProfileError extends Error {
  constructor(message) {
    super(message);
    this.name = "TeamProfileError";
    this.code = "team-invalid";
  }
}

// A `team:` section as parsed key/value pairs: size is required, experience
// optional (null leaves mentorship at its default).
function validateTeam(section) {
  for (const key of Object.keys(section)) {
    if (!TEAM_KEYS.includes(key)) throw new TeamProfileError(`unknown team key: ${key}`);
  }
  const { size, experience = null } = section;
  if (!TEAM_SIZES.includes(size)) throw new TeamProfileError(`team.size must be ${TEAM_SIZES.join(", ")}, got ${size ?? "nothing"}`);
  if (experience !== null && !TEAM_EXPERIENCE.includes(experience)) {
    throw new TeamProfileError(`team.experience must be ${TEAM_EXPERIENCE.join(", ")}, got ${experience}`);
  }
  return { size, experience };
}

function teamDefaults({ size, experience = null }) {
  const bySize = BY_SIZE[size];
  const junior = experience === "junior";
  return {
    delivery_strategy: bySize.delivery_strategy,
    branching: bySize.branching,
    changelog: bySize.changelog,
    release: bySize.release,
    review: { quality_review: bySize.quality_review, traceability: bySize.traceability, budget_lines: REVIEW_BUDGET_LINES },
    strict_tdd: junior || bySize.strict_tdd,
    tdd_mode: junior ? "strict" : bySize.tdd_mode,
    mentorship: experience ? MENTORSHIP[experience] : "balanced",
  };
}

// Top-level `team:` and `scale:` of openspec/config.yaml. Only these keys are
// read; the rest of the file belongs to SDD.
function readOpenspecTeam(text) {
  const lines = String(text).split(/\r?\n/);
  let team = null;
  let scale = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const scaleEntry = /^scale:\s*["']?([A-Za-z-]+)/.exec(line);
    if (scaleEntry) scale = scaleEntry[1];
    if (!/^team:\s*(#.*)?$/.test(line)) continue;
    team = {};
    for (index += 1; index < lines.length; index += 1) {
      const nested = lines[index];
      if (nested.trim() === "" || /^\s*#/.test(nested)) continue;
      const entry = /^\s+([A-Za-z_-]+):\s*["']?([^\s"'#]*)["']?\s*(#.*)?$/.exec(nested);
      if (!entry) {
        index -= 1;
        break;
      }
      team[entry[1]] = entry[2];
    }
  }
  return { team, scale };
}

function legacyScale(scale) {
  if (!(scale in SCALE_TO_SIZE)) throw new TeamProfileError(`scale must be ${Object.keys(SCALE_TO_SIZE).join(", ")}, got ${scale}`);
  return { size: SCALE_TO_SIZE[scale], experience: null };
}

// One delivery key of a project (branching, changelog or release): an explicit
// `delivery.<key>` wins over the profile, and without either the recommended
// value applies; with an integration branch only batched fits the release.
// Each answer carries its reasons and its rules.
function resolveDelivery(key, declared, profile, context) {
  let { value } = RECOMMENDED[key];
  let source = "recommended";
  let why = `no team profile or delivery.${key} is declared, and ${RECOMMENDED[key].why}`;
  if (declared) [value, source, why] = [declared, "idd/config.yaml", `delivery.${key} is declared in idd/config.yaml`];
  else if (key === "release" && context.integration) {
    [value, why] = ["batched", "delivery.integration_branch is declared, and batched cuts a version on each promotion"];
  } else if (profile) [value, source, why] = [BY_SIZE[profile.size][key], "team profile", `team.size ${profile.size} recommends it`];
  const { reasons, how } = GUIDANCE[key](value, context);
  return { value, source, reasons: [why, ...reasons], how };
}

/**
 * @param {{ idd?: { mode: string|null, team: object|null, delivery?: { branching: string|null, changelog: string|null, release: string|null, integration_branch?: string|null, production_branch?: string|null } }|null, openspecText?: string|null, mode?: "idd"|"sdd"|null }} sources
 * `idd` is the parsed idd/config.yaml; null means that file is absent, as a
 * null text does. `mode` reads one mode's declaration whatever mode is active.
 */
function resolveTeam({ idd = null, openspecText = null, mode: requested = null } = {}) {
  const mode = requested ?? (idd && idd.mode !== "sdd" ? "idd" : "sdd");
  let profile = null;
  let source = null;
  if (mode === "idd") {
    if (idd?.team) [profile, source] = [idd.team, "idd/config.yaml"];
  } else if (openspecText != null) {
    const declared = readOpenspecTeam(openspecText);
    if (declared.team) [profile, source] = [validateTeam(declared.team), "openspec/config.yaml"];
    else if (declared.scale) [profile, source] = [legacyScale(declared.scale), "openspec/config.yaml scale"];
  }
  // Only IDD reads delivery: SDD keeps its own configuration.
  const declared = (key) => (mode === "idd" ? (idd?.delivery?.[key] ?? null) : null);
  const context = { integration: declared("integration_branch"), production: declared("production_branch") };
  const result = {
    mode,
    profile,
    source,
    defaults: profile ? teamDefaults(profile) : null,
    branching: resolveDelivery("branching", declared("branching"), profile, context),
    changelog: resolveDelivery("changelog", declared("changelog"), profile, context),
    release: resolveDelivery("release", declared("release"), profile, context),
  };
  // Only a declared integration branch adds its rules.
  if (context.integration) {
    const { reasons, how } = integrationGuidance(context);
    result.integration = {
      value: context.integration,
      production: context.production,
      source: "idd/config.yaml",
      reasons: ["delivery.integration_branch is declared in idd/config.yaml", ...reasons],
      how,
    };
  }
  return result;
}

module.exports = {
  BRANCHING_VALUES,
  CHANGELOG_NONE,
  RELEASE_VALUES,
  REVIEW_BUDGET_LINES,
  SCALE_TO_SIZE,
  TEAM_EXPERIENCE,
  TEAM_SIZES,
  TeamProfileError,
  readOpenspecTeam,
  resolveTeam,
  teamDefaults,
  validateTeam,
};
