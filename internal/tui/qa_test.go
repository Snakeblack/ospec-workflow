package tui_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui"
)

func TestRunQAChecks_NoMutationAndCoherent(t *testing.T) {
	root, err := system.FindSourceRoot(".")
	if err != nil {
		t.Fatalf("FindSourceRoot: %v", err)
	}
	modelsPath := filepath.Join(root, "models.yaml")
	before, err := os.ReadFile(modelsPath)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(modelsPath)
	if err != nil {
		t.Fatal(err)
	}
	mtime := info.ModTime()

	rep, err := tui.RunQAChecks(root)
	if err != nil {
		t.Fatalf("RunQAChecks: %v", err)
	}
	after, err := os.ReadFile(modelsPath)
	if err != nil {
		t.Fatal(err)
	}
	info2, _ := os.Stat(modelsPath)
	if string(before) != string(after) || !info2.ModTime().Equal(mtime) {
		t.Fatal("QA mutated the real models.yaml")
	}
	if rep.Failed > 0 {
		t.Fatalf("QA failed:\n%s", rep.String())
	}
	if !strings.Contains(rep.String(), "OK") {
		t.Fatalf("expected OK lines in report:\n%s", rep)
	}
}
