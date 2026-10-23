# FASE 3 — capturas reales y revisión segura

Base de producción: `d54d5eb52651da13809e9c623fac054ad01a402a`.

## Muestra y privacidad

Se añaden **dos PNG reales** al corpus anterior de cinco. Son combinadas de 9 y 11
partidos, con Bet Builders. Anotación visual independiente en `cases.json`; SHA-256
y procedencia por imagen. Desidentificación por selección: sin titular, cuenta,
correo, ID de boleto, QR ni credenciales; eliminación de metadatos PNG sin alterar
píxeles. Se conservan solamente participantes públicos y datos deportivos necesarios.
Una captura liquidada disponible contenía ID de boleto y **se excluyó**.

Total: 7 imágenes únicas, 33 partidos, 57 selecciones semánticas (un Builder se
descompone en sus mercados). Una simple, seis combinadas, cuatro con Builders.
Hay fútbol, mercados de jugador/equipo/partido, goles, córners y tiros al arco;
una imagen muestra juego en vivo. No hay evidencia real nueva de NBA, remates
fuera del arco, preparación, comprobantes explícitos de aceptación, liquidación
ni cashout ejecutado. Los seis cashouts visibles son **ofertas**. No inferimos
una liquidación ni un período completo a partir de su ausencia.

`semantics.json` es una anotación humana aparte para estadística, ámbito,
participante, período y estados. No llama al intérprete de producción. El período
no especificado se evalúa como abstención, separado del período explícito.
`eleven-builders.ocr.json` conserva la primera salida real de Tesseract de esa PNG;
no es una geometría sintética ni sustituye la ejecución completa del OCR.

## Ejecutar (sin credenciales ni cloud)

Requisitos: dependencias del lockfile, Chromium y activos OCR locales verificados
con `tests/ocr-phase1/assets.lock.json`. Preparación descrita en el README de FASE 1.

```powershell
npm.cmd test -- --maxWorkers=4
npx.cmd tsc --noEmit
npx.cmd tsc -p tests/ocr-phase1/tsconfig.json
npx.cmd tsc -p tests/ocr-phase3/tsconfig.json
npm.cmd run test:ocr:phase3
npm.cmd run test:ocr:phase3:strict
npm.cmd run test:ocr:phase3:ui
npm.cmd run build
```

Tres repeticiones de tiempo por imagen por defecto; `OCR_REPEATS=1` para diagnóstico.
Cada imagen se evalúa **una vez para precisión**. El servidor de auditoría bloquea
peticiones externas, reemplaza Supabase por un objeto que falla ante cualquier
acceso y usa IndexedDB efímero en RAM. La UI reemplaza acciones por dobles de prueba;
no valida sincronización real. No ejecutar `test:e2e`: pertenece a otro entorno.

`test:ocr:phase3` exige exactamente las discrepancias revisadas de
`known-failures.json`, sin tolerar errores nuevos. **No significa precisión perfecta**.
El modo estricto falla ante cualquier diferencia, incluidas las conocidas.
Persisten los cuatro errores literales históricos y tres diferencias nuevas:
`VfB→VFB`, `Sí→SÍ`, `Milán→Milan`. No se normalizaron las expectativas para ocultarlas.
Los siete fallos permanecen en métricas e informe. Las pruebas de seguridad no están
omitidas ni marcadas `it.fails`.

## Reproducir la referencia en el commit base

Usar una carpeta de salida **nueva**; no borrar un checkout existente. Ejemplo de la
extracción usada en esta auditoría (las rutas de junction deben ser absolutas):

```powershell
git archive --format=tar --output=test-results/phase3-base.tar d54d5eb52651da13809e9c623fac054ad01a402a
New-Item -ItemType Directory test-results/phase3-base
tar -xf test-results/phase3-base.tar -C test-results/phase3-base
Copy-Item scripts/ocr-phase1/run.mjs test-results/phase3-base/scripts/ocr-phase1/run.mjs
Copy-Item tests/ocr-phase3 test-results/phase3-base/tests/ocr-phase3 -Recurse
New-Item -ItemType Junction test-results/phase3-base/node_modules -Target (Resolve-Path node_modules)
New-Item -ItemType Junction test-results/phase3-base/public/ocr -Target (Resolve-Path public/ocr)
node test-results/phase3-base/scripts/ocr-phase1/run.mjs --phase3 --reference
npm.cmd run test:ocr:phase3
npm.cmd run test:ocr:phase3:compare
```

Solo se copia el ejecutor y el corpus; el código productivo de la referencia sigue
siendo el del commit base. `reference-known-failures.json` conserva los 10 errores
adicionales de las dos imágenes antes de la reparación; incluye la división falsa
del último Builder. Las 3 repeticiones y la paridad sin instrumentación son obligatorias
para comparar tiempos publicados. El comparador comprueba imágenes, modelos y lockfile
(acepta únicamente LF/CRLF diferentes). Genera `docs/OCR_PHASE3_METRICS.json`.

Los JSON de mediciones completas, logs, imágenes de UI y checkout base quedan en
`test-results/`, fuera de Git. No hay secretos ni datos del usuario en este corpus.
Para añadir otra imagen ya revisada visualmente:
`node scripts/ocr-phase1/import-reviewed.mjs <id-anotado> <PNG-autorizado> --phase3`.
Nunca actualizar las expectativas desde la salida del OCR automáticamente.
