package system

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const defaultTargetTimeout = 4 * time.Minute

// InstallEvent is a progress signal emitted while installing a harness target.
type InstallEvent struct {
	Kind    string // step | log | error
	Target  string
	Message string
}

// HarnessInstallRequest describes a TUI-driven harness installation.
type HarnessInstallRequest struct {
	SourceRoot     string
	Targets        []string
	Timeout        time.Duration
	LookPath       func(string) (string, error)
	Runner         ScriptRunner
	RegisterVSCode func(pluginPath string) (int, error)
	// DryRun logs the same checks as a real install but does not spawn Node,
	// write files, or register VS Code settings.
	DryRun bool
}

// ScriptRunner executes one installer script. Tests inject fakes.
type ScriptRunner func(ctx context.Context, sourceRoot, scriptPath string, args []string, emit func(string)) error

var targetInstallScripts = map[string]string{
	"claude":         "scripts/configure/install-claude.js",
	"vscode":         "scripts/configure/install-vscode.js",
	"github-copilot": "scripts/configure/install-global-copilot.js",
	"cursor":         "scripts/configure/install-cursor.js",
	"codex":          "scripts/configure/install-codex.js",
	"antigravity":    "scripts/configure/install-antigravity.js",
	"opencode":       "scripts/configure/install-global-opencode.js",
}

// FindSourceRoot walks up from start looking for the ospec-workflow source tree.
func FindSourceRoot(start string) (string, error) {
	dir, err := filepath.Abs(start)
	if err != nil {
		return "", err
	}
	for {
		marker := filepath.Join(dir, "scripts", "configure", "install-vscode.js")
		if _, err := os.Stat(marker); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("no se encontró el repositorio ospec-workflow (falta scripts/configure)")
		}
		dir = parent
	}
}

// ResolveVSCodePluginPath prefers dist/vscode when the generator already ran.
func ResolveVSCodePluginPath(sourceRoot string) string {
	dist := filepath.Join(sourceRoot, "dist", "vscode")
	if _, err := os.Stat(filepath.Join(dist, ".plugin.json")); err == nil {
		return dist
	}
	if _, err := os.Stat(dist); err == nil {
		return dist
	}
	return sourceRoot
}

// RunHarnessInstall applies the real per-target installers with streamed progress.
func RunHarnessInstall(ctx context.Context, req HarnessInstallRequest, emit func(InstallEvent)) error {
	if emit == nil {
		emit = func(InstallEvent) {}
	}
	sourceRoot := req.SourceRoot
	if sourceRoot == "" {
		var err error
		sourceRoot, err = FindSourceRoot(".")
		if err != nil {
			return err
		}
	}
	if _, err := os.Stat(sourceRoot); err != nil {
		return fmt.Errorf("source root: %w", err)
	}

	timeout := req.Timeout
	if timeout <= 0 {
		timeout = defaultTargetTimeout
	}
	runner := req.Runner
	if runner == nil {
		runner = defaultScriptRunner(req.LookPath)
	}

	if len(req.Targets) == 0 {
		return fmt.Errorf("no hay clientes seleccionados")
	}

	if req.DryRun {
		return dryRunHarnessInstall(sourceRoot, req.Targets, emit)
	}

	var firstErr error
	for _, id := range req.Targets {
		id = strings.TrimSpace(strings.ToLower(id))
		emit(InstallEvent{Kind: "step", Target: id, Message: "Instalando " + displayTarget(id)})

		if err := installOneTarget(ctx, sourceRoot, id, timeout, runner, req.RegisterVSCode, emit); err != nil {
			emit(InstallEvent{Kind: "error", Target: id, Message: err.Error()})
			if firstErr == nil {
				firstErr = fmt.Errorf("%s: %w", id, err)
			}
			continue
		}
		emit(InstallEvent{Kind: "log", Target: id, Message: displayTarget(id) + " listo"})
	}
	return firstErr
}

func dryRunHarnessInstall(sourceRoot string, targets []string, emit func(InstallEvent)) error {
	emit(InstallEvent{Kind: "log", Message: "QA dry-run: no se escribe ningún archivo ni se registra ningún cliente"})
	var firstErr error
	for _, raw := range targets {
		id := strings.TrimSpace(strings.ToLower(raw))
		emit(InstallEvent{Kind: "step", Target: id, Message: "Comprobando " + displayTarget(id)})
		if id == "vscode" {
			plugin := ResolveVSCodePluginPath(sourceRoot)
			if plugin != sourceRoot {
				emit(InstallEvent{Kind: "log", Target: id, Message: "check: dist/vscode existe → " + plugin})
			} else {
				emit(InstallEvent{Kind: "log", Target: id, Message: "check: dist/vscode no está generado (un install real lo crearía)"})
			}
			script := filepath.Join(sourceRoot, targetInstallScripts["vscode"])
			if _, err := os.Stat(script); err != nil {
				emit(InstallEvent{Kind: "log", Target: id, Message: "check: script install-vscode.js ausente (carga directa del repo)"})
			} else {
				emit(InstallEvent{Kind: "log", Target: id, Message: "check: script presente " + targetInstallScripts["vscode"]})
			}
			emit(InstallEvent{Kind: "log", Target: id, Message: "omitido: registro en VS Code settings.json"})
			emit(InstallEvent{Kind: "log", Target: id, Message: displayTarget(id) + " OK (dry-run)"})
			continue
		}
		script, ok := targetInstallScripts[id]
		if !ok {
			err := fmt.Errorf("cliente desconocido %q", id)
			emit(InstallEvent{Kind: "error", Target: id, Message: err.Error()})
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		absScript := filepath.Join(sourceRoot, script)
		if _, err := os.Stat(absScript); err != nil {
			err = fmt.Errorf("script de instalación no encontrado: %s", script)
			emit(InstallEvent{Kind: "error", Target: id, Message: err.Error()})
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		emit(InstallEvent{Kind: "log", Target: id, Message: "check: script presente " + script})
		emit(InstallEvent{Kind: "log", Target: id, Message: "omitido: node " + filepath.Base(script) + " --source … --dry-run"})
		emit(InstallEvent{Kind: "log", Target: id, Message: displayTarget(id) + " OK (dry-run)"})
	}
	return firstErr
}

// DryRunInstallRunner is an InstallRunner that only logs checks.
func DryRunInstallRunner(sourceRoot string) func(context.Context, string, []string, func(InstallEvent)) error {
	return func(ctx context.Context, _ string, targets []string, emit func(InstallEvent)) error {
		return RunHarnessInstall(ctx, HarnessInstallRequest{
			SourceRoot: sourceRoot,
			Targets:    targets,
			DryRun:     true,
		}, emit)
	}
}

func installOneTarget(
	parent context.Context,
	sourceRoot, id string,
	timeout time.Duration,
	runner ScriptRunner,
	registerVSCode func(string) (int, error),
	emit func(InstallEvent),
) error {
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	if id == "vscode" {
		return installVSCode(ctx, sourceRoot, runner, registerVSCode, emit)
	}

	script, ok := targetInstallScripts[id]
	if !ok {
		return fmt.Errorf("cliente desconocido %q", id)
	}
	absScript := filepath.Join(sourceRoot, script)
	if _, err := os.Stat(absScript); err != nil {
		return fmt.Errorf("script de instalación no encontrado: %s", script)
	}
	emit(InstallEvent{Kind: "log", Target: id, Message: "Ejecutando " + script})
	return runner(ctx, sourceRoot, absScript, []string{"--source", sourceRoot, "--no-validate"}, func(line string) {
		emit(InstallEvent{Kind: "log", Target: id, Message: line})
	})
}

func installVSCode(ctx context.Context, sourceRoot string, runner ScriptRunner, registerVSCode func(string) (int, error), emit func(InstallEvent)) error {
	if registerVSCode == nil {
		registerVSCode = RegisterVSCodePlugin
	}
	script := filepath.Join(sourceRoot, targetInstallScripts["vscode"])
	pluginPath := ResolveVSCodePluginPath(sourceRoot)
	distReady := pluginPath != sourceRoot

	if _, err := os.Stat(script); err != nil {
		emit(InstallEvent{Kind: "log", Target: "vscode", Message: "Sin generador JS; registrando el árbol disponible en VS Code"})
	} else {
		if distReady {
			emit(InstallEvent{Kind: "log", Target: "vscode", Message: "Regenerando dist/vscode para aplicar los modelos elegidos..."})
		} else {
			emit(InstallEvent{Kind: "log", Target: "vscode", Message: "Generando dist/vscode (puede tardar)..."})
		}
		if err := runner(ctx, sourceRoot, script, []string{"--source", sourceRoot, "--no-validate"}, func(line string) {
			emit(InstallEvent{Kind: "log", Target: "vscode", Message: line})
		}); err != nil {
			emit(InstallEvent{Kind: "log", Target: "vscode", Message: "El generador falló o se agotó el tiempo: " + err.Error()})
			if distReady {
				emit(InstallEvent{Kind: "log", Target: "vscode", Message: "Se registrará el dist/vscode existente"})
			} else {
				emit(InstallEvent{Kind: "log", Target: "vscode", Message: "Registrando el repo fuente en chat.pluginLocations (carga directa)"})
			}
		} else {
			pluginPath = ResolveVSCodePluginPath(sourceRoot)
		}
	}

	n, err := registerVSCode(pluginPath)
	if err != nil {
		return err
	}
	home, _ := os.UserHomeDir()
	emit(InstallEvent{Kind: "log", Target: "vscode", Message: "Plugin instalado en " + VSCodeOspecPluginDir(home)})
	emit(InstallEvent{Kind: "log", Target: "vscode", Message: fmt.Sprintf("VS Code settings actualizados (%d archivo(s))", n)})
	emit(InstallEvent{Kind: "log", Target: "vscode", Message: "Recarga VS Code para activar el plugin"})
	return nil
}

func defaultScriptRunner(lookPath func(string) (string, error)) ScriptRunner {
	if lookPath == nil {
		lookPath = exec.LookPath
	}
	return func(ctx context.Context, sourceRoot, scriptPath string, args []string, emit func(string)) error {
		nodeBin, err := lookPath("node")
		if err != nil {
			return fmt.Errorf("no se encontró Node.js en PATH (hace falta para generar el harness)")
		}
		cmdArgs := append([]string{scriptPath}, args...)
		cmd := exec.CommandContext(ctx, nodeBin, cmdArgs...)
		cmd.Dir = sourceRoot
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			return err
		}
		stderr, err := cmd.StderrPipe()
		if err != nil {
			return err
		}
		if err := cmd.Start(); err != nil {
			return err
		}
		done := make(chan struct{})
		go func() {
			scanLines(stdout, emit)
			close(done)
		}()
		scanLines(stderr, emit)
		<-done
		if err := cmd.Wait(); err != nil {
			if ctx.Err() == context.DeadlineExceeded {
				return fmt.Errorf("tiempo de espera agotado al instalar (el proceso se detuvo)")
			}
			return err
		}
		return nil
	}
}

func scanLines(r io.Reader, emit func(string)) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" && emit != nil {
			emit(line)
		}
	}
}

func displayTarget(id string) string {
	for _, def := range supportedTargets {
		if def.id == id {
			return def.displayName
		}
	}
	return id
}
