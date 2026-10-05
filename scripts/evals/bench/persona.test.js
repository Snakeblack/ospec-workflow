"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PERSONA_KINDS,
  PERSONA_SCHEMA,
  buildPersonaPrompt,
  buildPersonaSystemPrompt,
  normalizePersonaReply,
} = require("./persona.js");

const scenario = {
  id: "cli-local",
  brief: "Quiero prioridades.",
  facts: [{ id: "F1", text: "Por defecto, media." }, { id: "F2", text: "Inválida: salida 2." }],
};

test("the system prompt carries the brief, every fact, and the arm's goal", () => {
  const system = buildPersonaSystemPrompt(scenario, { goal: "implementado y archivado" });
  assert.match(system, /Quiero prioridades\./);
  assert.match(system, /F1: Por defecto, media\./);
  assert.match(system, /F2: Inválida: salida 2\./);
  assert.match(system, /implementado y archivado/);
});

test("the system prompt ties disclosed facts to the answer and asks to check summaries", () => {
  const system = buildPersonaSystemPrompt(scenario, { goal: "g" });
  assert.match(system, /solo los hechos cuyo contenido has escrito en answer/);
  assert.match(system, /resume lo que entendió/);
});

test("the turn prompt keeps the head and tail of a long agent message", () => {
  const long = `INICIO ${"x".repeat(20000)} FINAL`;
  const prompt = buildPersonaPrompt(long);
  assert.match(prompt, /INICIO/);
  assert.match(prompt, /FINAL/);
  assert.ok(prompt.length < 13000);
});

test("the schema only allows the declared kinds", () => {
  assert.deepEqual(PERSONA_SCHEMA.properties.kind.enum, PERSONA_KINDS);
  assert.deepEqual(PERSONA_SCHEMA.required.sort(), ["answer", "deviates_from_recommendation", "facts_disclosed", "kind"]);
});

test("normalizePersonaReply keeps known facts and flags the rest", () => {
  const reply = normalizePersonaReply({
    kind: "question",
    answer: "Media por defecto.",
    facts_disclosed: ["F1", "F7", "F1"],
    deviates_from_recommendation: false,
  }, scenario);
  assert.deepEqual(reply, {
    kind: "question",
    answer: "Media por defecto.",
    facts_disclosed: ["F1"],
    deviates_from_recommendation: false,
    unknown_facts: ["F7"],
  });
});

test("normalizePersonaReply rejects malformed replies", () => {
  assert.throws(() => normalizePersonaReply({ kind: "chat", answer: "x", facts_disclosed: [], deviates_from_recommendation: false }, scenario), /kind/);
  assert.throws(() => normalizePersonaReply({ kind: "question", answer: " ", facts_disclosed: [], deviates_from_recommendation: false }, scenario), /answer/);
  assert.throws(() => normalizePersonaReply(null, scenario), /object/);
});
