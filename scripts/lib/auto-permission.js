"use strict";

// What the session of an automatic run and its conductor share about the
// permission policy (E1.111, REQ-hooks-035). The conductor marks each turn
// with SESSION_ENV, the run's directory; the guard appends there, to
// REQUESTS_FILE, each call it stopped for the user; and an approval reaches the
// next turn only as ALLOW_ENV, the key of each approved call, separated by
// commas. internal/hooks/pretooluse.go computes the same key.

const crypto = require("node:crypto");

const SESSION_ENV = "OSPEC_AUTO_SESSION";
const ALLOW_ENV = "OSPEC_AUTO_ALLOW";
const REQUESTS_FILE = "permission-requests.jsonl";
const SHOWN_VALUE = 120;
// The record of a permission block that holds each call in full.
const BLOCK_FILE = "permission-block.json";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** The shell commands of a tool input: `command`, and each string or `{command}` of `commands`. */
function callCommands(toolInput) {
  if (!isObject(toolInput)) return [];
  const commands = typeof toolInput.command === "string" ? [toolInput.command] : [];
  for (const entry of Array.isArray(toolInput.commands) ? toolInput.commands : []) {
    if (typeof entry === "string") commands.push(entry);
    else if (isObject(entry) && typeof entry.command === "string") commands.push(entry.command);
  }
  return commands;
}

// The free text a host adds to a shell call, which a retry may reword.
const SHELL_NOTES = new Set(["description", "explanation"]);

// `text` with its length in UTF-8 bytes in front, so no content reads as a separator.
const framed = (text) => `${Buffer.byteLength(text, "utf8")}:${text}`;

// Every value of a tool input, objects and arrays included, framed with the
// keys (k) and indexes (i) that lead to it and tagged by its type: s string, n
// number (as JSON writes it), b boolean, z null, a array (with its length), o
// object.
function valueEntries(value, at = [], found = []) {
  const add = (tagged) => found.push(`${at.length}:${at.map(framed).join("")}${framed(tagged)}`);
  if (typeof value === "string") add(`s${value}`);
  else if (typeof value === "number") add(`n${JSON.stringify(value)}`);
  else if (typeof value === "boolean") add(`b${value}`);
  else if (value === null) add("z");
  else if (Array.isArray(value)) {
    add(`a${value.length}`);
    value.forEach((child, index) => valueEntries(child, [...at, `i${index}`], found));
  } else if (isObject(value)) {
    add("o");
    for (const [key, child] of Object.entries(value)) valueEntries(child, [...at, `k${key}`], found);
  }
  return found;
}

/**
 * The key an approval names, as hexadecimal SHA-256 of its tool and every
 * value of its input, sorted by their UTF-8 bytes; a shell call leaves out the
 * free text its host adds (`description`, `explanation`).
 */
function callKey(toolName, toolInput) {
  const input = isObject(toolInput) ? toolInput : {};
  const bound = callCommands(input).length > 0 ? Object.fromEntries(Object.entries(input).filter(([key]) => !SHELL_NOTES.has(key))) : input;
  const entries = valueEntries(bound).sort((a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")));
  return crypto.createHash("sha256").update(`${framed(String(toolName))}${entries.join("")}`, "utf8").digest("hex");
}

// The values of a tool input with a readable path, for the user.
function shownValues(value, at = "", found = []) {
  if (Array.isArray(value)) value.forEach((child, index) => shownValues(child, `${at}[${index}]`, found));
  else if (isObject(value)) for (const [key, child] of Object.entries(value)) shownValues(child, at ? `${at}.${key}` : key, found);
  else found.push([at, typeof value === "string" ? value : JSON.stringify(value)]);
  return found;
}

/** `text` with control and bidirectional characters as visible escapes, so a terminal shows what is approved. */
function visible(text) {
  return String(text).replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, (ch) => (ch === "\n" ? "\\n" : ch === "\t" ? "\\t" : `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`));
}

/**
 * What the user is asked to approve: its tool, then its commands with every
 * other field but the host's free text, or each value of its input, a long one
 * cut; BLOCK_FILE holds each call in full.
 */
function describeCall(toolName, toolInput) {
  const listed = (input) => shownValues(input).map(([at, shown]) => `${visible(at)}=${visible(shown.length > SHOWN_VALUE ? `${shown.slice(0, SHOWN_VALUE)}… (${shown.length} chars)` : shown)}`).join(", ");
  const commands = callCommands(toolInput);
  if (commands.length === 0) return `${visible(toolName)}${isObject(toolInput) && Object.keys(toolInput).length > 0 ? ` ${listed(toolInput)}` : ""}`;
  const fields = listed(Object.fromEntries(Object.entries(toolInput).filter(([key]) => !["command", "commands"].includes(key) && !SHELL_NOTES.has(key))));
  return `${visible(toolName)}: ${commands.map(visible).join("; ")}${fields ? ` [${fields}]` : ""}`;
}

module.exports = { ALLOW_ENV, BLOCK_FILE, REQUESTS_FILE, SESSION_ENV, callCommands, callKey, describeCall, visible };
