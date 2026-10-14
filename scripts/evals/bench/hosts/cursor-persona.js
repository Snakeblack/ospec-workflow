"use strict";

// Persona transport for a Cursor model (E4.9). agy cannot serve Grok, so a
// Grok persona runs through `agent --print --mode ask` in an empty directory:
// the reply is JSON in the result text, because the CLI has no schema flag.
// The simulated user's tokens stay on the persona, as with every other host.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildPersonaPrompt, buildPersonaSystemPrompt, normalizePersonaReply } = require("../persona.js");

const TIMEOUT_MS = 5 * 60 * 1000;
const STDERR_TAIL = 2000;
const JSON_ONLY = "Responde únicamente con un objeto JSON, sin markdown ni herramientas, con las claves kind, answer, facts_disclosed y deviates_from_recommendation.";

function cursorPersonaArgs({ model }) {
  return ["--print", "--mode", "ask", "--model", model, "--output-format", "json", "--trust"];
}

function extractObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (typeof value.kind === "string" && typeof value.answer === "string") return value;
    for (const key of ["result", "text", "message"]) {
      if (key in value) {
        const found = extractObject(value[key]);
        if (found) return found;
      }
    }
    return null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return extractObject(JSON.parse(trimmed));
    } catch {
      // fenced or embedded below
    }
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return extractObject(fenced[1]);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return extractObject(JSON.parse(trimmed.slice(start, end + 1)));
    } catch {
      return null;
    }
  }
  return null;
}

function usageFrom(raw) {
  const usage = raw && typeof raw === "object" && raw.usage && typeof raw.usage === "object" ? raw.usage : {};
  return {
    input: Number(usage.input_tokens ?? usage.input) || 0,
    output: Number(usage.output_tokens ?? usage.output) || 0,
    cache_read: Number(usage.cache_read_tokens ?? usage.cache_read) || 0,
    cache_creation: Number(usage.cache_creation_tokens ?? usage.cache_creation) || 0,
  };
}

function parseCursorPersona(stdout, scenario) {
  const candidates = [];
  const whole = String(stdout || "").trim();
  try {
    candidates.push(JSON.parse(whole));
  } catch {
    // a stream of JSON lines
  }
  for (const line of whole.split("\n")) {
    try {
      candidates.push(JSON.parse(line));
    } catch {
      // not a JSON line
    }
  }
  for (const candidate of candidates.reverse()) {
    const obj = extractObject(candidate);
    if (obj && typeof obj.kind === "string") return { reply: normalizePersonaReply(obj, scenario), usage: usageFrom(candidate) };
  }
  throw new Error("cursor persona did not return the reply object");
}

function run(spawnImpl, executable, args, cwd, input) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(executable, args, { cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const chunks = [];
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("cursor persona timed out"));
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => { chunks.push(chunk); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-STDERR_TAIL); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(chunks).toString("utf8");
      if (code !== 0) reject(new Error(`cursor persona exit ${code}: ${stderr.trim()}`));
      else resolve(stdout);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

/**
 * Asks the Cursor CLI, in an empty directory and ask mode, and returns the
 * normalized persona reply. `workspace`, when passed, is kept; otherwise the
 * call creates and removes its own directory.
 */
async function askCursorPersona({
  model,
  scenario,
  goal,
  message,
  executable = "agent",
  spawnImpl = spawn,
  workspace = null,
}) {
  const dir = workspace || fs.mkdtempSync(path.join(os.tmpdir(), "bench-persona-"));
  const owned = workspace == null;
  const prompt = `${JSON_ONLY}\n\n${buildPersonaSystemPrompt(scenario, { goal })}\n\n${buildPersonaPrompt(message)}`;
  try {
    const stdout = await run(spawnImpl, executable, [...cursorPersonaArgs({ model }), "--workspace", dir, prompt], dir, "");
    return parseCursorPersona(stdout, scenario);
  } finally {
    if (owned) fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { askCursorPersona, cursorPersonaArgs, parseCursorPersona };
