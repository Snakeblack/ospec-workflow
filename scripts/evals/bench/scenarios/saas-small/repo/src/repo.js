"use strict";

class NotesRepo {
  constructor() {
    this.notes = new Map();
    this.sequence = 0;
  }

  create({ tenantId, ownerId, title, body }) {
    this.sequence += 1;
    const note = { id: `n${this.sequence}`, tenantId, ownerId, title, body };
    this.notes.set(note.id, note);
    return { ...note };
  }

  get(id) {
    const note = this.notes.get(id);
    return note ? { ...note } : null;
  }

  list(predicate) {
    return [...this.notes.values()].filter(predicate).map((note) => ({ ...note }));
  }

  update(id, patch) {
    const note = this.notes.get(id);
    if (!note) return null;
    Object.assign(note, patch);
    return { ...note };
  }

  remove(id) {
    return this.notes.delete(id);
  }
}

module.exports = { NotesRepo };
