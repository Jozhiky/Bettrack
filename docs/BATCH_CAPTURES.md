# Carga de capturas por lotes · 20/10/2026

## Cambios

- Preparación de hasta dos imágenes simultáneas; los commits contables conservan su serialización y control de versión.
- Dos lectores OCR reutilizables cuando el navegador informa al menos cuatro núcleos y 4 GiB de RAM. Un lector en dispositivos menores o sin información de memoria.
- Cada archivo falla de manera independiente. La interfaz conserva los archivos fallidos en RAM y ofrece reintentar únicamente esas subidas o descartarlas. Cambiar de sesión elimina ese estado.
- Cada tarea OCR dispone de dos minutos; al excederlos se retira su lector y la siguiente tarea obtiene uno nuevo. Este límite no cubre las descargas previas desde Storage.
- Se mantienen las comprobaciones de sesión, deduplicación, transacciones y protección contra resucitar capturas eliminadas durante la lectura.

## Evidencia

103 pruebas unitarias aprobadas y compilación TypeScript/Vite correcta. Persiste el aviso no bloqueante del tamaño del bundle principal.

`scripts/verify-batch-captures.mjs` carga cuatro imágenes reales con una cuenta temporal, comprueba estados finales, movimientos, duplicados y máximo de lectores activos. Una ejecución comparable en producción pasó de 23.004 ms (un lector) a 19.479 ms (dos lectores): reducción observada de 15,3 %. No es una garantía de rendimiento; depende del dispositivo, imagen y red.

Los resultados OCR completos coinciden exactamente entre ambas ejecuciones: tres apuestas registradas y una captura en revisión. Esta optimización no resuelve todos los formatos que el parser todavía desconoce.

La variante `--fail-one` simula un HTTP 503 de Storage: tres archivos terminan y el botón de reintento recupera únicamente el cuarto. Pasó en desarrollo y producción, sin errores de página ni registros duplicados.

Informes locales: `test-results/baseline.json`, `batch-production.json`, `batch-local.json`, `batch-retry-production.json`. Hosting verificado por hash y login/registro a 375, 768 y 1440 px en `firebase-live.json`.

Publicado exclusivamente en Firebase `hosting:bettrack`, bundle `index-Mlq9AWvp.js`. Dos cuentas sintéticas eliminadas después de retirar sus objetos y revocar sesiones; consulta final `remaining_qa_users=0`. Ninguna apuesta real fue modificada.
