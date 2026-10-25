# PR #11: recuperación de cobros publicada con autorización

Producción: [bettrack-wostcloud1.web.app/apuestas](https://bettrack-wostcloud1.web.app/apuestas).
[PR #11 fusionado](https://github.com/Jozhiky/Bettrack/pull/11), con historial conservado,
sin conflictos y árbol idéntico al head revisado `9c8cfa2`.

- **SHA desplegado:** `3493f5dc4cfc3091674c54fb9bb99f0f38fb475c`.
- Firebase: proyecto `wostcloud1`, sitio `bettrack-wostcloud1`, solo `hosting:bettrack`.
- Versión `341088c8027e5568`, release `1792900771153000`.
- Publicado el **25/10/2026 03:59:31.153 UTC** (24/10/2026, 22:59 en UTC-05).
- Los commits documentales posteriores no cambian el frontend desplegado.

El usuario respondió «te doy la aprobacion» a la solicitud de fusionar y desplegar
específicamente el PR #11. No se ejecutaron migraciones, SQL, cambios en Auth/RLS/
Storage ni registros de apuestas o movimientos reales. La verificación publicada
interceptó todas las operaciones de backend en una sesión visual sintética.

## Verificación final

- Sobre el SHA integrado: **725/725 pruebas**, TypeScript y build aprobados.
  Artefacto dirigido a Supabase productivo con clave pública, sin secretos,
  datos/cuentas/configuración QA ni mapas de fuentes. Recursos OCR contra su lock.
- Vigentes las regresiones del árbol idéntico validado en el PR: banco real
  **1067/1089**, mismas 22 diferencias, cero selecciones omitidas/añadidas o
  atribuciones de colocación/ganancia/cashout ejecutado sin respaldo. Seis grupos
  de QA aislado, incluidos recuperación real con Tesseract de imagen sintética,
  persistencia, recarga, dos sesiones, consentimiento y contabilidad única.
- Sitio publicado: **45 hashes**, **15 recursos OCR**, cinco rutas, MIME WASM,
  cabecera de caché del SW, service worker activado y OCR precargado.
- Formulario público de acceso y resumen a **375/768/1440 px**, sin desbordamiento.
  No se inició sesión con una cuenta productiva: Auth/persistencia reales se
  comprobaron en el QA aislado autorizado, no mediante escrituras de producción.
- Nueve borradores visuales sintéticos: siete preparados y dos excepciones.
  Recuperación desde imagen ya guardada del cobro **S/31.00**, stake **S/20.00**,
  neto **S/11.00**, sin campos de fechas ni revisión individual. También se
  conservan rayo, Cashout con beneficio/pérdida y cuota combinada calculada.
- Dos peticiones de metadatos **simuladas**, limitadas a uploads/audit; todos los
  demás campos originales conservados. **Cero backend real y cero peticiones
  financieras antes del consentimiento**, sin errores JS ni destinos imprevistos.
- El primer intento visual se detuvo por UTF-8 mal decodificado en el script
  temporal de comprobación (buscaba una etiqueta incorrecta de contraseña).
  Se corrigió exclusivamente ese script ignorado y se repitieron todas sus
  aserciones. El formulario publicado ya mostraba el texto correcto.

No se registró el boleto real por cuenta del usuario. Al abrir el lote actualizado,
la recuperación de su borrador será automática; registrar requiere confirmar el
resumen. La otra captura diagnosticada muestra una oferta disponible, no un cierre
ejecutado, y sigue excluida de liquidación. [Causas y límites](RETAINED_CAPTURE_VALIDATION.md).

## Reversión

- Versión anterior **`bce1137d10a9d022`** conservada en el historial del sitio,
  con `retainedReleaseCount=999999`. Es el frontend #10 compatible con accounting/live;
  ignora el suplemento nuevo de cobro sin reescribir registros financieros.
- Canal de reversión compatible adicional `rollback-pr9-compatible`, versión
  `147f7955f5aebaf5`, expira **31/10/2026 21:53:57.778 UTC**.
  Verificado de nuevo: 30 hashes y tres anchuras, lectura de accounting/live,
  nuevas importaciones automáticas bloqueadas, cero backend real y cero finanzas.
- No usar una versión anterior al soporte de fecha contable para leer históricos
  registrados con ese origen. Ante un fallo crítico, detenerse e informar.

Evidencia local ignorada: `test-results/deployment-pr11-20261024/`, con preflight,
manifiesto, recibo Hosting, verificación pública y capturas exclusivamente sintéticas.
Tesseract continúa local y gratuito. Una sesión antigua puede mostrar
«Actualizar ahora» para activar la versión nueva de la PWA.
