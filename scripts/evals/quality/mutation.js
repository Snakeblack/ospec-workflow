"use strict";

// Mutation testing of a delivery: each mutant changes one operator, literal or
// throw on a line the agent added to production code, and the delivered test
// suite runs against it in a copy of the workspace. A mutant the suite fails on
// is killed; one it passes survives. The mutation score says how well the
// agent's tests protect the agent's code.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Replaces string, template and comment contents with spaces, keeping offsets,
// so no operator inside them is mutated.
function maskLiterals(line) {
  const chars = [...line];
  let quote = null;
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    if (quote) {
      if (char === "\\") {
        chars[i] = " ";
        if (i + 1 < chars.length) chars[i + 1] = " ";
        i += 1;
      } else if (char === quote) {
        quote = null;
      } else {
        chars[i] = " ";
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "/" && chars[i + 1] === "/") {
      for (let j = i; j < chars.length; j += 1) chars[j] = " ";
      break;
    } else if (char === "/" && chars[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2);
      const stop = end === -1 ? chars.length : end + 2;
      for (let j = i; j < stop; j += 1) chars[j] = " ";
      i = stop - 1;
    }
  }
  return chars.join("");
}

// Each rule finds its token in the masked line; `guard` rejects matches that
// belong to a longer token (arrows, ++, ===).
const RULES = Object.freeze([
  { operator: "equality", token: "===", to: "!==" },
  { operator: "equality", token: "!==", to: "===" },
  { operator: "equality", token: "==", to: "!=", guard: (m, i) => m[i - 1] !== "=" && m[i - 1] !== "!" && m[i + 2] !== "=" },
  { operator: "equality", token: "!=", to: "==", guard: (m, i) => m[i + 2] !== "=" },
  { operator: "relational", token: "<=", to: "<" },
  { operator: "relational", token: ">=", to: ">", guard: (m, i) => m[i - 1] !== "=" },
  { operator: "relational", token: "<", to: "<=", guard: (m, i) => !"<=".includes(m[i + 1] || "") && m[i - 1] !== "<" },
  { operator: "relational", token: ">", to: ">=", guard: (m, i) => !">=".includes(m[i + 1] || "") && !"=->".includes(m[i - 1] || "") },
  { operator: "logical", token: "&&", to: "||" },
  { operator: "logical", token: "||", to: "&&" },
  { operator: "arithmetic", token: "+", to: "-", guard: (m, i) => !"+=".includes(m[i + 1] || "") && m[i - 1] !== "+" },
  { operator: "arithmetic", token: "-", to: "+", guard: (m, i) => !"-=>".includes(m[i + 1] || "") && m[i - 1] !== "-" },
]);

const WORD_RULES = Object.freeze([
  { operator: "boolean", pattern: /\btrue\b/, to: "false" },
  { operator: "boolean", pattern: /\bfalse\b/, to: "true" },
  { operator: "throw", pattern: /\bthrow\s/, to: "void " },
]);

function isComment(line) {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function replaceAt(line, index, length, text) {
  return line.slice(0, index) + text + line.slice(index + length);
}

function firstTokenIndex(masked, rule) {
  let from = 0;
  while (from <= masked.length) {
    const index = masked.indexOf(rule.token, from);
    if (index === -1) return -1;
    if (!rule.guard || rule.guard(masked, index)) return index;
    from = index + 1;
  }
  return -1;
}

/** Mutants of one added line: the first occurrence of each rule's token. */
function generateMutants(file, line, text) {
  if (isComment(text)) return [];
  const masked = maskLiterals(text);
  const mutants = [];
  const seen = new Set();
  const push = (operator, mutated) => {
    if (mutated === text || seen.has(mutated)) return;
    seen.add(mutated);
    mutants.push({ file, line, operator, text: mutated });
  };
  for (const rule of RULES) {
    const index = firstTokenIndex(masked, rule);
    if (index !== -1) push(rule.operator, replaceAt(text, index, rule.token.length, rule.to));
  }
  for (const rule of WORD_RULES) {
    const match = rule.pattern.exec(masked);
    if (match) push(rule.operator, replaceAt(text, match.index, match[0].length, rule.to));
  }
  const literal = /(?<![\w.$])\d+(?![\w.])/.exec(masked);
  if (literal) push("literal", replaceAt(text, literal.index, literal[0].length, String(Number(literal[0]) + 1)));
  return mutants;
}

/** At most `limit` items, evenly spread and always including both ends. */
function sampleEvenly(items, limit) {
  if (items.length <= limit) return [...items];
  if (limit <= 1) return items.slice(0, limit);
  const step = (items.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, i) => items[Math.round(i * step)]);
}

// --- running -----------------------------------------------------------------

function copyWorkspace(workspace) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-mutation-"));
  fs.cpSync(workspace, dir, {
    recursive: true,
    filter: (source) => !/[\\/](\.git|node_modules)$/.test(source),
  });
  return dir;
}

function runSuite(dir, command, timeoutMs) {
  const result = spawnSync(command.file, command.args, { cwd: dir, encoding: "utf8", timeout: timeoutMs, windowsHide: true });
  return { passed: result.status === 0, timedOut: result.error?.code === "ETIMEDOUT" };
}

/**
 * Runs every sampled mutant against the delivered suite in a copy of the
 * workspace. Returns null scores when the unmutated suite already fails.
 */
function runMutation({ workspace, added, sourceFiles, command, limit = 60, timeoutMs = 60000 }) {
  const dir = copyWorkspace(workspace);
  try {
    const sane = runSuite(dir, command, timeoutMs);
    if (!sane.passed) return { suite_passes: false, total: 0, killed: 0, survived: [], score: null };

    const candidates = [];
    for (const file of sourceFiles) {
      const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
      for (const number of added[file] || []) {
        candidates.push(...generateMutants(file, number, lines[number - 1] ?? ""));
      }
    }
    const mutants = sampleEvenly(candidates, limit);
    let killed = 0;
    const survived = [];
    for (const mutant of mutants) {
      const target = path.join(dir, mutant.file);
      const original = fs.readFileSync(target, "utf8");
      const lines = original.split("\n");
      lines[mutant.line - 1] = mutant.text;
      fs.writeFileSync(target, lines.join("\n"));
      const outcome = runSuite(dir, command, timeoutMs);
      fs.writeFileSync(target, original);
      if (outcome.passed) survived.push({ file: mutant.file, line: mutant.line, operator: mutant.operator, text: mutant.text.trim() });
      else killed += 1;
    }
    const total = mutants.length;
    return {
      suite_passes: true,
      candidates: candidates.length,
      total,
      killed,
      survived,
      score: total > 0 ? Math.round((killed / total) * 1000) / 10 : null,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { generateMutants, maskLiterals, runMutation, sampleEvenly };
