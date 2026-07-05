# Verificación y Puertas de Calidad

El dominio de Verificación y Puertas de Calidad asegura que ningún código nuevo sea aprobado y archivado sin evidencia empírica de correcto funcionamiento. La fase `/sdd-verify` impone la barrera de control más estricta del flujo técnico, evaluando la ejecución de suites de pruebas unitarias, análisis estático, cobertura y conformidad de arquitectura con respecto al diseño original.

## Cómo funciona

Cuando se invoca `/sdd-verify` (o como paso obligatorio previo a `/sdd-archive`), el sistema ejecuta la siguiente secuencia de validación:

```
[Inicio de Verificación]
          │
          ▼
 [Ejecución de Pruebas] ────► (node --test scripts/**/*.test.js)
          │
          ├──► FALLA: Detiene el flujo técnico y reporta errores.
          ▼
 [Evaluación de Quality Gates]
          ├── tests (Asegura ejecución exitosa y cobertura mínima)
          ├── lint (Verificación estática opcional)
          ├── architecture (Consistencia de dependencias)
          └── security (Escaneo de vulnerabilidades)
          │
          ▼
 [Generación de Reporte] ───► (verify-report.md)
```

1. **Ejecución del Runner**: Invocación automática de la suite de pruebas mediante el comando de test del repositorio (en este caso, el Node.js Native Test Runner).
2. **Auditoría de Quality Gates**: El motor de validación (`quality-gates.js`) evalúa cada una de las compuertas configuradas.
3. **Traceability Matrix (Matriz de Trazabilidad)**: Asocia de forma cruzada cada requerimiento (`REQ-*`) con los escenarios de prueba escritos en el código, verificando cobertura total de la especificación.
4. **Veredicto final**: Genera un archivo detallado de auditoría (`verify-report.md`). Si alguna compuerta crítica marcada con `on_fail: halt` falla, se bloquea la transición a `/sdd-archive`.

## Detalles técnicos

### Configuración de Pruebas en el Repositorio

El runner nativo está configurado en `/openspec/config.yaml` bajo el bloque `testing`:
- **Runner**: `node` (Node.js nativo para tests, sin librerías externas pesadas).
- **Test Command**: `npm test` (que a su vez mapea a `node scripts/check.js`).
- **Raw Command**: `node --test scripts/**/*.test.js`.

### Strict TDD (Test-Driven Development Estricto)

Cuando la directiva `strict_tdd: true` está activa en la configuración del proyecto, el arnés impone una disciplina férrea durante la implementación:
1. **Red Phase (Fase Roja)**: Al agregar una tarea en `/sdd-apply`, primero debes crear o modificar los archivos de tests (`*.test.js`). El orquestador ejecuta las pruebas para asegurar que fallen (deben estar en "rojo").
2. **Green Phase (Fase Verde)**: Posteriormente, se escribe el código de producción hasta que la suite pase a exitosa ("verde").
3. **Refactor Phase (Refactorización)**: Se optimiza la estructura garantizando que el suite continúe en estado exitoso.

## Por qué la arquitectura tiene esta forma

En el desarrollo tradicional, las pruebas y las especificaciones a menudo se tratan como tareas secundarias que se realizan "si queda tiempo". Al integrar la ejecución de tests directamente dentro del flujo de transición de estados de la IA (fase de verificación síncrona), garantizamos que no sea posible declarar una iteración como "finalizada" sin antes contar con el respaldo de pruebas automatizadas funcionales y consistentes.

## Puntos de extensión principales

- **Definir una nueva compuerta de calidad (Quality Gate)**: Agregar la clave del gate (por ejemplo, `security`) bajo `quality_gates` en `/openspec/config.yaml` especificando su comando (`command`) y comportamiento ante fallas (`on_fail: halt`).
- **Adaptar a otro runner**: Cambiar los comandos de ejecución del bloque `testing` de `/openspec/config.yaml` si migras el repositorio a TypeScript/Jest o a otro lenguaje.

## Aspectos a tener en cuenta al editar

- **Evitar la alucinación de evidencia**: El subagente `/sdd-verify` debe verificar la salida real del comando de consola. Nunca completes la verificación asumiendo que las pruebas "debieron haber pasado" sin ejecutar la suite.
- **Trazabilidad de REQ**: Asegúrate de incluir etiquetas `REQ-sdd-document-*` en los bloques descriptivos de tus archivos de tests para que la matriz de trazabilidad pueda vincular las especificaciones del diseño con tus casos de prueba reales de forma automatizada.

## Mapa de fuentes

| Archivo / Directorio | Rol | Evidencia de Git |
| :--- | :--- | :--- |
| [/scripts/check.js](/scripts/check.js) | Suite central e integrador de tests de todo el repositorio. | `457f385` |
| [/scripts/lib/quality-gates.js](/scripts/lib/quality-gates.js) | Motor de validación declarativa de compuertas de calidad. | `457f385` |
| [/agents/sdd-verify.agent.md](/agents/sdd-verify.agent.md) | Definición y prompt del agente validador técnico. | `1729` |
| [/scripts/lib/quality-gates.test.js](/scripts/lib/quality-gates.test.js) | Tests de validación y comportamiento de los gates de calidad. | `457f385` |
