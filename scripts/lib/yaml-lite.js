"use strict";

// Reads one scalar of a YAML mapping by its key path, the way the git hooks
// read openspec/config.yaml. Comments never count, and a key only counts under
// the section the path names. Block mappings and one-line flow mappings
// (`testing: { tdd_mode: strict }`) are read; anchors, multi-line flow
// collections and multi-document files are out of scope: what this reader
// cannot see reads as absent, so each caller keeps its default.
//
// It also holds the scan of scalar continuation lines that the state.yaml
// projector and every line reader of state.yaml share (REQ-lifecycle-kernel-032
// and -033).

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
// more than linearly on a long line (REQ-lifecycle-kernel-033).
const BLOCK_SCALAR_HEADER = /^[|>](?:[1-9][+-]?|[+-][1-9]?)?(?:[ \t]+#.*)?$/;
const MAPPING_LINE = /^([^:\s][^:]*):\s*(.*)$/;
const NODE_PROPERTIES = /^(?:(?:![^ \t]*|&[^ \t]+)(?:[ \t]+|$))+/;
const ENTRY_LINE = /^(?:(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*')[ \t]*|[^ \t#"'](?:[^:]|:[^ \t])*?):(?:[ \t]+(.*))?$/;

function lineIndent(raw) {
  return raw.match(/^ */)[0].length;
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
  const v = String(value).trim();
  return (v.startsWith('"') || v.startsWith("'")) && quoteClose(v, v[0], 1) === -1;
}

// A value without the tags and anchors before it; a value that is only those
// is empty, so what follows on the next line is its value.
function withoutProperties(value) {
  return value.replace(NODE_PROPERTIES, "");
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
    let item = trimmed.slice(2).trim();
    while (item.startsWith("- ")) item = item.slice(2).trim();
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
  const v = withoutProperties(String(value).trim());
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
    const trimmed = raw.trim();
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
        if (rest.trim() && !/^[ \t]+#/.test(rest)) {
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
// byte for byte and still refuses a value on the line after its key. `error`
// names a quoted scalar or flow collection that never closes; the lines before
// it are marked.
function scanScalarContinuations(lines) {
  const { continuation, error } = scanLines(lines);
  return { continuation, error };
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
  MAPPING_LINE,
  lineIndent,
  opaqueScalarLines,
  opensQuotedScalar,
  readYamlScalar,
  scanScalarContinuations,
};
