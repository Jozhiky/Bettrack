# Despliegue de importación histórica — 24/10/2026

Producción: **https://bettrack-wostcloud1.web.app**.
El usuario autorizó integrar y desplegar después de revisar el resultado del PR #7.

- [PR #7](https://github.com/Jozhiky/Bettrack/pull/7) fusionado con merge commit,
  conservando historial y rama de origen.
- **SHA desplegado:** `9e303dfbf21b7d4caf6f90db1a3db03110747610`.
- Origen revisado: `f179853c8324784c42ade7de4676bbd1a495cee1`;
  padre main: `5e0e62eb7baa0be0c7af3f0985455203a6db66d8`.
  Se comprobaron ambos padres y la igualdad completa del árbol con el PR validado.
- Firebase proyecto `wostcloud1`, target `hosting:bettrack`, sitio
  `bettrack-wostcloud1`, CLI fijada en `15.34.1`.
- Versión **`5d98aa40a5a60592`**, release **`1792869972323000`**,
  publicada a `2026-10-24T19:26:12.323Z`; mensaje con el SHA desplegado.
- Ningún componente distinto de Hosting fue publicado. No se ejecutaron
  migraciones, SQL ni operaciones contra Supabase de producción.

## Comprobaciones previas

Se repitieron **613/613 pruebas**, TypeScript de aplicación y proyectos de pruebas
FASE 1/3/carga, **3/3 controles de destino** y build sobre el árbol aprobado.
La configuración solo permite el sitio autorizado y `dist`; los 15 activos OCR
coinciden con el lock. El paquete contiene el destino Supabase productivo esperado,
sin fixtures QA, adaptadores de pruebas ni credenciales administrativas.
Permanece el aviso conocido de chunk mayor de 500 kB, sin error de compilación.

No se repitieron escrituras QA ni OCR: el árbol integrado es idéntico al validado
en el [informe de importación](SETTLED_CAPTURE_IMPORT.md), que acredita 17 escenarios
previos + 7 grupos históricos de persistencia aislada y OCR 1065/1089 sin regresiones.

## Verificación publicada

- **45 archivos** servidos coinciden por SHA-256 con el build, incluidos los
  **15 activos OCR**, manifest, JS/CSS, fuentes y service worker. `_redirects`
  permanece excluido por Hosting. Cinco rutas SPA responden con el HTML esperado.
- Service worker `/bettrack-sw.js` activado, modelos OCR precacheados y cabecera
  `no-cache,no-store,must-revalidate` comprobada.
- Formulario de acceso y pantalla de carga del bundle publicado a **375/768/1440 px**,
  sin desbordamiento. PNG/JPEG/WebP y selección múltiple conservados.
- Revisión de un **Cashout sintético** del bundle publicado: imagen original,
  fechas históricas, pago efectivamente recibido y resumen de importación visibles;
  confirmación desactivada hasta el consentimiento.
- La sesión/captura de esa comprobación existió **solo en el navegador**: todas las
  llamadas HTTP/WS de backend fueron interceptadas. **Cero solicitudes reales al
  backend**, ningún login remoto ni registro financiero. La persistencia real se
  acreditó previamente en QA aislado, sin utilizar las capturas privadas del usuario.
- Cero errores de página y cero solicitudes inesperadas.

**Supabase productivo permanece intacto**, incluidos Auth, Storage, políticas,
usuarios, apuestas y movimientos. No se procesaron automáticamente los borradores
reales. Tesseract continúa local y gratuito. Ahora se pueden abrir desde
**Mis apuestas → Históricas en revisión**, revisar y confirmar individualmente.
Las sesiones abiertas pueden mostrar el aviso de actualización de la PWA; aceptar
después de guardar los formularios abiertos.

## Reversión

Antes de publicar se confirmó y conservó la versión anterior **`4885a8046b5928a0`**
en el canal **`rollback-settled-20261024`** del mismo sitio, con vencimiento
`2026-10-31T19:24:58.051314182Z`. También permanece en el historial live con su
retención vigente; no se eliminaron versiones ni se cambió la política de retención.

Si se autoriza revertir exclusivamente el frontend:

```powershell
npx.cmd -y firebase-tools@15.34.1 hosting:clone wostcloud1:bettrack-wostcloud1@4885a8046b5928a0 wostcloud1:bettrack-wostcloud1:live --project wostcloud1 --non-interactive
```

No se ejecutó rollback. La reversión no modifica apuestas ni datos de Supabase.

Evidencia local ignorada: `test-results/deployment-settled-20261024/`, con manifiesto
de artefactos, canales antes/después, recibo y comprobación visual sintética.
Este documento se registra después del despliegue y no altera el código publicado.
