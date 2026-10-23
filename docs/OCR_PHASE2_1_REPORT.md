# BETTRACK — FASE 2.1: endurecimiento del registro OCR

Fecha: 22/10/2026. Base exacta: `1883b0c7498ecd3e6d37b7bbaaf7c022d2a498e8`.

**Ambos riesgos se reprodujeron y corrigieron.** La suite completa pasa **410/410**
pruebas (17 archivos), sin pruebas omitidas ni fallos declarados esperados.
No se desplegó Firebase, no se ejecutaron migraciones ni operaciones contra Supabase,
no se modificaron registros históricos y no se inició FASE 3.

## Evidencia anterior a las correcciones

Primero se añadieron 26 pruebas sin modificar producción: **14 fallaron y 12 pasaron**.
Ocho comprobaciones semánticas obtenían `saved` en lugar de `review`; seis comprobaciones
de cashout interpretaban incorrectamente una acción como oferta. Se preservó la salida
local en `test-results/ocr-phase21/before.json` (excluida de Git).

Después se amplió el conjunto a 31 pruebas. Para comprobar su poder de regresión,
se extrajo de nuevo el commit base con `git archive`, se copió únicamente el archivo
de pruebas final y se ejecutó en un directorio aislado: **18 fallaron y 13 pasaron**.
Con la corrección, las mismas 31 pruebas pasan. Los 18 fallos son comprobaciones,
no 18 causas raíz independientes. La prueba de historial fallaba por clasificar
el nuevo borrador ambiguo como duplicado; no demostró modificación del historial.

| Riesgo | Causa verificada | Corrección mínima |
| --- | --- | --- |
| Confianza semántica desconectada | `interpretMarket` emitía `scope: unknown` / participante en revisión, pero `parseTicket.reviewReasons` solo tomaba motivos de reconstrucción. `registerCapture` no consultaba interpretaciones; Zod aceptaba cadenas completas. | Política compartida de revisión, aplicada al parser y recalculada desde selecciones originales antes de crear apuestas. No se confía en metadatos antiguos/vacíos ni en una etiqueta `high` aportada por el borrador. |
| «Cerrar apuesta» confundido con oferta | `labeled` buscaba indistintamente `cash out`, `cerrar apuesta` y `cobrar` en todo el texto. | Un botón genérico exige un rótulo explícito «Cashout disponible/ofrecido» en las dos líneas anteriores, sin ejecución en ese contexto ni encabezado de creación/confirmación. El botón aislado o de creación no produce oferta. |

La oferta **ya no provocaba liquidación automática en la base**: esto no era un defecto
contable. Las pruebas existentes de Pendiente/Ganada/Perdida/Cashout ejecutado siguen
exigiendo liquidación explícita y el banco real mantiene cero liquidaciones automáticas.

## Reglas selectivas y compatibilidad

- Revisar un mercado sin familia reconocida, un participante presente pero sin identidad
  verificada, o un ámbito explícito equipo/jugador sin participante identificado.
- Revisar un ámbito desconocido en estadísticas cuyo significado depende de él: goles,
  córners, remates, remates al arco, atajadas, asistencias, puntos, rebotes, combinación
  de puntos/rebotes/asistencias, goleador y tarjetas. No completar el ámbito por defecto.
- **No bloquear solo por deporte/período ausentes, operador no modelado o confianza
  OCR global `review`.** Los totales del partido no necesitan participante; un hándicap
  conservado puede tener ámbito no clasificado. No se aplica un veto a cualquier
  atributo `missing` o `review`.
- Se prueban córners de equipo/primer tiempo, goles de equipo/partido, remates/remates
  al arco, puntos de equipo/primer período y Builders. No se fusionan identidades por
  tildes. NBA y pantallas de confirmación se prueban con evidencia controlada, no con
  nuevas capturas reales.
- `CASH OUT` con importe sigue siendo evidencia explícita de oferta; también se reconoce
  «Cashout disponible/ofrecido» con importe. No se convierte en dinero cobrado.
  Las restricciones de contexto anteriores se aplican a los botones genéricos.
- El texto original, selecciones, cuotas e importes se conservan. Un rechazo guarda
  borrador y motivo; no crea apuesta, movimiento, casa ni liquidación. Las capturas
  previamente guardadas/vinculadas conservan el retorno temprano y no se reescriben.

**Impacto deliberado en el corpus:** `player-builders` pasa de `saved` a `review`.
Sus siete nombres se conservan, pero el intérprete no verifica jugador frente a equipo.
El nuevo modo de auditoría exige exactamente siete interpretaciones/motivos y comprueba
ámbito desconocido, participante presente y confianza de participante en revisión.
Los otros cuatro boletos siguen en `saved`; ambas inyecciones y los tres controles
estructurales problemáticos siguen en revisión con cero registros financieros.
No se cambiaron imágenes, transcripciones esperadas ni diferencias ortográficas aceptadas.
El ejecutor histórico `--phase2` detecta este cambio de registro; no se relajó silenciosamente.

## Archivos

| Archivo | Motivo |
| --- | --- |
| `src/ocr/semanticReview.ts` (nuevo) | Interpretaciones por ruta y política selectiva compartida. |
| `src/ocr/parser.ts` | Propagar motivos semánticos y contextualizar botones de cashout. |
| `src/data/captures.ts` | Recalcular la revisión desde evidencia original antes de cualquier alta. |
| `src/test/ocr-phase21.test.ts` (nuevo) | 31 regresiones, controles positivos e invariantes históricos en RAM. |
| `scripts/ocr-phase1/run.mjs` | Modo separado `--phase21`, con comprobación explícita del cambio de registro. |
| `package.json` | Dos comandos de auditoría; ninguna dependencia nueva. |
| `tests/ocr-phase1/README.md` | Instrucciones del nuevo modo. |
| `docs/OCR_PHASE2_1_REPORT.md` (nuevo) | Este informe. |

## Verificaciones

| Verificación | Resultado |
| --- | --- |
| 31 pruebas nuevas sobre el commit base, copia aislada | 18 fallidas, 13 aprobadas: reproducción confirmada. |
| Suite completa actual | **410 aprobadas**, cero fallidas/omitidas/pendientes; incluye las 379 anteriores. |
| TypeScript aplicación y banco OCR | Aprobado. |
| Build | Aprobado; permanece el aviso existente de bundle mayor de 500 kB. |
| Auditoría FASE 2.1 | 15 lecturas reales (5 imágenes × 3), dos inyecciones y cinco geometrías; cero diferencias inesperadas. |
| Paridad con/sin instrumentación | 5/5, tanto interpretación como registro. |
| Aislamiento | Cero intentos de red externa; hashes de producción idénticos antes/después de medir; registro en fake-indexeddb RAM. |
| Modo literal estricto, una repetición | **Código 1**, únicamente por los cuatro errores conocidos; no se omiten ni se corrigen en el evaluador. |

La precisión literal sigue igual: cabecera 5/5 por campo; eventos 12/13; mercados 23/24;
selecciones 22/24; cuotas individuales 13/13; cantidades 18/18 y cashout ofrecido 4/4.
Se mantienen documentados **München → Munchen**, **Más/Menos → Mas/Menos**,
**Más de 4.5 → Mas de 4.5** y **Sí → Si**.

No se optimizó el motor ni los reintentos. Las mediciones se conservan en los reportes
locales, pero esta ejecución coincidió con otras verificaciones y cambió una decisión
de registro: no sustenta una comparación de velocidad ni de latencia cloud.

## Reproducir

```powershell
npm.cmd test -- --maxWorkers=4
npx.cmd tsc --noEmit
npx.cmd tsc -p tests/ocr-phase1/tsconfig.json
npm.cmd run build
npm.cmd run test:ocr:phase21
$env:OCR_REPEATS = '1'
npm.cmd run test:ocr:phase21:strict # Código 1 por las cuatro diferencias literales
Remove-Item Env:OCR_REPEATS
git diff --check
```

Para reproducir el defecto, extraer el commit base en otra carpeta, copiar desde esta
fase solo `src/test/ocr-phase21.test.ts`, instalar sus dependencias y ejecutar
`npm.cmd test -- src/test/ocr-phase21.test.ts`. Resultado esperado: 18 fallos / 13 éxitos.
La verificación realizada usó una copia obtenida con `git archive` y las mismas
dependencias instaladas mediante una unión local de directorios, sin tocar el checkout.
Los recursos OCR locales y Chromium se preparan según el README del corpus.
Los resultados detallados van a `test-results/ocr-phase21/` y `ocr-phase21-strict/`,
excluidos de Git; los informes históricos de FASES 1 y 2 permanecen intactos.

## Límites pendientes

No hay padrón de jugadores ni confirmación semántica individual en la interfaz actual.
Una nueva lectura puede seguir requiriendo revisión aunque el nombre sea legible;
esta fase no inventa identidades para desbloquear el registro. La política depende
de los atributos actuales: no garantiza detectar toda ambigüedad que el intérprete
clasifique erróneamente como reconocida. Las pantallas mezcladas y otros textos de
confirmación requieren nuevos casos antes de ampliar reglas. No se validó RLS ni
sincronización contra producción; tampoco se modificaron esquemas o contabilidad.
