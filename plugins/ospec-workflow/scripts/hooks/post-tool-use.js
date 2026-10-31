#!/usr/bin/env node

"use strict";

// PostToolUse (E1.27): censura los secretos de la salida de cualquier
// herramienta antes de que la vea el modelo, conservando la forma de la
// respuesta (el host descarta una salida reescrita que no coincide). Sin nada
// que censurar no escribe nada y el host entrega la salida original.
//
// PARIDAD: internal/hooks/posttooluse.go.

const { redactDeep } = require("./lib/secret-redact.js");
const { classifySensitiveFile } = require("./lib/secret-scan.js");

const PATH_KEYS = ["file_path", "filePath", "path", "notebook_path"];

// A read of a file the name classifier flags (.env*, credentials,
// secrets.json…) is redacted in sensitive-file mode.
function readsSensitiveFile(input) {
  const candidates = [];
  const toolInput = input.tool_input;
  if (toolInput && typeof toolInput === "object") {
    for (const key of PATH_KEYS) {
      if (typeof toolInput[key] === "string") candidates.push(toolInput[key]);
    }
  }
  const file = input.tool_response && input.tool_response.file;
  if (file && typeof file.filePath === "string") candidates.push(file.filePath);
  return candidates.some((candidate) => classifySensitiveFile(candidate) !== null);
}

function redactionNote(kinds) {
  return `[ospec] Se censuraron secretos en esta salida (${[...kinds].sort().join(", ")}). El fichero real los conserva: no escribas el marcador [REDACTED:…] en ningún fichero.`;
}

function evaluatePostToolUse(input) {
  if (process.env.DISABLE_SECRET_REDACTION === "true") return null;
  if (!input || typeof input !== "object" || input.tool_response === undefined) return null;
  const { value, kinds } = redactDeep(input.tool_response, { sensitiveFile: readsSensitiveFile(input) });
  if (kinds.length === 0) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      updatedToolOutput: value,
      additionalContext: redactionNote(kinds),
    },
  };
}

// Fail closed (ADR 0008): when the redaction cannot run, the model receives
// the response with every string withheld instead of the original.
function withheldOutput(input, detail) {
  const notice = `[ospec] Salida retenida: la censura de secretos falló (${detail}).`;
  const withhold = (value) => {
    if (typeof value === "string") return notice;
    if (Array.isArray(value)) return value.map(withhold);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withhold(item)]));
    }
    return value;
  };
  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      updatedToolOutput: withhold(input.tool_response),
      additionalContext: notice,
    },
  };
}

async function readJsonInput(stream = process.stdin) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const input = Buffer.concat(chunks).toString("utf8").trim();
  return input ? JSON.parse(input) : {};
}

async function main() {
  let input;
  try {
    input = await readJsonInput();
  } catch (error) {
    // Without the response there is no shape to rewrite: the launcher decides.
    process.stderr.write(`[ospec error] post-tool-use: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  let output;
  try {
    output = evaluatePostToolUse(input);
  } catch (error) {
    output = withheldOutput(input, error.message);
  }
  if (output) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
}

if (require.main === module) {
  void main();
}

module.exports = { evaluatePostToolUse, withheldOutput };
