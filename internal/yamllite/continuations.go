package yamllite

import (
	"fmt"
	"regexp"
	"strings"
)

// REQ-lifecycle-kernel-032, mirrored from scripts/lib/yaml-lite.js: a block
// scalar (| or >, with chomping and indentation indicators) and a plain or
// quoted scalar that starts on its key's line and continues on more indented
// lines are valid YAML the projector never edits inside. The scan marks those
// continuation lines so validation, parsing and projection treat them as
// opaque. A value that starts on the next line is not supported, and a quoted
// scalar that never closes, or whose continuation is not more indented than
// its key, is malformed. A tag or an anchor before the value does not change
// its kind, and a flow collection that continues on more indented lines is
// opaque until its brackets close; one that never closes is malformed too. A
// value on the line after its key, which the projector refuses, is opaque as
// well, with the key's line as its owner. The scan reads a key as YAML does:
// quoted, or plain up to the first colon that a space, a tab or the end of the
// line follows. Its patterns name the space and the tab, as the Node scan does
// (REQ-lifecycle-kernel-033). A line is blank, and a line or a value is
// trimmed, only by the space and the tab of YAML and the CR of a line break,
// as in Node: U+0085, U+FEFF and any other Unicode space are text
// (REQ-lifecycle-kernel-035).
var (
	BlockScalarHeader = regexp.MustCompile(`^[|>](?:[1-9][+-]?|[+-][1-9]?)?(?:[ \t]+#.*)?$`)
	trailingComment   = regexp.MustCompile(`^[ \t]+#`)
	nodeProperties    = regexp.MustCompile(`^(?:(?:![^ \t]*|&[^ \t]+)(?:[ \t]+|$))+`)
	entryLine         = regexp.MustCompile(`^(?:(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*')[ \t]*|[^ \t#"'](?:[^:]|:[^ \t])*?):(?:[ \t]+(.*))?$`)
)

type scalarOwner struct {
	indent int
	kind   byte // 'b' block, 'p' plain, 'f' flow collection, '"' or '\'' an open quoted scalar
	depth  int  // bracket depth of an open flow collection
}

// TrimSpace returns s without the spaces, tabs and CRs at its ends.
func TrimSpace(s string) string {
	return strings.Trim(s, " \t\r")
}

// SpaceIndent is the number of leading spaces of line.
func SpaceIndent(line string) int {
	return len(line) - len(strings.TrimLeft(line, " "))
}

// quoteClose returns the index just past the quote that closes a scalar
// opened with quote, scanning from from; -1 when it does not close in text.
func quoteClose(text string, quote byte, from int) int {
	for i := from; i < len(text); i++ {
		if quote == '"' && text[i] == '\\' {
			i++
		} else if text[i] == quote {
			if quote == '\'' && i+1 < len(text) && text[i+1] == '\'' {
				i++
			} else {
				return i + 1
			}
		}
	}
	return -1
}

// OpensQuotedScalar reports whether value opens a quoted scalar it does not close.
func OpensQuotedScalar(value string) bool {
	v := TrimSpace(value)
	return v != "" && (v[0] == '"' || v[0] == '\'') && quoteClose(v, v[0], 1) == -1
}

// withoutProperties returns value without the tags and anchors before it; a
// value that is only those is empty, so what follows on the next line is its
// value.
func withoutProperties(value string) string {
	return nodeProperties.ReplaceAllString(value, "")
}

// flowClose returns the bracket depth of a flow collection after text,
// starting at depth, and the index just past the bracket that closes it (-1
// when it stays open). Quotes open only at the start of a token, so don't
// stays plain.
func flowClose(text string, depth int) (int, int) {
	var quote byte
	for i := 0; i < len(text); i++ {
		char := text[i]
		switch {
		case quote != 0:
			if quote == '"' && char == '\\' {
				i++
			} else if char == quote {
				quote = 0
			}
		case (char == '"' || char == '\'') && (i == 0 || strings.IndexByte(" \t[{,:", text[i-1]) >= 0):
			quote = char
		case char == '#' && (i == 0 || text[i-1] == ' ' || text[i-1] == '\t'):
			return depth, -1
		case char == '[' || char == '{':
			depth++
		case char == ']' || char == '}':
			depth--
			if depth == 0 {
				return depth, i + 1
			}
		}
	}
	return depth, -1
}

// lineScalarValue returns the scalar a mapping or sequence line holds.
func lineScalarValue(trimmed string) (string, bool) {
	if strings.HasPrefix(trimmed, "- ") {
		item := TrimSpace(trimmed[2:])
		for strings.HasPrefix(item, "- ") {
			item = TrimSpace(item[2:])
		}
		if item == "-" {
			item = ""
		}
		item = withoutProperties(item)
		if item != "" && (item[0] == '[' || item[0] == '{') {
			return item, true
		}
		if entry := entryLine.FindStringSubmatch(item); entry != nil {
			return entry[1], true
		}
		return item, true
	}
	// A line that opens a flow collection is a value, never a key.
	if v := withoutProperties(trimmed); v != "" && (v[0] == '[' || v[0] == '{') {
		return "", false
	}
	if entry := entryLine.FindStringSubmatch(trimmed); entry != nil {
		return entry[1], true
	}
	return "", false
}

func newScalarOwner(value string, indent int) *scalarOwner {
	v := withoutProperties(TrimSpace(value))
	if v == "" || v[0] == '#' {
		return nil
	}
	if BlockScalarHeader.MatchString(v) {
		return &scalarOwner{indent: indent, kind: 'b'}
	}
	if v[0] == '[' || v[0] == '{' {
		if depth, end := flowClose(v, 0); end == -1 {
			return &scalarOwner{indent: indent, kind: 'f', depth: depth}
		}
		return nil
	}
	if v[0] == '"' || v[0] == '\'' {
		if quoteClose(v, v[0], 1) == -1 {
			return &scalarOwner{indent: indent, kind: v[0]}
		}
		return nil
	}
	return &scalarOwner{indent: indent, kind: 'p'}
}

// ScanScalarContinuations marks the continuation lines of every scalar, for
// the projector, which keeps them byte for byte and still refuses a value on
// the line after its key. The error names a quoted scalar or flow collection
// that never closes; the lines before it are marked.
func ScanScalarContinuations(lines []string) ([]bool, error) {
	continuation, _, err := scanLines(lines)
	return continuation, err
}

// ScanScalarLines returns the continuation lines of ScanScalarContinuations
// and the lines the scan reads as no key (a value on the line after its key,
// or a colon a space or a tab does not follow), which the projector refuses
// (REQ-lifecycle-kernel-035).
func ScanScalarLines(lines []string) ([]bool, []bool, error) {
	return scanLines(lines)
}

// scanLines is the scan behind both exports: continuation marks the lines a
// scalar or a flow collection continues on, values the lines that hold a value
// on the line after its key.
func scanLines(lines []string) ([]bool, []bool, error) {
	continuation := make([]bool, len(lines))
	values := make([]bool, len(lines))
	var owner *scalarOwner
	var parents []int
	for i, raw := range lines {
		trimmed := TrimSpace(raw)
		indent := SpaceIndent(raw)
		switch {
		case owner != nil && owner.kind == 'b':
			if trimmed == "" || indent > owner.indent {
				continuation[i] = true
				continue
			}
			owner = nil
		case owner != nil && owner.kind == 'f':
			continuation[i] = true
			if trimmed == "" {
				continue
			}
			if indent <= owner.indent {
				return continuation, values, fmt.Errorf("state YAML line %d: flow collection never closes", i+1)
			}
			if depth, end := flowClose(trimmed, owner.depth); end == -1 {
				owner.depth = depth
			} else {
				owner = nil
			}
			continue
		case owner != nil && owner.kind != 'p':
			continuation[i] = true
			if trimmed == "" {
				continue
			}
			if indent <= owner.indent {
				return continuation, values, fmt.Errorf("state YAML line %d: quoted scalar never closes", i+1)
			}
			if end := quoteClose(trimmed, owner.kind, 0); end != -1 {
				if rest := trimmed[end:]; TrimSpace(rest) != "" && !trailingComment.MatchString(rest) {
					return continuation, values, fmt.Errorf("state YAML line %d: text after a closed quoted scalar", i+1)
				}
				owner = nil
			}
			continue
		case owner != nil:
			if trimmed == "" {
				continue
			}
			entry := strings.HasPrefix(trimmed, "- ") || trimmed == "-" || entryLine.MatchString(trimmed)
			if indent > owner.indent && !entry && !strings.HasPrefix(trimmed, "#") {
				continuation[i] = true
				continue
			}
			owner = nil
		}
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		for len(parents) > 0 && parents[len(parents)-1] >= indent {
			parents = parents[:len(parents)-1]
		}
		parent := -1
		if len(parents) > 0 {
			parent = parents[len(parents)-1]
		}
		parents = append(parents, indent)
		if value, ok := lineScalarValue(trimmed); ok {
			owner = newScalarOwner(value, indent)
		} else {
			values[i] = true
			owner = newScalarOwner(trimmed, parent)
		}
	}
	if owner != nil && owner.kind == 'f' {
		return continuation, values, fmt.Errorf("state YAML: flow collection never closes")
	}
	if owner != nil && owner.kind != 'b' && owner.kind != 'p' {
		return continuation, values, fmt.Errorf("state YAML: quoted scalar never closes")
	}
	return continuation, values, nil
}

// OpaqueScalarLines splits content into lines with every line of a value left
// blank (the continuation lines of a scalar or flow collection and a value on
// the line after its key), so a line reader that skips blank lines never reads
// a key inside a value (REQ-lifecycle-kernel-033). The error names a quoted
// scalar or flow collection that never closes; the lines before it are blanked
// and the rest are kept as they are.
func OpaqueScalarLines(content string) ([]string, error) {
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	continuation, values, err := scanLines(lines)
	for i := range lines {
		if continuation[i] || values[i] {
			lines[i] = ""
		}
	}
	return lines, err
}
