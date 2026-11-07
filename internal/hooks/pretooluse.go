// pre-tool-use hook handler.
// Ports evaluateToolUse and extractCommands
// from scripts/hooks/pre-tool-use.js.  Uses internal/rules for DENY/ASK logic.
package hooks

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/snakeblack/ospec-workflow/internal/ospecdir"
	"github.com/snakeblack/ospec-workflow/internal/rules"
)

// gitCommitPatternRE matches "git commit" in any command string.
var gitCommitPatternRE = regexp.MustCompile(`(?i)\bgit\s+commit\b`)

// forbiddenAttributionRE matches forbidden AI/model attribution: a `*-by:`
// trailer that names an AI or coding tool, a "generated with/by <tool>" phrase
// (English or Spanish, the tool within three words), or 🤖. Naming an agent is
// not attribution, so `fix(claude): …` or a human Co-Authored-By pass. Must
// stay byte-for-byte equivalent to FORBIDDEN_ATTRIBUTION_RE in
// scripts/hooks/pre-tool-use.js (and rules/no-model-attribution.instructions.md).
// Tool names are anchored at word boundaries so ordinary words that merely
// contain one (coherente/cohere, bombardeo/bard, llaman/llama) never fire.
var forbiddenAttributionRE = regexp.MustCompile(
	`(?im)^[ \t]*[\w-]+-by:.*\b(?:claude|anthropic|opus|sonnet|haiku|fable|gpt|chatgpt|openai|codex|copilot|gemini|bard|llama|mistral|cohere|antigravity|agy|cursor|windsurf|kiro|opencode|qwen|deepseek|grok|devin|aider|cline|junie|amp)\b|\b(?:generated|written|created|made|built|authored|assisted|powered|produced|generad[oa]s?|escrit[oa]s?|cread[oa]s?|hech[oa]s?|asistid[oa]s?|producid[oa]s?)\s+(?:with|by|using|con|por)\W+(?:\w+\W+){0,3}?(?:claude|anthropic|opus|sonnet|haiku|fable|gpt|chatgpt|openai|codex|copilot|gemini|bard|llama|mistral|cohere|antigravity|agy|cursor|windsurf|kiro|opencode|qwen|deepseek|grok|devin|aider|cline|junie|amp)\b|🤖`,
)

const attributionReason = "Bloqueado: el commit o la PR atribuye el trabajo a una IA o herramienta (trailer *-by: que la nombra, «generated with/by …» o 🤖). Nombrar un agente sí está permitido: quita solo la atribución. Consulta rules/no-model-attribution.instructions.md."

func unreadableStdinReason(program string) string {
	return "Bloqueado: el mensaje llega por stdin desde `" + program + "`, cuya salida el guard no puede leer para comprobar que el commit o la PR no atribuye el trabajo a una IA o herramienta. Pasa el texto en la propia orden: -m o --body, o -F - / --body-file - con un heredoc."
}

// Programs piped into a message read from stdin: file readers, whose files are
// read (with the options that take a value), and printers, whose text is the
// command's own.
var (
	readerCountOptions   = map[string]bool{"-n": true, "-c": true, "--lines": true, "--bytes": true}
	readerContentOptions = map[string]bool{"-encoding": true, "-totalcount": true, "-tail": true, "-readcount": true}
	fileReaders          = map[string]map[string]bool{
		"cat": {}, "tac": {}, "type": {},
		"head": readerCountOptions, "tail": readerCountOptions,
		"get-content": readerContentOptions, "gc": readerContentOptions,
	}
	printers = map[string]bool{"echo": true, "printf": true}
)

func unreadableMessageReason(file string) string {
	return "Bloqueado: no se pudo leer `" + file + "` para comprobar que el commit o la PR no atribuye el trabajo a una IA o herramienta (no existe, no es un fichero, supera 1 MiB o depende de una variable). Pasa el texto en la propia orden: -m o --body, o -F - / --body-file - con un heredoc."
}

// What may come before the program of a simple command (mirrors
// pre-tool-use.js): environment assignments and reserved words or groups,
// which the program follows, and wrappers, whose options and values end at the
// first git, gh or shell word.
var (
	attributionPrefilterRE = regexp.MustCompile(`(?i)\b(?:git|gh)\b`)
	envAssignmentRE        = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*=`)
	reservedWords          = map[string]bool{"if": true, "then": true, "elif": true, "else": true, "do": true, "while": true, "until": true, "!": true, "{": true, "(": true}
	commandWrappers        = map[string]bool{"env": true, "command": true, "exec": true, "sudo": true, "doas": true, "nohup": true, "time": true, "timeout": true, "nice": true, "ionice": true, "stdbuf": true, "xargs": true}
	shellPrograms          = map[string]bool{"sh": true, "bash": true, "zsh": true, "dash": true, "ksh": true}
	directoryCommands      = map[string]bool{"cd": true, "pushd": true, "popd": true}
	// git options before the subcommand that take the next word (-C moves the directory).
	gitValueOptions   = map[string]bool{"-c": true, "--git-dir": true, "--work-tree": true, "--namespace": true, "--config-env": true, "--super-prefix": true}
	ghPRValueOptions  = map[string]bool{"-R": true, "--repo": true}
	stdinMessageFiles = map[string]bool{"-": true, "/dev/stdin": true}
	// A command line that only mentions one of those commands, wherever it
	// sits, still has its text checked (decision 1a of attribution-guard-gaps).
	messageCommandMentionRE = regexp.MustCompile(`(?is)\bgit\b.*?\b(?:commit|merge)\b|\bgh\b.*?\bpr\b.*?\b(?:create|new|edit|comment|review|merge|close|reopen)\b`)
	// Every quoted string, read apart from the tokenizer.
	quotedStringRE  = regexp.MustCompile(`"((?:[^"\\]|\\[\s\S])*)"|'([^']*)'`)
	cdOptionRE      = regexp.MustCompile(`^-[LPe@]+$`)
	shellOptionRE   = regexp.MustCompile(`^-[A-Za-z]+$`)
	programPrefixRE = regexp.MustCompile(`^[\\$({]+`)
	trailingParenRE = regexp.MustCompile(`\)+$`)
	digitsRE        = regexp.MustCompile(`^[0-9]+$`)
	// printf, echo -e and $'…' escapes: \n, \t, \r, \xHH, \uHHHH, \UHHHHHHHH, \NNN.
	escapeRE        = regexp.MustCompile(`\\(?:x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{1,4})|U([0-9A-Fa-f]{1,8})|0?([0-7]{1,3})|([ntr]))`)
	backslashRE     = regexp.MustCompile(`\\([\s\S])`)
	trailerEqualsRE = regexp.MustCompile(`(?im)^([ \t]*[\w-]+-by)[ \t]*=`)
	maxShellDepth   = 2
)

// messageOptions names the options of a command whose value is message text
// (skipped when looking for a file) and those whose value names the file that
// holds the message (attribution-guard-gaps). git takes a unique abbreviation of a long option
// (`--fil`), gh does not.
type messageOptions struct {
	text, short, long []string
	abbreviate        bool
}

var ghPRMessage = messageOptions{
	text:  []string{"-t", "--title", "-b", "--body", "--subject", "-R", "--repo"},
	short: []string{"-F", "-T"},
	long:  []string{"--body-file", "--template"},
}

// messageCommands mirrors MESSAGE_COMMANDS in pre-tool-use.js: the commands
// whose text carries a commit message or a pull request's title, body or
// comment.
var messageCommands = map[string]messageOptions{
	"git commit":    {text: []string{"-m", "--message", "-c", "-C", "--reuse-message", "--reedit-message"}, short: []string{"-F", "-t"}, long: []string{"--file", "--template"}, abbreviate: true},
	"git merge":     {text: []string{"-m", "--message"}, short: []string{"-F"}, long: []string{"--file"}, abbreviate: true},
	"gh pr create":  ghPRMessage,
	"gh pr new":     ghPRMessage,
	"gh pr edit":    ghPRMessage,
	"gh pr comment": ghPRMessage,
	"gh pr review":  ghPRMessage,
	"gh pr merge":   ghPRMessage,
	// Closing or reopening a pull request posts its -c/--comment.
	"gh pr close":  {text: []string{"-c", "--comment"}},
	"gh pr reopen": {text: []string{"-c", "--comment"}},
}

// messageTarget is a message command, its words after the subcommand and the
// directory git reads its files from ("" when it cannot be told).
type messageTarget struct {
	messageOptions
	args []shellToken
	cwd  string
	// What feeds a message read from stdin: the files of its `<`, a heredoc or
	// here-string, or the simple command piped into it, from the shell's
	// directory.
	shellCwd  string
	inputs    []shellToken
	stdinText bool
	feeder    *pipedCommand
}

// pipedCommand is a simple command with the shell's directory where it runs
// and what feeds its stdin: its `<` files, a heredoc or here-string, or the
// command piped into it.
type pipedCommand struct {
	program   string
	args      []shellToken
	cwd       string
	inputs    []shellToken
	stdinText bool
	feeder    *pipedCommand
}

// segment is a simple command of a command line: its words, the files its `<`
// redirections read, whether a heredoc or a here-string feeds it, and whether
// a pipe (`|` or `|&`, also broken by a line) feeds it the previous one.
type segment struct {
	words, inputs []shellToken
	stdinText     bool
	piped         bool
}

// commandSegments splits the words of a command line at `;`, `&`, `|` and
// line breaks, without the `)` that closes a subshell on the last word. An `&`
// after a redirection (`>&`, `<&`) or before `>` (`&>`) belongs to the
// redirection, and a word of digits right before one is its descriptor, not an
// operand.
func commandSegments(tokens []shellToken) []*segment {
	var segments []*segment
	var current *segment
	between := ""
	redirect := ""
	descriptor := ""
	for i := 0; i < len(tokens); i++ {
		tok := tokens[i]
		if tok.operator {
			switch {
			case (tok.value == "&" && redirect != "") || (tok.value == "|" && redirect == ">"):
			case tok.value == "&" && i+1 < len(tokens) && tokens[i+1].operator && tokens[i+1].value == ">":
				redirect = ">"
				i++
			case strings.Contains(";&|\n", tok.value):
				current = nil
				between += tok.value
				redirect = ""
			default:
				if redirect == "" {
					descriptor = ""
					if current != nil && len(current.words) > 0 && digitsRE.MatchString(current.words[len(current.words)-1].value) {
						descriptor = current.words[len(current.words)-1].value
						current.words = current.words[:len(current.words)-1]
					}
				}
				redirect = tok.value
			}
			continue
		}
		if current == nil {
			pipe := strings.ReplaceAll(between, "\n", "")
			current = &segment{piped: pipe == "|" || pipe == "|&"}
			segments = append(segments, current)
			between = ""
		}
		// `N<` with another descriptor than 0 is not stdin.
		switch {
		case redirect == "":
			current.words = append(current.words, tok)
		case redirect == "<" && (descriptor == "" || descriptor == "0"):
			current.inputs = append(current.inputs, tok)
		case strings.HasPrefix(redirect, "<<"):
			current.stdinText = true
		}
		redirect = ""
		descriptor = ""
	}
	for _, seg := range segments {
		if n := len(seg.words); n > 0 && !strings.Contains(seg.words[n-1].value, "(") && strings.HasSuffix(seg.words[n-1].value, ")") {
			seg.words[n-1].value = trailingParenRE.ReplaceAllString(seg.words[n-1].value, "")
		}
	}
	return segments
}

// stdinSource is where a message read from stdin comes from: files to read
// (none when the command line holds the text), or a program whose output
// cannot be read.
type stdinSource struct {
	files []fileToRead
	deny  string
}

// fileToRead is a message file and the directory it is read from.
type fileToRead struct {
	file *shellToken
	base string
}

// stdinOf returns where the stdin of a simple command comes from, or nil when
// nothing feeds it. Its own `<` wins over a heredoc and a pipe.
func stdinOf(inputs []shellToken, stdinText bool, feeder *pipedCommand, base string) *stdinSource {
	if len(inputs) > 0 {
		source := &stdinSource{}
		for i := range inputs {
			source.files = append(source.files, fileToRead{&inputs[i], base})
		}
		return source
	}
	if stdinText {
		return &stdinSource{}
	}
	if feeder == nil {
		return nil
	}
	return fedBy(feeder)
}

// fedBy returns what a piped command feeds: a file reader its operands, and
// without them its own stdin; echo and printf their own text; any other
// program cannot be read.
func fedBy(feeder *pipedCommand) *stdinSource {
	if printers[feeder.program] {
		return &stdinSource{}
	}
	if fileReaders[feeder.program] == nil {
		return &stdinSource{deny: feeder.program}
	}
	operands := readerFiles(feeder)
	var files []fileToRead
	readsStdin := false
	for i := range operands {
		if operands[i].literal && stdinMessageFiles[operands[i].value] {
			readsStdin = true
		} else {
			files = append(files, fileToRead{&operands[i], feeder.cwd})
		}
	}
	if len(files) > 0 && !readsStdin {
		return &stdinSource{files: files}
	}
	// Without operands, or with a `-` among them, the reader reads its own
	// stdin; with nothing feeding it, the terminal.
	own := stdinOf(feeder.inputs, feeder.stdinText, feeder.feeder, feeder.cwd)
	if own == nil {
		return &stdinSource{deny: feeder.program}
	}
	if own.deny != "" {
		return own
	}
	return &stdinSource{files: append(files, own.files...)}
}

// readerFiles returns the operands of a file reader (`-` for stdin included),
// without options and their values.
func readerFiles(feeder *pipedCommand) []shellToken {
	valueOptions := fileReaders[feeder.program]
	var files []shellToken
	for i := 0; i < len(feeder.args); i++ {
		if valueOptions[strings.ToLower(feeder.args[i].value)] {
			i++
		} else if !strings.HasPrefix(feeder.args[i].value, "-") || feeder.args[i].value == "-" {
			files = append(files, feeder.args[i])
		}
	}
	return files
}

// programName strips a program word's path, a leading `\`, `(`, `{` or `$(`, and `.exe`.
func programName(value string) string {
	value = programPrefixRE.ReplaceAllString(value, "")
	return strings.TrimSuffix(strings.ToLower(value[strings.LastIndexAny(value, `/\`)+1:]), ".exe")
}

// simpleCommand returns the program of a simple command and the words after it.
// A wrapper's options and values end at the first git, gh, shell, file reader
// or printer word; without one the wrapper is the program, and xargs, which
// turns its stdin into arguments, only leads to git, gh or a shell.
func simpleCommand(words []shellToken) (string, []shellToken, bool) {
	i := 0
	for i < len(words) && (envAssignmentRE.MatchString(words[i].value) || reservedWords[words[i].value]) {
		i++
	}
	if i >= len(words) {
		return "", nil, false
	}
	if wrapper := programName(words[i].value); commandWrappers[wrapper] {
		leads := func(name string) bool {
			return name == "git" || name == "gh" || shellPrograms[name] || (wrapper != "xargs" && (fileReaders[name] != nil || printers[name]))
		}
		j := i + 1
		for j < len(words) && !leads(programName(words[j].value)) {
			j++
		}
		if j >= len(words) {
			return wrapper, words[i+1:], true
		}
		i = j
	}
	return programName(words[i].value), words[i+1:], true
}

// homePath expands a leading ~ or ~/ to the home directory.
func homePath(value string) (string, bool) {
	if value != "~" && !strings.HasPrefix(value, "~/") && !strings.HasPrefix(value, `~\`) {
		return value, true
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", false
	}
	if value == "~" {
		return home, true
	}
	return filepath.Join(home, value[2:]), true
}

// resolveDirectory returns the directory a `cd`, `pushd` or `git -C` operand
// names from base, or "" when it cannot be told (an expansion or an unknown base).
func resolveDirectory(base string, word *shellToken) string {
	if base == "" || word == nil || !word.literal || word.value == "" {
		return ""
	}
	value, ok := homePath(word.value)
	if !ok {
		return ""
	}
	if filepath.IsAbs(value) {
		return filepath.Clean(value)
	}
	return filepath.Join(base, value)
}

// changeDirectory returns the directory after a `cd`, `pushd` or `popd`.
func changeDirectory(base, program string, args []shellToken) string {
	if program == "popd" {
		return ""
	}
	var operands []shellToken
	for _, word := range args {
		if !cdOptionRE.MatchString(word.value) {
			operands = append(operands, word)
		}
	}
	if len(operands) == 0 {
		if program != "cd" {
			return ""
		}
		home, _ := homePath("~")
		return home
	}
	if len(operands) > 1 || operands[0].value == "-" {
		return ""
	}
	return resolveDirectory(base, &operands[0])
}

// shellScript returns the script word of `sh|bash|zsh|dash|ksh [options] -c <script>`.
func shellScript(args []shellToken) (string, bool) {
	for i := 0; i < len(args); i++ {
		value := args[i].value
		if value == "-o" || value == "+o" {
			i++
			continue
		}
		if !shellOptionRE.MatchString(value) {
			return "", false
		}
		if strings.Contains(value, "c") {
			if i+1 < len(args) {
				return args[i+1].value, true
			}
			return "", false
		}
	}
	return "", false
}

// messageCommand returns the message options of a `git commit|merge` or
// `gh pr <sub>` simple command, with the directory git reads its files from.
func messageCommand(program string, args []shellToken, cwd string) (messageTarget, bool) {
	i := 0
	base := cwd
	command := ""
	if program == "git" {
		for i < len(args) && strings.HasPrefix(args[i].value, "-") {
			switch {
			case args[i].value == "-C":
				var operand *shellToken
				if i+1 < len(args) {
					operand = &args[i+1]
				}
				base = resolveDirectory(base, operand)
				i += 2
			case gitValueOptions[args[i].value]:
				i += 2
			default:
				i++
			}
		}
		if i < len(args) {
			command = "git " + args[i].value
		}
	} else if program == "gh" && len(args) > 0 && args[0].value == "pr" {
		i = 1
		for i < len(args) && strings.HasPrefix(args[i].value, "-") {
			if ghPRValueOptions[args[i].value] {
				i += 2
			} else {
				i++
			}
		}
		if i < len(args) {
			command = "gh pr " + args[i].value
		}
	}
	options, ok := messageCommands[command]
	if !ok {
		return messageTarget{}, false
	}
	return messageTarget{messageOptions: options, args: args[i+1:], cwd: base}, true
}

// longOption returns the long option of names a word names, as written
// (`--name`, `--name=…`, or with abbreviate a prefix of at least `--xy`).
func longOption(value string, names []string, abbreviate bool) string {
	if !strings.HasPrefix(value, "--") {
		return ""
	}
	name, _, _ := strings.Cut(value, "=")
	for _, option := range names {
		if strings.HasPrefix(option, "--") && (option == name || (abbreviate && len(name) >= 4 && strings.HasPrefix(option, name))) {
			return name
		}
	}
	return ""
}

// messageFiles returns the words a message option names as its file; a
// missing value is nil.
func messageFiles(target messageTarget) []*shellToken {
	var files []*shellToken
	args := target.args
	for i := 0; i < len(args); i++ {
		value := args[i].value
		if value == "--" {
			break
		}
		textOption := longOption(value, target.text, target.abbreviate)
		if slices.Contains(target.text, value) {
			textOption = value
		}
		if textOption != "" {
			if value == textOption {
				i++
			}
			continue
		}
		option := longOption(value, target.long, target.abbreviate)
		if option == "" {
			for _, name := range target.short {
				if strings.HasPrefix(value, name) {
					option = name
					break
				}
			}
		}
		if option == "" {
			continue
		}
		if value == option {
			if i+1 < len(args) {
				file := args[i+1]
				files = append(files, &file)
			} else {
				files = append(files, nil)
			}
			i++
			continue
		}
		skip := len(option)
		if strings.HasPrefix(option, "--") {
			skip++
		}
		files = append(files, &shellToken{value: value[skip:], literal: args[i].literal})
	}
	return files
}

// readMessageFile reads a regular file under 1 MiB, its path resolved against
// base (the directory git reads it from; "" when unknown) and ~/ against the
// home directory.
func readMessageFile(file *shellToken, base string) (string, bool) {
	if file == nil || !file.literal || file.value == "" {
		return "", false
	}
	name := file.value
	if strings.HasPrefix(name, "~/") || strings.HasPrefix(name, `~\`) {
		expanded, ok := homePath(name)
		if !ok {
			return "", false
		}
		name = expanded
	}
	if !filepath.IsAbs(name) {
		if base == "" {
			return "", false
		}
		name = filepath.Join(base, name)
	}
	info, err := os.Stat(name)
	if err != nil || !info.Mode().IsRegular() || info.Size() >= maxScanSizeBytes {
		return "", false
	}
	data, err := os.ReadFile(name)
	if err != nil {
		return "", false
	}
	return string(data), true
}

// decodeEscapes decodes the printf, echo -e and $'…' escapes of a text.
func decodeEscapes(text string) string {
	return escapeRE.ReplaceAllStringFunc(text, func(all string) string {
		m := escapeRE.FindStringSubmatch(all)
		var code int64
		var err error
		switch {
		case m[5] == "n":
			return "\n"
		case m[5] == "t":
			return "\t"
		case m[5] == "r":
			return "\r"
		case m[1] != "":
			code, err = strconv.ParseInt(m[1], 16, 32)
		case m[2] != "":
			code, err = strconv.ParseInt(m[2], 16, 32)
		case m[3] != "":
			code, err = strconv.ParseInt(m[3], 16, 64)
		default:
			code, err = strconv.ParseInt(m[4], 8, 32)
		}
		// A surrogate or a code point past Unicode stays as written, as in the Node hook.
		if err != nil || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) {
			return all
		}
		return string(rune(code))
	})
}

// hasAttribution checks a text as written and as the shell or git reads it:
// escapes decoded, the backslashes an unquoted word drops dropped, and a
// `--trailer token=value` read as `token: value`.
func hasAttribution(text string) bool {
	for _, spelling := range []string{text, decodeEscapes(text), backslashRE.ReplaceAllString(text, "$1")} {
		if forbiddenAttributionRE.MatchString(trailerEqualsRE.ReplaceAllString(spelling, "$1:")) {
			return true
		}
	}
	return false
}

// checkCommitAttribution ports checkCommitAttribution from
// scripts/hooks/pre-tool-use.js: it checks the message of a `git commit|merge`
// and the title, body or comment of a `gh pr create|new|edit|comment|review|merge`
// wherever it travels (attribution-guard-gaps): the whole command text, its quoted strings and
// words, the scripts of `sh -c`, the files the message options name, read
// from the directory git uses (`cd`, `git -C`), and, for a message read from
// stdin, the file of its `<` or of a file reader piped into it (other programs
// but echo and printf deny). A file it cannot read is denied
// (ADR 0008). An empty workspace is the working directory. Returns "" when
// clean or not such a command.
func checkCommitAttribution(command, workspace string) string {
	if workspace == "" {
		if wd, err := os.Getwd(); err == nil {
			workspace = wd
		}
	}
	return attributionIn(command, workspace, 0)
}

func attributionIn(command, workspace string, depth int) string {
	if !attributionPrefilterRE.MatchString(command) {
		return ""
	}
	tokens := shellTokens(command)
	type script struct{ text, cwd string }
	var targets []messageTarget
	var scripts []script
	cwd := workspace
	var previous *pipedCommand
	for _, seg := range commandSegments(tokens) {
		program, args, ok := simpleCommand(seg.words)
		var feeder *pipedCommand
		if seg.piped {
			feeder = previous
		}
		// A piped segment always feeds something: one with no program feeds what cannot be read.
		if ok {
			previous = &pipedCommand{program, args, cwd, seg.inputs, seg.stdinText, feeder}
		} else {
			first := ""
			if len(seg.words) > 0 {
				first = seg.words[0].value
			}
			previous = &pipedCommand{first, nil, cwd, seg.inputs, seg.stdinText, feeder}
			continue
		}
		switch {
		case directoryCommands[program]:
			cwd = changeDirectory(cwd, program, args)
		case shellPrograms[program]:
			if text, found := shellScript(args); found {
				scripts = append(scripts, script{text, cwd})
			}
		default:
			if target, found := messageCommand(program, args, cwd); found {
				target.shellCwd, target.inputs, target.stdinText, target.feeder = cwd, seg.inputs, seg.stdinText, feeder
				targets = append(targets, target)
			}
		}
	}
	if len(targets) == 0 && len(scripts) == 0 && !messageCommandMentionRE.MatchString(command) {
		return ""
	}
	texts := []string{command}
	for _, match := range quotedStringRE.FindAllStringSubmatch(command, -1) {
		if strings.HasPrefix(match[0], `"`) {
			texts = append(texts, match[1])
		} else {
			texts = append(texts, match[2])
		}
	}
	for _, tok := range tokens {
		if tok.operator {
			continue
		}
		texts = append(texts, tok.value)
		if equals := strings.Index(tok.value, "="); strings.HasPrefix(tok.value, "-") && equals > 0 {
			texts = append(texts, tok.value[equals+1:])
		}
	}
	for _, text := range texts {
		if hasAttribution(text) {
			return attributionReason
		}
	}
	if depth < maxShellDepth {
		for _, nested := range scripts {
			if reason := attributionIn(nested.text, nested.cwd, depth+1); reason != "" {
				return reason
			}
		}
	}
	for _, target := range targets {
		// Message files are read where git runs (git -C); what feeds stdin,
		// where the shell runs.
		var toRead []fileToRead
		fromStdin := false
		for _, file := range messageFiles(target) {
			if file != nil && file.literal && stdinMessageFiles[file.value] {
				fromStdin = true
			} else {
				toRead = append(toRead, fileToRead{file, target.cwd})
			}
		}
		if fromStdin {
			if source := stdinOf(target.inputs, target.stdinText, target.feeder, target.shellCwd); source != nil {
				if source.deny != "" {
					return unreadableStdinReason(source.deny)
				}
				toRead = append(toRead, source.files...)
			}
		}
		for _, entry := range toRead {
			file := entry.file
			content, ok := readMessageFile(file, entry.base)
			if !ok {
				name := ""
				if file != nil {
					name = file.value
				}
				return unreadableMessageReason(name)
			}
			if forbiddenAttributionRE.MatchString(content) {
				return attributionReason
			}
		}
	}
	return ""
}

// isRiskyAction mirrors isRiskyAction from scripts/hooks/lib/git-state.js.
// Returns true only when a command matches "git commit". File-write tools
// (Edit, Write, etc.) are no longer considered risky on their own: the guard
// behaves like a pre-commit check rather than firing on every edit.
func isRiskyAction(cmds []string) bool {
	for _, cmd := range cmds {
		if gitCommitPatternRE.MatchString(cmd) {
			return true
		}
	}
	return false
}

func init() {
	Register(&preToolUseHandler{})
}

type preToolUseHandler struct{}

func (h *preToolUseHandler) Name() string { return "pre-tool-use" }

// toolInput is the shape of the tool_input JSON object.
// command and commands can be mixed types so we use json.RawMessage.
type toolInput struct {
	Command  *string           `json:"command"`
	Commands []json.RawMessage `json:"commands"`
}

type preToolUseInput struct {
	ToolName       string    `json:"tool_name"`
	PermissionMode string    `json:"permission_mode"`
	ToolInput      toolInput `json:"tool_input"`
}

// extractCommands ports extractCommands from pre-tool-use.js:
// collects strings from tool_input.command (string) and tool_input.commands
// (array of strings or {command:string} objects).
func extractCommands(input *preToolUseInput) []string {
	if input == nil {
		return nil
	}
	var cmds []string
	if input.ToolInput.Command != nil {
		cmds = append(cmds, *input.ToolInput.Command)
	}
	for _, raw := range input.ToolInput.Commands {
		// Try string first.
		var s string
		if err := json.Unmarshal(raw, &s); err == nil {
			cmds = append(cmds, s)
			continue
		}
		// Try {command: string} object.
		var obj struct {
			Command string `json:"command"`
		}
		if err := json.Unmarshal(raw, &obj); err == nil && obj.Command != "" {
			cmds = append(cmds, obj.Command)
		}
	}
	return cmds
}

const markerOverwriteReason = "Bloqueado: el contenido lleva el marcador [REDACTED:…] de ospec y el fichero destino guarda secretos reales; escribirlo los destruiría. Edita solo las líneas sin secretos, o pide al usuario que cambie el valor."

func readSmallFile(filePath string) (string, bool) {
	info, err := os.Stat(filePath)
	if err != nil || info.Size() >= maxScanSizeBytes {
		return "", false
	}
	content, err := os.ReadFile(filePath)
	if err != nil {
		return "", false
	}
	return string(content), true
}

// fileHoldsSecrets reports whether the file on disk holds something the
// output redaction would hide.
func fileHoldsSecrets(filePath string) bool {
	content, ok := readSmallFile(filePath)
	if !ok {
		return false
	}
	_, kinds := redactSecrets(content, classifySensitiveFile(filePath) != nil)
	return len(kinds) > 0
}

// readCoveredByRedaction: the read exemption holds only when the redacted
// content leaves nothing the secret scan would still ask about (an unreadable
// or oversized file asks).
func readCoveredByRedaction(filePath string) bool {
	content, ok := readSmallFile(filePath)
	return ok && isCoveredByRedaction(content, classifySensitiveFile(filePath) != nil)
}

var shellOperandSeparatorRe = regexp.MustCompile("[ \t\r\n\f\v;|&<>\"'`]+")

// readTools: tools whose result is only what they read; anything else
// (writes, MCP uploads) may move a file without its content passing through
// PostToolUse. Names are compared without punctuation and in lower case.
var readTools = map[string]bool{"read": true, "grep": true, "glob": true, "ls": true, "list": true, "viewfile": true, "notebookread": true}

var toolNamePunctuationRe = regexp.MustCompile(`[^a-z0-9]`)

func isReadTool(toolName string) bool {
	return readTools[toolNamePunctuationRe.ReplaceAllString(strings.ToLower(toolName), "")]
}

// noDecision is the output of a call without objection: empty stdout, so the
// host applies its own permission prompt and rules. An affirmative allow would
// skip them (OSP-017).
var noDecision []byte

// makeDecision builds the hookSpecificOutput JSON blob.
func makeDecision(decision, reason string) []byte {
	type hookOutput struct {
		HookEventName            string `json:"hookEventName"`
		PermissionDecision       string `json:"permissionDecision"`
		PermissionDecisionReason string `json:"permissionDecisionReason"`
	}
	type output struct {
		HookSpecificOutput hookOutput `json:"hookSpecificOutput"`
	}
	out := output{
		HookSpecificOutput: hookOutput{
			HookEventName:            "PreToolUse",
			PermissionDecision:       decision,
			PermissionDecisionReason: reason,
		},
	}
	b, _ := json.Marshal(out)
	return b
}

func findWorkspaceRoot() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}
	dir := cwd
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return cwd
}

// resolveExistingFile returns the absolute path of a file-system path if it
// resolves to an existing regular file, trying first as-is and then relative
// to the workspace root. Returns ("", false) when neither location exists.
func resolveExistingFile(cleaned string) (string, bool) {
	if info, err := os.Stat(cleaned); err == nil && !info.IsDir() {
		if abs, err := filepath.Abs(cleaned); err == nil {
			return abs, true
		}
	}
	root := findWorkspaceRoot()
	rel := filepath.Join(root, cleaned)
	if info, err := os.Stat(rel); err == nil && !info.IsDir() {
		if abs, err := filepath.Abs(rel); err == nil {
			return abs, true
		}
	}
	return "", false
}

func extractPaths(v interface{}) []string {
	var paths []string
	var traverse func(x interface{})
	traverse = func(x interface{}) {
		if x == nil {
			return
		}
		switch val := x.(type) {
		case string:
			cleaned := val
			if strings.HasPrefix(cleaned, "file://") {
				cleaned = strings.TrimPrefix(cleaned, "file://")
				cleaned = strings.TrimPrefix(cleaned, "/")
			}
			if abs, ok := resolveExistingFile(cleaned); ok {
				paths = append(paths, abs)
			}
		case []interface{}:
			for _, item := range val {
				traverse(item)
			}
		case map[string]interface{}:
			for _, item := range val {
				traverse(item)
			}
		}
	}
	traverse(v)
	return paths
}

// Claude and VS Code use snake_case argument names; OpenCode uses camelCase.
var declaredPathKeys = map[string]bool{
	"file_path": true, "filePath": true, "path": true, "target_file": true, "notebook_path": true,
}

var contentKeys = map[string]bool{
	"content": true, "contents": true, "new_string": true, "newString": true, "new_str": true, "old_string": true, "oldString": true, "text": true,
}

// cliOwnedReason, writeToolRe and patchFileRe port writesCliOwnedFile of
// pre-tool-use.js: the ospec CLI owns the state of an IDD change, its archive
// and the review receipts (E1.43, ADR 0002), so a tool that writes a file never
// touches them, whatever the permission mode. A tool writes when its name says
// so; a patch tool names its files in the patch headers. Shell commands are
// left to the revalidation of ospec close.
const cliOwnedReason = "Bloqueado: este fichero es del CLI de ospec (el estado de un cambio IDD, su archivo, un recibo de review o la cuenta de turnos). Avanza con los comandos de ospec (record, run, check, review, close); no lo edites a mano."

// copy, append, save and upload cover third-party MCP tools (E1.46).
var writeToolRe = regexp.MustCompile(`write|edit|patch|create|replace|insert|delete|remove|move|rename|copy|append|save|upload`)

// ownedPathKeys: a move or a copy names both ends (MCP filesystem move_file);
// both count.
var ownedPathKeys = map[string]bool{
	"file_path": true, "filePath": true, "path": true, "target_file": true, "notebook_path": true, "source": true, "destination": true,
}

// stateFileRe: the state, and the .tmp and .bak the atomic write leaves, which
// reading the change restores as the state.
var stateFileRe = regexp.MustCompile(`^state\.yaml(?:\.|$)`)
var patchFileRe = regexp.MustCompile(`(?m)^[ \t]*\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$`)
var pathSeparatorsRe = regexp.MustCompile(`[\\/]+`)

func collectStrings(value interface{}) []string {
	var found []string
	var walk func(interface{})
	walk = func(current interface{}) {
		switch typed := current.(type) {
		case string:
			found = append(found, typed)
		case map[string]interface{}:
			for _, child := range typed {
				walk(child)
			}
		case []interface{}:
			for _, child := range typed {
				walk(child)
			}
		}
	}
	walk(value)
	return found
}

// isCLIOwnedPath: idd/<change>/state.yaml (with its .tmp and .bak),
// idd/archive/ or .ospec/review-receipts/ and anything under them, and the
// turn count .ospec/turns (E1.49), wherever the path holds them and in any
// case.
func isCLIOwnedPath(filePath string) bool {
	var segments []string
	for _, segment := range pathSeparatorsRe.Split(strings.ToLower(filePath), -1) {
		if segment != "" {
			segments = append(segments, segment)
		}
	}
	at := func(index int) string {
		if index < len(segments) {
			return segments[index]
		}
		return ""
	}
	for index, segment := range segments {
		after := len(segments) - index - 1
		if segment == "idd" && ((at(index+1) == "archive" && after >= 1) || (after == 2 && stateFileRe.MatchString(at(index+2)))) {
			return true
		}
		if segment == ".ospec" && ((at(index+1) == "review-receipts" && after >= 1) || (at(index+1) == "turns" && after == 1)) {
			return true
		}
	}
	return false
}

func writesCLIOwnedFile(toolName string, stdin []byte) bool {
	name := toolNamePunctuationRe.ReplaceAllString(strings.ToLower(toolName), "")
	if readTools[name] || !writeToolRe.MatchString(name) {
		return false
	}
	var raw struct {
		ToolInput interface{} `json:"tool_input"`
	}
	_ = json.Unmarshal(stdin, &raw)
	files := collectKeyedStrings(raw.ToolInput, ownedPathKeys)
	if strings.Contains(name, "patch") {
		for _, text := range collectStrings(raw.ToolInput) {
			for _, match := range patchFileRe.FindAllStringSubmatch(text, -1) {
				files = append(files, strings.TrimSpace(match[1]))
			}
		}
	}
	for _, file := range files {
		if absolute, err := filepath.Abs(file); err == nil && isCLIOwnedPath(absolute) {
			return true
		}
	}
	return false
}

func collectKeyedStrings(value interface{}, keys map[string]bool) []string {
	var found []string
	var walk func(interface{})
	walk = func(current interface{}) {
		switch typed := current.(type) {
		case map[string]interface{}:
			for key, child := range typed {
				if text, ok := child.(string); ok && keys[key] {
					found = append(found, text)
					continue
				}
				walk(child)
			}
		case []interface{}:
			for _, child := range typed {
				walk(child)
			}
		}
	}
	walk(value)
	return found
}

var codeExtensions = map[string]bool{
	".js": true, ".go": true, ".json": true, ".yaml": true, ".yml": true,
	".md": true, ".ts": true, ".py": true, ".txt": true, ".rs": true,
	".c": true, ".cpp": true, ".h": true, ".html": true, ".css": true,
}

func estimateTokens(filePath string) int {
	info, err := os.Stat(filePath)
	if err != nil {
		return 0
	}
	bytes := info.Size()
	ext := strings.ToLower(filepath.Ext(filePath))
	if codeExtensions[ext] {
		return int(float64(bytes)/4.0 + 0.5)
	}
	return int((float64(bytes)/6.0)*1.3 + 0.5)
}

func FindActiveChangeName() string {
	root := findWorkspaceRoot()
	changesRoot := filepath.Join(root, "openspec", "changes")
	entries, err := os.ReadDir(changesRoot)
	if err != nil {
		return "unknown"
	}
	for _, entry := range entries {
		if entry.IsDir() && entry.Name() != "archive" {
			statePath := filepath.Join(changesRoot, entry.Name(), "state.yaml")
			content, err := os.ReadFile(statePath)
			if err == nil {
				if strings.Contains(string(content), "status: active") {
					return entry.Name()
				}
			}
		}
	}
	return "unknown"
}

type tokenEvent struct {
	T  int   `json:"t"`
	TS int64 `json:"ts"`
}

func getCumulativeTokens(changeName string) int {
	if changeName == "unknown" {
		return 0
	}
	root := findWorkspaceRoot()
	logPath := filepath.Join(root, ".ospec", "session", changeName, "token-events.jsonl")
	content, err := os.ReadFile(logPath)
	if err != nil {
		return 0
	}
	lines := strings.Split(string(content), "\n")
	total := 0
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		var ev tokenEvent
		if err := json.Unmarshal([]byte(trimmed), &ev); err == nil {
			total += ev.T
		}
	}
	return total
}

func recordTokens(changeName string, tokens int) {
	if changeName == "unknown" || tokens <= 0 {
		return
	}
	root := findWorkspaceRoot()
	logDir := filepath.Join(root, ".ospec", "session", changeName)
	if err := ospecdir.MkdirAll(logDir, 0755); err != nil {
		return
	}
	logPath := filepath.Join(logDir, "token-events.jsonl")
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return
	}
	defer f.Close()

	ev := tokenEvent{
		T:  tokens,
		TS: time.Now().UnixNano() / int64(time.Millisecond),
	}
	b, err := json.Marshal(ev)
	if err == nil {
		_, _ = f.Write(append(b, '\n'))
	}
}

// applyPermissionMode degrades advisory `ask` decisions to `allow` plus a
// top-level systemMessage when the session runs in bypassPermissions: a hook
// `ask` overrides the user's chosen permission mode, so keeping it would
// re-introduce the prompts the user explicitly opted out of. `deny` decisions
// are the hard safety floor and are never degraded. Ports applyPermissionMode
// from scripts/hooks/pre-tool-use.js.
// REQ-hooks-005: on the codex target, ASK is unsupported by the host. The
// wrapper signals this via TWO env vars that must both be present:
// OSPEC_TARGET=codex (target selector) AND OSPEC_CODEX_WRAPPER=1 (a
// per-invocation marker the codex-generated hooks.json command inlines
// directly on the command line — see codexHooks in
// scripts/lib/target-transform.js). Requiring both closes the gap where a
// leftover shell export, CI env var, or repo .env auto-loaded OSPEC_TARGET
// alone into an unrelated session would silently degrade every ASK-class
// decision there too; OSPEC_CODEX_WRAPPER is set fresh by the wrapper's own
// command string for that single invocation, not inherited ambient state.
// DENY stays undegraded, same as the existing bypass path.
func applyPermissionMode(out []byte, permissionMode string) []byte {
	codexWrapper := os.Getenv("OSPEC_TARGET") == "codex" && os.Getenv("OSPEC_CODEX_WRAPPER") == "1"
	if permissionMode != "bypassPermissions" && !codexWrapper {
		return out
	}
	var decoded struct {
		HookSpecificOutput struct {
			HookEventName            string `json:"hookEventName"`
			PermissionDecision       string `json:"permissionDecision"`
			PermissionDecisionReason string `json:"permissionDecisionReason"`
		} `json:"hookSpecificOutput"`
	}
	if err := json.Unmarshal(out, &decoded); err != nil {
		return out
	}
	if decoded.HookSpecificOutput.PermissionDecision != "ask" {
		return out
	}
	type hookOutput struct {
		HookEventName            string `json:"hookEventName"`
		PermissionDecision       string `json:"permissionDecision"`
		PermissionDecisionReason string `json:"permissionDecisionReason"`
	}
	type output struct {
		SystemMessage      string     `json:"systemMessage"`
		HookSpecificOutput hookOutput `json:"hookSpecificOutput"`
	}
	degraded := output{
		SystemMessage: "[ospec advisory] " + decoded.HookSpecificOutput.PermissionDecisionReason,
		HookSpecificOutput: hookOutput{
			HookEventName:            decoded.HookSpecificOutput.HookEventName,
			PermissionDecision:       "allow",
			PermissionDecisionReason: decoded.HookSpecificOutput.PermissionDecisionReason,
		},
	}
	b, err := json.Marshal(degraded)
	if err != nil {
		return out
	}
	return b
}

func (h *preToolUseHandler) Run(stdin []byte) ([]byte, int) {
	var input preToolUseInput
	if err := json.Unmarshal(stdin, &input); err != nil {
		return makeDecision("ask",
			"The safety hook could not inspect this tool call: "+err.Error()), 0
	}
	out, code := h.run(&input, stdin)
	return applyPermissionMode(out, input.PermissionMode), code
}

func (h *preToolUseHandler) run(input *preToolUseInput, stdin []byte) ([]byte, int) {
	cmds := extractCommands(input)
	// Hard command denials precede all advisories, including secret reads.
	for _, cmd := range cmds {
		if action, reason := rules.Evaluate(cmd); action == "deny" {
			return makeDecision("deny", reason), 0
		}
		if reason := checkCommitAttribution(cmd, ""); reason != "" {
			return makeDecision("deny", reason), 0
		}
	}
	if writesCLIOwnedFile(input.ToolName, stdin) {
		return makeDecision("deny", cliOwnedReason), 0
	}

	if os.Getenv("DISABLE_AGENT_SHIELD") != "true" {
		var rawInput struct {
			ToolInput map[string]interface{} `json:"tool_input"`
		}
		_ = json.Unmarshal(stdin, &rawInput)

		paths := extractPaths(rawInput.ToolInput)
		for _, declared := range collectKeyedStrings(rawInput.ToolInput, declaredPathKeys) {
			if absolute, err := filepath.Abs(declared); err == nil {
				paths = append(paths, absolute)
			}
		}
		for _, cmd := range cmds {
			for _, file := range extractShellReadPaths(cmd) {
				if absolute, err := filepath.Abs(file); err == nil {
					paths = append(paths, absolute)
				}
			}
		}
		for _, filePath := range paths {
			if class := classifySensitiveFile(filePath); class != nil && class.action == "deny" {
				return makeDecision("deny", "Acceso denegado: El archivo es una clave privada o configuración sensible del sistema y no puede ser leído por el agente."), 0
			}
		}
		bodies := collectKeyedStrings(rawInput.ToolInput, contentKeys)
		// A redaction marker copied back over a file that keeps real secrets
		// would destroy them: a hard denial, never degraded.
		var targets []string
		for _, body := range bodies {
			if containsRedactionMarker(body) {
				targets = append(targets, collectKeyedStrings(rawInput.ToolInput, declaredPathKeys)...)
				break
			}
		}
		for _, cmd := range cmds {
			if containsRedactionMarker(cmd) {
				for _, operand := range shellOperandSeparatorRe.Split(cmd, -1) {
					if operand != "" {
						targets = append(targets, operand)
					}
				}
			}
		}
		for _, target := range targets {
			if absolute, err := filepath.Abs(target); err == nil && fileHoldsSecrets(absolute) {
				return makeDecision("deny", markerOverwriteReason), 0
			}
		}
		// With output redaction (the launcher's --output-redaction flag) the
		// model only ever sees the redacted result of a read tool, so a read
		// whose content the redaction fully covers needs no prompt. A shell
		// command keeps it: its output may leave the machine instead of
		// reaching the model.
		readsRedacted := os.Getenv("OSPEC_OUTPUT_REDACTION") == "1" &&
			os.Getenv("DISABLE_SECRET_REDACTION") != "true" &&
			len(cmds) == 0 &&
			isReadTool(input.ToolName)
		for _, filePath := range paths {
			if readsRedacted && readCoveredByRedaction(filePath) {
				continue
			}
			// Bloqueo/advertencia por nombre de archivo (secretscan.go)
			if class := classifySensitiveFile(filePath); class != nil {
				return makeDecision("ask", "Advertencia de seguridad: Se detectó un posible archivo de entorno o secreto. ¿Está seguro de permitir su lectura?"), 0
			}

			// Escaneo de contenido (tokens conocidos + credenciales genéricas)
			if matched, _ := scanFileForSecrets(filePath); matched {
				return makeDecision("ask", "Advertencia de seguridad: El contenido de este archivo parece contener credenciales o tokens. ¿Está seguro de permitir su lectura?"), 0
			}
		}
		for _, body := range bodies {
			if matched, _ := scanContentForSecrets(body); matched {
				return makeDecision("ask", "Advertencia de seguridad: El contenido de este archivo parece contener credenciales o tokens. ¿Está seguro de permitir su lectura?"), 0
			}
		}
	}

	if os.Getenv("DISABLE_TOKEN_ADVISOR") != "true" {
		var rawInput struct {
			ToolInput map[string]interface{} `json:"tool_input"`
		}
		_ = json.Unmarshal(stdin, &rawInput)

		paths := extractPaths(rawInput.ToolInput)
		currentTokens := 0
		for _, p := range paths {
			currentTokens += estimateTokens(p)
		}

		if currentTokens > 50000 {
			reason := fmt.Sprintf("El archivo solicitado excede el límite de tokens sugerido de 50,000 (%d tokens estimados). ¿Desea continuar con su lectura?", currentTokens)
			return makeDecision("ask", reason), 0
		}

		changeName := FindActiveChangeName()
		cumulativeTokens := getCumulativeTokens(changeName)
		if cumulativeTokens+currentTokens > 150000 {
			reason := fmt.Sprintf("El consumo acumulado de tokens de la sesión (%d tokens) excede el umbral crítico de 150,000 tokens. Se recomienda forzar una compactación antes de continuar.", cumulativeTokens+currentTokens)
			return makeDecision("ask", reason), 0
		}

		if currentTokens > 0 {
			recordTokens(changeName, currentTokens)
		}
	}

	// Step 5b — Git collaboration guard: fires only for git commit commands;
	// file-write tools no longer trigger it on their own.
	if os.Getenv("DISABLE_GIT_COLLABORATION_GUARD") != "true" {
		if isRiskyAction(cmds) {
			ctx5b, cancel5b := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel5b()
			gs := resolveGitState(ctx5b)
			onDefault := gs.DefaultBranch != nil && gs.CurrentBranch != nil &&
				*gs.DefaultBranch == *gs.CurrentBranch
			if onDefault || (gs.Dirty != nil && *gs.Dirty) {
				branchName := ""
				if gs.CurrentBranch != nil {
					branchName = *gs.CurrentBranch
				}
				advisory := composeAdvisory(onDefault, gs.Dirty, branchName)
				return makeDecision("ask", advisory), 0
			}
		}
	}

	// No commands present — no objection, so no decision (OSP-017).
	// Step 5b only ever fires for commands matching `git commit`, so tools with
	// no command payload (Edit, Write, etc.) always fall through to here.
	if len(cmds) == 0 {
		return noDecision, 0
	}

	// Step 6 — ASK rules (only if no deny or guard match).
	for _, cmd := range cmds {
		action, reason := rules.Evaluate(cmd)
		if action == "ask" {
			return makeDecision("ask", reason), 0
		}
	}

	return noDecision, 0
}
