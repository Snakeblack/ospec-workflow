# Diseño: agent-shield-security

## Proposed Changes

### Componente: Hooks del Arnés (Lifecycle Hooks)

Para implementar el escaneo de seguridad en la inicialización y la protección contra fuga de credenciales en caliente:

#### [MODIFY] [session-start.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/hooks/session-start.js)
- Agregar un paso de escaneo al final de `runSessionStart`.
- Leer `.gitignore` y comprobar si `.env`, `.env.*` y `.npmrc` están ignorados en caso de existir.
- Leer `.git/config` (si existe en el workspace root) y analizar con la regex `https?://[^/:\s]+:[^/:\s]+@` para detectar credenciales incrustadas.
- Si hay alertas, agregar el objeto `security` al payload de retorno y definir un `systemMessage` que advierta visualmente al desarrollador de los riesgos.

#### [MODIFY] [pre-tool-use.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/hooks/pre-tool-use.js)
- Interceptar las rutas extraídas de `tool_input` en `PreToolUse` antes del control de tokens.
- Comprobar la variable de entorno `DISABLE_AGENT_SHIELD === "true"`.
- Clasificar accesos a archivos:
  - **Bloqueo Estricto (`deny`)**: `.git/config` (dentro del workspace), `.npmrc`, y llaves SSH privadas (archivos que comiencen con `id_` y no tengan extensiones inseguras o coincidan con `id_rsa`, `id_ecdsa`, etc.).
  - **Advertencia Interactiva (`ask`)**: Archivos `.env`, `.env.*`, `secrets.json`, `credentials`.
  - **Escaneo de Contenido (`ask`)**: Leer archivos de texto legibles (< 1MB) y buscar:
    - Patrones de tokens conocidos (OpenAI, Google Cloud, AWS, Slack, JWT).
    - Patrones genéricos de contraseñas: `(?:password|passwd|pass|contrase[nñ]a|secret|key|token|private_key)\s*[:=]\s*["'][^"']{6,}["']` (insensible a mayúsculas).

#### [MODIFY] [sessionstart.go](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/internal/hooks/sessionstart.go)
- Portar la lógica de escaneo en la inicialización a Go.
- Analizar `.gitignore` y `.git/config` de forma síncrona en Go con la misma paridad de formato del JSON de respuesta y del `systemMessage`.

#### [MODIFY] [pretooluse.go](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/internal/hooks/pretooluse.go)
- Portar las reglas de AgentShield a Go para `PreToolUse`.
- Implementar las expresiones regulares para claves conocidas y asignaciones de contraseñas.
- Garantizar que los límites de tamaño y extensiones sean idénticos para proteger el rendimiento de Go.

---

## Plan de Verificación

### Pruebas Automatizadas
- Escribir casos de prueba unitarios en `scripts/hooks/session-start.test.js` y `scripts/hooks/pre-tool-use.test.js`.
- Escribir pruebas unitarias correspondientes en Go (`sessionstart_test.go` y `pretooluse_test.go`).
- Asegurar que `go test ./...` y `node scripts/check.js` pasen con éxito.
