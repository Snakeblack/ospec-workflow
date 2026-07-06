// Package yamllite_test verifies ExtractFirstScalar, ExtractListSection, and
// FormatNextAction with cases derived from scripts/hooks/pre-compact.test.js.
package yamllite_test

import (
	"strings"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/yamllite"
)

func TestExtractFirstScalar(t *testing.T) {
	tests := []struct {
		name    string
		content string
		paths   [][]string
		want    string
	}{
		{
			name:    "nested change.name",
			content: "change:\n  name: add-export-csv\n  status: active\n",
			paths:   [][]string{{"change", "name"}},
			want:    "add-export-csv",
		},
		{
			name:    "nested change.current_phase",
			content: "change:\n  name: foo\n  current_phase: apply\n",
			paths:   [][]string{{"change", "current_phase"}, {"current_phase"}, {"phase"}},
			want:    "apply",
		},
		{
			name:    "top-level current_phase fallback",
			content: "status: active\ncurrent_phase: design\n",
			paths:   [][]string{{"change", "current_phase"}, {"current_phase"}, {"phase"}},
			want:    "design",
		},
		{
			name:    "top-level phase fallback",
			content: "status: active\nphase: tasks\n",
			paths:   [][]string{{"change", "current_phase"}, {"current_phase"}, {"phase"}},
			want:    "tasks",
		},
		{
			name:    "runtime.last_completed_artifact",
			content: "runtime:\n  last_completed_artifact: openspec/changes/foo/apply-progress.md\n",
			paths:   [][]string{{"runtime", "last_completed_artifact"}, {"last_completed_artifact"}},
			want:    "openspec/changes/foo/apply-progress.md",
		},
		{
			name:    "next_recommended top-level",
			content: "status: active\nnext_recommended: sdd-verify\n",
			paths:   [][]string{{"next_recommended"}},
			want:    "sdd-verify",
		},
		{
			name:    "top-level status",
			content: "status: applying\n",
			paths:   [][]string{{"change", "status"}, {"status"}},
			want:    "applying",
		},
		{
			name:    "change.status wins over top-level",
			content: "change:\n  status: blocked\nstatus: applying\n",
			paths:   [][]string{{"change", "status"}, {"status"}},
			want:    "blocked",
		},
		{
			name:    "missing path returns empty",
			content: "status: active\n",
			paths:   [][]string{{"change", "name"}},
			want:    "",
		},
		{
			name:    "empty content returns empty",
			content: "",
			paths:   [][]string{{"status"}},
			want:    "",
		},
		{
			name:    "quoted scalar value is unquoted",
			content: "status: \"applying\"\n",
			paths:   [][]string{{"status"}},
			want:    "applying",
		},
		{
			name:    "inline comment stripped",
			content: "status: applying # workflow state\n",
			paths:   [][]string{{"status"}},
			want:    "applying",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := yamllite.ExtractFirstScalar(tc.content, tc.paths)
			if got != tc.want {
				t.Errorf("ExtractFirstScalar: got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestExtractListSection(t *testing.T) {
	tests := []struct {
		name        string
		content     string
		sectionName string
		wantLen     int
		check       func(t *testing.T, items []yamllite.ListItem)
	}{
		{
			name: "approvals with gate and decision",
			content: "approvals:\n" +
				"  - id: delivery-001\n" +
				"    gate: delivery-strategy\n" +
				"    decision: ask-on-risk\n" +
				"  - gate: review-workload\n" +
				"    decision: chained-prs\n",
			sectionName: "approvals",
			wantLen:     2,
			check: func(t *testing.T, items []yamllite.ListItem) {
				t.Helper()
				if items[0].Fields["gate"] != "delivery-strategy" {
					t.Errorf("first item gate: got %q, want %q", items[0].Fields["gate"], "delivery-strategy")
				}
				if items[0].Fields["decision"] != "ask-on-risk" {
					t.Errorf("first item decision: got %q, want %q", items[0].Fields["decision"], "ask-on-risk")
				}
				if items[1].Fields["gate"] != "review-workload" {
					t.Errorf("second item gate: got %q", items[1].Fields["gate"])
				}
			},
		},
		{
			name: "blocking_questions with id and question",
			content: "blocking_questions:\n" +
				"  - id: deployment-target\n" +
				"    question: Choose the deployment target\n",
			sectionName: "blocking_questions",
			wantLen:     1,
			check: func(t *testing.T, items []yamllite.ListItem) {
				t.Helper()
				if items[0].Fields["question"] != "Choose the deployment target" {
					t.Errorf("question: got %q", items[0].Fields["question"])
				}
			},
		},
		{
			name: "string list items",
			content: "blockers:\n" +
				"  - need more info\n" +
				"  - design incomplete\n",
			sectionName: "blockers",
			wantLen:     2,
			check: func(t *testing.T, items []yamllite.ListItem) {
				t.Helper()
				if items[0].Value != "need more info" {
					t.Errorf("item[0].Value: got %q", items[0].Value)
				}
				if items[1].Value != "design incomplete" {
					t.Errorf("item[1].Value: got %q", items[1].Value)
				}
			},
		},
		{
			name:        "section not present returns empty slice",
			content:     "status: active\n",
			sectionName: "approvals",
			wantLen:     0,
			check:       nil,
		},
		{
			name:        "other sections do not bleed into results",
			content:     "approvals:\n  - gate: a\n    decision: d\nstatus: active\n",
			sectionName: "approvals",
			wantLen:     1,
			check:       nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := yamllite.ExtractListSection(tc.content, tc.sectionName)
			if len(got) != tc.wantLen {
				t.Errorf("ExtractListSection: got %d items, want %d; items=%v", len(got), tc.wantLen, got)
				return
			}
			if tc.check != nil {
				tc.check(t, got)
			}
		})
	}
}

func TestFormatNextAction(t *testing.T) {
	tests := []struct {
		name       string
		value      string
		changeName string
		want       string
	}{
		{
			name:       "empty value uses sdd-continue",
			value:      "",
			changeName: "my-change",
			want:       "Run `sdd-continue my-change`.",
		},
		{
			name:       "none returns None.",
			value:      "none",
			changeName: "my-change",
			want:       "None.",
		},
		{
			name:       "None (capital) returns None.",
			value:      "None",
			changeName: "my-change",
			want:       "None.",
		},
		{
			name:       "sdd-phase formats command",
			value:      "sdd-verify",
			changeName: "my-change",
			want:       "Run `sdd-verify my-change`.",
		},
		{
			name:       "leading slash stripped",
			value:      "/sdd-design",
			changeName: "my-change",
			want:       "Run `sdd-design my-change`.",
		},
		{
			name:       "sdd-apply",
			value:      "sdd-apply",
			changeName: "add-export-csv",
			want:       "Run `sdd-apply add-export-csv`.",
		},
		{
			name:       "sdd-continue",
			value:      "sdd-continue",
			changeName: "my-change",
			want:       "Run `sdd-continue my-change`.",
		},
		{
			name:       "free text already ending in period",
			value:      "Do something specific.",
			changeName: "any",
			want:       "Do something specific.",
		},
		{
			name:       "free text without period gets one",
			value:      "Start a new session when ready",
			changeName: "any",
			want:       "Start a new session when ready.",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := yamllite.FormatNextAction(tc.value, tc.changeName)
			if got != tc.want {
				t.Errorf("FormatNextAction(%q, %q) = %q, want %q", tc.value, tc.changeName, got, tc.want)
			}
		})
	}
}

// ── SetPhaseSummary ───────────────────────────────────────────────────────────
// Cases mirror scripts/lib/ospec-state.test.js#setPhaseSummary in intent.

const stateWithEmptySummary = "change: strict-result-envelope\n" +
	"status: applying\n" +
	"phases:\n" +
	"  design:\n" +
	"    status: done\n" +
	"    artifact: \"openspec/changes/strict-result-envelope/design.md\"\n" +
	"    summary: \"\"\n" +
	"  tasks:\n" +
	"    status: pending\n"

const stateWithoutSummaryKey = "change: strict-result-envelope\n" +
	"status: applying\n" +
	"phases:\n" +
	"  design:\n" +
	"    status: done\n" +
	"    artifact: \"openspec/changes/strict-result-envelope/design.md\"\n" +
	"  tasks:\n" +
	"    status: pending\n"

const stateWithNonEmptySummary = "change: strict-result-envelope\n" +
	"status: applying\n" +
	"phases:\n" +
	"  design:\n" +
	"    status: done\n" +
	"    artifact: \"openspec/changes/strict-result-envelope/design.md\"\n" +
	"    summary: \"Already written by the agent itself.\"\n" +
	"  tasks:\n" +
	"    status: pending\n"

func TestSetPhaseSummary_FillsEmptyGapAndAppendsKeyDecisions(t *testing.T) {
	updated := yamllite.SetPhaseSummary(stateWithEmptySummary, "design", "JWT stateless con refresh rotativo.", []string{"RS256 sobre HS256"})

	if !strings.Contains(updated, `summary: "JWT stateless con refresh rotativo."`) {
		t.Errorf("expected summary to be filled, got:\n%s", updated)
	}
	if !strings.Contains(updated, "key_decisions:\n") || !strings.Contains(updated, `- "RS256 sobre HS256"`) {
		t.Errorf("expected key_decisions to be rendered, got:\n%s", updated)
	}
}

func TestSetPhaseSummary_FillsGapWhenSummaryKeyAbsent(t *testing.T) {
	updated := yamllite.SetPhaseSummary(stateWithoutSummaryKey, "design", "Filled by the hook safety net.", nil)

	if !strings.Contains(updated, `summary: "Filled by the hook safety net."`) {
		t.Errorf("expected summary to be inserted, got:\n%s", updated)
	}
}

func TestSetPhaseSummary_NoOpWhenSummaryAlreadyNonEmpty(t *testing.T) {
	updated := yamllite.SetPhaseSummary(stateWithNonEmptySummary, "design", "This must never appear.", []string{"Should be ignored"})

	if updated != stateWithNonEmptySummary {
		t.Errorf("expected no-op, got:\n%s", updated)
	}
	if strings.Contains(updated, "This must never appear") {
		t.Error("must not overwrite an already non-empty summary")
	}
}

func TestSetPhaseSummary_EscapesQuotesAndBackslashes(t *testing.T) {
	updated := yamllite.SetPhaseSummary(stateWithEmptySummary, "design", `Uses a "quoted" value and a C:\path\to\file.`, nil)

	if !strings.Contains(updated, `summary: "Uses a \"quoted\" value and a C:\\path\\to\\file."`) {
		t.Errorf("expected escaped summary, got:\n%s", updated)
	}
}

func TestSetPhaseSummary_TruncatesTo160Chars(t *testing.T) {
	longSummary := strings.Repeat("x", 200)

	updated := yamllite.SetPhaseSummary(stateWithEmptySummary, "design", longSummary, nil)

	idx := strings.Index(updated, `summary: "`)
	if idx == -1 {
		t.Fatal("expected a summary line to be present")
	}
	rest := updated[idx+len(`summary: "`):]
	end := strings.Index(rest, `"`)
	if end != 160 {
		t.Errorf("expected truncated summary of 160 chars, got %d", end)
	}
}

func TestSetPhaseSummary_RendersMultipleKeyDecisionsAsList(t *testing.T) {
	updated := yamllite.SetPhaseSummary(stateWithEmptySummary, "design", "Multiple decisions.", []string{"First decision", "Second decision"})

	lines := strings.Split(updated, "\n")
	idx := -1
	for i, line := range lines {
		if strings.TrimSpace(line) == "key_decisions:" {
			idx = i
			break
		}
	}
	if idx == -1 {
		t.Fatal("expected a key_decisions: line")
	}
	if strings.TrimSpace(lines[idx+1]) != `- "First decision"` {
		t.Errorf("got %q", lines[idx+1])
	}
	if strings.TrimSpace(lines[idx+2]) != `- "Second decision"` {
		t.Errorf("got %q", lines[idx+2])
	}
}

func TestSetPhaseSummary_NoOpWhenPhaseDoesNotExist(t *testing.T) {
	updated := yamllite.SetPhaseSummary(stateWithEmptySummary, "verify", "Should not be written anywhere.", nil)

	if updated != stateWithEmptySummary {
		t.Errorf("expected no-op for missing phase, got:\n%s", updated)
	}
}

func TestSetPhaseSummary_OmitsKeyDecisionsWhenEmpty(t *testing.T) {
	updated := yamllite.SetPhaseSummary(stateWithEmptySummary, "design", "No decisions this batch.", []string{})

	if strings.Contains(updated, "key_decisions:") {
		t.Error("expected key_decisions: to be omitted for an empty list")
	}
}

func TestSetPhaseSummary_NeutralizesEmbeddedNewlineInSummary(t *testing.T) {
	updated := yamllite.SetPhaseSummary(stateWithEmptySummary, "design", "ok\"\nstatus: done", nil)

	wantLines := strings.Count(stateWithEmptySummary, "\n")
	gotLines := strings.Count(updated, "\n")
	if gotLines != wantLines {
		t.Errorf("expected an embedded raw newline to not add a new physical line: want %d lines, got %d\n%s", wantLines, gotLines, updated)
	}
	if !strings.Contains(updated, `summary: "ok\"\nstatus: done"`) {
		t.Errorf("expected the newline to be escaped as a literal \\n sequence, got:\n%s", updated)
	}
}

func TestSetPhaseSummary_NeutralizesEmbeddedCRLFInKeyDecisions(t *testing.T) {
	updated := yamllite.SetPhaseSummary(stateWithEmptySummary, "design", "Multiple decisions.", []string{"a\r\nphases:"})

	phasesLines := 0
	for _, line := range strings.Split(updated, "\n") {
		if strings.TrimSpace(line) == "phases:" {
			phasesLines++
		}
	}
	if phasesLines != 1 {
		t.Errorf("expected an embedded CRLF to not fabricate a second top-level phases: line, got %d occurrences:\n%s", phasesLines, updated)
	}
	if !strings.Contains(updated, `- "a\r\nphases:"`) {
		t.Errorf("expected the CRLF to be escaped as literal \\r\\n sequences, got:\n%s", updated)
	}
}

func TestSetPhaseSummary_TruncatesByCodePointNotUTF16Unit(t *testing.T) {
	emoji := "\U0001F600" // 😀 — one code point, two UTF-16 code units in JS
	summary := strings.Repeat(emoji, 159) + "AB"

	updated := yamllite.SetPhaseSummary(stateWithEmptySummary, "design", summary, nil)

	idx := strings.Index(updated, `summary: "`)
	if idx == -1 {
		t.Fatal("expected a summary line to be present")
	}
	rest := updated[idx+len(`summary: "`):]
	end := strings.Index(rest, `"`)
	if end == -1 {
		t.Fatal("expected a closing quote")
	}
	truncated := rest[:end]
	runeCount := len([]rune(truncated))
	if runeCount != 160 {
		t.Errorf("expected 160 code points, got %d", runeCount)
	}
	runes := []rune(truncated)
	if runes[159] != 'A' {
		t.Errorf("expected the 160th code point to be 'A', got %q", runes[159])
	}
}
