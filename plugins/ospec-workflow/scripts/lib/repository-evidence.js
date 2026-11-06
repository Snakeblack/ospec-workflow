"use strict";

// Repository evidence for brownfield recovery (openspec/specs/component-map/spec.md,
// REQ-component-map-002). A reference is `path:line`: a relative POSIX path
// inside the repository root and a 1-based line that exists in that file.

const fs = require("node:fs");
const path = require("node:path");

const REF = /^([^:\s][^:]*):([1-9][0-9]*)$/;

function parseEvidenceRef(ref) {
  const match = typeof ref === "string" ? REF.exec(ref) : null;
  if (!match) return null;
  return { file: match[1], line: Number(match[2]) };
}

function lineCount(text) {
  if (text === "") return 0;
  const lines = text.split("\n").length;
  return text.endsWith("\n") ? lines - 1 : lines;
}

// Returns null when the reference resolves, or the reason it does not.
function evidenceProblem(root, ref) {
  const parsed = parseEvidenceRef(ref);
  if (!parsed) return `"${ref}" is not path:line`;
  if (path.isAbsolute(parsed.file) || parsed.file.includes("\\")) {
    return `"${ref}" is not a relative POSIX path`;
  }
  const base = path.resolve(root);
  const target = path.resolve(base, parsed.file);
  if (target !== base && !target.startsWith(base + path.sep)) {
    return `"${ref}" points outside the repository`;
  }
  let text;
  try {
    if (!fs.statSync(target).isFile()) return `"${ref}" is not a file`;
    text = fs.readFileSync(target, "utf8");
  } catch {
    return `"${ref}" names a file that does not exist`;
  }
  if (parsed.line > lineCount(text)) return `"${ref}" is past the end of the file`;
  return null;
}

// Errors for every reference in `refs`, each at `${basePath}/${index}`.
function evidenceErrors(root, refs, basePath) {
  const errors = [];
  (Array.isArray(refs) ? refs : []).forEach((ref, index) => {
    const problem = evidenceProblem(root, ref);
    if (problem) errors.push({ path: `${basePath}/${index}`, rule: "evidence", message: problem });
  });
  return errors;
}

module.exports = {
  evidenceErrors,
  evidenceProblem,
  parseEvidenceRef,
};
