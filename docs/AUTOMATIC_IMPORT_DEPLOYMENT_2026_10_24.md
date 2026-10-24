# PR #9: publicación autorizada de importación por lote

Producción: [bettrack-wostcloud1.web.app](https://bettrack-wostcloud1.web.app).
[PR #9 fusionado](https://github.com/Jozhiky/Bettrack/pull/9), sin conflictos,
con historial conservado.

- **SHA desplegado:** `f763ade27c5d57e0f513ef5edf259e9bcf81671a`.
- Hosting: proyecto `wostcloud1`, sitio `bettrack-wostcloud1`, solo `hosting:bettrack`.
- Versión: `05009865f34f9c83`; release `1792879007949000`.
- Publicación: **24/10/2026 21:56:47.949 UTC**.
- Los commits documentales posteriores no cambian el frontend desplegado.

## Autorización y alcance

El usuario autorizó expresamente «Sí, aplicar la migración y desplegar el PR #9».
Se aplicó exclusivamente el SQL revisado de
`20261024210047_automatic_historical_booking.sql`; Supabase lo registró como
**`20261024215600_automatic_historical_booking`**. QA mantiene su registro propio
`20261024210641_automatic_historical_booking`. No ejecutar db push global por esas
diferencias de timestamp.

La migración reemplaza solamente la guardia final y la capacidad de importación.
La comparación posterior por SELECT confirmó:

- Definiciones normalizadas de guardia, capacidades y `bt_commit` idénticas al QA.
  `bt_commit` mantiene MD5 `60f1386a6e89b5c114a8640cceffa4da`.
- SECURITY INVOKER, dos triggers inicialmente diferidos, RLS y políticas intactos.
  Capacidad accesible por authenticated, denegada a anon; guardia privada sin
  ejecución directa para authenticated.
- **20 imágenes y 20 borradores conservados exactamente**, con fingerprints de
  sus filas idénticos antes/después. **0 apuestas, 0 liquidaciones y 0 movimientos**
  antes/después del cambio de esquema. No se registraron los borradores por el agente.

Supabase cambió **solo en el esquema autorizado**. No se modificaron Auth,
usuarios, Storage, RLS, imágenes, borradores ni registros financieros existentes.
Advisor conserva el aviso previo de protección de contraseñas filtradas desactivada;
no se cambió esa configuración ni se contrató ningún plan.

## Verificación

- Sobre el SHA integrado: **680/680** pruebas unitarias, TypeScript y build.
  Árbol de aplicación idéntico al revisado del PR; no hubo cambios de código al fusionar.
- Se mantienen las validaciones aisladas documentadas: 17 escenarios de persistencia,
  ocho grupos históricos y cinco de lote; concurrencia, respuesta perdida, duplicados,
  integridad contable, recarga y separación por cuenta. No se ejecutó E2E productivo.
- OCR real: **1067/1089**, 22 discrepancias, dos mejoras y ninguna nueva regresión;
  cero selecciones omitidas/adicionales y estados financieros sin evidencia.
  Tesseract local y gratuito, corpus y oráculos intactos.
- Sitio publicado: **45 hashes**, 15 activos OCR, cinco rutas, MIME WASM y caché del
  service worker correctos; SW activado con recursos OCR precargados.
- Acceso público y resumen de lote a **375/768/1440 px**, sin desbordamientos ni
  campos de fecha obligatorios. Fixture visual de ocho capturas: seis preparadas,
  dos excepciones, cuota combinada 5.90 y consentimiento pendiente.
- Esa sesión visual fue sintética y totalmente interceptada: **cero peticiones al
  backend real y cero escrituras financieras**. No se inició sesión de un miembro
  productivo; autenticación y persistencia real se comprobaron en QA aislado.

El usuario puede abrir **Mis apuestas**, recuperar sus capturas existentes y confirmar
el resumen del lote. Cobros ilegibles, ofertas, parciales o evidencia insuficiente
se conservan aparte. Las fechas históricas ausentes quedan desconocidas, con registro
contable y horario del partido separados. Una sesión antigua puede mostrar el aviso
«Actualizar ahora» de la PWA antes de cargar esta versión.

## Reversión conservada

La versión anterior `5de3256218949269` permanece en el historial de Hosting
(`retainedReleaseCount=999999`). Después de crear registros `accounting`, no utilizar
ese frontend ni la reversión de PR #8, que no conocen ese origen de fecha.

Reversión **compatible** publicada antes del cambio productivo:

- Canal `rollback-pr9-compatible`, versión `147f7955f5aebaf5`.
- [URL de reversión](https://bettrack-wostcloud1--rollback-pr9-compatible-oa7djp23.web.app).
- Expira el **31/10/2026 21:53:57.778349471 UTC**.
- Lee históricos `accounting` y bloquea nuevas importaciones automáticas localmente.
  Verificación publicada: 30 hashes y tres anchuras, cero llamadas de capacidades,
  commit o backend real. Se usó `--no-authorized-domains`; no se sincronizó Firebase Auth.

Ante un fallo crítico, detenerse e informar conforme a las instrucciones del usuario.
La reversión compatible está preparada para restaurar Hosting si se autoriza;
no requiere revertir SQL ni modificar registros existentes.

Evidencia local ignorada en `test-results/deployment-pr9-20261024/`: manifiesto,
releases, verificación pública y capturas sintéticas. Configuración de reversión en
`firebase.rollback.json`; no contiene secretos ni se publica como recurso del sitio.
