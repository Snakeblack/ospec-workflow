"use strict";

// Reads one scalar of a YAML mapping by its key path, the way the git hooks
// read openspec/config.yaml. Comments never count, and a key only counts under
// the section the path names. Block mappings and one-line flow mappings
// (`testing: { tdd_mode: strict }`) are read; anchors, multi-line flow
// collections and multi-document files are out of scope: what this reader
// cannot see reads as absent, so each caller keeps its default.

// Drops a comment: a `#` at the start of the text or after whitespace, outside
// quotes.
function stripComment(text) {
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\" && quote === '"') index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "#" && (index === 0 || /\s/.test(text[index - 1]))) {
      return text.slice(0, index);
    }
  }
  return text;
}

function unquote(value) {
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

// Splits the body of a flow collection at its top-level commas.
function splitFlow(body) {
  const parts = [];
  let quote = null;
  let nesting = 0;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (char === "\\" && quote === '"') index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "{" || char === "[") nesting += 1;
    else if (char === "}" || char === "]") nesting -= 1;
    else if (char === "," && nesting === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(body.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

// Reads the rest of a key path inside a one-line flow mapping.
function readFlowScalar(value, keyPath) {
  if (!value.startsWith("{") || !value.endsWith("}")) return null;
  for (const part of splitFlow(value.slice(1, -1))) {
    const entry = /^([^\s:'"{}[\],][^:]*?|"[^"]*"|'[^']*')\s*:(?:\s+(.*))?$/.exec(part);
    if (!entry || unquote(entry[1].trim()) !== keyPath[0]) continue;
    const inner = (entry[2] || "").trim();
    if (keyPath.length === 1) return inner === "" || inner.startsWith("{") ? null : unquote(inner);
    return readFlowScalar(inner, keyPath.slice(1));
  }
  return null;
}

/**
 * @param {string|null|undefined} text
 * @param {string[]} keyPath e.g. ["testing", "tdd_mode"]
 * @returns {string|null} the unquoted scalar, or null when the path is absent
 *   or names a section instead of a scalar.
 */
function readYamlScalar(text, keyPath) {
  if (text == null || !Array.isArray(keyPath) || keyPath.length === 0) return null;
  // depth: how many keys of the path are open. keyIndent[i] is the indentation
  // of the open key keyPath[i]; childIndent[i] is the indentation of the
  // entries of the section open at depth i, fixed by its first entry. A line
  // deeper than that belongs to some other key, a block scalar included.
  let depth = 0;
  const keyIndent = [];
  const childIndent = [0];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = stripComment(raw).replace(/\s+$/, "");
    if (line.trim() === "") continue;
    const indent = line.length - line.trimStart().length;
    while (depth > 0 && indent <= keyIndent[depth - 1]) depth -= 1;
    if (childIndent[depth] === undefined) childIndent[depth] = indent;
    if (indent !== childIndent[depth]) continue;
    const entry = /^\s*([^\s:#'"-][^:]*?|"[^"]*"|'[^']*'):(?:\s+(.*))?$/.exec(line);
    if (!entry || unquote(entry[1].trim()) !== keyPath[depth]) continue;
    const value = (entry[2] || "").trim();
    if (depth === keyPath.length - 1) return value === "" || value.startsWith("{") ? null : unquote(value);
    if (value.startsWith("{")) {
      const found = readFlowScalar(value, keyPath.slice(depth + 1));
      if (found !== null) return found;
      continue;
    }
    if (value !== "") continue;
    keyIndent[depth] = indent;
    depth += 1;
    childIndent[depth] = undefined;
  }
  return null;
}

module.exports = { readYamlScalar };
