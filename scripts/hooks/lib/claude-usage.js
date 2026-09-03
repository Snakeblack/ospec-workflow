"use strict";

// REQ-hooks-018 / REQ-context-measurement-007: extractor fail-safe del uso de
// tokens del host Claude (y endpoints compatibles Anthropic/GLM) desde la cola
// de la transcripción JSONL de sesión. Alimenta exclusivamente la lane CX0 de
// context-measurements.jsonl (nunca la grabación de phase-cost, REQ-hooks-001).
//
// Presupuesto de I/O (ADR-001): una única lectura posicionada de los últimos
// TAIL_WINDOW_BYTES bytes con escaneo reverso por líneas; sin reintentos ni
// fallback a lectura completa. Cualquier fallo degrada a `undefined` y el
// registro CX0 normaliza las métricas afectadas a `unavailable`.

const fs = require("node:fs/promises");
const { validatePath } = require("../../lib/pathsafe.js");

// Últimos 256 KiB de la transcripción: presupuesto contractual bajo el
// `timeout: 5` declarado en hooks/hooks.json (ADR-001).
const TAIL_WINDOW_BYTES = 262_144;
// Cota de intentos de parse por invocación (líneas JSONL en la ventana).
const MAX_TAIL_LINES = 1000;

const MAX_TOKEN_COUNT = 1_000_000_000_000;

/**
 * Valida un contador de tokens del host: entero seguro en [0, 10^12]
 * (misma cota que `count()` del validador CX0 en scripts/lib/context-measurement.js).
 *
 * @param {unknown} value valor crudo del campo de uso
 * @returns {number|undefined} el valor validado, o undefined si es inválido
 */
function validTokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_TOKEN_COUNT
    ? value
    : undefined;
}

/**
 * Normaliza un objeto de uso del host al triple canónico entrada/salida/caché
 * (REQ-context-measurement-007).
 *
 * - Entrada calificante: `input_tokens` y `output_tokens` válidos; sin ellos
 *   la entrada no califica y retorna undefined. El caché es opcional (ruta de
 *   cobertura parcial).
 * - `cached_input_tokens`: campo estándar si es válido; si no, par Anthropic
 *   all-or-nothing (`cache_read_input_tokens` + `cache_creation_input_tokens`
 *   solo si AMBOS son válidos; un solo miembro → sin caché, sin ceros
 *   evidenciales, ADR-002).
 *
 * @param {unknown} usage objeto `usage` crudo (no el entry completo)
 * @returns {{input_tokens: number, output_tokens: number, cached_input_tokens?: number}|undefined}
 */
function normalizeUsageObject(usage) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return undefined;
  }
  const inputTokens = validTokenCount(usage.input_tokens);
  const outputTokens = validTokenCount(usage.output_tokens);
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }
  const normalized = { input_tokens: inputTokens, output_tokens: outputTokens };
  const standardCached = validTokenCount(usage.cached_input_tokens);
  if (standardCached !== undefined) {
    normalized.cached_input_tokens = standardCached;
    return normalized;
  }
  // Par Anthropic all-or-nothing: la suma solo si ambos miembros son válidos.
  const cacheRead = validTokenCount(usage.cache_read_input_tokens);
  const cacheCreation = validTokenCount(usage.cache_creation_input_tokens);
  if (cacheRead !== undefined && cacheCreation !== undefined) {
    normalized.cached_input_tokens = cacheRead + cacheCreation;
  }
  return normalized;
}

/**
 * Objeto plano no-array (para `message` de la firma Claude y usos anidados).
 */
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Extrae y normaliza el uso de una entrada JSONL: forma Claude
 * (`entry.message.usage`) primero, luego la forma genérica (`entry.usage`).
 *
 * @param {unknown} entry entrada JSONL ya parseada
 * @returns {{input_tokens: number, output_tokens: number, cached_input_tokens?: number}|undefined}
 */
function usageFromEntry(entry) {
  if (!isPlainObject(entry)) return undefined;
  return normalizeUsageObject(entry.message?.usage) ?? normalizeUsageObject(entry.usage);
}

/**
 * Firma de transcripción Claude (REQ-context-measurement-008, tier 5): una
 * entrada con `type === "assistant"` y `message` objeto en la ventana.
 *
 * @param {unknown} entry entrada JSONL ya parseada
 * @returns {boolean}
 */
function isClaudeAssistantEntry(entry) {
  return isPlainObject(entry) && entry.type === "assistant" && isPlainObject(entry.message);
}

/**
 * Analiza el texto de la cola de una transcripción JSONL con escaneo reverso
 * (REQ-hooks-018): la última entrada de uso válida gana (precedente
 * `parseCodexTokenCountTranscript`). Las líneas corruptas o vacías se ignoran
 * sin lanzar. Examina a lo sumo MAX_TAIL_LINES líneas. La firma Claude se
 * evalúa sobre la misma ventana (un solo pase alimenta uso + firma).
 *
 * @param {string} tailText texto de la cola de la transcripción
 * @returns {{usage: {input_tokens: number, output_tokens: number, cached_input_tokens?: number}|undefined, isClaudeTranscript: boolean}}
 */
function analyzeTranscriptTail(tailText) {
  const lines = String(tailText ?? "").split(/\r?\n/);
  const window = lines.slice(-MAX_TAIL_LINES);
  let usage;
  let isClaudeTranscript = false;
  for (let index = window.length - 1; index >= 0; index -= 1) {
    const line = window[index];
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (usage === undefined) {
      usage = usageFromEntry(parsed);
    }
    if (!isClaudeTranscript && isClaudeAssistantEntry(parsed)) {
      isClaudeTranscript = true;
    }
  }
  return { usage, isClaudeTranscript };
}

/**
 * Lee los últimos `tailBytes` bytes de un archivo con UNA única lectura
 * posicionada (`open` → `stat` → `read` en max(0, size − tailBytes)), ADR-001.
 * Si el offset es > 0 descarta la primera línea parcial del bloque (cortada a
 * mitad de JSONL). Fail-safe total: cualquier error (validación de ruta,
 * apertura, lectura, cierre) retorna undefined sin reintentos ni fallback a
 * lectura completa; una ventana sin líneas completas retorna "".
 *
 * @param {unknown} filePath ruta de la transcripción (no confiable)
 * @param {number} [tailBytes=TAIL_WINDOW_BYTES] tamaño de la ventana en bytes
 * @returns {Promise<string|undefined>} texto de la cola, "" para archivo vacío,
 *   undefined ante cualquier fallo
 */
async function readTranscriptTail(filePath, tailBytes = TAIL_WINDOW_BYTES) {
  const { cleaned, ok } = validatePath(filePath);
  if (!ok) return undefined;
  let handle;
  try {
    handle = await fs.open(cleaned, "r");
    try {
      const stat = await handle.stat();
      const size = Number(stat.size);
      const offset = Math.max(0, size - tailBytes);
      const length = size - offset;
      if (length <= 0) return "";
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      const text = buffer.subarray(0, bytesRead).toString("utf8");
      if (offset > 0) {
        const newlineIndex = text.indexOf("\n");
        return newlineIndex >= 0 ? text.slice(newlineIndex + 1) : "";
      }
      return text;
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

/**
 * Resuelve la ruta de la transcripción del dispatch: `transcript_path` primero,
 * `agent_transcript_path` como alias (precedente REQ-hooks-006).
 *
 * @param {unknown} input dispatch crudo del host
 * @returns {unknown} el valor crudo de la ruta (o undefined)
 */
function resolveClaudeTranscriptPath(input) {
  return input?.transcript_path || input?.agent_transcript_path;
}

/**
 * Extrae la telemetría de uso del host Claude desde la transcripción del
 * dispatch (REQ-hooks-018): resuelve la ruta, lee la cola acotada (ADR-001) y
 * analiza el escaneo reverso. La extracción se intenta SIEMPRE que haya una
 * transcripción resoluble, sin gate de host (decisión de diseño; el par `env`
 * conserva la firma del contrato aunque ninguna señal lo gatea: un host
 * no-Claude con contadores compatibles produce telemetría `host-observed` más
 * veraz en una lane aditiva sin autoridad, ADR-002).
 *
 * @param {unknown} input dispatch crudo del host
 * @param {NodeJS.ProcessEnv} [env=process.env] entorno inyectado (contrato; sin uso de gate)
 * @returns {Promise<{usage?: object, isClaudeTranscript: boolean}|undefined>}
 *   el análisis de la cola, o undefined sin transcripción resoluble/legible
 */
async function extractClaudeTelemetry(input, env = process.env) {
  const transcriptPath = resolveClaudeTranscriptPath(input);
  if (typeof transcriptPath !== "string" || !transcriptPath) {
    return undefined;
  }
  const tail = await readTranscriptTail(transcriptPath);
  if (tail === undefined) {
    return undefined;
  }
  return analyzeTranscriptTail(tail);
}

module.exports = {
  TAIL_WINDOW_BYTES,
  MAX_TAIL_LINES,
  normalizeUsageObject,
  analyzeTranscriptTail,
  readTranscriptTail,
  extractClaudeTelemetry,
};
