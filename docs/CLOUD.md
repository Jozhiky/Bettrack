# BETTRACK cloud — 19/10/2026

## Comportamiento actual

La cuenta se crea con usuario (3–24 caracteres) y contraseña (mínimo 10). Supabase Auth utiliza internamente `usuario@users.bettrack.invalid`; no es un correo real ni se envían confirmaciones. La confirmación por correo está desactivada por autorización expresa. Cada usuario tiene su propia banca, maestros, boletos, capturas, cola OCR, preferencias y auditoría.

PostgreSQL y Storage son la fuente persistente. El navegador mantiene una copia temporal en memoria mientras está abierto; no usa localStorage ni IndexedDB para registros. Solo la sesión se conserva en una cookie Secure en HTTPS y SameSite=Lax, accesible por el SDK de esta SPA. No es una cookie HttpOnly: un futuro backend permitiría ese modelo. Firebase sirve el frontend; no recibe apuestas ni se inicia Analytics.

Se necesita conexión para iniciar sesión, leer y guardar. La PWA conserva únicamente archivos estáticos y modelos OCR; no guarda respuestas de Supabase ni imágenes privadas en el service worker. El OCR se ejecuta en el navegador, después de subir la captura al bucket privado. Si se cierra la página, otro dispositivo puede retomar trabajos tras vencer la reserva de procesamiento (10 minutos).

## Arquitectura

- `src/app/auth.tsx`: acceso, registro, sesión y limpieza de datos locales anteriores.
- `src/integrations/supabase.ts`: cliente público, cookie de sesión y borrado acotado a `bettrack-local-v1` y claves `bettrack-`/`bettrack:`. No borra otras aplicaciones ni archivos originales.
- `src/data/cloudStore.ts`: unidad de trabajo en memoria, guardado atómico, control de versión y suscripción Realtime. Solo confirma visualmente los cambios que PostgreSQL aceptó. Las escrituras desactualizadas muestran conflicto y recargan la cuenta; nunca se sobrescriben silenciosamente.
- Repositorio de dominio: cálculos en céntimos, Simple/Combinada y Pendiente/Ganada/Perdida/Cashout. La clase conserva el nombre histórico `LocalRepository` para compatibilidad de pruebas; producción inyecta exclusivamente el adaptador Supabase.
- PostgreSQL: tablas `bt_*` separadas para entidades, selecciones y movimientos, con payload JSONB validado, referencias entre registros del mismo usuario, RLS y escritura únicamente mediante RPC.
- `bt_snapshot`: lectura consistente de una cuenta; `bt_commit`: transacción con bloqueo de versión, invariantes contables y auditoría inmutable del servidor. Funciones con privilegios en esquema privado y wrappers públicos invoker, restringidos a usuarios autenticados.
- Storage `bettrack-captures`: privado, rutas por `auth.uid()`, PNG/JPEG/WebP hasta 15 MB. Eliminación mediante cola de limpieza reintentable. No URLs públicas.

Las consultas cargan actualmente una instantánea de la cuenta completa. La paginación de la interfaz es en memoria. Para historiales grandes queda pendiente paginación/analítica en servidor; el diseño actual está orientado al grupo pequeño solicitado.

## Migraciones activas

1. `20261017151541_bettrack_cloud.sql`
2. `20261017203537_cloud_financial_guards.sql`
3. `20261019204744_cloud_commit_validation.sql`

El diseño anterior opcional del 15/10 se conserva como referencia en `supabase/legacy/`, fuera de la cola de migraciones. No aplicar ese esquema.

## Administración de acceso

Los nombres se normalizan a minúsculas. Recuperar una contraseña sin correo requiere intervención del administrador usando Supabase Auth Admin API, tras verificar a la persona. No existe recuperación automática ni panel de administrador en BETTRACK. La clave administrativa jamás se coloca en Vite, archivos publicados ni en el navegador.

El registro está abierto a quienes conozcan la URL; no se implementó invitación ni aprobación de miembros. Los registros quedan aislados por usuario, independientemente de pertenecer al mismo grupo.

El aviso del asesor `auth_leaked_password_protection` sigue presente: Supabase ofrece el bloqueo de contraseñas filtradas solo desde Pro. No se contrató. Se configuró mínimo de 10 caracteres en servidor y formulario. Referencia: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Comprobaciones

- `npm.cmd test`: regresiones de contabilidad, OCR, importación y cookie/usuario. Dexie solo se usa como adaptador aislado de pruebas, no en producción.
- `npm.cmd run build`: TypeScript y paquete PWA.
- `node scripts/cloud-qa.mjs provision`: crea dos cuentas temporales y guarda sus credenciales en `.env.qa.json` (ignorado; no compartir). Rechaza sobrescribir un registro existente.
- `npm.cmd run test:e2e`: suite cloud contra esas cuentas temporales. No usar cuentas reales de miembros. `node scripts/cloud-qa.mjs reset` limpia únicamente esas cuentas QA, conservando auditoría. Al terminar, revocar sesiones y eliminar las cuentas QA desde la administración; nunca eliminar miembros reales.
- `node scripts/cloud-qa.mjs security`: 14 comprobaciones reales de permisos, imágenes privadas, invariantes, rollback y concurrencia. Requiere una apuesta QA con captura y cashout; el flujo E2E elimina la suya al finalizar.
- `BETTRACK_TEST_URL` permite ejecutar los E2E contra el sitio publicado en lugar del servidor local.
- `node scripts/verify-hosting.mjs`: compara hashes publicados y revisa login/registro responsive sin crear datos.

Las pruebas anteriores `e2e/*.spec.ts` excepto `cloud.spec.ts` documentan la versión local histórica y no son la suite activa: sus supuestos de acceso sin cuenta y escritura offline ya no corresponden al producto. No se reportan como aprobadas en cloud.

## Datos anteriores

El proyecto remoto estaba vacío al comenzar. Los datos QA se eliminan al terminar. Al abrir cada origen con la nueva versión se elimina su antigua base local BETTRACK. Un origen o dispositivo aún no visitado solo podrá limpiarse cuando cargue la actualización. No se importan ni fusionan los datos anteriores.
