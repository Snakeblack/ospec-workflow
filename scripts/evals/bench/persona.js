"use strict";

// Simulated user. A cheap model plays the person who asked for the change: it
// knows the scenario's hidden facts, answers the agent's questions with them,
// and otherwise lets the agent decide. Its classification of each agent
// message is what the bench counts as questions and interventions, and the
// facts it discloses (or a correction of the agent's recommendation) mark the
// questions that changed a decision.

const PERSONA_KINDS = Object.freeze(["question", "approval", "stopped", "finished", "blocked"]);
const MESSAGE_HEAD = 4000;
const MESSAGE_TAIL = 8000;

const PERSONA_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    kind: { type: "string", enum: PERSONA_KINDS },
    answer: { type: "string" },
    facts_disclosed: { type: "array", items: { type: "string" } },
    deviates_from_recommendation: { type: "boolean" },
  },
  required: ["kind", "answer", "facts_disclosed", "deviates_from_recommendation"],
  additionalProperties: false,
});

function buildPersonaSystemPrompt(scenario, { goal }) {
  const facts = scenario.facts.map((fact) => `- ${fact.id}: ${fact.text}`).join("\n");
  return [
    "Simulas a la persona que encargó un cambio de software a un agente de programación. No eres un asistente: eres quien pidió el cambio.",
    "",
    `Lo que pediste: ${scenario.brief}`,
    `Quieres que el agente lleve el cambio hasta el final: ${goal}.`,
    "",
    "Lo que sabes y el agente no sabe:",
    facts,
    "",
    "Con cada mensaje del agente:",
    "1. Clasifícalo en kind:",
    "   - question: te pide información o que elijas sobre qué construir o cómo.",
    "   - approval: te pide permiso o confirmación para seguir (aprobar una propuesta, un plan o una fase).",
    "   - stopped: terminó un paso y espera, sin preguntarte nada concreto.",
    "   - finished: dice que el cambio está terminado.",
    "   - blocked: dice que no puede seguir por un error o un bloqueo.",
    "   Si el mensaje pregunta algo y además pide aprobación, es question.",
    "2. Escribe answer en español, breve, como lo haría esa persona:",
    "   - question: si alguno de tus hechos contesta la pregunta, contesta con su contenido. Si ninguno la contesta, di que no tienes preferencia y que siga su recomendación.",
    "   - approval: aprueba y pide que siga, salvo que lo que propone contradiga alguno de tus hechos; entonces corrígelo con ese hecho.",
    "   Cuando el agente te resume lo que entendió o te propone un plan, compáralo con cada uno de tus hechos antes de aprobar: si algo contradice un hecho, corrígelo en answer escribiendo su contenido.",
    "   - stopped o finished: pide que continúe hasta dejar el cambio terminado del todo.",
    "   - blocked: pide que intente resolverlo y continúe, sin darle soluciones técnicas.",
    "3. Nunca cuentes un hecho por el que no te han preguntado, salvo para corregir algo que lo contradice. No inventes requisitos ni des instrucciones técnicas.",
    "4. facts_disclosed: solo los hechos cuyo contenido has escrito en answer, por su identificador (F1, F2...). Un hecho que no aparece escrito en answer no se lista, aunque lo hayas tenido en cuenta.",
    "5. deviates_from_recommendation: true si el agente recomendaba una opción y tu respuesta elige otra o la corrige; false en cualquier otro caso.",
  ].join("\n");
}

function buildPersonaPrompt(agentMessage) {
  const text = String(agentMessage || "").trim() || "(el agente terminó su turno sin escribir nada)";
  const shown = text.length > MESSAGE_HEAD + MESSAGE_TAIL
    ? `${text.slice(0, MESSAGE_HEAD)}\n[...]\n${text.slice(-MESSAGE_TAIL)}`
    : text;
  return `Último mensaje del agente:\n<<<\n${shown}\n>>>`;
}

function normalizePersonaReply(reply, scenario) {
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) throw new TypeError("persona reply must be an object");
  if (!PERSONA_KINDS.includes(reply.kind)) throw new TypeError(`persona reply kind must be one of ${PERSONA_KINDS.join(", ")}`);
  if (typeof reply.answer !== "string" || reply.answer.trim() === "") throw new TypeError("persona reply answer must be non-empty");
  if (!Array.isArray(reply.facts_disclosed) || typeof reply.deviates_from_recommendation !== "boolean") {
    throw new TypeError("persona reply must list facts_disclosed and say whether it deviates_from_recommendation");
  }
  const known = new Set(scenario.facts.map((fact) => fact.id));
  const disclosed = [...new Set(reply.facts_disclosed)];
  return {
    kind: reply.kind,
    answer: reply.answer.trim(),
    facts_disclosed: disclosed.filter((id) => known.has(id)),
    deviates_from_recommendation: reply.deviates_from_recommendation,
    unknown_facts: disclosed.filter((id) => !known.has(id)),
  };
}

module.exports = {
  PERSONA_KINDS,
  PERSONA_SCHEMA,
  buildPersonaPrompt,
  buildPersonaSystemPrompt,
  normalizePersonaReply,
};
