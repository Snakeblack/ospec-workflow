# Seguridad y Barreras de Protección

El sistema de seguridad de `ospec-workflow` implementa un modelo de confianza cero para los agentes de inteligencia artificial. A través de dos componentes clave, **AgentShield** y **Token Budget Advisor**, el arnés mitiga riesgos de fuga de secretos y protege los recursos de cómputo del usuario regulando el tamaño de las operaciones de lectura de archivos.

## Cómo funciona

El hook `PreToolUse` actúa como una aduana síncrona. Toda llamada del agente a herramientas del sistema (como lectura de archivos o comandos de consola) es interceptada y analizada antes de ser enviada al sistema operativo o al cliente de IA.

```
[Llamada a Herramienta]
          │
          ▼
   [¿Es Shell?] ──(Sí)──► [Evaluación de Reglas de Consola]
          │                     ├── DENY: Bloqueo Inmediato (ej. rm -rf /)
          │                     └── ASK: Petición de Confirmación Humana (ej. npm install)
          ▼
   [¿Es Lectura?] ─(Sí)─► [Escaneo AgentShield]
          │                     ├── Deniega lectura de secretos (.env, claves SSH)
          │                     └── Valida tamaño del archivo (Token Budget Advisor)
          ▼
[Operación Aprobada]
```

## Detalles técnicos

### AgentShield (Escaneo de Secretos y Comandos)

AgentShield restringe acciones peligrosas mediante dos listas de reglas:

- **Reglas de Denegación Estricta (DENY_RULES)**: Bloquean de inmediato comandos destructivos sin opción a bypass en el chat:
  - Eliminación forzada recursiva de la raíz del sistema (`rm -rf /` o `Remove-Item C:\`).
  - Push forzado en Git (`git push --force` o `git push -f`).
  - Escritura de datos crudos sobre dispositivos de almacenamiento físico (`dd of=/dev/sdX`).
  - Tareas de formateo de disco (`mkfs`, `format.com`, `clear-disk`).
- **Reglas de Confirmación Interactiva (ASK_RULES)**: Pausan la herramienta y piden aprobación humana expresa:
  - Instalación de nuevas dependencias (`npm install`, `pnpm add`).
  - Reseteo completo del árbol de trabajo (`git reset --hard`).
  - Eliminación recursiva local (`rm -rf` ordinario).

#### Restricciones de Archivos Sensibles

AgentShield bloquea la lectura de archivos con alta probabilidad de contener credenciales en texto plano:
- Archivos `.env`, `.env.local` y claves privadas SSH (`id_rsa`, etc.).
- Ficheros de autenticación local como `.git/config` o `.npmrc`.
*Nota: Si se descubre un archivo sensible, el arnés documentará únicamente su presencia y propósito sin revelar ni exponer su contenido en los prompts.*

### Token Budget Advisor (Límite de Consumo de Tokens)

Previene el desbordamiento de contexto bloqueando lecturas masivas no optimizadas:
- **Límite por Archivo**: Bloquea lecturas de archivos individuales que excedan los **50,000 tokens** estimados (aproximadamente 200 KB de texto plano).
- **Límite Acumulado**: Monitorea el consumo acumulado de la sesión de chat, emitiendo alertas cuando el total supera los **220,000 tokens**, recomendando al agente iniciar un proceso de compactación de contexto (`PreCompact`).

## Por qué la arquitectura tiene esta forma

Los agentes autónomos pueden generar comandos accidentales debido a alucinaciones o interpretaciones erróneas del contexto. Interceptar las herramientas a nivel de runtime síncrono (en lugar de confiar en que el agente "se porte bien") garantiza que, incluso si el modelo intenta un comando dañino, la barrera del runtime impedirá que este sea ejecutado.

## Puntos de extensión principales

- **Agregar reglas de comando**: Modificar las listas `DENY_RULES` y `ASK_RULES` en `/scripts/hooks/pre-tool-use.js` para añadir patrones específicos del stack del proyecto.
- **Ajustar el presupuesto de tokens**: Modificar los límites numéricos definidos en `/openspec/config.yaml` si tu proyecto requiere trabajar habitualmente con archivos de datos pesados.

## Aspectos a tener en cuenta al editar

- **Bypass de Emergencia**: En entornos controlados o servidores de integración continua, el escudo de seguridad y el advisor de tokens pueden ser desactivados exportando las variables `DISABLE_AGENT_SHIELD=true` y `DISABLE_TOKEN_ADVISOR=true`.
- **Evasión de Regex**: Al añadir reglas, utiliza expresiones regulares insensibles a mayúsculas/minúsculas y contempla variaciones de espacios en blanco y alias de comandos (por ejemplo, `docker-compose` vs `docker compose`).

## Mapa de fuentes

| Archivo / Directorio | Rol | Evidencia de Git |
| :--- | :--- | :--- |
| [/scripts/hooks/pre-tool-use.js](/scripts/hooks/pre-tool-use.js) | Evaluador síncrono de comandos, herramientas y Advisor de Tokens. | `422928f` |
| [/scripts/hooks/lib/secret-scan.js](/scripts/hooks/lib/secret-scan.js) | Detector de firmas y patrones de credenciales en archivos. | `422928f` |
| [/scripts/hooks/lib/git-state.js](/scripts/hooks/lib/git-state.js) | Proveedor del estado de Git y clasificación de comandos riesgosos. | `422928f` |
