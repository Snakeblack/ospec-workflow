// Tests for readFilePermissive (internal package, same pattern as pathsafe_posix_test.go).
// fu-pt3: covers the three distinct branches of readFilePermissive:
//   Row A — ENOENT   → (nil, nil): file absent, treated as absent.
//   Row B — EACCES   → (nil, nil): permission denied, treated as absent.
//                       POSIX-only; skipped on Windows (chmod 0000 is a no-op)
//                       and when root (root can read mode-0000 files).
//   Row C — directory → (nil, err) with err != nil: non-ENOENT/EACCES I/O error
//                       propagated to caller (EISDIR on POSIX,
//                       ERROR_INVALID_FUNCTION on Windows).
package hooks

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestReadFilePermissive(t *testing.T) {
	cases := []struct {
		name    string
		setup   func(t *testing.T) string
		wantNil bool // true → expect (nil, nil); false → expect (nil, non-nil error)
	}{
		{
			// Row A: deleted file → ENOENT → treated as absent.
			name: "ENOENT deleted file returns nil content no error",
			setup: func(t *testing.T) string {
				t.Helper()
				p := filepath.Join(t.TempDir(), "gone.txt")
				if err := os.WriteFile(p, []byte("x"), 0644); err != nil {
					t.Fatal(err)
				}
				if err := os.Remove(p); err != nil {
					t.Fatal(err)
				}
				return p
			},
			wantNil: true,
		},
		{
			// Row B: mode-0000 file → EACCES → treated as absent.
			// Skipped on Windows (chmod 0000 is effectively a no-op) and when root.
			name: "EACCES mode-0000 file returns nil content no error",
			setup: func(t *testing.T) string {
				t.Helper()
				if runtime.GOOS == "windows" {
					t.Skip("chmod 0000 is a no-op on Windows; EACCES path not exercisable this way")
				}
				if os.Getuid() == 0 {
					t.Skip("root can read mode-0000 files; EACCES path not exercisable as root")
				}
				p := filepath.Join(t.TempDir(), "noperm.txt")
				if err := os.WriteFile(p, []byte("secret"), 0644); err != nil {
					t.Fatal(err)
				}
				if err := os.Chmod(p, 0000); err != nil {
					t.Fatal(err)
				}
				return p
			},
			wantNil: true,
		},
		{
			// Row C: directory path → non-ENOENT/EACCES error (EISDIR on POSIX,
			// ERROR_INVALID_FUNCTION on Windows) → propagated to caller, NOT swallowed.
			// This is the fu-pt1 bug path: the error must NOT be returned as (nil, nil).
			name: "directory path propagates non-ENOENT non-EACCES error to caller",
			setup: func(t *testing.T) string {
				t.Helper()
				return t.TempDir()
			},
			wantNil: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := tc.setup(t)
			data, err := readFilePermissive(path)
			if tc.wantNil {
				if data != nil {
					t.Errorf("data: got %d bytes, want nil", len(data))
				}
				if err != nil {
					t.Errorf("err: got %v, want nil", err)
				}
			} else {
				// Row C: error must be propagated (non-nil), data must be nil.
				if err == nil {
					t.Error("err: got nil, want non-nil (error must be propagated for non-ENOENT/EACCES)")
				}
				if data != nil {
					t.Errorf("data: got %d bytes, want nil on error", len(data))
				}
			}
		})
	}
}
