"use strict";

// Feature open-facts coverage (openspec/specs/idd/spec.md, REQ-idd-018).
// A feature accounts for every category with a concrete question or a cite
// the CLI has already resolved, and asks at least one of them (#390). Pure:
// the caller reads files and the request.

const path = require("node:path");

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
// The categories only a user interface has (E4.16): a project with code and
// no UI file covers the other five, which every feature covers.
const UI_CATEGORY_IDS = Object.freeze(["url-state", "accessibility"]);
const CORE_CATEGORY_IDS = Object.freeze(CATEGORY_IDS.filter((id) => !UI_CATEGORY_IDS.includes(id)));
const UI_FILE = /\.(?:html?|css|scss|sass|less|jsx|tsx|vue|svelte|astro)$/i;
const MIN_QUOTE = 12;
const STOP = new Set(
  "el la los las un una de del al y o en se es son por para con sin que qué como cómo cual cuál cuando the a an of to and or is are for what how does do if when this that not".split(" "),
);

const COVERAGE_RULES = [
  "Each category is one --open-fact naming a value, limit or format, one --cite <category>=<path:line> that exists and has a letter or digit,",
  'or one --quote <category>="<a literal fragment of --request, at least 12 characters>"; no two categories share a cite or a quote.',
  "A cite never names a manifest or a lockfile, and one outside the documentation names a file of the plan or the diff.",
  "At least one category is an --open-fact: the user sees the plan before it is built.",
  "A question that only names the category is refused.",
].join(" ");

/**
 * The categories a feature of this project covers (E4.16). `files` lists the
 * project's files, or null when they cannot be read; `planPaths` the paths the
 * intent declares; `classify(path)` is classifyPath of idd-signals.js. A
 * project with code and no UI file, in its files or its plan, leaves out
 * url-state and accessibility; one without code covers all seven.
 */
function projectCategories({ files, planPaths = [], classify }) {
  const code = Array.isArray(files) && files.some((file) => ["product", "test"].includes(classify(file)));
  const ui = [...(files || []), ...planPaths].some((file) => UI_FILE.test(file));
  if (!code || ui) return { categories: [...CATEGORY_IDS], omitted: [] };
  return { categories: [...CORE_CATEGORY_IDS], omitted: [...UI_CATEGORY_IDS], reason: "the project has code and no UI file; a --path with a UI file adds them" };
}

// The record intent of a feature with one question per category, to fill in.
function featureCommand(categories = CATEGORY_IDS) {
  return [
    'ospec record intent --change <id> --kind feature --summary "<what>" --acceptance "<observable result>" --request "<the user\'s words>"',
    ...categories.map((id) => `--open-fact ${id}:"<question>"`),
  ].join(" ");
}

function featureCoverageHow(categories = CATEGORY_IDS) {
  const labels = categories.map((id) => `${id} (${categoryOf(id).label})`).join(", ");
  const omitted = CATEGORY_IDS.filter((id) => !categories.includes(id));
  const optional = omitted.length ? `; ${omitted.join(" and ")} are optional here` : "";
  return `${featureCommand(categories)} Categories: ${labels}${optional}. ${COVERAGE_RULES}`;
}

const FEATURE_COVERAGE_HOW = featureCoverageHow();

function problem(code, message) {
  return { error: { code, message } };
}

// A refusal prints the template of the categories the project covers.
function withHow(result, categories) {
  if (result.error) result.error.how = featureCoverageHow(categories);
  return result;
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

// One spelling per file for a new cite (B6): `./a`, `a/./b`, `a//b` and a
// trailing slash name the file the rules judge. Stored states keep theirs.
function citePath(file) {
  const relative = safeRelative(file);
  if (relative === null) return null;
  const normalized = path.posix.normalize(relative).replace(/\/+$/, "");
  return normalized === "." ? null : normalized;
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

// A manifest or a lockfile names the project, never a behavior (B6). The
// rules judge, read and store the file the cite reaches (`canonical`).
function parseCite(raw, found, { readFile, classify, canonical }) {
  const text = String(raw);
  const split = text.indexOf("=");
  if (split === -1) return problem("facts-undeclared", `--cite needs category=path:line, got ${JSON.stringify(text)}`);
  const categoryId = text.slice(0, split).trim();
  const locator = text.slice(split + 1).trim();
  const match = /^(.+):(\d+)$/.exec(locator);
  if (!match) return problem("facts-undeclared", `--cite ${categoryId || "category"} needs path:line`);
  const spelled = citePath(match[1]);
  const line = Number(match[2]);
  if (!spelled || line < 1) return problem("cite-unresolved", `${locator} is not a path inside the project`);
  const file = canonical(spelled);
  if (file === null) return problem("cite-unresolved", `${spelled} does not exist inside the project`);
  if (classify(file) === "manifest") {
    return problem("cite-unresolved", `${file} is a manifest: cite the documentation or the code that settles ${categoryId || "the category"}, or ask it`);
  }
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
 * file text, or null when the path is missing; `classify(path)` is
 * classifyPath of idd-signals.js; `canonical(path)` is the file the path
 * reaches inside the project, symlinks resolved, or null. `categories` are
 * the ones the project covers (projectCategories); another category is
 * accepted when given.
 */
function resolveFeatureCoverage({ categories = CATEGORY_IDS, ...input }) {
  return withHow(coverageOf(input, categories), categories);
}

function coverageOf({ openFacts = [], cites = [], quotes = [], request, readFile, classify = () => null, canonical = (file) => file }, categories) {
  const found = new Map();
  for (const raw of openFacts) {
    const failed = parseOpenFact(raw, found);
    if (failed) return failed;
  }
  for (const raw of cites) {
    const failed = parseCite(raw, found, { readFile, classify, canonical });
    if (failed) return failed;
  }
  for (const raw of quotes) {
    const failed = parseQuote(raw, found, request);
    if (failed) return failed;
  }
  const reused = reusedCite(found.values());
  if (reused) return reused;
  const missing = categories.filter((id) => !found.has(id));
  if (missing.length > 0) return problem("facts-undeclared", `a feature must cover ${missing.join(", ")}`);
  // Cites settle nothing the user has not seen: the features that cited every
  // category escaped hidden facts, the ones that asked did not (#390). Stored
  // states keep validating through factsFromCoverage, which does not ask this.
  if (![...found.values()].some((entry) => entry.question)) {
    return problem("facts-undeclared", "a feature must ask at least one category with --open-fact; cites and quotes cover the rest");
  }
  return { coverage: CATEGORY_IDS.filter((id) => found.has(id)).map((id) => found.get(id)) };
}

// Stored or resolved coverage: the five core categories always, url-state and
// accessibility when they were covered (E4.16).
function factsFromCoverage(coverage) {
  return withHow(storedFacts(coverage), CATEGORY_IDS);
}

function storedFacts(coverage) {
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
  const missing = CORE_CATEGORY_IDS.filter((id) => !found.has(id));
  if (missing.length > 0) return problem("facts-undeclared", `a feature must cover ${missing.join(", ")}`);
  return { facts: { coverage: CATEGORY_IDS.filter((id) => found.has(id)).map((id) => found.get(id)) } };
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
  CORE_CATEGORY_IDS,
  COVERAGE_RULES,
  FEATURE_CATEGORIES,
  FEATURE_COVERAGE_HOW,
  MIN_QUOTE,
  UI_CATEGORY_IDS,
  citedCoverage,
  countTests,
  factsFromCoverage,
  featureCommand,
  featureCoverageHow,
  isConcrete,
  lineCount,
  projectCategories,
  resolveFeatureCoverage,
};
