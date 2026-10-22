# Capturas y detalle visual · 20/10/2026

## Implementación

- Detalle centrado con estado, número de partidos/mercados, cuota y barras proporcionales de stake y retorno. El potencial está etiquetado como no cobrado. Selecciones, notas OCR y evidencia son desplegables; Ganada/Perdida/Cashout están antes del detalle. El cashout permite escribir el importe dentro del modal.
- Compresión WebP sin pérdida mediante libwebp WASM en un worker local. Misma resolución, comparación de los píxeles decodificados antes de aceptar la conversión, ahorro mínimo 5 %. Si hay diferencias, límites de tamaño, falta soporte o vence el presupuesto de 8 segundos, se conserva el original. No hay servicio remoto de transformación.
- SHA-256 original y del archivo almacenado. Duplicados comparten un archivo dentro de la cuenta; siguen siendo operaciones distintas solo tras la decisión del usuario. Los borrados comprueban referencias de otras apuestas y de la cola.
- Metadatos de tamaño y dimensiones opcionales, compatibles con capturas antiguas y respaldos JSON. El hash del respaldo corresponde a los bytes realmente almacenados.
- Imágenes del detalle descargadas solo al abrirlas; caché LRU de 32 MiB en RAM, vaciada al cambiar sesión. Sin persistencia de datos de negocio en el navegador.
- Configuración muestra archivos únicos, tamaño conocido y ahorro por compresión. Permite eliminar las imágenes de apuestas terminadas tras confirmación, conservando apuestas, selecciones y movimientos. Protege archivos compartidos con pendientes y capturas en revisión. No se ejecuta limpieza automática ni se recomprimen registros antiguos.
- Progreso local de lectura sin escrituras cloud por cada porcentaje; mensajes reales de preparación, subida y confirmación. El registro aparece solo tras confirmar el commit.
- Sincronización conserva Realtime y CAS. La comprobación periódica consulta primero la versión de la cuenta y evita descargar todo el historial si no cambió. Cuando hay cambios todavía se obtiene un snapshot completo: no se implementó sincronización por fila ni paginación desde PostgreSQL en esta entrega.

## Validación

- 97 pruebas unitarias aprobadas, TypeScript y compilación correctos. Persiste el aviso no bloqueante de tamaño del bundle principal.
- Componente real del modal probado a 375, 768 y 1440 px: centrado, scroll interior, cierre fijo, foco, Escape y entrada de cashout.
- Tres imágenes reales comparadas en el navegador: 90.996 → 20.542 bytes; 51.553 → 32.230 bytes; 112.107 → 112.107 bytes (se conservó el original por diferencias de píxeles). Resultado OCR estructurado idéntico en cada comparación; esto prueba que la compresión no cambia la lectura, no que todos los formatos de boleto se reconozcan correctamente. La preparación tomó 133/135/147 ms en esa ejecución local.
- `scripts/verify-capture-storage.mjs` usa una cuenta descartable, carga real y registros financieros sintéticos explícitos para aislar la prueba de almacenamiento del parser. Comprueba un solo objeto para dos apuestas, carga diferida/caché, sincronización entre pestañas, protección de apuestas abiertas y eliminación de Storage sin cambiar finanzas.
- `scripts/verify-capture-removal.mjs` comprueba fallo temporal, reintento, persistencia tras recarga, otra pestaña y ausencia de cambios financieros.
- Evidencia: `test-results/image-optimization.json`, `detail-modal.json`, `capture-storage.json`, `capture-removal.json` y `firebase-live.json`.

## Límites

Las capturas anteriores sin metadatos de tamaño se cuentan pero no se suman al tamaño conocido. El ahorro depende de la imagen y no implica una reducción garantizada en todas las cargas. La lectura OCR sigue siendo por reglas y los formatos no reconocidos permanecen en revisión. No se modificaron apuestas de miembros reales para realizar estas pruebas.
