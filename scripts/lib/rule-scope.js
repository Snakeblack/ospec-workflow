"use strict";

// Scope of a source rule (roadmap E0.2), read from its VS Code-format
// `applyTo`. Each target expresses it with its own mechanism instead of
// turning every rule into an always-on instruction:
//   - global:       `applyTo: '**'` (or none): loaded on every request.
//   - orchestrator: `applyTo: 'agents/**'`: protocol for ospec's own agents,
//                   embedded in the orchestrator as Claude already does.
//   - path:         any other glob: loaded when matching files are in play.

const { getField } = require("./frontmatter.js");

const GLOBAL = new Set(["**", "**/*"]);
const AGENT_SCOPE = /^agents\//;

// Split on commas outside braces: "a/{x,y}, b" -> ["a/{x,y}", "b"].
function splitPatterns(value) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

// Hosts that split patterns on commas (Copilot, Antigravity) cannot take
// brace groups, so every target receives them expanded.
function expandBraces(glob) {
  const match = /\{([^{}]*)\}/.exec(glob);
  if (!match) return [glob];
  const head = glob.slice(0, match.index);
  const tail = glob.slice(match.index + match[0].length);
  return match[1].split(",").flatMap((option) => expandBraces(head + option + tail));
}

function ruleScope(frontmatter) {
  const applyTo = getField(frontmatter, "applyTo");
  const activation = getField(frontmatter, "activation");
  const conditional = !!activation && activation.value === "conditional";
  const patterns = applyTo ? splitPatterns(String(applyTo.value)) : [];
  if (patterns.length === 0 || patterns.some((pattern) => GLOBAL.has(pattern))) {
    return { kind: "global", globs: [], conditional };
  }
  if (patterns.every((pattern) => AGENT_SCOPE.test(pattern))) {
    return { kind: "orchestrator", globs: [], conditional };
  }
  return { kind: "path", globs: patterns.flatMap(expandBraces), conditional };
}

module.exports = { expandBraces, ruleScope };
