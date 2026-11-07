package hooks

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// attribution-guard-gaps: the message also arrives through a file, stdin, another subcommand or
// global options before the subcommand. Mirrors the checkCommitAttribution
// cases of scripts/hooks/pre-tool-use.test.js.

const attributionTrailer = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

func messageWorkspace(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestCommitAttribution_DeniesTheCommandTextHoweverTheMessageArrives(t *testing.T) {
	workspace := messageWorkspace(t, nil)
	for _, cmd := range []string{
		"git commit -F - <<'EOF'\nfix: x\n\n" + attributionTrailer + "\nEOF",
		"git commit --file=- <<EOF\nfix: x\n\n🤖 Generated with Claude Code\nEOF",
		"git commit -m \"$(cat <<'EOF'\nfix: el \"guard\" mira todo\n\n" + attributionTrailer + "\nEOF\n)\"",
		`printf 'fix: x\n\n` + attributionTrailer + `\n' | git commit -F -`,
		`git commit -F - <<< $'fix: x\n\n` + attributionTrailer + `'`,
		`git commit -m fix -m Co-Authored-By:Claude`,
		`git -C /repo commit -m "fix: x" -m "` + attributionTrailer + `"`,
		`git -c user.name=ana --no-pager commit -m "fix: x" -m "` + attributionTrailer + `"`,
		`git merge -m "Merge generated with Claude" topic`,
		`gh pr -R owner/repo create -t "feat: x" -b "` + attributionTrailer + `"`,
		"gh pr new --title \"feat: x\" --body \"Resumen\n\n🤖 Generated with Claude Code\"",
		`gh pr comment 12 --body "🤖 Generated with Claude Code"`,
		`gh pr review 12 --approve -b "` + attributionTrailer + `"`,
		`gh pr merge 12 --merge --subject "x" --body "` + attributionTrailer + `"`,
		"gh pr create --title \"feat: x\" --body-file - <<'EOF'\nResumen\n\nGenerado con Claude Code\nEOF",
	} {
		if checkCommitAttribution(cmd, workspace) != attributionReason {
			t.Errorf("expected the attribution denial for %q", cmd)
		}
	}
}

func TestCommitAttribution_ReadsTheMessageAndBodyFiles(t *testing.T) {
	workspace := messageWorkspace(t, map[string]string{
		"msg.txt": "fix: x\n\n" + attributionTrailer + "\n",
		"pr.md":   "## Resumen\n\nx\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n",
	})
	for _, cmd := range []string{
		"git commit -F msg.txt",
		"git commit -Fmsg.txt",
		"git commit --file msg.txt",
		"git commit --file=msg.txt",
		`git commit -F "` + filepath.Join(workspace, "msg.txt") + `"`,
		"git commit -t msg.txt --no-edit",
		"git merge --file msg.txt topic",
		"cat msg.txt | git commit -F -",
		"git commit -F - < msg.txt",
		`gh pr create --title "feat: x" --body-file pr.md`,
		`gh pr create -t "feat: x" -F pr.md`,
		"gh pr edit 12 --body-file=pr.md",
		"gh pr comment 12 -F pr.md",
	} {
		if checkCommitAttribution(cmd, workspace) != attributionReason {
			t.Errorf("expected the attribution denial for %q", cmd)
		}
	}
}

func TestCommitAttribution_DeniesAMessageFileItCannotRead(t *testing.T) {
	workspace := messageWorkspace(t, map[string]string{"big.txt": strings.Repeat("x", maxScanSizeBytes)})
	if err := os.Mkdir(filepath.Join(workspace, "dir"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, cmd := range []string{
		"git commit -F missing.txt",
		`gh pr create --title "feat: x" --body-file "$BODY"`,
		"git commit -F dir",
		"git commit -F big.txt",
		"cat missing.txt | git commit -F -",
	} {
		reason := checkCommitAttribution(cmd, workspace)
		if !strings.Contains(reason, "no se pudo leer") || !strings.Contains(reason, "-F -") {
			t.Errorf("expected the unreadable-file denial for %q, got %q", cmd, reason)
		}
	}
}

// Trust review of attribution-guard-gaps: the command may sit behind a wrapper
// with options, a reserved word, a group or a nested shell, and the message
// file is read from the directory git uses.
func TestCommitAttribution_FindsTheCommandBehindWrappersReservedWordsGroupsAndShells(t *testing.T) {
	workspace := messageWorkspace(t, map[string]string{
		"msg.txt": "fix: x\n\n" + attributionTrailer + "\n",
		"pr.md":   "Resumen\n\n🤖 Generated with Claude Code\n",
	})
	for _, cmd := range []string{
		`env -i git commit -m "fix: x" -m "` + attributionTrailer + `"`,
		`sudo -u root gh pr create -t "feat: x" -b "` + attributionTrailer + `"`,
		`timeout 60 git commit -m "fix: x" -m "` + attributionTrailer + `"`,
		`bash -c 'git commit -m "fix: x" -m "` + attributionTrailer + `"'`,
		`if true; then git commit -m "fix: x" -m "` + attributionTrailer + `"; fi`,
		`{ git commit -m "fix: x" -m "` + attributionTrailer + `"; }`,
		`(git commit -m "fix: x" -m "` + attributionTrailer + `")`,
		`echo $'\'' ; git commit -m "fix: x" -m "` + attributionTrailer + `"`,
		"env -i git commit -F msg.txt",
		"bash -lc 'git commit -F msg.txt'",
		`sudo -u root gh pr create -t "feat: x" --body-file pr.md`,
		"if true; then git commit -F msg.txt; fi",
	} {
		if checkCommitAttribution(cmd, workspace) == "" {
			t.Errorf("expected a denial for %q", cmd)
		}
	}
}

func TestCommitAttribution_ReadsTheMessageFileFromTheDirectoryGitUses(t *testing.T) {
	workspace := messageWorkspace(t, map[string]string{"msg.txt": "fix: x\n"})
	if err := os.Mkdir(filepath.Join(workspace, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(workspace, "sub", "msg.txt"), []byte("fix: x\n\n"+attributionTrailer+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for _, cmd := range []string{
		"git -C sub commit -F msg.txt",
		"cd sub && git commit -F msg.txt",
		"(cd sub && git commit -F msg.txt)",
		"bash -c 'cd sub && git commit -F msg.txt'",
		"git commit --fil sub/msg.txt",
		"git commit --fil=sub/msg.txt",
		`gh pr create -t "feat: x" --template sub/msg.txt`,
		`gh pr create -t "feat: x" -T sub/msg.txt`,
	} {
		if checkCommitAttribution(cmd, workspace) == "" {
			t.Errorf("expected a denial for %q", cmd)
		}
	}
	if reason := checkCommitAttribution(`cd "$DIR" && git commit -F msg.txt`, workspace); !strings.Contains(reason, "no se pudo leer") {
		t.Errorf("an unknown directory must deny as unreadable, got %q", reason)
	}
	for _, cmd := range []string{
		"cd sub; git -C .. commit -F msg.txt",
		`cd sub && git commit -F "` + filepath.Join(workspace, "msg.txt") + `"`,
		`cd "$DIR" && git commit -m "fix: x"`,
	} {
		if reason := checkCommitAttribution(cmd, workspace); reason != "" {
			t.Errorf("expected no denial for %q, got %q", cmd, reason)
		}
	}
}

// Second trust review: continued lines, escaped words, a `<<` that is no
// heredoc, `--trailer token=value` and $'…' escapes read as the shell does.
func TestCommitAttribution_ReadsContinuedLinesEscapesAndTrailersAsTheShellDoes(t *testing.T) {
	workspace := messageWorkspace(t, map[string]string{
		"msg.txt":   "fix: x\n\n" + attributionTrailer + "\n",
		"pr.md":     "Resumen\n\n🤖 Generated with Claude Code\n",
		"clean.txt": "fix: x\n",
	})
	for _, cmd := range []string{
		"git commit \\\n-F msg.txt",
		"git add . && \\\n  git commit -F msg.txt",
		"gh pr create --title x \\\n--body-file pr.md",
		"\\git commit -F msg.txt",
		"git commit -m Co-authored-by:\\ Cl\\aude",
		"echo $((1<<2))\ngit commit -F msg.txt",
		"git commit -m x --trailer 'Co-authored-by=Claude <noreply@anthropic.com>'",
		"git commit -m $'x\\n\\nCo-authored-by: Cl\\x61ude'",
	} {
		if checkCommitAttribution(cmd, workspace) == "" {
			t.Errorf("expected a denial for %q", cmd)
		}
	}
	for _, cmd := range []string{
		"git commit \\\n-F clean.txt",
		"\\git commit -F clean.txt",
		"git commit -m x --trailer 'Reviewed-by=Ana Pérez'",
	} {
		if reason := checkCommitAttribution(cmd, workspace); reason != "" {
			t.Errorf("expected no denial for %q, got %q", cmd, reason)
		}
	}
}

// Third trust review: a message from stdin comes from the command's own `<`
// redirect or from a file reader piped into it, read in the shell's directory;
// other readers of the line are not its message. `gh pr close|reopen -c`
// posts a PR comment.
func TestCommitAttribution_ReadsOnlyTheFilesThatFeedAMessageFromStdin(t *testing.T) {
	workspace := messageWorkspace(t, map[string]string{"msg.txt": "fix: x\n", "notes.txt": attributionTrailer + "\n"})
	if err := os.Mkdir(filepath.Join(workspace, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(workspace, "sub", "msg.txt"), []byte("fix: x\n\n"+attributionTrailer+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	heredoc := "git commit -F - <<'EOF'\nfix: x\nEOF"
	for _, cmd := range []string{
		"git log --oneline | grep -v wip; " + heredoc,
		"sed -n 1p notes.txt; " + heredoc,
		"cp notes.txt /tmp/out.txt && " + heredoc,
		"cat msg.txt | git commit -F -",
		"printf 'fix: x\\n' | git commit -F -",
		`gh pr close 12 -c "superseded by #13"`,
	} {
		if reason := checkCommitAttribution(cmd, workspace); reason != "" {
			t.Errorf("expected no denial for %q, got %q", cmd, reason)
		}
	}
	for _, cmd := range []string{
		"cd sub && cat msg.txt | git -C .. commit -F -",
		"cd sub && git -C .. commit -F - < msg.txt",
		"head -n 20 sub/msg.txt | git commit -F -",
		`gh pr close 12 -c "🤖 Generated with Claude Code"`,
		`gh pr reopen 12 --comment "` + attributionTrailer + `"`,
	} {
		if checkCommitAttribution(cmd, workspace) == "" {
			t.Errorf("expected a denial for %q", cmd)
		}
	}
	if reason := checkCommitAttribution("cat missing.txt | git commit -F -", workspace); !strings.Contains(reason, "no se pudo leer") {
		t.Errorf("a missing piped file must deny as unreadable, got %q", reason)
	}
}

// attribution-stdin-feeders: a pipe broken by a line or written |&, a reader
// fed by its own < or by another pipe, and a < after a >& redirection all feed
// a message read from stdin.
func TestCommitAttribution_FollowsWhatFeedsAMessageFromStdin(t *testing.T) {
	workspace := messageWorkspace(t, map[string]string{"msg.txt": "fix: x\n\n" + attributionTrailer + "\n", "clean.txt": "fix: x\n"})
	forms := []func(string) string{
		func(file string) string { return "cat " + file + " |\ngit commit -F -" },
		func(file string) string { return "cat " + file + " |& git commit -F -" },
		func(file string) string { return "cat < " + file + " | git commit -F -" },
		func(file string) string { return "cat " + file + " | cat | git commit -F -" },
		func(file string) string { return "git commit -F - 2>&1 < " + file },
		func(file string) string { return "git commit -F - &> log.txt < " + file },
		func(file string) string { return "cat " + file + " 2>/dev/null | git commit -F -" },
	}
	for _, form := range forms {
		if reason := checkCommitAttribution(form("msg.txt"), workspace); reason != attributionReason {
			t.Errorf("expected the attribution denial for %q, got %q", form("msg.txt"), reason)
		}
		if reason := checkCommitAttribution(form("clean.txt"), workspace); reason != "" {
			t.Errorf("expected no denial for %q, got %q", form("clean.txt"), reason)
		}
	}
	for _, cmd := range []string{"cat | git commit -F -", "sed 's/x/y/' clean.txt | cat | git commit -F -"} {
		if reason := checkCommitAttribution(cmd, workspace); !strings.Contains(reason, "llega por stdin desde `") {
			t.Errorf("expected the unreadable-stdin denial for %q, got %q", cmd, reason)
		}
	}
	for _, cmd := range []string{"cat <<'EOF' | git commit -F -\nfix: x\nEOF", "echo 'fix: x' | cat | git commit -F -"} {
		if reason := checkCommitAttribution(cmd, workspace); reason != "" {
			t.Errorf("expected no denial for %q, got %q", cmd, reason)
		}
	}
}

// Trust review of attribution-stdin-feeders: a wrapped feeder is followed or
// denied, a `<` of another descriptor is not stdin, and `>|` is a redirection.
func TestCommitAttribution_FollowsAWrappedFeederAndReadsOnlyStdinRedirections(t *testing.T) {
	workspace := messageWorkspace(t, map[string]string{"msg.txt": "fix: x\n\n" + attributionTrailer + "\n", "clean.txt": "fix: x\n"})
	forms := []func(string) string{
		func(file string) string { return "env cat " + file + " | git commit -F -" },
		func(file string) string { return "nice -n 5 cat " + file + " | git commit -F -" },
		func(file string) string { return "cat " + file + " | git commit -F - 3< clean.txt" },
		func(file string) string { return "git commit -F - >| out.txt < " + file },
		func(file string) string { return "git commit -F - 0< " + file },
	}
	for _, form := range forms {
		if reason := checkCommitAttribution(form("msg.txt"), workspace); reason != attributionReason {
			t.Errorf("expected the attribution denial for %q, got %q", form("msg.txt"), reason)
		}
		if reason := checkCommitAttribution(form("clean.txt"), workspace); reason != "" {
			t.Errorf("expected no denial for %q, got %q", form("clean.txt"), reason)
		}
	}
	for cmd, program := range map[string]string{
		"cat msg.txt | env tee | git commit -F -":    "env",
		"cat list.txt | xargs cat | git commit -F -": "xargs",
	} {
		if reason := checkCommitAttribution(cmd, workspace); !strings.Contains(reason, "llega por stdin desde `"+program+"`") {
			t.Errorf("expected the unreadable-stdin denial naming %s for %q, got %q", program, cmd, reason)
		}
	}
}

// Second review: a reader's `-` or /dev/stdin operand reads its own stdin too.
func TestCommitAttribution_FollowsAReadersStdinOperand(t *testing.T) {
	workspace := messageWorkspace(t, map[string]string{"msg.txt": "fix: x\n\n" + attributionTrailer + "\n", "clean.txt": "fix: x\n"})
	for _, cmd := range []string{
		"cat clean.txt - < msg.txt | git commit -F -",
		"cat clean.txt /dev/stdin < msg.txt | git commit -F -",
		"cat msg.txt - < clean.txt | git commit -F -",
	} {
		if reason := checkCommitAttribution(cmd, workspace); reason != attributionReason {
			t.Errorf("expected the attribution denial for %q, got %q", cmd, reason)
		}
	}
	for cmd, program := range map[string]string{
		"cat clean.txt - | git commit -F -":                          "cat",
		"sed 's/x/y/' clean.txt | cat clean.txt - | git commit -F -": "sed",
	} {
		if reason := checkCommitAttribution(cmd, workspace); !strings.Contains(reason, "llega por stdin desde `"+program+"`") {
			t.Errorf("expected the unreadable-stdin denial naming %s for %q, got %q", program, cmd, reason)
		}
	}
	if reason := checkCommitAttribution("cat clean.txt - < clean.txt | git commit -F -", workspace); reason != "" {
		t.Errorf("expected no denial, got %q", reason)
	}
}

func TestCommitAttribution_LetsCleanFilesHeredocsAndOtherCommandsThrough(t *testing.T) {
	workspace := messageWorkspace(t, map[string]string{
		"msg.txt": "fix(claude): corregir el hook\n\nCo-Authored-By: Ana Pérez <ana@example.dev>\n",
		"pr.md":   "## Resumen\n\nArregla setup:cursor.\n",
	})
	for _, cmd := range []string{
		"git commit -F msg.txt",
		"cat msg.txt | git commit -F -",
		`gh pr create --title "docs: x" --body-file pr.md`,
		"git commit -F - <<'EOF'\nfix(codex): adaptar hooks\n\nCuerpo que cita git commit -F missing.txt.\nEOF",
		`git commit -m "docs: explica git commit -F missing.txt y gh pr --body-file x.md"`,
		`grep -F foo msg.txt && git commit -m "fix: x"`,
		"git log -F --grep foo",
		"gh pr view 12 --comments",
	} {
		if reason := checkCommitAttribution(cmd, workspace); reason != "" {
			t.Errorf("expected no denial for %q, got %q", cmd, reason)
		}
	}
}
