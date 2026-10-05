"use strict";

// Where a project keeps its contract documents and their tests
// (openspec/specs/idd/spec.md, REQ-idd-015): base patterns for any project,
// defaults per detected stack and the `contracts:` section of idd/config.yaml.
// contract-spec-and-test needs the diff to touch one of each. Pure functions.

const { globToRegExp, normalizePath } = require("./idd-impact.js");

const CONTRACT_BASE = Object.freeze({
  documents: Object.freeze([
    "**/openapi*.{yaml,yml,json}",
    "**/swagger*.{yaml,yml,json}",
    "**/asyncapi*.{yaml,yml,json}",
    "**/*.proto",
    "**/*.{graphql,gql}",
    "**/*.schema.json",
    "docs/api/**",
  ]),
  tests: Object.freeze(["**/*.test.*", "**/*.spec.*", "**/test/**", "**/tests/**", "**/__tests__/**"]),
});

const CONTRACT_STACKS = Object.freeze({
  node: { documents: ["**/*.d.ts"], tests: [] },
  jvm: { documents: [], tests: ["**/src/test/**", "**/*Test.{java,kt}"] },
  dotnet: { documents: [], tests: ["**/*Tests.cs", "**/*.Tests/**"] },
  python: { documents: ["**/*.pyi"], tests: ["**/test_*.py", "**/*_test.py"] },
  go: { documents: [], tests: ["**/*_test.go"] },
});

const CONTRACT_KEYS = Object.freeze(["defaults", "documents", "tests"]);
const LISTS = Object.freeze(["documents", "tests"]);

function validateContracts(contracts) {
  for (const key of Object.keys(contracts)) {
    if (!CONTRACT_KEYS.includes(key)) throw new Error(`unknown contracts key: ${key}`);
  }
  if ("defaults" in contracts) {
    if (contracts.defaults !== "true" && contracts.defaults !== "false") throw new Error("contracts.defaults must be true or false");
    contracts.defaults = contracts.defaults === "true";
  }
  for (const key of LISTS) {
    if (key in contracts && !Array.isArray(contracts[key])) contracts[key] = contracts[key] === "" ? [] : [contracts[key]];
  }
  return contracts;
}

function resolveContractPatterns({ stacks = [], contracts = {} } = {}) {
  const useDefaults = contracts.defaults !== false;
  const resolved = {};
  for (const key of LISTS) {
    const patterns = [];
    if (useDefaults) {
      patterns.push(...CONTRACT_BASE[key]);
      for (const stack of stacks) patterns.push(...(CONTRACT_STACKS[stack]?.[key] || []));
    }
    patterns.push(...(contracts[key] || []));
    resolved[key] = [...new Set(patterns)];
  }
  return resolved;
}

const REGEX_CACHE = new Map();

function matchesAny(file, globs) {
  return globs.some((glob) => {
    if (!REGEX_CACHE.has(glob)) REGEX_CACHE.set(glob, globToRegExp(glob));
    return REGEX_CACHE.get(glob).test(file);
  });
}

/** The changed paths that are contract documents and the ones that are tests, sorted. */
function classifyContractPaths(paths, patterns) {
  const files = [...new Set((paths || []).map(normalizePath))].sort();
  return {
    documents: files.filter((file) => matchesAny(file, patterns.documents)),
    tests: files.filter((file) => matchesAny(file, patterns.tests)),
  };
}

module.exports = {
  CONTRACT_BASE,
  CONTRACT_KEYS,
  CONTRACT_STACKS,
  classifyContractPaths,
  resolveContractPatterns,
  validateContracts,
};
