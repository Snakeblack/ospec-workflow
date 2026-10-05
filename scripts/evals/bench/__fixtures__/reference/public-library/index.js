"use strict";

const DAY = 86400000;
const UNITS = Object.freeze({ h: 3600000, m: 60000, s: 1000, ms: 1 });
const PARSE_UNITS = Object.freeze({ d: DAY, ...UNITS });
const PATTERN = /(\d+)(ms|d|h|m|s)/g;

function parse(text) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new TypeError("parse expects a duration such as '1h30m'");
  }
  const compact = text.replace(/\s+/g, "");
  let total = 0;
  let consumed = "";
  for (const match of compact.matchAll(PATTERN)) {
    total += Number(match[1]) * PARSE_UNITS[match[2]];
    consumed += match[0];
  }
  if (consumed !== compact) throw new SyntaxError(`invalid duration: ${text}`);
  return total;
}

function format(ms, { days = false } = {}) {
  if (!Number.isInteger(ms) || ms < 0) throw new TypeError("format expects a non-negative integer of milliseconds");
  if (ms === 0) return "0s";
  const units = days ? PARSE_UNITS : UNITS;
  const parts = [];
  let rest = ms;
  for (const [unit, size] of Object.entries(units)) {
    const amount = Math.floor(rest / size);
    if (amount > 0) {
      parts.push(`${amount}${unit}`);
      rest -= amount * size;
    }
  }
  return parts.join(" ");
}

module.exports = { parse, format };
