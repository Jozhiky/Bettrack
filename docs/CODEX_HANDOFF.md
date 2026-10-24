# BETTRACK — continuidad de Codex

Actualizado: 24/10/2026. Leer junto con [AGENTS.md](../AGENTS.md).
Este archivo es el índice de continuidad, no una nueva auditoría ni autorización
para implementar los pendientes. No hace falta recuperar conversaciones antiguas.

## Estado de referencia

- Repositorio: `https://github.com/Jozhiky/Bettrack.git`; rama actual de este trabajo:
  `codex/settled-capture-import`, basada en `main` `5e0e62e`. La cadena #2 → #3 →
  #4 → #5 → #6 fue integrada en ese orden con autorización.
  **SHA desplegado:** `cc4d4ade62693887ef421164be9f6ca1dabb70a2`, versión Hosting
  `4885a8046b5928a0`. Los commits documentales posteriores no cambian esa versión.
- Workspace habitual Windows: `D:\Apuestas`, PowerShell; usar `npm.cmd` / `npx.cmd`.
- Referencia histórica FASE 3: `915da4bab07c0b9fa11914683d92f9d678fc2c89`.
  El despliegue actual incluye las correcciones y barreras de PR #2–#6;
  consultar `git log -1 --oneline` para el HEAD, sin volver a la referencia histórica.
- Hosting productivo: `https://bettrack-wostcloud1.web.app`. **Despliegue verificado
  el 24/10/2026**, únicamente de Hosting, sin cambios en Supabase de producción.
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

## Importación histórica — desarrollo 24/10/2026, sin despliegue

- Ganada/Perdida/Cashout ejecutado pueden confirmarse con su liquidación final en
  una operación atómica del RPC existente. Revisión, fechas históricas, retorno
  realizado, cierre total, vigencia y consentimiento son obligatorios; ofertas y
  parciales no se convierten en cobros. No hay cambios SQL/migraciones ni motor OCR.
- **Mis apuestas → Históricas en revisión** recupera borradores `review/error`
  conservando imagen, OCR y selecciones, sin volver a subir. Resumen y consentimiento
  por boleto, sin confirmación masiva. Apuestas y capturas reales no se tocaron.
- Validación: **613/613**, TypeScript/build, 3/3 controles de destino, 17/17 QA
  previa + 7/7 grupos históricos con persistencia real aislada. Veinte borradores
  antiguos sintéticos + oferta; 7 apuestas/7 liquidaciones/14 movimientos,
  neto −S/40.00, concurrencia y respuesta perdida sin doble cargo.
- UI 375/768/1440 px aprobada. OCR 28/28 conserva **1065/1089, 24 diferencias**,
  0 omisiones/adiciones/falsos estados; calidad y hashes idénticos a la referencia.
  FASE 3 conserva siete divergencias conocidas y paridad 7/7.
- [Contrato, recuperación, pruebas y límites](SETTLED_CAPTURE_IMPORT.md).
  Nuevo comando `npm.cmd run test:settled:qa`; no ejecutarlo simultáneamente con
  `test:persistence:qa`. Publicar PR no despliega; requiere autorización final nueva
  para integrar y publicar Hosting. Supabase productivo intacto.

## Despliegue controlado — 24/10/2026

- Usuario autorizó integrar #2 → #3 → #4 → #5 → #6 y publicar solo Hosting.
  Cinco fusiones verificadas por SHA, padres y árbol; no se borraron ramas.
- Producción en `cc4d4ad`, Hosting `4885a8046b5928a0`. Gates finales: 581/581,
  3/3 controles de destino, TypeScript/build y UI RAM a 375/768/1440 px.
- Verificación pública: 45 hashes, cinco rutas, 15 activos OCR y service worker
  activo/precacheados. Acceso y carga visual con fixtures solo en el navegador;
  ningún login, subida, apuesta o movimiento real generado por la comprobación.
- Supabase productivo intacto. Versión anterior `0f19ae2214920da4` conservada en
  historial y canal `rollback-20261024`; no se ejecutó rollback.
- [Recibo, SHAs, verificación y reversión](PRODUCTION_DEPLOYMENT_2026_10_24.md).

## FASE 4C.1 — corrección P0 heredada y verificada en FASE 4C.2

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
- La validación local de FASE 4C.2 ejecutó la suite completa, incluidas las pruebas
  de frontera de escritura de 4C.1, TypeScript y build. Ambas pérdidas globales
  mantienen colocación/liquidación correctas y la retención de registro.
- Detalles y comandos: [informe FASE 4C.1](OCR_PHASE4C_SETTLED_HEADER.md).
- La corrección de jugadores se mide por separado abajo contra esta línea base.

## FASE 4C.2 — jugadores y cuotas desplazadas

- Rama `fix/ocr-phase4c2-player-layout`, basada en FASE 4C.1, sin despliegue.
- **3 trazas OCR reales examinadas** (sin publicar): cuatro jugadores en dos
  instantáneas y doble Kane/Mbappé. Causa: títulos de jugador divididos por
  salto de línea, cuotas flotantes y nombre alternativo no clasificado.
- Corrección validada: unir solo continuaciones con paréntesis visible y
  coordenadas compatibles, asociar cuota leída (sin inferir valores), conservar
  nombres conflictivos para revisión y definir semántica explícita de jugador.
- Cuatro fallos reproducidos y reparados: guion en `Saint-Germain`, identidad
  exacta de equipos, prefijo Nico Paz sin ámbito inventado y reintento por cuota
  espacial ausente. `completeness` conserva fórmula/umbral; máximo dos pasadas.
  El desempate admite solo cuotas recuperadas sin alterar el resto de la lectura.
- Validación local: `npm.cmd run test:ocr:phase4c2`, **577/577 pruebas** (24 de
  layout/reintento), TypeScript y build aprobados. Banco real: **28/28**, **1065/1089**
  checks correctos; **24** diferencias (1 ausente, 23 incorrectas), **16/28** exactas,
  **0** selecciones omitidas/adicionales y **0** falsos estados financieros.
- Comparación contra 4C.1 (1006/1089, 83 diferencias, 3 omitidas): **59 aciertos
  recuperados, 0 regresiones**, mismos ids/rutas/expected y hashes de corpus,
  admisiones, PNG y activos. FASE 3 también pasa con sus 7 divergencias literales
  conocidas, sin nuevas diferencias y paridad 7/7; tsconfig FASE 1/3 aprobados.
- Pendiente deliberado: Harry Kane en `player-four-early` conserva cuota `null`:
  la segunda pasada recupera 2.30 pero altera un nombre y pierde la oferta cashout.
  Mbappé conserva participante con ámbito desconocido/revisión. Nelson Deossa /
  Troy Parrett siguen como conflicto explícito, sin asumir tachadura.
- Protocolo y diagnóstico: [FASE 4C.2](OCR_PHASE4C2_PLAYER_LAYOUT.md).
- PR #4 lista para revisión del cambio, no para registro automático de todo el
  corpus: quedan 24 diferencias visibles. No fusionar automáticamente las PR;
  datos históricos/Supabase/Firebase, motor, corpus y oráculos intactos.

## Carga segura verificada — 24/10/2026

- [PR #5](https://github.com/Jozhiky/Bettrack/pull/5), rama
  `codex/capture-upload-safe-review`, sobre el commit validado de PR #4
  `cfe60aa`. Corrige dos defectos reproducidos: registro automático sin consentimiento
  y bypass de duplicados mediante `allowDuplicate`. Toda lectura espera confirmación
  explícita; duplicados no admiten un segundo cargo, y liquidados conservan la retención 4C.1.
- UI individual/múltiple PNG/JPEG/WebP, cola/progreso, datos por boleto, corrección,
  errores y reintentos verificados con Tesseract real en QA en RAM a 375/768/1440 px.
- Suite 581/581, TypeScript/build y FASE 3 aprobados. Banco real 28/28:
  1065/1089, mismas 24 diferencias y calidad idéntica campo por campo a 4C.2.
  0 selecciones omitidas/adicionales, 0 falsos estados financieros. bet365 solo
  tiene smoke sintético en este trabajo; no afirmar precisión con capturas reales.
- App local iniciada en 5186 (requiere cuenta; usa Supabase real). Demo aislada
  iniciada en 5188, sin Supabase ni persistencia; `npm.cmd run demo:captures`.
  Supabase revisado solo por metadatos, sin escrituras, cloud E2E ni despliegue.
- Evidencia, comandos y limitaciones: [validación de carga](CAPTURE_UPLOAD_VALIDATION.md).
  Esta revisión se publicó originalmente sobre #4; la integración posterior
  de toda la cadena está documentada en el recibo de despliegue.

## Persistencia real verificada — 24/10/2026

- Publicada en [PR #6](https://github.com/Jozhiky/Bettrack/pull/6), sobre PR #5;
  rama `codex/persistence-readiness`; integrada posteriormente con autorización.
- El usuario autorizó QA en «Jozhiky 2» condicionado a coste cero. Proyecto
  `bettrack-qa-isolated` creado tras cotización 0 USD/mes; organización Free.
  Producción solo se consultó por metadatos/definiciones/configuración pública.
- **17/17 escenarios** con Auth/Storage/RPC/Realtime reales: guardar/recargar,
  segunda sesión, aislamiento entre cuentas, tres formatos, consentimiento,
  duplicados/cargos concurrentes, offline, 503 y respuesta perdida tras commit.
  375/768/1440 px y liquidación manual separada de oferta/potencial aprobados.
- 581/581 unitarias, 3/3 controles de destino, TypeScript/build, UI RAM y OCR real
  aprobados: 1065/1089, mismas 24 diferencias y 0 regresiones. Se estabilizó la
  importación Tesseract del banco Vite con caché por servidor/dependencias explícitas.
- Diferencia previa de esquema: producción permite Simple Builder con varias hojas;
  la migración final cuenta hojas donde producción cuenta filas. QA se alineó
  **solo con la función desplegada**, sin cambiar migraciones ni producción.
- Fixtures/credenciales solo en `.env.qa-isolated.json` ignorado. No usar `test:e2e`
  histórico contra producción. Nuevo ejecutor seguro: `npm.cmd run test:persistence:qa`.
- [Informe, límites y plan de integración/Hosting](PERSISTENCE_PRODUCTION_READINESS.md).
  La integración/publicación fue autorizada y ejecutada después de esta validación;
  ver el recibo de despliegue para el estado productivo actual.

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
- Prioridad actual: uso seguro de la versión publicada y revisión humana de las
  diferencias OCR del informe 4C.2; no reabrir la admisión ni rehacer el motor.
  El banco aislado de 28 PNG ya está ejecutado; no repetir la auditoría de admisión.
  Las 24 discrepancias remanentes son 19 lecturas literales, 4 ámbitos y 1 cuota
  ausente; preservar revisión humana y no resolver identidades con pérdida de tildes.
- Siguiente tarea, solo si se autoriza: evidencia adicional para cuotas/ámbitos
  ambiguos y ampliación real NBA/períodos, aceptación, Ganada global y cashout
  ejecutado. bet365 `preparation-flamengo` continúa fuera de las 28 imágenes.
  Mantener grupos temporales sin transferir aceptación/importes entre instantáneas.
  No cambiar motor ni prometer aceleración general a partir de una sola medición.
- La sincronización ya se validó en el QA aislado autorizado, según el informe de
  persistencia. La integración y Hosting se autorizaron y ejecutaron por separado.
  Siguen prohibidas las escrituras de prueba y cambios de Supabase productivo sin
  autorización específica nueva.

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
