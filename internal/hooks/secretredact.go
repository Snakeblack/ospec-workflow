// secretredact.go — censura de secretos en la salida de las herramientas
// (E1.27): el hook PostToolUse entrega al modelo el resultado con cada secreto
// sustituido por `[REDACTED:<tipo>]` y el resto intacto.
//
// PARIDAD: scripts/hooks/lib/secret-redact.js es el espejo JS y documenta las
// reglas; ambos pasan el corpus internal/testdata/secret-redaction/cases.json.
package hooks

import (
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

const redactionMarkerPrefix = "[REDACTED:"

var redactionMarkerRe = regexp.MustCompile(`\[REDACTED:[a-z0-9-]+\]`)

func redactionMarker(kind string) string {
	return redactionMarkerPrefix + kind + "]"
}

var (
	// Sin pie (salida truncada) el bloque llega hasta el final del texto. Los
	// saltos pueden venir escapados (`\n` literal): una clave dentro de un JSON.
	privateKeyBlockRe = regexp.MustCompile(`(-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----)((?:\r?\n|(?:\\r)?\\n)[\s\S]*?)((?:\r?\n|(?:\\r)?\\n)-----END [A-Z0-9 ]*PRIVATE KEY-----|$)`)
	// Un cuerpo de clave tiene al menos una línea larga de base64.
	keyBodyRe = regexp.MustCompile(`[A-Za-z0-9+/=]{40,}`)
	// Corchetes fuera: `https://[^:]+:[^@]+@` es una expresión regular, no una URL.
	urlCredentialsRe = regexp.MustCompile(`\b([A-Za-z][A-Za-z0-9+.-]*://[^ \t\r\n:/@"'<>\[\]]*:)([^ \t\r\n@/"'<>\[\]]+)@`)
	authHeaderRe     = regexp.MustCompile(`(?i)\b((?:proxy-)?authorization[ \t]*[:=][ \t]*["']?(?:bearer|basic|token)[ \t]+)([A-Za-z0-9._~+/=-]{16,})`)

	// Reglas por línea: el texto se parte en "\n" y se quita el "\r" final.
	dotenvAssignRe     = regexp.MustCompile(`(^|[\t :|→"'\[{,;])((?:export[ \t]+)?)([A-Z][A-Z0-9_]*)=("[^"]*"|'[^']*'|[^ \t\f"'#=][^ \t\f"'#]*)`)
	upperColonAssignRe = regexp.MustCompile(`(^|[\t :|→])([A-Z][A-Z0-9_]*):[ \t]+([^ \t\f"'#;,(){}\[\]<>` + "`" + `$%]+)([ \t]*)$`)
	// Solo en un fichero sensible por nombre: cualquier `clave = valor` o
	// `clave: valor` sin comillas, también en minúsculas (INI de AWS, YAML).
	sensitiveFileAssignRe = regexp.MustCompile(`(^|[\t :|→])((?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_.-]*)([ \t]*[:=][ \t]*)("[^"]*"|'[^']*'|[^ \t\f"'#;,]+)([ \t]*(?:#.*)?)$`)
	quotedAssignRe        = regexp.MustCompile(`(^|[^A-Za-z0-9_.$-])(?:"([A-Za-z_][A-Za-z0-9_.-]*)"|'([A-Za-z_][A-Za-z0-9_.-]*)'|([A-Za-z_][A-Za-z0-9_.-]*))[ \t]*(?::=|=>|:|=)[ \t]*(?:"([^"]*)"|'([^']*)')`)

	camelBoundaryRe  = regexp.MustCompile(`([a-z0-9])([A-Z])`)
	keySeparatorRe   = regexp.MustCompile(`[_.-]+`)
	angleTemplateRe  = regexp.MustCompile(`<[^>]*>`)
	windowsVarRe     = regexp.MustCompile(`^%[A-Za-z0-9_]+%$`)
	urlValueRe       = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9+.-]*://`)
	plainValueRe     = regexp.MustCompile(`^[A-Za-z0-9]{1,10}(?:[-_.][A-Za-z0-9]{1,10})*$`)
	blankRe          = regexp.MustCompile(`[ \t]`)
	digitsRe         = regexp.MustCompile(`^[0-9]+$`)
	pathStartRe      = regexp.MustCompile(`^(?:/|\.{1,2}/|~/|[A-Za-z]:[\\/])`)
	fileExtensionRe  = regexp.MustCompile(`(?i)\.(?:pem|key|crt|cer|p12|pfx|json|txt|ya?ml|env)$`)
	constantNameRe   = regexp.MustCompile(`^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$`)
	dottedIdentRe    = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$`)
	asciiLetterRe    = regexp.MustCompile(`[A-Za-z]`)
	digitOrSymbolRe  = regexp.MustCompile(`[0-9!-,/;-@\[-^` + "`" + `{-~]`)
	blankOrColonRe   = regexp.MustCompile(`[ \t:]`)
	sensitiveWords   = map[string]bool{"password": true, "passwd": true, "passphrase": true, "pass": true, "pwd": true, "secret": true, "token": true, "apikey": true, "credential": true, "credentials": true, "privatekey": true}
	sensitiveEndings = []string{"password", "passwd", "secret", "token", "apikey"}
	keyQualifiers    = map[string]bool{"api": true, "access": true, "secret": true, "private": true, "auth": true, "encryption": true, "signing": true, "master": true, "client": true}
	placeholderWords = map[string]bool{
		"null": true, "nil": true, "none": true, "undefined": true, "true": true, "false": true, "yes": true, "no": true, "on": true, "off": true, "empty": true,
		"changeme": true, "password": true, "passwd": true, "secret": true, "token": true, "example": true, "sample": true, "dummy": true,
		"placeholder": true, "redacted": true, "todo": true, "tbd": true, "fixme": true, "test": true,
		"pass": true, "pwd": true, "contraseña": true, "contrasena": true, "clave": true,
	}
	// Un valor que nombra lo que es ("superSecretAdmin123", "password123",
	// "token-123") es un ejemplo: un secreto generado nunca contiene esas palabras.
	placeholderParts = []string{
		"your", "example", "placeholder", "changeme", "change_me", "change-me", "dummy", "xxxx", "****", "replace", "...",
		"password", "passwd", "secret", "token",
	}
	descriptiveParts = map[string]bool{"password": true, "passwd": true, "secret": true, "token": true}
	referenceParts   = []string{"${", "$(", "{{", "process.env", "os.environ", "getenv", "secrets."}
)

func isSensitiveWord(words []string, index int) bool {
	word := words[index]
	if sensitiveWords[word] || (word == "key" && index > 0 && keyQualifiers[words[index-1]]) {
		return true
	}
	for _, ending := range sensitiveEndings {
		if strings.HasSuffix(word, ending) {
			return true
		}
	}
	return false
}

// isSensitiveKey: por la última palabra, `DB_PASSWORD`, `apiKey` o
// `client_secret` sí; `max_tokens`, `primary_key` o `passwordField` no. Con
// anyWord (un `.env`) basta cualquier palabra: `SECRET_KEY_BASE`.
func isSensitiveKey(key string, anyWord bool) bool {
	split := strings.ToLower(camelBoundaryRe.ReplaceAllString(key, "${1}_${2}"))
	var words []string
	for _, word := range keySeparatorRe.Split(split, -1) {
		if word != "" {
			words = append(words, word)
		}
	}
	if len(words) == 0 {
		return false
	}
	if !anyWord {
		return isSensitiveWord(words, len(words)-1)
	}
	for index := range words {
		if isSensitiveWord(words, index) {
			return true
		}
	}
	return false
}

func isRepeatedChar(value string) bool {
	first, _ := utf8.DecodeRuneInString(value)
	for _, r := range value {
		if r != first {
			return false
		}
	}
	return true
}

// isPlaceholder: referencias, plantillas, placeholders, URLs, rutas, números
// y nombres de constante. Sin descriptive (un `.env`), un valor que contiene
// `password` o `secret` sí cuenta como secreto.
func isPlaceholder(value string, descriptive bool) bool {
	if value == "" || strings.HasPrefix(value, redactionMarkerPrefix) || strings.HasPrefix(value, "$") || strings.HasPrefix(value, "{") {
		return true
	}
	for _, part := range referenceParts {
		if strings.Contains(value, part) {
			return true
		}
	}
	if angleTemplateRe.MatchString(value) || windowsVarRe.MatchString(value) || urlValueRe.MatchString(value) {
		return true
	}
	lower := strings.ToLower(value)
	if placeholderWords[lower] {
		return true
	}
	for _, part := range placeholderParts {
		if !descriptive && descriptiveParts[part] {
			continue
		}
		if strings.Contains(lower, part) {
			return true
		}
	}
	if digitsRe.MatchString(value) || isRepeatedChar(value) {
		return true
	}
	if pathStartRe.MatchString(value) || fileExtensionRe.MatchString(value) {
		return true
	}
	return constantNameRe.MatchString(value) || dottedIdentRe.MatchString(value)
}

// isEnvSecret: valor de un `.env`, cualquier valor que no sea placeholder, de
// 4 caracteres o más.
func isEnvSecret(value string) bool {
	return utf8.RuneCountInString(value) >= 4 && !isPlaceholder(value, false)
}

// isOpaqueValue: valor opaco en un fichero sensible, sea cual sea su clave
// (ver isOpaqueValue en secret-redact.js).
func isOpaqueValue(value string) bool {
	return utf8.RuneCountInString(value) >= 4 &&
		!blankRe.MatchString(value) &&
		!plainValueRe.MatchString(value) &&
		!isPlaceholder(value, false)
}

// isStrictSecret: valor en código o configuración, que además debe parecer un
// secreto (ver isStrictSecret en secret-redact.js).
func isStrictSecret(value string) bool {
	return utf8.RuneCountInString(value) >= 8 &&
		!blankOrColonRe.MatchString(value) &&
		!strings.HasPrefix(value, "-") &&
		asciiLetterRe.MatchString(value) &&
		digitOrSymbolRe.MatchString(value) &&
		!isPlaceholder(value, true)
}

// replaceMatches rebuilds text replacing each match of re with the string fn
// returns for its submatch indices; fn returns ok=false to keep the match.
func replaceMatches(re *regexp.Regexp, text string, fn func(text string, m []int) (string, bool)) string {
	matches := re.FindAllStringSubmatchIndex(text, -1)
	if matches == nil {
		return text
	}
	var b strings.Builder
	last := 0
	for _, m := range matches {
		b.WriteString(text[last:m[0]])
		if replacement, ok := fn(text, m); ok {
			b.WriteString(replacement)
		} else {
			b.WriteString(text[m[0]:m[1]])
		}
		last = m[1]
	}
	b.WriteString(text[last:])
	return b.String()
}

func group(text string, m []int, n int) (string, bool) {
	if m[2*n] < 0 {
		return "", false
	}
	return text[m[2*n]:m[2*n+1]], true
}

type redactionNotes struct{ kinds []string }

func (n *redactionNotes) note(kind string) {
	for _, existing := range n.kinds {
		if existing == kind {
			return
		}
	}
	n.kinds = append(n.kinds, kind)
}

func unquote(value string) (string, string) {
	if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
		return value[:1], value[1 : len(value)-1]
	}
	return "", value
}

func redactLine(line string, notes *redactionNotes, sensitiveFile bool) string {
	out := replaceMatches(dotenvAssignRe, line, func(text string, m []int) (string, bool) {
		prefix, _ := group(text, m, 1)
		key, _ := group(text, m, 3)
		value, _ := group(text, m, 4)
		quote, inner := unquote(value)
		// Dentro de una cadena o una lista no es un .env: el valor debe
		// parecer un secreto.
		embedded := prefix != "" && strings.Contains(`"'[{,;`, prefix)
		secret := isSensitiveKey(key, true) && isEnvSecret(inner)
		if embedded {
			secret = isSensitiveKey(key, false) && isStrictSecret(inner)
		}
		if !secret && !(sensitiveFile && isOpaqueValue(inner)) {
			return "", false
		}
		notes.note("assigned-secret")
		return text[m[0]:m[8]] + quote + redactionMarker("assigned-secret") + quote, true
	})
	if sensitiveFile {
		out = replaceMatches(sensitiveFileAssignRe, out, func(text string, m []int) (string, bool) {
			key, _ := group(text, m, 3)
			value, _ := group(text, m, 5)
			quote, inner := unquote(value)
			if !(isSensitiveKey(key, true) && isEnvSecret(inner)) && !isOpaqueValue(inner) {
				return "", false
			}
			notes.note("assigned-secret")
			return text[m[0]:m[10]] + quote + redactionMarker("assigned-secret") + quote + text[m[12]:m[13]], true
		})
	}
	out = replaceMatches(upperColonAssignRe, out, func(text string, m []int) (string, bool) {
		key, _ := group(text, m, 2)
		value, _ := group(text, m, 3)
		if !isSensitiveKey(key, false) || !isStrictSecret(value) {
			return "", false
		}
		notes.note("assigned-secret")
		return text[m[0]:m[6]] + redactionMarker("assigned-secret") + text[m[8]:m[9]], true
	})
	return replaceMatches(quotedAssignRe, out, func(text string, m []int) (string, bool) {
		key := ""
		for n := 2; n <= 4; n++ {
			if k, ok := group(text, m, n); ok {
				key = k
				break
			}
		}
		valueGroup := 5
		if m[10] < 0 {
			valueGroup = 6
		}
		value, _ := group(text, m, valueGroup)
		secret := (isSensitiveKey(key, false) && isStrictSecret(value)) ||
			(sensitiveFile && ((isSensitiveKey(key, true) && isEnvSecret(value)) || isOpaqueValue(value)))
		if !secret {
			return "", false
		}
		notes.note("assigned-secret")
		return text[m[0]:m[2*valueGroup]] + redactionMarker("assigned-secret") + text[m[2*valueGroup+1]:m[1]], true
	})
}

// redactSecrets censura los secretos de un texto y devuelve cada tipo
// censurado una vez, en el orden en que se censuró. sensitiveFile (el texto
// viene de un fichero que classifySensitiveFile marca por nombre) añade las
// asignaciones sin comillas en minúsculas y los valores aleatorios.
func redactSecrets(text string, sensitiveFile bool) (string, []string) {
	notes := &redactionNotes{}
	if text == "" {
		return text, nil
	}
	out := replaceMatches(privateKeyBlockRe, text, func(text string, m []int) (string, bool) {
		header, _ := group(text, m, 1)
		body, _ := group(text, m, 2)
		footer, _ := group(text, m, 3)
		if !keyBodyRe.MatchString(body) {
			return "", false
		}
		notes.note("private-key")
		newline := ""
		for _, candidate := range []string{"\r\n", "\n", `\r\n`, `\n`} {
			if strings.HasPrefix(body, candidate) {
				newline = candidate
				break
			}
		}
		return header + newline + redactionMarker("private-key") + footer, true
	})
	for _, p := range knownTokenPatterns {
		if p.id == "private-key-header" {
			continue
		}
		id := p.id
		out = replaceMatches(p.re, out, func(string, []int) (string, bool) {
			notes.note(id)
			return redactionMarker(id), true
		})
	}
	out = replaceMatches(urlCredentialsRe, out, func(text string, m []int) (string, bool) {
		userPart, _ := group(text, m, 1)
		password, _ := group(text, m, 2)
		if isPlaceholder(password, true) {
			return "", false
		}
		notes.note("url-password")
		return userPart + redactionMarker("url-password") + "@", true
	})
	out = replaceMatches(authHeaderRe, out, func(text string, m []int) (string, bool) {
		scheme, _ := group(text, m, 1)
		token, _ := group(text, m, 2)
		if isPlaceholder(token, true) {
			return "", false
		}
		notes.note("bearer-token")
		return scheme + redactionMarker("bearer-token"), true
	})
	lines := strings.Split(out, "\n")
	for i, line := range lines {
		cr := ""
		if strings.HasSuffix(line, "\r") {
			cr, line = "\r", strings.TrimSuffix(line, "\r")
		}
		lines[i] = redactLine(line, notes, sensitiveFile) + cr
	}
	return strings.Join(lines, "\n"), notes.kinds
}

// redactDeep censura cada string de un valor JSON decodificado y conserva su
// forma: el host descarta una salida reescrita que no coincide con la de la
// herramienta. Los objetos se recorren por clave ordenada para que los tipos
// salgan en un orden estable.
func redactDeep(value interface{}, sensitiveFile bool) (interface{}, []string) {
	notes := &redactionNotes{}
	var walk func(current interface{}) interface{}
	walk = func(current interface{}) interface{} {
		switch typed := current.(type) {
		case string:
			text, kinds := redactSecrets(typed, sensitiveFile)
			for _, kind := range kinds {
				notes.note(kind)
			}
			return text
		case []interface{}:
			next := make([]interface{}, len(typed))
			for i, item := range typed {
				next[i] = walk(item)
			}
			return next
		case map[string]interface{}:
			keys := make([]string, 0, len(typed))
			for key := range typed {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			next := make(map[string]interface{}, len(typed))
			for _, key := range keys {
				next[key] = walk(typed[key])
			}
			return next
		default:
			return current
		}
	}
	return walk(value), notes.kinds
}

func containsRedactionMarker(text string) bool {
	return redactionMarkerRe.MatchString(text)
}

// isCoveredByRedaction: tras censurar content, el escáner de secretscan.go no
// encuentra nada fuera de los marcadores. PreToolUse solo deja de preguntar
// en ese caso.
func isCoveredByRedaction(content string, sensitiveFile bool) bool {
	text, kinds := redactSecrets(content, sensitiveFile)
	// A private key is never covered: a partial read (offset, Grep) returns
	// body lines without the header that marks them.
	for _, kind := range kinds {
		if kind == "private-key" {
			return false
		}
	}
	for _, p := range knownTokenPatterns {
		if p.re.MatchString(text) {
			return false
		}
	}
	for _, match := range genericCredentialRegex.FindAllString(text, -1) {
		if !containsRedactionMarker(match) {
			return false
		}
	}
	return true
}
