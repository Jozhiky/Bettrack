# Registro automático de capturas por cuenta

25/10/2026. Rama `codex/automatic-capture-registration`, basada en
`b006c56` de `codex/promoted-ticket-layouts` (PR #12, todavía abierto).
Preparado para revisión; **no desplegado ni activado en cuentas productivas**.

## Autorización y comportamiento

El usuario eligió expresamente «Registro automático sin confirmación por lote».
La modalidad nueva permite una autorización inicial en Configuración, vinculada
a la cuenta y auditada. Después, las capturas nuevas admitidas se guardan al
terminar OCR, sin editar campos ni confirmar cada lote. El modo inicial de las
demás cuentas sigue siendo manual. Se puede desactivar y la revocación invalida
la autorización anterior aunque una preferencia obsoleta vuelva a introducirla.
Restaurar un respaldo no restaura esta autorización.

Solo incluye capturas posteriores a la activación. No registra borradores antiguos
en segundo plano ni modifica apuestas reales durante el desarrollo. Los borradores
conservan imagen/OCR; el flujo manual anterior sigue disponible con el modo desactivado.

## Barreras y contabilidad

- Tesseract.js y modelos locales existentes; sin APIs de pago, OpenCV ni PaddleOCR.
- Dos lecturas contrastadas deben concordar en casa, importes, referencias,
  selecciones completas, mercados, participantes, cuotas y evidencia de resultado.
  El segundo contraste suave conserva grises; la binarización anterior sigue
  disponible para el flujo previo. No se normalizan identidades de jugadores.
- Si el segundo pase pierde únicamente la oferta, una lectura independiente del
  botón localizado por sus coordenadas debe repetir su importe. No se reemplaza
  el texto original ni se convierte la oferta en retorno. Imagen y comprobación
  están vinculadas mediante SHA-256; cualquier cambio de datos invalida el acuerdo.
- Colocación y liquidación siguen separadas. No se borran retenciones previas;
  resultados parciales, cobros ausentes, contradicciones y selecciones incompletas
  permanecen sin movimientos. No se infieren fechas históricas desde la subida.
- Pendiente nueva: un cargo de stake. Histórica nueva: apuesta, liquidación y
  retorno real se guardan juntos mediante `bt_commit`, con los controles existentes.
  Un cashout positivo, negativo o neutro conserva estado Cashout.
- Resultado posterior: solo una referencia explícita común de la misma casa,
  acompañada de términos coincidentes, permite liquidar la pendiente existente
  sin otro cargo. Coincidir en importes/partidos únicamente impide duplicar; no
  autoriza esa liquidación. Referencias distintas permiten apuestas distintas.
- Resultado contradictorio o referencia compartida por varios registros: sin
  reescritura financiera. Doble clic, relectura y respuesta perdida no duplican stake.
- Auditoría distingue autorización previa y registro automático de una revisión
  humana por boleto: `acknowledged: false`; no atribuye una confirmación inexistente.

## Defectos reproducidos y corregidos

1. La cola anterior solo preparaba revisión; faltaba registrar pendientes y
   resultados finales bajo la nueva autorización por cuenta.
2. Conflictos entre sesiones interrumpían subidas y guardados: reintento limitado
   a cuatro intentos de compare-and-swap rechazado, después de refrescar datos.
   Un error de red o respuesta desconocida no se reejecuta como si fuera un rechazo.
3. Guardar inmediatamente exponía pequeñas diferencias entre reloj del dispositivo
   y PostgreSQL: la misma transacción rechazada se aceptaba después sin cambios.
   La fecha contable automática usa una referencia conservadora de un commit
   confirmado en `bt_server_audit`, avanzándola con reloj monotónico. Es una lectura
   por la cuenta autenticada, sin nuevas funciones SQL ni migraciones. Si no se
   puede verificar, no se registra la finanza.
4. OCR ahora se conserva antes de la transacción financiera. Un fallo posterior
   deja imagen/texto completos; la captura muestra el motivo y puede reintentarse.
   Permanece en procesamiento hasta terminar la decisión automática, evitando
   mostrar revisión terminada mientras el guardado sigue en curso.
5. El contraste binario perdía caracteres y ofertas pequeñas. El contraste suave
   y la relectura localizada aumentan cobertura manteniendo acuerdo entre lecturas.

## Validación

- **773/773 pruebas unitarias**, TypeScript de aplicación y tsconfig OCR 1/3;
  build aprobado. Aviso habitual de chunk mayor de 500 kB.
- Banco real habitual: **28 imágenes, 1068/1089 checks**, mismas **21 diferencias**
  de PR #12; cero selecciones omitidas/adicionales y cero confirmaciones,
  victorias o cashouts ejecutados sin evidencia. Corpus, oráculos y modelos intactos.
- Calificación adicional del modo automático: **15/28 aptas**, **13 conservadas**.
  De las 15, catorce no tienen diferencias literales; una mantiene tres diferencias
  conocidas de tildes en Más/Mas, visibles en el informe completo y sin cambios
  de importe, selección numérica, mercado interpretado ni resultado. No se ocultan
  ni descuentan del banco 1068/1089. Esta cifra no garantiza todos los tickets futuros.
- QA real solo en el proyecto aislado autorizado `jvydvvymhtmbczuhhrzs`, cuentas
  desechables y capturas sintéticas. El servidor y los clientes rechazan producción.
  La prueba incluye dos sesiones, subida PNG/JPEG/WebP, Storage privado, estados
  finales, concurrencia, respuesta perdida, reintento tras fallo de Storage,
  dashboard, recarga, aislamiento y revocación; interfaz 375/768/1440 px.
  **Nueve grupos aprobados: 7 apuestas, 7 liquidaciones y 14 movimientos**, neto
  S/6.00, todos sintéticos. Los identificadores del ejemplo son sintéticos;
  una discrepancia en su lectura conserva el borrador, no se corrige el valor.
- Regresión del flujo anterior por lote: seis grupos aprobados, 18 apuestas,
  18 liquidaciones y 36 movimientos sintéticos, sin cambios al consentimiento manual.

Comandos reproducibles para el agente (nunca `test:e2e` contra producción):

```powershell
npm.cmd test -- --maxWorkers=4
npx.cmd tsc --noEmit
npm.cmd run build
node scripts/ocr-phase4b/run.mjs
node scripts/ocr-phase4b/automatic-gate.mjs
npm.cmd run test:automatic:qa
npm.cmd run test:automatic-registration:qa
git diff --check
```

Los dos bancos QA comparten una cuenta desechable: **ejecutarlos en serie**.
Evidencia local ignorada en `test-results/automatic-registration-*`,
`test-results/automatic-gate/report.json` y `test-results/ocr-phase4b/report.json`.
No publicar capturas, diagnósticos privados ni `.env.qa-isolated.json`.

### Fallo previo del banco FASE 3

El comando tolerante `npm.cmd run test:ocr:phase3` también se ejecutó: conserva
paridad instrumentada 7/7 y termina con `0 !== 7` en `run.mjs:265`, donde espera
siete retenciones de participantes en `player-builders`. Se reprodujo **el mismo
valor cero con el código base `b006c56`**, superpuesto en un servidor local de solo
lectura; los cambios de PR #12 ya reconocen ese contexto de jugador. No es una
regresión de esta rama. No se cambió el oráculo ni se omitió la prueba. Debe
actualizarse el contrato de ese banco mediante revisión explícita de la mejora;
no presentar esta prueba como aprobada ni confundirla con las divergencias literales.

## Publicación pendiente

Integrar PR #12 antes de este cambio, conservar historial y comprobar ambas fusiones.
No hay migraciones nuevas. Para publicar Firebase Hosting y activar la preferencia
de una cuenta real hace falta autorización específica; no se ha efectuado ninguna
de esas operaciones. Mantener Hosting anterior para reversión y no desactivar
validaciones de Supabase. No anunciar automatización universal: faltan los trece
casos retenidos y evidencia que una captura no contiene no puede inventarse.
