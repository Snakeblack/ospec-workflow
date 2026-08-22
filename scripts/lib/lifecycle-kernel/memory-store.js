"use strict";
const { mergeJournalEntries } = require("./journal.js");

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
      journal = mergeJournalEntries(journal, JSON.parse(JSON.stringify(nextJournal)));
      return { journal: JSON.parse(JSON.stringify(journal)) };
    },
    async commit({ state: nextState, journal: nextJournal }) {
      state = JSON.parse(JSON.stringify(nextState));
      if (nextJournal !== undefined) {
        journal = mergeJournalEntries(journal, JSON.parse(JSON.stringify(nextJournal)));
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
