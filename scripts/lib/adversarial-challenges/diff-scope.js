"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function normalizePath(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\\/g, "/").replace(/^(a|b)\//, "");
  if (!normalized || normalized === "/dev/null" || normalized.startsWith("../") || normalized.includes("/../")) return null;
  return normalized;
}

function parseUnifiedDiff(diffBytes) {
  if (typeof diffBytes !== "string" && !Buffer.isBuffer(diffBytes)) return fail("CHALLENGE_SCOPE_INVALID", "unified diff bytes are required");
  const lines = Buffer.isBuffer(diffBytes) ? diffBytes.toString("utf8") : diffBytes;
  const files = [];
  let active = null;
  for (const line of lines.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const path = normalizePath(line.slice(4).trim().split("\t")[0]);
      if (path) {
        active = { path, lines: [] };
        files.push(active);
      }
      continue;
    }
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (active && match) {
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      for (let index = 0; index < count; index += 1) active.lines.push(start + index);
    }
  }
  return { ok: true, files: files.map((file) => ({ path: file.path, lines: [...new Set(file.lines)].sort((a, b) => a - b) })).sort((a, b) => a.path.localeCompare(b.path)) };
}

function deriveVerifiedDiffScope(candidate, diffBytes) {
  if (!candidate || typeof candidate !== "object" || typeof candidate.diff_hash !== "string") {
    return fail("CHALLENGE_SCOPE_INVALID", "frozen Candidate with diff_hash is required");
  }
  const actualHash = sha256Fingerprint("candidate-diff/v1", diffBytes);
  if (actualHash !== candidate.diff_hash) return fail("CHALLENGE_SCOPE_INVALID", "unified diff digest does not match Candidate.diff_hash");
  const parsed = parseUnifiedDiff(diffBytes);
  if (!parsed.ok) return parsed;
  const candidatePaths = new Set((candidate.paths || []).map((entry) => normalizePath(typeof entry === "string" ? entry : entry && entry.path)).filter(Boolean));
  const files = parsed.files.filter((file) => candidatePaths.has(file.path));
  if (files.length !== parsed.files.length) return fail("CHALLENGE_SCOPE_INVALID", "diff contains a path outside Candidate.paths");
  return {
    ok: true,
    scope: {
      paths: files.map((file) => file.path),
      line_ranges: files.map((file) => ({ path: file.path, lines: file.lines })),
      diff_hash: actualHash,
    },
  };
}

function rejectScopeWidening(verifiedScope, suppliedScope) {
  if (!suppliedScope) return { ok: true, scope: verifiedScope };
  const allowed = new Set(verifiedScope.paths || []);
  const paths = Array.isArray(suppliedScope.paths) ? suppliedScope.paths : [];
  if (paths.some((entry) => !allowed.has(normalizePath(entry)))) return fail("CHALLENGE_SCOPE_INVALID", "caller supplied scope widens frozen diff scope");
  return { ok: true, scope: verifiedScope };
}

module.exports = { normalizePath, parseUnifiedDiff, deriveVerifiedDiffScope, rejectScopeWidening };
