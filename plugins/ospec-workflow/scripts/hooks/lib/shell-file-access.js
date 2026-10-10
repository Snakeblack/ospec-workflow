"use strict";

// A bounded literal-operand recognizer, not a shell interpreter. Quotes keep
// separators inside data inert; variable expansion and nested interpreters are
// deliberately unsupported. Mirrored in internal/hooks/shellfileaccess.go.
const READERS = new Set(['cat', 'head', 'tail', 'less', 'more', 'type', 'get-content', 'gc']);
const COUNT_OPTIONS = new Set(['-n', '-c', '--lines', '--bytes']);
const CONTENT_OPTIONS = new Set(['-encoding', '-totalcount', '-tail', '-readcount']);
const VALUE_OPTIONS = new Map([['head', COUNT_OPTIONS], ['tail', COUNT_OPTIONS], ['get-content', CONTENT_OPTIONS], ['gc', CONTENT_OPTIONS]]);

function extractShellReadPaths(command) {
  const tokens = [];
  let word = '', quote = '', literal = true, heredoc = '', stripTabs = false;
  const flush = () => {
    if (word) {
      const last = tokens.length - 1;
      if (tokens[last]?.operator && ['<<', '<<-'].includes(tokens[last].value)) {
        heredoc = word; stripTabs = tokens[last].value === '<<-';
      }
      tokens.push({ value: word, literal });
    }
    word = ''; literal = true;
  };
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (ch === quote) { quote = ''; continue; }
    if (!quote && (ch === '"' || ch === "'")) { quote = ch; continue; }
    if (!quote && ch === '<' && command[i + 1] === '<') {
      flush(); i += 1;
      let value = '<<';
      if (command[i + 1] === '-' || command[i + 1] === '<') value += command[++i];
      tokens.push({ value, operator: true }); continue;
    }
    if (!quote && ch === '#' && !word) {
      while (i + 1 < command.length && command[i + 1] !== '\n') i += 1;
      continue;
    }
    if (quote !== "'" && (ch === '`' || (ch === '\\' && /[ \t\r\n"';&|<>\\]/.test(command[i + 1] || '')))) {
      word += command[++i] || ''; continue;
    }
    if (!quote && /[ \t\r\n;&|<>]/.test(ch)) {
      flush();
      if (!/[ \t\r\n]/.test(ch) || ch === '\n') tokens.push({ value: ch, operator: true });
      // Heredoc bodies are data, not command segments. Skip until the literal
      // delimiter, without parsing quotes or apparent readers inside the body.
      if (ch === '\n' && heredoc) {
        let offset = i + 1;
        i = command.length;
        while (offset < command.length) {
          const newline = command.indexOf('\n', offset);
          const end = newline < 0 ? command.length : newline;
          const line = command.slice(offset, end).replace(/\r$/, '');
          if ((stripTabs ? line.replace(/^\t+/, '') : line) === heredoc) { i = end; break; }
          offset = end + 1;
        }
        heredoc = '';
      }
      continue;
    }
    if (quote !== "'" && /[$*?()]/.test(ch)) literal = false;
    word += ch;
  }
  if (!quote) flush();
  const paths = [];
  let first = true, reader = false, readerName = '', skip = false, inputRead = false;
  for (const token of tokens) {
    if (token.operator) {
      if (';&|\n'.includes(token.value)) { first = true; reader = false; }
      skip = token.value === '>' || token.value.startsWith('<');
      inputRead = token.value === '<';
      continue;
    }
    if (skip) {
      if (inputRead && token.literal) paths.push(token.value);
      skip = false; inputRead = false; continue;
    }
    if (first) {
      readerName = token.value.split(/[\\/]/).pop().toLowerCase();
      reader = token.literal && READERS.has(readerName);
      first = false;
    } else if (reader) {
      if (VALUE_OPTIONS.get(readerName)?.has(token.value.toLowerCase())) skip = true;
      else if (token.literal && !token.value.startsWith('-')) paths.push(token.value);
    }
  }
  return paths;
}

module.exports = { extractShellReadPaths };
