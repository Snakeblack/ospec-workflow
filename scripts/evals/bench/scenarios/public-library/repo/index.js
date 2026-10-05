"use strict";

const UNITS = Object.freeze({ h: 3600000, m: 60000, s: 1000, ms: 1 });
const PATTERN = /(\d+)(ms|h|m|s)/g;

/**
 * Parses a compact duration such as "1h30m" or "2m 5s" into milliseconds.
 * @param {string} text
 * @returns {number}
 */
function parse(text) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new TypeError("parse expects a duration such as '1h30m'");
  }
  const compact = text.replace(/\s+/g, "");
  let total = 0;
  let consumed = "";
  for (const match of compact.matchAll(PATTERN)) {
    total += Number(match[1]) * UNITS[match[2]];
    consumed += match[0];
  }
  if (consumed !== compact) throw new SyntaxError(`invalid duration: ${text}`);
  return total;
}

/**
 * Formats milliseconds as "1h 30m".
 * @param {number} ms
 * @returns {string}
 */
function format(ms) {
  if (!Number.isInteger(ms) || ms < 0) throw new TypeError("format expects a non-negative integer of milliseconds");
  if (ms === 0) return "0s";
  const parts = [];
  let rest = ms;
  for (const [unit, size] of Object.entries(UNITS)) {
    const amount = Math.floor(rest / size);
    if (amount > 0) {
      parts.push(`${amount}${unit}`);
      rest -= amount * size;
    }
  }
  return parts.join(" ");
}

module.exports = { parse, format };
