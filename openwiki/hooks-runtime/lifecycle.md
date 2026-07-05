# Runtime de Hooks de Ciclo de Vida

El sistema de hooks de ciclo de vida proporciona un runtime integrado que se activa ante eventos clave durante la interacción del agente con el entorno. A través de este mecanismo, `ospec-workflow` intercepta herramientas, escanea amenazas de seguridad en tiempo real, calcula el consumo de tokens y gestiona la continuidad del estado entre sesiones.

## Cómo funciona

Los hooks se declaran en el manifiesto global de hooks (`/hooks/hooks.json`) y se enlazan a los eventos nativos del cliente de IA. Cuando un evento es disparado por la plataforma, el cliente ejecuta el comando asignado de forma síncrona:

```
[Evento del Cliente de IA]
           │
           ▼
[Intercepción por Hooks] ──► (hooks.json)
           │
           ▼
[Ejecutor Común] ────────► (ospec-hooks-launch.js)
           │
           ▼
[Despacho de Script] ────► (session-start.js, pre-tool-use.js, etc.)
```

1. **Intercepción del Evento**: El cliente detecta un evento configurado (como antes de ejecutar una herramienta) y pausa la ejecución.
2. **Carga del Lanzador**: Se ejecuta el script puente `/scripts/hooks/ospec-hooks-launch.js` pasando como argumento el identificador del evento.
3. **Ejecución del Hook Específico**: El lanzador carga el módulo correspondiente (bajo `/scripts/hooks/`) y evalúa sus reglas.
4. **Bypass o Bloqueo**: El hook retorna una señal de aprobación para continuar la operación o de bloqueo para denegarla (por ejemplo, cancelando un comando de consola no seguro).

## Detalles técnicos

### Eventos del Ciclo de Vida Soportados

- **SessionStart**: Se ejecuta una vez al iniciar la sesión del chat. Realiza un escaneo preliminar de seguridad del espacio de trabajo (AgentShield) y refresca la caché de metadatos de las herramientas.
- **PreToolUse**: Intercepta toda llamada a herramientas (lectura de archivos, ejecución de comandos). Evalúa el presupuesto de tokens estimados (Token Budget Advisor) y bloquea operaciones de consola no autorizadas o lecturas de secretos.
- **PreCompact**: Se activa antes de que el cliente de IA compacte su historial de conversación para liberar tokens. Genera un resumen compacto del estado actual y lo almacena para evitar pérdidas de contexto.
- **SubagentStop**: Se ejecuta cuando finaliza o se cancela la ejecución de un subagente técnico, registrando el estado final y limpiando archivos temporales.
- **Stop**: Se ejecuta al finalizar la sesión del agente para escribir métricas de rendimiento y asegurar la persistencia en el backend de OpenSpec.

### Variables de Entorno para Bypass (Harness Gates)

Para propósitos de desarrollo o integraciones continuas (CI), es posible desactivar las comprobaciones automáticas configurando variables de entorno en la shell:

- `DISABLE_AGENT_SHIELD=true`: Desactiva por completo el escaneo de claves, credenciales y bloqueos de seguridad de archivos críticos.
- `DISABLE_TOKEN_ADVISOR=true`: Desactiva la estimación y advertencias de consumo excesivo de tokens por archivos pesados.
- `DISABLE_OSPEC_PRECOMMIT=true`: Desactiva la verificación local del espacio de trabajo en los hooks automáticos de Git pre-commit.

## Por qué la arquitectura tiene esta forma

El uso de un único script lanzador (`ospec-hooks-launch.js`) reduce la latencia de arranque al compartir dependencias comunes precargadas y proporciona un punto único para el manejo de excepciones de los hooks, garantizando que un error inesperado en un script de hook no rompa la estabilidad del cliente de IA.

## Puntos de extensión principales

- **Crear un nuevo Hook**: Declarar la clave del evento en `/hooks/hooks.json`, agregar el script de validación bajo `/scripts/hooks/` y exportar una función de control que el lanzador invocará automáticamente.
- **Añadir validaciones personalizadas**: Modificar `/scripts/hooks/pre-tool-use.js` para interceptar comandos adicionales de shell específicos de tu plataforma de despliegue.

## Aspectos a tener en cuenta al editar

- **Presupuesto de Tiempo (Timeout)**: Muchos clientes de IA imponen un límite estricto de tiempo para la ejecución de hooks síncronos (declarado como `timeout: 5` segundos en `hooks.json`). Los scripts de hooks no deben realizar peticiones de red pesadas ni bucles de búsqueda profunda.
- **Entorno de ejecución**: Los hooks se ejecutan bajo la ruta absoluta del plugin (`CLAUDE_PLUGIN_ROOT`). Nunca uses rutas relativas dependientes del directorio de trabajo actual (`process.cwd()`), ya que el usuario ejecutará comandos desde cualquier subdirectorio del repositorio.

## Mapa de fuentes

| Archivo / Directorio | Rol | Evidencia de Git |
| :--- | :--- | :--- |
| [/hooks/hooks.json](/hooks/hooks.json) | Manifiesto de mapeo de eventos de ciclo de vida a scripts de consola. | `422928f` |
| [/scripts/hooks/ospec-hooks-launch.js](/scripts/hooks/ospec-hooks-launch.js) | Lanzador y puente síncrono común para la inicialización de hooks. | `ba82de1` |
| [/scripts/hooks/pre-tool-use.js](/scripts/hooks/pre-tool-use.js) | Lógica de intercepción de herramientas (PreToolUse). | `422928f` |
| [/scripts/hooks/session-start.js](/scripts/hooks/session-start.js) | Inicializador de sesión y escáner de AgentShield (SessionStart). | `422928f` |
| [/scripts/hooks/pre-compact.js](/scripts/hooks/pre-compact.js) | Gestor de persistencia pre-compactación (PreCompact). | `ba82de1` |
| [/scripts/lib/lifecycle-hooks.js](/scripts/lib/lifecycle-hooks.js) | Motor de ejecución interno y abstracción de plataforma para hooks. | `ba82de1` |
