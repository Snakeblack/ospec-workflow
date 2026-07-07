"use strict";

// I1 checker: cross-checks each skill's `runtime_capabilities:` frontmatter
// manifest against the `tools:` grant of the agent(s) that consume it
// (`skills` domain spec, Skill Runtime Capability Manifest — REQ-skills-001;
// `contract-lint` domain spec — REQ-contract-lint-002).
//
// Direction (a) — declared true capability must be backed by a tool grant —
// applies to every skill that declares a `runtime_capabilities:` block,
// regardless of tier. Direction (b) — every execute/edit tool the agent
// grants must be justified by a true declaration — applies ONLY to the 14
// canonical SDD phase skills (§1.1 of the `skills` domain spec), which are
// 1:1 bound to their phase agent. Utility/stack-tier skills may be consumed
// by more than one agent, so direction (b) would be unsound for them.

const fs = require("node:fs");
const path = require("node:path");

const { parse, getField } = require("../frontmatter.js");

// Canonical set of the 14 SDD-phase skills, sourced by name from
// `openspec/specs/skills/spec.md` §1.1. This is a literal copy of the spec's
// value — the spec is the authority for the *value*, not a runtime input to
// parse; a future canonical-set change updates both places together.
const PHASE_SKILLS = [
  "sdd-apply",
  "sdd-archive",
  "sdd-baseline",
  "sdd-clarify",
  "sdd-design",
  "sdd-explore",
  "sdd-foundation",
  "sdd-init",
  "sdd-onboard",
  "sdd-propose",
  "sdd-spec",
  "sdd-tasks",
  "sdd-verify",
  "sdd-workspace",
];

// Abstract capability -> concrete agent `tools:` grant name. `mcp` has no
// direction-(a) tool counterpart today (no phase skill declares it) and is
// intentionally absent from this map — a `mcp: true` declaration is a no-op
// for direction (a)/(b) until some agent tool represents it.
const CAPABILITY_TO_TOOL = { execute: "execute", write: "edit" };

const CAPABILITY_LINE = /^\s*(execute|mcp|write):\s*(true|false)\s*$/;

/**
 * Parses the `rawLines` of a `runtime_capabilities:` frontmatter field (the
 * shape returned by `frontmatter.js#parse`/`getField`) into
 * `{execute, mcp, write}` booleans. A missing field is treated as all-false
 * (REQ-skills-001 scenario "Missing manifest treated as all-false").
 *
 * @param {Array<{key: string|null, rawLines: string[]}>} frontmatter
 * @returns {{execute: boolean, mcp: boolean, write: boolean}}
 */
function parseRuntimeCapabilities(frontmatter) {
  const capabilities = { execute: false, mcp: false, write: false };
  const field = getField(frontmatter, "runtime_capabilities");

  if (!field) {
    return capabilities;
  }

  for (const line of field.rawLines) {
    const match = line.match(CAPABILITY_LINE);
    if (match) {
      capabilities[match[1]] = match[2] === "true";
    }
  }

  return capabilities;
}

function readFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return parse(text).frontmatter;
}

function readToolsGrant(agentPath) {
  const frontmatter = readFrontmatter(agentPath);
  const toolsField = getField(frontmatter, "tools");
  return Array.isArray(toolsField && toolsField.value) ? toolsField.value : [];
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

// Discovers which agent files, under `${root}/agents`, textually reference
// this skill (`skills/{skillName}/SKILL.md`) in their body — the same
// "Required skill" convention every agent file already uses to declare which
// SKILL.md it must follow. Used only for non-phase-tier skills, where there
// is no single static 1:1 binding to derive a consumer from.
function findConsumingAgents(root, skillName) {
  const agentsDir = path.join(root, "agents");
  if (!fs.existsSync(agentsDir)) {
    return [];
  }

  const marker = `skills/${skillName}/SKILL.md`;
  return fs
    .readdirSync(agentsDir)
    .filter((name) => name.endsWith(".agent.md"))
    .filter((name) => fs.readFileSync(path.join(agentsDir, name), "utf8").includes(marker))
    .map((name) => path.join(agentsDir, name));
}

// Direction (a): every capability the skill declares `true` MUST be backed
// by the consuming agent's `tools:` grant.
function checkDirectionA(skillPath, capabilities, agentPath, agentTools) {
  const offenders = [];

  for (const [capability, tool] of Object.entries(CAPABILITY_TO_TOOL)) {
    if (capabilities[capability] && !agentTools.includes(tool)) {
      offenders.push({
        checker: "i1-manifest",
        path: skillPath,
        expected: `${agentPath} tools: to include '${tool}' (skill declares ${capability}: true)`,
        actual: `${agentPath} tools: ${JSON.stringify(agentTools)}`,
        message:
          `${skillPath} declares runtime_capabilities.${capability}: true but its bound agent ` +
          `${agentPath} 'tools:' grant lacks '${tool}'`,
      });
    }
  }

  return offenders;
}

// Direction (b): every execute/edit tool the phase agent grants MUST be
// justified by a `true` declaration in its bound phase skill. Phase-tier
// only (REQ-skills-001).
function checkDirectionB(agentPath, agentTools, skillPath, capabilities) {
  const offenders = [];

  for (const [capability, tool] of Object.entries(CAPABILITY_TO_TOOL)) {
    if (agentTools.includes(tool) && !capabilities[capability]) {
      offenders.push({
        checker: "i1-manifest",
        path: agentPath,
        expected: `${skillPath} runtime_capabilities.${capability}: true (agent 'tools:' grants '${tool}')`,
        actual: `${skillPath} declares ${capability}: ${capabilities[capability]}`,
        message:
          `${agentPath} 'tools:' grant includes '${tool}' but its bound phase skill ` +
          `${skillPath} does not declare runtime_capabilities.${capability}: true`,
      });
    }
  }

  return offenders;
}

/**
 * @param {{root: string, phaseSkills?: string[]}} ctx - `phaseSkills`
 *   defaults to the real canonical 14; tests MAY override it to isolate a
 *   synthetic fixture skill as "phase tier" without touching PHASE_SKILLS.
 * @returns {import("../contract-lint.js").Offender[]}
 */
function check(ctx) {
  const root = ctx.root;
  const phaseSkills = ctx.phaseSkills || PHASE_SKILLS;
  const skillsDir = path.join(root, "skills");

  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const offenders = [];
  const skillNames = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name);

  for (const skillName of skillNames) {
    const absoluteSkillPath = path.join(skillsDir, skillName, "SKILL.md");
    if (!fs.existsSync(absoluteSkillPath)) {
      continue;
    }

    const skillPath = toPosix(path.relative(root, absoluteSkillPath));
    const capabilities = parseRuntimeCapabilities(readFrontmatter(absoluteSkillPath));
    const isPhaseSkill = phaseSkills.includes(skillName);

    if (isPhaseSkill) {
      const boundAgentPath = path.join(root, "agents", `${skillName}.agent.md`);
      if (!fs.existsSync(boundAgentPath)) {
        const relativeBoundAgentPath = toPosix(path.relative(root, boundAgentPath));
        offenders.push({
          checker: "i1-manifest",
          path: skillPath,
          expected: `agents/${skillName}.agent.md to exist (1:1 bound agent for phase skill '${skillName}')`,
          actual: "file does not exist",
          message:
            `phase skill ${skillName} has no bound agent file at ${relativeBoundAgentPath} — ` +
            "cannot verify tools contract",
        });
        continue;
      }
    }

    const consumingAgentPaths = isPhaseSkill
      ? [path.join(root, "agents", `${skillName}.agent.md`)]
      : findConsumingAgents(root, skillName);

    for (const absoluteAgentPath of consumingAgentPaths) {
      const agentPath = toPosix(path.relative(root, absoluteAgentPath));
      const agentTools = readToolsGrant(absoluteAgentPath);

      offenders.push(...checkDirectionA(skillPath, capabilities, agentPath, agentTools));

      if (isPhaseSkill) {
        offenders.push(...checkDirectionB(agentPath, agentTools, skillPath, capabilities));
      }
    }
  }

  return offenders;
}

module.exports = {
  check,
  parseRuntimeCapabilities,
  PHASE_SKILLS,
  CAPABILITY_TO_TOOL,
};
