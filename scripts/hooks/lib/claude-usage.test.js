"use strict";

// REQ-context-measurement-007 / REQ-hooks-018: extractor de uso de tokens del
// host Claude desde la cola de la transcripción JSONL. Triple canónico
// entrada/salida/caché; par Anthropic all-or-nothing (ADR-002); lectura de cola
// acotada a 256 KiB (ADR-001); fail-safe total.

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  TAIL_WINDOW_BYTES,
  MAX_TAIL_LINES,
  normalizeUsageObject,
  analyzeTranscriptTail,
  readTranscriptTail,
  extractClaudeTelemetry,
} = require("./claude-usage.js");

async function createTmpDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-usage-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test("normalizeUsageObject normaliza el triple estándar válido", () => {
  assert.deepEqual(normalizeUsageObject({
    input_tokens: 100,
    output_tokens: 20,
    cached_input_tokens: 40,
  }), { input_tokens: 100, output_tokens: 20, cached_input_tokens: 40 });
});

test("normalizeUsageObject suma el par Anthropic al triple canónico", () => {
  // REQ-context-measurement-007: cache_read + cache_creation son fuente
  // equivalente de cached_input_tokens (suma de ambos).
  assert.deepEqual(normalizeUsageObject({
    input_tokens: 100,
    output_tokens: 20,
    cache_read_input_tokens: 30,
    cache_creation_input_tokens: 12,
  }), { input_tokens: 100, output_tokens: 20, cached_input_tokens: 42 });
});

test("normalizeUsageObject degrada el caché a undefined con el par incompleto (sin cero evidencial)", () => {
  const usage = normalizeUsageObject({
    input_tokens: 100,
    output_tokens: 20,
    cache_read_input_tokens: 30,
  });
  assert.equal(usage.input_tokens, 100);
  assert.equal(usage.output_tokens, 20);
  assert.equal(usage.cached_input_tokens, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(usage, "cached_input_tokens"), false);

  const usageCreation = normalizeUsageObject({
    input_tokens: 100,
    output_tokens: 20,
    cache_creation_input_tokens: 12,
  });
  assert.equal(usageCreation.cached_input_tokens, undefined);
});

test("normalizeUsageObject rechaza valores no enteros, negativos o > 10^12", () => {
  // Escalares inválidos en campos requeridos invalidan toda la entrada.
  assert.equal(normalizeUsageObject({ input_tokens: 1.5, output_tokens: 2 }), undefined);
  assert.equal(normalizeUsageObject({ input_tokens: -1, output_tokens: 2 }), undefined);
  assert.equal(normalizeUsageObject({ input_tokens: 1e12 + 1, output_tokens: 2 }), undefined);
  assert.equal(normalizeUsageObject({ input_tokens: 100, output_tokens: "20" }), undefined);
  assert.equal(normalizeUsageObject({ input_tokens: 100 }), undefined, "output_tokens es requerido");
  assert.equal(normalizeUsageObject({ output_tokens: 20 }), undefined, "input_tokens es requerido");
  assert.equal(normalizeUsageObject(undefined), undefined);
  assert.equal(normalizeUsageObject("no-object"), undefined);
});

test("normalizeUsageObject ignora el caché inválido o fuera de rango sin invalidar la entrada", () => {
  // El caché es opcional: un valor inválido degrada el caché, no la entrada.
  assert.deepEqual(
    normalizeUsageObject({ input_tokens: 100, output_tokens: 20, cached_input_tokens: -5 }),
    { input_tokens: 100, output_tokens: 20 },
  );
  // Par Anthropic con un miembro inválido → all-or-nothing: sin caché.
  assert.deepEqual(
    normalizeUsageObject({
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 1.5,
      cache_creation_input_tokens: 12,
    }),
    { input_tokens: 100, output_tokens: 20 },
  );
});

// ── analyzeTranscriptTail (escaneo reverso + firma Claude) ──────────────────

function claudeAssistantLine(usage) {
  return JSON.stringify({
    type: "assistant",
    message: { role: "assistant", usage },
  });
}

test("analyzeTranscriptTail escanea en reversa: la última entrada de uso válida gana", () => {
  const tail = [
    claudeAssistantLine({ input_tokens: 1, output_tokens: 2, cached_input_tokens: 0 }),
    JSON.stringify({ type: "user", message: { role: "user", content: "hola" } }),
    claudeAssistantLine({ input_tokens: 100, output_tokens: 20, cached_input_tokens: 40 }),
    "",
  ].join("\n");
  assert.deepEqual(analyzeTranscriptTail(tail), {
    usage: { input_tokens: 100, output_tokens: 20, cached_input_tokens: 40 },
    isClaudeTranscript: true,
  });
});

test("analyzeTranscriptTail prefiere entry.message.usage y acepta la forma genérica entry.usage", () => {
  // Forma Claude (message.usage) con prioridad sobre la genérica en la misma entrada.
  const both = JSON.stringify({
    usage: { input_tokens: 7, output_tokens: 7 },
    message: { usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 3 } },
  });
  assert.equal(analyzeTranscriptTail(both).usage.input_tokens, 10);

  // Forma genérica compatible cuando no hay message.usage.
  const generic = `${JSON.stringify({ usage: { input_tokens: 8, output_tokens: 4 } })}\n`;
  assert.deepEqual(analyzeTranscriptTail(generic), {
    usage: { input_tokens: 8, output_tokens: 4 },
    isClaudeTranscript: false,
  });
});

test("analyzeTranscriptTail ignora líneas corruptas o vacías sin lanzar", () => {
  const tail = [
    "{\"type\":\"assistant\", corrupto",
    "",
    "   ",
    claudeAssistantLine({ input_tokens: 5, output_tokens: 6 }),
    "no-json{",
  ].join("\n");
  assert.deepEqual(analyzeTranscriptTail(tail), {
    usage: { input_tokens: 5, output_tokens: 6 },
    isClaudeTranscript: true,
  });
  assert.deepEqual(analyzeTranscriptTail(""), { usage: undefined, isClaudeTranscript: false });
  assert.deepEqual(analyzeTranscriptTail("}}}no-json"), { usage: undefined, isClaudeTranscript: false });
});

test("analyzeTranscriptTail marca la firma Claude con type assistant y message objeto", () => {
  // Firma sin uso válido en la ventana: isClaudeTranscript true, usage undefined.
  const signatureOnly = [
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: "hola" } }),
    "",
  ].join("\n");
  assert.deepEqual(analyzeTranscriptTail(signatureOnly), {
    usage: undefined,
    isClaudeTranscript: true,
  });

  // Entradas que no son firma no activan la marca.
  assert.equal(analyzeTranscriptTail(`${JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 } })}\n`).isClaudeTranscript, false);
  assert.equal(
    analyzeTranscriptTail(`${JSON.stringify({ type: "assistant", message: "no-objeto" })}\n`).isClaudeTranscript,
    false,
  );
});

test("analyzeTranscriptTail respeta el límite MAX_TAIL_LINES de intentos de parse", () => {
  // Una entrada de uso válida fuera de las últimas MAX_TAIL_LINES líneas no se ve.
  const beyond = [
    claudeAssistantLine({ input_tokens: 999, output_tokens: 999 }),
    ...Array.from({ length: MAX_TAIL_LINES }, () => JSON.stringify({ type: "user" })),
  ].join("\n");
  assert.deepEqual(analyzeTranscriptTail(beyond), { usage: undefined, isClaudeTranscript: false });

  // En cambio, una entrada dentro de las últimas MAX_TAIL_LINES líneas gana.
  const within = [
    claudeAssistantLine({ input_tokens: 999, output_tokens: 999 }),
    ...Array.from({ length: MAX_TAIL_LINES - 1 }, () => JSON.stringify({ type: "user" })),
  ].join("\n");
  assert.equal(analyzeTranscriptTail(within).usage.input_tokens, 999);
});

// ── readTranscriptTail (ventana 256 KiB, una lectura posicionada, ADR-001) ──

test("readTranscriptTail lee solo la cola y descarta la primera línea parcial", async (t) => {
  const dir = await createTmpDir(t);
  const filePath = path.join(dir, "big-transcript.jsonl");
  // Primera línea enorme (≥ 300 KiB) con un marcador al inicio: cae fuera de
  // los últimos 256 KiB. La segunda línea pequeña contiene el uso vigente.
  const hugeFirstLine = `${JSON.stringify({
    marker: "MARKER-FUERA-DE-VENTANA",
    type: "assistant",
    message: { usage: { input_tokens: 111, output_tokens: 111 } },
    padding: "x".repeat(300 * 1024),
  })}`;
  const lastLine = claudeAssistantLine({ input_tokens: 222, output_tokens: 22, cached_input_tokens: 2 });
  await fs.writeFile(filePath, `${hugeFirstLine}\n${lastLine}\n`, "utf8");

  const tail = await readTranscriptTail(filePath);
  assert.ok(typeof tail === "string");
  assert.ok(tail.length <= TAIL_WINDOW_BYTES, "la lectura se acota a la ventana de 256 KiB");
  assert.ok(!tail.includes("MARKER-FUERA-DE-VENTANA"), "el inicio del archivo queda fuera de la ventana");
  assert.ok(tail.startsWith("{"), "la primera línea parcial (fragmento inválido) se descarta");

  const { usage } = analyzeTranscriptTail(tail);
  assert.deepEqual(usage, { input_tokens: 222, output_tokens: 22, cached_input_tokens: 2 });
});

test("readTranscriptTail devuelve el archivo completo cuando es menor que la ventana", async (t) => {
  const dir = await createTmpDir(t);
  const filePath = path.join(dir, "small-transcript.jsonl");
  const content = `${claudeAssistantLine({ input_tokens: 9, output_tokens: 3 })}\n`;
  await fs.writeFile(filePath, content, "utf8");
  assert.equal(await readTranscriptTail(filePath), content);
});

test("readTranscriptTail devuelve cadena vacía para un archivo vacío", async (t) => {
  const dir = await createTmpDir(t);
  const filePath = path.join(dir, "empty-transcript.jsonl");
  await fs.writeFile(filePath, "", "utf8");
  assert.equal(await readTranscriptTail(filePath), "");
});

test("readTranscriptTail degrada a undefined en archivos inexistentes o ilegibles", async (t) => {
  const dir = await createTmpDir(t);
  assert.equal(await readTranscriptTail(path.join(dir, "inexistente.jsonl")), undefined);

  const dirPath = path.join(dir, "es-un-directorio");
  await fs.mkdir(dirPath);
  assert.equal(await readTranscriptTail(dirPath), undefined, "leer un directorio falla sin lanzar");
});

test("readTranscriptTail rechaza rutas relativas y traversal antes de cualquier I/O", async (t) => {
  assert.equal(await readTranscriptTail("relative/transcript.jsonl"), undefined);
  assert.equal(await readTranscriptTail("/tmp/claude-usage-../../etc/passwd"), undefined);
  assert.equal(await readTranscriptTail(undefined), undefined);
  assert.equal(await readTranscriptTail(42), undefined);
});

// ── extractClaudeTelemetry (composición transcripción → cola → análisis) ────

test("extractClaudeTelemetry resuelve transcript_path y su alias agent_transcript_path", async (t) => {
  const dir = await createTmpDir(t);
  const filePath = path.join(dir, "session.jsonl");
  await fs.writeFile(filePath, `${claudeAssistantLine({ input_tokens: 30, output_tokens: 6, cache_read_input_tokens: 4, cache_creation_input_tokens: 2 })}\n`, "utf8");

  const byTranscript = await extractClaudeTelemetry({ transcript_path: filePath });
  assert.deepEqual(byTranscript, {
    usage: { input_tokens: 30, output_tokens: 6, cached_input_tokens: 6 },
    isClaudeTranscript: true,
  });

  const byAlias = await extractClaudeTelemetry({ agent_transcript_path: filePath });
  assert.deepEqual(byAlias, {
    usage: { input_tokens: 30, output_tokens: 6, cached_input_tokens: 6 },
    isClaudeTranscript: true,
  });

  // transcript_path tiene prioridad cuando ambos están presentes.
  const both = await extractClaudeTelemetry({
    transcript_path: filePath,
    agent_transcript_path: path.join(dir, "inexistente.jsonl"),
  });
  assert.equal(both.usage.input_tokens, 30);
});

test("extractClaudeTelemetry retorna undefined sin transcripción resoluble o ilegible", async () => {
  assert.equal(await extractClaudeTelemetry({}), undefined);
  assert.equal(await extractClaudeTelemetry({ transcript_path: "" }), undefined);
  assert.equal(await extractClaudeTelemetry({ agent_transcript_path: "/definitivamente/inexistente.jsonl" }), undefined);
  assert.equal(await extractClaudeTelemetry({ transcript_path: "traversal/../../etc" }), undefined);
});
