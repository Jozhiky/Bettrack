# Validación cloud · 19/10/2026

Versión publicada: https://bettrack-wostcloud1.web.app. Firebase target `hosting:bettrack`, proyecto `wostcloud1`.

| Comprobación | Resultado |
|---|---|
| TypeScript y build PWA | Correctos; aviso no bloqueante de bundle principal >500 KB |
| Vitest | 78 pruebas aprobadas en 8 archivos |
| E2E cloud en URL pública | 4 escenarios aprobados, sin errores de página |
| Permisos y contabilidad API | 14 controles reales aprobados |
| Dependencias de producción | npm audit: 0 vulnerabilidades |
| Responsive | 375, 768 y 1440 px; login, registro y 7 vistas sin overflow horizontal |
| Publicación | 8 rutas/recursos HTTP 200 y hashes iguales a dist |

Los 4 escenarios E2E cubren sesión persistida con cookie, OCR real sobre imagen sintética, aislamiento entre cuentas, acceso desde otro contexto/dispositivo, cashout, Realtime, copia JSON con imagen y restauración, eliminación del archivo privado, cierre de sesión, usuario nuevo sin correo, contraseña incorrecta, limpieza de IndexedDB anterior, banca, casas, streamers y rechazo de escritura sin conexión.

Los controles API verifican rechazo a anónimos, aislamiento de filas, prohibición de escritura directa fuera de la RPC, bloqueo de lectura y subida de capturas ajenas, bucket sin acceso público, rollback de stake y cashout inconsistentes, borrado de billetera referenciada, retiro sin saldo, auditoría no eliminable y dos escrituras concurrentes con una sola aceptada.

Supabase Advisor conserva una advertencia de protección de contraseñas filtradas, función disponible en Pro. No se activó un plan de pago. El mínimo de 10 caracteres está configurado en servidor y formulario. No aparecen otros hallazgos de seguridad en la revisión. Referencia: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Evidencia regenerable: `test-results/firebase-live.json`, `test-results/firebase-login-1440.png`, capturas de login/registro en las tres anchuras y `e2e/cloud.spec.ts`. Los artefactos son ignorados por Git y no se publican.

Las cuentas temporales se identifican mediante registro QA explícito y se limpian sin incluir miembros reales. Los datos locales del usuario se eliminan al abrir cada origen con la versión nueva; no es posible limpiar a distancia un dispositivo que todavía no la haya cargado. La base anterior se comprobó borrada por la migración de arranque en las pruebas y la pantalla de acceso se verificó en los orígenes local y público del navegador compartido.

La suite antigua del MVP local se conserva como referencia; no se afirma que sus supuestos de escritura offline sigan siendo válidos. Instalación física iOS/Android y volúmenes grandes no ensayados.

## Cierre del 20/10/2026

Se eliminaron las cinco cuentas QA por UUID, correo interno y nombre de prueba coincidentes, tras borrar sus archivos mediante Storage API y revocar sus sesiones. Verificación remota: 0 cuentas QA, 0 capturas QA, 0 cuentas huérfanas. Se conservó la cuenta real registrada después del despliegue. El registro local de credenciales QA fue eliminado.
