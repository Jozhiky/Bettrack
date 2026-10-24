# Persistencia y preparación de producción

Validación ejecutada el 24/10/2026 sobre `b3b9ffd` (PR #5).
Rama de entrega: `codex/persistence-readiness`, apilada sobre PR #5.
**Persistencia y sincronización verificadas en Supabase aislado; sin escrituras
en producción, merge ni despliegue.**

## Entorno y alcance

El usuario autorizó usar la organización «Jozhiky 2» y crear QA únicamente después
de comprobar coste cero. La herramienta de costes devolvió **0 USD/mes**; la
organización confirma `plan=free`, `tier=tier_free`. Se creó `bettrack-qa-isolated`,
separado del backend de producción. No se habilitó facturación ni servicios OCR/IA.

Docker estaba instalado pero no pudo arrancar: el gestor de inferencia falló al
acceder a su endpoint `dockerInference`. No se reseteó Docker, borraron sus datos,
actualizó su instalación ni modificó WSL. Se continuó por el QA cloud autorizado.

QA recibió las tres migraciones **existentes e intactas**. Se compararon solo
metadatos con producción: políticas, RLS, bucket y definiciones RPC. Se encontró
una diferencia anterior en `bettrack_private.commit`: producción cuenta filas de
selección para la restricción de Simple; la última migración cuenta hojas Builder.
Esto afecta a un Simple con un Builder de varias hojas. Se copió **solo a QA** la
definición desplegada; su hash coincide ahora con producción
(`b2418a34716d97da6d0e0934141f324b`). Políticas, RLS, bucket y otras tres funciones
ya coincidían. No se editó ninguna migración ni se escribió en producción.

Dos cuentas sintéticas preconfirmadas se prepararon exclusivamente en QA.
El alta API con dominio reservado `.invalid` fue rechazada por la configuración
predeterminada del proyecto nuevo; el GET público de configuración confirma
`mailer_autoconfirm=false` en QA y `true` en producción. Se aprovisionaron fixtures controlados mediante
SQL en QA y se validó **inicio de sesión real por usuario/contraseña en la UI**.
Esta prueba no acredita el alta pública ni recuperación de contraseñas. No se
tocaron usuarios, credenciales o configuración Auth de producción.

La aplicación de prueba es un build real de `src/main.tsx`. Un plugin exclusivo
del ejecutor sustituye solamente URL y clave pública por el proyecto QA permitido.
**Auth, CloudStore, repositorio, Storage, Realtime, OCR y confirmación son reales**;
no hay fake-indexeddb ni dobles de persistencia en esta prueba. El build se sirve
en loopback:5190 desde `test-results/persistence-app/`, fuera del `dist` publicable.
Se comprobó que `dist` conserva el destino productivo y no contiene el proyecto QA.
El navegador y los clientes API prohíben cualquier destino no autorizado. Las
credenciales permanecen en `.env.qa-isolated.json`, ignorado, sin incluirlas en
informes ni GitHub.

## Resultados ejecutados

**17/17 escenarios persistentes**, con múltiples aserciones cada uno:

1. Inicio de sesión real de dos cuentas y aislamiento entre ellas.
2. Subida/descarga de Storage privado; lectura ajena y anónima denegadas.
3. Revisión de texto, corrección, resumen y consentimiento antes de guardar;
   exactamente un cargo y ninguna liquidación al confirmar la captura.
4. Recarga con los mismos identificadores; segunda sesión recupera apuesta,
   selecciones y descarga la imagen privada.
5. Carga simultánea de la misma imagen renombrada sin segundo cargo.
6. Lote JPEG/WebP persistido como borradores independientes en revisión.
7. Desconexión: sin escrituras, seguida de reintento únicamente del archivo fallido.
8. Storage responde 503: reintento seguro sin registro financiero prematuro.
9. Respuesta de confirmación perdida **después** de commit real: recarga recupera
   lo guardado y no genera un segundo débito.
10. Dos escrituras con la misma versión: una aceptada, la desactualizada rechazada.
11. Dos sesiones confirman simultáneamente el mismo borrador: una sola apuesta y cargo.
12. Escritura ajena/directa y segundo movimiento de stake rechazados con rollback.
13. Un Simple Builder conserva dos hojas sin generar otro cargo, conforme al servidor desplegado.
14. UI persistente a 375 px, sin desbordamiento horizontal.
15. UI persistente a 768 px, sin desbordamiento horizontal.
16. UI persistente a 1440 px, sin desbordamiento horizontal.
17. Oferta cashout S/8 y potencial S/20 no producen cobro; solo liquidación manual
    explícita registra S/5 y su retorno permanece después de recargar.

Estado final sintético: **3 apuestas, 3 selecciones, 3 movimientos de stake y 1 de
cashout; 1 liquidación**. Las otras capturas siguen en revisión/duplicado. La
segunda cuenta permanece sin apuestas. Cero errores de página y cero peticiones
a destinos bloqueados. Se cerraron navegadores y sesiones API (signOut global).
Los fixtures y el proyecto gratuito se conservan para reproducir QA, separados
de producción; no se publican sus credenciales ni imágenes.

Pruebas complementarias:

- Suite vigente: **581/581**, TypeScript principal y build aprobados; aviso
  conocido de chunks >500 kB. No se cambió código funcional ni contabilidad.
- **3/3** controles de destino: rechazan producción, proyectos arbitrarios y
  cuentas que no pertenecen al patrón sintético antes de construir el cliente.
- UI de carga en RAM: 375/768/1440 px aprobados tras corregir un fallo reproducido
  del banco: importación dinámica de Tesseract invalidada por optimización Vite.
  Cada servidor tiene caché privada y dependencias declaradas, sin descubrimiento
  tardío. No cambia el motor OCR ni el build productivo.
- Banco OCR real: **28/28, 1065/1089, 24 diferencias**, calidad completa por
  id/repetición idéntica a 4C.2 y mismos hashes de corpus/admisión/activos.
  **0** selecciones omitidas/adicionales, falsas confirmaciones, victorias o
  cashouts ejecutados. No se tocaron oráculos. bet365 sigue sin corpus real admitido.
- `git diff --check` aprobado. Nunca se ejecutó el `test:e2e` histórico, que sigue
  apuntando a producción y además asume registro automático anterior a PR #5.

Evidencia local: `test-results/persistence-qa/report.json`, `persistent-375.png`,
`persistent-768.png`, `persistent-1440.png`, definición SQL comparada, informe OCR
y `test-results/capture-upload/report.json`. Todo permanece fuera de Git.

## Reproducción segura

`npm.cmd run test:persistence:qa` ejecuta los tres controles de destino y el flujo
completo con los fixtures locales. **Resetea solo los dos usuarios sintéticos de
QA**, preservando su auditoría; nunca importar `scripts/cloud-qa.mjs` para esto.
El destino autorizado está fijado en `scripts/persistence-qa/target.mjs` y no se
puede convertir en producción mediante una variable de entorno. Requiere el
registro de fixtures ignorado; si falta, debe reprovisionarse en el proyecto QA,
sin solicitar ni reutilizar credenciales de miembros reales.

No recrear el QA únicamente con las migraciones y asumir paridad: verificar la
diferencia Simple Builder descrita arriba y copiar su definición **solo al QA**
antes de repetir. Un futuro cambio de esquema requiere análisis y autorización
aparte. `npm.cmd run demo:persistence:qa` sirve el build aislado en 5190; el
ejecutor normal lo inicia y cierra automáticamente. La demo 5188 sigue siendo RAM.

## Plan de integración y publicación — pendiente de autorización

1. Revisar y aprobar la cadena **#2 → #3 → #4 → #5 → PR de esta rama**. #2/#3/#4
   siguen como borrador. GitHub indica ausencia de conflictos y se comprobó que
   cada padre es ancestro del siguiente. `merge-tree main → PR #5` también termina
   sin conflictos; no altera ninguna rama ni ejecuta una fusión.
2. Con autorización, integrar en ese orden conservando la ascendencia (sin squash
   de padres mientras dependan PR apiladas). Actualizar explícitamente la base de
   cada PR restante hacia main y volver a verificar su diff; no borrar ramas padre
   hasta completar la cadena. Detenerse ante cambios remotos o conflictos nuevos.
3. Fijar el SHA integrado aprobado. Repetir los gates pertinentes si cambia el
   árbol respecto de lo validado; construir **el dist normal**, nunca la carpeta QA.
   Verificar el destino Supabase productivo, recursos OCR fijados y ausencia de
   fixtures/credenciales/QA en el artefacto. No ejecutar migraciones de Supabase.
4. Solo con autorización expresa de despliegue, publicar únicamente Hosting
   `bettrack` del proyecto Firebase `wostcloud1`, sitio `bettrack-wostcloud1`.
   No publicar Functions, reglas, otros sitios ni cambios del backend.
5. Verificar hashes servidos, rutas, modelos OCR y actualización del service worker;
   comprobar acceso responsive en un navegador nuevo sin crear apuestas. Las
   primeras escrituras reales requieren consentimiento del usuario en la UI.
6. Conservar la versión anterior de Hosting para rollback del frontend. Un rollback
   no borra ni modifica apuestas; ante incidencias, detener nuevas confirmaciones
   y volver a la versión anterior, sin restaurar snapshots históricos de la base.

**Decisión:** el flujo de carga y guardado para cuentas existentes está preparado
para un despliegue controlado con revisión humana. Persisten los límites OCR y de
cobertura real de bet365. Ninguna PR se fusionó y Firebase no se desplegó. La única
autorización pendiente es integrar la versión revisada y publicarla según este plan.
