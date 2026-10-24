"use strict";

// Feature open-facts coverage (openspec/specs/idd/spec.md, REQ-idd-018).
// A feature accounts for every category with a concrete question or a cite
// the CLI has already resolved, and asks at least one of them (#390). Pure:
// the caller reads files and the request.

const FEATURE_CATEGORIES = Object.freeze([
  { id: "inputs", label: "entradas y límites" },
  { id: "uniqueness", label: "unicidad y normalización" },
  { id: "persistence", label: "persistencia y datos corruptos" },
  { id: "copy", label: "textos visibles" },
  { id: "url-state", label: "estado en la URL" },
  { id: "accessibility", label: "accesibilidad" },
  { id: "errors", label: "errores" },
]);

const CATEGORY_IDS = Object.freeze(FEATURE_CATEGORIES.map((category) => category.id));
const MIN_QUOTE = 12;
const STOP = new Set(
  "el la los las un una de del al y o en se es son por para con sin que qué como cómo cual cuál cuando the a an of to and or is are for what how does do if when this that not".split(" "),
);

const FEATURE_COVERAGE_HOW = [
  'ospec record intent --change <id> --kind feature --summary "<what>" --acceptance "<observable result>" --request "<the user\'s words>"',
  '--open-fact inputs:"<question naming a value, limit or format>"',
  "--cite persistence=README.md:12",
  '--quote copy="<a literal fragment of --request, at least 12 characters>"',
  `Categories: ${FEATURE_CATEGORIES.map((category) => `${category.id} (${category.label})`).join(", ")}.`,
  "Each category is one --open-fact, one --cite path:line that exists and has a letter or digit, or one --quote of the request; no two categories share a cite or a quote.",
  "At least one category is an --open-fact: the user sees the plan before it is built.",
  "A question that only names the category is refused.",
].join(" ");

function problem(code, message) {
  return { error: { code, message, how: FEATURE_COVERAGE_HOW } };
}

function categoryOf(id) {
  return FEATURE_CATEGORIES.find((category) => category.id === id) || null;
}

function isConcrete(question, categoryId) {
  const category = categoryOf(categoryId);
  if (!category || typeof question !== "string" || question.trim() === "") return false;
  if (/\d/.test(question)) return true;
  const quoted = [...question.matchAll(/["'«`]([^"'»`]+)["'»`]/g)];
  if (quoted.some((match) => match[1].replace(/\s/g, "").length >= 3)) return true;
  const labelWords = new Set([...category.label.toLowerCase().split(/\s+/), ...category.id.split("-")]);
  const tokens = question
    .toLowerCase()
    .replace(/[¿?¡!.,;:()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return tokens.some((token) => token.length >= 4 && !STOP.has(token) && !labelWords.has(token));
}

function lineCount(text) {
  if (typeof text !== "string" || text.includes("\0")) return null;
  if (text === "") return 0;
  const normalized = text.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");
  if (normalized.endsWith("\n")) parts.pop();
  return parts.length;
}

function safeRelative(file) {
  const normalized = String(file).replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) return null;
  return normalized;
}

function take(found, categoryId, entry) {
  if (!categoryOf(categoryId)) return problem("facts-undeclared", `unknown category ${JSON.stringify(categoryId)}`);
  if (found.has(categoryId)) return problem("facts-undeclared", `category ${categoryId} is declared twice`);
  found.set(categoryId, entry);
  return null;
}

function parseOpenFact(raw, found) {
  const text = String(raw);
  const split = text.indexOf(":");
  if (split === -1) return problem("facts-undeclared", `a feature question needs a category: ${JSON.stringify(text)}`);
  const categoryId = text.slice(0, split).trim();
  const question = text.slice(split + 1).trim();
  if (!isConcrete(question, categoryId)) {
    return problem("facts-undeclared", `the question for ${categoryId || "a category"} must name a value, limit or format`);
  }
  return take(found, categoryId, { category: categoryId, question });
}

function parseCite(raw, found, readFile) {
  const text = String(raw);
  const split = text.indexOf("=");
  if (split === -1) return problem("facts-undeclared", `--cite needs category=path:line, got ${JSON.stringify(text)}`);
  const categoryId = text.slice(0, split).trim();
  const locator = text.slice(split + 1).trim();
  const match = /^(.+):(\d+)$/.exec(locator);
  if (!match) return problem("facts-undeclared", `--cite ${categoryId || "category"} needs path:line`);
  const file = safeRelative(match[1]);
  const line = Number(match[2]);
  if (!file || line < 1) return problem("cite-unresolved", `${locator} is not a path inside the project`);
  const body = readFile(file);
  if (typeof body !== "string") return problem("cite-unresolved", `${file} does not exist`);
  const count = lineCount(body);
  if (count == null) return problem("cite-unresolved", `${file} is not text`);
  if (line > count) return problem("cite-unresolved", `${file} has no line ${line}`);
  if (!/[\p{L}\p{N}]/u.test(body.replace(/\r\n/g, "\n").split("\n")[line - 1])) {
    return problem("cite-unresolved", `${file}:${line} has no letter or digit`);
  }
  return take(found, categoryId, { category: categoryId, cite: { kind: "path", path: file, line } });
}

function parseQuote(raw, found, request) {
  const text = String(raw);
  const split = text.indexOf("=");
  if (split === -1) return problem("facts-undeclared", `--quote needs category=<fragment>, got ${JSON.stringify(text)}`);
  const categoryId = text.slice(0, split).trim();
  const fragment = text.slice(split + 1);
  if (fragment.trim().length < MIN_QUOTE) {
    return problem("facts-undeclared", `the quote for ${categoryId || "a category"} must be at least ${MIN_QUOTE} characters`);
  }
  if (typeof request !== "string" || !request.includes(fragment)) {
    return problem("cite-unresolved", `the quote for ${categoryId || "a category"} is not a fragment of --request`);
  }
  return take(found, categoryId, { category: categoryId, cite: { kind: "request", text: fragment } });
}

// One line or fragment settles one category, so a single cite cannot cover
// the seven at once.
function reusedCite(entries) {
  const used = new Map();
  for (const entry of entries) {
    if (!entry.cite) continue;
    const key = entry.cite.kind === "path" ? `path:${entry.cite.path}:${entry.cite.line}` : `request:${entry.cite.text.trim()}`;
    if (used.has(key)) {
      return problem("facts-undeclared", `${entry.category} reuses the cite of ${used.get(key)}; each category needs its own line, fragment or question`);
    }
    used.set(key, entry.category);
  }
  return null;
}

/**
 * Turns the feature flags into resolved coverage. `readFile(path)` returns the
 * file text, or null when the path is missing.
 */
function resolveFeatureCoverage({ openFacts = [], cites = [], quotes = [], request, readFile }) {
  const found = new Map();
  for (const raw of openFacts) {
    const failed = parseOpenFact(raw, found);
    if (failed) return failed;
  }
  for (const raw of cites) {
    const failed = parseCite(raw, found, readFile);
    if (failed) return failed;
  }
  for (const raw of quotes) {
    const failed = parseQuote(raw, found, request);
    if (failed) return failed;
  }
  const reused = reusedCite(found.values());
  if (reused) return reused;
  const missing = CATEGORY_IDS.filter((id) => !found.has(id));
  if (missing.length > 0) return problem("facts-undeclared", `a feature must cover ${missing.join(", ")}`);
  // Cites settle nothing the user has not seen: the features that cited every
  // category escaped hidden facts, the ones that asked did not (#390). Stored
  // states keep validating through factsFromCoverage, which does not ask this.
  if (![...found.values()].some((entry) => entry.question)) {
    return problem("facts-undeclared", "a feature must ask at least one category with --open-fact; cites and quotes cover the rest");
  }
  return { coverage: CATEGORY_IDS.map((id) => found.get(id)) };
}

function factsFromCoverage(coverage) {
  if (!Array.isArray(coverage)) return problem("facts-undeclared", "a feature must cover every category");
  const found = new Map();
  for (const entry of coverage) {
    if (entry == null || typeof entry !== "object") return problem("facts-undeclared", "a category coverage entry must be an object");
    if (entry.question != null && entry.cite != null) {
      return problem("facts-undeclared", `${entry.category} cannot be both a question and a cite`);
    }
    if (typeof entry.question === "string") {
      if (!isConcrete(entry.question, entry.category)) {
        return problem("facts-undeclared", `the question for ${entry.category} must name a value, limit or format`);
      }
      const failed = take(found, entry.category, { category: entry.category, question: entry.question });
      if (failed) return failed;
      continue;
    }
    const cite = entry.cite;
    const pathCite = cite?.kind === "path" && safeRelative(cite.path) === cite.path && Number.isInteger(cite.line) && cite.line >= 1;
    const requestCite = cite?.kind === "request" && typeof cite.text === "string" && cite.text.trim().length >= MIN_QUOTE;
    if (!pathCite && !requestCite) return problem("facts-undeclared", `${entry.category || "a category"} needs a question or a resolved cite`);
    const stored = pathCite
      ? { category: entry.category, cite: { kind: "path", path: cite.path, line: cite.line } }
      : { category: entry.category, cite: { kind: "request", text: cite.text } };
    const failed = take(found, entry.category, stored);
    if (failed) return failed;
  }
  const reused = reusedCite(found.values());
  if (reused) return reused;
  const missing = CATEGORY_IDS.filter((id) => !found.has(id));
  if (missing.length > 0) return problem("facts-undeclared", `a feature must cover ${missing.join(", ")}`);
  return { facts: { coverage: CATEGORY_IDS.map((id) => found.get(id)) } };
}

function citedCoverage(text = "the user asked for this behavior") {
  return CATEGORY_IDS.map((id) => ({ category: id, cite: { kind: "request", text: `${text}: ${id}` } }));
}

/** A test count from the tail of a check, or null when the runner is unrecognized. */
function countTests(tail) {
  if (!Array.isArray(tail)) return null;
  let count = null;
  for (const line of tail) {
    const match = /^\s*(?:ℹ|#)?\s*tests\s+(\d+)\s*$/.exec(line);
    if (match) count = Number(match[1]);
    if (/could not find/i.test(line) && /test/i.test(line)) count = 0;
    if (/no tests ran/i.test(line)) count = 0;
  }
  return count;
}

module.exports = {
  CATEGORY_IDS,
  FEATURE_CATEGORIES,
  FEATURE_COVERAGE_HOW,
  MIN_QUOTE,
  citedCoverage,
  countTests,
  factsFromCoverage,
  isConcrete,
  lineCount,
  resolveFeatureCoverage,
};
