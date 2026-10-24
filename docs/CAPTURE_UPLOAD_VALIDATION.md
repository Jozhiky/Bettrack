# Carga de capturas: versión verificable

Validada el 24/10/2026, rama `codex/capture-upload-safe-review`, basada exactamente
en `cfe60aae9967c380016595768ad560fcabc6acb6` (FASE 4C.2 / PR #4).
PR #2, #3 y #4 comprobadas abiertas, sin fusionar. Workspace inicialmente limpio.

## Defectos reproducidos y correcciones

- Dos pruebas nuevas fallaron antes de corregir: un OCR completo terminaba en
  `saved` sin consentimiento y `allowDuplicate=true` permitía un segundo cargo.
- Toda lectura nueva permanece en revisión hasta cotejar datos, abrir su resumen
  exacto y marcar el consentimiento. La frontera exige borrador/imagen vigentes;
  no crea casas, apuestas ni movimientos durante la lectura automática.
- El permiso histórico de duplicados ya no evita el control por imagen y huella
  semántica. Se retira «Registrar como otra apuesta»; vincular conserva capturas,
  stake y resultado. La detección conservadora puede retener dos operaciones
  legítimas idénticas; esta interfaz no permite forzar una segunda operación.
- Cada captura permite consultar casa, tipo, importe, cuota, retorno potencial y
  todas sus selecciones/submercados. Ausencias se muestran como desconocidas.
  La oferta cashout aparece como **no cobrada**. Se separan título y explicación
  de los motivos de revisión para facilitar su lectura en las tarjetas.
- Las cabeceras Betano Ganada/Perdida muestran su retención también en la UI y
  deshabilitan el registro Pendiente, conservando la barrera FASE 4C.1.
- No se cambian Tesseract, modelos, extracción OCR, corpus/oráculos, contabilidad,
  migraciones ni datos históricos. OCR gratuito y local, sin dependencias nuevas.

## Verificación ejecutada

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd test -- --maxWorkers=4` | 581/581, 26 archivos |
| `npx.cmd tsc --noEmit` | aprobado |
| TypeScript de `tests/ocr-phase1`, `tests/ocr-phase3`, `tests/capture-upload` | aprobado |
| `npm.cmd run build` | aprobado; aviso conocido de chunks >500 kB |
| `npm.cmd run test:captures:ui` | flujo completo aprobado a 375/768/1440 px |
| `npm.cmd run test:ocr:phase4b` | 28/28, 1065/1089, 24 diferencias, 0 errores de ejecución |
| `npm.cmd run test:ocr:phase3` | 7 imágenes ×3; solo las 7 diferencias conocidas, paridad 7/7 |
| `git diff --check` | aprobado |

La comparación de las **28 calidades completas por id/repetición**, incluidas
expectativas y valores observados, es idéntica a la referencia 4C.2 del
24/10/2026 07:58:16 UTC. Mismos hashes de corpus/admisión/activos. Siguen 19
diferencias literales, 4 ámbitos y 1 cuota ausente; 16/28 capturas exactas,
0 selecciones omitidas/adicionales y 0 falsos estados financieros. No se ocultan
diferencias en modo estricto. El ejecutor FASE 1/3 ahora exige `review` y cero
apuestas/movimientos sin confirmación; las referencias históricas conservan su
contrato anterior. Sus oráculos OCR no cambian. Los tests de dominio que necesitan
una apuesta guardada realizan una confirmación explícita mediante un helper solo
de pruebas, después de comprobar que la lectura no la ha creado.

La prueba de interfaz usa **Bets, useCaptureInput, enqueueCaptures, la cola,
Tesseract, optimización y confirmCaptureReview reales**. Solo sustituye Auth y el
adaptador cloud por fake-indexeddb en RAM, con Supabase que falla ante cualquier
acceso y red externa bloqueada. Comprueba carga individual/múltiple PNG/JPEG/WebP,
progreso, vista previa, edición de cuota ausente, consentimiento, un solo débito,
duplicado renombrado, retención de Perdida, imagen ilegible recuperable, reintento
de una subida fallida, rechazo de formato y ausencia de desbordamiento horizontal.

JPEG/WebP proceden de recodificación de una PNG admitida. La cuota ausente, imagen
corrupta y fallo temporal de subida son **inyecciones sintéticas explícitas**,
separadas de la medición OCR real. Una imagen **bet365 sintética** pasa por OCR y
permanece en revisión con colocación desconocida: «Cerrar apuesta» no acredita
aceptación ni cobro. Las 28 imágenes reales siguen siendo Betano; no se afirma
precisión real de bet365 ni se admite automáticamente Flamengo.

Evidencia local ignorada por Git: `test-results/capture-upload/report.json`,
`ocr-comparison.json`, `review-{375,768,1440}.png`, `batch-{375,768,1440}.png` y los
informes OCR previos. No se publican capturas ni trazas adicionales.

## Acceso y límites

- Aplicación local: `http://127.0.0.1:5186`, servidor iniciado y pantalla de acceso
  verificada automáticamente sin credenciales ni escrituras. La aplicación normal
  utiliza el Supabase configurado; el usuario inicia sesión para trabajar en su cuenta.
- Demo aislada: `http://127.0.0.1:5188`, servidor iniciado. Sin credenciales, datos en
  RAM y aviso visible; recargar descarta todo. Solo capturas de prueba desidentificadas.
  Para reproducir técnicamente: `npm.cmd run demo:captures`.
- Supabase revisado mediante SELECT de metadatos, sin leer apuestas: proyecto
  activo, tablas `bt_*` con RLS, RPC `bt_snapshot`/`bt_commit` SECURITY INVOKER,
  ejecución permitida a authenticated y denegada a anon. Bucket privado de 15 MiB
  con PNG/JPEG/WebP y políticas de Storage por `auth.uid()` y carpeta del propietario.
  Esto no sustituye una prueba autenticada de escritura/recarga/sincronización.
- No se ejecutó `test:e2e`, no hubo escrituras de producción, migraciones,
  despliegue Firebase ni merge de PR. GitHub y localhost no actualizan el sitio
  alojado. La demo permanece disponible mientras sus procesos locales sigan activos.
