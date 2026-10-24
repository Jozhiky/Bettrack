# Persistencia real en Supabase QA

`npm.cmd run test:persistence:qa` usa el proyecto gratuito aislado autorizado,
**nunca producción**. Ejecuta controles negativos de destino y un build real con
Auth/Storage/RPC/Realtime/OCR, sin mocks de persistencia. Solo el destino público
se sustituye en el build de pruebas, que queda en `test-results/persistence-app`.

Necesita `.env.qa-isolated.json` (ignorado) con los dos fixtures sintéticos
aprovisionados en QA. El ejecutor verifica el destino y las identidades autenticadas
antes de resetear exclusivamente esos fixtures, conservando auditoría. Cierra
sesiones al terminar. No usar miembros reales ni el E2E cloud histórico.

Los PNG/JPEG/WebP se dibujan en memoria y contienen equipos ficticios. No hay
capturas privadas. Informes e imágenes de UI quedan en `test-results/persistence-qa`.
La falta de conexión y el 503 se inyectan solo en el navegador de QA; el commit
cuya respuesta se pierde sí llega al backend QA para comprobar recuperación real.

El entorno copia la definición desplegada de Simple Builder: hay una diferencia
previa respecto de las migraciones versionadas. No cambiar migraciones ni aplicar
la copia a producción. Ver el [informe y plan de entrega](../../docs/PERSISTENCE_PRODUCTION_READINESS.md).
