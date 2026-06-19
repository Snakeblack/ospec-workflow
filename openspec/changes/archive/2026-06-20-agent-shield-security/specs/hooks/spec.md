# Delta para hooks: agent-shield-security

## MODIFIED Requirements

### Requirement: 2. SessionStart

**Trigger**: Claude session initialization, before any agent turn.

**Source**: `scripts/hooks/session-start.js`

#### 2.1 Behaviour

Given a Claude session starts in a workspace directory,
When the hook runs,
Then it MUST:

1. Resolve the workspace from `input.cwd` if supplied; otherwise use `process.cwd()`.
2. Create an `ArtifactStore` from `openspec/config.yaml` (detecting `openspec` or `workspace-federated` backend).
3. Check whether openspec is initialized:
   - **openspec mode**: `openspec/config.yaml` exists.
   - **workspace-federated mode**: `openspec/workspace.yaml` exists and has at least one member.
4. **AGENT SHIELD SECURITY CHECK**:
   Si la variable de entorno `DISABLE_AGENT_SHIELD=true` no está activa, el hook MUST escanear el espacio de trabajo en busca de riesgos de seguridad y adjuntar los resultados en la propiedad `security` de la respuesta JSON:
   - Verificar si archivos como `.env`, `.env.local` y `.npmrc` existen y no están incluidos en `.gitignore`.
   - Verificar si el archivo `.git/config` contiene credenciales incrustadas (patrón `https://[^:]+:[^@]+@`).

El JSON de respuesta cuando se detectan alertas debe tener el formato:
```json
{
  "status": "ok",
  "ospecDetected": true,
  "registry": { ... },
  "security": {
    "status": "warning" | "ok",
    "alerts": [
      {
        "type": "unignored-env-file" | "embedded-credentials",
        "file": ".env" | ".git/config",
        "reason": "El archivo sensible no está ignorado en Git" | "El archivo contiene credenciales en texto plano"
      }
    ]
  }
}
```

---

### Requirement: 3. PreToolUse

**Trigger**: before every tool call Claude attempts to make.

**Source**: `scripts/hooks/pre-tool-use.js`

#### 3.4 Decision rules

Evaluation MUST proceed in this order; the first match wins:

**Step 1 — BYPASS (Bypasses de Advisors).**
- Si la variable de entorno `DISABLE_TOKEN_ADVISOR=true` está activa: se omiten las validaciones del Token Budget Advisor.
- Si la variable de entorno `DISABLE_AGENT_SHIELD=true` está activa: se omiten las validaciones de AgentShield descritas en el Paso 2.

**Step 2 — AGENT SHIELD SECURITY (Protección contra Fuga de Secretos).**
Si el agente intenta leer un archivo (herramientas como `view_file` o lectura de URLs/recursos) y el archivo solicitado es sensible:
- Si es una clave privada SSH (`id_rsa`, `id_ecdsa`, `id_ed25519`), `.git/config` o `.npmrc`, retornar `deny` con la razón: *"Acceso denegado: El archivo es una clave privada o configuración sensible del sistema y no puede ser leído por el agente."*
- Si es `.env`, `.env.*` o archivos que contienen secretos detectados heurísticamente (como contraseñas fuertes o tokens de API usando expresiones regulares), retornar `ask` con la razón: *"Advertencia de seguridad: Se detectó un posible archivo de entorno o secreto. ¿Está seguro de permitir su lectura?"*

**Step 3 — TOKEN BUDGET ADVISOR (Lectura Pesada).**
(Lógica del Advisor de tokens implementada anteriormente).

**Step 4 — SESSION TOKENS (Contexto Saturado).**
(Lógica de tokens de sesión implementada anteriormente).

**Step 5 — DENY (no recovery).**
(Lógica de denegación de comandos de terminal).

**Step 6 — ASK (requires user confirmation).**
(Lógica de consulta de comandos de terminal).

**Step 7 — ALLOW.**
(Permitir la llamada).
