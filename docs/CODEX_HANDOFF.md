# BETTRACK — continuidad de Codex

Actualizado: 24/10/2026. Leer junto con [AGENTS.md](../AGENTS.md).
Este archivo es el índice de continuidad, no una nueva auditoría ni autorización
para implementar los pendientes. No hace falta recuperar conversaciones antiguas.

## Estado de referencia

- Repositorio: `https://github.com/Jozhiky/Bettrack.git`; rama al preparar este handoff: `main`.
- Workspace habitual Windows: `D:\Apuestas`, PowerShell; usar `npm.cmd` / `npx.cmd`.
- Último commit **funcional auditado**: `915da4bab07c0b9fa11914683d92f9d678fc2c89`
  (FASE 3). `main` incorpora después documentación y preparación de FASE 4A;
  consultar `git log -1 --oneline` para el HEAD actual, sin volver al commit anterior.
- FASE 3 publicada en GitHub, **sin despliegue**. No asumir que Firebase ejecuta ese
  código. Hosting existente: `https://bettrack-wostcloud1.web.app`.
- Estado verificado en FASE 3: 464 pruebas, TypeScript y build aprobados; UI aislada
  en 375/768/1440 px. Son resultados de esa revisión, no una garantía para cambios futuros.
- FASE 4B (rama feat/ocr-phase4b-isolated-measurement): banco **aislado y de solo lectura**
  preparado para ejecutar Tesseract real sobre las 28 capturas 4A. Compara OCR
  contra oráculos humanos sin alterar corpus, motor, histórico ni Supabase.
  **Medición real ejecutada por el usuario en Windows** (28/28 PNG, 6/6 pruebas
  sintéticas, 0 fallos de ejecución): 1002/1089 checks exactos (92.01%),
  87 discrepancias (42 ausentes, 45 incorrectas), 13/28 imágenes sin
  discrepancias; 3 selecciones omitidas, 0 adicionales. El porcentaje por
  campo no equivale a exactitud de boletos; faltan suite completa, TypeScript,
  build y revisión de correcciones. Ver [informe 4B](OCR_PHASE4B_REPORT.md)
  y [protocolo](../tests/ocr-phase4b/README.md).
  El usuario identificó preparation-flamengo como **bet365 / Superaumento**;
  sigue fuera del corpus mientras falten marca visible y evidencia de colocación.
  «Cerrar apuesta» no acredita un cashout ejecutado; «Crear apuesta» en ese
  producto no debe inferirse automáticamente como un boleto sin colocar.
- FASE 4A, issue 1: **29 PNG recibidos, 29 distintos, 28 admitidos, 1 pendiente,
  0 rechazados**, sin cambios productivos. Dos pares temporales forman grupos
  probables del mismo boleto: 26 grupos conservadores admitidos, no 26 boletos
  únicos certificados. Originales/ZIP/borradores fuera de publicación.
  Suite completa: 534 pruebas aprobadas; suite 4A + controles 2/2.1: 152 aprobadas;
  TypeScript, build y diff verificados (build avisa de chunks mayores de 500 kB).
  SHA/CRC/PNG/RGBA, privacidad visual, texto y regiones cotejados. No se ejecutó OCR
  ni UI: siguen vigentes sus límites
  documentados. Publicación en GitHub no implica despliegue ni validación cloud.

## FASE 4C.1 — corrección P0 preparada, no validada aún

- Rama `fix/ocr-phase4c-settled-header`, **basada en PR #2 de FASE 4B**.
- Corrige `Ganada/Perdida` global dentro de cabecera de boleto Betano y su
  prueba de colocación, sin extrapolarlo a un mercado perdido.
- Antes de registrar, la frontera de escritura retiene boletos ya liquidados:
  no crea apuesta `Pendiente`, movimientos ni pagos automáticamente.
- Medición OCR real posterior aportada por el usuario: 28/28, **1006/1089
  comprobaciones (92.38%)**, 83 errores, 14/28 capturas completas. Corrigió
  exactamente 4 campos: `placement` y `settlement` en las 2 pérdidas globales.
  0 regresiones detectadas, 0 falsos cashouts/victorias/confirmaciones, corpus y
  modelos OCR sin cambios. La línea base previa era 1002/1089, 87 errores.
- **No se adjuntó evidencia de ejecución de las pruebas específicas de frontera
  de escritura, suite completa, TypeScript ni build**; quedan pendientes de
  comprobación antes de fusionar.
- Detalles y comandos: [informe FASE 4C.1](OCR_PHASE4C_SETTLED_HEADER.md).
- Siguiente fallo independiente: combinadas de cuatro jugadores y cuotas
  desplazadas, FASE 4C.2. No mezclar correcciones sin medición intermedia.

## FASE 4C.2 — jugadores y cuotas desplazadas

- Rama `fix/ocr-phase4c2-player-layout`, basada en FASE 4C.1, sin despliegue.
- **3 trazas OCR reales examinadas** (sin publicar): cuatro jugadores en dos
  instantáneas y doble Kane/Mbappé. Causa: títulos de jugador divididos por
  salto de línea, cuotas flotantes y nombre alternativo no clasificado.
- Corrección propuesta: unir solo continuaciones con paréntesis visible y
  coordenadas compatibles, asociar cuota leída (sin inferir valores), conservar
  nombres conflictivos para revisión y definir semántica explícita de jugador.
- Seis pruebas sintéticas nuevas, incluyendo `readCapture` de dos pasadas.
- Validación pendiente: ejecutar **un solo comando**
  `npm.cmd run test:ocr:phase4c2` en Windows. Incluye suite completa, TypeScript,
  build y banco real aislado de las 28 capturas.
- Baseline anterior: 1006/1089 checks, 83 diferencias, 3 selecciones omitidas,
  0 adicionales; sin valores nuevos medidos todavía.
- Protocolo y diagnóstico: [FASE 4C.2](OCR_PHASE4C2_PLAYER_LAYOUT.md).
- Mantener las PR de fases anteriores en revisión hasta validar el banco y
  las barreras contables; los datos históricos/Supabase/Firebase no se tocan.

## Arquitectura esencial

| Área | Punto de entrada / responsabilidad |
| --- | --- |
| Interfaz | React + TypeScript + Vite/PWA; `src/main.tsx` → `app/auth.tsx` → `app/context.tsx` → `app/App.tsx`; vistas en `src/pages/` |
| Datos | `src/data/repository.ts` usa `cloudDatabase` por defecto, aunque la clase se llame `LocalRepository` |
| Cloud | `src/data/cloudStore.ts`: snapshot por cuenta en memoria, RPC `bt_snapshot`/`bt_commit` con versión y actualización Realtime; imágenes en Storage privado |
| Dominio | `src/domain/model.ts`: esquemas Zod, céntimos, estados y cálculos; apuestas y selecciones relacionadas; Builders con submercados |
| Entrada OCR | `src/data/captures.ts`: carga, cola, `registerCapture`, revisión humana, duplicados y auditoría |
| Extracción | `src/ocr/engine.ts`, `session.ts`, `readCapture.ts`: Canvas + Tesseract.js 7, modelos locales spa/eng, worker reutilizado y reintento por completitud |
| Reconstrucción | `layout.ts`, `header.ts`, `betano.ts`, `parser.ts`, `symbols.ts` dentro de `src/ocr/` |
| Semántica / barreras | `markets.ts`, `semantics.ts`, `semanticReview.ts`, `placement.ts`, `review.ts` dentro de `src/ocr/` |
| Revisión UI | `src/components/CapturePending.tsx` y `CaptureReview.tsx`: motivos, nueva lectura, comprobante independiente, edición acotada y confirmación |

La aplicación vigente requiere Supabase y no guarda apuestas offline en IndexedDB
ni localStorage. Dexie/fake-indexeddb sirven a pruebas aisladas; la PWA cachea recursos
estáticos. No confundir el MVP local histórico con la arquitectura actual.
`placementHold` y revisión viven en `uploads.draftJson`; decisiones en `audit.before/after`.
La FASE 3 no añadió esquemas ni migraciones. Auth usa usuario/contraseña con Supabase;
no tocar credenciales ni probar registros de usuarios reales para tareas OCR.

## Fases completadas (abrir evidencia solo si hace falta)

- FASE 1: corpus, tiempos y tres defectos reproducibles. [Informe](OCR_PHASE1_REPORT.md).
- FASE 2: mercados desconocidos, cuotas ausentes y normalización semántica.
  [Informe](OCR_PHASE2_REPORT.md).
- FASE 2.1: barrera semántica y distinción contextual de «Cerrar apuesta».
  [Informe](OCR_PHASE2_1_REPORT.md).
- Colocación: preparación/confirmada/desconocida, sin escrituras financieras ante
  evidencia insuficiente. [Informe](OCR_PLACEMENT_REPORT.md).
- FASE 3: dos imágenes reales nuevas, viñeta `©` dentro de Builder, conservación
  de evidencia en relecturas/borradores incompletos y revisión explícita auditable.
  [Informe](OCR_PHASE3_REPORT.md), [métricas](OCR_PHASE3_METRICS.json).
- FASE 4A (preparación): [inventario y capturas solicitadas](OCR_PHASE4A_CORPUS.md),
  [admisión, anonimización y comandos](../tests/ocr-phase4a/README.md).
  Contrato con evidencia por campo, carpetas por escenario y protección de 16 archivos
  históricos; oráculos anteriores intactos. Primer período sigue siendo solo sintético.
- FASE 4A (admisión): [decisiones del issue 1](OCR_PHASE4A_ADMISSION.md),
  [registro verificable de 29 candidatos](../tests/ocr-phase4a/admission.json).
  28 copias firmadas después de dos pasadas visuales del mismo asistente, independientes
  de OCR/semillas; 71 apariciones de eventos y 75 hojas. `preparation-flamengo` pendiente
  por casa no visible y colocación ambigua; PNG/borrador fuera de Git. Los nueve borradores
  de entrada no son oráculos. No se alteraron FASE 1/3 ni `legacy.lock.json`.

## Límites y próximos pasos posibles

- Corpus total: **35 PNG de fútbol, 104 apariciones de eventos y 132 hojas**;
  no son boletos/eventos únicos. El lote nuevo contiene 2 pérdidas globales explícitas,
  19 ofertas cashout y 0 cobros. NBA, preparación inequívoca, aceptación textual,
  Ganada global y cashout ejecutado siguen sin cobertura admitida.
- En la medición OCR de FASE 3 persistían 12 ámbitos desconocidos; 8/11 participantes extraídos, solo uno con
  identidad reconocida. Jugadores, goleador y tarjetas pueden requerir revisión.
- Modo estricto: **7 diferencias literales conocidas**. Históricas:
  `München→Munchen`, `Más/Menos→Mas/Menos`, `Más de 4.5→Mas de 4.5`, `Sí→Si`.
  Nuevas: `VfB→VFB`, `Sí→SÍ`, `Milán→Milan`. No ocultarlas normalizando identidades.
- Cabeceras incompletas/eventos omitidos requieren otra captura; no hay fusión de
  comprobantes. Una relectura no confirma colocación; el resultado inicial del
  registro revisado es Pendiente, sin cobrar automáticamente cashout visible.
- Prioridad actual: ejecutar el banco FASE 4B en D:\Apuestas, revisar
  test-results/ocr-phase4b/report.json y establecer línea base ANTES de corregir
  motor o anotar supuestos aciertos. Ejecutar comandos 4B de abajo, sin cloud.
  Ya existe línea base medida en docs/OCR_PHASE4B_REPORT.md: priorizar
  detección de «Perdida» en cabecera y reconstrucción de combinadas de
  jugadores antes de plantear merge o despliegue. No considerar la suite completa
  aprobada: solo se observaron 6/6 tests unitarios y la ejecución OCR 28/28.
- Siguiente prioridad: conectar los 28 casos admitidos al ejecutor OCR aislado en
  una tarea autorizada, conservando las agrupaciones temporales y sin transferir
  aceptación/importes entre imágenes. La suite de admisión no mide precisión OCR.
  Pedir una copia más completa de `preparation-flamengo` con marca/contexto explícito,
  además de NBA/períodos, aceptación, Ganada global y cashout ejecutado.
  Mejorar identidad/ámbito y medir lotes solo en una tarea posterior autorizada.
  No cambiar motor ni prometer aceleración general: mejoró un caso, no todas las medianas.
- Sincronización cloud no se validó en FASE 3. Requiere QA separado, datos sintéticos
  y limpieza controlada antes de ejecutar pruebas de escritura. No iniciar una fase
  nueva ni desplegar por el solo hecho de leer estos pendientes.

## Comandos mínimos

Node 24.x y dependencias del lockfile. Solo para preparar un checkout nuevo:
`npm.cmd ci`; `npm.cmd run assets:ocr`; para auditoría visual/OCR,
`npx.cmd playwright install chromium`. Descargas iniciales; no repetir en cada turno.
Los activos OCR se verifican contra `tests/ocr-phase1/assets.lock.json`; no regenerar
huellas automáticamente si difieren.

```powershell
git status --short
git log -1 --oneline
npm.cmd run dev                         # http://127.0.0.1:5186, puerto estricto
```

La aplicación de desarrollo usa el backend configurado: localhost no implica QA.
Para revisar una compilación existente, `npm.cmd start` usa el puerto 5187 estricto.

Cuando cambie código, ejecutar pruebas enfocadas y las verificaciones pertinentes:

```powershell
npm.cmd test -- --maxWorkers=4
npx.cmd tsc --noEmit
npm.cmd run build                      # compila; no despliega; requiere activos OCR
git diff --check
```

Si cambia OCR/revisión, añadir según alcance:

```powershell
npx.cmd tsc -p tests/ocr-phase1/tsconfig.json
npx.cmd tsc -p tests/ocr-phase3/tsconfig.json
npm.cmd run test:ocr:phase3             # tolera solo discrepancias documentadas exactas
npm.cmd run test:ocr:phase3:strict      # salida 1 mientras existan los 7 fallos conocidos
npm.cmd run test:ocr:phase3:ui          # UI aislada; no escribe en Supabase
npm.cmd run test:ocr:phase4a            # admisión/regresión; sin OCR ni cloud
npm.cmd run test:ocr:phase4b:unit       # controles sintéticos del comparador 4B
npm.cmd run test:ocr:phase4b            # OCR real aislado de las 28 PNG; tarda minutos
npm.cmd run test:ocr:phase4b:strict     # fallará si hay cualquier divergencia literal
```

Reproducción/comparación: [README FASE 3](../tests/ocr-phase3/README.md). No cargar sus
trazas JSON completas salvo para investigar un caso. Salidas locales en `test-results/`,
excluidas de Git. No usar `test:e2e` ni comandos de despliegue como verificación rutinaria.
Para cambios solo documentales, revisar rutas/enlaces/comandos y `git diff --check`.

## Continuar en otra conversación

Abrir este repositorio como workspace y pedir:
«Lee AGENTS.md y docs/CODEX_HANDOFF.md, comprueba Git y continúa con: [tarea concreta].
Consulta únicamente la evidencia necesaria. No despliegues ni modifiques datos históricos».
Antes de actuar, comprobar cambios locales y commits nuevos; el código actual prevalece
sobre cifras antiguas del handoff. Los informes cloud solo se consultan para tareas cloud:
[CLOUD.md](CLOUD.md). `ARCHITECTURE.md` y `QA.md` describen el MVP local histórico.
