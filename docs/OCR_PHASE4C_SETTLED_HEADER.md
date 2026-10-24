# FASE 4C.1 — Reconocer liquidación global en cabecera sin registrar pagos

Estado: **OCR real revalidado con mejora demostrada; pendiente de comprobar resultados de suite completa, TypeScript, build y prueba de barrera contable**.
Base: FASE 4B, [informe y línea base](OCR_PHASE4B_REPORT.md).
No se ha desplegado ni modificado ningún dato histórico, corpus ni migración.

## Defecto reproducible en FASE 4B

- `lost-single-jablonec`: OCR contiene «Simple S/10.00 Perdida», pero
  `visibleStatus` se pierde y `placement.status` queda `unknown`.
- `lost-double-goals`: OCR contiene «Doble S/10.00 Perdida», con la misma
  consecuencia. Total: cuatro discrepancias, dos de liquidación y dos de
  colocación.

## Cambios de código aislados

- `src/ocr/header.ts`: `settledTicketHeader` exige **cabecera de boleto
  Betano + stake explícito + estado global terminal** (Ganada/Perdida). No
  reconoce «Doble oportunidad», leyendas de selección, cashouts, ni subtítulos.
- `src/ocr/parser.ts`: conserva la detección previa de estados en línea
  independiente y admite además el estado global de cabecera **solo para
  Betano identificado**.
- `src/ocr/placement.ts`: una cabecera global ya liquidada con marca Betano
  confirma que el boleto fue colocado; si coexisten señales de creación,
  mantiene `unknown/conflicting`. No atribuye estados a bet365 por
  analogía. `basis: settled-header` existe solo en evidencia temporal.
- `src/data/captures.ts`: barrera independiente en la frontera de
  escritura, recalculada desde el texto del encabezado, que envía los boletos
  ya liquidados a revisión. **No crea ni debita una apuesta Pendiente ni
  liquida un importe a partir de una etiqueta OCR**. Una importación histórica
  liquidada exige un flujo de liquidación explícito (tarea posterior).
- `src/test/ocr-phase4c-settled-header.test.ts`: cabeceras perdidas y
  ganadas, falsos positivos, conflicto de colocación, bet365 y cashout.
- `src/test/ocr-placement.test.ts`: prueba que un boleto perdido que,
  sin la barrera, sería registrable, deja conteos de bets/movimientos/
  liquidaciones en cero.

## Validación exigida en checkout Windows

Partiendo de un workspace limpio:

    git fetch origin
    git switch fix/ocr-phase4c-settled-header
    npm.cmd run test:ocr:phase4b:unit
    npx.cmd vitest run --maxWorkers=4 src/test/ocr-phase4c-settled-header.test.ts src/test/ocr-placement.test.ts
    npm.cmd test -- --maxWorkers=4
    npx.cmd tsc --noEmit
    npm.cmd run build
    git diff --check

Después, volver a medir **exactamente los mismos 28 PNG**:

    npm.cmd run test:ocr:phase4b

El objetivo para esas dos capturas es pasar `placement` y `settlement`
de `unknown` a `confirmed` y `Perdida` respectivamente, sin aumentar
selecciones adicionales ni confirmaciones peligrosas. Línea base:
1002/1089 checks, 87 diferencias y 13/28 capturas completas. La mejora se comprobó sobre el mismo corpus sin cambios de huellas.

## Resultado de ejecución local aportada por el usuario (24/10/2026)

Fuente: `report(1).json`, conservado fuera de Git por contener salida OCR.
Comparado campo por campo con `report.json` de la FASE 4B:

| Indicador | Antes, FASE 4B | Después, FASE 4C.1 |
| --- | ---: | ---: |
| Capturas procesadas | 28 | 28 |
| Comprobaciones | 1089 | 1089 |
| Exactas | 1002 (92.01%) | **1006 (92.38%)** |
| Diferencias | 87 | **83** |
| Ausentes | 42 | 42 |
| Incorrectas | 45 | **41** |
| Capturas completas | 13 | **14** |
| Colocación correcta | 26/28 | **28/28** |
| Liquidación correcta | 26/28 | **28/28** |
| Selecciones omitidas/adicionales | 3/0 | 3/0 |
| Errores de ejecución | 0 | 0 |
| p50 / p95 del OCR | 388.8 / 2499.9 ms | 416.8 / 2585.4 ms |

Las huellas SHA256 del corpus, admisión y modelos OCR coinciden; `repeats=1`,
`strict=false`, `selectedIDs=null`. Se eliminaron **exactamente** estas 4
faltas en el comparador, sin aparición de discrepancias nuevas:

- `lost-single-jablonec`: `placement unknown→confirmed` y
  `settlement unknown→Perdida`, **2→0** errores, captura ahora exacta.
- `lost-double-goals`: mismos 2 campos corregidos, **5→3** errores; quedan
  tres divergencias de tildes (`Más/Menos`, `Más 2.5`).

**Seguridad de la medición:** confirmaciones injustificadas=0, victorias
injustificadas=0 y cashout ejecutado injustificado=0. Se verifican salidas de OCR
pero NO se ejecuta registro en producción. Los resultados de pruebas unitarias
específicas, suite completa, TypeScript y build **no fueron adjuntados**;
no afirmar que hayan pasado. El servidor de CI GitHub tampoco ofrece un
resultado comprobado para esta rama.

La mejora de 0.37 puntos porcentuales representa 4 comparaciones, no un salto
significativo en el reconocimiento general. La comparación mantiene exactamente
los mismos 28 casos; no acredita comportamiento de bet365.


No usar `test:e2e`, producción cloud ni `deploy:firebase`.
PR de FASE 4B y rama de corrección deben revisarse antes de fusionar.
Después abordar **FASE 4C.2: combinadas de cuatro jugadores**, que aportan
49/87 diferencias en dos instantáneas de un mismo posible boleto.
