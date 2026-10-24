# FASE 4C.1 — Reconocer liquidación global en cabecera sin registrar pagos

Estado: **corrección implementada en rama, pendiente de pruebas locales**.
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
1002/1089 checks, 87 diferencias y 13/28 capturas completas. La mejora
solo será real tras comprobar el informe regenerado; no se fingen cifras.

No usar `test:e2e`, producción cloud ni `deploy:firebase`.
PR de FASE 4B y rama de corrección deben revisarse antes de fusionar.
Después abordar **FASE 4C.2: combinadas de cuatro jugadores**, que aportan
49/87 diferencias en dos instantáneas de un mismo posible boleto.
