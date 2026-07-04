// Package yamllite provides lightweight inline YAML scalar and list extraction
// without a full YAML parser.  It ports extractFirstScalar, extractListSection,
// and formatNextAction from scripts/hooks/pre-compact.js.
package yamllite

import (
	"fmt"
	"regexp"
	"strings"
)

// ListItem is a single element extracted from a YAML list section.
// Either Value (string item) or Fields (object item) is non-zero.
type ListItem struct {
	Value  string
	Fields map[string]string
}

// ── private ───────────────────────────────────────────────────────────────────

var (
	keyValueRe      = regexp.MustCompile(`^([^:]+):(?:\s*(.*))?$`)
	inlineCommentRe = regexp.MustCompile(`\s+#.*$`)
	sddCommandRe    = regexp.MustCompile(`(?i)^\/?sdd-[a-z-]+$`)
	fieldRe         = regexp.MustCompile(`^([^:]+):\s*(.*)$`)
)

type yamlLine struct {
	indent  int
	content string
}

type stackEntry struct {
	indent int
	key    string
}

// parseYamlLines splits content into trimmed lines with indent levels,
// discarding blank lines and comment-only lines.
func parseYamlLines(content string) []yamlLine {
	var out []yamlLine
	for _, raw := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		raw = strings.TrimRight(raw, "\r")
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		indent := len(raw) - len(strings.TrimLeft(raw, " \t"))
		out = append(out, yamlLine{indent: indent, content: trimmed})
	}
	return out
}

// parseScalar strips surrounding matching quotes or inline trailing comments.
// Ports parseScalar from scripts/hooks/pre-compact.js.
func parseScalar(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	// Matching surrounding quotes (single or double).
	if n := len(trimmed); n >= 2 {
		q := trimmed[0]
		if (q == '"' || q == '\'') && trimmed[n-1] == q {
			return trimmed[1 : n-1]
		}
	}
	return strings.TrimSpace(inlineCommentRe.ReplaceAllString(trimmed, ""))
}

// extractScalarAtPath searches content for a scalar at the given YAML key path.
// Returns "" if not found.
func extractScalarAtPath(content string, expectedPath []string) string {
	var stack []stackEntry
	for _, line := range parseYamlLines(content) {
		if strings.HasPrefix(line.content, "- ") {
			continue
		}
		m := keyValueRe.FindStringSubmatch(line.content)
		if m == nil {
			continue
		}
		// Pop stack entries whose indent >= current line's indent.
		for len(stack) > 0 && stack[len(stack)-1].indent >= line.indent {
			stack = stack[:len(stack)-1]
		}
		key := strings.TrimSpace(m[1])
		value := ""
		if len(m) > 2 {
			value = m[2]
		}
		// Build the current path from stack keys + this key.
		if len(stack)+1 == len(expectedPath) {
			pathMatches := true
			for i, e := range stack {
				if e.key != expectedPath[i] {
					pathMatches = false
					break
				}
			}
			if pathMatches && key == expectedPath[len(expectedPath)-1] && value != "" {
				return parseScalar(value)
			}
		}
		if value == "" {
			stack = append(stack, stackEntry{indent: line.indent, key: key})
		}
	}
	return ""
}

// extractTopLevelSection collects all lines belonging to a named top-level
// YAML section (stops at the next non-empty top-level key).
func extractTopLevelSection(content, sectionName string) []string {
	var result []string
	collecting := false
	patternStr := fmt.Sprintf(`^%s:\s*(?:#.*)?$`, regexp.QuoteMeta(sectionName))
	sectionRe := regexp.MustCompile(patternStr)

	for _, raw := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		raw = strings.TrimRight(raw, "\r")
		trimmed := strings.TrimSpace(raw)
		indent := len(raw) - len(strings.TrimLeft(raw, " \t"))

		if !collecting {
			if indent == 0 && sectionRe.MatchString(trimmed) {
				collecting = true
			}
			continue
		}
		// Break on any non-empty top-level (indent 0) line.
		if trimmed != "" && indent <= 0 {
			break
		}
		result = append(result, raw)
	}
	return result
}

// ── exported ──────────────────────────────────────────────────────────────────

// ExtractFirstScalar returns the scalar value at the first matching YAML path.
// paths is tried in order; "" is returned if none match.
func ExtractFirstScalar(content string, paths [][]string) string {
	for _, path := range paths {
		if v := extractScalarAtPath(content, path); v != "" {
			return v
		}
	}
	return ""
}

// ExtractListSection extracts list items from the named top-level YAML section.
// Each item is either a plain string (ListItem.Value) or a mapping
// (ListItem.Fields).
func ExtractListSection(content, sectionName string) []ListItem {
	section := extractTopLevelSection(content, sectionName)
	var items []ListItem
	var current *ListItem
	itemIndent := -1

	for _, raw := range section {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		indent := len(raw) - len(strings.TrimLeft(raw, " \t"))

		if strings.HasPrefix(trimmed, "- ") {
			if itemIndent == -1 {
				itemIndent = indent
			}
			if indent != itemIndent {
				continue
			}
			item := strings.TrimSpace(trimmed[2:])
			if fm := fieldRe.FindStringSubmatch(item); fm != nil {
				li := ListItem{Fields: map[string]string{
					strings.TrimSpace(fm[1]): parseScalar(fm[2]),
				}}
				items = append(items, li)
				current = &items[len(items)-1]
			} else {
				items = append(items, ListItem{Value: parseScalar(item)})
				current = nil
			}
			continue
		}
		// Continuation field of the current object item.
		if current != nil && current.Fields != nil && itemIndent >= 0 && indent == itemIndent+2 {
			if fm := fieldRe.FindStringSubmatch(trimmed); fm != nil {
				current.Fields[strings.TrimSpace(fm[1])] = parseScalar(fm[2])
			}
		}
	}
	return items
}

const (
	phaseSummaryMaxLength      = 160
	phaseSummaryFieldIndent    = "    "
	phaseSummaryListItemIndent = "      "
)

// escapeYamlDoubleQuoted escapes a string for inclusion in a double-quoted
// YAML scalar, including control characters (`\n`, `\r`, `\t`, and other C0
// control bytes). Without this, an LLM-controlled value
// (executive_summary/key_decisions) containing a raw newline would become a
// real physical line break once written to state.yaml, forging arbitrary
// sibling keys (e.g. `status: done`) against a line-oriented reader that has
// no real YAML parser. Mirrors escapeYamlDoubleQuoted in
// scripts/lib/ospec-state.js. See BLOCKER remediation, strict-result-envelope
// 4R gate.
func escapeYamlDoubleQuoted(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	value = strings.ReplaceAll(value, "\n", `\n`)
	value = strings.ReplaceAll(value, "\r", `\r`)
	value = strings.ReplaceAll(value, "\t", `\t`)

	var b strings.Builder
	for _, r := range value {
		if r < 0x20 {
			fmt.Fprintf(&b, `\x%02x`, r)
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func toYamlDoubleQuoted(value string) string {
	runes := []rune(value)
	if len(runes) > phaseSummaryMaxLength {
		runes = runes[:phaseSummaryMaxLength]
	}
	return `"` + escapeYamlDoubleQuoted(string(runes)) + `"`
}

// hasNonEmptySummaryValue reports whether a `summary:` value line already
// carries non-empty content.
func hasNonEmptySummaryValue(line string) bool {
	trimmed := strings.TrimSpace(line)
	value := strings.TrimSpace(strings.TrimPrefix(trimmed, "summary:"))
	if n := len(value); n >= 2 {
		q := value[0]
		if (q == '"' || q == '\'') && value[n-1] == q {
			value = value[1 : n-1]
		}
	}
	return strings.TrimSpace(value) != ""
}

func lineIndent(line string) int {
	return len(line) - len(strings.TrimLeft(line, " \t"))
}

// findKeyDecisionsBlockEnd scans forward from a `key_decisions:` header line
// to find where its nested list items end (the first line with indent < 6, or
// phaseBlockEnd). Extracted out of SetPhaseSummary's scan loop to keep
// nesting shallow. Mirrors findKeyDecisionsBlockEnd in scripts/lib/ospec-state.js.
func findKeyDecisionsBlockEnd(lines []string, startIndex, phaseBlockEnd int) int {
	j := startIndex

	for j < phaseBlockEnd {
		nestedTrimmed := strings.TrimSpace(lines[j])
		if nestedTrimmed == "" {
			j++
			continue
		}
		if lineIndent(lines[j]) < 6 {
			break
		}
		j++
	}

	return j
}

// SetPhaseSummary is a surgical, line-oriented `state.yaml` writer for the
// Phase Summary Block (skills domain §"Phase Summary Block" / C5 SubagentStop
// persistence). Non-destructive fill-gap merge: writes
// `phases.{phase}.summary`/`key_decisions` ONLY when the current `summary` is
// empty or absent (ADR-002, strict-result-envelope change). Never touches an
// already non-empty summary. Mirrors scripts/lib/ospec-state.js#setPhaseSummary
// byte-for-byte in intent. Returns content unchanged when the phase is not
// found or the guard blocks the write.
func SetPhaseSummary(content, phase, summary string, keyDecisions []string) string {
	eol := "\n"
	if strings.Contains(content, "\r\n") {
		eol = "\r\n"
	}
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")

	// 1. Locate the top-level `phases:` block.
	phasesStart := -1
	phasesEnd := len(lines)

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if lineIndent(line) != 0 || trimmed == "" {
			continue
		}
		if trimmed == "phases:" {
			phasesStart = i
			continue
		}
		if phasesStart != -1 {
			phasesEnd = i
			break
		}
	}

	if phasesStart == -1 {
		return content
	}

	// 2. Locate the target phase's header line and its block end (next
	//    indent-2 sibling, or the end of the `phases:` block).
	phaseHeaderIndex := -1
	phaseBlockEnd := phasesEnd

	for i := phasesStart + 1; i < phasesEnd; i++ {
		trimmed := strings.TrimSpace(lines[i])
		if trimmed == "" {
			continue
		}
		if lineIndent(lines[i]) != 2 {
			continue
		}
		if phaseHeaderIndex != -1 {
			phaseBlockEnd = i
			break
		}
		if strings.HasSuffix(trimmed, ":") && trimmed[:len(trimmed)-1] == phase {
			phaseHeaderIndex = i
		}
	}

	if phaseHeaderIndex == -1 {
		return content
	}

	// 3. Within the phase block, find the existing `summary:`/`key_decisions:`
	//    lines (indent 4), if any.
	summaryLineIndex := -1
	keyDecisionsLineIndex := -1
	keyDecisionsBlockEnd := -1

	for i := phaseHeaderIndex + 1; i < phaseBlockEnd; i++ {
		trimmed := strings.TrimSpace(lines[i])
		if trimmed == "" {
			continue
		}
		if lineIndent(lines[i]) != 4 {
			continue
		}
		if strings.HasPrefix(trimmed, "summary:") {
			summaryLineIndex = i
		}
		if strings.HasPrefix(trimmed, "key_decisions:") {
			keyDecisionsLineIndex = i
			keyDecisionsBlockEnd = findKeyDecisionsBlockEnd(lines, i+1, phaseBlockEnd)
		}
	}

	// 4. Fill-gap guard: never overwrite an already non-empty summary.
	if summaryLineIndex != -1 && hasNonEmptySummaryValue(lines[summaryLineIndex]) {
		return content
	}

	summaryLine := phaseSummaryFieldIndent + "summary: " + toYamlDoubleQuoted(summary)

	var keyDecisionsLines []string
	if len(keyDecisions) > 0 {
		keyDecisionsLines = append(keyDecisionsLines, phaseSummaryFieldIndent+"key_decisions:")
		for _, decision := range keyDecisions {
			keyDecisionsLines = append(keyDecisionsLines, phaseSummaryListItemIndent+"- "+toYamlDoubleQuoted(decision))
		}
	}

	nextLines := append([]string(nil), lines...)

	if summaryLineIndex != -1 {
		nextLines[summaryLineIndex] = summaryLine
	} else {
		nextLines = spliceInsert(nextLines, phaseHeaderIndex+1, summaryLine)
		if keyDecisionsLineIndex != -1 {
			keyDecisionsLineIndex++
			keyDecisionsBlockEnd++
		}
	}

	if len(keyDecisionsLines) > 0 {
		if keyDecisionsLineIndex != -1 {
			nextLines = spliceReplace(nextLines, keyDecisionsLineIndex, keyDecisionsBlockEnd, keyDecisionsLines)
		} else {
			insertAt := phaseHeaderIndex + 2
			if summaryLineIndex != -1 {
				insertAt = summaryLineIndex + 1
			}
			nextLines = spliceInsertMany(nextLines, insertAt, keyDecisionsLines)
		}
	}

	return strings.Join(nextLines, eol)
}

func spliceInsert(lines []string, at int, value string) []string {
	return spliceInsertMany(lines, at, []string{value})
}

func spliceInsertMany(lines []string, at int, values []string) []string {
	result := make([]string, 0, len(lines)+len(values))
	result = append(result, lines[:at]...)
	result = append(result, values...)
	result = append(result, lines[at:]...)
	return result
}

func spliceReplace(lines []string, from, to int, values []string) []string {
	result := make([]string, 0, len(lines)-(to-from)+len(values))
	result = append(result, lines[:from]...)
	result = append(result, values...)
	result = append(result, lines[to:]...)
	return result
}

// FormatNextAction formats the next recommended action text for a change.
// Ports formatNextAction from scripts/hooks/pre-compact.js.
func FormatNextAction(value, changeName string) string {
	next := strings.TrimSpace(value)
	if next == "" {
		return fmt.Sprintf("Run `sdd-continue %s`.", changeName)
	}
	if strings.ToLower(next) == "none" {
		return "None."
	}
	if sddCommandRe.MatchString(next) {
		cmd := strings.TrimPrefix(next, "/")
		return fmt.Sprintf("Run `%s %s`.", cmd, changeName)
	}
	if strings.HasSuffix(next, ".") {
		return next
	}
	return next + "."
}
