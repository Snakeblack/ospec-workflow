"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ALIASES_PATH = path.join(
  __dirname,
  "..",
  "..",
  "schemas",
  "kernel",
  "aliases",
  "v1.json"
);

let cachedDoc = null;

function loadAliasDoc(docOrPath) {
  if (docOrPath !== undefined && isPlainObject(docOrPath)) {
    return validateAliasDoc(docOrPath);
  }
  if (docOrPath !== undefined && (typeof docOrPath !== "string" || docOrPath.trim() === "")) {
    throw new TypeError("alias document source must be an object or file path");
  }

  const filePath = typeof docOrPath === "string" ? docOrPath : DEFAULT_ALIASES_PATH;
  if (!cachedDoc || filePath !== DEFAULT_ALIASES_PATH) {
    let text;
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      throw new Error("alias document read failed", { cause: error });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error("alias document JSON invalid", { cause: error });
    }
    validateAliasDoc(parsed);
    if (filePath === DEFAULT_ALIASES_PATH) cachedDoc = parsed;
    return parsed;
  }
  return cachedDoc;
}

function validateAliasDoc(doc) {
  if (!isPlainObject(doc)) {
    throw new Error("alias document invalid: expected an object");
  }
  if (doc.schema_version !== 1) {
    throw new Error("alias document invalid: schema_version must be 1");
  }
  if (!isPlainObject(doc.aliases)) {
    throw new Error("alias document invalid: aliases must be an object");
  }
  if (!Array.isArray(doc.known_consumer_tags)) {
    throw new Error("alias document invalid: known_consumer_tags must be an array");
  }

  for (const [tag, canonical] of Object.entries(doc.aliases)) {
    if (tag.trim() === "" || typeof canonical !== "string" || canonical.trim() === "") {
      throw new Error(`alias document invalid: mapping for "${tag}" must be a non-empty string`);
    }
  }
  for (const tag of doc.known_consumer_tags) {
    if (typeof tag !== "string" || tag.trim() === "") {
      throw new Error("alias document invalid: known_consumer_tags entries must be non-empty strings");
    }
  }
  return doc;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateOptions(opts) {
  if (!isPlainObject(opts)) {
    throw new TypeError("alias options must be an object");
  }
  if (opts.strict !== undefined && typeof opts.strict !== "boolean") {
    throw new TypeError("alias strict option must be a boolean");
  }
}

/**
 * Resolve a legacy/current stable tag to its canonical vocabulary code (ADR-004).
 *
 * @param {string} tag
 * @param {{strict?: boolean, doc?: object|string}} [opts]
 * @returns {string}
 */
function resolveAlias(tag, opts = {}) {
  if (typeof tag !== "string" || tag.trim() === "") {
    throw new TypeError("alias tag must be a non-empty string");
  }
  validateOptions(opts);
  const doc = loadAliasDoc(opts.doc);
  const aliases = doc.aliases;
  const known = doc.known_consumer_tags;

  if (Object.prototype.hasOwnProperty.call(aliases, tag)) {
    const canonical = aliases[tag];
    if (typeof canonical !== "string" || !canonical) {
      throw new Error(`alias mapping for "${tag}" is empty`);
    }
    return canonical;
  }

  if (opts.strict) {
    if (known.includes(tag)) {
      throw new Error(`unmapped known consumer tag (fail-closed): ${tag}`);
    }
    throw new Error(`no alias mapping for tag (fail-closed): ${tag}`);
  }

  return tag;
}

/**
 * @param {{doc?: object|string}} [opts]
 * @returns {string[]}
 */
function listKnownConsumerTags(opts = {}) {
  validateOptions(opts);
  const doc = loadAliasDoc(opts.doc);
  return [...doc.known_consumer_tags];
}

module.exports = { resolveAlias, listKnownConsumerTags, loadAliasDoc };
