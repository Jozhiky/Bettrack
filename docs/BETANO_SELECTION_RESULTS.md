# Resultados visuales de selecciones Betano

26/10/2026. Rama `codex/betano-selection-results`, sobre `b563f8c` del PR #14.

## Casos aclarados por el usuario

El usuario confirmó que `failed-leg-juventus` y `failed-leg-three-goals` ya estaban
perdidos: una cruz roja señala la selección fallida y el potencial del boleto es
cero. `brugge-builder-later` seguía pendiente: el check verde corresponde únicamente
a uno de sus tres mercados. Las imágenes fueron tomadas después de la aceptación.

La [documentación oficial de Betano](https://support.betano.pe/hc/es-pe/articles/7412097332253--Cu%C3%A1les-son-los-tipos-de-apuestas)
confirma que una selección fallida pierde una combinada ordinaria. Los sistemas
tienen reglas distintas y quedan fuera de esta derivación. La declaración del
usuario aporta el contrato de estos ejemplos, no una autorización de producción.

## Corrección y barreras

- Detector local de círculos rojos con cruz y verdes con check, ligado a píxeles,
  fila OCR y selección/mercado interno. Comprueba tamaño, forma, fondo oscuro y
  asociación única. Rechaza círculos vacíos, bloques, signos más y fondos ajenos.
- Una cabecera Betano completa, número de selecciones y stake coincidente en el
  pie contextualizan el resultado visual. Se conserva por separado de la colocación
  literal que el parser obtiene del texto; nunca se añade un recibo ficticio al OCR.
- Solo una simple/combinada ordinaria completa con cruz reconocida y pie explícito
  `Ganancias potenciales S/0.00` permite derivar **Perdida / retorno cero**. No se
  generaliza a sistemas, anulaciones, bonos, seguros, hándicaps asiáticos, sustituciones,
  cierres parciales ni cashouts. Una cruz con cierre incompleto exige revisión.
- Un check verde del Builder acredita progreso de esa selección. Ni uno ni todos
  los checks se convierten por sí solos en Ganada o en un retorno realizado.
- Hash de imagen, términos originales y resultado por selección deben concordar.
  Los dos pases automáticos deben coincidir; editar campos invalida la prueba.
  Preparación o conflicto textual prevalecen sobre iconos. La relectura no elimina
  retenciones previas y no registra automáticamente borradores antiguos retenidos.
- Reutiliza registro/consentimiento por cuenta y transacciones financieras vigentes:
  pérdida = un stake, un retorno cero y una liquidación; Builder abierto = un stake.
  El modo manual sigue sin escribir finanzas antes de confirmar.
- El QA reprodujo tres cashouts retenidos porque la referencia del servidor quedaba
  por delante del reloj del navegador. La fecha contable ahora queda acotada por
  ambos relojes. No se relaja la validación de fechas futuras ni se cambia una fecha
  histórica; seis pruebas adicionales cubren ambos desfases y la llamada real del store.

Sin cambios de esquema, RPC, contabilidad, dependencias, modelos, corpus u oráculos.
No se modifican imágenes, apuestas ni movimientos productivos. No se despliega.

## Pruebas

- Reproducción inicial: tres pruebas fallaron antes de implementar la corrección.
- **829/829** pruebas, incluidas 39 nuevas; TypeScript de app/FASE 1/FASE 3 y build
  aprobados. Persiste el aviso conocido de bundle mayor de 500 kB.
- OCR real inalterado: **28/28**, **1068/1089**, 21 diferencias conocidas; ninguna
  selección omitida/adicional ni nuevas atribuciones literales sin evidencia.
- Calificación automática **18/28**, frente a **15/28**: únicamente los tres casos
  aclarados cambian de retenidos a aptos. Contrato visual adicional explícito en
  el ejecutor, separado de los oráculos literales originales. La combinada conserva
  dos diferencias literales conocidas Más/Mas; no se corrigieron sus expectativas.
- QA aislado: **10 grupos aprobados**, tres guardas de destino aprobadas; **10
  apuestas, 9 liquidaciones y 19 movimientos** sintéticos. Incluye los tres casos
  visuales, cargas repetidas, respuesta perdida, concurrencia, pérdida de conexión
  en Storage, recarga en dos sesiones, aislamiento por cuenta, revocación del modo
  automático y UI a 375/768/1440. Cero peticiones productivas y cero errores finales.
- Preflight de tres dibujos sintéticos con Tesseract real y solo localhost:
  simple/combinada Perdida y Builder Pendiente, acuerdo y referencia correctos.
  El primer dibujo Builder carecía de sus viñetas/indentación; se corrigió el
  generador de prueba para representar ese formato. No se alteró el corpus real.

Evidencia ignorada: `test-results/selection-results-{red,focused,full,build,ocr,gate,qa}.log`,
`test-results/ocr-phase4b/report.json`, `test-results/automatic-gate/report.json` y
`test-results/automatic-registration-qa/`. Ejecución:
`npm.cmd test -- --maxWorkers=4`, `npx.cmd tsc --noEmit`, `npm.cmd run build`,
`node scripts/ocr-phase4b/run.mjs`, `node scripts/ocr-phase4b/automatic-gate.mjs`,
`node scripts/ocr-selection-results.mjs`,
`npm.cmd run test:automatic-registration:qa`. Este último acepta únicamente el QA
aislado autorizado y usa dibujos sintéticos, nunca las capturas privadas originales.

## Pendientes

Quedan **10/28** retenidas: seis requieren resolver lecturas discrepantes
(vocabulario, cuota o participante), tres formatos sin evidencia de aceptación
reconocida y la sustitución de jugador. `seven-first-half-goals` combina colocación
y vocabulario. No se afirma registro universal ni recuperación automática de los
borradores antiguos retenidos. La expectativa FASE 3 ya obsoleta en PR #12 continúa
documentada en el handoff; no se cambió ni se presenta como aprobada.

La integración depende de revisar #12 → #13 → #14 y este cambio. Publicación en
GitHub no implica despliegue, activación del modo automático ni registro productivo.
