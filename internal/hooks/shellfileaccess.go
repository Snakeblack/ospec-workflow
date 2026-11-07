package hooks

import "strings"

// shellToken is a word (quotes removed) or an operator of a command line.
type shellToken struct {
	value             string
	literal, operator bool
}

// shellTokens returns the words and operators of a command line, mirroring
// shellTokens in shell-file-access.js. A word with an expansion is not
// literal, and heredoc bodies are skipped as data.
func shellTokens(command string) []shellToken {
	type token = shellToken
	var tokens []token
	var word []rune
	var quote rune
	heredoc := ""
	stripTabs := false
	literal := true
	ansi := false
	flush := func() {
		if len(word) > 0 {
			last := len(tokens) - 1
			if last >= 0 && tokens[last].operator && (tokens[last].value == "<<" || tokens[last].value == "<<-") {
				heredoc = string(word)
				stripTabs = tokens[last].value == "<<-"
			}
			tokens = append(tokens, token{value: string(word), literal: literal})
		}
		word = nil
		literal = true
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
		if quote != '\'' && (ch == '`' || (ch == '\\' && i+1 < len(chars) && strings.ContainsRune(" \t\r\n\"';&|<>\\", chars[i+1]))) {
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

// Bounded literal-operand recognizer, mirrored in shell-file-access.js.
// Does not interpret expansions or nested shells.
func extractShellReadPaths(command string) []string {
	tokens := shellTokens(command)
	var paths []string
	first, reader, skip, inputRead := true, false, false, false
	readerName := ""
	for _, tok := range tokens {
		if tok.operator {
			if strings.Contains(";&|\n", tok.value) {
				first, reader = true, false
			}
			skip = tok.value == ">" || strings.HasPrefix(tok.value, "<")
			inputRead = tok.value == "<"
			continue
		}
		if skip {
			if inputRead && tok.literal {
				paths = append(paths, tok.value)
			}
			skip = false
			inputRead = false
			continue
		}
		if first {
			parts := strings.FieldsFunc(tok.value, func(ch rune) bool { return ch == '/' || ch == '\\' })
			name := ""
			if len(parts) > 0 {
				name = strings.ToLower(parts[len(parts)-1])
			}
			reader = tok.literal && strings.Contains("|cat|head|tail|less|more|type|get-content|gc|grep|sed|awk|base64|xxd|od|tar|scp|cp|", "|"+name+"|")
			readerName = name
			first = false
		} else if reader {
			countReader := readerName == "head" || readerName == "tail"
			contentReader := readerName == "get-content" || readerName == "gc"
			option := "|" + strings.ToLower(tok.value) + "|"
			// ssh reads the identity and options itself: their values never leave the host.
			scpOption := readerName == "scp" && strings.Contains("|-i|-o|", option)
			if (countReader && strings.Contains("|-n|-c|--lines|--bytes|", option)) || (contentReader && strings.Contains("|-encoding|-totalcount|-tail|-readcount|", option)) || scpOption {
				skip = true
			} else if tok.literal && !strings.HasPrefix(tok.value, "-") {
				paths = append(paths, tok.value)
			}
		}
	}
	return paths
}
