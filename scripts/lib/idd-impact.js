"use strict";

// Path patterns behind the path-driven IDD signals (openspec/specs/idd/spec.md,
// REQ-idd-012): base patterns for any project, defaults per stack and the
// project's own `impact:` section of idd/config.yaml. Pure functions: the
// caller reads the config and the root listing.

const IMPACT_SIGNALS = Object.freeze(["public-contract", "persistent-data", "security-boundary"]);

// Key of the impact: section → signal id.
const CONFIG_KEYS = Object.freeze({
  public_contract: "public-contract",
  persistent_data: "persistent-data",
  security_boundary: "security-boundary",
});

const BASE_PATTERNS = Object.freeze({
  "public-contract": [
    "**/api/**",
    "**/openapi*.{yaml,yml,json}",
    "**/swagger*.{yaml,yml,json}",
    "**/*.proto",
    "**/*.{graphql,gql}",
  ],
  "persistent-data": ["**/migrations/**", "**/migration/**", "**/*.sql", "**/schema.prisma", "**/alembic/**", "**/db/changelog/**"],
  "security-boundary": [
    "**/auth/**",
    "**/authentication/**",
    "**/authorization/**",
    "**/security/**",
    "**/permissions/**",
    "**/*secret*",
    "**/*credential*",
    "**/.env*",
    "**/*.{pem,key}",
  ],
});

const STACK_PATTERNS = Object.freeze({
  node: {
    "public-contract": ["**/routes/**", "**/controllers/**"],
    "security-boundary": ["**/middleware/*auth*"],
  },
  jvm: {
    "public-contract": ["**/controller/**", "**/*Controller.{java,kt}", "**/*Resource.{java,kt}"],
    "persistent-data": ["**/resources/db/**"],
    "security-boundary": ["**/*SecurityConfig*.{java,kt}"],
  },
  dotnet: {
    "public-contract": ["**/Controllers/**", "**/*Controller.cs", "**/*Endpoints.cs"],
    "persistent-data": ["**/*DbContext.cs"],
    "security-boundary": ["**/*Authorization*.cs", "**/*Authentication*.cs"],
  },
  python: {
    "public-contract": ["**/routes/**", "**/routers/**", "**/views.py", "**/urls.py"],
    "security-boundary": ["**/permissions.py"],
  },
  go: {
    "public-contract": ["**/handler/**", "**/handlers/**"],
    "security-boundary": ["**/middleware/*auth*"],
  },
});

const STACKS = Object.freeze(Object.keys(STACK_PATTERNS));

// Documentation describes a boundary; it does not move it.
const DEFAULT_EXCLUDE = Object.freeze(["**/*.md", "**/*.mdx", "docs/**"]);

const STACK_MARKERS = Object.freeze([
  { stack: "node", test: (name) => name === "package.json" },
  { stack: "jvm", test: (name) => /^(pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?)$/.test(name) },
  { stack: "dotnet", test: (name) => /\.(csproj|fsproj|sln)$/.test(name) },
  { stack: "python", test: (name) => /^(pyproject\.toml|requirements\.txt|setup\.py|setup\.cfg|Pipfile)$/.test(name) },
  { stack: "go", test: (name) => name === "go.mod" },
]);

class IddImpactError extends Error {
  constructor(message) {
    super(message);
    this.name = "IddImpactError";
    this.code = "impact-config-invalid";
  }
}

function escapeLiteral(char) {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

// `**/` any leading directories (none included), `/**` anything below, `*` one
// segment, `?` one character, `{a,b}` alternatives. Case-insensitive, because
// hosts disagree on directory casing (Migrations, Controllers).
function globToRegExp(glob) {
  const source = String(glob).replace(/\\/g, "/").trim();
  let pattern = "";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (source.startsWith("**/", i)) {
      pattern += "(?:.*/)?";
      i += 2;
    } else if (source.startsWith("/**", i) && i + 3 === source.length) {
      pattern += "(?:/.*)?";
      i += 2;
    } else if (source.startsWith("**", i)) {
      pattern += ".*";
      i += 1;
    } else if (char === "*") {
      pattern += "[^/]*";
    } else if (char === "?") {
      pattern += "[^/]";
    } else if (char === "{") {
      const end = source.indexOf("}", i);
      if (end === -1) {
        pattern += escapeLiteral(char);
        continue;
      }
      const options = source.slice(i + 1, end).split(",").map((option) => [...option].map(escapeLiteral).join(""));
      pattern += `(?:${options.join("|")})`;
      i = end;
    } else {
      pattern += escapeLiteral(char);
    }
  }
  return new RegExp(`^${pattern}$`, "i");
}

const REGEX_CACHE = new Map();

function matches(file, glob) {
  let regex = REGEX_CACHE.get(glob);
  if (!regex) {
    regex = globToRegExp(glob);
    REGEX_CACHE.set(glob, regex);
  }
  return regex.test(file);
}

function normalizePath(file) {
  return String(file).replace(/\\/g, "/").replace(/^\.\//, "");
}

function detectStacks(rootEntries) {
  const stacks = new Set();
  for (const name of rootEntries) {
    for (const marker of STACK_MARKERS) {
      if (marker.test(name)) stacks.add(marker.stack);
    }
  }
  return [...stacks].sort();
}

function resolvePatterns({ stacks = [], impact = {} } = {}) {
  const useDefaults = impact.defaults !== false;
  const effectiveStacks = impact.stack ?? stacks;
  const resolved = {};
  for (const signal of IMPACT_SIGNALS) {
    const patterns = [];
    if (useDefaults) {
      patterns.push(...BASE_PATTERNS[signal]);
      for (const stack of effectiveStacks) patterns.push(...(STACK_PATTERNS[stack]?.[signal] || []));
    }
    const key = Object.keys(CONFIG_KEYS).find((name) => CONFIG_KEYS[name] === signal);
    patterns.push(...(impact[key] || []));
    resolved[signal] = [...new Set(patterns)];
  }
  resolved.exclude = [...new Set([...(useDefaults ? DEFAULT_EXCLUDE : []), ...(impact.exclude || [])])];
  return resolved;
}

// The first matching pattern per signal, in catalog order; [] when excluded.
function matchImpact(file, patterns) {
  const normalized = normalizePath(file);
  if (patterns.exclude.some((glob) => matches(normalized, glob))) return [];
  const found = [];
  for (const signal of IMPACT_SIGNALS) {
    const pattern = patterns[signal].find((glob) => matches(normalized, glob));
    if (pattern) found.push({ signal, pattern });
  }
  return found;
}

// --- impact: section of idd/config.yaml, parsed by idd-config.js ----------

function validateImpact(impact) {
  for (const key of Object.keys(impact)) {
    if (!["stack", "defaults", "exclude", ...Object.keys(CONFIG_KEYS)].includes(key)) {
      throw new IddImpactError(`unknown impact key: ${key}`);
    }
  }
  if ("defaults" in impact) {
    if (impact.defaults !== "true" && impact.defaults !== "false") {
      throw new IddImpactError("impact.defaults must be true or false");
    }
    impact.defaults = impact.defaults === "true";
  }
  if ("stack" in impact) {
    if (!Array.isArray(impact.stack)) impact.stack = [impact.stack];
    for (const stack of impact.stack) {
      if (!STACKS.includes(stack)) throw new IddImpactError(`unknown stack: ${stack}`);
    }
  }
  for (const key of ["exclude", ...Object.keys(CONFIG_KEYS)]) {
    if (key in impact && !Array.isArray(impact[key])) impact[key] = impact[key] === "" ? [] : [impact[key]];
  }
  return impact;
}

module.exports = {
  BASE_PATTERNS,
  CONFIG_KEYS,
  DEFAULT_EXCLUDE,
  IMPACT_SIGNALS,
  IddImpactError,
  STACKS,
  STACK_PATTERNS,
  detectStacks,
  globToRegExp,
  matchImpact,
  normalizePath,
  resolvePatterns,
  validateImpact,
};
