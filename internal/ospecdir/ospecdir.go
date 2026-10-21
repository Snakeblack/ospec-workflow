// Package ospecdir creates directories under a workspace's .ospec/ so that
// the folder ignores itself, mirroring scripts/lib/ospec-gitignore.js.
package ospecdir

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

const (
	dirName    = ".ospec"
	selfIgnore = "*\n"
)

// MkdirAll creates dir like os.MkdirAll. When dir lies under a .ospec
// directory, it also writes .ospec/.gitignore with "*" if no entry of that
// name exists, so session data never shows in git status without touching
// the user's .gitignore. An existing .ospec/.gitignore, symlink or not, is
// left as it is.
func MkdirAll(dir string, perm os.FileMode) error {
	if err := os.MkdirAll(dir, perm); err != nil {
		return err
	}
	root := ospecDirOf(dir)
	if root == "" {
		return nil
	}
	ignore := filepath.Join(root, ".gitignore")
	// An exclusive create may follow a dangling symlink on Windows.
	if _, err := os.Lstat(ignore); err == nil {
		return nil
	}
	f, err := os.OpenFile(ignore, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if errors.Is(err, fs.ErrExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err := f.WriteString(selfIgnore); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

func ospecDirOf(dir string) string {
	current, err := filepath.Abs(dir)
	if err != nil {
		return ""
	}
	for {
		if filepath.Base(current) == dirName {
			return current
		}
		parent := filepath.Dir(current)
		if parent == current {
			return ""
		}
		current = parent
	}
}
