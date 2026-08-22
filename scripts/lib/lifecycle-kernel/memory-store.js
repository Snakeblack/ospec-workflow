"use strict";

function upsertJournalEntries(existing = [], incoming = []) {
  const map = new Map();
  const nonKeyed = [];

  for (const entry of (Array.isArray(existing) ? existing : [])) {
    if (!entry) continue;
    if (entry.effect_id) {
      map.set(entry.effect_id, entry);
    } else {
      nonKeyed.push(entry);
    }
  }
  for (const entry of (Array.isArray(incoming) ? incoming : [])) {
    if (!entry) continue;
    if (entry.effect_id) {
      map.set(entry.effect_id, entry);
    } else {
      nonKeyed.push(entry);
    }
  }
  const keyed = Array.from(map.values());
  keyed.sort((a, b) => (a.effect_id || "").localeCompare(b.effect_id || ""));
  return [...keyed, ...nonKeyed];
}

function createMemoryStore(initial = {}) {
  let state = initial.state
    ? JSON.parse(JSON.stringify(initial.state))
    : { schema_version: 1, status: "ready", nodes: {} };
  let journal = Array.isArray(initial.journal)
    ? JSON.parse(JSON.stringify(initial.journal))
    : [];

  return {
    async load() {
      return {
        state: JSON.parse(JSON.stringify(state)),
        journal: JSON.parse(JSON.stringify(journal)),
      };
    },
    async commitJournal(nextJournal) {
      journal = upsertJournalEntries(journal, JSON.parse(JSON.stringify(nextJournal)));
      return { journal: JSON.parse(JSON.stringify(journal)) };
    },
    async commit({ state: nextState, journal: nextJournal }) {
      state = JSON.parse(JSON.stringify(nextState));
      if (nextJournal !== undefined) {
        journal = upsertJournalEntries(journal, JSON.parse(JSON.stringify(nextJournal)));
      }
      return {
        state: JSON.parse(JSON.stringify(state)),
        journal: JSON.parse(JSON.stringify(journal)),
      };
    },
    snapshot() {
      return {
        state: JSON.parse(JSON.stringify(state)),
        journal: JSON.parse(JSON.stringify(journal)),
      };
    },
  };
}

module.exports = { createMemoryStore };
