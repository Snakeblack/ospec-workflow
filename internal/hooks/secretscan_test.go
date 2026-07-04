// Tests for secretscan.go — clasificación de archivos sensibles y escaneo de
// contenido en busca de credenciales. Los casos espejan
// scripts/hooks/lib/secret-scan.test.js (contrato de paridad Go/JS).
package hooks

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// classifySensitiveFile
// ---------------------------------------------------------------------------

func TestClassifySensitiveFile_Deny(t *testing.T) {
	cases := []struct {
		path string
		kind string
	}{
		{filepath.Join("home", ".ssh", "id_rsa"), "private-key"},
		{filepath.Join("home", ".ssh", "id_ecdsa"), "private-key"},
		{filepath.Join("home", ".ssh", "id_ed25519"), "private-key"},
		{filepath.Join("home", ".ssh", "id_deploy.pem"), "private-key"},
		{filepath.Join("home", ".ssh", "id_deploy.key"), "private-key"},
		{filepath.Join("repo", ".git", "config"), "git-config"},
		{filepath.Join("home", ".npmrc"), "npmrc"},
	}
	for _, tc := range cases {
		got := classifySensitiveFile(tc.path)
		if got == nil || got.action != "deny" || got.kind != tc.kind {
			t.Errorf("classifySensitiveFile(%q) = %+v, want deny/%s", tc.path, got, tc.kind)
		}
	}
}

func TestClassifySensitiveFile_Ask(t *testing.T) {
	cases := []struct {
		path string
		kind string
	}{
		{filepath.Join("repo", ".env"), "env-file"},
		{filepath.Join("repo", ".env.local"), "env-file"},
		{filepath.Join("repo", ".env.production"), "env-file"},
		{filepath.Join("repo", "secrets.json"), "secrets-file"},
		{filepath.Join("repo", "credentials"), "secrets-file"},
	}
	for _, tc := range cases {
		got := classifySensitiveFile(tc.path)
		if got == nil || got.action != "ask" || got.kind != tc.kind {
			t.Errorf("classifySensitiveFile(%q) = %+v, want ask/%s", tc.path, got, tc.kind)
		}
	}
}

func TestClassifySensitiveFile_Nil(t *testing.T) {
	for _, p := range []string{
		filepath.Join("repo", "index.js"),
		filepath.Join("repo", "README.md"),
		filepath.Join("repo", "config.yaml"),
		filepath.Join("repo", "id_card.md"),
		filepath.Join("repo", "environment.ts"),
		filepath.Join("repo", "nginx", "config"),
	} {
		if got := classifySensitiveFile(p); got != nil {
			t.Errorf("classifySensitiveFile(%q) = %+v, want nil", p, got)
		}
	}
}

// ---------------------------------------------------------------------------
// scanContentForSecrets — tokens conocidos
// ---------------------------------------------------------------------------

func TestScanContent_KnownTokens(t *testing.T) {
	cases := []struct {
		id      string
		content string
	}{
		{"openai-api-key", "const k = 'sk-" + strings.Repeat("a", 48) + "';"},
		{"google-api-key", "key=AIzaSy" + strings.Repeat("B", 33)},
		{"aws-access-key", "AWS_KEY=AKIA" + strings.Repeat("Z", 16)},
		{"slack-token", "token xoxb-1234567890abcd"},
		{"jwt", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123-_"},
	}
	for _, tc := range cases {
		matched, patternID := scanContentForSecrets(tc.content)
		if !matched || patternID != tc.id {
			t.Errorf("scanContentForSecrets(%q) = (%v, %q), want (true, %q)", tc.content, matched, patternID, tc.id)
		}
	}
}

// ---------------------------------------------------------------------------
// scanContentForSecrets — credencial genérica (verdaderos positivos)
// ---------------------------------------------------------------------------

func TestScanContent_GenericTruePositives(t *testing.T) {
	for _, content := range []string{
		`password: "superSecretAdmin123"`,
		`db_password = "superSecretAdmin123"`,
		`api_key = 'abcdef123456'`,
		`token: "abcdef123456"`,
		`contraseña = "miClaveSegura"`,
		`private_key: "-----BEGIN"`,
		`SECRET="deploy-secret-value"`,
	} {
		matched, patternID := scanContentForSecrets(content)
		if !matched || patternID != "generic-credential" {
			t.Errorf("scanContentForSecrets(%q) = (%v, %q), want (true, generic-credential)", content, matched, patternID)
		}
	}
}

// ---------------------------------------------------------------------------
// scanContentForSecrets — falsos positivos que NO deben disparar
// ---------------------------------------------------------------------------

func TestScanContent_FalsePositivesDoNotFire(t *testing.T) {
	for _, content := range []string{
		// Keyword como substring de otra palabra (línea única)
		`monkey: "bananabanana"`,
		`turkey = "deliciosa comida"`,
		`compass: "north-north-west"`,
		// Keyword y valor entre comillas en líneas distintas (docs/markdown)
		"Key rule: inject compact rules text when available.\n\nSee \"skills/angular/SKILL.md\" for details.",
		"The token budget advisor\nuses \"150k-token\" thresholds.",
		// Valor demasiado corto
		`secret = "short"`,
		// Sin comillas
		`password = superSecretAdmin123`,
		// Vacío
		"",
	} {
		if matched, patternID := scanContentForSecrets(content); matched {
			t.Errorf("scanContentForSecrets(%q) = (true, %q), want no match", content, patternID)
		}
	}
}

func TestScanContent_KeywordAtLineStartFires(t *testing.T) {
	if matched, _ := scanContentForSecrets("línea uno\npassword: \"superSecretAdmin123\""); !matched {
		t.Error("keyword al inicio de línea posterior debe disparar")
	}
}

// ---------------------------------------------------------------------------
// scanFileForSecrets
// ---------------------------------------------------------------------------

func TestScanFile_MatchAndClean(t *testing.T) {
	dir := t.TempDir()

	dirty := filepath.Join(dir, "dirty.txt")
	if err := os.WriteFile(dirty, []byte(`db_password = "superSecretAdmin123"`), 0o644); err != nil {
		t.Fatal(err)
	}
	if matched, _ := scanFileForSecrets(dirty); !matched {
		t.Error("archivo con credencial debe disparar")
	}

	clean := filepath.Join(dir, "clean.txt")
	if err := os.WriteFile(clean, []byte("console.log('hola mundo');"), 0o644); err != nil {
		t.Fatal(err)
	}
	if matched, _ := scanFileForSecrets(clean); matched {
		t.Error("archivo limpio no debe disparar")
	}
}

func TestScanFile_UnreadableAndTooLarge(t *testing.T) {
	if matched, _ := scanFileForSecrets(filepath.Join(t.TempDir(), "no-existe")); matched {
		t.Error("archivo inexistente no debe disparar ni fallar")
	}

	big := filepath.Join(t.TempDir(), "big.txt")
	if err := os.WriteFile(big, []byte(strings.Repeat("x", maxScanSizeBytes+1)), 0o644); err != nil {
		t.Fatal(err)
	}
	if matched, _ := scanFileForSecrets(big); matched {
		t.Error("archivo mayor al límite debe omitirse")
	}
}

func TestMaxScanSizeBytes_ParityContract(t *testing.T) {
	if maxScanSizeBytes != 1024*1024 {
		t.Errorf("maxScanSizeBytes = %d, want 1MB (contrato de paridad con JS)", maxScanSizeBytes)
	}
}
