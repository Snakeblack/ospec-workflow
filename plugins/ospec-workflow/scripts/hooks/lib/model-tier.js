"use strict";

const fs = require("node:fs");
const path = require("node:path");

function unquote(value) {
  return value.replace(/^["']|["']$/g, "");
}

function parseScalarOrArray(value) {
  if (/^\[.*\]$/.test(value)) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return inner.split(",").map((item) => unquote(item.trim()));
  }
  return unquote(value);
}

function parseModelsYaml(text) {
  const root = {};
  const stack = [{ indent: -1, container: root }];

  for (const rawLine of String(text).split(/\r?\n/)) {
    if (!rawLine.trim() || /^\s*#/.test(rawLine)) {
      continue;
    }
    const indent = rawLine.match(/^\s*/)[0].length;
    const match = rawLine.match(/^\s*([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1].trim();
    const valueRaw = match[2].trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].container;

    if (valueRaw === "") {
      const obj = {};
      parent[key] = obj;
      stack.push({ indent, container: obj });
    } else {
      parent[key] = parseScalarOrArray(valueRaw);
    }
  }

  return root;
}

function resolveModelTier(agent, pluginRoot) {
  try {
    const modelsPath = path.join(pluginRoot, "models.yaml");
    if (!fs.existsSync(modelsPath)) {
      return "unknown";
    }
    const content = fs.readFileSync(modelsPath, "utf8");
    const models = parseModelsYaml(content);
    
    if (!models || typeof models !== "object") {
      return "unknown";
    }

    const agents = models.agents;
    const tiers = models.tiers;
    if (!agents || typeof agents !== "object" || !tiers || typeof tiers !== "object") {
      return "unknown";
    }

    let tier = agents[agent];
    if (tier === undefined) {
      tier = agents["_default"];
    }

    if (tier && tiers[tier]) {
      return tier;
    }
    
    return "unknown";
  } catch {
    return "unknown";
  }
}

module.exports = {
  resolveModelTier,
  parseModelsYaml
};
