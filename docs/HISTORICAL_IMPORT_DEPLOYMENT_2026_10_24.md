# Históricos y cuota calculada — publicación 24/10/2026

Producción: **https://bettrack-wostcloud1.web.app**.

- [PR #8](https://github.com/Jozhiky/Bettrack/pull/8) integrado sin conflictos,
  conservando ambos commits y la rama de origen.
- **SHA desplegado:** `97dc8beae5c22e48314c178483e92635e59e5017`.
  Padres comprobados: main `a3a4c1f` y origen `c042c3c`. Árbol idéntico al revisado.
- Firebase proyecto `wostcloud1`, únicamente Hosting del sitio
  `bettrack-wostcloud1`, CLI `15.34.1`. Versión **`5de3256218949269`**,
  release **`1792873387378000`**, `2026-10-24T20:23:07.378Z`.
- El usuario autorizó Hosting y, después de conocer el bloqueo del modelo,
  **autorizó explícitamente la migración de esquema productivo del PR #8**.
  También solicitó multiplicar cuotas y limitar el producto a dos decimales.

## Correcciones comprobadas

El [diagnóstico y contrato](SETTLED_CAPTURE_REVALIDATION.md) reproduce las dos
causas: campos globales ausentes en los borradores reales y cabecera `Cash Out`
no reconocida. Las capturas existentes se abren sin reenvío ni relectura. Los
datos globales ausentes quedan desconocidos y la liquidación se guarda atómicamente.

Una combinada sin cuota total visible permite **Usar cuota calculada**. Multiplica
todas las cuotas exteriores válidas con aritmética decimal exacta y **trunca solo
el producto final**: 2.02 × 2.15 × 1.36 = 5.90648 → **5.90**. Guarda procedencia,
entradas y método; se recalcula tras corregir selecciones y no duplica hijos de
Bet Builder. Un total visible se conserva. El potencial original y el cobro real
no se inventan a partir de esa cuota.

Cashout requiere verificar ejecución, cobro y cierre total. `Ganancias` sigue
siendo una sugerencia por cotejar. Fechas históricas, selección completa y
consentimiento final siguen siendo obligatorios; ofertas y parciales quedan retenidos.

## Migración autorizada y comprobación productiva

Fuente aprobada: [historical_unknown_quote_guard.sql](../supabase/migrations/20261024193847_historical_unknown_quote_guard.sql).
Registro remoto de Supabase: **`20261024202542_historical_unknown_quote_guard`**;
la versión del registro fue asignada por la API al aplicarla. No ejecutar un
`db push` global ni volver a aplicar la fuente por diferir su timestamp local.

Se publicó primero el frontend compatible y se verificó. Después se aplicó
únicamente la migración aprobada: un CHECK, dos triggers diferidos y una capacidad
de lectura autenticada. No contiene INSERT/UPDATE/DELETE de registros existentes.

La verificación mediante SELECT confirmó:

- Capacidad `bt_capabilities()` presente, ejecutable por authenticated y denegada
  a anon; no se efectuó login remoto de miembros para comprobarla.
- Guardia privada **SECURITY INVOKER**, sin ejecución directa para authenticated;
  ambos triggers diferidos y RLS de apuestas, liquidaciones y movimientos activos.
- `bt_commit` mantiene exactamente su definición anterior (hash
  `b2418a34716d97da6d0e0934141f324b`). No cambia contabilidad, RLS, Auth ni Storage.
- **0 apuestas, 0 liquidaciones y 0 movimientos** durante la comprobación final;
  no se registraron ni liquidaron los borradores reales de forma automática.
- Las 19 imágenes de la cuenta tenían su objeto privado disponible, sin objetos
  ausentes. La lectura final encontró 19 borradores y la inicial había encontrado
  20; la cola cambió entre consultas. Este trabajo no ejecutó escrituras en ella.

Supabase cambió **solo en el esquema autorizado**. No se modificaron usuarios,
apuestas, movimientos ni imágenes existentes por esta publicación.

## Validación

- **648/648 pruebas**, 28 archivos; TypeScript principal y proyectos FASE 1/3/carga,
  build y diff-check aprobados. Aviso conocido de chunk >500 kB, sin error.
- QA aislado: **3/3** controles de destino, **17/17** escenarios existentes y
  **8/8** grupos históricos. Concurrencia, respuesta perdida, duplicados, reintentos,
  ausencia de consentimiento, rollback de reapertura inválida y cuota 5.90 persistida.
- OCR real **28/28, 1065/1089**, mismas **24 diferencias**, mismos hashes/calidad,
  0 selecciones omitidas/adicionales y falsos estados financieros. FASE 3 conserva
  siete diferencias literales conocidas, ninguna nueva y paridad 7/7.
- **45 archivos publicados** cotejados por SHA-256, incluidos los **15 activos OCR**,
  JS/CSS, manifest y service worker; cinco rutas SPA con HTML correcto.
- Service worker activado y modelos OCR precacheados. Acceso, carga, revisión
  Cashout de cabecera y combinada calculada a 5.90 verificados en **375/768/1440 px**.
- Esa comprobación del bundle público usó sesión/imágenes sintéticas **solo en el
  navegador**, con todas las llamadas HTTP/WS al backend interceptadas y confirmación
  financiera desactivada. Cero peticiones reales a Supabase, errores o solicitudes
  inesperadas. La persistencia auténtica se probó únicamente en QA.

Tesseract sigue siendo local y gratuito. No se añadieron APIs de pago ni dependencias.

## Reversión compatible

Versión anterior `5d98aa40a5a60592` conservada en el historial live. **Después de
importar históricos null no debe restaurarse el frontend de PR #7**, que no puede
leerlos. Se preparó y publicó una alternativa compatible en el mismo sitio:

- Canal **`rollback-pr8-compatible`**, versión **`c7e1a76f925d7bc0`**;
  vence `2026-10-31T20:20:52.712577808Z`. También quedan sus hashes/artefactos locales.
- Lee históricos y estadísticas con null y bloquea nuevas importaciones de ese
  tipo. Se verificó en 375/768/1440 con cero llamadas financieras/capacidades;
  23 archivos JS/HTML/manifest publicados cotejados por hash.
- Preparado con `npm.cmd run build:historical:rollback`. El despliegue del canal
  usó `--no-authorized-domains`; no modificó Firebase Auth ni otros componentes.

Solo si se autoriza revertir el frontend, conservando el esquema y los registros:

```powershell
npx.cmd -y firebase-tools@15.34.1 hosting:clone wostcloud1:bettrack-wostcloud1@c7e1a76f925d7bc0 wostcloud1:bettrack-wostcloud1:live --project wostcloud1 --non-interactive
```

No se ejecutó rollback ni migración inversa. No convertir null en cero para
restaurar una versión antigua. Las sesiones abiertas deben aceptar la actualización
de la PWA después de guardar formularios, antes de confirmar nuevos históricos.

Evidencia local ignorada: `test-results/deployment-pr8-20261024/`,
`test-results/compatible-rollback/` y los informes QA/OCR enlazados en el diagnóstico.
Este recibo documental posterior no cambia el código publicado.
