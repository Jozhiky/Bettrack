# Acuerdo OCR de Más/Menos y selección elegida

26/10/2026. Rama `codex/over-under-ocr-agreement`, sobre `9cd51d8` del PR #15.

## Defecto reproducido y corrección

El usuario aclaró que «Más/Menos» es el nombre del mercado y «Más de 1.5»
la opción elegida. El parser ya conservaba ambos campos por separado, pero el
acuerdo de dos pases rechazaba `Más` frente a `Mas` aunque el operador, línea,
mercado y todos los demás términos coincidieran.

`automaticEvidence.ts` ahora canoniza únicamente `Mas/Menos` en el vocabulario
del mercado y `Mas de <número>` en la selección numérica. Exige interpretación
reconocida de partido o equipo identificado exactamente. Conserva literalmente
el resto del mercado, la línea, el período, las cuotas y los participantes;
protege el nombre del participante tanto al principio como al final del mercado.
Cada mercado interno del Builder se compara por separado y en el mismo orden.

No convierte «Más» en «Menos», ni una cabecera de mercado en una selección.
No elimina tildes de nombres ni resuelve etiquetas desconocidas. Los textos
originales se conservan en los borradores y registros. El potencial sigue fuera
del beneficio realizado; siguen vigentes colocación, retenciones, estado,
importe cobrado, hash, duplicados y autorización inicial por cuenta.

No cambia el parser, motor Tesseract, esquema, RPC, contabilidad ni dependencias.
No reescribe ni registra borradores antiguos. Una prueba previa con términos
sin tilde que ya no coincide con la clave canónica exige un nuevo acuerdo OCR;
no se migra ni se acepta silenciosamente. Las pruebas anteriores con términos
acentuados compatibles siguen siendo válidas.

## Validación

- Reproducción antes de la corrección: los casos de acuerdo Más/Mas rechazaban
  la equivalencia. La prueba espacial sintética usa el helper de filas existente.
- **862/862** pruebas, **33 nuevas**. Incluyen mercado frente a selección,
  Más/Menos, línea, período, ámbito, participante, cuota ausente, Builder,
  colocación, resultado, oferta cashout, prueba caducada y duplicados. El registro
  de dos imágenes sintéticas con referencia común conserva ambas lecturas y
  genera solo un stake, sin liquidación ni beneficio potencial.
- TypeScript app/FASE 1/FASE 3 y build aprobados. Continúa el aviso conocido
  de bundle mayor de 500 kB.
- OCR real: **28/28**, **1068/1089**, mismas **21 diferencias**. Comparación de
  los 1089 checks uno por uno idéntica a PR #15; cero regresiones, omisiones,
  selecciones adicionales o atribuciones de colocación/ganancia/cashout sin evidencia.
  Corpus, oráculos y activos intactos; cero destinos externos en OCR.
- Calificación automática: **18/28 → 21/28**. Cambian únicamente
  `three-first-half-second`, `mixed-five-selections` y `mixed-team-match-scorer`.
  Los últimos dos conservan diferencias literales conocidas `Sí/Si` y `Más/Mas`
  respecto del oráculo. No se modifican sus expectativas para mejorar la métrica.
- QA de persistencia aislado: **10 grupos aprobados** y tres guardas de destino.
  **10 apuestas, 9 liquidaciones y 19 movimientos** sintéticos; carga PNG/JPEG/WebP,
  lote, Ganada/Perdida/Cashout con beneficio/pérdida/neutro, doble sesión, duplicados,
  respuesta perdida, fallo de Storage/reintento, privacidad, recarga, dashboard,
  revocación y UI 375/768/1440. Cero errores finales y cero peticiones productivas.

Evidencia local ignorada: `test-results/over-under-{red,focused,full,build,ocr,gate,qa}.log`,
`test-results/over-under-comparison.json`, `test-results/ocr-phase4b/report.json`,
`test-results/automatic-gate/report.json` y `test-results/automatic-registration-qa/`.

Comandos: `npm.cmd test -- --maxWorkers=4`, `npx.cmd tsc --noEmit`,
`npx.cmd tsc -p tests/ocr-phase1/tsconfig.json --noEmit`,
`npx.cmd tsc -p tests/ocr-phase3/tsconfig.json --noEmit`, `npm.cmd run build`,
`node scripts/ocr-phase4b/run.mjs`, `node scripts/ocr-phase4b/automatic-gate.mjs`,
`npm.cmd run test:automatic-registration:qa`. El último solo permite el QA
aislado autorizado, cuentas desechables y dibujos sintéticos.

## Siete capturas aún retenidas

Son casos del banco autorizado, no un recuento actual de la cuenta productiva.

| Caso | Bloqueo restante y siguiente comprobación |
| --- | --- |
| `three-team-goals` | Milán/Milan en identidad: releer la región del nombre, sin quitar tildes globalmente. |
| `team-goals-juventus-brighton` | `&` mal leído: recuperar participante desde sus píxeles, sin reemplazar caracteres a ciegas. |
| `player-four-early` | Cuota 2.30 ausente en un pase: confirmar con lectura regional independiente. |
| `player-four-updated` | Original tachado y sustituto: interpretar ambos nombres con evidencia visual de Suplente de Oro. |
| `three-first-half-goals` | Falta reconocer evidencia del formato aceptado. |
| `seven-first-half-goals` | Más/Mas resuelto, pero falta reconocer evidencia del formato aceptado. |
| `brugge-builder-early` | Falta reconocer evidencia de aceptación; debe conservarse Pendiente. |

No se afirma reconocimiento universal. El contrato FASE 3 ya obsoleto en la base
PR #12 sigue documentado en el handoff; su ejecutor no se repitió ni se presenta
como aprobado. El comprobador TypeScript FASE 3 es una validación distinta.

Integración pendiente de la cadena #12 → #13 → #14 → #15 y este cambio.
Publicación en GitHub no significa despliegue ni registro productivo.
