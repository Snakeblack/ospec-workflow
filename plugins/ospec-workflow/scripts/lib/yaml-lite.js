"use strict";

// Reads one scalar of a YAML mapping by its key path, the way the git hooks
// read openspec/config.yaml. Comments never count, and a key only counts under
// the section the path names. Block mappings and one-line flow mappings
// (`testing: { tdd_mode: strict }`) are read; anchors, multi-line flow
// collections and multi-document files are out of scope: what this reader
// cannot see reads as absent, so each caller keeps its default.
//
// It also holds the scan of scalar continuation lines that the state.yaml
// projector and every line reader of state.yaml and config.yaml share
// (REQ-lifecycle-kernel-032 to -035).

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

// Reads the rest of a key path inside a one-line flow mapping. A plain key
// ends in a character other than a space, so the key never overlaps the
// spaces before the colon and a long entry is read in linear time
// (REQ-lifecycle-kernel-034).
function readFlowScalar(value, keyPath) {
  if (!value.startsWith("{") || !value.endsWith("}")) return null;
  for (const part of splitFlow(value.slice(1, -1))) {
    const entry = /^([^\s:'"{}[\],](?:[^:]*[^\s:])?|"[^"]*"|'[^']*')\s*:(?:\s+([^\n]*))?$/.exec(part);
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
    const line = stripComment(raw).trimEnd();
    if (line.trim() === "") continue;
    const indent = line.length - line.trimStart().length;
    while (depth > 0 && indent <= keyIndent[depth - 1]) depth -= 1;
    if (childIndent[depth] === undefined) childIndent[depth] = indent;
    if (indent !== childIndent[depth]) continue;
    const entry = /^\s*([^\s:#'"-][^:]*?|"[^"]*"|'[^']*'):(?:\s+([^\n]*))?$/.exec(line);
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

// REQ-lifecycle-kernel-032: a block scalar (`|` or `>`, with chomping and
// indentation indicators) and a plain or quoted scalar that starts on its
// key's line and continues on more indented lines are valid YAML the
// projector never edits inside. The scan marks those continuation lines so
// validation, parsing and projection treat them as opaque. A value that starts
// on the next line is not supported, and a quoted scalar that never closes, or
// whose continuation is not more indented than its key, is malformed. A tag or
// an anchor before the value does not change its kind, and a flow collection
// that continues on more indented lines is opaque until its brackets close; one
// that never closes is malformed too. A value on the line after its key, which
// the projector refuses, is opaque as well, with the key's line as its owner.
// The scan reads a key as YAML does: quoted, or plain up to the first colon
// that a space, a tab or the end of the line follows. Its patterns name the
// space and the tab, never \s, so Node matches Go, and none of them backtracks
// more than linearly on a long line (REQ-lifecycle-kernel-033). Where Go has
// `.` they take [^\n], since `.` in Node also stops at CR, U+2028 and U+2029
// (REQ-lifecycle-kernel-034). A line is blank, and a line or a value is
// trimmed, only by the space and the tab of YAML and the CR of a line break,
// as in Go: U+0085, U+FEFF and any other Unicode space are text
// (REQ-lifecycle-kernel-035).
const BLOCK_SCALAR_HEADER = /^[|>](?:[1-9][+-]?|[+-][1-9]?)?(?:[ \t]+#[^\n]*)?$/;
const NODE_PROPERTIES = /^(?:(?:![^ \t]*|&[^ \t]+)(?:[ \t]+|$))+/;
const ENTRY_LINE = /^(?:(?:"(?:[^"\\]|\\[^\n])*"|'(?:[^']|'')*')[ \t]*|[^ \t#"'](?:[^:]|:[^ \t])*?):(?:[ \t]+([^\n]*))?$/;

function lineIndent(raw) {
  return raw.match(/^ */)[0].length;
}

// The leading spaces and tabs of a line, as the Go projector and YAML-lite
// reader count its indentation; a tab is malformed anywhere but in a comment.
function lineIndentation(raw) {
  return raw.length - raw.replace(/^[ \t]+/, "").length;
}

function isYamlSpace(code) {
  return code === 0x20 || code === 0x09 || code === 0x0d;
}

// The text without the spaces, tabs and CRs at its ends.
function trimYamlSpace(text) {
  let start = 0;
  let end = text.length;
  while (start < end && isYamlSpace(text.charCodeAt(start))) start += 1;
  while (end > start && isYamlSpace(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(start, end);
}

// Index just past the quote that closes a scalar opened with `quote`, scanning
// from `from`; -1 when it does not close in `text`.
function quoteClose(text, quote, from) {
  for (let i = from; i < text.length; i += 1) {
    if (quote === '"' && text[i] === "\\") {
      i += 1;
    } else if (text[i] === quote) {
      if (quote === "'" && text[i + 1] === "'") {
        i += 1;
      } else {
        return i + 1;
      }
    }
  }
  return -1;
}

function opensQuotedScalar(value) {
  const v = trimYamlSpace(String(value));
  return (v.startsWith('"') || v.startsWith("'")) && quoteClose(v, v[0], 1) === -1;
}

// A value without the tags and anchors before it; a value that is only those
// is empty, so what follows on the next line is its value.
function withoutProperties(value) {
  return value.replace(NODE_PROPERTIES, "");
}

// Whether a value is the header of a block scalar (`|`, `>-`, `!!str |`), whose
// content is on the lines after it.
function isBlockScalarHeader(value) {
  return BLOCK_SCALAR_HEADER.test(withoutProperties(trimYamlSpace(String(value))));
}

// The bracket depth of a flow collection after `text`, starting at `depth`,
// and the index just past the bracket that closes it (-1 when it stays open).
// Quotes open only at the start of a token, so `don't` stays plain.
function flowClose(text, depth) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (quote === '"' && char === "\\") i += 1;
      else if (char === quote) quote = null;
    } else if ((char === '"' || char === "'") && (i === 0 || /[ \t[{,:]/.test(text[i - 1]))) {
      quote = char;
    } else if (char === "#" && (i === 0 || /[ \t]/.test(text[i - 1]))) {
      break;
    } else if (char === "[" || char === "{") {
      depth += 1;
    } else if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return { depth, end: i + 1 };
    }
  }
  return { depth, end: -1 };
}

// The scalar a mapping or sequence line holds, or null for any other line.
function lineScalarValue(trimmed) {
  if (trimmed.startsWith("- ")) {
    let item = trimYamlSpace(trimmed.slice(2));
    while (item.startsWith("- ")) item = trimYamlSpace(item.slice(2));
    item = withoutProperties(item === "-" ? "" : item);
    if (/^[[{]/.test(item)) return item;
    const entry = item.match(ENTRY_LINE);
    return entry ? entry[1] ?? "" : item;
  }
  // A line that opens a flow collection is a value, never a key.
  if (/^[[{]/.test(withoutProperties(trimmed))) return null;
  const entry = trimmed.match(ENTRY_LINE);
  return entry ? entry[1] ?? "" : null;
}

function scalarOwner(value, indent) {
  const v = withoutProperties(trimYamlSpace(String(value)));
  if (!v || v.startsWith("#")) return null;
  if (BLOCK_SCALAR_HEADER.test(v)) return { indent, kind: "block" };
  if (v.startsWith("[") || v.startsWith("{")) {
    const { depth, end } = flowClose(v, 0);
    return end === -1 ? { indent, kind: "flow", depth } : null;
  }
  if (v.startsWith('"') || v.startsWith("'")) {
    return quoteClose(v, v[0], 1) === -1 ? { indent, kind: v[0] } : null;
  }
  return { indent, kind: "plain" };
}

// The scan behind both exports: `continuation` marks the lines a scalar or a
// flow collection continues on, `values` the lines that hold a value on the
// line after its key.
function scanLines(lines) {
  const continuation = new Array(lines.length).fill(false);
  const values = new Array(lines.length).fill(false);
  let owner = null;
  const parents = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = trimYamlSpace(raw);
    const indent = lineIndent(raw);

    if (owner?.kind === "block") {
      if (!trimmed || indent > owner.indent) {
        continuation[i] = true;
        continue;
      }
      owner = null;
    } else if (owner?.kind === "flow") {
      continuation[i] = true;
      if (!trimmed) continue;
      if (indent <= owner.indent) {
        return { continuation, values, error: `line ${i + 1}: flow collection never closes` };
      }
      const { depth, end } = flowClose(trimmed, owner.depth);
      if (end === -1) owner.depth = depth;
      else owner = null;
      continue;
    } else if (owner && owner.kind !== "plain") {
      continuation[i] = true;
      if (!trimmed) continue;
      if (indent <= owner.indent) {
        return { continuation, values, error: `line ${i + 1}: quoted scalar never closes` };
      }
      const end = quoteClose(trimmed, owner.kind, 0);
      if (end !== -1) {
        const rest = trimmed.slice(end);
        if (trimYamlSpace(rest) && !/^[ \t]+#/.test(rest)) {
          return { continuation, values, error: `line ${i + 1}: text after a closed quoted scalar` };
        }
        owner = null;
      }
      continue;
    } else if (owner) {
      if (!trimmed) continue;
      const entry = trimmed.startsWith("- ") || trimmed === "-" || ENTRY_LINE.test(trimmed);
      if (indent > owner.indent && !entry && !trimmed.startsWith("#")) {
        continuation[i] = true;
        continue;
      }
      owner = null;
    }

    if (!trimmed || trimmed.startsWith("#")) continue;
    while (parents.length > 0 && parents[parents.length - 1] >= indent) parents.pop();
    const parent = parents.length > 0 ? parents[parents.length - 1] : -1;
    parents.push(indent);
    const value = lineScalarValue(trimmed);
    values[i] = value === null;
    owner = value === null ? scalarOwner(trimmed, parent) : scalarOwner(value, indent);
  }

  if (owner?.kind === "flow") {
    return { continuation, values, error: "flow collection never closes" };
  }
  if (owner && owner.kind !== "block" && owner.kind !== "plain") {
    return { continuation, values, error: "quoted scalar never closes" };
  }
  return { continuation, values, error: null };
}

// The continuation lines of every scalar, for the projector, which keeps them
// byte for byte, and the lines the scan reads as no key (a value on the line
// after its key, or a colon a space or a tab does not follow), which the
// projector refuses (REQ-lifecycle-kernel-035). `error` names a quoted scalar
// or flow collection that never closes; the lines before it are marked.
function scanScalarContinuations(lines) {
  const { continuation, values, error } = scanLines(lines);
  return { continuation, values, error };
}

// The YAML-lite reader of state.yaml behind readStatus and the pre-compact
// hook, mirrored from internal/yamllite (ExtractFirstScalar, parseScalar):
// lines and keys trimmed like the scan, spaces and tabs as indentation, a key
// up to the first colon and a value after ASCII white space, as Go's \s
// matches it (REQ-lifecycle-kernel-033 and -035).

// Lower-cases as strings.ToLower does in Go: one code point at a time. On the
// whole string toLowerCase turns U+0130 into an i plus U+0307 and a final
// capital sigma into U+03C2, so a status would differ between the runtimes.
function lowerCaseLikeGo(text) {
  let lowered = "";
  for (const char of String(text)) lowered += char === "\u0130" ? "i" : char.toLowerCase();
  return lowered;
}

// A single-line scalar of state.yaml, unquoted and without its comment.
function stateScalar(value) {
  const trimmed = trimYamlSpace(String(value));
  const quoted = trimmed.match(/^(["'])([\s\S]*)\1$/);
  if (quoted) return quoted[2];
  return trimYamlSpace(trimmed.replace(/(?<![\t\n\f\r ])[\t\n\f\r ]+#[^\n]*$/, ""));
}

// The key and the raw value of a trimmed mapping line, as keyValueRe splits it
// in Go; null without a colon.
function stateKeyValue(trimmed) {
  const match = /^([^:]+):(?:[\t\n\f\r ]*([^\n]*))?$/.exec(trimmed);
  return match ? { key: trimYamlSpace(match[1]), value: match[2] || "" } : null;
}

function extractScalarAtPath(content, expectedPath) {
  const stack = [];
  for (const raw of opaqueScalarLines(content).lines) {
    const text = trimYamlSpace(raw);
    if (!text || text.startsWith("#") || text.startsWith("- ")) continue;
    const entry = stateKeyValue(text);
    if (!entry) continue;
    const indent = lineIndentation(raw);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const path = [...stack.map((item) => item.key), entry.key];
    if (entry.value && path.length === expectedPath.length && path.every((part, index) => part === expectedPath[index])) {
      return stateScalar(entry.value);
    }
    if (!entry.value) stack.push({ indent, key: entry.key });
  }
  return "";
}

// The scalar at the first of `paths` that holds one, or "".
function extractFirstScalar(content, paths) {
  for (const expectedPath of paths) {
    const value = extractScalarAtPath(content, expectedPath);
    if (value) return value;
  }
  return "";
}

// The lines of a YAML text with every line of a value left blank (the
// continuation lines of a scalar or flow collection and a value on the line
// after its key), so a line reader that skips blank lines never reads a key
// inside a value (REQ-lifecycle-kernel-033). `error` names a quoted scalar or
// flow collection that never closes; the lines before it are blanked and the
// rest are kept as they are.
function opaqueScalarLines(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const { continuation, values, error } = scanLines(lines);
  return { lines: lines.map((line, index) => (continuation[index] || values[index] ? "" : line)), error };
}

module.exports = {
  BLOCK_SCALAR_HEADER,
  extractFirstScalar,
  isBlockScalarHeader,
  lineIndent,
  lineIndentation,
  lowerCaseLikeGo,
  opaqueScalarLines,
  opensQuotedScalar,
  readYamlScalar,
  scanScalarContinuations,
  stateKeyValue,
  stateScalar,
  trimYamlSpace,
};
