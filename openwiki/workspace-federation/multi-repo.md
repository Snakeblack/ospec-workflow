# Federación de workspaces multi-repo

`sdd-workspace` extiende el ciclo SDD estándar a **workspaces contenedores**
que agrupan varios repositorios miembro (microservicios, microfrontales,
paquetes NuGet). Este dominio cubre el descubrimiento de miembros, el atlas
derivado, los marcadores canónicos por repo, y el baseline federado resumible.

## Detección del contenedor y descubrimiento de miembros

`sdd-workspace` (fase `workspace-explore`) escanea los hijos inmediatos (solo
profundidad 1) del directorio contenedor. Un hijo se reconoce como repo
miembro cuando `.git` está presente, ya sea como directorio o como archivo
(worktree/submódulo de git). Si existe `.gitmodules` en la raíz del
contenedor, se trata como la lista autoritativa de rutas de submódulo; el
escaneo por sistema de archivos es la fuente secundaria — ambas se unen sin
duplicados. Un manifiesto secundario (`package.json`, `*.csproj`, `go.mod`)
puede leerse dentro de cada miembro para inferir el stack tecnológico cuando
no hay otra señal disponible.

## El marcador canónico por miembro

Cada repo federado contiene `openspec/federation.member.yaml` como fuente de
verdad versionada de su identidad de federación:

| Campo | Tipo | Restricción |
| --- | --- | --- |
| `federation.id` | string | Único en todo el roster |
| `member.id` | string | Identifica este repo dentro de la federación |
| `member.role` | string | `primary` \| `secondary` |
| `member.type` | string | `microservicio` \| `microfrontal` \| `nuget` |
| `member.layer` | string | `dominio` \| `common` |
| `member.remote` | string | Debería estar presente; puede faltar en miembros locales |
| `member.provides[]` | object[] | Contratos que expone este miembro (`id`, `consumers`, `surface`) |
| `roster` | object[] | Cada entrada con `{id, remote}` |
| `updated_at` | ISO 8601 | Timestamp de merge |

## El atlas como caché derivada

El "atlas" (`workspace-atlas.js`) es una inversión deliberada: no es la fuente
de verdad, sino una **caché derivada** reconstruible desde los marcadores
canónicos de cada miembro. La operación `enroll` escribe/actualiza el
marcador de un miembro; el atlas se recompone leyendo y fusionando esos
marcadores. Marcadores originados en `workspace-explore` (fase de
descubrimiento) son estructuralmente válidos pero intencionalmente
incompletos (sin `member.remote` ni `roster` completo) — llevan un tag
centinela de "marker hygiene" para suprimir advertencias ruidosas de "no
reconstruible remotamente" que solo tienen sentido para marcadores curados de
producción.

## Baseline federado: orquestación resumible

`federated-baseline-orchestration` cubre el loop que selecciona miembros
brownfield-pendientes (según el atlas) y delega `sdd-baseline` a cada uno
secuencialmente:

- Selecciona miembros por criterio de estado (brownfield/init pendiente).
- Persiste un archivo de estado agregado que permite **reanudar** la
  orquestación entre sesiones sin reprocesar miembros ya completados.
- Itera miembro por miembro, con una política de fallo por miembro que no
  aborta el resto del lote.
- El límite de delegación es de solo lectura + enlace: la orquestación no
  reescribe contratos de otros miembros, solo lee marcadores y delega.

## Baseline general federado

Análisis cruzado de dependencias entre miembros: lee manifiestos de proyecto
(`package.json`, `go.mod`, etc.) de todos los miembros mapeados localmente en
el atlas, extrae nombres y versiones de dependencias, y clasifica el estado
de alineación entre repos (`aligned` cuando todos los miembros que declaran
una dependencia usan la misma versión; desviaciones se reportan como riesgo de
compatibilidad).

## Ruteo del launcher en workspaces federados

El binario Go de hooks (`ospec-hooks.exe`) **no soporta federación**. Cuando
`openspec/config.yaml` declara `backend: workspace-federated`, el launcher
(`scripts/hooks/ospec-hooks-launch.js`) rutea los eventos federation-aware
(`session-start`, `pre-compact`, `stop`) al fallback Node.js — ver
[Runtime de hooks de ciclo de vida](../hooks-runtime/lifecycle.md) para el
detalle completo del ruteo.

## Por qué la arquitectura está diseñada así

Modelar el atlas como caché derivada (nunca fuente de verdad) permite que
cada miembro sea dueño único de su propia identidad de federación —
reconstruir el atlas completo desde marcadores versionados es siempre
posible, incluso si la caché se corrompe o se borra. La orquestación
resumible con estado agregado evita reprocesar miembros ya completados
cuando una sesión larga se interrumpe a mitad de un lote de baseline
federado.

## Principales puntos de extensión

- Agregar un nuevo tipo de miembro: extender el enum `member.type` en la spec
  de marcadores y el lector correspondiente.
- Agregar un nuevo criterio de selección al orquestador de baseline federado:
  extender la lógica de selección de miembros sin tocar el loop de iteración
  secuencial ni la política de fallo.

## Cosas a vigilar al editar

- Nunca tratar el atlas como escribible directamente — toda escritura pasa
  por `enroll` sobre el marcador canónico del miembro correspondiente.
- Un marcador de `workspace-explore` incompleto (sin `remote`/`roster`) es
  válido y esperado — no debe tratarse como error, solo como
  "no reconstruible remotamente" con el tag centinela correspondiente.
- Cambios al schema de `federation.member.yaml` son cross-cutting: afectan a
  todos los repos miembro del workspace, no solo al contenedor.

## Mapa de fuentes

- `/openspec/specs/workspace-explore/spec.md`
- `/openspec/specs/federation-markers/spec.md`
- `/openspec/specs/federated-baseline-orchestration/spec.md`
- `/openspec/specs/federated-general-baseline/spec.md`
- `/openspec/specs/marker-hygiene/spec.md`
- `/scripts/lib/workspace-atlas.js`, `/scripts/lib/workspace-general-baseline.js`
- `/scripts/lib/federation-baseline-orchestrator.js`, `/scripts/lib/federation-explore.js`, `/scripts/lib/federation-marker.js`
- `/skills/sdd-workspace/SKILL.md`, `/agents/sdd-workspace.agent.md`
