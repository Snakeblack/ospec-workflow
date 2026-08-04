"use strict";

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
      journal = JSON.parse(JSON.stringify(nextJournal));
      return { journal };
    },
    async commit({ state: nextState, journal: nextJournal }) {
      state = JSON.parse(JSON.stringify(nextState));
      journal = JSON.parse(JSON.stringify(nextJournal));
      return { state, journal };
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
