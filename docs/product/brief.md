# Brief de ospec-workflow

## Problema

Un agente de código escribe cambios rápido, pero no recuerda entre sesiones lo que decidió, afirma que algo funciona sin haberlo ejecutado y aplica la misma ceremonia a un typo que a una migración de datos. Quien lo usa acaba vigilando el proceso a mano.

## Usuarios

- **Desarrolladores** que trabajan con un agente de código en uno de los hosts soportados (cinco targets) y quieren que cada cambio cierre con evidencia.
- **El agente del host**, que sigue las skills y llama al CLI `ospec`.
- **El mantenedor de ospec**, una sola persona que trabaja con agentes.

## Objetivos

1. Cada cambio deriva sus obligaciones de su impacto y cierra solo con evidencia que el harness observa.
2. Un cambio se reanuda desde el disco en cualquier sesión, con el mismo siguiente paso.
3. La arquitectura del proyecto (conocimiento, ADR, mapa de componentes) se captura una vez y cada cambio la consulta.
4. El mismo comportamiento en todos los hosts soportados, generado desde una única fuente.

## Medidas de éxito

El roadmap [`harness-evolution`](../roadmaps/harness-evolution.md) fija los criterios de cierre de cada etapa; la Etapa 4 define los benchmarks que comparan ospec con otros harnesses. Este brief no inventa números.

## Fuera de alcance

- Operar servicios, alojar datos o sustituir el CI y el control de versiones del proyecto.
- Elegir el modelo de lenguaje o el host del usuario.
- Garantizar la corrección del código: ospec exige evidencia, no la sustituye.

## Contexto de equipo

Un mantenedor con agentes (respuesta del usuario, 2026-10-11). Eso favorece la generación desde una fuente única ([ADR 0001](../architecture/decisions/0001-generacion-multi-target-desde-una-fuente.md)), las reglas en código con tests ([ADR 0003](../architecture/decisions/0003-algoritmos-en-el-cli.md)) y la revisión acotada ([ADR 0007](../architecture/decisions/0007-revision-acotada.md)): ninguna depende de que alguien recuerde una convención.
