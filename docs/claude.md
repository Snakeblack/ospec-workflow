# Documentación de ospec-workflow

- **Dirección, prioridad y estado:** solo en el [roadmap único](roadmaps/harness-evolution.md). No abras trabajo que no esté allí sin añadirlo antes con la fila de objetivos que mueve.
- **Evidencia:** [`analysis/`](analysis/), con fecha. La auditoría vigente es la del [2026-10-03](analysis/2026-10-03-auditoria-harness-y-gentle-ai.md).
- **Arquitectura:** [`architecture/`](architecture/README.md) queda reservada para la arquitectura vigente de ospec (E2.6). No fija prioridades.
- **Historia:** [`roadmaps/archive/`](roadmaps/archive/), que incluye la arquitectura objetivo del programa K1–K12, nunca es estado vigente.
- **Precedencia ante una discrepancia:** OpenSpec y código, después roadmap, después arquitectura. Se corrige primero la fuente de mayor precedencia.
- **Al cerrar un ítem:** actualizar su fila en el roadmap y la versión de referencia; seguir el flujo de release de `AGENTS.md`.
- **Flujo:** IDD es el flujo por defecto desde E1.6 y SDD un modo opcional. Cada ítem del roadmap se hace con IDD (`node scripts/ospec.js`, cambios en `idd/`); no abras `/sdd-new` salvo que el ítem lo pida.
