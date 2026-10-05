"use strict";

const { NotesRepo } = require("./repo.js");
const { findUser } = require("./users.js");

function createApp({ repo = new NotesRepo() } = {}) {
  function sameTenant(note, user) {
    return note && note.tenantId === user.tenantId;
  }
  const sharedWith = (note) => note.sharedWith || [];

  function handle({ method, path, user, body = {} }) {
    if (!user) return { status: 401, body: { error: "unauthenticated" } };

    if (path === "/notes" && method === "GET") {
      const notes = repo.list((note) => note.tenantId === user.tenantId
        && (note.ownerId === user.id || sharedWith(note).includes(user.id)));
      return { status: 200, body: notes };
    }

    if (path === "/notes" && method === "POST") {
      if (!body.title) return { status: 400, body: { error: "title-required" } };
      const note = repo.create({ tenantId: user.tenantId, ownerId: user.id, title: body.title, body: body.body || "" });
      return { status: 201, body: note };
    }

    const share = /^\/notes\/([^/]+)\/share$/.exec(path);
    if (share && method === "POST") {
      const note = repo.get(share[1]);
      if (!sameTenant(note, user)) return { status: 404, body: { error: "not-found" } };
      if (note.ownerId !== user.id) return { status: 403, body: { error: "forbidden" } };
      const target = findUser(body.userId);
      if (!target || target.tenantId !== user.tenantId) return { status: 404, body: { error: "user-not-found" } };
      const list = sharedWith(note).includes(target.id) ? sharedWith(note) : [...sharedWith(note), target.id];
      return { status: 200, body: repo.update(note.id, { sharedWith: list }) };
    }

    const match = /^\/notes\/([^/]+)$/.exec(path);
    if (match) {
      const note = repo.get(match[1]);
      if (!sameTenant(note, user)) return { status: 404, body: { error: "not-found" } };
      const owner = note.ownerId === user.id;
      if (method === "GET" && (owner || sharedWith(note).includes(user.id))) return { status: 200, body: note };
      if (!owner) return { status: 403, body: { error: "forbidden" } };
      if (method === "PUT") return { status: 200, body: repo.update(note.id, { title: body.title ?? note.title, body: body.body ?? note.body }) };
      if (method === "DELETE") {
        repo.remove(note.id);
        return { status: 204, body: null };
      }
    }

    return { status: 404, body: { error: "not-found" } };
  }

  return { handle };
}

module.exports = { createApp };
