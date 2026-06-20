"use strict";

// Minimal, dependency-free frontmatter handling for the target generator.
// Operates on top-level keys (scalar, quoted, inline list) while preserving any
// untouched lines — including nested block maps — byte-for-byte on serialize.

const BLOCK = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/;
const KEY_LINE = /^([A-Za-z0-9_-]+):(.*)$/;

function parseScalar(value) {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^(["'])([\s\S]*)\1$/);

  if (quoted) {
    return quoted[2];
  }

  return trimmed.replace(/\s+#.*$/, "").trim();
}

function parseInlineArray(value) {
  const inner = value.trim().slice(1, -1).trim();

  if (!inner) {
    return [];
  }

  return inner.split(",").map((item) => parseScalar(item));
}

function parse(text) {
  const source = typeof text === "string" ? text : "";
  const match = source.match(BLOCK);

  if (!match) {
    return { frontmatter: [], body: source };
  }

  const [, block, body] = match;
  const fields = [];
  let current = null;

  for (const line of block.split(/\r?\n/)) {
    const indent = line.match(/^\s*/)[0].length;
    const keyMatch = line.match(KEY_LINE);

    if (indent === 0 && keyMatch) {
      const valuePart = keyMatch[2].trim();
      let value;

      if (valuePart === "") {
        value = undefined;
      } else if (/^\[.*\]$/.test(valuePart)) {
        value = parseInlineArray(valuePart);
      } else {
        value = parseScalar(valuePart);
      }

      current = { key: keyMatch[1], value, rawLines: [line] };
      fields.push(current);
    } else if (current) {
      current.rawLines.push(line);
    } else {
      fields.push({ key: null, value: undefined, rawLines: [line] });
    }
  }

  return { frontmatter: fields, body };
}

function serialize({ frontmatter, body }) {
  if (!frontmatter || frontmatter.length === 0) {
    return body;
  }

  const block = frontmatter.flatMap((field) => field.rawLines).join("\n");
  return `---\n${block}\n---\n${body}`;
}

function getField(frontmatter, key) {
  return frontmatter.find((field) => field.key === key) || null;
}

function stripKeys(frontmatter, keys) {
  const remove = new Set(keys);
  return frontmatter.filter((field) => !(field.key && remove.has(field.key)));
}

function upsert(frontmatter, key, field) {
  const next = frontmatter.slice();
  const index = next.findIndex((entry) => entry.key === key);

  if (index >= 0) {
    next[index] = field;
  } else {
    next.push(field);
  }

  return next;
}

// A YAML plain scalar can't carry certain characters without changing meaning:
// a colon-space splits it into a mapping, a leading indicator reassigns its
// type, a trailing/leading space or comment marker get trimmed. When any of
// those apply we emit a double-quoted scalar (JSON form is valid YAML), so a
// description like "atlas: scaffold it" survives the target loader instead of
// being silently dropped as malformed frontmatter.
function needsQuoting(value) {
  if (value === "") {
    return true;
  }

  return (
    /^[\s!&*?|>@`"'%#,\[\]{}:-]/.test(value) || // leading indicator/whitespace
    /\s$/.test(value) || // trailing whitespace
    /: /.test(value) || // colon-space starts a nested mapping
    /:$/.test(value) || // trailing colon
    / #/.test(value) || // begins an inline comment
    /[\n"]/.test(value) // newline or embedded quote
  );
}

function formatScalar(value) {
  const text = String(value);
  return needsQuoting(text) ? JSON.stringify(text) : text;
}

function setScalar(frontmatter, key, value) {
  return upsert(frontmatter, key, {
    key,
    value: String(value),
    rawLines: [`${key}: ${formatScalar(value)}`],
  });
}

function formatInlineArray(values) {
  return `[${values.map((value) => `'${value}'`).join(", ")}]`;
}

function setArray(frontmatter, key, values) {
  return upsert(frontmatter, key, {
    key,
    value: values.slice(),
    rawLines: [`${key}: ${formatInlineArray(values)}`],
  });
}

// Emit a nested YAML block map, e.g. setBlockMap(fm, "tools", [["read", true],
// ["bash", true]]) -> "tools:\n  read: true\n  bash: true". Keys are plain
// tokens (tool names); values are serialized as-is (booleans/strings).
function setBlockMap(frontmatter, key, entries) {
  const pairs = Array.isArray(entries) ? entries : Object.entries(entries);
  const rawLines = [`${key}:`, ...pairs.map(([k, v]) => `  ${k}: ${v}`)];
  return upsert(frontmatter, key, {
    key,
    value: Object.fromEntries(pairs),
    rawLines,
  });
}

module.exports = {
  parse,
  serialize,
  getField,
  stripKeys,
  setScalar,
  setArray,
  setBlockMap,
};
