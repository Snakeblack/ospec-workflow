"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { validateInstance, validateSchemaDocument } = require("../kernel-schema-validator.js");

const CHECKER = "k1-schema-compat";
const MANIFEST_REL = "schemas/kernel/manifest.json";
const CLAIMS_REL = "schemas/kernel/contract-claims.json";
const REQUIRED_FAMILIES = Object.freeze([
  "state-transition",
  "classification",
  "contract",
  "graph-node",
  "work-order",
  "candidate",
  "evidence",
  "verification",
  "finding-review",
  "failure-recovery",
  "receipt",
  "event",
]);

/**
 * Publication aliases: manifest family key differs from filesystem directory.
 * ADR-001: candidate-v2 / work-order-v2 keys point at candidate/v2 and work-order/v2.
 * K6b: evidence-v2 / verification-v2 keys point at evidence/v2 and verification/v2.
 */
const FAMILY_PUBLICATION = Object.freeze({
  "candidate-v2": Object.freeze({
    path: "schemas/kernel/candidate/v2.schema.json",
    id: "ospec://schemas/kernel/candidate/v2",
    fixturesDir: "schemas/kernel/candidate/fixtures",
    fixtureNameFilter: (name) => name.startsWith("v2-"),
  }),
  "work-order-v2": Object.freeze({
    path: "schemas/kernel/work-order/v2.schema.json",
    id: "ospec://schemas/kernel/work-order/v2",
    fixturesDir: "schemas/kernel/work-order/fixtures",
    fixtureNameFilter: (name) => name.startsWith("v2-"),
  }),
  "evidence-v2": Object.freeze({
    path: "schemas/kernel/evidence/v2.schema.json",
    id: "ospec://schemas/kernel/evidence/v2",
    fixturesDir: "schemas/kernel/evidence/fixtures",
    fixtureNameFilter: (name) => name.startsWith("v2-"),
  }),
  "verification-v2": Object.freeze({
    path: "schemas/kernel/verification/v2.schema.json",
    id: "ospec://schemas/kernel/verification/v2",
    fixturesDir: "schemas/kernel/verification/fixtures",
    fixtureNameFilter: (name) => name.startsWith("v2-"),
  }),
  "assessment-v2": Object.freeze({
    path: "schemas/kernel/assessment/v2.schema.json",
    id: "ospec://schemas/kernel/assessment/v2",
    fixturesDir: "schemas/kernel/assessment/fixtures",
    fixtureNameFilter: (name) => name.startsWith("v2-") && name !== "v2-four-roles.json",
  }),
  candidate: Object.freeze({
    // k3-frozen.json is a Candidate v2 frozen-shape fixture living under the v1
    // fixtures tree for K3 adversarial tests; exclude it from K1 v1 family publication
    // so K1 schema-compat does not treat it as a v1 valid/invalid fixture.
    fixtureNameFilter: (name) => !name.startsWith("v2-") && name !== "k3-frozen.json",
  }),
  "work-order": Object.freeze({
    fixtureNameFilter: (name) => !name.startsWith("v2-"),
  }),
  evidence: Object.freeze({
    fixtureNameFilter: (name) => !name.startsWith("v2-"),
  }),
  verification: Object.freeze({
    fixtureNameFilter: (name) => !name.startsWith("v2-"),
  }),
  assessment: Object.freeze({
    // Bundle of four role payloads for identity distinctness; walked by k6b-schema-fixtures.
    fixtureNameFilter: (name) => !name.startsWith("v2-") && name !== "v1-four-roles.json",
  }),
});

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function offender(relativePath, expected, actual, message) {
  return { checker: CHECKER, path: toPosix(relativePath), expected, actual, message };
}

function readJson(root, relativePath, offenders) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
  } catch (err) {
    offenders.push(
      offender(
        relativePath,
        "readable JSON contract",
        err.message,
        `${relativePath} could not be read: ${err.message}`
      )
    );
    return null;
  }
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function readConfinedSchema(root, family, entry, offenders) {
  const entryPath = `${MANIFEST_REL}#families/${family}`;
  if (!isRecord(entry)) {
    offenders.push(offender(entryPath, "manifest family object", typeof entry, `${entryPath} must be an object`));
    return null;
  }

  const version = entry.schema_version;
  if (!Number.isInteger(version) || version < 1) {
    offenders.push(
      offender(entryPath, "positive integer schema_version", JSON.stringify(version), `${entryPath} schema_version must be a positive integer`)
    );
  }
  const publication = FAMILY_PUBLICATION[family];
  const expectedPath = publication && publication.path
    ? publication.path
    : Number.isInteger(version)
      ? `schemas/kernel/${family}/v${version}.schema.json`
      : `schemas/kernel/${family}/v<schema_version>.schema.json`;
  if (typeof entry.path !== "string" || toPosix(entry.path) !== expectedPath) {
    offenders.push(
      offender(entryPath, `canonical path ${expectedPath}`, JSON.stringify(entry.path), `${entryPath} path must equal canonical path ${expectedPath}`)
    );
    return null;
  }
  const expectedId = publication && publication.id
    ? publication.id
    : Number.isInteger(version)
      ? `ospec://schemas/kernel/${family}/v${version}`
      : `ospec://schemas/kernel/${family}/v<schema_version>`;
  if (entry.$id !== expectedId) {
    offenders.push(
      offender(entryPath, `$id ${expectedId}`, JSON.stringify(entry.$id), `${entryPath} $id must equal ${expectedId}`)
    );
  }

  const schemaRoot = path.resolve(root, "schemas", "kernel");
  const schemaPath = path.resolve(root, entry.path);
  if (!isWithin(schemaRoot, schemaPath)) {
    offenders.push(
      offender(entry.path, "path confined to schemas/kernel", schemaPath, `${entry.path} resolves outside schemas/kernel`)
    );
    return null;
  }

  try {
    const realSchemaRoot = fs.realpathSync(schemaRoot);
    const realSchemaPath = fs.realpathSync(schemaPath);
    if (!isWithin(realSchemaRoot, realSchemaPath)) {
      offenders.push(
        offender(entry.path, "real path confined to schemas/kernel", realSchemaPath, `${entry.path} resolves outside schemas/kernel through a link`)
      );
      return null;
    }
  } catch (err) {
    offenders.push(
      offender(entry.path, "existing readable schema path", err.message, `${entry.path} could not be resolved: ${err.message}`)
    );
    return null;
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  } catch (err) {
    offenders.push(
      offender(entry.path, "readable schema JSON", err.message, `${entry.path} could not be read: ${err.message}`)
    );
    return null;
  }
  if (!isRecord(schema)) {
    offenders.push(offender(entry.path, "JSON Schema object", typeof schema, `${entry.path} must contain an object`));
    return null;
  }
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    offenders.push(
      offender(entry.path, "Draft 2020-12 $schema", JSON.stringify(schema.$schema), `${entry.path} must declare Draft 2020-12 $schema`)
    );
  }
  if (typeof schema.$id !== "string" || schema.$id.trim() === "") {
    offenders.push(offender(entry.path, "non-empty $id", JSON.stringify(schema.$id), `${entry.path} is missing required $id`));
  } else if (schema.$id !== entry.$id) {
    offenders.push(
      offender(entry.path, `schema $id matching manifest ${entry.$id}`, schema.$id, `${entry.path} $id mismatch: manifest=${entry.$id}, schema=${schema.$id}`)
    );
  }
  if (!Number.isInteger(schema.schema_version)) {
    offenders.push(
      offender(entry.path, "integer schema_version", JSON.stringify(schema.schema_version), `${entry.path} schema_version must be an integer`)
    );
  } else if (schema.schema_version !== entry.schema_version) {
    offenders.push(
      offender(entry.path, `schema_version ${entry.schema_version}`, String(schema.schema_version), `${entry.path} schema_version does not match manifest/path version`)
    );
  }
  if (schema.type !== "object") {
    offenders.push(offender(entry.path, "top-level type object", JSON.stringify(schema.type), `${entry.path} top-level type must be object`));
  }
  if (!isRecord(schema.properties)) {
    offenders.push(offender(entry.path, "properties object", JSON.stringify(schema.properties), `${entry.path} properties must be an object`));
  }
  if (!Array.isArray(schema.required) || schema.required.some((field) => typeof field !== "string" || field === "")) {
    offenders.push(offender(entry.path, "required array of non-empty strings", JSON.stringify(schema.required), `${entry.path} required must be an array of field names`));
  }
  return schema;
}

function validateStringArray(value, label, claimPath, offenders, { nonEmpty = false } = {}) {
  if (
    !Array.isArray(value) ||
    (nonEmpty && value.length === 0) ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    offenders.push(
      offender(claimPath, `${label} array of non-empty strings${nonEmpty ? " (non-empty)" : ""}`, JSON.stringify(value), `${claimPath} ${label} must be an array of non-empty strings`)
    );
    return null;
  }
  return value;
}

function conditionRequires(schema, kind, field) {
  const conditions = [];
  if (isRecord(schema.if) && isRecord(schema.then)) conditions.push({ if: schema.if, then: schema.then });
  if (Array.isArray(schema.allOf)) {
    for (const branch of schema.allOf) {
      if (isRecord(branch) && isRecord(branch.if) && isRecord(branch.then)) conditions.push(branch);
    }
  }
  return conditions.some((condition) => {
    const discriminator = condition.if.properties && condition.if.properties.kind;
    return discriminator && discriminator.const === kind && Array.isArray(condition.then.required) && condition.then.required.includes(field);
  });
}

function validateCommandShape(schema, shape, claimPath, offenders) {
  if (!isRecord(shape) || typeof shape.kind !== "string" || shape.kind.trim() === "") {
    offenders.push(offender(claimPath, "command shape object with non-empty kind", JSON.stringify(shape), `${claimPath} has an invalid command shape`));
    return;
  }
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const kindEnum = properties.kind && Array.isArray(properties.kind.enum) ? properties.kind.enum : [];
  if (!kindEnum.includes(shape.kind)) {
    offenders.push(
      offender(claimPath, `kind ${shape.kind} allowed by schema enum`, JSON.stringify(kindEnum), `${claimPath} command kind ${shape.kind} is not allowed by the schema enum`)
    );
  }

  const requiredFields = validateStringArray(shape.requires, "requires", claimPath, offenders) || [];
  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(properties, field)) {
      offenders.push(
        offender(claimPath, `command field ${field} allowed by schema`, "not allowed", `${claimPath} required command field ${field} is not allowed by the schema`)
      );
    } else if (!conditionRequires(schema, shape.kind, field)) {
      offenders.push(
        offender(claimPath, `${shape.kind} condition requires ${field}`, "not enforced", `${claimPath} command shape ${shape.kind} requires ${field}, but the schema condition does not`)
      );
    }
  }

  const argumentFields = validateStringArray(
    shape.argument_required_fields,
    "argument_required_fields",
    claimPath,
    offenders
  ) || [];
  const argumentProperties =
    properties.arguments &&
    isRecord(properties.arguments.items) &&
    isRecord(properties.arguments.items.properties)
      ? properties.arguments.items.properties
      : {};
  for (const field of argumentFields) {
    if (!Object.prototype.hasOwnProperty.call(argumentProperties, field)) {
      offenders.push(
        offender(claimPath, `argument field ${field} allowed by schema`, "not allowed", `${claimPath} command argument field ${field} is not allowed by the schema`)
      );
    }
  }
}

function resolveDef(schema, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/$defs/")) return null;
  const defName = ref.slice("#/$defs/".length);
  if (!defName || defName.includes("/")) return null;
  return isRecord(schema.$defs) && isRecord(schema.$defs[defName]) ? schema.$defs[defName] : null;
}

/**
 * Resolve a field enum from the schema, including the first nested
 * `items.properties[field].enum` (following `$ref` into `$defs` when needed).
 *
 * K1 must resolve nested enums this way so claims such as assurance-graph
 * `edges.relation` via `#/$defs/edge` match. The first nested enum found wins;
 * top-level `properties[field].enum` still takes precedence.
 *
 * @param {object} schema
 * @param {string} field
 * @returns {Array|null}
 */
function resolveSchemaEnum(schema, field) {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  if (properties[field] && Array.isArray(properties[field].enum)) {
    return properties[field].enum;
  }
  for (const prop of Object.values(properties)) {
    if (!isRecord(prop) || !isRecord(prop.items)) continue;
    let items = prop.items;
    if (typeof items.$ref === "string") {
      items = resolveDef(schema, items.$ref);
      if (!isRecord(items)) continue;
    }
    const itemProperties = isRecord(items.properties) ? items.properties : {};
    if (itemProperties[field] && Array.isArray(itemProperties[field].enum)) {
      return itemProperties[field].enum;
    }
  }
  return null;
}

function validateFamilyClaims(family, schema, claim, offenders) {
  const claimPath = `${CLAIMS_REL}#families/${family}`;
  if (!isRecord(claim)) {
    offenders.push(offender(claimPath, "family claim object", typeof claim, `${claimPath} must be an object`));
    return;
  }
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const schemaRequired = Array.isArray(schema.required) ? schema.required : [];
  const requiredFields = validateStringArray(claim.required_fields, "required_fields", claimPath, offenders, { nonEmpty: true }) || [];
  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(properties, field)) {
      offenders.push(
        offender(claimPath, `required field ${field} allowed by schema`, "not allowed", `${claimPath} required field ${field} is not allowed by schema ${family}`)
      );
    } else if (!schemaRequired.includes(field)) {
      offenders.push(
        offender(claimPath, `field ${field} required by schema`, "optional", `${claimPath} asserts required field ${field}, but schema ${family} does not require it`)
      );
    }
  }

  if (!isRecord(claim.enum_values)) {
    offenders.push(offender(claimPath, "enum_values object", JSON.stringify(claim.enum_values), `${claimPath} enum_values must be an object`));
  } else {
    for (const [field, values] of Object.entries(claim.enum_values)) {
      const claimedValues = validateStringArray(values, `enum_values.${field}`, claimPath, offenders, { nonEmpty: true });
      if (!claimedValues) continue;
      const schemaEnum = resolveSchemaEnum(schema, field);
      if (!schemaEnum) {
        offenders.push(
          offender(claimPath, `schema enum for ${field}`, "missing", `${claimPath} asserts enum values for ${field}, but schema ${family} has no enum`)
        );
        continue;
      }
      for (const value of claimedValues) {
        if (!schemaEnum.includes(value)) {
          offenders.push(
            offender(claimPath, `${field} enum includes ${value}`, JSON.stringify(schemaEnum), `${claimPath} enum value ${value} is not allowed by schema ${family}.${field}`)
          );
        }
      }
    }
  }

  if (!Array.isArray(claim.command_shapes)) {
    offenders.push(offender(claimPath, "command_shapes array", JSON.stringify(claim.command_shapes), `${claimPath} command_shapes must be an array`));
  } else {
    for (let index = 0; index < claim.command_shapes.length; index += 1) {
      validateCommandShape(schema, claim.command_shapes[index], `${claimPath}/command_shapes/${index}`, offenders);
    }
  }
}

function validateFixtureSemantics(family, instance) {
  if (!isRecord(instance)) return [];
  const errors = [];
  if (family === "state-transition") {
    if (instance.kind === "execute") {
      if (typeof instance.command !== "string" || instance.command.trim() === "") errors.push("execute requires non-empty command");
      if (Array.isArray(instance.arguments)) {
        for (const argument of instance.arguments) {
          if (!isRecord(argument) || typeof argument.token !== "string" || argument.token.trim() === "") {
            errors.push("execute command arguments require token");
          }
        }
      }
    }
    if ((instance.kind === "collect" || instance.kind === "stop") && typeof instance.command === "string" && instance.command.trim() !== "") {
      errors.push(`${instance.kind} forbids command`);
    }
  }
  if (family === "complexity-architecture-delta") {
    if (Array.isArray(instance.alternatives) && typeof instance.candidate_id === "string") {
      for (const alternative of instance.alternatives) {
        if (isRecord(alternative) && typeof alternative.candidate_id === "string" && alternative.candidate_id !== instance.candidate_id) {
          errors.push("alternative candidate_id must match report candidate_id");
        }
      }
    }
  }
  return errors;
}

function listJsonFiles(directory, nameFilter) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .filter((entry) => !nameFilter || nameFilter(entry.name))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch {
    return [];
  }
}

function validateFixtures(root, family, schema, offenders) {
  const publication = FAMILY_PUBLICATION[family] || {};
  const familyRoot = publication.fixturesDir
    ? path.join(root, publication.fixturesDir)
    : path.join(root, "schemas", "kernel", family, "fixtures");
  const nameFilter = publication.fixtureNameFilter;
  for (const expectedOutcome of ["valid", "invalid"]) {
    const directory = path.join(familyRoot, expectedOutcome);
    const files = listJsonFiles(directory, nameFilter);
    const relDir = toPosix(path.relative(root, directory));
    if (files.length === 0) {
      offenders.push(offender(relDir, `at least one ${expectedOutcome} JSON fixture`, "none", `${relDir} requires at least one JSON fixture`));
      continue;
    }
    for (const filePath of files) {
      const rel = toPosix(path.relative(root, filePath));
      let instance;
      try {
        instance = JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch (err) {
        offenders.push(offender(rel, "readable fixture JSON", err.message, `${rel} could not be read: ${err.message}`));
        continue;
      }
      let result;
      try {
        result = validateInstance(schema, instance);
      } catch (err) {
        offenders.push(offender(rel, "deterministic schema validation", err.message, `${rel} validation threw: ${err.message}`));
        continue;
      }
      const semanticErrors = validateFixtureSemantics(family, instance);
      const valid = result.valid && semanticErrors.length === 0;
      if (expectedOutcome === "valid" && !valid) {
        const detail = [...result.errors.map((error) => `${error.path}:${error.rule}`), ...semanticErrors].join(", ");
        offenders.push(offender(rel, "fixture accepted by schema and semantic rules", detail || "rejected", `${rel} is declared valid but was rejected: ${detail}`));
      }
      if (expectedOutcome === "invalid" && valid) {
        offenders.push(offender(rel, "fixture rejected by schema or semantic rules", "accepted", `${rel} is declared invalid but was accepted`));
      }
    }
  }
}

/**
 * REQ-contract-lint-008: validate the complete required family set, manifest
 * identity/path coherence, mandatory machine-readable contract claims, and
 * both positive and negative fixtures. Every parse/type/path error is an
 * offender; no optional sidecar can silently disable compatibility checks.
 *
 * @param {{root: string}} ctx
 */
function check(ctx) {
  const root = path.resolve(ctx.root);
  const offenders = [];
  const manifest = readJson(root, MANIFEST_REL, offenders);
  const claims = readJson(root, CLAIMS_REL, offenders);
  if (manifest === null) return offenders;

  if (!isRecord(manifest)) {
    offenders.push(offender(MANIFEST_REL, "manifest object", typeof manifest, `${MANIFEST_REL} must contain an object`));
    return offenders;
  }
  if (manifest.schema_version !== 1) {
    offenders.push(
      offender(MANIFEST_REL, "schema_version integer 1", JSON.stringify(manifest.schema_version), `${MANIFEST_REL} schema_version must be integer 1`)
    );
  }
  if (!isRecord(manifest.families)) {
    offenders.push(offender(MANIFEST_REL, "families object", JSON.stringify(manifest.families), `${MANIFEST_REL} families must be an object`));
    return offenders;
  }

  let claimFamilies = null;
  if (claims !== null) {
    if (!isRecord(claims)) {
      offenders.push(offender(CLAIMS_REL, "claims object", typeof claims, `${CLAIMS_REL} must contain an object`));
    } else {
      if (!Number.isInteger(claims.schema_version) || claims.schema_version !== 1) {
        offenders.push(
          offender(CLAIMS_REL, "schema_version integer 1", JSON.stringify(claims.schema_version), `${CLAIMS_REL} schema_version must be integer 1`)
        );
      }
      if (!isRecord(claims.families)) {
        offenders.push(offender(CLAIMS_REL, "families object", JSON.stringify(claims.families), `${CLAIMS_REL} families must be an object`));
      } else {
        claimFamilies = claims.families;
        for (const family of Object.keys(claimFamilies)) {
          if (!Object.prototype.hasOwnProperty.call(manifest.families, family)) {
            offenders.push(
              offender(`${CLAIMS_REL}#families/${family}`, "family present in manifest", "unknown", `${CLAIMS_REL} claims unknown family ${family}`)
            );
          }
        }
      }
    }
  }

  for (const family of REQUIRED_FAMILIES) {
    if (!Object.prototype.hasOwnProperty.call(manifest.families, family)) {
      offenders.push(
        offender(MANIFEST_REL, `required family ${family}`, "missing", `${MANIFEST_REL} is missing required schema family ${family}`)
      );
    }
  }

  for (const [family, entry] of Object.entries(manifest.families)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(family)) {
      offenders.push(
        offender(`${MANIFEST_REL}#families/${family}`, "canonical kebab-case family name", family, `${MANIFEST_REL} contains invalid family name ${family}`)
      );
      continue;
    }
    const schema = readConfinedSchema(root, family, entry, offenders);
    if (!schema) continue;

    const documentGate = validateSchemaDocument(schema);
    if (!documentGate.valid) {
      const detail = documentGate.errors.map((error) => `${error.path}:${error.rule}`).join(", ");
      offenders.push(
        offender(
          entry.path,
          "uniqueItems on every required array",
          detail || "duplicate required",
          `${entry.path} failed Draft 2020-12 uniqueItems on required: ${detail}`
        )
      );
    }

    if (!claimFamilies || !Object.prototype.hasOwnProperty.call(claimFamilies, family)) {
      offenders.push(
        offender(`${CLAIMS_REL}#families/${family}`, "mandatory family contract claim", "missing", `${CLAIMS_REL} is missing required claims for ${family}`)
      );
    } else {
      validateFamilyClaims(family, schema, claimFamilies[family], offenders);
    }
    validateFixtures(root, family, schema, offenders);
  }

  return offenders;
}

module.exports = { check, REQUIRED_FAMILIES, conditionRequires };
