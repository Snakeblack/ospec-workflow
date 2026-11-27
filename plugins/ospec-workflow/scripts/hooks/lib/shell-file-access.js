"use strict";

// A bounded operand recognizer, not a shell interpreter. Quotes keep
// separators inside data inert; variable expansion is not resolved and heredoc
// bodies are data. Mirrored in internal/hooks/shellfileaccess.go.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { classifySensitiveFile, underSshDirectory } = require('./secret-scan.js');

// Commands that print the content of their file operands.
const READERS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'type', 'get-content', 'gc', 'grep', 'sed', 'awk', 'base64', 'xxd', 'od', 'tar', 'scp', 'cp',
  'sort', 'nl', 'tac', 'rev', 'cut', 'rg', 'uniq', 'strings', 'hexdump', 'diff', 'jq', 'yq', 'bat',
]);
// Their first operand is a pattern, a program or a filter, not a file, unless
// an option already gave it (`-e pattern`, `-f file`, `--regexp=pattern`).
const PATTERN_FIRST = new Set(['grep', 'rg', 'sed', 'awk', 'jq', 'yq']);
const PATTERN_OPTION = /^(?:-[A-Za-z]*[ef]|-[ef].+|--(?:regexp|file|expression|from-file)(?:=.*)?)$/;
const PATTERN_OPTION_ALONE = /^(?:-[A-Za-z]*[ef]|--(?:regexp|file|expression|from-file))$/;
// jq and yq take their filter from a file with `-f`; their `-e` sets the exit
// status and has no value.
const FILTER_FIRST = new Set(['jq', 'yq']);
const FILTER_OPTION = /^(?:-[A-Za-z]*f|--from-file(?:=.*)?)$/;
const FILTER_OPTION_ALONE = /^(?:-[A-Za-z]*f|--from-file)$/;
const COUNT_OPTIONS = new Set(['-n', '-c', '--lines', '--bytes']);
const CONTENT_OPTIONS = new Set(['-encoding', '-totalcount', '-tail', '-readcount']);
// ssh reads the identity and options itself: their values never leave the host.
const SCP_OPTIONS = new Set(['-i', '-o']);
const VALUE_OPTIONS = new Map([['head', COUNT_OPTIONS], ['tail', COUNT_OPTIONS], ['get-content', CONTENT_OPTIONS], ['gc', CONTENT_OPTIONS], ['scp', SCP_OPTIONS]]);
// Commands that use a file a name denies without printing it.
const NAME_ONLY = new Set(['ssh', 'sftp', 'ssh-add', 'ssh-keygen', 'chmod', 'chown', 'ls', 'stat', 'test', '[', 'rm', 'touch', 'echo', 'printf', 'find', 'ssh-copy-id', 'ansible', 'ansible-playbook', 'mkdir', 'rmdir', 'cd']);
// The command is the next word that is not an option or the value of one.
const WRAPPERS = new Set(['sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'time', 'nice', 'timeout', 'if', 'then', 'else', 'elif', 'while', 'until', 'do', '!']);
const USER_OPTIONS = new Set([
  '-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-U', '-T', '-R', '-a',
  '--user', '--group', '--chdir', '--host', '--prompt', '--role', '--type', '--other-user', '--close-from', '--command-timeout', '--chroot', '--auth-type',
]);
const WRAPPER_VALUE_OPTIONS = new Map([
  ['sudo', USER_OPTIONS], ['doas', USER_OPTIONS], ['nice', new Set(['-n', '--adjustment'])],
  ['env', new Set(['-u', '-C', '--unset', '--chdir'])], ['exec', new Set(['-a'])], ['time', new Set(['-o', '-f', '--output', '--format'])],
  ['timeout', new Set(['-s', '-k', '--signal', '--kill-after'])],
]);
// The operands a wrapper takes before its command: the duration of timeout.
const WRAPPER_OPERANDS = new Map([['timeout', 1]]);
// `env -S <string>` splits its value into the command and its arguments.
const SPLIT_STRING = /^(?:-S|--split-string=?)(.*)$/s;
// `sh -c <command>` runs another command line; an interpreter runs code.
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const SHELL_CODE_OPTION = /^-[A-Za-z]*c$/;
const INTERPRETER = /^(?:python[0-9.]*|node|nodejs|deno|bun|ruby|perl|php)$/;
// `-c`, `-e`, `-p`, `-r` and their clusters (`-pe`, `-lane`).
const CODE_OPTION = /^(?:--eval|--print|-[A-Za-z]*[ceEpr])$/;
const CODE_SPLIT = /[^A-Za-z0-9_.~/\\$*?-]+/;
const CODE_STRING = /'[^']*'|"[^"]*"|`[^`]*`/g;
// The private keys OpenSSH names by default.
const KEY_NAMES = new Set(['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'id_ecdsa_sk', 'id_ed25519_sk', 'id_xmss']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const MAX_NESTING = 2;

// The words and operators of a command line, quotes removed. A word with an
// expansion is not literal, and heredoc bodies are skipped as data. With
// `emptyWords`, a quoted empty word (`grep '' file`) is a word too.
function shellTokens(command, { emptyWords = false } = {}) {
  const tokens = [];
  let word = '', quote = '', literal = true, heredoc = '', stripTabs = false, ansi = false, quoted = false;
  const flush = () => {
    if (word || (emptyWords && quoted)) {
      const last = tokens.length - 1;
      if (tokens[last]?.operator && ['<<', '<<-'].includes(tokens[last].value)) {
        heredoc = word; stripTabs = tokens[last].value === '<<-';
      }
      tokens.push({ value: word, literal });
    }
    word = ''; literal = true; quoted = false;
  };
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    // $'…' (ANSI-C quoting): a backslash escapes the next character, so \' does
    // not close it; other escapes stay as written.
    if (ansi) {
      if (ch === '\\' && i + 1 < command.length) { const next = command[++i]; word += next === "'" ? "'" : `\\${next}`; }
      else if (ch === "'") { ansi = false; quoted = true; }
      else word += ch;
      continue;
    }
    if (!quote && ch === '$' && command[i + 1] === "'") { ansi = true; literal = false; i += 1; continue; }
    if (ch === quote) { quote = ''; quoted = true; continue; }
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
    // A backslash before a line break continues the line: both go.
    if (quote !== "'" && ch === '\\' && (command[i + 1] === '\n' || (command[i + 1] === '\r' && command[i + 2] === '\n'))) {
      i += command[i + 1] === '\r' ? 2 : 1; continue;
    }
    if (quote !== "'" && (ch === '`' || (ch === '\\' && /[ \t\r\n"';&|<>\\`]/.test(command[i + 1] || '')))) {
      word += command[++i] || ''; continue;
    }
    if (!quote && /[ \t\r\n;&|<>]/.test(ch)) {
      flush();
      if (!/[ \t\r\n]/.test(ch) || ch === '\n') tokens.push({ value: ch, operator: true });
      // Heredoc bodies are data, not command segments. Skip until the literal
      // delimiter, without parsing quotes or apparent readers inside the body.
      // Without that delimiter (`$((1<<2))` is no heredoc) nothing is skipped.
      if (ch === '\n' && heredoc) {
        let offset = i + 1;
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
  if (!quote && !ansi) flush();
  return tokens;
}

// Grouping characters around a word: `(cat`, `id_rsa)`.
function ungroup(word) {
  return word.replace(/^[({`]+|[)}`;]+$/g, '');
}

// A word without the parentheses of a subshell around it: `(cat`, `.npmrc)`.
function unparenthesized(word) {
  return word.replace(/^\(+|\)+$/g, '');
}

// The parentheses a word opens minus the ones it closes.
function openParentheses(word) {
  return word.split('(').length - word.split(')').length;
}

function commandName(word) {
  return ungroup(word).split(/[\\/]/).pop().toLowerCase();
}

// Walks the simple commands of a command line. `visit.command(name, token)`
// names each one, `visit.word(name, token)` receives its other words and
// `visit.input(token)` the target of a `<` redirection.
function walkCommands(command, visit) {
  let name = '', skip = false, inputRead = false, wrapper = '', wrapperValue = false, operands = 0, split = false, group = 0;
  const tokens = shellTokens(command, { emptyWords: true });
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    // The body of a process substitution (`<(cat a | sort)`) is walked as a
    // command substitution: here its words are not operands.
    if (group > 0) {
      if (!token.operator) group = Math.max(0, group + openParentheses(token.value));
      continue;
    }
    if (token.operator) {
      if (';&|\n'.includes(token.value)) { name = ''; wrapper = ''; wrapperValue = false; operands = 0; split = false; }
      skip = token.value === '>' || token.value.startsWith('<');
      inputRead = token.value === '<';
      continue;
    }
    if (skip) {
      if (token.value.startsWith('(')) group = Math.max(0, openParentheses(token.value));
      else if (inputRead) visit.input(token);
      skip = false; inputRead = false; continue;
    }
    if (name) { visit.word(name, token); continue; }
    if (wrapperValue) { wrapperValue = false; continue; }
    const splitString = wrapper === 'env' ? (split ? ['', token.value] : SPLIT_STRING.exec(token.value)) : null;
    if (splitString) {
      split = splitString[1] === '';
      if (!split) tokens.splice(index + 1, 0, ...shellTokens(splitString[1], { emptyWords: true }));
      continue;
    }
    if (token.value.startsWith('-')) { wrapperValue = WRAPPER_VALUE_OPTIONS.get(wrapper)?.has(token.value) === true; continue; }
    if (token.value === '') continue;
    if (operands > 0) { operands -= 1; continue; }
    if (ASSIGNMENT.test(token.value)) { visit.assignment?.(token); continue; }
    const candidate = commandName(token.value);
    if (WRAPPERS.has(candidate)) { wrapper = candidate; operands = WRAPPER_OPERANDS.get(candidate) || 0; continue; }
    // A grouping word alone (`(`, `{`) names no command: the next word does.
    if (candidate === '') continue;
    name = candidate;
    visit.command(name, token);
  }
}

// If a command substitution starts at `index`, adds its body and returns the
// index of its last character; otherwise returns `index`.
function substitutionAt(text, index, bodies, process = false) {
  if (text[index] === '`') {
    const end = text.indexOf('`', index + 1);
    if (end < 0) return text.length;
    bodies.push(text.slice(index + 1, end));
    return end;
  }
  if ((text[index] === '$' || (process && '<>'.includes(text[index]))) && text[index + 1] === '(' && text[index + 2] !== '(') {
    let depth = 1, end = index + 2;
    while (end < text.length && depth > 0) {
      if (text[end] === '(') depth += 1;
      else if (text[end] === ')') depth -= 1;
      end += 1;
    }
    bodies.push(text.slice(index + 2, depth === 0 ? end - 1 : end));
    return end - 1;
  }
  return index;
}

// The body of a heredoc that starts at `start`, up to the line that is its
// delimiter; null without that line.
function heredocBody(command, start, { word, stripTabs }) {
  let offset = start;
  while (offset <= command.length) {
    const newline = command.indexOf('\n', offset);
    const end = newline < 0 ? command.length : newline;
    const line = command.slice(offset, end).replace(/\r$/, '');
    if ((stripTabs ? line.replace(/^\t+/, '') : line) === word) return { text: command.slice(start, offset), end };
    if (newline < 0) return null;
    offset = end + 1;
  }
  return null;
}

const HEREDOC_START = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|(\\?)([^ \t\n;&|<>()'"]+))/;

// The command lines a command substitution runs: the bodies of `$(…)` and of
// backticks. It follows the quoting of shellTokens: nothing runs inside single
// quotes, `$'…'`, a comment or the body of a heredoc with a quoted delimiter;
// in the body of any other heredoc quotes are text and substitutions run.
// `$((…))` is arithmetic.
function shellSubstitutions(command) {
  const bodies = [];
  let quote = '', heredoc = null, wordStart = true;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote === "'") { if (ch === "'") quote = ''; continue; }
    if (quote === "$'") { if (ch === '\\') i += 1; else if (ch === "'") quote = ''; continue; }
    if (ch === '\\') { i += 1; wordStart = false; continue; }
    if (!quote) {
      if (ch === '#' && wordStart) {
        while (i + 1 < command.length && command[i + 1] !== '\n') i += 1;
        continue;
      }
      if (ch === "'") { quote = "'"; wordStart = false; continue; }
      if (ch === '$' && command[i + 1] === "'") { quote = "$'"; i += 1; wordStart = false; continue; }
      if (ch === '<' && command[i + 1] === '<') {
        const found = command[i + 2] === '<' ? null : HEREDOC_START.exec(command.slice(i));
        if (found) heredoc = { word: found[2] ?? found[3] ?? found[5], quoted: found[5] === undefined || found[4] !== '', stripTabs: found[1] === '-' };
        i += found ? found[0].length - 1 : 2;
        wordStart = false;
        continue;
      }
      if (ch === '\n' && heredoc) {
        const body = heredocBody(command, i + 1, heredoc);
        if (body) {
          if (!heredoc.quoted) {
            for (let at = 0; at < body.text.length; at += 1) {
              if (body.text[at] === '\\') at += 1;
              else at = substitutionAt(body.text, at, bodies);
            }
          }
          i = body.end;
        }
        heredoc = null; wordStart = true;
        continue;
      }
    }
    if (ch === '"') { quote = quote ? '' : '"'; wordStart = false; continue; }
    const end = substitutionAt(command, i, bodies, !quote);
    if (end !== i) { i = end; wordStart = false; continue; }
    wordStart = !quote && /[ \t\r\n;&|(]/.test(ch);
  }
  return bodies;
}

// The files a command line reads: the operands of the READERS and the targets
// of `<`. Only literal words count, unless `expansions` asks for more: the
// words with an expansion or a glob (their name still classifies the file)
// and the command lines of a command substitution.
function extractShellReadPaths(command, { expansions = false, depth = 0 } = {}) {
  const paths = [];
  let reader = false, skipValue = false, codeNext = false, pattern = false;
  walkCommands(command, {
    input(token) { if (token.literal || expansions) paths.push(token.value); },
    command(name, token) { reader = READERS.has(name) && (token.literal || !/[$*?]/.test(token.value)); skipValue = false; codeNext = false; pattern = PATTERN_FIRST.has(name); },
    word(name, token) {
      if (SHELLS.has(name)) {
        if (codeNext && depth < MAX_NESTING) paths.push(...extractShellReadPaths(token.value, { expansions, depth: depth + 1 }));
        codeNext = !codeNext && SHELL_CODE_OPTION.test(token.value);
        return;
      }
      if (!reader) return;
      if (skipValue) { skipValue = false; return; }
      if (VALUE_OPTIONS.get(name)?.has(token.value.toLowerCase())) { skipValue = true; return; }
      if (PATTERN_FIRST.has(name) && (FILTER_FIRST.has(name) ? FILTER_OPTION : PATTERN_OPTION).test(token.value)) {
        pattern = false; skipValue = (FILTER_FIRST.has(name) ? FILTER_OPTION_ALONE : PATTERN_OPTION_ALONE).test(token.value); return;
      }
      if (token.value.startsWith('-')) return;
      if (pattern) { pattern = false; return; }
      const operand = token.literal ? token.value : unparenthesized(token.value);
      if (operand !== '' && (token.literal || expansions)) paths.push(operand);
    },
  });
  if (expansions && depth < MAX_NESTING) {
    for (const body of shellSubstitutions(command)) paths.push(...extractShellReadPaths(body, { expansions, depth: depth + 1 }));
  }
  return paths;
}

// The file names an interpreter with inline code may open: the string
// literals of the code (`open('id_rsa')`), cut into path-shaped pieces, and
// the operands after it (`perl -pe 1 .env`). An identifier of the code is not
// a file name. Nested shells and command substitutions are walked too.
function extractShellCodeFiles(command, depth = 0) {
  const files = [];
  let codeNext = false, code = false;
  walkCommands(command, {
    input() {},
    command() { codeNext = false; code = false; },
    word(name, token) {
      if (SHELLS.has(name)) {
        if (codeNext && depth < MAX_NESTING) files.push(...extractShellCodeFiles(token.value, depth + 1));
        codeNext = !codeNext && SHELL_CODE_OPTION.test(token.value);
        return;
      }
      if (!INTERPRETER.test(name)) return;
      if (codeNext) {
        codeNext = false; code = true;
        for (const literal of token.value.match(CODE_STRING) || []) files.push(...literal.slice(1, -1).split(CODE_SPLIT).filter(Boolean));
      } else if (CODE_OPTION.test(token.value)) codeNext = true;
      else if (code && token.value !== '' && !token.value.startsWith('-') && !/[ \t\r\n]/.test(token.value)) files.push(token.literal ? token.value : unparenthesized(token.value));
    },
  });
  if (depth < MAX_NESTING) {
    for (const body of shellSubstitutions(command)) files.push(...extractShellCodeFiles(body, depth + 1));
  }
  return files;
}

// The words of a command line that may name a file, whatever the command:
// every word without blanks, and what follows its `=`. NAME_ONLY commands are
// left out, and a nested shell or a command substitution is walked as another
// command line. A quoted text with blanks is not an operand: a message or a
// nested ssh command names no file the command reads.
function extractShellNamedFiles(command, depth = 0) {
  const files = [];
  const add = (word) => {
    if (word === '' || /[ \t\r\n]/.test(word)) return;
    files.push(ungroup(word));
    const equals = word.indexOf('=');
    if (equals > 0) files.push(ungroup(word.slice(equals + 1)));
  };
  let skipValue = false, codeNext = false;
  walkCommands(command, {
    input(token) { add(token.value); },
    assignment(token) { add(token.value); },
    command(name, token) { skipValue = false; codeNext = false; if (!NAME_ONLY.has(name)) add(token.value); },
    word(name, token) {
      if (NAME_ONLY.has(name)) return;
      if (skipValue) { skipValue = false; return; }
      if (SHELLS.has(name)) {
        if (codeNext && depth < MAX_NESTING) files.push(...extractShellNamedFiles(token.value, depth + 1));
        else if (!codeNext) add(token.value);
        codeNext = !codeNext && SHELL_CODE_OPTION.test(token.value);
        return;
      }
      if (name === 'scp' && SCP_OPTIONS.has(token.value.toLowerCase())) { skipValue = true; return; }
      add(token.value);
    },
  });
  if (depth < MAX_NESTING) {
    for (const body of shellSubstitutions(command)) files.push(...extractShellNamedFiles(body, depth + 1));
  }
  return files;
}

function baseName(file) {
  return file.split(/[\\/]/).pop().toLowerCase();
}

// The classification of a string of inline code that may not be a file: a
// dictionary key, a property name. A name that only looks like a private key
// (`id_token`, `ssl.key`) counts when it is one of the OpenSSH names, has an
// `id_` prefix and a `.key` or `.pem` extension, lives under a `.ssh`
// directory or exists on disk; a bare `credentials`, when it exists.
function classifyNamedFile(file, exists = () => false) {
  const found = classifySensitiveFile(file);
  if (!found) return null;
  const base = baseName(file);
  if (found.kind === 'private-key') {
    const sure = KEY_NAMES.has(base) || (base.startsWith('id_') && /\.(?:key|pem)$/.test(base)) || underSshDirectory(file);
    return sure || exists(file) ? found : null;
  }
  if (base === 'credentials' && !/[\\/]/.test(file)) return exists(file) ? found : null;
  return found;
}

// True when a word of any command names an SSH private key: a file under a
// `.ssh` directory that the classifier denies (any name but the public ones,
// a glob or an expansion included), an OpenSSH name with a directory, or an
// `id_` name that exists on disk. A bare word is not enough (`gh search code
// id_rsa`), and neither is a `.key` extension: `--key=tls.key`, `{.data.key}`
// and `slides.key` are ordinary arguments, and curl or openssl use a key
// without printing it.
function namesSshKey(file, exists = () => false) {
  if (classifySensitiveFile(file)?.kind !== 'private-key') return false;
  const base = baseName(file);
  if (underSshDirectory(file)) return true;
  if (!base.startsWith('id_')) return false;
  return (KEY_NAMES.has(base) && /[\\/]/.test(file)) || exists(file);
}

// The files a command line reads, for the read guards: the operands of the
// readers and the files its inline code names.
function shellReadFiles(command, exists) {
  return [
    ...extractShellReadPaths(command, { expansions: true }),
    ...extractShellCodeFiles(command).filter((file) => classifyNamedFile(file, exists) !== null),
  ];
}

const CHDIR_COMMANDS = new Set(['cd', 'pushd', 'popd']);
const CHDIR_OPTION = /(?:^|\s)--chdir(?:[\s=]|$)|\benv\b[^\n;&|]*\s-C|\bsudo\b[^\n;&|]*\s-D/;

// True when a command line changes directory: `cd`, `pushd` or `popd` as a
// command (behind a wrapper or a keyword, in a nested shell or a
// substitution), or the chdir option of a wrapper.
function changesDirectory(command, depth = 0) {
  let found = CHDIR_OPTION.test(command), codeNext = false;
  walkCommands(command, {
    input() {},
    command(name) { codeNext = false; found = found || CHDIR_COMMANDS.has(name); },
    word(name, token) {
      if (!SHELLS.has(name)) return;
      if (codeNext && depth < MAX_NESTING) found = found || changesDirectory(token.value, depth + 1);
      codeNext = !codeNext && SHELL_CODE_OPTION.test(token.value);
    },
  });
  return found || (depth < MAX_NESTING && shellSubstitutions(command).some((body) => changesDirectory(body, depth + 1)));
}

// True when the command line names a file the classifier denies by name: a
// file it reads (an operand of a reader, a `<` target, a string of inline
// code), or an SSH private key named by a word of any other command. A
// directory a reader walks is not a key file, whatever its name; after a
// change of directory the disk of the workspace says nothing about an operand.
function namesDeniedFile(command, exists, isDirectory = () => false) {
  const moved = changesDirectory(command);
  const directory = (file) => !moved && isDirectory(file);
  return shellReadFiles(command, exists).some((file) => classifySensitiveFile(file, { directory: directory(file) })?.action === 'deny')
    || extractShellNamedFiles(command).some((file) => namesSshKey(file, exists));
}

// A path with its leading tilde replaced by the home directory.
function expandHome(file) {
  return file.replace(/^~(?=$|[\\/])/, os.homedir());
}

// Whether a word of a command line exists as a file of the workspace.
function fileExistsIn(workspace) {
  return (file) => {
    try {
      return fs.statSync(path.resolve(workspace, expandHome(file))).isFile();
    } catch {
      return false;
    }
  };
}

// Whether a word of a command line exists as a directory of the workspace.
function directoryExistsIn(workspace) {
  return (file) => {
    try {
      return fs.statSync(path.resolve(workspace, expandHome(file))).isDirectory();
    } catch {
      return false;
    }
  };
}

module.exports = {
  classifyNamedFile,
  directoryExistsIn,
  expandHome,
  namesSshKey,
  extractShellCodeFiles,
  extractShellNamedFiles,
  extractShellReadPaths,
  fileExistsIn,
  namesDeniedFile,
  shellReadFiles,
  shellSubstitutions,
  shellTokens,
};
