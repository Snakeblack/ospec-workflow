# notes-api

API de notas para equipos. Cada cliente es una organización (tenant) y sus datos
no pueden verse desde otra organización.

`createApp().handle({ method, path, user, body })` devuelve `{ status, body }`.
El gateway autentica y pasa `user` (`{ id, tenantId }`).

| Ruta | Qué hace |
| --- | --- |
| `GET /notes` | Notas del usuario |
| `POST /notes` | Crea una nota (`title`, `body`) |
| `GET /notes/:id` | Lee una nota propia |
| `PUT /notes/:id` | Edita una nota propia |
| `DELETE /notes/:id` | Borra una nota propia |

Pruebas: `npm test`.
