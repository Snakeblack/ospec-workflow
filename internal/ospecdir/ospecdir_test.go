package ospecdir_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/ospecdir"
)

func TestMkdirAllMakesOspecIgnoreItself(t *testing.T) {
	root := t.TempDir()
	ignore := filepath.Join(root, ".ospec", ".gitignore")
	if err := ospecdir.MkdirAll(filepath.Join(root, ".ospec", "session", "change"), 0755); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(ignore); err != nil || string(got) != "*\n" {
		t.Fatalf(".ospec/.gitignore = %q, %v; want \"*\\n\"", got, err)
	}

	if err := os.WriteFile(ignore, []byte("session/\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := ospecdir.MkdirAll(filepath.Join(root, ".ospec", "cache"), 0755); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(ignore); string(got) != "session/\n" {
		t.Fatalf("an existing .ospec/.gitignore was rewritten: %q", got)
	}
	if _, err := os.Stat(filepath.Join(root, ".gitignore")); !os.IsNotExist(err) {
		t.Fatalf("the workspace .gitignore must stay untouched: %v", err)
	}
}

func TestMkdirAllLeavesSymlinksAndOtherDirectoriesAlone(t *testing.T) {
	root := t.TempDir()
	missing := filepath.Join(t.TempDir(), "missing-target")
	if err := os.Mkdir(filepath.Join(root, ".ospec"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(missing, filepath.Join(root, ".ospec", ".gitignore")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if err := ospecdir.MkdirAll(filepath.Join(root, ".ospec", "session"), 0755); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(missing); !os.IsNotExist(err) {
		t.Fatalf("the symlink target was created: %v", err)
	}

	plain := filepath.Join(t.TempDir(), "openspec", "changes")
	if err := ospecdir.MkdirAll(plain, 0755); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(plain), ".gitignore")); !os.IsNotExist(err) {
		t.Fatalf("a directory outside .ospec/ got a .gitignore: %v", err)
	}
}
