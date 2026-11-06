"use strict";

// Security sinks by content (E1.50, openspec/specs/idd/spec.md REQ-idd-012):
// a line added to product code that holds one of these sinks derives
// security-boundary, so a trust review looks at it even when no path matches a
// security pattern. Each entry names a concrete sink, not a suspicious word, and
// applies only to the extensions of the languages where that API exists. Pure:
// idd-signals.js decides which files and lines count.
//
// The catalog and the comment rules are adapted from gentle-ai
// (internal/reviewtransaction/risk_dangerous_sink.go at 7d3528877), under this
// license:
//
//   MIT License
//
//   Copyright (c) 2025 Gentleman Programming
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//
// Changes from the original: JavaScript also covers .mjs and .cjs, the names
// carry their CWE, the C# certificate callback also counts when assigned with
// `=`, and two sinks are new: SQL built by concatenation or interpolation
// (CWE-89) and Node's exec with a composed command (CWE-78).

const JS = ".js .jsx .ts .tsx .mjs .cjs";
const JVM = ".java .kt .kts";
const SHELL = ".sh .bash .zsh";
const BACKEND = `.go ${JVM} ${JS} .py .php .rb .rs .cs`;

function sink(label, extensions, pattern) {
  return Object.freeze({ label, extensions: new Set(extensions.split(" ")), pattern });
}

// A statement of SQL, in capitals: lowercase prose such as "select a file from
// the list" is no query.
const SQL = String.raw`(?:SELECT\b[^"'\x60]*?\bFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b`;
// A literal that opens with `quote` and SQL, up to the quote that closes it: the
// other quote may sit inside ("... WHERE name = '" + name).
function sqlLiteral(quote) {
  return String.raw`(${quote})\s*${SQL}(?:(?!\1)[^\\]|\\.)*?\1`;
}

const SINKS = Object.freeze([
  // CWE-295: disabled certificate validation.
  sink("disabled TLS verification (CWE-295)", ".go", /\bInsecureSkipVerify\s*:\s*true\b/),
  sink("disabled TLS verification (CWE-295)", JS, /\brejectUnauthorized\s*:\s*false\b|\bNODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0\b/),
  sink("disabled TLS verification (CWE-295)", ".py", /\bverify\s*=\s*False\b|\bCERT_NONE\b|\bcheck_hostname\s*=\s*False\b/),
  sink("disabled TLS verification (CWE-295)", ".rs", /\.danger_accept_invalid_certs\s*\(\s*true\s*\)/),
  sink("disabled TLS verification (CWE-295)", ".rb", /OpenSSL::SSL::VERIFY_NONE\b/),
  sink("disabled TLS verification (CWE-295)", ".php", /\bCURLOPT_SSL_VERIFYPEER\s*=>\s*(?:false|0)\b/),
  sink("disabled TLS verification (CWE-295)", ".cs", /ServerCertificateValidationCallback\s*\+?=\s*(?:\([^)]*\)|\w+)\s*=>\s*true\b/),
  sink("disabled TLS verification (CWE-295)", SHELL, /\bcurl\s+(?:[^;|]*\s)?(?:--insecure|-k)(?:\s|$)/),
  sink("disabled TLS verification (CWE-295)", JVM, /\bcheckServerTrusted\s*\([^)]*\)\s*\{\s*\}|\bHostnameVerifier\b[^;\n]*\([^)]*\)\s*->\s*true\b/),
  // CWE-502: deserializing untrusted object graphs.
  sink("unsafe deserialization (CWE-502)", ".py", /\bpickle\.loads?\s*\(|\bmarshal\.loads?\s*\(/),
  sink("unsafe YAML load (CWE-502)", ".py", /\byaml\.(?:unsafe_load|load)\s*\(/),
  sink("unsafe deserialization (CWE-502)", JVM, /\bObjectInputStream\s*\(/),
  sink("unsafe deserialization (CWE-502)", ".cs", /\bBinaryFormatter\s*\(|\bTypeNameHandling\s*(?:=|:)\s*TypeNameHandling\.(?:All|Auto)\b/),
  sink("unsafe deserialization (CWE-502)", ".php", /(?:^|[^\w.])unserialize\s*\(/),
  sink("unsafe deserialization (CWE-502)", ".rb", /\bMarshal\.load\s*\(|\bYAML\.load\s*\(/),
  sink("unsafe deserialization (CWE-502)", JS, /\b(?:serialize|nodeSerialize)\.unserialize\s*\(/),
  // CWE-94: runtime evaluation of supplied code.
  sink("code evaluation (CWE-94)", `${JS} .py .php .rb`, /(?:^|[^\w.])eval\s*\(/),
  sink("code evaluation (CWE-94)", JS, /\bnew\s+Function\s*\(|\bvm\.runInNewContext\s*\(/),
  sink("code evaluation (CWE-94)", ".php", /\bcreate_function\s*\(/),
  sink("code evaluation (CWE-94)", ".rb", /\b(?:instance_eval|class_eval)\s*\(\s*["'`]/),
  // CWE-78: shell interpretation of composed commands.
  sink("composed shell command (CWE-78)", ".py", /\bsubprocess\.(?:run|Popen|call|check_call|check_output)\s*\(\s*(?:[A-Za-z_]\w*|f["']|["'][^"']*["']\s*\+)[^;\n]*\bshell\s*=\s*True\b/),
  sink("composed shell command (CWE-78)", ".py", /\bos\.system\s*\(\s*(?:f["']|[^)\n]*(?:\+\s*[A-Za-z_]\w*|[A-Za-z_]\w*\s*\+|%\s*[A-Za-z_]\w*|\.format\s*\(\s*[A-Za-z_]\w*))/),
  sink("composed shell command (CWE-78)", ".php", /\b(?:system|exec|shell_exec|passthru)\s*\(\s*\$\w+|`[^`]*\$\w+[^`]*`/),
  sink("composed shell command (CWE-78)", ".rb", /`[^`]*#\{[^}]+\}[^`]*`|%x[({][^)}]*#\{[^}]+\}/),
  sink("composed shell command (CWE-78)", `.go ${JVM} ${JS} .py .rb .rs .cs`, /["'](?:sh|bash)["']\s*,\s*["']-c["']\s*,\s*(?:\w+|["'][^"']*["']\s*\+|f["']|`)/),
  // Node's exec runs its command through a shell: qualified, any command that
  // is not a constant; bare, one composed on the spot (a regex's exec follows a dot).
  sink("composed shell command (CWE-78)", JS, /(?:\b(?:child_process|childProcess|cp)|\brequire\(\s*["'](?:node:)?child_process["']\s*\))\.exec(?:Sync)?\s*\(\s*(?:[A-Za-z_$]|`[^`]*\$\{|["'][^"']*["']\s*\+)|(?:^|[^\w.$])exec(?:Sync)?\s*\(\s*(?:`[^`]*\$\{|["'][^"']*["']\s*\+|[A-Za-z_$][\w$]*\s*\+)/),
  // CWE-89: SQL built from pieces instead of bound parameters.
  // A tagged template (sql`...${id}`) binds its values, so it is no sink.
  sink("composed SQL (CWE-89)", `${JS} .py .rb ${JVM} .cs .go`, new RegExp(String.raw`(?:${sqlLiteral(`["']|(?<![\w$])\x60`)})\s*\+\s*[$A-Za-z_]`)),
  sink("composed SQL (CWE-89)", JS, new RegExp(String.raw`(?<![\w$])\x60\s*${SQL}[^\x60]*\$\{`)),
  sink("composed SQL (CWE-89)", ".py", new RegExp(String.raw`\bf(["'])\s*${SQL}(?:(?!\1).)*?\{`)),
  sink("composed SQL (CWE-89)", ".py", new RegExp(String.raw`${sqlLiteral(`["']`)}\s*(?:%\s*[\w(]|\.format\s*\()`)),
  sink("composed SQL (CWE-89)", ".go", new RegExp(String.raw`\bfmt\.Sprintf\s*\(\s*["\x60]\s*${SQL}`)),
  sink("composed SQL (CWE-89)", ".cs", new RegExp(String.raw`\$@?"\s*${SQL}[^"]*\{`)),
  sink("composed SQL (CWE-89)", ".rb", new RegExp(String.raw`"\s*${SQL}[^"]*#\{`)),
  sink("composed SQL (CWE-89)", ".php", new RegExp(String.raw`"\s*${SQL}[^"]*\$\w`)),
  sink("composed SQL (CWE-89)", ".php", new RegExp(String.raw`${sqlLiteral(`["']`)}\s*\.\s*\$\w`)),
  // CWE-327: weak digest specifically for a credential, not a file checksum.
  sink("weak credential hash (CWE-327)", BACKEND, /\b(?:hashlib\.)?(?:md5|sha1)(?:\.Sum)?\s*\(\s*\$?\w*(?:password|passwd|secret|token)\w*\b|\bcreateHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)\s*\.update\s*\(\s*\w*(?:password|passwd|secret|token)\w*\b|\bMessageDigest\.getInstance\s*\(\s*['"](?:MD5|SHA-1)['"]\s*\)\.digest\s*\(\s*\w*(?:password|passwd|secret|token)\w*\b/i),
  // CWE-942: wildcard origin combined with credential sharing (same line).
  sink("credentialed wildcard CORS (CWE-942)", BACKEND, /Access-Control-Allow-Origin[^;\n]*\*[^;\n]*;[^\n]*Access-Control-Allow-Credentials[^\n]*true/i),
  // CWE-732: world-writable modes.
  sink("world-writable mode (CWE-732)", `.go ${JS} .py .php .rb .rs .cs`, /\b(?:chmod|mkdir|WriteFile)\s*\([^\n]*\b(?:0o777|0777|0666)\b|\bumask\s*\(\s*0\s*\)/i),
  sink("world-writable mode (CWE-732)", SHELL, /\bchmod\s+(?:-R\s+)?(?:777\b|o\+w\b)/),
  // CWE-347: decoded tokens are not verified signatures.
  sink("unverified JWT (CWE-347)", ".py", /\bjwt\.decode\s*\([^\n]*(?:\bverify\s*=\s*False\b|["']verify_signature["']\s*:\s*False\b|\balgorithms\s*=\s*\[\s*["']none["']\s*\])/),
  sink("unverified JWT (CWE-347)", ".go", /\b\w+\.ParseUnverified\s*\(/),
  sink("unverified JWT (CWE-347)", JVM, /\.parseUnsecuredClaims\s*\(/),
  // CWE-352: explicit CSRF opt-outs.
  sink("disabled CSRF protection (CWE-352)", ".py", /@csrf_exempt\b|\bWTF_CSRF_ENABLED\s*=\s*False\b/),
  sink("disabled CSRF protection (CWE-352)", JVM, /\.csrf\s*\(\s*\)\.disable\s*\(/),
  sink("disabled CSRF protection (CWE-352)", ".rb", /\bskip_before_action\s+:verify_authenticity_token\b/),
  sink("disabled CSRF protection (CWE-352)", `${JS} .php .rb`, /\bcsrf\s*:\s*false\b|\bcsrf\s*=>\s*false\b/),
  sink("disabled CSRF protection (CWE-352)", ".cs", /\[IgnoreAntiforgeryToken\]/),
  // CWE-611: external entities and DTD expansion.
  sink("XML external entities (CWE-611)", ".py", /\bresolve_entities\s*=\s*True\b/),
  sink("XML external entities (CWE-611)", JVM, /\bXMLInputFactory\.IS_SUPPORTING_EXTERNAL_ENTITIES\s*,\s*true\b|\.setExpandEntityReferences\s*\(\s*true\s*\)/),
  sink("XML external entities (CWE-611)", ".php", /\bLIBXML_NOENT\b/),
  sink("XML external entities (CWE-611)", ".cs", /\bDtdProcessing\.Parse\b/),
]);

function extensionOf(file) {
  const name = file.split("/").pop();
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

// A SafeLoader protects its own yaml.load call, not another call on the same
// line; an unbalanced call stays unsafe.
function hasUnsafeYamlLoad(line) {
  if (line.includes("yaml.unsafe_load(")) return true;
  for (const match of line.matchAll(/\byaml\.load\s*\(/g)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = line.length;
    for (let at = start; at < line.length && depth > 0; at++) {
      if (line[at] === "(") depth++;
      else if (line[at] === ")" && --depth === 0) end = at;
    }
    if (!/\bLoader\s*=\s*(?:yaml\.)?C?SafeLoader\b/.test(line.slice(start, end))) return true;
  }
  return false;
}

const HASH = new Set([".sh", ".bash", ".zsh", ".py", ".rb", ".pl", ".pm", ".r", ".ps1", ".psm1"]);
const SLASH = new Set([".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx", ".cs", ".go", ".java", ".kt", ".kts", ".php", ".rs", ".swift", ".scala", ".groovy", ".dart", ...JS.split(" ")]);
const DASH = new Set([".sql", ".lua", ".hs"]);

// Whether an added line is only a comment in the language of its file. A marker
// counts only where that language uses it (`#` opens a C directive or a Rust
// attribute), and code after a closed block comment is still code. A language
// without rules is never skipped.
function isCommentOnly(file, line) {
  const trimmed = line.trim();
  const extension = extensionOf(file);
  if (HASH.has(extension)) return trimmed.startsWith("#");
  if (DASH.has(extension)) return trimmed.startsWith("--");
  if (!SLASH.has(extension)) return false;
  if (trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("/*")) {
    const closing = trimmed.indexOf("*/", 2);
    return closing < 0 || trimmed.slice(closing + 2).trim() === "";
  }
  if (trimmed.startsWith("*/")) return trimmed.slice(2).trim() === "";
  // A block comment continues with a lone `*`; `*cmd` is a dereference.
  return trimmed === "*" || /^\*\s/.test(trimmed);
}

/** The label of the first sink of `line` for the language of `file`, or null. */
function sinkOf(file, line) {
  if (isCommentOnly(file, line)) return null;
  const extension = extensionOf(file);
  for (const entry of SINKS) {
    if (!entry.extensions.has(extension) || !entry.pattern.test(line)) continue;
    if (entry.label.startsWith("unsafe YAML") && !hasUnsafeYamlLoad(line)) continue;
    return entry.label;
  }
  return null;
}

module.exports = { SINKS, isCommentOnly, sinkOf };
