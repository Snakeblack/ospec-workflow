"use strict";

// Impact signal derivation for IDD changes (openspec/specs/idd/spec.md,
// REQ-idd-006, REQ-idd-008, REQ-idd-012). Signals come first from the declared
// intent and planned paths (source: declaration) and then from the real diff
// (source: diff); each carries the reason it fired. The path-driven signals are
// the K1 hard floors of PP1/PP2 under their IDD names, so the K1 floor is
// reported alongside. Pure: idd-workspace.js reads the diff and the config.

const { classifyChange } = require("./change-classification.js");
const { SIGNALS, isIntentAmbiguous } = require("./idd-contract.js");
const { classifyContractPaths } = require("./idd-contracts.js");
const { IMPACT_SIGNALS, isBuildScript, isExcluded, matchImpact, normalizePath } = require("./idd-impact.js");
const { IddRecordError, recordGate, recordPlan, recordReferences, recordSignal } = require("./idd-record.js");
const { derivedReferences, resolveReferences } = require("./idd-knowledge.js");

// K1 hard-floor evidence key → IDD signal. mechanical_no_behavior has no
// signal: a mechanical change only lowers the floor.
const FLOOR_SIGNALS = Object.freeze({
  data_migration: "persistent-data",
  auth_security: "security-boundary",
  public_api: "public-contract",
  localized_reproducible_bug: "bug-fix",
});

const IMPACT_LABELS = Object.freeze({
  "public-contract": "public contract",
  "persistent-data": "persistent data",
  "security-boundary": "security boundary",
});

const IRREVERSIBLE_OPERATIONS = Object.freeze([
  "drop-table",
  "drop-column",
  "drop-schema",
  "drop-database",
  "truncate-table",
  "delete-data",
  "rewrite-history",
]);

// Read only from added lines of persistent-data files; first match wins.
const DESTRUCTIVE_STATEMENTS = Object.freeze([
  { label: "DROP TABLE", pattern: /\bDROP\s+TABLE\b|\bdrop_?table/i },
  { label: "DROP SCHEMA", pattern: /\bDROP\s+SCHEMA\b/i },
  { label: "DROP DATABASE", pattern: /\bDROP\s+DATABASE\b/i },
  { label: "TRUNCATE", pattern: /\bTRUNCATE\s+(TABLE\s+)?\w/i },
  {
    label: "DROP COLUMN",
    pattern:
      /\bALTER\s+TABLE\b.*\bDROP\s+(?!CONSTRAINT\b|INDEX\b|DEFAULT\b|NOT\s+NULL\b|PRIMARY\b|FOREIGN\b|CHECK\b)|\bdrop_?column\b|\bremove_?column\b/i,
  },
  // Only a complete statement on one line: a WHERE may follow on the next one.
  { label: "DELETE without WHERE", pattern: /^\s*DELETE\s+FROM\s+(?:(?!\bWHERE\b).)*;\s*$/i },
]);

const COMMENT_LINE = /^\s*(--|#|\/\/)/;
// Source code of the common languages, scripts included (E1.53).
const PRODUCT_EXT =
  /\.(js|jsx|mjs|cjs|ts|tsx|py|go|java|kt|kts|cs|rb|php|rs|html|htm|css|vue|svelte|astro|c|h|cc|cpp|cxx|hh|hpp|hxx|m|mm|swift|scala|groovy|dart|lua|ex|exs|erl|hrl|clj|cljs|hs|ml|fs|fsx|vb|pl|pm|r|zig|sh|bash|zsh|ps1|psm1|bat|cmd)$/i;
const MANIFESTS = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "go.mod",
  "go.sum",
  "pyproject.toml",
  "requirements.txt",
  "pipfile",
  "setup.py",
  "setup.cfg",
  "cargo.toml",
  "cargo.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "composer.json",
  "composer.lock",
  "gemfile",
  "gemfile.lock",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "poetry.lock",
  "pipfile.lock",
  "uv.lock",
]);
// A call or an access, never a mere mention: a label, an import or this table.
const PERSISTENCE_PATTERNS = Object.freeze([
  { label: "localStorage", pattern: /\blocalStorage\s*[.[]/ },
  { label: "indexedDB", pattern: /\bindexedDB\s*\./i },
  { label: "writeFile", pattern: /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream)\s*\(/ },
  { label: "os.WriteFile", pattern: /\bos\.WriteFile\s*\(/ },
  { label: "ioutil.WriteFile", pattern: /\bioutil\.WriteFile\s*\(/ },
  { label: "File.WriteAllText", pattern: /\bFile\.(?:WriteAllText|AppendAllText)\s*\(/ },
  { label: "Deno.writeFile", pattern: /\bDeno\.write(?:Text)?File\s*\(/ },
]);
const CONTRACT_PATTERNS = Object.freeze([
  { label: "selector", pattern: /\b(?:getElementById|querySelector(?:All)?)\b|data-testid|`#[A-Za-z][\w-]*`/ },
  { label: "API", pattern: /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\// },
]);
const NO_RED_TEST_KINDS = Object.freeze(["docs", "refactor"]);
const ALWAYS_REASON = "every change with a resolved intent";
const SIGNAL_ORDER = SIGNALS.map((signal) => signal.id);

function sortedPaths(paths) {
  return [...new Set((paths || []).map(normalizePath))].sort();
}

// For each impact signal, the sorted paths that hit it and the first pattern.
// A published path is reported as published, not as a pattern.
function impactHits(paths, patterns) {
  const hits = new Map();
  for (const file of sortedPaths(paths)) {
    for (const { signal, pattern } of matchImpact(file, patterns)) {
      if (!hits.has(signal)) hits.set(signal, { pattern, paths: [] });
      hits.get(signal).paths.push(file);
    }
  }
  return hits;
}

function baseName(file) {
  return file.split("/").pop().toLowerCase();
}

// The top-level docs/ is documentation; under a nested docs/ only what is not
// code is (E1.53: src/docs/handler.py is product code).
function isDocumentation(file) {
  if (/^docs(?:\/|$)/.test(file) || /\.(md|mdx|rst|adoc)$/i.test(file)) return true;
  return /^.+\/docs\//.test(file) && !PRODUCT_EXT.test(file);
}

function isTestPath(file) {
  return (
    /\.(?:test|spec)\.(?:js|jsx|mjs|cjs|ts|tsx)$/i.test(file) ||
    /_test\.go$/i.test(file) ||
    /(?:^|\/)test_[^/]*\.py$/i.test(file) ||
    /Test\.java$/i.test(file) ||
    /Tests\.cs$/i.test(file) ||
    /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/i.test(file)
  );
}

function classifyPath(file) {
  const name = baseName(file);
  if (isDocumentation(file)) return "docs";
  if (MANIFESTS.has(name) || /\.(?:csproj|fsproj|vbproj|sln)$/i.test(name)) return "manifest";
  if (isTestPath(file)) return "test";
  if (PRODUCT_EXT.test(file)) return "product";
  return "other";
}

function codePortion(line) {
  if (COMMENT_LINE.test(line) || /^\s*\/\*/.test(line) || /^\s*<!--/.test(line)) return "";
  return line.replace(/<!--.*?-->/g, "").replace(/\/\*.*?\*\//g, "").replace(/\/\/.*$/, "");
}

function firstContentHit(lines, patterns) {
  for (const line of lines || []) {
    const code = codePortion(line);
    if (!code.trim()) continue;
    const hit = patterns.find((entry) => entry.pattern.test(code));
    if (hit) return hit.label;
  }
  return null;
}

// Persistent data by content (OSP-036): only product code outside
// impact.exclude and the build scripts (#416) counts. A changed product file
// derives it when its added lines write, when it already writes, or when a
// product module it imports by relative path writes (diff.sources, read by
// idd-workspace.js). Every hit, strongest evidence first, as
// "<reason>: <line>", so a user's answer covers only the writes it saw (#416).
function persistentHits(diff, patterns) {
  const addedLines = diff.addedLines || {};
  const sources = diff.sources || {};
  const counts = (file) => classifyPath(file) === "product" && !isExcluded(file, patterns) && !isBuildScript(file, patterns);
  const files = sortedPaths([...Object.keys(addedLines), ...Object.keys(sources)]).filter(counts);
  const hits = [];
  const collect = (lines, reason) => {
    for (const line of lines || []) {
      const code = codePortion(line);
      if (!code.trim()) continue;
      const hit = PERSISTENCE_PATTERNS.find((entry) => entry.pattern.test(code));
      if (hit) hits.push({ reason: reason(hit.label), key: `${reason(hit.label)}: ${line.trim()}` });
    }
  };
  for (const file of files) collect(addedLines[file], (label) => `${file} adds ${label}`);
  for (const file of files) collect(sources[file]?.lines, (label) => `${file} uses ${label}`);
  for (const file of files) {
    const imports = sources[file]?.imports || {};
    for (const target of sortedPaths(Object.keys(imports)).filter(counts)) {
      collect(imports[target], (label) => `${file} imports ${target}, which uses ${label}`);
    }
  }
  return hits;
}

// The hits a user's answer retracted (#416) stay out while the diff holds no
// other: a new write, a changed one or a path brings the signal back.
function userRetracted(retracted, id, hits) {
  const answered = (retracted || []).filter((entry) => entry.id === id && entry.answer && Array.isArray(entry.hits));
  return answered.some((entry) => {
    const left = new Map();
    for (const key of entry.hits) left.set(key, (left.get(key) || 0) + 1);
    return hits.every(({ key }) => {
      const remaining = left.get(key) || 0;
      left.set(key, remaining - 1);
      return remaining > 0;
    });
  });
}

function contractHit(addedLines) {
  for (const file of sortedPaths(Object.keys(addedLines || {}))) {
    if (!isDocumentation(file)) continue;
    const label = firstContentHit(addedLines[file], CONTRACT_PATTERNS);
    if (label) return `${file} adds ${label}`;
  }
  return null;
}

// The tests the diff adds code to (B3): a line that is neither blank nor only
// a comment, in a test with a code extension (E1.53). A deleted or emptied
// test, a fixture or a golden file is not one, so it neither stands for a test
// nor satisfies boundary-tests.
function addedTests(diff) {
  return (diff.paths || []).filter(
    (file) => classifyPath(file) === "test" && PRODUCT_EXT.test(file) && (diff.addedLines?.[file] || []).some((line) => codePortion(line).trim() !== ""),
  );
}

function untestedProduct(intent, diff) {
  if (!["feature", "bug"].includes(intent.kind)) return null;
  const paths = diff.paths || [];
  const product = paths.filter((file) => classifyPath(file) === "product");
  if (product.length === 0 || addedTests(diff).length > 0) return null;
  const more = product.length > 1 ? ` and ${product.length - 1} more` : "";
  return `product code without a test: touches ${product[0]}${more}`;
}

// A removed line of a contract document, or of documentation that states a
// contract as public-contract reads it, unless the same text comes back in
// one of them (a moved line). The first one, as "<file>: <line>".
function removedContractLine(diff, contractPatterns) {
  const removed = diff.removedLines || {};
  const documents = new Set(classifyContractPaths(diff.paths, contractPatterns).documents);
  const watched = (file) => documents.has(file) || isDocumentation(file);
  const kept = new Set(
    Object.entries(diff.addedLines || {})
      .filter(([file]) => watched(file))
      .flatMap(([, lines]) => lines.map((line) => line.trim())),
  );
  for (const file of sortedPaths(Object.keys(removed))) {
    if (!watched(file)) continue;
    for (const line of removed[file]) {
      const text = line.trim();
      if (text === "" || kept.has(text)) continue;
      if (documents.has(file) || firstContentHit([line], CONTRACT_PATTERNS)) return `${file}: ${JSON.stringify(text.slice(0, 80))}`;
    }
  }
  return null;
}

/**
 * Why the diff contradicts the declared kind (B9), with the kinds that may
 * replace it, or null: a docs change touches product code, a refactor removes
 * a line of a contract. The kind may only rise.
 */
function kindMismatch(intent, diff, contractPatterns) {
  if (intent?.kind === "docs") {
    const product = (diff.paths || []).filter((file) => classifyPath(file) === "product");
    if (product.length === 0) return null;
    const more = product.length > 1 ? ` and ${product.length - 1} more` : "";
    return { reason: `kind docs, but the diff changes product code: ${product[0]}${more}`, kinds: ["refactor", "bug", "feature"] };
  }
  if (intent?.kind === "refactor") {
    const line = removedContractLine(diff, contractPatterns);
    return line ? { reason: `kind refactor, but the diff removes a line of a contract: ${line}`, kinds: ["bug", "feature"] } : null;
  }
  return null;
}

/**
 * The path cites of a feature outside the documentation whose file is neither
 * in the plan nor in the diff (B6): a cite settles a behavior of the code the
 * change works on.
 */
function citesOutsidePlan(state, diff) {
  const known = new Set([...(state.plan?.paths || []), ...(diff.paths || [])]);
  return (state.facts?.coverage || [])
    .filter(({ cite }) => cite?.kind === "path" && classifyPath(cite.path) !== "docs" && !known.has(cite.path))
    .map(({ category, cite }) => ({ category, path: cite.path, line: cite.line }));
}

/**
 * What `ospec check` and `ospec close` refuse before anything else (E1.44):
 * a kind the diff contradicts, then a cite outside the plan. Each refusal
 * carries the command that raises the ceremony.
 */
function requireDeclaredCeremony(state, { diff, contractPatterns }) {
  const mismatch = kindMismatch(state.intent, diff, contractPatterns);
  if (mismatch) {
    const error = new IddRecordError("kind-mismatch", mismatch.reason);
    error.how =
      `ospec record intent --change ${state.change} --kind <${mismatch.kinds.join("|")}> --summary "<what>" --acceptance "<observable result>" ` +
      'with its open facts (--open-fact "<question>", or --no-open-facts --basis "<why>"; a feature covers the seven categories): the kind may only rise';
    throw error;
  }
  const outside = citesOutsidePlan(state, diff);
  if (outside.length > 0) {
    const cites = outside.map((cite) => `${cite.category}=${cite.path}:${cite.line}`).join(", ");
    const error = new IddRecordError("cite-outside-plan", `${cites} cites a file that is neither in the plan nor in the diff`);
    error.how = `ospec signals --change ${state.change} ${[...new Set(outside.map((cite) => `--path ${cite.path}`))].join(" ")}, when the change works on it`;
    throw error;
  }
}

function impactReason(signal, { pattern, paths }, patterns) {
  const more = paths.length > 1 ? ` and ${paths.length - 1} more` : "";
  const why = (patterns.published || []).includes(pattern) ? "published by package.json" : `matches ${pattern}`;
  return `${IMPACT_LABELS[signal]}: touches ${paths[0]}${more} (${why})`;
}

function destructiveStatement(diff, patterns) {
  const addedLines = diff.addedLines || {};
  for (const file of sortedPaths(diff.paths)) {
    if (!matchImpact(file, patterns).some((hit) => hit.signal === "persistent-data")) continue;
    const lines = addedLines[file] || [];
    for (const { label, pattern } of DESTRUCTIVE_STATEMENTS) {
      if (lines.some((line) => !COMMENT_LINE.test(line) && pattern.test(line))) {
        return `irreversible operation: ${label} in ${file}`;
      }
    }
  }
  return null;
}

// The ADRs and quality scenarios the declaration names (E3.1).
function declaredReferences(declaration) {
  const refs = [];
  for (const [kind, ids] of [
    ["adr", declaration.adrs],
    ["scenario", declaration.scenarios],
  ]) {
    for (const id of [...new Set(ids || [])].sort()) refs.push({ kind, id });
  }
  return refs;
}

// The current ADRs and quality scenarios of the components the paths touch
// (E3.2, REQ-idd-021), with the components that give them.
function mappedReferences(paths, knowledge) {
  if (!knowledge?.map || !(paths || []).length) return { refs: [], components: [] };
  const { references } = resolveReferences({ map: knowledge.map, paths, sources: knowledge.sources });
  const refs = derivedReferences(references);
  const derived = references.filter((ref) => refs.some((known) => known.kind === ref.kind && known.id === ref.id));
  return { refs, components: [...new Set(derived.flatMap((ref) => ref.components))].sort() };
}

function referencesReason(refs, prefix = "declared") {
  const named = (kind, label) => {
    const ids = refs.filter((ref) => ref.kind === kind).map((ref) => ref.id);
    return ids.length ? [`${label} ${ids.join(", ")}`] : [];
  };
  return `${prefix} ${[...named("adr", "ADR"), ...named("scenario", "quality scenario")].join(" and ")}`;
}

function byReference(left, right) {
  if (left.kind !== right.kind) return left.kind === "adr" ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function floorOf(intent, signalIds) {
  const impact = {};
  for (const [key, signal] of Object.entries(FLOOR_SIGNALS)) {
    if (signalIds.has(signal)) impact[key] = true;
  }
  if (intent.kind === "docs") impact.docs_only = true;
  return classifyChange({ impact }).risk;
}

/**
 * @param {{
 *   intent: {kind: string} | null,   null while the intent is ambiguous
 *   strictTdd?: boolean,
 *   declaration?: {paths?: string[], workUnits?: number, nonObviousDecision?: boolean, operations?: string[],
 *                  adrs?: string[], scenarios?: string[]},
 *   diff?: {paths?: string[], addedLines?: Record<string, string[]>,
 *          sources?: Record<string, {lines: string[], imports: Record<string, string[]>}>},
 *   patterns: object,                resolvePatterns() of idd-impact.js
 *   knowledge?: {map: object|null, sources: object},   readKnowledgeSources() of idd-workspace.js
 *   retracted?: object[],            the state's retracted signals
 * }} input
 */
function deriveSignals({ intent, strictTdd = false, declaration = {}, diff = {}, patterns, knowledge = null, retracted = [] }) {
  if (!intent) return { signals: [], gates: [], references: [], floor: null, floor_source: null };

  const found = new Map();
  const add = (id, reason, source) => {
    if (!found.has(id)) found.set(id, { id, reason, source });
  };

  add("always", ALWAYS_REASON, "declaration");
  // A red test describes new behavior: documentation has none to drive, and a
  // refactor keeps behavior under the tests that already pass.
  if (strictTdd && !NO_RED_TEST_KINDS.includes(intent.kind)) add("strict-tdd", "the project declares strict_tdd", "declaration");
  if (intent.kind === "bug") add("bug-fix", "the intent is a bug fix", "declaration");
  const untested = untestedProduct(intent, diff);
  if (untested) add("untested-product", untested, "diff");
  const persistent = persistentHits(diff, patterns);
  if (persistent.length > 0 && !userRetracted(retracted, "persistent-data", persistent)) {
    add("persistent-data", `persistent data: ${persistent[0].reason}`, "diff");
  }
  const contract = contractHit(diff.addedLines);
  if (contract) add("public-contract", `public contract: ${contract}`, "diff");
  if ((declaration.workUnits || 0) > 1) {
    add("multi-unit-or-decision", `declared ${declaration.workUnits} work units`, "declaration");
  } else if (declaration.nonObviousDecision) {
    add("multi-unit-or-decision", "declared a non-obvious decision", "declaration");
  }
  for (const [source, paths] of [
    ["declaration", declaration.paths],
    ["diff", diff.paths],
  ]) {
    const hits = impactHits(paths, patterns);
    for (const signal of IMPACT_SIGNALS) {
      if (hits.has(signal)) add(signal, impactReason(signal, hits.get(signal), patterns), source);
    }
  }
  // Declared references come first; then those of the components the plan
  // and the diff touch (E3.2).
  const declared = declaredReferences(declaration);
  if (declared.length > 0) add("adr-or-quality-attribute", referencesReason(declared), "declaration");
  const references = [...declared];
  for (const [source, paths] of [
    ["declaration", declaration.paths],
    ["diff", diff.paths],
  ]) {
    const mapped = mappedReferences(paths, knowledge);
    if (mapped.refs.length === 0) continue;
    const label = mapped.components.length > 1 ? "components" : "component";
    add("adr-or-quality-attribute", referencesReason(mapped.refs, `${label} ${mapped.components.join(", ")}:`), source);
    for (const ref of mapped.refs) {
      if (!references.some((known) => known.kind === ref.kind && known.id === ref.id)) references.push(ref);
    }
  }
  references.sort(byReference);

  const gates = [];
  const operation = (declaration.operations || []).find((op) => IRREVERSIBLE_OPERATIONS.includes(op));
  const gateReason = operation ? `irreversible operation: declared ${operation}` : destructiveStatement(diff, patterns);
  if (gateReason) gates.push({ id: "irreversible-operation", reason: gateReason });

  const signals = [...found.values()].sort((a, b) => SIGNAL_ORDER.indexOf(a.id) - SIGNAL_ORDER.indexOf(b.id));
  const risk = floorOf(intent, new Set(found.keys()));
  return { signals, gates, references, floor: risk.floor, floor_source: risk.floor_source };
}

// Records what a derivation adds to the stored state, plus the declared plan
// when there is one (E1.11) and the architecture references, declared (E3.1)
// or derived from the touched components (E3.2).
// Signals and gates already recorded stay as they are, and a signal the
// derivation misses is never dropped (REQ-idd-006).
function applyDerivation(state, derivation, { plan = null } = {}) {
  if (state.status === "closed") throw new IddRecordError("change-closed", `change ${state.change} is closed`);
  if (isIntentAmbiguous(state)) {
    throw new IddRecordError("ambiguous-intent-open", "no signal is derived while the intent is ambiguous");
  }
  let current = state;
  const added = { signals: [], gates: [] };
  let planChanged = false;
  if (plan) {
    const result = recordPlan(current, plan);
    planChanged = result.changed;
    current = result.state;
  }
  for (const signal of derivation.signals) {
    const result = recordSignal(current, signal);
    if (result.changed) added.signals.push(signal.id);
    current = result.state;
  }
  for (const gate of derivation.gates) {
    const result = recordGate(current, { id: gate.id, action: "open", reason: gate.reason });
    if (result.changed) added.gates.push(gate.id);
    current = result.state;
  }
  const references = recordReferences(current, derivation.references || []);
  current = references.state;
  return { state: current, changed: planChanged || references.changed || added.signals.length + added.gates.length > 0, added };
}

module.exports = {
  DESTRUCTIVE_STATEMENTS,
  FLOOR_SIGNALS,
  IRREVERSIBLE_OPERATIONS,
  addedTests,
  applyDerivation,
  citesOutsidePlan,
  classifyPath,
  deriveSignals,
  isTestPath,
  kindMismatch,
  persistentHits,
  requireDeclaredCeremony,
};
