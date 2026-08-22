"use strict";

/**
 * Constrained Draft 2020-12 JSON Schema interpreter (ADR-003).
 *
 * Supported keywords (only):
 *   - type (string|number|integer|boolean|object|array|null)
 *   - properties, required, additionalProperties (boolean or schema)
 *   - items (single schema)
 *   - enum, const
 *   - oneOf
 *   - local $ref (#/... only)
 *   - if / then (else ignored unless present — else is supported when provided)
 *   - $id, $schema, $defs, schema_version (metadata; not validated as keywords)
 *
 * Unsupported keywords are ignored at interpretation time; authors MUST NOT
 * rely on them. Prefer documenting contracts with the supported subset only.
 */

const fs = require("node:fs");
const path = require("node:path");

const META_KEYS = new Set([
  "$id",
  "$schema",
  "$defs",
  "schema_version",
  "title",
  "description",
  "examples",
  "default",
]);

/**
 * @typedef {{path: string, rule: string, message: string}} ValidationError
 * @typedef {{valid: boolean, errors: ValidationError[]}} ValidationResult
 */

/**
 * @param {object} schema
 * @param {*} instance
 * @param {{rootSchema?: object}} [opts]
 * @returns {ValidationResult}
 */
function validateInstance(schema, instance, opts = {}) {
  const normalizedOpts = isPlainObject(opts) ? opts : {};
  const rootSchema = normalizedOpts.rootSchema || schema;
  const errors = [];
  validate(schema, instance, "", rootSchema, errors);
  return { valid: errors.length === 0, errors };
}

/**
 * @param {object} schema
 * @param {*} instance
 * @param {string} instancePath
 * @param {object} rootSchema
 * @param {ValidationError[]} errors
 */
function validate(schema, instance, instancePath, rootSchema, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push({
      path: instancePath || "/",
      rule: "false",
      message: "boolean false schema rejects every instance",
    });
    return;
  }
  if (!schema || typeof schema !== "object") {
    errors.push({
      path: instancePath || "/",
      rule: "schema",
      message: "schema must be a JSON Schema object or boolean",
    });
    return;
  }

  if (schema.$ref) {
    const resolved = resolveLocalRef(schema.$ref, rootSchema);
    if (!resolved) {
      errors.push({
        path: instancePath || "/",
        rule: "$ref",
        message: `unresolved local $ref: ${schema.$ref}`,
      });
      return;
    }
    validate(resolved, instance, instancePath, rootSchema, errors);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const")) {
    if (!deepEqual(instance, schema.const)) {
      errors.push({
        path: instancePath || "/",
        rule: "const",
        message: `expected const ${JSON.stringify(schema.const)}`,
      });
    }
  }

  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((candidate) => deepEqual(candidate, instance))) {
      errors.push({
        path: instancePath || "/",
        rule: "enum",
        message: `value not in enum`,
      });
    }
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(instance, t))) {
      errors.push({
        path: instancePath || "/",
        rule: "type",
        message: `expected type ${types.join("|")}, got ${typeName(instance)}`,
      });
      return;
    }
  }

  if (typeof instance === "number") {
    if (typeof schema.minimum === "number" && instance < schema.minimum) {
      errors.push({
        path: instancePath || "/",
        rule: "minimum",
        message: `number ${instance} is less than minimum ${schema.minimum}`,
      });
    }
    if (typeof schema.maximum === "number" && instance > schema.maximum) {
      errors.push({
        path: instancePath || "/",
        rule: "maximum",
        message: `number ${instance} is greater than maximum ${schema.maximum}`,
      });
    }
    if (typeof schema.exclusiveMinimum === "number" && instance <= schema.exclusiveMinimum) {
      errors.push({
        path: instancePath || "/",
        rule: "exclusiveMinimum",
        message: `number ${instance} is less than or equal to exclusiveMinimum ${schema.exclusiveMinimum}`,
      });
    }
  }

  if (typeof instance === "string") {
    if (typeof schema.minLength === "number") {
      if (instance.length < schema.minLength) {
        errors.push({
          path: instancePath || "/",
          rule: "minLength",
          message: `string length ${instance.length} is less than minLength ${schema.minLength}`,
        });
      }
    }
    if (typeof schema.pattern === "string") {
      try {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(instance)) {
          errors.push({
            path: instancePath || "/",
            rule: "pattern",
            message: `string does not match pattern ${schema.pattern}`,
          });
        }
      } catch {
        // ignore invalid regex in schema
      }
    }
  }

  if (isPlainObject(instance)) {
    validateObjectInstance(schema, instance, instancePath, rootSchema, errors);
  }

  if ((schema.type === "array" || schema.items) && Array.isArray(instance) && schema.items) {
    for (let i = 0; i < instance.length; i += 1) {
      validate(schema.items, instance[i], `${instancePath}/${i}`, rootSchema, errors);
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const matches = [];
    for (let i = 0; i < schema.oneOf.length; i += 1) {
      const branchErrors = [];
      validate(schema.oneOf[i], instance, instancePath, rootSchema, branchErrors);
      if (branchErrors.length === 0) matches.push(i);
    }
    if (matches.length !== 1) {
      errors.push({
        path: instancePath || "/",
        rule: "oneOf",
        message: `expected exactly one oneOf branch to match, got ${matches.length}`,
      });
    }
  }

  if (schema.if && typeof schema.if === "object") {
    validateConditionalBranch(schema, instance, instancePath, rootSchema, errors);
  }
}

function validateObjectInstance(schema, instance, instancePath, rootSchema, errors) {
  validateRequiredProperties(schema.required, instance, instancePath, errors);
  validateObjectProperties(schema, instance, instancePath, rootSchema, errors);
}

function validateRequiredProperties(required, instance, instancePath, errors) {
  const propertyNames = Array.isArray(required) ? required : [];
  for (const key of propertyNames) {
    if (Object.prototype.hasOwnProperty.call(instance, key)) continue;
    errors.push({
      path: joinPath(instancePath, key),
      rule: "required",
      message: `missing required property "${key}"`,
    });
  }
}

function validateObjectProperties(schema, instance, instancePath, rootSchema, errors) {
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : null;
  const additionalSchema =
    schema.additionalProperties && typeof schema.additionalProperties === "object"
      ? schema.additionalProperties
      : null;
  if (!properties && schema.additionalProperties !== false && !additionalSchema) return;

  const propertySchemas = properties || {};
  for (const [key, value] of Object.entries(instance)) {
    validateObjectProperty(
      propertySchemas,
      additionalSchema,
      schema.additionalProperties === false,
      key,
      value,
      instancePath,
      rootSchema,
      errors
    );
  }
}

function validateObjectProperty(
  propertySchemas,
  additionalSchema,
  rejectsAdditionalProperties,
  key,
  value,
  instancePath,
  rootSchema,
  errors
) {
  const propertyPath = joinPath(instancePath, key);
  if (Object.prototype.hasOwnProperty.call(propertySchemas, key)) {
    validate(propertySchemas[key], value, propertyPath, rootSchema, errors);
    return;
  }
  if (rejectsAdditionalProperties) {
    errors.push({
      path: propertyPath,
      rule: "additionalProperties",
      message: `unexpected property "${key}"`,
    });
    return;
  }
  if (additionalSchema) {
    validate(additionalSchema, value, propertyPath, rootSchema, errors);
  }
}

function validateConditionalBranch(schema, instance, instancePath, rootSchema, errors) {
  const conditionErrors = [];
  validate(schema.if, instance, instancePath, rootSchema, conditionErrors);
  const branch = conditionErrors.length === 0 ? schema.then : schema.else;
  if (branch && typeof branch === "object") {
    validate(branch, instance, instancePath, rootSchema, errors);
  }
}

function matchesType(instance, type) {
  switch (type) {
    case "null":
      return instance === null;
    case "boolean":
      return typeof instance === "boolean";
    case "string":
      return typeof instance === "string";
    case "number":
      return typeof instance === "number" && Number.isFinite(instance);
    case "integer":
      return typeof instance === "number" && Number.isInteger(instance);
    case "object":
      return isPlainObject(instance);
    case "array":
      return Array.isArray(instance);
    default:
      return false;
  }
}

function typeName(instance) {
  if (instance === null) return "null";
  if (Array.isArray(instance)) return "array";
  return typeof instance;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function joinPath(base, key) {
  if (!base || base === "/") return `/${key}`;
  return `${base}/${key}`;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key, i) => key === keysB[i] && deepEqual(a[key], b[key]));
  }
  return false;
}

function resolveLocalRef(ref, rootSchema) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/").map(decodeJsonPointer);
  let node = rootSchema;
  for (const part of parts) {
    if (!node || typeof node !== "object" || !Object.prototype.hasOwnProperty.call(node, part)) {
      return null;
    }
    node = node[part];
  }
  return node;
}

function decodeJsonPointer(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Load a schema by `$id` from an in-memory map or from disk via manifest.
 *
 * @param {string} id
 * @param {{manifest?: object, schemas?: Record<string, object>, rootDir?: string}} [opts]
 * @returns {object}
 */
function loadSchemaById(id, opts = {}) {
  if (typeof id !== "string" || !id) {
    throw new Error("schema $id is required");
  }

  if (!isPlainObject(opts)) {
    throw new TypeError("schema loader options must be an object");
  }

  const requestedVersion = versionFromSchemaId(id);

  if (opts.schemas !== undefined && !isPlainObject(opts.schemas)) {
    throw new TypeError("schemas map must be an object");
  }

  if (opts.schemas && Object.prototype.hasOwnProperty.call(opts.schemas, id)) {
    return validateLoadedSchema(opts.schemas[id], id, requestedVersion, "schemas map");
  }

  if (opts.manifest !== undefined && !isPlainObject(opts.manifest)) {
    throw new TypeError("schema manifest must be an object");
  }
  const manifest = opts.manifest || (opts.rootDir ? readManifest(opts.rootDir) : null);
  if (!manifest || !isPlainObject(manifest.families)) {
    throw new Error(`schema $id unresolved: ${id}`);
  }

  for (const family of Object.values(manifest.families)) {
    if (family && family.$id === id) {
      if (family.schema_version !== requestedVersion) {
        throw new Error(
          `schema manifest version mismatch: expected ${requestedVersion}, got ${String(family.schema_version)}`
        );
      }
      if (opts.rootDir && family.path) {
        const schema = readSchemaDocument(opts.rootDir, family.path, id);
        return validateLoadedSchema(schema, id, requestedVersion, family.path);
      }
      if (opts.schemas) {
        throw new Error(`schema $id not found in schemas map: ${id}`);
      }
      throw new Error(`schema $id unresolved (no rootDir): ${id}`);
    }
  }

  throw new Error(`schema $id not found: ${id}`);
}

function readManifest(rootDir) {
  return readConfinedJson(
    rootDir,
    path.join("schemas", "kernel", "manifest.json"),
    "schema manifest",
    "schema manifest read failed",
    "schema manifest JSON invalid"
  );
}

function readSchemaDocument(rootDir, schemaPath, id) {
  return readConfinedJson(
    rootDir,
    schemaPath,
    "schema",
    `schema document read failed: ${id}`,
    `schema document JSON invalid: ${id}`
  );
}

function readConfinedJson(rootDir, relativePath, pathLabel, readMessage, jsonMessage) {
  let text;
  try {
    const filePath = resolveConfinedPath(rootDir, relativePath, pathLabel);
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "KERNEL_PATH_ESCAPE") throw error;
    throw new Error(readMessage, { cause: error });
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(jsonMessage, { cause: error });
  }
}

function resolveConfinedPath(rootDir, relativePath, pathLabel) {
  if (typeof rootDir !== "string" || rootDir.trim() === "") {
    throw new TypeError("schema rootDir must be a non-empty string");
  }
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    throw new TypeError(`${pathLabel} path must be a non-empty string`);
  }
  if (path.isAbsolute(relativePath)) {
    throw pathEscapeError(pathLabel);
  }

  const absoluteRoot = path.resolve(rootDir);
  const absoluteCandidate = path.resolve(absoluteRoot, relativePath);
  if (!isDescendantPath(absoluteRoot, absoluteCandidate)) {
    throw pathEscapeError(pathLabel);
  }

  const realRoot = fs.realpathSync(absoluteRoot);
  const realCandidate = fs.realpathSync(absoluteCandidate);
  if (!isDescendantPath(realRoot, realCandidate)) {
    throw pathEscapeError(pathLabel);
  }
  return realCandidate;
}

function isDescendantPath(rootDir, candidate) {
  const relative = path.relative(rootDir, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function pathEscapeError(pathLabel) {
  const error = new Error(`${pathLabel} path must stay within rootDir`);
  error.code = "KERNEL_PATH_ESCAPE";
  return error;
}

function versionFromSchemaId(id) {
  const match = /\/v([1-9][0-9]*)$/.exec(id);
  if (!match) {
    throw new Error(`schema $id must end with a positive version: ${id}`);
  }
  return Number(match[1]);
}

function validateLoadedSchema(schema, id, requestedVersion, source) {
  if (!isPlainObject(schema)) {
    throw new Error(`schema document invalid at ${source}: expected an object`);
  }
  if (schema.$id !== id) {
    throw new Error(`schema $id mismatch at ${source}: expected ${id}, got ${String(schema.$id)}`);
  }
  if (schema.schema_version !== requestedVersion) {
    throw new Error(
      `schema version mismatch at ${source}: expected ${requestedVersion}, got ${String(schema.schema_version)}`
    );
  }
  return schema;
}

/**
 * Validate an instance against a schema loaded by `$id`.
 *
 * @param {string} id
 * @param {*} instance
 * @param {{rootDir?: string, manifest?: object, schemas?: Record<string, object>}} [opts]
 * @returns {ValidationResult}
 */
function validateById(id, instance, opts = {}) {
  const schema = loadSchemaById(id, opts);
  return validateInstance(schema, instance, { rootSchema: schema });
}

module.exports = {
  validateInstance,
  validateById,
  loadSchemaById,
  META_KEYS,
};
