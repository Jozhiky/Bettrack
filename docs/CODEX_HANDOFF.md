# BETTRACK — continuidad de Codex

Actualizado: 23/10/2026. Leer junto con [AGENTS.md](../AGENTS.md).
Este archivo es el índice de continuidad, no una nueva auditoría ni autorización
para implementar los pendientes. No hace falta recuperar conversaciones antiguas.

## Estado de referencia

- Repositorio: `https://github.com/Jozhiky/Bettrack.git`; rama al preparar este handoff: `main`.
- Workspace habitual Windows: `D:\Apuestas`, PowerShell; usar `npm.cmd` / `npx.cmd`.
- Último commit **funcional auditado**: `915da4bab07c0b9fa11914683d92f9d678fc2c89`
  (FASE 3). Este handoff se publica en un commit documental posterior; consultar
  `git log -1 --oneline` para el HEAD actual, sin volver al commit anterior.
- FASE 3 publicada en GitHub, **sin despliegue**. No asumir que Firebase ejecuta ese
  código. Hosting existente: `https://bettrack-wostcloud1.web.app`.
- Estado verificado en FASE 3: 464 pruebas, TypeScript y build aprobados; UI aislada
  en 375/768/1440 px. Son resultados de esa revisión, no una garantía para cambios futuros.

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

## Límites y próximos pasos posibles

- Corpus: 7 imágenes reales de fútbol, 33 eventos y 57 selecciones semánticas.
  NBA, preparación, aceptación explícita, liquidaciones y cashout ejecutado **sin
  cobertura real**. Las pruebas sintéticas no sustituyen esas capturas.
- Persisten 12 ámbitos desconocidos; 8/11 participantes extraídos, solo uno con
  identidad reconocida. Jugadores, goleador y tarjetas pueden requerir revisión.
- Modo estricto: **7 diferencias literales conocidas**. Históricas:
  `München→Munchen`, `Más/Menos→Mas/Menos`, `Más de 4.5→Mas de 4.5`, `Sí→Si`.
  Nuevas: `VfB→VFB`, `Sí→SÍ`, `Milán→Milan`. No ocultarlas normalizando identidades.
- Cabeceras incompletas/eventos omitidos requieren otra captura; no hay fusión de
  comprobantes. Una relectura no confirma colocación; el resultado inicial del
  registro revisado es Pendiente, sin cobrar automáticamente cashout visible.
- Priorizar, según la próxima instrucción: auditoría independiente de FASE 3,
  ampliar corpus autorizado, mejorar identidad/ámbito con regresiones y medir lotes.
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
