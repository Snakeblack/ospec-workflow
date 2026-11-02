---
sidebar:
  order: 1
---

# Hooks del ciclo de vida

> **En pocas palabras:** los hooks son programas que tu herramienta ejecuta sola en momentos fijos de la sesión: al abrirla, antes y después de cada herramienta, cuando termina un subagente, antes de compactar el contexto y al terminar cada turno. No dependen de que el asistente se acuerde de nada: bloquean secretos y comandos destructivos, cuentan los turnos que dan validez a tus respuestas en los gates y dejan en disco la traza de la sesión. Se ejecutan con un binario en Go, `ospec-hooks`, y si no arranca, con su versión en Node.js.

---

## Los 6 Eventos del Ciclo de Vida

```mermaid
flowchart TD
    E1["1. SessionStart
(Al abrir el editor)
Prepara cachés y verifica entorno"] --> E2["2. PreToolUse
(Antes de usar una herramienta)
Bloquea comandos peligrosos y secretos"]
    E2 --> E3["3. PostToolUse
(Después de usar una herramienta)
Censura secretos en su salida"]
    E3 --> E4["4. SubagentStop
(Cuando un subagente termina)
Registra su telemetría"]
    E4 --> E5["5. PreCompact
(Antes de podar la memoria)
Guarda el estado en disco"]
    E5 --> E6["6. Stop
(Al terminar cada turno)
Cuenta el turno y deja la traza"]
```

---

## ¿Qué hace cada Hook exactamente?

### 1. `SessionStart` (Inicio de Sesión)
- Se ejecuta en cuanto abres tu asistente de IA.
- Comprueba si las habilidades cambiaron y regenera la caché (`skill-registry`).
- Inyecta las variables de entorno y las capacidades del proyecto.

### 2. `PreToolUse` (Control Previo de Herramientas)
- Se ejecuta cada vez que la IA quiere escribir un archivo o ejecutar un comando en la terminal.
- **Bloqueos:** impide comandos destructivos (borrar la raíz del disco, forzar un push, descargar y ejecutar), commits con atribución a la IA y la edición a mano del estado de IDD. Ver [Guardrails](/openwiki/proteccion/guardrails.md).
- **AgentShield:** bloquea o pide confirmación al leer o escribir secretos.
- **Token Budget:** Estima los tokens de los ficheros que la herramienta va a leer y pide confirmación si una petición supera 50.000 tokens o si el acumulado de un cambio SDD activo supera 150.000. No bloquea.

### 3. `PostToolUse` (Censura de Salida)
- Se ejecuta después de cada herramienta, antes de que el modelo vea su salida.
- Censura los secretos de esa salida y conserva la forma de la respuesta. En lecturas de ficheros sensibles (`.env*`, credenciales, `secrets.json`) aplica un modo más estricto.
- Si no hay nada que censurar, no escribe nada.

### 4. `SubagentStop` (Cierre de Tarea de Sub-Agente)
- Se ejecuta cuando un subagente termina su labor.
- Registra su telemetría (tokens y duración) y, para los agentes `sdd-*` del modo SDD (opcional), persiste su resultado en el `state.yaml` del cambio activo.
- No bloquea: siempre deja continuar el turno.

### 5. `PreCompact` (Protección ante Podado de Contexto)
- Cuando la conversación con la IA se vuelve muy larga, los editores suelen borrar los primeros mensajes para ahorrar espacio en memoria.
- Este hook escribe un resumen de sesión de cada cambio abierto (IDD y, en el modo SDD opcional, el cambio activo) en `.ospec/session/<cambio>/session-summary.md` antes de que la memoria se borre.

### 6. `Stop` (Fin de Turno)
- Se ejecuta al terminar cada turno del agente.
- Suma uno a `.ospec/turns` en la raíz del proyecto, el primer directorio hacia arriba que tiene `.git`, aunque la sesión esté en un subdirectorio. Con esa cuenta el CLI comprueba que una respuesta a un gate llegó en un turno posterior a la pregunta ([Los seis gates](/openwiki/idd/flujo-idd.md#quién-responde)).
- Escribe la traza de la sesión en `.ospec/session/latest.md`, con el cambio abierto y el siguiente paso.
- No bloquea: si no puede contar el turno o escribir la traza, deja continuar con un aviso.
