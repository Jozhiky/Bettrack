# QA de carga aislada

`npm.cmd run test:captures:ui` levanta un servidor temporal y verifica la pantalla
real a 375/768/1440 px con Tesseract local. No requiere credenciales. Usa únicamente
PNG admitidas y desidentificadas del corpus existente; crea JPEG/WebP y un boleto
bet365 sintético en memoria. No publica imágenes nuevas.

El plugin del servidor de pruebas sustituye exclusivamente el adaptador cloud y
Auth. El repositorio, cola, pantallas y frontera financiera siguen siendo reales.
fake-indexeddb vive en RAM, Supabase falla cerrado y Playwright prohíbe red externa.
La demo añade CSP para bloquear conexiones externas también fuera de Playwright.
Estos adaptadores nunca forman parte del build productivo. Las inyecciones de
fallo/cuota ausente son acciones de QA separadas de la medición del OCR.

`npm.cmd run demo:captures` deja la demo en `http://127.0.0.1:5188` (puerto estricto).
Recargar descarta sus datos. Usar solo capturas de prueba desidentificadas.
No es un modo offline productivo ni valida escrituras/sincronización con Supabase.

TypeScript: `npx.cmd tsc -p tests/capture-upload/tsconfig.json`.
Evidencia completa en `test-results/capture-upload/`, ignorada por Git.
Resultados y límites: [validación de carga](../../docs/CAPTURE_UPLOAD_VALIDATION.md).
