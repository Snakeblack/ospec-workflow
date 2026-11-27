"use strict";

// Claude Code auto mode (#475, REQ-install-046): to bind the session, the
// PreToolUse hook of engram@engram rewrites the input of every tool its matcher
// names, and auto mode can deny a call whose input changed after the classifier
// reviewed it. A permissions.allow rule resolves the call before that review.
// `setup:claude` writes these rules and `ospec doctor` checks them.
//
// This module only names the tools to build permission rules: it requires
// nothing, reads nothing and calls no Engram tool (REQ-session-memory-002;
// scripts/session-memory-contract.test.js holds it to that). The rules cover
// the non-destructive tools of the matcher, under both of its prefixes;
// mem_delete and mem_merge_projects keep going through the classifier.

const ENGRAM_CLAUDE_WRITE_TOOLS = [
  "mem_save", "mem_update", "mem_review", "mem_save_prompt", "mem_pin", "mem_unpin",
  "mem_session_summary", "mem_session_start", "mem_session_end", "mem_capture_passive",
  "mem_judge", "mem_compare",
];
const ENGRAM_CLAUDE_SERVERS = ["mcp__engram", "mcp__plugin_engram_engram"];
const ENGRAM_CLAUDE_ALLOW_RULES = ENGRAM_CLAUDE_SERVERS.flatMap((server) => ENGRAM_CLAUDE_WRITE_TOOLS.map((tool) => `${server}__${tool}`));
// Antigravity prompts on unconfigured MCP tools by default; list non-destructive
// read and write tools using `mcp(engram/<tool>)` while keeping mem_delete and
// mem_merge_projects out of permissions.allow.
const ENGRAM_ANTIGRAVITY_TOOLS = [
  ...ENGRAM_CLAUDE_WRITE_TOOLS,
  "mem_judge_many", "mem_session_finalize", "mem_consolidate",
  "mem_context", "mem_search", "mem_search_prompts", "mem_get_observation",
  "mem_current_project", "mem_list_projects", "mem_suggest_topic_key", "mem_doctor",
];
const ENGRAM_ANTIGRAVITY_ALLOW_RULES = ENGRAM_ANTIGRAVITY_TOOLS.map((tool) => `mcp(engram/${tool})`);

function globMatches(pattern, value) {
  const re = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${re}$`).test(value);
}

// A tool rule is covered by itself, by its server's rule (`mcp__engram`) and by a
// tool-name glob after the server prefix (`mcp__engram__*`, `mcp__engram__mem_s*`),
// the forms Claude Code permission rules accept for MCP tools.
function ruleCovers(rule, toolRule) {
  const server = toolRule.slice(0, toolRule.lastIndexOf("__mem_"));
  if (rule === server) return true;
  if (!rule.startsWith(`${server}__`)) return false;
  return globMatches(rule, toolRule);
}

function antigravityRuleCovers(rule, toolRule) {
  if (rule === toolRule || rule === "mcp(engram/*)") return true;
  if (!rule.startsWith("mcp(engram/") || !rule.endsWith(")")) return false;
  return globMatches(rule.slice(11, -1), toolRule.slice(11, -1));
}

function decidedRules(settings) {
  const permissions = settings && settings.permissions;
  if (permissions !== undefined && (!permissions || typeof permissions !== "object" || Array.isArray(permissions))) {
    return { ok: false, reason: "permissions is not an object" };
  }
  const decided = [];
  for (const key of ["allow", "ask", "deny"]) {
    const list = permissions ? permissions[key] : undefined;
    if (list !== undefined && !Array.isArray(list)) return { ok: false, reason: `permissions.${key} is not an array` };
    for (const rule of list || []) if (typeof rule === "string") decided.push(rule);
  }
  return { ok: true, decided };
}

// Pure. The engram allow rules that a settings object lacks. A tool the user
// already lists under permissions.ask or permissions.deny is never reported.
function missingEngramAllowRules(settings) {
  const parsed = decidedRules(settings);
  if (!parsed.ok) return parsed;
  return { ok: true, missing: ENGRAM_CLAUDE_ALLOW_RULES.filter((toolRule) => !parsed.decided.some((rule) => ruleCovers(rule, toolRule))) };
}

function missingAntigravityEngramAllowRules(settings) {
  const parsed = decidedRules(settings);
  if (!parsed.ok) return parsed;
  return { ok: true, missing: ENGRAM_ANTIGRAVITY_ALLOW_RULES.filter((toolRule) => !parsed.decided.some((rule) => antigravityRuleCovers(rule, toolRule))) };
}

module.exports = {
  ENGRAM_CLAUDE_ALLOW_RULES,
  ENGRAM_ANTIGRAVITY_ALLOW_RULES,
  missingEngramAllowRules,
  missingAntigravityEngramAllowRules,
};
