# Federación de Espacios de Trabajo Multi-Repo

El dominio de Federación de Espacios de Trabajo permite coordinar cambios complejos y analizar su impacto en arquitecturas de múltiples repositorios distribuidos. Cuando un proyecto se compone de varios microservicios o plugins dependientes, `ospec-workflow` proporciona un plano de comunicación y un registro de contratos cruzados para asegurar que los cambios en un repositorio no rompan la compatibilidad de sus dependientes.

## Cómo funciona

La federación opera a través de un atlas de dependencias dinámico. Cuando el arnés funciona bajo la ruta `federated` (definida cuando el backend de persistencia se establece como `workspace-federated`), se ejecuta la siguiente lógica:

```
[Cambio en Repositorio A]
          │
          ▼
 [Escaneo de Atlas] ────────► (workspace-atlas.js)
          │
          ▼
 [Análisis de Impacto] ─────► (federation-marker.js)
          ├── Identifica marcas de contratos exportados
          └── Evalúa compatibilidad en repositorios B y C
          │
          ▼
 [Gate de Impacto (Impact)] ──► Alerta al usuario ante incompatibilidades
```

1. **Escaneo del Atlas**: `workspace-atlas.js` mapea la jerarquía de directorios de los repositorios locales y detecta enlaces simbólicos o dependencias mutuas.
2. **Extracción de Marcas (Markers)**: Analiza marcas especiales (`@contract` u otros comentarios de firma de API) en los puntos de integración.
3. **Validación de Impacto**: Si un repositorio A realiza una modificación en la firma de un contrato técnico (por ejemplo, cambios de variables MCP o firma de funciones comunes), calcula si los repositorios B o C sufrirán roturas.
4. **Alerta del Gate**: El gate bloquea la fase de desarrollo si detecta desalineaciones críticas de versión.

## Detalles técnicos

### Registro de Capacidades (Capability Registry)

El módulo `/scripts/lib/capability-registry.js` mantiene un inventario de las capacidades, herramientas y runners disponibles en cada repositorio del espacio de trabajo. Esto permite:
- Evitar suposiciones sobre si un comando de test (como `pytest` o `go test`) funcionará en el entorno local de un repositorio satélite.
- Inyectar de forma inteligente las habilidades (`skills`) y reglas adecuadas dependiendo de las tecnologías que detecte en el subproyecto.

### Abstracción de Contratos

La federación gestiona contratos de dos tipos principales:
- **Contratos de Comportamiento**: Pruebas de integración compartidas que definen cómo deben reaccionar las APIs de los plugins de forma consistente.
- **Contratos de Interface**: Estructuras JSON/YAML que definen la superficie de comandos, parámetros aceptados y esquemas de respuesta MCP del plugin.

## Por qué la arquitectura tiene esta forma

En sistemas distribuidos, el mayor punto de falla son las integraciones. Un desarrollador puede validar localmente que su plugin compila y pasa todas las pruebas individuales, pero al desplegarse de forma conjunta con otros componentes del ecosistema, pueden surgir errores por incompatibilidades de API. La federación traslada estas comprobaciones de integración a la fase más temprana del desarrollo técnico (antes de la implementación), reduciendo drásticamente la latencia de feedback de errores.

## Puntos de extensión principales

- **Agregar soporte para nuevas marcas**: Extender el analizador en `/scripts/lib/federation-marker.js` para dar soporte a anotaciones personalizadas de tu lenguaje de programación (como decoradores TypeScript o anotaciones Java).
- **Ampliar el mapeo de dependencias**: Modificar la clase `WorkspaceAtlas` en `/scripts/lib/workspace-atlas.js` para soportar nuevos manejadores de paquetes y archivos de configuración (como Cargo en Rust o Maven en Java).

## Aspectos a tener en cuenta al editar

- **Aislamiento en Red (Sandboxing)**: El análisis de impacto se realiza localmente escaneando las carpetas del sistema. Evita llamadas HTTP externas pesadas a repositorios de código remotos (como GitHub o GitLab) durante el análisis síncrono para mantener los tiempos de respuesta del gate por debajo de los límites lógicos de tolerancia del chat de IA.
- **Evitar bucles infinitos de dependencias**: Al procesar la estructura jerárquica del atlas, asegúrate de utilizar mecanismos de control de visitas para evitar bucles infinitos en configuraciones con referencias circulares entre repositorios.

## Mapa de fuentes

| Archivo / Directorio | Rol | Evidencia de Git |
| :--- | :--- | :--- |
| [/scripts/lib/workspace-atlas.js](/scripts/lib/workspace-atlas.js) | Analizador de carpetas de proyectos y mapeador de dependencias locales. | `457f385` |
| [/scripts/lib/federation-marker.js](/scripts/lib/federation-marker.js) | Detector y validador de marcas de contratos de integración en el código. | `457f385` |
| [/scripts/lib/capability-registry.js](/scripts/lib/capability-registry.js) | Administrador de capacidades y herramientas locales de cada repositorio. | `457f385` |
| [/scripts/lib/workspace-atlas.test.js](/scripts/lib/workspace-atlas.test.js) | Tests de validación del comportamiento de atlas y dependencias. | `457f385` |
