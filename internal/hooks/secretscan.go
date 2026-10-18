// secretscan.go — agent-shield secret scanning: clasificación de archivos
// sensibles y escaneo de contenido en busca de credenciales.
//
// PARIDAD: scripts/hooks/lib/secret-scan.js es el espejo JS de estos patrones
// y umbrales. Cualquier cambio aquí debe replicarse allí (ver
// docs/harness-go-js-parity.md).
package hooks

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// maxScanSizeBytes limita el escaneo de contenido; archivos mayores se omiten.
const maxScanSizeBytes = 1024 * 1024

// knownTokenPattern asocia un id estable (telemetría/tests) a un formato de
// token de proveedor conocido. Precompilados una sola vez a nivel de paquete.
// La censura de salidas (secretredact.go) sustituye cada match por su id, así
// que un patrón debe cubrir el token entero.
type knownTokenPattern struct {
	id string
	re *regexp.Regexp
}

// `\b` delante: un prefijo dentro de otra palabra ("desk-…") no es el token.
// `\b` detrás solo cuando el alfabeto no admite `-`: con `-` no hay frontera
// de palabra tras el último carácter.
var knownTokenPatterns = []knownTokenPattern{
	{"openai-api-key", regexp.MustCompile(`\bsk-[a-zA-Z0-9]{48}\b`)},
	{"google-api-key", regexp.MustCompile(`\bAIzaSy[a-zA-Z0-9_-]{33}`)},
	{"aws-access-key", regexp.MustCompile(`\b(?:AKIA|ASIA)[A-Z0-9]{16}\b`)},
	{"slack-token", regexp.MustCompile(`\bxox[abposr]-[0-9A-Za-z-]{10,}`)},
	{"jwt", regexp.MustCompile(`\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+`)},
	{"private-key-header", regexp.MustCompile(`-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----`)},
	{"github-token", regexp.MustCompile(`\bgh[pousr]_[A-Za-z0-9]{36}\b`)},
	{"github-fine-grained-token", regexp.MustCompile(`\bgithub_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}\b`)},
	{"anthropic-api-key", regexp.MustCompile(`\bsk-ant-[a-z]+\d{2}-[A-Za-z0-9_-]{80,}`)},
	{"openai-project-key", regexp.MustCompile(`\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}`)},
	{"stripe-secret-key", regexp.MustCompile(`\b[sr]k_(?:live|test)_[0-9A-Za-z]{24,}\b`)},
	{"npm-token", regexp.MustCompile(`\bnpm_[A-Za-z0-9]{36}\b`)},
	{"gitlab-token", regexp.MustCompile(`\bglpat-[A-Za-z0-9_-]{20,}`)},
	{"huggingface-token", regexp.MustCompile(`\bhf_[A-Za-z]{34}\b`)},
	{"sendgrid-api-key", regexp.MustCompile(`\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}`)},
}

// genericCredentialRegex detecta asignaciones genéricas de credencial:
// `password = "..."` o similares.
//
// Endurecido contra falsos positivos:
//   - `(?:^|[^a-z])` exige que la keyword no sea sufijo de otra palabra
//     ("monkey:", "turkey =") pero admite prefijos con `_`/`-` ("db_password",
//     "api-key"). RE2 no soporta lookbehind, por eso el grupo consumidor.
//   - `[ \t]*` (en vez de `\s*`) y `[^"'\n]` obligan a que keyword y valor
//     convivan en la misma línea; el regex original cruzaba saltos de línea y
//     combinaba texto sin relación real.
var genericCredentialRegex = regexp.MustCompile(
	`(?i)(?:^|[^a-z])(?:password|passwd|pass|contrase[nñ]a|secret|key|token|private_key)[ \t]*[:=][ \t]*["'][^"'` + "\n" + `]{6,}["']`,
)

// sensitiveFileClass describe la clasificación por nombre de archivo.
// action: "deny" (private-key | git-config | npmrc) o "ask" (env-file | secrets-file).
type sensitiveFileClass struct {
	action string
	kind   string
}

// classifySensitiveFile clasifica un path por nombre de archivo. Devuelve nil
// cuando el archivo no coincide con ninguna categoría sensible.
func classifySensitiveFile(filePath string) *sensitiveFileClass {
	filename := strings.ToLower(filepath.Base(filePath))
	ext := filepath.Ext(filename)

	isSSHKey := strings.HasPrefix(filename, "id_") &&
		(ext == "" || ext == ".key" || ext == ".pem" ||
			filename == "id_rsa" || filename == "id_ecdsa" || filename == "id_ed25519")
	if isSSHKey || ext == ".key" {
		return &sensitiveFileClass{action: "deny", kind: "private-key"}
	}

	if filename == "config" && strings.Contains(filepath.ToSlash(filePath), "/.git/config") {
		return &sensitiveFileClass{action: "deny", kind: "git-config"}
	}
	if filename == ".npmrc" {
		return &sensitiveFileClass{action: "deny", kind: "npmrc"}
	}

	if strings.HasPrefix(filename, ".env") {
		return &sensitiveFileClass{action: "ask", kind: "env-file"}
	}
	if filename == "secrets.json" || filename == "credentials" {
		return &sensitiveFileClass{action: "ask", kind: "secrets-file"}
	}
	return nil
}

// scanContentForSecrets escanea contenido en memoria. Devuelve el id estable
// del patrón que disparó ("generic-credential" para la asignación genérica).
func scanContentForSecrets(content string) (bool, string) {
	if content == "" {
		return false, ""
	}
	for _, p := range knownTokenPatterns {
		if p.re.MatchString(content) {
			return true, p.id
		}
	}
	if genericCredentialRegex.MatchString(content) {
		return true, "generic-credential"
	}
	return false, ""
}

// scanFileForSecrets escanea un archivo en disco. Nunca falla: los errores de
// stat/lectura y los archivos que exceden maxScanSizeBytes se omiten en
// silencio (fail-open, igual que el hook JS).
func scanFileForSecrets(filePath string) (bool, string) {
	info, err := os.Stat(filePath)
	if err != nil || info.Size() >= maxScanSizeBytes {
		return false, ""
	}
	contentBytes, err := os.ReadFile(filePath)
	if err != nil {
		return false, ""
	}
	return scanContentForSecrets(string(contentBytes))
}
