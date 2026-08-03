"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { validateInstance } = require("./kernel-schema-validator.js");

const SCHEMA_PATH = path.join(
  __dirname,
  "..",
  "..",
  "schemas",
  "kernel",
  "state-transition",
  "v1.schema.json"
);

let cachedSchema = null;

const OPERATIONAL_READ_ERROR_CODES = new Set([
  "EACCES",
  "EIO",
  "EISDIR",
  "EMFILE",
  "ENFILE",
  "ENOENT",
  "ENOTDIR",
  "EPERM",
]);

class SchemaLoadError extends Error {
  constructor(rule, message, cause) {
    super(message, { cause });
    this.name = "SchemaLoadError";
    this.rule = rule;
  }
}

function loadSchema(options = {}) {
  const schemaPath = options.schemaPath === undefined ? SCHEMA_PATH : options.schemaPath;
  const readFileSync =
    options.readFileSync === undefined ? fs.readFileSync : options.readFileSync;
  const cacheable = schemaPath === SCHEMA_PATH && readFileSync === fs.readFileSync;
  if (cacheable && cachedSchema) return cachedSchema;

  let source;
  try {
    source = readFileSync(schemaPath, "utf8");
  } catch (error) {
    if (!error || !OPERATIONAL_READ_ERROR_CODES.has(error.code)) throw error;
    throw new SchemaLoadError(
      "schema-read",
      "state-transition schema could not be read",
      error
    );
  }

  if (typeof source !== "string") {
    throw new TypeError("schema reader must return a UTF-8 string");
  }

  let schema;
  try {
    schema = JSON.parse(source);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new SchemaLoadError(
      "schema-json",
      "state-transition schema contains invalid JSON",
      error
    );
  }

  if (cacheable) cachedSchema = schema;
  return schema;
}

function commandTokens(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  let started = false;

  for (let i = 0; i < command.length; i += 1) {
    const character = command[i];
    if (quote) {
      if (character === quote) {
        quote = null;
      } else if (character === "\\" && command[i + 1] === quote) {
        current += command[i + 1];
        i += 1;
      } else {
        current += character;
      }
      started = true;
    } else if (character === '"' || character === "'") {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
    } else {
      current += character;
      started = true;
    }
  }

  if (started) tokens.push(current);
  return { tokens, unclosedQuote: quote !== null };
}

function argumentValueToken(value) {
  if (["string", "number", "boolean", "bigint"].includes(typeof value)) {
    return String(value);
  }
  return null;
}

function tokenRepresentsArgument(argument) {
  const name = typeof argument.name === "string" ? argument.name.trim() : "";
  const token = argument.token;
  if (!name || typeof token !== "string") return false;

  const hasValue = Object.prototype.hasOwnProperty.call(argument, "value");
  const valueToken = hasValue ? argumentValueToken(argument.value) : null;
  if (hasValue && valueToken === null) return false;

  const option = token.match(/^(--?)([^=\s]+)(?:=(.*))?$/);
  if (option) {
    const optionName = option[2];
    const normalizedName = name.replaceAll("_", "-");
    if (optionName !== name && optionName !== normalizedName) return false;
    if (!hasValue) return option[3] === undefined;
    if (argument.value === true && option[3] === undefined) return true;
    return option[3] === valueToken;
  }

  return hasValue && token === valueToken;
}

/**
 * Validate next_transition shape via kernel schema + semantic kind rules.
 *
 * @param {object} transition
 * @param {{schemaPath?: string, readFileSync?: Function}} [options]
 * @returns {{valid: boolean, errors: Array<{path: string, rule: string, message: string}>}}
 */
function validateNextTransition(transition, options = {}) {
  let schemaResult;
  try {
    schemaResult = validateInstance(loadSchema(options), transition);
  } catch (error) {
    if (!(error instanceof SchemaLoadError)) throw error;
    return {
      valid: false,
      errors: [{ path: "/schema", rule: error.rule, message: error.message }],
    };
  }
  const errors = [...schemaResult.errors];

  if (!transition || typeof transition !== "object") {
    return {
      valid: false,
      errors: [{ path: "/", rule: "type", message: "transition must be an object" }],
    };
  }

  const kind = transition.kind;
  if (kind === "execute") {
    if (typeof transition.command !== "string" || transition.command.trim() === "") {
      errors.push({
        path: "/command",
        rule: "kind-execute",
        message: "execute requires a non-empty command",
      });
    }
    const args = Array.isArray(transition.arguments) ? transition.arguments : [];
    const parsedCommand =
      typeof transition.command === "string" && transition.command.trim() !== ""
        ? commandTokens(transition.command)
        : { tokens: [], unclosedQuote: false };
    if (parsedCommand.unclosedQuote) {
      errors.push({
        path: "/command",
        rule: "kind-execute",
        message: "execute command contains an unclosed quote",
      });
    }
    const argv = parsedCommand.tokens;
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (!arg || typeof arg.token !== "string" || arg.token.trim() === "") {
        errors.push({
          path: `/arguments/${i}/token`,
          rule: "kind-execute",
          message: "execute arguments that are CLI material require an exact token",
        });
      } else if (!argv.includes(arg.token)) {
        errors.push({
          path: `/arguments/${i}/token`,
          rule: "kind-execute",
          message: "execute argument token must appear as an exact token in command",
        });
      } else if (!tokenRepresentsArgument(arg)) {
        errors.push({
          path: `/arguments/${i}/token`,
          rule: "kind-execute",
          message: "execute argument token must represent its named argument and value",
        });
      }
    }
  }

  if (kind === "collect") {
    if (typeof transition.command === "string" && transition.command.trim() !== "") {
      errors.push({
        path: "/command",
        rule: "kind-collect",
        message: "collect must not invent a command for a missing artifact",
      });
    }
  }

  if (kind === "decide") {
    // command is optional; no extra semantic requirement
  }

  if (kind === "stop") {
    if (typeof transition.command === "string" && transition.command.trim() !== "") {
      errors.push({
        path: "/command",
        rule: "kind-stop",
        message: "stop must not name a recovery command",
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateNextTransition };
