# Persistencia y Estado: OpenSpec como Fuente de Verdad

> **En pocas palabras:** Las ventanas de chat de los asistentes de IA son temporales y se borran. En `ospec-workflow`, **el chat nunca es la fuente de la verdad**. Todo lo que se decide, se diseña o se programa se guarda de inmediato en archivos de texto estructurados dentro de la carpeta `openspec/`.

---

## Estructura de un Cambio en `openspec/`

Cuando inicias un cambio (por ejemplo, una nueva funcionalidad llamada `login-oauth`), el sistema crea una carpeta dedicada con todos sus documentos:

```text
openspec/changes/login-oauth/
├── proposal.md        # Qué problema resolvemos y los riesgos asociados.
├── specs/             # Requerimientos detallados y casos de uso.
│   └── auth/spec.md
├── design.md          # Decisiones técnicas y arquitectura.
├── tasks.md           # Lista de tareas desglosadas con control de líneas.
├── apply-progress.md  # Registro del avance y pruebas TDD ejecutadas.
├── verify-report.md   # Informe del evaluador independiente con las pruebas.
└── state.yaml         # Estado actual de la máquina de estados y compuertas.
```

---

## Ventajas de Guardar el Estado en Archivos

- **Inmune a cierres de sesión:** Si tu editor se cierra, la batería se agota o cambias de ordenador, basta con abrir el proyecto y el sistema sabe exactamente en qué fase se quedó.
- **Control de versiones con Git:** Cada decisión y cada avance queda registrado en el historial de Git de tu equipo, facilitando revisiones de código transparentes.
- **Auditoría histórica permanente:** Cuando un cambio se completa y se aprueba, se traslada a `openspec/changes/archive/AAAA-MM-DD-nombre-cambio/` para consulta futura.
