# Tasks: agent-shield-security

**Delivery**: Single PR, exception-ok
**Estimated changed lines**: ~150-200

---

## Tanda 1 — Escaneo en Inicialización (SessionStart)

- [x] **T1.1** Modificar `scripts/hooks/session-start.js` para implementar el escaneo en inicialización: leer `.gitignore`, verificar si `.env` / `.npmrc` están ignorados, escanear `.git/config` local en busca de credenciales en URLs, e inyectar `systemMessage` y objeto `security`.
- [x] **T1.2** Escribir casos de prueba unitarios en `scripts/hooks/session-start.test.js` para validar este escaneo de seguridad.

## Tanda 2 — Escaneo e Interceptación de Lecturas (PreToolUse en JS)

- [x] **T2.1** Modificar `scripts/hooks/pre-tool-use.js` para detectar bypass `process.env.DISABLE_AGENT_SHIELD === "true"`.
- [x] **T2.2** Implementar el bloqueo estricto (`deny`) para claves SSH privadas, `.npmrc`, y el archivo `.git/config` dentro del workspace.
- [x] **T2.3** Implementar la consulta interactiva (`ask`) para archivos `.env`, `.env.*`, `secrets.json`, `credentials` y para archivos de texto < 1MB cuyos contenidos coincidan con llaves conocidas (OpenAI, AWS, JWT, GCP, etc.) o contraseñas genéricas.
- [x] **T2.4** Completar y robustecer los tests unitarios en `scripts/hooks/pre-tool-use.test.js` con las pruebas del shield de seguridad.

## Tanda 3 — Paridad de Seguridad en Go (SessionStart & PreToolUse)

- [x] **T3.1** Modificar `internal/hooks/sessionstart.go` para portar el escaneo de inicialización y las alertas correspondientes a Go.
- [x] **T3.2** Modificar `internal/hooks/pretooluse.go` para portar todas las reglas de AgentShield, patrones de expresiones regulares y límites de escaneo a Go.
- [x] **T3.3** Escribir tests unitarios en Go en `sessionstart_test.go` y `pretooluse_test.go` para verificar la paridad absoluta.

## Tanda 4 — Pruebas de Integración y Cierre

- [x] **T4.1** Compilar el binario de Go y correr la suite de verificación completa (`node scripts/check.js`).

---

## Review Workload Forecast

| Metric | Value |
|--------|-------|
| Estimated changed lines | ~150-200 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Decision needed before apply | No (aprobado por usuario en clarify) |

## Dependencies
None.
