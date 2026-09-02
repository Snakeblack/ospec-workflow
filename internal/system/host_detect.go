package system

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// HostProbe allows tests to inject filesystem and PATH lookups for client detection.
type HostProbe struct {
	Home     string
	Env      map[string]string
	Platform string
	LookPath func(string) (string, error)
	Stat     func(string) error
}

func (p HostProbe) env(key string) string {
	if p.Env != nil {
		if v, ok := p.Env[key]; ok {
			return v
		}
	}
	return os.Getenv(key)
}

func (p HostProbe) home() string {
	if p.Home != "" {
		return p.Home
	}
	h, _ := os.UserHomeDir()
	return h
}

func (p HostProbe) platform() string {
	if p.Platform != "" {
		return p.Platform
	}
	return runtime.GOOS
}

func (p HostProbe) exists(path string) bool {
	if path == "" {
		return false
	}
	if p.Stat != nil {
		return p.Stat(path) == nil
	}
	_, err := os.Stat(path)
	return err == nil
}

func (p HostProbe) lookPath(bin string) bool {
	if p.LookPath != nil {
		_, err := p.LookPath(bin)
		return err == nil
	}
	_, err := exec.LookPath(bin)
	return err == nil
}

// DetectHostClients reports which AI clients appear installed on this machine.
// This is independent of whether the current git repo contains plugin source files.
func DetectHostClients() map[string]bool {
	return DetectHostClientsWith(HostProbe{})
}

// DetectHostClientsWith reports host clients using an injectable probe.
func DetectHostClientsWith(p HostProbe) map[string]bool {
	found := map[string]bool{}
	home := p.home()
	platform := p.platform()

	if vscodeUserDirExists(p, home, platform) {
		found["vscode"] = true
	}
	if cursorDirExists(p, home, platform) {
		found["cursor"] = true
	}
	if p.lookPath("claude") || p.lookPath("claude.exe") || p.lookPath("claude.cmd") {
		found["claude"] = true
	}
	if p.exists(filepath.Join(home, ".gemini")) {
		found["antigravity"] = true
	}
	if p.exists(filepath.Join(home, ".codex")) || p.lookPath("codex") || p.lookPath("codex.exe") {
		found["codex"] = true
	}
	if p.exists(filepath.Join(home, ".config", "opencode")) ||
		p.exists(filepath.Join(home, ".opencode")) ||
		p.lookPath("opencode") || p.lookPath("opencode.exe") {
		found["opencode"] = true
	}
	if p.exists(filepath.Join(home, ".copilot")) ||
		p.lookPath("copilot") || p.lookPath("copilot.exe") || p.lookPath("copilot.cmd") {
		found["github-copilot"] = true
	}
	return found
}

func vscodeUserDirExists(p HostProbe, home, platform string) bool {
	for _, loc := range vscodeUserDirs(p, home, platform) {
		if p.exists(loc) {
			return true
		}
	}
	return false
}

func vscodeUserDirs(p HostProbe, home, platform string) []string {
	var dirs []string
	switch platform {
	case "win32", "windows":
		if appData := p.env("APPDATA"); appData != "" {
			dirs = append(dirs,
				filepath.Join(appData, "Code", "User"),
				filepath.Join(appData, "Code - Insiders", "User"),
			)
		}
	case "darwin":
		dirs = append(dirs,
			filepath.Join(home, "Library", "Application Support", "Code", "User"),
			filepath.Join(home, "Library", "Application Support", "Code - Insiders", "User"),
		)
	default:
		dirs = append(dirs,
			filepath.Join(home, ".config", "Code", "User"),
			filepath.Join(home, ".config", "Code - Insiders", "User"),
		)
	}
	return dirs
}

func cursorDirExists(p HostProbe, home, platform string) bool {
	candidates := []string{filepath.Join(home, ".cursor")}
	if platform == "windows" || platform == "win32" {
		if appData := p.env("APPDATA"); appData != "" {
			candidates = append(candidates, filepath.Join(appData, "Cursor"))
		}
	}
	for _, c := range candidates {
		if p.exists(c) {
			return true
		}
	}
	return false
}
