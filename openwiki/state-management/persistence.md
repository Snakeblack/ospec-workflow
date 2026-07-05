# Estado OpenSpec y Persistencia

El dominio de Estado y Persistencia constituye el cerebro de almacenamiento de `ospec-workflow`. Asegura que la especificación de requisitos, el diseño técnico, la planeación de tareas y el progreso de la implementación no se pierdan cuando finaliza una sesión de chat o cuando el contexto de la IA se compacta. Toda la información clave vive en archivos del repositorio, garantizando consistencia, trazabilidad e historial versionable.

## Cómo funciona

El sistema opera bajo el principio de que **el repositorio es la memoria**. Cuando se ejecuta una fase, el estado se actualiza siguiendo este flujo:

```
[Ejecución de Fase SDD]
           │
           ▼
[Generación de Entradas] ────► (Ej. specs, diseño técnico, tareas)
           │
           ▼
[Gestor de Persistencia] ───► (artifact-store.js)
           │
           ├──► [Almacenamiento Local] ────► (openspec/changes/{nombre-cambio}/)
           │                                   ├── state.yaml (Metadatos de estado)
           │                                   ├── proposal.md (Propuesta técnica)
           │                                   ├── tasks.md (Estructura de tareas)
           │                                   └── apply-progress.md (Avance)
           ▼
[Backend de Respaldo] ──────► (Opcional: Engram persistent memory)
```

1. **Recuperación de Estado**: Al iniciar, `ospec-state.js` busca el archivo de estado `state.yaml` correspondiente al cambio activo.
2. **Lectura de Artefactos**: Recupera los documentos complementarios asociados (como las especificaciones o la propuesta).
3. **Actualización de Transiciones**: A medida que los subagentes completan tareas, marcan ítems en `tasks.md` y registran las transiciones en `state.yaml`.
4. **Cierre de Ciclo**: Durante la fase final `/sdd-archive`, el gestor copia el estado de la carpeta de cambio activa hacia `/openspec/changes/archive/{fecha-cambio}/` y limpia el espacio de trabajo temporal.

## Detalles técnicos

### Modos de Almacenamiento (Artifact Store Modes)

`ospec-workflow` soporta cuatro modos declarativos de almacenamiento configurables en `/openspec/config.yaml`:

- **openspec**: Modo predeterminado basado puramente en archivos de texto Markdown y YAML dentro del subdirectorio `/openspec/changes/`. Favorece el control total del código fuente y facilita las revisiones mediante Pull Requests.
- **engram**: Almacenamiento en memoria semántica persistente entre sesiones a través de llamadas de herramientas del sistema (MCP Engram). Reduce el ruido de archivos temporales en el espacio de trabajo local.
- **hybrid**: Combina ambos mundos escribiendo tanto archivos locales como guardando observaciones en la base de datos de Engram, lo cual maximiza la redundancia y resiliencia.
- **none**: Modo efímero. Retorna los resultados únicamente en línea a través de la consola del chat sin persistencia física.

### El Archivo `state.yaml`

Es el manifiesto estructurado de la iteración. Contiene campos clave:
- `change`: Nombre único del cambio técnico.
- `route`: La ruta de orquestación asignada (ej. `standard` o `lite`).
- `phase`: Fase técnica activa actualmente.
- `status`: Estado del flujo (`blocked` o `active`).
- `metadata`: Estadísticas de la iteración (fechas de inicio, coste estimado de tokens, etc.).

## Por qué la arquitectura tiene esta forma

El chat del modelo de lenguaje es inherentemente volátil: al iniciar un nuevo chat o realizar un "compactado" de contexto, la IA olvida todo el historial previo. Al escribir el estado estructurado y los artefactos de diseño en archivos del repositorio, garantizamos que cualquier agente (o desarrollador humano) pueda retomar el trabajo exactamente en el punto en el que se dejó ejecutando simplemente un comando (`/sdd-continue`).

## Puntos de extensión principales

- **Agregar metadatos al estado**: Modificar la estructura y validadores del estado en `/scripts/lib/ospec-state.js` para registrar métricas adicionales del proyecto.
- **Implementar un nuevo backend de base de datos**: Extender el adaptador en `/scripts/lib/artifact-store.js` para dar soporte a un backend de almacenamiento en la nube (como S3 o bases de datos NoSQL).

## Aspectos a tener en cuenta al editar

- **Tolerancia a Fallos (Escritura Atómica)**: El módulo `/scripts/lib/atomic-write.js` envuelve la persistencia de archivos. Nunca escribas directamente con `fs.writeFileSync` sin asegurar un mecanismo de guardado temporal y renombrado atómico, para evitar la corrupción de archivos si el proceso es interrumpido bruscamente.
- **Compatibilidad YAML**: Al generar o actualizar `state.yaml` de forma automática, asegúrate de escapar correctamente caracteres especiales y preservar estrictamente la identación de espacios para evitar errores de lectura parser.

## Mapa de fuentes

| Archivo / Directorio | Rol | Evidencia de Git |
| :--- | :--- | :--- |
| [/scripts/lib/ospec-state.js](/scripts/lib/ospec-state.js) | Lógica de procesamiento de metadatos, parsing de frontmatter y estados. | `457f385` |
| [/scripts/lib/artifact-store.js](/scripts/lib/artifact-store.js) | Adaptador común de backend de persistencia (Local vs Engram). | `457f385` |
| [/scripts/lib/atomic-write.js](/scripts/lib/atomic-write.js) | Proveedor de utilidades de escritura a disco a prueba de fallas síncronas. | `457f385` |
| [/scripts/lib/ospec-state.test.js](/scripts/lib/ospec-state.test.js) | Suite de pruebas unitarias para el gestor de estado OpenSpec. | `457f385` |
