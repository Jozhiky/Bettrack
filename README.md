# BETTRACK

Gestión de apuestas mediante capturas, con registro por usuario y contraseña y datos privados en Supabase. Frontend PWA React/TypeScript publicado en https://bettrack-wostcloud1.web.app.

## Ejecutar

Node.js 24.14.1 o compatible. En PowerShell:

```powershell
cd D:\Apuestas
npm.cmd ci
npm.cmd run assets:ocr
npm.cmd run build
npm.cmd start
```

Abre http://127.0.0.1:5187. Para desarrollo: `npm.cmd run dev` (puerto 5186 estricto). La aplicación requiere conexión con Supabase; no existe modo de escritura offline. El reconocimiento utiliza Tesseract local y modelos gratuitos incluidos en la PWA.

## Uso

1. Crea tu cuenta con un usuario y contraseña de al menos 10 caracteres. No se pide correo.
2. Registra capital, depósitos y retiros en Banca. Betano y Bet365 se crean sin saldo; no se añaden apuestas ni streamers de demostración.
3. En Mis apuestas, arrastra capturas, usa el selector, la cámara o Ctrl+V. El OCR guarda automáticamente los boletos reconocidos. Los casos incompletos o duplicados piden revisión.
4. Marca Ganada, Perdida o Cashout. Cashout pide el monto cobrado. Los tipos son Simple y Combinada; el detalle conserva los mercados Bet Builder.
5. Usa tu misma cuenta en otros dispositivos para consultar tu historial. Cada cuenta tiene datos separados.
6. Configuración permite respaldos JSON, CSV, importación y preferencias guardadas en Supabase.

Los importes de cashout ofrecido no se liquidan automáticamente. Los depósitos no son ganancias. Los balances separan monedas, capital comprometido y resultados realizados. Si un bono no está claro se conserva separado hasta confirmar el retorno.

## Datos y acceso

No se guardan registros en localStorage ni IndexedDB. La sesión usa una cookie; los datos y capturas están en Supabase. La PWA conserva archivos estáticos para cargar la interfaz. La versión cloud elimina automáticamente la antigua base local BETTRACK de cada origen cuando se abre, por solicitud del propietario.

No hay recuperación automática de contraseña sin correo; interviene el administrador. El registro no tiene invitaciones: cualquiera que conozca la URL puede crear su propia cuenta aislada.

## Verificación y despliegue

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run deploy:firebase
node scripts/verify-hosting.mjs
```

Los E2E requieren cuentas QA temporales; consulta `docs/CLOUD.md`. Solo se despliega el target `hosting:bettrack` del proyecto `wostcloud1`. No desplegar todos sus sitios. El propietario autorizó ese proyecto con facturación; no se añadieron servicios de pago de Supabase.

## Documentación vigente

- [Arquitectura, acceso, límites y pruebas cloud](docs/CLOUD.md)
- [Despliegue Firebase](docs/FIREBASE.md)
- [Lectura Betano](docs/BETANO.md)

`docs/ARCHITECTURE.md` y `docs/QA.md` conservan el historial del MVP local; la arquitectura vigente se describe en CLOUD.md. Funciones pendientes: otros formatos OCR/Bet365, sincronización Google Sheets, invitaciones de grupo, recuperación autónoma y paginación del backend para historiales grandes.
