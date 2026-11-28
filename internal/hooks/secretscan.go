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

// Nombres sensibles, por palabras (`DB_PASSWORD`, `apiKey`, `client-secret`).
// La clase de la palabra decide qué valor cuenta como secreto, y es la misma
// para el escáner y para la censura (secretredact.go); ver keyWordClass en
// secret-scan.js.
var (
	humanWords     = map[string]bool{"password": true, "passwd": true, "passphrase": true, "secret": true, "contraseña": true, "contrasena": true}
	humanEndings   = []string{"password", "passwd", "secret"}
	machineWords   = map[string]bool{"pwd": true, "token": true, "apikey": true, "credential": true, "credentials": true, "privatekey": true}
	machineEndings = []string{"token", "apikey"}
	keyQualifiers  = map[string]bool{
		"api": true, "access": true, "secret": true, "private": true, "auth": true, "encryption": true, "signing": true, "master": true, "client": true,
		"account": true, "jwt": true, "hmac": true, "security": true, "subscription": true,
	}
	// Prefijos de `key` que nombran un dato que no es secreto.
	plainKeyQualifiers = map[string]bool{
		"cache": true, "sort": true, "partition": true, "primary": true, "foreign": true, "idempotency": true, "dedupe": true, "hash": true, "object": true, "row": true,
		"public": true, "publishable": true, "anon": true, "site": true, "cause": true,
	}

	camelBoundaryRe = regexp.MustCompile(`([a-z0-9])([A-Z])`)
	keySeparatorRe  = regexp.MustCompile(`[_.-]+`)
	alnumRunRe      = regexp.MustCompile(`[A-Za-z0-9]{16,}`)
	asciiDigitRe    = regexp.MustCompile(`[0-9]`)

	// genericAssignmentRe: un nombre sin comillas pegado a `:` o `=` y un valor
	// entre comillas de 6 caracteres o más, en la misma línea. El tope del
	// nombre es el de secret-scan.js, donde evita un coste cuadrático.
	genericAssignmentRe = regexp.MustCompile(`([A-Za-zñÑ_][A-Za-z0-9ñÑ_.-]{0,80})[ \t]*[:=][ \t]*["']([^"'` + "\n" + `]{6,})["']`)
)

func keyWords(name string) []string {
	split := strings.ToLower(camelBoundaryRe.ReplaceAllString(name, "${1}_${2}"))
	var words []string
	for _, word := range keySeparatorRe.Split(split, -1) {
		if word != "" {
			words = append(words, word)
		}
	}
	return words
}

// keyWordClass devuelve "human", "machine", "generic", "unqualified" o "".
// El escáner marca un key unqualified (prefijo desconocido) con un token
// opaco; la censura no lo toca.
func keyWordClass(words []string, index int) string {
	word := words[index]
	if humanWords[word] {
		return "human"
	}
	// `pass` a secas es ambiguo ("first pass"); con prefijo (`db_pass`) no.
	if word == "pass" {
		if len(words) == 1 {
			return "machine"
		}
		return "human"
	}
	if machineWords[word] {
		return "machine"
	}
	if word == "key" {
		qualifier := ""
		if index > 0 {
			qualifier = words[index-1]
		}
		if keyQualifiers[qualifier] {
			return "machine"
		}
		if len(words) == 1 {
			return "generic"
		}
		// Un prefijo que nombra un dato que no es secreto (`cache_key`).
		if plainKeyQualifiers[qualifier] {
			return ""
		}
		return "unqualified"
	}
	for _, ending := range humanEndings {
		if strings.HasSuffix(word, ending) {
			return "human"
		}
	}
	for _, ending := range machineEndings {
		if strings.HasSuffix(word, ending) {
			return "machine"
		}
	}
	return ""
}

// hasOpaqueRun: 16 caracteres alfanuméricos seguidos o más, con letra y con
// dígito.
func hasOpaqueRun(value string) bool {
	for _, run := range alnumRunRe.FindAllString(value, -1) {
		if asciiLetterRe.MatchString(run) && asciiDigitRe.MatchString(run) {
			return true
		}
	}
	return false
}

// isOpaqueToken: un valor sin blancos, que no es placeholder y lleva un tramo
// opaco (ver isOpaqueToken en secret-scan.js).
func isOpaqueToken(value string) bool {
	return !blankRe.MatchString(value) && !isPlaceholder(value, true) && hasOpaqueRun(value)
}

// findGenericCredentials devuelve las asignaciones genéricas de content que
// cuentan como credencial: nombre human con cualquier valor, machine con
// forma de secreto, y generic o unqualified con un token opaco.
func findGenericCredentials(content string) []string {
	var found []string
	offset := 0
	for {
		m := genericAssignmentRe.FindStringSubmatchIndex(content[offset:])
		if m == nil {
			return found
		}
		words := keyWords(content[offset+m[2] : offset+m[3]])
		kind := ""
		if len(words) > 0 {
			kind = keyWordClass(words, len(words)-1)
		}
		value := content[offset+m[4] : offset+m[5]]
		if kind == "human" || (kind == "machine" && isStrictSecret(value)) || ((kind == "generic" || kind == "unqualified") && isOpaqueToken(value)) {
			found = append(found, content[offset+m[0]:offset+m[1]])
			offset += m[1]
		} else {
			// El valor de un nombre corriente puede contener otra asignación.
			offset += m[3]
		}
	}
}

// sensitiveFileClass describe la clasificación por nombre de archivo.
// action: "deny" (private-key | git-config | npmrc) o "ask" (env-file | secrets-file).
type sensitiveFileClass struct {
	action string
	kind   string
}

var (
	underSSHDirectoryRe = regexp.MustCompile(`(?i)(?:^|[\\/])\.ssh[\\/]+[^\\/]`)
	// Lo que un directorio `.ssh` guarda sin ser una clave privada, además de
	// los `*.pub`. Cualquier otro fichero bajo `.ssh` cuenta como clave, se
	// llame como se llame (`aws-prod.pem`, `deploy_key`, `github`), y también
	// un comodín o una expansión, que pueden nombrar una (`*.pem`, `known_*`,
	// `$KEY`), y el propio directorio, porque leerlo entero lee sus claves
	// (`grep -r … ~/.ssh`).
	sshPublicNames = map[string]bool{
		"config": true, "known_hosts": true, "known_hosts.old": true, "authorized_keys": true, "authorized_keys2": true,
		"environment": true, "rc": true, "allowed_signers": true, "revoked_keys": true,
	}
	// Ficheros de configuración: ahí `password: valor` es una asignación, no
	// una expresión ni un tipo, y la censura la ve sin comillas y con una
	// contraseña solo de letras. De los JSON solo entran los de configuración
	// por nombre: en el resto viven las etiquetas (`"password": "Contraseña"`).
	// Por lo mismo queda fuera una traducción: un fichero bajo un directorio
	// de traducciones (`locales/es.yml`, `locale/de-DE.ini`) o un bundle de
	// Java con sufijo de idioma (`messages_es.properties`).
	translationDirectoryRe = regexp.MustCompile(`(?i)(?:^|[\\/])(?:locales?|i18n|l10n|langs?|translations?)[\\/]`)
	translationBundleRe    = regexp.MustCompile(`_[a-z]{2}(?:_[a-z]{2})?\.properties$`)
	configExtensions       = map[string]bool{".yml": true, ".yaml": true, ".ini": true, ".properties": true, ".toml": true, ".conf": true, ".cfg": true}
	configJSONNameRe       = regexp.MustCompile(`^(?:appsettings.*|local\.settings|config(?:\.[^.]+)?|settings)\.json$`)
)

// lastSegment devuelve el último tramo de una ruta, con cualquiera de las dos
// barras, en minúsculas.
func lastSegment(filePath string) string {
	trimmed := strings.TrimRight(filePath, `/\`)
	if index := strings.LastIndexAny(trimmed, `/\`); index >= 0 {
		trimmed = trimmed[index+1:]
	}
	return strings.ToLower(trimmed)
}

// underSSHDirectory: un fichero bajo un directorio `.ssh`, a cualquier
// profundidad.
func underSSHDirectory(filePath string) bool {
	return underSSHDirectoryRe.MatchString(filePath)
}

func isConfigFile(filePath string) bool {
	filename := lastSegment(filePath)
	if translationDirectoryRe.MatchString(filePath) || translationBundleRe.MatchString(filename) {
		return false
	}
	return configExtensions[filepath.Ext(filename)] || configJSONNameRe.MatchString(filename)
}

// classifySensitiveFile clasifica un path por nombre de archivo. Devuelve nil
// cuando el archivo no coincide con ninguna categoría sensible.
func classifySensitiveFile(filePath string) *sensitiveFileClass {
	return classifySensitivePath(filePath, false)
}

// classifySensitivePath es classifySensitiveFile con lo que el llamante sabe
// del disco: un directorio (directory, o una ruta que acaba en barra) no es
// una clave por llamarse `id_service` o `certs.key`; `.ssh` y lo que hay bajo
// él sí cuentan, porque leerlos lee sus claves.
func classifySensitivePath(filePath string, directory bool) *sensitiveFileClass {
	filename := strings.ToLower(filepath.Base(filePath))
	ext := filepath.Ext(filename)

	isSSHKey := strings.HasPrefix(filename, "id_") &&
		(ext == "" || ext == ".key" || ext == ".pem" ||
			filename == "id_rsa" || filename == "id_ecdsa" || filename == "id_ed25519")
	isDirectory := directory || strings.HasSuffix(filePath, "/") || strings.HasSuffix(filePath, `\`)
	if (isSSHKey || ext == ".key") && !isDirectory {
		return &sensitiveFileClass{action: "deny", kind: "private-key"}
	}
	name := lastSegment(filePath)
	if name == ".ssh" || (underSSHDirectory(filePath) && !sshPublicNames[name] && !strings.HasSuffix(name, ".pub")) {
		return &sensitiveFileClass{action: "deny", kind: "private-key"}
	}

	// Sin la barra inicial: también una ruta relativa (`.git/config`), como en JS.
	if filename == "config" && strings.Contains(filepath.ToSlash(filePath), ".git/config") {
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
	if len(findGenericCredentials(content)) > 0 {
		return true, "generic-credential"
	}
	return false, ""
}

// scanFileForSecrets escanea un archivo en disco. Nunca falla: los errores de
// stat/lectura y los archivos que exceden maxScanSizeBytes se omiten en
// silencio (fail-open, igual que el hook JS).
func scanFileForSecrets(filePath string) (bool, string) {
	// Only a regular file: reading a FIFO would never return.
	info, err := os.Stat(filePath)
	if err != nil || !info.Mode().IsRegular() || info.Size() >= maxScanSizeBytes {
		return false, ""
	}
	contentBytes, err := os.ReadFile(filePath)
	if err != nil {
		return false, ""
	}
	return scanContentForSecrets(string(contentBytes))
}
