"use strict";

// Team profile and the defaults it decides (openspec/specs/idd/spec.md,
// REQ-idd-023). The profile states two facts about the team, its size and its
// experience; delivery, branching, review, Strict TDD and mentorship follow
// from them.
// It replaces the SDD scale preset, which is still read as a fallback. Each
// mode keeps the profile in its own configuration (ADR 0011): `resolveTeam`
// reads the active mode's declaration, as precommit-strict.js does. Pure: the
// caller reads the files and parses idd/config.yaml.

const TEAM_SIZES = Object.freeze(["solo", "small", "multi-team"]);
const TEAM_EXPERIENCE = Object.freeze(["junior", "mixed", "senior"]);
const TEAM_KEYS = Object.freeze(["size", "experience"]);
const SCALE_TO_SIZE = Object.freeze({ solo: "solo", team: "small", enterprise: "multi-team" });

const BY_SIZE = Object.freeze({
  solo: { delivery_strategy: "single-pr", branching: "serial", quality_review: false, traceability: "advisory", strict_tdd: false, tdd_mode: "standard" },
  small: { delivery_strategy: "ask-on-risk", branching: "parallel", quality_review: true, traceability: "advisory", strict_tdd: true, tdd_mode: "focused" },
  "multi-team": { delivery_strategy: "auto-chain", branching: "parallel", quality_review: true, traceability: "required", strict_tdd: true, tdd_mode: "strict" },
});
const MENTORSHIP = Object.freeze({ junior: "mentor", mixed: "balanced", senior: "expert" });
const REVIEW_BUDGET_LINES = 400;

// How a change reaches the default branch: why each value fits and the rules
// the agent follows. Guidance only: no git or pull request state is read.
const BRANCHING = Object.freeze({
  serial: {
    reasons: [
      "one pull request is in flight at a time, so the files every change touches (version, changelog) never conflict",
      "each branch starts from a default branch that already holds the previous merge",
    ],
    how: "before a new branch, merge the open pull request, with its release when the project cuts one per change; branch from the up-to-date default branch; if it moved, integrate it by merge, never by rewriting pushed history; delete the branch after its merge",
  },
  parallel: {
    reasons: [
      "several people deliver at once, and a single queue of pull requests would block them",
      "conflicts stay small because each branch integrates the default branch before its merge",
    ],
    how: "branch from the up-to-date default branch; before each merge, integrate the default branch by merge, never by rewriting pushed history; edit version and changelog last; delete the branch after its merge",
  },
});
const BRANCHING_VALUES = Object.freeze(Object.keys(BRANCHING));

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

// The branching of a project: an explicit `delivery.branching` wins over the
// profile, and without either `serial` is recommended, since it cannot
// conflict. Each answer carries its reasons and its rules.
function resolveBranching(declared, profile) {
  let value = "serial";
  let source = "recommended";
  let why = "no team profile or delivery.branching is declared, and serial cannot conflict";
  if (declared) [value, source, why] = [declared, "idd/config.yaml", "delivery.branching is declared in idd/config.yaml"];
  else if (profile) [value, source, why] = [BY_SIZE[profile.size].branching, "team profile", `team.size ${profile.size} recommends it`];
  return { value, source, reasons: [why, ...BRANCHING[value].reasons], how: BRANCHING[value].how };
}

/**
 * @param {{ idd?: { mode: string|null, team: object|null, delivery?: { branching: string|null } }|null, openspecText?: string|null, mode?: "idd"|"sdd"|null }} sources
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
  // Only IDD reads delivery.branching: SDD keeps its own configuration.
  const declared = mode === "idd" ? (idd?.delivery?.branching ?? null) : null;
  return { mode, profile, source, defaults: profile ? teamDefaults(profile) : null, branching: resolveBranching(declared, profile) };
}

module.exports = {
  BRANCHING_VALUES,
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
