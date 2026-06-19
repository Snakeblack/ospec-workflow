# Design: token-budget-advisor

## Overview
Implementar el "Token Budget Advisor" para controlar de forma preventiva el consumo de tokens en las lecturas de herramientas y en el contexto acumulado de la sesión. El sistema utilizará una estimación basada en metadatos de archivos (`fs.statSync` en Node y `os.Stat` en Go) para evitar lecturas pesadas de archivos en el hook `PreToolUse`. El acumulado de la sesión se registrará de forma atómica y ligera en un archivo de log de tokens por sesión, evitando penalizaciones de rendimiento.

---

## Architecture Decisions

### AD-1: Estimación basada en metadatos de tamaño de archivo (sin lectura)
**Decisión**: Calcular la estimación de tokens en `PreToolUse` consultando únicamente el tamaño del archivo en disco (`bytes`) a través del sistema de archivos, sin leer su contenido en memoria.
* **Fórmula para código/estructurado** (extensiones: `.js`, `.go`, `.json`, `.yaml`, `.yml`, `.md`, `.ts`, `.py`, `.txt`, etc.): `tokens = bytes / 4`.
* **Fórmula para prosa/texto libre**: `tokens = (bytes / 6) * 1.3` (estimando un promedio de 6 caracteres por palabra y multiplicando por la heurística de ECC `palabras * 1.3`).
* **Justificación**: Leer archivos grandes (ej. >5 MB) para contar caracteres o palabras añadiría una latencia prohibitiva de I/O en `PreToolUse`, degradando la interacción del agente. Consultar el tamaño en bytes vía metadatos es instantáneo (~0.1ms).

### AD-2: Tracking acumulativo sin bloqueos mediante un log atómico de tokens
**Decisión**: Registrar el consumo acumulado de la sesión mediante escrituras atómicas de append en `.ospec/session/{changeName}/token-events.jsonl`.
* **Escritura**: Cada vez que `PreToolUse` aprueba la lectura de un archivo con `N` tokens estimados, añade una línea JSON compacta (ej. `{"t":1200,"ts":178000}\n`) usando la llamada nativa de append del sistema operativo. Al ser líneas de pocos bytes, la escritura de append es garantizada atómica por el kernel (sin necesidad de semáforos o locks complejos).
* **Lectura**: Para obtener el total acumulado, el hook lee este archivo ligero, parsea los enteros y los suma.
* **Justificación**: Evita re-parsear archivos grandes de logs de transacciones del agente y mantiene el almacenamiento completamente desacoplado del historial del chat.

### AD-3: Variable de entorno de Bypass (`DISABLE_TOKEN_ADVISOR`)
**Decisión**: Si la variable de entorno `DISABLE_TOKEN_ADVISOR` está configurada como `"true"`, el hook omitirá inmediatamente todas las evaluaciones de tokens y retornará `allow`.
* **Justificación**: Permite ejecutar tests en CI y tareas automatizadas sin bloqueos ni requerimientos interactivos del advisor.

---

## File Changes

### `scripts/hooks/pre-tool-use.js`
* Incorporar la lógica del Token Budget Advisor:
  1. Verificar si `process.env.DISABLE_TOKEN_ADVISOR === "true"`. En ese caso, saltar al análisis estándar de seguridad.
  2. Identificar si el input de la herramienta contiene rutas de archivos. Inspeccionar recursivamente el objeto `tool_input` buscando valores de tipo string que representen rutas existentes en el espacio de trabajo.
  3. Para cada ruta de archivo encontrada:
     - Obtener el tamaño en bytes usando `fs.statSync`.
     - Aplicar la heurística correspondiente según su extensión.
     - Si el archivo individual excede los **20,000 tokens** (~80,000 bytes/caracteres para código), retornar inmediatamente una decisión `ask` alertando del costo.
  4. Leer `.ospec/session/{changeName}/token-events.jsonl`, sumar las entradas acumuladas de la sesión activa y evaluar si la suma + los tokens de la llamada actual superan los **90,000 tokens**.
     - De superarse el acumulado, retornar una decisión `ask` sugiriendo compactar la sesión antes de continuar.
  5. Si el análisis de tokens pasa con éxito: registrar de forma atómica en el archivo de logs `.ospec/session/{changeName}/token-events.jsonl` la estimación del archivo actual y proceder con el análisis tradicional de seguridad de comandos.

### `internal/hooks/pretooluse.go`
* Implementar el equivalente exacto en Go para mantener la paridad exigida por el arnés en sistemas que tienen el binario compilado:
  1. Leer `os.Getenv("DISABLE_TOKEN_ADVISOR")`. Si es `"true"`, saltar.
  2. Analizar el payload de entrada JSON. Buscar rutas en el input de la herramienta.
  3. Usar `os.Stat(path)` para obtener el tamaño de archivo. Estimar tokens e interceptar si el archivo individual supera el límite.
  4. Leer y acumular los tokens desde `.ospec/session/{changeName}/token-events.jsonl`.
  5. Registrar los tokens mediante append en el archivo si se aprueba.

### `skills/token-budget-advisor/SKILL.md` (Nuevo)
* Crear una nueva skill bajo demanda que documente las reglas de respuesta del Advisor, instruyendo al agente sobre cómo economizar tokens y cuándo sugerir compactaciones al usuario de forma proactiva.

---

## Test Strategy

### Pruebas Unitarias (Node.js)
* En `scripts/hooks/pre-tool-use.test.js`:
  - Test: Estimación correcta de tokens para extensiones de código vs prosa.
  - Test: Bloqueo interactivo (`ask`) de archivo individual pesado (>20k tokens).
  - Test: Bloqueo interactivo (`ask`) de tokens acumulados de sesión (>90k tokens).
  - Test: Respeto a la variable de entorno `DISABLE_TOKEN_ADVISOR=true`.

### Pruebas Unitarias (Go)
* En `internal/hooks/pretooluse_test.go`:
  - Replicar y validar las mismas aserciones para garantizar la paridad exacta del binario de Go.

---

### Comando de ejecución de tests:
```powershell
npm test
```
