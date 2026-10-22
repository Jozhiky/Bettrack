# Firebase Hosting de BETTRACK

## Hosting y versión cloud del 19/10/2026

- Proyecto solicitado y accesible: `wostcloud1`.
- Web app verificada: `1:950932423235:web:2a2b83a166629f9b270af6`.
- Sitio exclusivo de BETTRACK: `bettrack-wostcloud1`.
- Dirección: https://bettrack-wostcloud1.web.app.
- Firebase rechazó `bettrack` porque está reservado por otro proyecto; por eso no se pudo asignar `bettrack.web.app`.
- `.firebaserc` asigna únicamente ese sitio al target `bettrack`.
- El proyecto también contiene otros sitios, entre ellos Huarique. Ningún despliegue debe usar sus targets ni el sitio predeterminado.

La consulta de facturación del 17/10/2026 devuelve `billingEnabled: true`. El usuario autorizó expresamente publicar en este proyecto aceptando los posibles cargos. Hosting comparte cuota entre sitios del mismo proyecto y puede generar cargos al excederla. No se cambió el plan. Solo se creó y publicó el sitio exclusivo de BETTRACK; no se desplegaron otros sitios, bases de datos ni funciones.

## SDK

`firebase` está instalado con versión exacta en package.json. `src/integrations/firebase.ts` inicializa la aplicación con la configuración pública entregada por el usuario y verificada con Firebase CLI. No conecta Firestore, Storage ni Supabase.

Analytics no se inicia en la versión cloud. Firebase se usa únicamente como Hosting; la cuenta, registros y capturas utilizan Supabase. La configuración pública de Firebase permanece disponible, sin guardar datos ni telemetría.

Se fijó `@grpc/grpc-js` en `overrides` a una versión corregida porque el paquete Firebase incluía una dependencia transitiva vulnerable de Firestore para Node. Firestore no se importa al frontend.

## Validación local

```powershell
npm.cmd test
npm.cmd run build
npx.cmd -y firebase-tools@latest emulators:start --only hosting --project wostcloud1
```

Emulador: `http://127.0.0.1:5190`. Las rutas SPA resuelven a index.html; los assets con hash tienen caché inmutable y el service worker obliga a revalidar.

## Actualizaciones

Desde la carpeta del proyecto:

```powershell
npm.cmd run deploy:firebase
node scripts/verify-hosting.mjs
```

El script compila y publica únicamente `hosting:bettrack` en `wostcloud1`; `.firebaserc` lo dirige a `bettrack-wostcloud1`. El sitio ya existe: no es necesario crearlo otra vez. La verificación compara los hashes publicados con dist y comprueba login/registro en 375, 768 y 1440 px, sin crear datos. La suite cloud prueba por separado OCR, persistencia, cashout y permisos con cuentas temporales.

Para mantener la exigencia de cero cargos automáticos, utilizar un proyecto separado sin facturación (Spark) y sustituir la configuración por la web app de ese proyecto. No degradar `wostcloud1`: aloja aplicaciones ajenas a este trabajo.

## Datos cloud

La nueva versión elimina la base local anterior cuando se abre cada origen, por autorización del usuario. No importa automáticamente los datos viejos. Todas las operaciones nuevas se guardan en Supabase por cuenta. Consulta CLOUD.md.

Fuentes oficiales:
- https://firebase.google.com/docs/hosting/full-config
- https://firebase.google.com/docs/hosting/multisites
- https://firebase.google.com/docs/hosting/usage-quotas-pricing
- https://firebase.google.com/docs/analytics/get-started?platform=web
