"use strict";

const crypto = require("node:crypto");

const DIMENSIONS = Object.freeze(["risk", "reliability", "resilience", "readability"]);
const OPERATIONS = new Set(["add", "modify", "delete", "rename"]);
const PRECEDENCE = Object.freeze({ override: 0, verify: 1, "real-diff": 2, generalist: 3, design: 4, dependency: 4, metadata: 5, classifier: 5 });
const SIGNALS = Object.freeze({
  "verify-risk": ["risk"], "verify-reliability": ["reliability"], "verify-resilience": ["resilience"], "verify-readability": ["readability"],
  "diff-process-execution": ["risk", "reliability"], "diff-auth-permission": ["risk"], "diff-global-config-write": ["risk", "reliability"],
  "diff-network-flow": ["reliability", "resilience"], "diff-error-flow": ["reliability", "resilience"], "diff-structural-complexity": ["readability"],
  "dependency-change": ["risk", "reliability"], "design-risk": ["risk"],
  "metadata-runtime": ["reliability"], "metadata-docs-only": [],
});
const DERIVED_REASON_CODES = new Set(["high-risk-override", "generalist-escalation", "normal-cap-excluded", "signal-overflow-override", ...DIMENSIONS.map((id) => `no-${id}-signal`)]);
const FACT_SOURCES = Object.freeze({
  "verify-risk": "verify", "verify-reliability": "verify", "verify-resilience": "verify", "verify-readability": "verify",
  "diff-process-execution": "real-diff", "diff-auth-permission": "real-diff", "diff-global-config-write": "real-diff",
  "diff-network-flow": "real-diff", "diff-error-flow": "real-diff", "diff-structural-complexity": "real-diff",
  "dependency-change": "dependency", "design-risk": "design", "metadata-runtime": "metadata", "metadata-docs-only": "metadata",
});
const CLEAR_GENERALIST_REASON = "signals=none;dimensions=none";
const GENERALIST_REASON = /^signals=([a-z0-9-]+(?:,[a-z0-9-]+)*);dimensions=(none|risk(?:,reliability)?(?:,resilience)?(?:,readability)?|reliability(?:,resilience)?(?:,readability)?|resilience(?:,readability)?|readability)$/;
const RUNTIME_EXTENSIONS = new Set([".c", ".cc", ".cpp", ".cs", ".go", ".java", ".js", ".jsx", ".kt", ".kts", ".mjs", ".php", ".py", ".rb", ".rs", ".sh", ".ts", ".tsx"]);

function normalizeReviewEvidence(input) {
  if (!input || !["normal", "high-risk"].includes(input.classification)) throw new TypeError("classification must be normal or high-risk");
  if (!input.verify || input.verify.status !== "success") throw new TypeError("verify.status must be success");
  if (typeof input.diff !== "string" || !input.diff.trim()) throw new TypeError("diff must be a non-empty unified diff string");
  requireArray(input, "paths");
  requireArray(input, "capabilities");
  requireArray(input, "dependencies");
  requireArray(input, "operationTypes");
  requireArray(input, "designRisks");
  requireArray(input.verify, "findings", "verify.findings");
  const paths = [...new Set(uniqueStrings(input.paths, "paths").map(normalizeRelativePath))].sort();
  const capabilities = uniqueStrings(input.capabilities, "capabilities").sort();
  const dependencies = uniqueStrings(input.dependencies, "dependencies").sort();
  const operationTypes = uniqueStrings(input.operationTypes, "operationTypes").sort();
  if (operationTypes.some((value) => !OPERATIONS.has(value))) throw new TypeError("operationTypes contains an unknown value");
  const facts = [
    ...normalizeFacts(input.verify.findings, "verify"),
    ...normalizeFacts(input.designRisks, "design"),
    ...diffFacts(parseUnifiedDiff(input.diff)),
  ];
  if (dependencies.length) facts.push({ code: "dependency-change", source: "dependency", detail: dependencies.join(",") });
  if (capabilities.includes("runtime")) facts.push({ code: "metadata-runtime", source: "metadata", detail: "runtime" });
  if (paths.length && paths.every((value) => /^(docs\/|.*\.md$)/.test(value))) facts.push({ code: "metadata-docs-only", source: "metadata", detail: paths.join(",") });
  const sources = { paths, capabilities, operation_types: operationTypes, dependencies, facts: sortFacts(facts) };
  return { schema_version: 1, classification: input.classification, fingerprint: fingerprintEvidence(input.classification, sources), sources };
}

function validateGeneralistDecision(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["decision must be an object"] };
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "reason,specialists,status") errors.push("decision must contain exactly status, specialists, reason");
  if (!['clear', 'needs-specialist'].includes(value.status)) errors.push("unknown generalist status");
  if (!Array.isArray(value.specialists)) errors.push("specialists must be an array");
  else {
    if (value.specialists.some((item) => !DIMENSIONS.includes(item))) errors.push("unknown specialist");
    if (new Set(value.specialists).size !== value.specialists.length) errors.push("duplicate specialist");
    if (value.specialists.some((item, index) => DIMENSIONS.indexOf(item) <= DIMENSIONS.indexOf(value.specialists[index - 1]))) errors.push("specialists must use canonical order");
    if (value.status === "clear" && value.specialists.length) errors.push("clear requires an empty specialist list");
    if (value.status === "needs-specialist" && !value.specialists.length) errors.push("needs-specialist requires specialists");
  }
  const reference = parseGeneralistReference(value.reason);
  if (!reference.valid) errors.push(...reference.errors);
  else if (Array.isArray(value.specialists)) {
    if (value.status === "clear" && value.reason !== CLEAR_GENERALIST_REASON) errors.push("clear requires the canonical no-signal reference");
    if (value.status === "needs-specialist") {
      if (reference.signals.includes("none")) errors.push("needs-specialist requires classifier signals");
      if (reference.dimensions.join(",") !== value.specialists.join(",")) errors.push("reason dimensions must match specialists");
      const justified = new Set(reference.signals.flatMap((code) => SIGNALS[code] || []));
      if (value.specialists.some((id) => !justified.has(id))) errors.push("reason signals must justify every specialist");
    }
  }
  return { valid: errors.length === 0, errors };
}

function deriveReviewDimensions(evidence, generalist) {
  validateEvidence(evidence);
  const generalistValidation = validateGeneralistDecision(generalist);
  if (!generalistValidation.valid) throw new TypeError(generalistValidation.errors.join("; "));
  const reasons = Object.fromEntries(DIMENSIONS.map((id) => [id, []]));
  for (const fact of evidence.sources.facts) {
    for (const id of SIGNALS[fact.code]) reasons[id].push(reason(fact.code, fact.source, fact.detail));
  }
  for (const id of generalist.specialists) reasons[id].push(reason("generalist-escalation", "generalist", generalist.reason));
  let selected;
  let depth;
  let escalation_reason = null;
  if (evidence.classification === "high-risk") {
    selected = [...DIMENSIONS];
    depth = { review: "strict" };
    for (const id of DIMENSIONS) reasons[id].unshift(reason("high-risk-override", "override", "Classification requires full 4R"));
  } else {
    const candidates = DIMENSIONS.filter((id) => reasons[id].length).sort((a, b) => bestPrecedence(reasons[a]) - bestPrecedence(reasons[b]) || DIMENSIONS.indexOf(a) - DIMENSIONS.indexOf(b));
    if (candidates.length >= 3) {
      selected = [...DIMENSIONS];
      depth = { review: "strict" };
      escalation_reason = {
        code: "normal-signal-overflow",
        positive_dimensions: candidates.length,
        detail: `Normal review has ${candidates.length} positive dimensions; strict full 4R required`,
      };
      for (const id of DIMENSIONS) reasons[id].unshift(reason("signal-overflow-override", "override", escalation_reason.detail));
    } else {
      selected = candidates;
      depth = { review: "targeted" };
    }
  }
  const dimensions = {};
  for (const id of DIMENSIONS) {
    if (!reasons[id].length) reasons[id].push(reason(`no-${id}-signal`, "classifier", "No positive signal"));
    dimensions[id] = { selected: selected.includes(id), reasons: dedupeReasons(reasons[id]) };
  }
  return { schema_version: 1, classification: evidence.classification, evidence: { schema_version: evidence.schema_version, fingerprint: evidence.fingerprint, sources: evidence.sources }, generalist: { ...generalist, specialists: [...generalist.specialists] }, depth, escalation_reason, dimensions, selected_specialists: DIMENSIONS.filter((id) => selected.includes(id)) };
}

function validateReviewDecision(value) {
  const errors = [];
  try {
    if (!value || Object.keys(value).sort().join(",") !== "classification,depth,dimensions,escalation_reason,evidence,generalist,schema_version,selected_specialists") errors.push("review decision has missing or extra keys");
    if (value.schema_version !== 1 || !["normal", "high-risk"].includes(value.classification)) errors.push("invalid schema or classification");
    const gv = validateGeneralistDecision(value.generalist); errors.push(...gv.errors);
    if (!value.dimensions || Object.keys(value.dimensions).join(",") !== DIMENSIONS.join(",")) errors.push("dimensions must contain exactly four canonical keys");
    else for (const id of DIMENSIONS) {
      const item = value.dimensions[id];
      if (!item || typeof item.selected !== "boolean" || !Array.isArray(item.reasons) || !item.reasons.length) errors.push(`invalid ${id} decision`);
      else {
        for (const entry of item.reasons) {
          if (!entry || typeof entry.code !== "string" || typeof entry.source !== "string" || typeof entry.detail !== "string" || !Number.isInteger(entry.precedence)) errors.push(`invalid ${id} reasons`);
          else if (!SIGNALS[entry.code] && !DERIVED_REASON_CODES.has(entry.code)) errors.push(`unknown ${id} reason code`);
          else if (entry.precedence !== (PRECEDENCE[entry.source] ?? 5)) errors.push(`invalid ${id} reason precedence`);
        }
        const sorted = [...item.reasons].sort(compareReason);
        if (stableStringify(sorted) !== stableStringify(item.reasons)) errors.push(`${id} reasons are not canonical`);
      }
    }
    const expected = DIMENSIONS.filter((id) => value.dimensions && value.dimensions[id] && value.dimensions[id].selected);
    if (!Array.isArray(value.selected_specialists) || value.selected_specialists.join(",") !== expected.join(",")) errors.push("selected_specialists mismatch");
    if (!value.depth || !["targeted", "strict"].includes(value.depth.review)) errors.push("invalid review depth");
    if (!(value.escalation_reason === null || (value.escalation_reason && value.escalation_reason.code === "normal-signal-overflow" && [3, 4].includes(value.escalation_reason.positive_dimensions) && value.escalation_reason.detail === `Normal review has ${value.escalation_reason.positive_dimensions} positive dimensions; strict full 4R required`))) errors.push("invalid escalation reason");
    if (value.classification === "high-risk" && expected.length !== 4) errors.push("high-risk requires full 4R");
    const normalizedEvidence = value && value.evidence ? { ...value.evidence, classification: value.classification } : value && value.evidence;
    validateEvidence(normalizedEvidence);
    const expectedDecision = deriveReviewDimensions(normalizedEvidence, value.generalist);
    if (stableStringify(expectedDecision) !== stableStringify(value)) errors.push("review decision does not match normalized evidence and generalist input");
  } catch (error) { errors.push(error.message); }
  return { valid: errors.length === 0, errors };
}

function uniqueStrings(value, label) {
  if (value.some((item) => typeof item !== "string")) throw new TypeError(`${label} must contain only strings`);
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}
function normalizeFacts(value, defaultSource) {
  return (Array.isArray(value) ? value : []).map((item) => {
    if (!item || typeof item.code !== "string" || !SIGNALS[item.code]) throw new TypeError(`unknown fact code: ${item && item.code}`);
    if (item.source && item.source !== defaultSource) throw new TypeError(`invalid source for ${item.code}: ${item.source}`);
    if (FACT_SOURCES[item.code] !== defaultSource) throw new TypeError(`invalid ${defaultSource} fact code: ${item.code}`);
    return { code: item.code, source: defaultSource, detail: String(item.detail || item.evidence || item.code) };
  });
}
function diffFacts(files) {
  const patterns = [
    ["diff-process-execution", /\b(?:(?:child_process\.)?(?:spawn|spawnSync|exec|execFile)|ProcessBuilder)\s*\(/i],
    ["diff-auth-permission", /\b(?:auth(?:enticate|orize)?|permission|hasPermission|role|credential)\w*\s*(?:\(|=|:|\.)/i],
    ["diff-global-config-write", /\b(?:writeFile|writeFileSync)\s*\(|\b(?:globalConfig|config)\w*\s*(?:\.|\[)[^\n]*(?:set|write|save)\s*\(/i],
    ["diff-network-flow", /\b(?:fetch|request|retry|timeout)\s*\(|\b(?:axios|https?)\s*\.(?:get|post|put|patch|delete|request)\s*\(/i],
    ["diff-error-flow", /\b(?:catch\s*\(|throw\b|fallback|rollback)\w*\s*(?:\(|=|:)?/i],
    ["diff-structural-complexity", /\b(?:class|interface)\s+[A-Za-z_$][\w$]*|\bswitch\s*\(/i],
  ];
  const attributed = new Map(patterns.map(([code]) => [code, new Set()]));
  for (const { file, lines } of files) {
    if (!isRuntimeProductionPath(file)) continue;
    const lexicalState = {
      blockComment: null,
      quote: null,
      hashComment: hashCommentMode(file),
      lineComment: lineCommentMode(file),
      rubyBlockComment: false,
      language: languageMode(file),
    };
    for (const line of lines) {
      const executable = stripNonExecutableText(line.text, lexicalState);
      if (!line.added || !executable.trim()) continue;
      for (const [code, regex] of patterns) if (regex.test(executable)) attributed.get(code).add(file);
    }
  }
  return patterns.flatMap(([code]) => {
    const files = [...attributed.get(code)].sort();
    return files.length ? [{ code, source: "real-diff", detail: files.join(",") }] : [];
  });
}
function parseUnifiedDiff(diff) {
  const lines = String(diff).replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  const files = [];
  let index = 0;
  while (index < lines.length) {
    const section = /^diff --git a\/(.+) b\/(.+)$/.exec(lines[index]);
    if (!section) throw new TypeError(`diff must contain a valid diff --git section at line ${index + 1}`);
    const oldPath = normalizeRelativePath(section[1]);
    const file = normalizeRelativePath(section[2]);
    index += 1;
    const newLines = [];
    let hunks = 0;
    let oldMarker = false;
    let newMarker = false;
    while (index < lines.length && !lines[index].startsWith("diff --git ")) {
      const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(lines[index]);
      if (!header) {
        if (lines[index].startsWith("@@")) throw new TypeError(`invalid unified diff hunk header at line ${index + 1}`);
        if (hunks) throw new TypeError(`invalid unified diff content at line ${index + 1}`);
        if (lines[index].startsWith("--- ")) {
          if (oldMarker || newMarker) throw new TypeError(`duplicate or out-of-order old-file marker at line ${index + 1}`);
          const marker = lines[index].slice(4);
          if (marker !== `/dev/null` && marker !== `a/${oldPath}`) throw new TypeError(`invalid old-file marker at line ${index + 1}`);
          oldMarker = true;
        } else if (lines[index].startsWith("+++ ")) {
          const marker = lines[index].slice(4);
          if (!oldMarker || newMarker || (marker !== `/dev/null` && marker !== `b/${file}`)) throw new TypeError(`invalid new-file marker at line ${index + 1}`);
          newMarker = true;
        } else if (!/^(?:index [0-9a-f]+\.\.[0-9a-f]+(?: \d+)?|(?:new|deleted) file mode \d+|(?:old|new) mode \d+|(?:dis)?similarity index \d+%|(?:rename|copy) (?:from|to) .+)$/.test(lines[index])) {
          throw new TypeError(`invalid unified diff metadata at line ${index + 1}`);
        }
        index += 1;
        continue;
      }
      if (!oldMarker || !newMarker) throw new TypeError(`diff section for ${file} requires --- and +++ file markers`);
      hunks += 1;
      const expectedOld = header[2] === undefined ? 1 : Number(header[2]);
      const expectedNew = header[4] === undefined ? 1 : Number(header[4]);
      let oldCount = 0;
      let newCount = 0;
      index += 1;
      while (index < lines.length && !lines[index].startsWith("diff --git ") && !lines[index].startsWith("@@")) {
        const line = lines[index];
        if (line === "\\ No newline at end of file") { index += 1; continue; }
        if (!/^[ +\-]/.test(line)) throw new TypeError(`invalid unified diff hunk line at line ${index + 1}`);
        if (line[0] !== "+") oldCount += 1;
        if (line[0] !== "-") {
          newCount += 1;
          newLines.push({ text: line.slice(1), added: line[0] === "+" });
        }
        index += 1;
      }
      if (oldCount !== expectedOld || newCount !== expectedNew) throw new TypeError(`truncated unified diff hunk for ${file}`);
    }
    if (!hunks) throw new TypeError(`diff section for ${file} must contain a hunk header`);
    files.push({ oldPath, file, lines: newLines });
  }
  if (!files.length) throw new TypeError("diff must contain at least one unified diff file section");
  return files;
}
function stripNonExecutableText(line, state) {
  if (state.language === "ruby") {
    if (state.rubyBlockComment) {
      if (/^=end(?:\s|$)/.test(line)) state.rubyBlockComment = false;
      return "";
    }
    if (/^=begin(?:\s|$)/.test(line)) {
      state.rubyBlockComment = true;
      return "";
    }
  }
  if (!state.blockComment && !state.quote && /^\s*#!/.test(line)) return "";
  let output = "";
  for (let index = 0; index < line.length; index += 1) {
    const pair = line.slice(index, index + 2);
    const quad = line.slice(index, index + 4);
    if (state.blockComment) {
      const close = line.indexOf(state.blockComment, index);
      if (close === -1) return output;
      index = close + state.blockComment.length - 1;
      state.blockComment = null;
      continue;
    }
    if (state.quote) {
      if (state.quote.length === 3) {
        const close = line.indexOf(state.quote, index);
        if (close === -1) return output;
        index = close + 2;
        state.quote = null;
        continue;
      }
      if (line[index] === "\\") { index += 1; continue; }
      if (line[index] === state.quote) state.quote = null;
      continue;
    }
    if (pair === "/*") { state.blockComment = "*/"; index += 1; continue; }
    if (quad === "<!--") { state.blockComment = "-->"; index += 3; continue; }
    if ((pair === "//" && state.lineComment === "slash") || (pair === "--" && state.lineComment === "dash") || startsHashComment(line, index, state.hashComment)) break;
    const triple = line.slice(index, index + 3);
    if (["'''", '\"\"\"'].includes(triple)) { state.quote = triple; index += 2; continue; }
    const pythonFString = state.language === "python" && /^(?:[fF][rR]?|[rR][fF])['\"]/.test(line.slice(index));
    if (pythonFString) {
      const prefix = /^(?:[fF][rR]?|[rR][fF])/.exec(line.slice(index))[0];
      const parsed = consumeInterpolatedString(line, index + prefix.length, "python");
      output += parsed.executable;
      index = parsed.end;
      continue;
    }
    if (line[index] === "`") {
      const parsed = consumeInterpolatedString(line, index, "javascript");
      output += parsed.executable;
      index = parsed.end;
      if (!parsed.closed) state.quote = "`";
      continue;
    }
    if (["'", "\""].includes(line[index])) { state.quote = line[index]; continue; }
    output += line[index];
  }
  if (["'", "\""].includes(state.quote)) state.quote = null;
  return output;
}
function consumeInterpolatedString(line, quoteIndex, language) {
  const quote = line[quoteIndex];
  let executable = "";
  for (let index = quoteIndex + 1; index < line.length; index += 1) {
    if (line[index] === "\\") { index += 1; continue; }
    if (line[index] === quote) return { executable, end: index, closed: true };
    const opensExpression = language === "javascript"
      ? line[index] === "$" && line[index + 1] === "{"
      : line[index] === "{" && line[index + 1] !== "{";
    if (!opensExpression) {
      if (language === "python" && line[index] === "{" && line[index + 1] === "{") index += 1;
      continue;
    }
    const braceIndex = language === "javascript" ? index + 1 : index;
    const expression = readBalancedExpression(line, braceIndex);
    executable += stripInlineExpression(expression.content, language);
    index = expression.end;
  }
  return { executable, end: line.length - 1, closed: false };
}
function readBalancedExpression(line, openIndex) {
  let depth = 1;
  let quote = null;
  let escaped = false;
  for (let index = openIndex + 1; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (quote && quote !== "`") {
      if (char === quote) quote = null;
      continue;
    }
    if (["'", '\"'].includes(char)) { quote = quote ? null : char; continue; }
    if (char === "`") { quote = quote === "`" ? null : "`"; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return { content: line.slice(openIndex + 1, index), end: index };
  }
  return { content: line.slice(openIndex + 1), end: line.length - 1 };
}
function stripInlineExpression(expression, language) {
  return stripNonExecutableText(expression, {
    blockComment: null,
    quote: null,
    hashComment: language === "python" ? "any" : null,
    lineComment: language === "javascript" ? "slash" : null,
    rubyBlockComment: false,
    language,
  });
}
function hashCommentMode(file) {
  const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
  if ([".py", ".rb"].includes(extension)) return "any";
  if (extension === ".sh") return "shell";
  return null;
}
function languageMode(file) {
  const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
  if (extension === ".py") return "python";
  if (extension === ".rb") return "ruby";
  if ([".js", ".jsx", ".mjs", ".ts", ".tsx"].includes(extension)) return "javascript";
  return "other";
}
function lineCommentMode(file) {
  const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
  if ([".c", ".cc", ".cpp", ".cs", ".go", ".java", ".js", ".jsx", ".kt", ".kts", ".mjs", ".php", ".rs", ".ts", ".tsx"].includes(extension)) return "slash";
  if ([".sql", ".hs"].includes(extension)) return "dash";
  return null;
}
function startsHashComment(line, index, mode) {
  if (line[index] !== "#" || !mode) return false;
  return mode === "any" || index === 0 || /[\s|&;()<>]/.test(line[index - 1]);
}
function parseGeneralistReference(value) {
  if (typeof value !== "string") return { valid: false, errors: ["reason must be a canonical classifier reference"] };
  const match = GENERALIST_REASON.exec(value);
  if (!match) return { valid: false, errors: ["reason must use signals=<allowlisted-codes>;dimensions=<canonical-dimensions>"] };
  const signals = match[1].split(",");
  const dimensions = match[2] === "none" ? [] : match[2].split(",");
  const errors = [];
  if (signals[0] === "none" && signals.length !== 1) errors.push("none must be the only signal");
  if (signals[0] !== "none") {
    if (signals.some((code) => !Object.hasOwn(SIGNALS, code))) errors.push("reason contains an unknown classifier signal");
    if (signals.join(",") !== [...new Set(signals)].sort().join(",")) errors.push("reason signals must be unique and canonical");
  }
  return { valid: errors.length === 0, errors, signals, dimensions };
}
function isRuntimeProductionPath(value) {
  const lower = value.toLowerCase();
  if (/(?:^|\/)(?:docs?|documentation|openspec|tests?|specs?|__tests__|testdata|fixtures?|examples?)\//.test(lower)) return false;
  if (/(?:^|\/)package-lock\.json$/.test(lower) || /\.(?:md|mdx|rst|txt|json|ya?ml|toml)$/.test(lower)) return false;
  if (/(?:\.|_)(?:test|spec)\.[^.]+$/.test(lower)) return false;
  const extension = lower.slice(lower.lastIndexOf("."));
  return RUNTIME_EXTENSIONS.has(extension);
}
function reason(code, source, detail) { return { code, source, detail, precedence: PRECEDENCE[source] ?? 5 }; }
function compareReason(a, b) { return a.precedence - b.precedence || a.source.localeCompare(b.source) || a.code.localeCompare(b.code) || a.detail.localeCompare(b.detail); }
function bestPrecedence(values) { return Math.min(...values.map((item) => item.precedence)); }
function dedupeReasons(values) { return [...new Map(values.sort(compareReason).map((item) => [stableStringify(item), item])).values()]; }
function sortFacts(values) { return [...new Map(values.map((item) => [stableStringify(item), item])).values()].sort((a, b) => a.source.localeCompare(b.source) || a.code.localeCompare(b.code) || a.detail.localeCompare(b.detail)); }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function fingerprintEvidence(classification, sources) { return `sha256:${crypto.createHash("sha256").update(stableStringify({ classification, sources })).digest("hex")}`; }
function normalizeRelativePath(value) {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || /^(?:\/|[A-Za-z]:\/)/.test(normalized) || normalized.split("/").includes("..")) throw new TypeError(`path must be POSIX-relative: ${value}`);
  return normalized;
}
function requireArray(value, key, label = key) {
  if (!value || !Object.hasOwn(value, key) || !Array.isArray(value[key])) throw new TypeError(`${label} must be an array`);
}
function validateEvidence(value) {
  if (!value || Object.keys(value).sort().join(",") !== "classification,fingerprint,schema_version,sources" || value.schema_version !== 1 || !["normal", "high-risk"].includes(value.classification) || !/^sha256:[a-f0-9]{64}$/.test(value.fingerprint || "") || !value.sources || Object.keys(value.sources).sort().join(",") !== "capabilities,dependencies,facts,operation_types,paths" || !Array.isArray(value.sources.facts)) throw new TypeError("invalid normalized evidence");
  for (const key of ["paths", "capabilities", "dependencies", "operation_types"]) {
    const entries = value.sources[key];
    if (!Array.isArray(entries) || entries.some((item) => typeof item !== "string") || stableStringify(entries) !== stableStringify([...new Set(entries)].sort())) throw new TypeError(`invalid normalized evidence ${key}`);
  }
  for (const pathValue of value.sources.paths) if (normalizeRelativePath(pathValue) !== pathValue) throw new TypeError(`invalid normalized evidence path: ${pathValue}`);
  if (value.sources.operation_types.some((operation) => !OPERATIONS.has(operation))) throw new TypeError("invalid normalized evidence operation_types");
  for (const fact of value.sources.facts) {
    if (!fact || !SIGNALS[fact.code]) throw new TypeError(`unknown fact code: ${fact && fact.code}`);
    if (fact.source !== FACT_SOURCES[fact.code] || typeof fact.detail !== "string") throw new TypeError("invalid normalized fact");
  }
  if (stableStringify(value.sources.facts) !== stableStringify(sortFacts(value.sources.facts))) throw new TypeError("normalized facts are not canonical");
  if (value.fingerprint !== fingerprintEvidence(value.classification, value.sources)) throw new TypeError("evidence fingerprint mismatch");
}

module.exports = { normalizeReviewEvidence, validateGeneralistDecision, deriveReviewDimensions, validateReviewDecision };
