"use strict";

// MCP prerequisites shared by the installers: warn (never fail) when a setup
// ships an MCP server that needs `uvx` (MarkItDown) and the Astral uv
// toolchain is not on PATH. Without uvx the server dies at spawn time and the
// foundation step skips document conversion; the install itself stays valid.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const UVX_WARNING =
  "aviso: no se encontró 'uvx' en PATH; el servidor MCP de MarkItDown no arrancará y la conversión de documentos se omitirá.\n" +
  "  Instala uv (incluye uvx): https://docs.astral.sh/uv/\n";

// Command of every MCP server declared in a `.mcp.json`, an opencode.json
// `mcp` map, a Cursor `mcpServers` map or a plain server map. Unknown shapes
// yield [].
function commandNames(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return [];
  const servers = document.mcpServers || document.mcp || document;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];
  const names = [];
  for (const server of Object.values(servers)) {
    if (!server || typeof server !== "object") continue;
    const command = Array.isArray(server.command) ? server.command[0] : server.command;
    if (typeof command === "string" && command.length > 0) names.push(command);
  }
  return names;
}

// Command names declared by <sourceDir>/.mcp.json; [] when absent or unreadable.
function commandsFromSourceMcp(sourceDir, { fs: fsImpl = fs } = {}) {
  try {
    const file = path.join(sourceDir, ".mcp.json");
    if (!fsImpl.existsSync(file)) return [];
    return commandNames(JSON.parse(fsImpl.readFileSync(file, "utf8")));
  } catch {
    return [];
  }
}

function uvxOnPath({ spawn = spawnSync, env = process.env } = {}) {
  try {
    const probe = spawn("uvx", ["--version"], { stdio: "ignore", shell: false, env });
    return Boolean(probe) && !probe.error && probe.status === 0;
  } catch {
    return false;
  }
}

// Warns when `commands` (a list of command names or a server document)
// declares `uvx` and the binary is not on PATH; returns whether it warned.
function warnIfUvxMissing(commands, { stderr, spawnSync: spawnImpl, env } = {}) {
  const list = Array.isArray(commands) ? commands : commandNames(commands);
  if (!list.includes("uvx")) return false;
  if (uvxOnPath({ spawn: spawnImpl || spawnSync, env })) return false;
  if (stderr && typeof stderr.write === "function") stderr.write(UVX_WARNING);
  return true;
}

module.exports = {
  commandNames,
  commandsFromSourceMcp,
  warnIfUvxMissing,
};
