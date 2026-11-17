package hooks

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// shellToken is a word (quotes removed) or an operator of a command line.
type shellToken struct {
	value             string
	literal, operator bool
}

// shellTokens returns the words and operators of a command line, mirroring
// shellTokens in shell-file-access.js. A word with an expansion is not
// literal, and heredoc bodies are skipped as data.
func shellTokens(command string) []shellToken {
	return shellTokensWith(command, false)
}

// shellTokensWith also returns, with emptyWords, a quoted empty word
// (`grep ” file`) as a word.
func shellTokensWith(command string, emptyWords bool) []shellToken {
	type token = shellToken
	var tokens []token
	var word []rune
	var quote rune
	heredoc := ""
	stripTabs := false
	literal := true
	ansi := false
	quoted := false
	flush := func() {
		if len(word) > 0 || (emptyWords && quoted) {
			last := len(tokens) - 1
			if last >= 0 && tokens[last].operator && (tokens[last].value == "<<" || tokens[last].value == "<<-") {
				heredoc = string(word)
				stripTabs = tokens[last].value == "<<-"
			}
			tokens = append(tokens, token{value: string(word), literal: literal})
		}
		word = nil
		literal = true
		quoted = false
	}
	chars := []rune(command)
	for i := 0; i < len(chars); i++ {
		ch := chars[i]
		// $'…' (ANSI-C quoting): a backslash escapes the next character, so \'
		// does not close it; other escapes stay as written.
		if ansi {
			if ch == '\\' && i+1 < len(chars) {
				i++
				if chars[i] != '\'' {
					word = append(word, '\\')
				}
				word = append(word, chars[i])
			} else if ch == '\'' {
				ansi = false
				quoted = true
			} else {
				word = append(word, ch)
			}
			continue
		}
		if quote == 0 && ch == '$' && i+1 < len(chars) && chars[i+1] == '\'' {
			ansi = true
			literal = false
			i++
			continue
		}
		if ch == quote {
			quote = 0
			quoted = true
			continue
		}
		if quote == 0 && (ch == '"' || ch == '\'') {
			quote = ch
			continue
		}
		if quote == 0 && ch == '<' && i+1 < len(chars) && chars[i+1] == '<' {
			flush()
			i++
			value := "<<"
			if i+1 < len(chars) && (chars[i+1] == '-' || chars[i+1] == '<') {
				i++
				value += string(chars[i])
			}
			tokens = append(tokens, token{value: value, operator: true})
			continue
		}
		if quote == 0 && ch == '#' && len(word) == 0 {
			for i+1 < len(chars) && chars[i+1] != '\n' {
				i++
			}
			continue
		}
		// A backslash before a line break continues the line: both go.
		if quote != '\'' && ch == '\\' && i+1 < len(chars) && (chars[i+1] == '\n' || (chars[i+1] == '\r' && i+2 < len(chars) && chars[i+2] == '\n')) {
			i++
			if chars[i] == '\r' {
				i++
			}
			continue
		}
		if quote != '\'' && (ch == '`' || (ch == '\\' && i+1 < len(chars) && strings.ContainsRune(" \t\r\n\"';&|<>\\`", chars[i+1]))) {
			i++
			if i < len(chars) {
				word = append(word, chars[i])
			}
			continue
		}
		if quote == 0 && strings.ContainsRune(" \t\r\n;&|<>", ch) {
			flush()
			if strings.ContainsRune(";&|<>\n", ch) {
				tokens = append(tokens, token{value: string(ch), operator: true})
			}
			// Without its delimiter (`$((1<<2))` is no heredoc) nothing is skipped.
			if ch == '\n' && heredoc != "" {
				offset := i + 1
				for offset < len(chars) {
					end := offset
					for end < len(chars) && chars[end] != '\n' {
						end++
					}
					line := strings.TrimSuffix(string(chars[offset:end]), "\r")
					if stripTabs {
						line = strings.TrimLeft(line, "\t")
					}
					if line == heredoc {
						i = end
						break
					}
					offset = end + 1
				}
				heredoc = ""
			}
			continue
		}
		if quote != '\'' && strings.ContainsRune("$*?()", ch) {
			literal = false
		}
		word = append(word, ch)
	}
	if quote == 0 && !ansi {
		flush()
	}
	return tokens
}

// The sets and expressions below mirror shell-file-access.js.
var (
	// Commands that print the content of their file operands.
	shellReaders = shellSet("cat", "head", "tail", "less", "more", "type", "get-content", "gc", "grep", "sed", "awk", "base64", "xxd", "od", "tar", "scp", "cp",
		"sort", "nl", "tac", "rev", "cut", "rg", "uniq", "strings", "hexdump", "diff", "jq", "yq", "bat")
	// Their first operand is a pattern, a program or a filter, not a file.
	shellPatternFirst = shellSet("grep", "rg", "sed", "awk", "jq", "yq")
	// An option that already gave the pattern (`-e pattern`, `-f file`,
	// `--regexp=pattern`); alone, its value is the next word.
	shellPatternOptionRe      = regexp.MustCompile(`^(?:-[A-Za-z]*[ef]|-[ef].+|--(?:regexp|file|expression|from-file)(?:=.*)?)$`)
	shellPatternOptionAloneRe = regexp.MustCompile(`^(?:-[A-Za-z]*[ef]|--(?:regexp|file|expression|from-file))$`)
	// jq and yq take their filter from a file with `-f`; their `-e` sets the
	// exit status and has no value.
	shellFilterFirst         = shellSet("jq", "yq")
	shellFilterOptionRe      = regexp.MustCompile(`^(?:-[A-Za-z]*f|--from-file(?:=.*)?)$`)
	shellFilterOptionAloneRe = regexp.MustCompile(`^(?:-[A-Za-z]*f|--from-file)$`)
	shellCountOptions        = shellSet("-n", "-c", "--lines", "--bytes")
	shellContentOptions      = shellSet("-encoding", "-totalcount", "-tail", "-readcount")
	// ssh reads the identity and options itself: their values never leave the host.
	shellScpOptions = shellSet("-i", "-o")
	// Commands that use a file a name denies without printing it.
	shellNameOnly = shellSet("ssh", "sftp", "ssh-add", "ssh-keygen", "chmod", "chown", "ls", "stat", "test", "[", "rm", "touch", "echo", "printf", "find", "ssh-copy-id", "ansible", "ansible-playbook")
	// The command is the next word that is not an option.
	shellWrappers = shellSet("sudo", "doas", "env", "command", "exec", "nohup", "time", "nice", "timeout", "if", "then", "else", "elif", "while", "until", "do", "!", "{")
	// The options of a wrapper whose value is the next word.
	shellUserOptions = shellSet("-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U", "-T", "-R", "-a",
		"--user", "--group", "--chdir", "--host", "--prompt", "--role", "--type", "--other-user", "--close-from", "--command-timeout", "--chroot", "--auth-type")
	shellWrapperValueOptions = map[string]map[string]bool{
		"sudo": shellUserOptions, "doas": shellUserOptions, "nice": shellSet("-n", "--adjustment"),
		"env": shellSet("-u", "-C", "--unset", "--chdir"), "exec": shellSet("-a"), "time": shellSet("-o", "-f", "--output", "--format"),
		"timeout": shellSet("-s", "-k", "--signal", "--kill-after"),
	}
	// The operands a wrapper takes before its command: the duration of timeout.
	shellWrapperOperands = map[string]int{"timeout": 1}
	// `env -S <string>` splits its value into the command and its arguments.
	shellSplitStringRe = regexp.MustCompile(`(?s)^(?:-S|--split-string=?)(.*)$`)
	// `sh -c <command>` runs another command line; an interpreter runs code.
	shellShells        = shellSet("sh", "bash", "zsh", "dash", "ksh")
	shellCodeOptionRe  = regexp.MustCompile(`^-[A-Za-z]*c$`)
	shellInterpreterRe = regexp.MustCompile(`^(?:python[0-9.]*|node|nodejs|deno|bun|ruby|perl|php)$`)
	// `-c`, `-e`, `-p`, `-r` and their clusters (`-pe`, `-lane`).
	shellInterpreterCodeRe = regexp.MustCompile(`^(?:--eval|--print|-[A-Za-z]*[ceEpr])$`)
	shellAssignmentRe      = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*=`)
	shellBlankRe           = regexp.MustCompile(`[ \t\r\n]`)
	shellCodeSplitRe       = regexp.MustCompile(`[^A-Za-z0-9_.~/\\$*?-]+`)
	shellCodeStringRe      = regexp.MustCompile("'[^']*'|\"[^\"]*\"|`[^`]*`")
	shellKeyExtRe          = regexp.MustCompile(`\.(?:key|pem)$`)
	shellSSHDirRe          = regexp.MustCompile(`(?:^|[\\/])\.ssh[\\/]`)
	shellGlobPartRe        = regexp.MustCompile(`(?s)\[[^\]]*\]|.`)
	// The private keys OpenSSH names by default.
	shellKeyNames = shellSet("id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "id_ecdsa_sk", "id_ed25519_sk", "id_xmss")
)

const shellMaxNesting = 2

func shellSet(values ...string) map[string]bool {
	set := make(map[string]bool, len(values))
	for _, value := range values {
		set[value] = true
	}
	return set
}

// ungroup removes the grouping characters around a word: `(cat`, `id_rsa)`.
func ungroup(word string) string {
	return strings.TrimRight(strings.TrimLeft(word, "({`"), ")}`;")
}

// unparenthesized returns a word without the parentheses of a subshell around
// it: `(cat`, `.npmrc)`.
func unparenthesized(word string) string {
	return strings.TrimRight(strings.TrimLeft(word, "("), ")")
}

// openParentheses counts the parentheses a word opens minus the ones it closes.
func openParentheses(word string) int {
	return strings.Count(word, "(") - strings.Count(word, ")")
}

// shellOperand is the file an operand names: without the parentheses of a
// subshell when the word is not literal.
func shellOperand(tok shellToken) string {
	if tok.literal {
		return tok.value
	}
	return unparenthesized(tok.value)
}

func shellCommandName(word string) string {
	word = ungroup(word)
	if index := strings.LastIndexAny(word, `/\`); index >= 0 {
		word = word[index+1:]
	}
	return strings.ToLower(word)
}

// shellVisitor receives the simple commands of a command line: command names
// each one, word its other words, input the target of a `<` redirection and
// assignment the `NAME=value` words before the command.
type shellVisitor struct {
	command    func(name string, tok shellToken)
	word       func(name string, tok shellToken)
	input      func(tok shellToken)
	assignment func(tok shellToken)
}

func walkShellCommands(command string, visit shellVisitor) {
	name, wrapper := "", ""
	skip, inputRead, wrapperValue, split := false, false, false, false
	operands, group := 0, 0
	tokens := shellTokensWith(command, true)
	for index := 0; index < len(tokens); index++ {
		tok := tokens[index]
		// The body of a process substitution (`<(cat a | sort)`) is walked as
		// a command substitution: here its words are not operands.
		if group > 0 {
			if !tok.operator {
				group = max(0, group+openParentheses(tok.value))
			}
			continue
		}
		if tok.operator {
			if strings.Contains(";&|\n", tok.value) {
				name, wrapper, wrapperValue, split = "", "", false, false
				operands = 0
			}
			skip = tok.value == ">" || strings.HasPrefix(tok.value, "<")
			inputRead = tok.value == "<"
			continue
		}
		if skip {
			if strings.HasPrefix(tok.value, "(") {
				group = max(0, openParentheses(tok.value))
			} else if inputRead {
				visit.input(tok)
			}
			skip, inputRead = false, false
			continue
		}
		if name != "" {
			visit.word(name, tok)
			continue
		}
		if wrapperValue {
			wrapperValue = false
			continue
		}
		if wrapper == "env" {
			value, found := tok.value, split
			if !found {
				if match := shellSplitStringRe.FindStringSubmatch(tok.value); match != nil {
					value, found = match[1], true
				}
			}
			if found {
				split = value == ""
				if !split {
					rest := append(shellTokensWith(value, true), tokens[index+1:]...)
					tokens = append(tokens[:index+1:index+1], rest...)
				}
				continue
			}
		}
		if strings.HasPrefix(tok.value, "-") {
			wrapperValue = shellWrapperValueOptions[wrapper][tok.value]
			continue
		}
		if tok.value == "" {
			continue
		}
		if operands > 0 {
			operands--
			continue
		}
		if shellAssignmentRe.MatchString(tok.value) {
			if visit.assignment != nil {
				visit.assignment(tok)
			}
			continue
		}
		candidate := shellCommandName(tok.value)
		if shellWrappers[candidate] {
			wrapper = candidate
			operands = shellWrapperOperands[candidate]
			continue
		}
		// A grouping word alone (`(`, `{`) names no command: the next word does.
		if candidate == "" {
			continue
		}
		name = candidate
		visit.command(name, tok)
	}
}

// substitutionAt adds the body of the command substitution that starts at
// index, if any, and returns the index of its last character; otherwise it
// returns index.
func substitutionAt(chars []rune, index int, bodies *[]string, process bool) int {
	if chars[index] == '`' {
		for end := index + 1; end < len(chars); end++ {
			if chars[end] == '`' {
				*bodies = append(*bodies, string(chars[index+1:end]))
				return end
			}
		}
		return len(chars)
	}
	opens := chars[index] == '$' || (process && (chars[index] == '<' || chars[index] == '>'))
	if opens && index+1 < len(chars) && chars[index+1] == '(' && !(index+2 < len(chars) && chars[index+2] == '(') {
		depth, end := 1, index+2
		for end < len(chars) && depth > 0 {
			if chars[end] == '(' {
				depth++
			} else if chars[end] == ')' {
				depth--
			}
			end++
		}
		last := end
		if depth == 0 {
			last = end - 1
		}
		*bodies = append(*bodies, string(chars[index+2:last]))
		return end - 1
	}
	return index
}

type shellHeredoc struct {
	word              string
	quoted, stripTabs bool
}

// heredocBody returns the body of a heredoc that starts at start, up to the
// line that is its delimiter, and the index where that line ends; ok is false
// without that line.
func heredocBody(chars []rune, start int, heredoc shellHeredoc) (body []rune, end int, ok bool) {
	offset := start
	for offset <= len(chars) {
		end = offset
		for end < len(chars) && chars[end] != '\n' {
			end++
		}
		line := strings.TrimSuffix(string(chars[offset:end]), "\r")
		if heredoc.stripTabs {
			line = strings.TrimLeft(line, "\t")
		}
		if line == heredoc.word {
			return chars[start:offset], end, true
		}
		if end >= len(chars) {
			return nil, 0, false
		}
		offset = end + 1
	}
	return nil, 0, false
}

var heredocStartRe = regexp.MustCompile(`^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|(\\?)([^ \t\n;&|<>()'"]+))`)

// shellSubstitutions returns the command lines a command substitution runs:
// the bodies of `$(…)` and of backticks. It follows the quoting of
// shellTokens: nothing runs inside single quotes, `$'…'`, a comment or the
// body of a heredoc with a quoted delimiter; in the body of any other heredoc
// quotes are text and substitutions run. `$((…))` is arithmetic. Mirrors
// shellSubstitutions in shell-file-access.js.
func shellSubstitutions(command string) []string {
	var bodies []string
	chars := []rune(command)
	quote := ""
	var heredoc *shellHeredoc
	wordStart := true
	for i := 0; i < len(chars); i++ {
		ch := chars[i]
		if quote == "'" {
			if ch == '\'' {
				quote = ""
			}
			continue
		}
		if quote == "$'" {
			if ch == '\\' {
				i++
			} else if ch == '\'' {
				quote = ""
			}
			continue
		}
		if ch == '\\' {
			i++
			wordStart = false
			continue
		}
		if quote == "" {
			if ch == '#' && wordStart {
				for i+1 < len(chars) && chars[i+1] != '\n' {
					i++
				}
				continue
			}
			if ch == '\'' {
				quote, wordStart = "'", false
				continue
			}
			if ch == '$' && i+1 < len(chars) && chars[i+1] == '\'' {
				quote, wordStart = "$'", false
				i++
				continue
			}
			if ch == '<' && i+1 < len(chars) && chars[i+1] == '<' {
				var found []string
				if !(i+2 < len(chars) && chars[i+2] == '<') {
					found = heredocStartRe.FindStringSubmatch(string(chars[i:]))
				}
				if found != nil {
					next := shellHeredoc{stripTabs: found[1] == "-"}
					switch {
					case strings.HasPrefix(strings.TrimLeft(found[0][2+len(found[1]):], " \t"), "'"):
						next.word, next.quoted = found[2], true
					case strings.HasPrefix(strings.TrimLeft(found[0][2+len(found[1]):], " \t"), `"`):
						next.word, next.quoted = found[3], true
					default:
						next.word, next.quoted = found[5], found[4] != ""
					}
					heredoc = &next
					i += len([]rune(found[0])) - 1
				} else {
					i += 2
				}
				wordStart = false
				continue
			}
			if ch == '\n' && heredoc != nil {
				if body, end, ok := heredocBody(chars, i+1, *heredoc); ok {
					if !heredoc.quoted {
						for at := 0; at < len(body); at++ {
							if body[at] == '\\' {
								at++
							} else {
								at = substitutionAt(body, at, &bodies, false)
							}
						}
					}
					i = end
				}
				heredoc = nil
				wordStart = true
				continue
			}
		}
		if ch == '"' {
			if quote != "" {
				quote = ""
			} else {
				quote = `"`
			}
			wordStart = false
			continue
		}
		if end := substitutionAt(chars, i, &bodies, quote == ""); end != i {
			i = end
			wordStart = false
			continue
		}
		wordStart = quote == "" && strings.ContainsRune(" \t\r\n;&|(", ch)
	}
	return bodies
}

// extractShellReadPaths returns the literal files a command line reads: the
// operands of the readers and the targets of `<`. Bounded recognizer,
// mirrored in shell-file-access.js; it resolves no expansion.
func extractShellReadPaths(command string) []string {
	return shellReadPaths(command, false, 0)
}

// extractShellReadPathsExpanded also returns the words with an expansion or a
// glob (their name still classifies the file) and the reads of a command
// substitution.
func extractShellReadPathsExpanded(command string) []string {
	return shellReadPaths(command, true, 0)
}

func shellReadPaths(command string, expansions bool, depth int) []string {
	var paths []string
	reader, skipValue, codeNext, pattern := false, false, false, false
	walkShellCommands(command, shellVisitor{
		input: func(tok shellToken) {
			if tok.literal || expansions {
				paths = append(paths, tok.value)
			}
		},
		command: func(name string, tok shellToken) {
			reader = shellReaders[name] && (tok.literal || !strings.ContainsAny(tok.value, "$*?"))
			skipValue, codeNext = false, false
			pattern = shellPatternFirst[name]
		},
		word: func(name string, tok shellToken) {
			if shellShells[name] {
				if codeNext && depth < shellMaxNesting {
					paths = append(paths, shellReadPaths(tok.value, expansions, depth+1)...)
				}
				codeNext = !codeNext && shellCodeOptionRe.MatchString(tok.value)
				return
			}
			if !reader {
				return
			}
			if skipValue {
				skipValue = false
				return
			}
			option := strings.ToLower(tok.value)
			valueOption := ((name == "head" || name == "tail") && shellCountOptions[option]) ||
				((name == "get-content" || name == "gc") && shellContentOptions[option]) ||
				(name == "scp" && shellScpOptions[option])
			if valueOption {
				skipValue = true
				return
			}
			givesPattern, takesValue := shellPatternOptionRe, shellPatternOptionAloneRe
			if shellFilterFirst[name] {
				givesPattern, takesValue = shellFilterOptionRe, shellFilterOptionAloneRe
			}
			if shellPatternFirst[name] && givesPattern.MatchString(tok.value) {
				pattern = false
				skipValue = takesValue.MatchString(tok.value)
				return
			}
			if strings.HasPrefix(tok.value, "-") {
				return
			}
			if pattern {
				pattern = false
				return
			}
			if operand := shellOperand(tok); operand != "" && (tok.literal || expansions) {
				paths = append(paths, operand)
			}
		},
	})
	if expansions && depth < shellMaxNesting {
		for _, body := range shellSubstitutions(command) {
			paths = append(paths, shellReadPaths(body, expansions, depth+1)...)
		}
	}
	return paths
}

// extractShellCodeFiles returns the file names an interpreter with inline
// code may open: the string literals of the code, cut into path-shaped
// pieces, and the operands after it. An identifier of the code is not a file
// name. Mirrors extractShellCodeFiles in shell-file-access.js.
func extractShellCodeFiles(command string) []string {
	return shellCodeFiles(command, 0)
}

func shellCodeFiles(command string, depth int) []string {
	var files []string
	codeNext, code := false, false
	walkShellCommands(command, shellVisitor{
		input:   func(shellToken) {},
		command: func(string, shellToken) { codeNext, code = false, false },
		word: func(name string, tok shellToken) {
			if shellShells[name] {
				if codeNext && depth < shellMaxNesting {
					files = append(files, shellCodeFiles(tok.value, depth+1)...)
				}
				codeNext = !codeNext && shellCodeOptionRe.MatchString(tok.value)
				return
			}
			if !shellInterpreterRe.MatchString(name) {
				return
			}
			if codeNext {
				codeNext, code = false, true
				for _, literal := range shellCodeStringRe.FindAllString(tok.value, -1) {
					for _, piece := range shellCodeSplitRe.Split(literal[1:len(literal)-1], -1) {
						if piece != "" {
							files = append(files, piece)
						}
					}
				}
			} else if shellInterpreterCodeRe.MatchString(tok.value) {
				codeNext = true
			} else if code && tok.value != "" && !strings.HasPrefix(tok.value, "-") && !shellBlankRe.MatchString(tok.value) {
				files = append(files, shellOperand(tok))
			}
		},
	})
	if depth < shellMaxNesting {
		for _, body := range shellSubstitutions(command) {
			files = append(files, shellCodeFiles(body, depth+1)...)
		}
	}
	return files
}

// extractShellNamedFiles returns the words of a command line that may name a
// file, whatever the command: every word without blanks, and what follows its
// `=`. A nested shell or a command substitution is walked as another command
// line. Mirrors extractShellNamedFiles in shell-file-access.js.
func extractShellNamedFiles(command string) []string {
	return shellNamedFiles(command, 0)
}

func shellNamedFiles(command string, depth int) []string {
	var files []string
	add := func(word string) {
		if word == "" || shellBlankRe.MatchString(word) {
			return
		}
		files = append(files, ungroup(word))
		if equals := strings.Index(word, "="); equals > 0 {
			files = append(files, ungroup(word[equals+1:]))
		}
	}
	skipValue, codeNext := false, false
	walkShellCommands(command, shellVisitor{
		input:      func(tok shellToken) { add(tok.value) },
		assignment: func(tok shellToken) { add(tok.value) },
		command: func(name string, tok shellToken) {
			skipValue, codeNext = false, false
			if !shellNameOnly[name] {
				add(tok.value)
			}
		},
		word: func(name string, tok shellToken) {
			if shellNameOnly[name] {
				return
			}
			if skipValue {
				skipValue = false
				return
			}
			if shellShells[name] {
				if codeNext && depth < shellMaxNesting {
					files = append(files, shellNamedFiles(tok.value, depth+1)...)
				} else if !codeNext {
					add(tok.value)
				}
				codeNext = !codeNext && shellCodeOptionRe.MatchString(tok.value)
				return
			}
			if name == "scp" && shellScpOptions[strings.ToLower(tok.value)] {
				skipValue = true
				return
			}
			add(tok.value)
		},
	})
	if depth < shellMaxNesting {
		for _, body := range shellSubstitutions(command) {
			files = append(files, shellNamedFiles(body, depth+1)...)
		}
	}
	return files
}

func shellBaseName(file string) string {
	if index := strings.LastIndexAny(file, `/\`); index >= 0 {
		file = file[index+1:]
	}
	return strings.ToLower(file)
}

// classifyNamedFile classifies a string of inline code that may not be a
// file: a dictionary key, a property name. A name that only looks like a
// private key (`id_token`, `ssl.key`) counts when it is one of the OpenSSH
// names, has an `id_` prefix and a `.key` or `.pem` extension, lives under a
// `.ssh` directory or exists on disk; a bare `credentials`, when it exists.
// exists may be nil.
func classifyNamedFile(file string, exists func(string) bool) *sensitiveFileClass {
	found := classifySensitiveFile(file)
	if found == nil {
		return nil
	}
	base := shellBaseName(file)
	onDisk := exists != nil && exists(file)
	if found.kind == "private-key" {
		sure := shellKeyNames[base] || (strings.HasPrefix(base, "id_") && shellKeyExtRe.MatchString(base)) || shellSSHDirRe.MatchString(file)
		if sure || onDisk {
			return found
		}
		return nil
	}
	if base == "credentials" && !strings.ContainsAny(file, `/\`) && !onDisk {
		return nil
	}
	return found
}

// globsSSHKey is true for a glob under a `.ssh` directory that an OpenSSH key
// name matches: `~/.ssh/*`, `~/.ssh/id*`. A bracket expression matches any
// character.
func globsSSHKey(file string) bool {
	base := shellBaseName(file)
	if !shellSSHDirRe.MatchString(file) || !strings.ContainsAny(base, "*?[") {
		return false
	}
	source := shellGlobPartRe.ReplaceAllStringFunc(base, func(part string) string {
		switch {
		case part == "*":
			return ".*"
		case part == "?" || (len(part) > 1 && part[0] == '['):
			return "."
		}
		return regexp.QuoteMeta(part)
	})
	pattern, err := regexp.Compile("^" + source + "$")
	if err != nil {
		return true
	}
	for name := range shellKeyNames {
		if pattern.MatchString(name) {
			return true
		}
	}
	return false
}

// namesSSHKey is true when a word of any command names an SSH private key: a
// file under a `.ssh` directory, an OpenSSH name with a directory, or an
// `id_` name that exists on disk. A bare word is not enough, and neither is a
// `.key` extension: `--key=tls.key`, `{.data.key}` and `slides.key` are
// ordinary arguments, and curl or openssl use a key without printing it.
func namesSSHKey(file string, exists func(string) bool) bool {
	if globsSSHKey(file) {
		return true
	}
	if class := classifySensitiveFile(file); class == nil || class.kind != "private-key" {
		return false
	}
	base := shellBaseName(file)
	if shellSSHDirRe.MatchString(file) {
		return true
	}
	if !strings.HasPrefix(base, "id_") {
		return false
	}
	return (shellKeyNames[base] && strings.ContainsAny(file, `/\`)) || (exists != nil && exists(file))
}

// shellReadFiles returns the files a command line reads, for the read guards:
// the operands of the readers and the files its inline code names.
func shellReadFiles(command string, exists func(string) bool) []string {
	files := extractShellReadPathsExpanded(command)
	for _, file := range extractShellCodeFiles(command) {
		if classifyNamedFile(file, exists) != nil {
			files = append(files, file)
		}
	}
	return files
}

// namesDeniedFile is true when the command line names a file the classifier
// denies by name: a file it reads (an operand of a reader, a `<` target, a
// string of inline code), or an SSH private key named by a word of any other
// command.
func namesDeniedFile(command string, exists func(string) bool) bool {
	for _, file := range shellReadFiles(command, exists) {
		if class := classifySensitiveFile(file); (class != nil && class.action == "deny") || globsSSHKey(file) {
			return true
		}
	}
	for _, file := range extractShellNamedFiles(command) {
		if namesSSHKey(file, exists) {
			return true
		}
	}
	return false
}

// expandHome returns a path with its leading tilde replaced by the home
// directory.
func expandHome(file string) string {
	if file == "~" || strings.HasPrefix(file, "~/") || strings.HasPrefix(file, `~\`) {
		if home, err := os.UserHomeDir(); err == nil {
			return home + file[1:]
		}
	}
	return file
}

// shellFileExists reports whether a word of a command line exists as a file,
// relative to the working directory of the hook.
func shellFileExists(file string) bool {
	absolute, err := filepath.Abs(expandHome(file))
	if err != nil {
		return false
	}
	info, err := os.Stat(absolute)
	return err == nil && info.Mode().IsRegular()
}
