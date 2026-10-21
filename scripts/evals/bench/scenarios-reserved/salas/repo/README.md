# rooms-api

API de salas de reuniones para empresas. Cada cliente es una organización
(tenant) y sus datos no pueden verse desde otra organización.

`createApp().handle({ method, path, user, body })` devuelve `{ status, body }`.
El gateway autentica y pasa `user` (`{ id, tenantId }`).

| Ruta | Qué hace |
| --- | --- |
| `GET /rooms` | Salas de la organización del usuario |
| `GET /rooms/:id` | Lee una sala de la organización |

Pruebas: `npm test`.
