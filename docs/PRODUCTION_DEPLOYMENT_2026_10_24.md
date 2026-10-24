# Despliegue controlado — 24/10/2026

Producción: **https://bettrack-wostcloud1.web.app**.
Autorización expresa del usuario recibida antes de integrar/publicar. Se ejecutó
el [plan de entrega](PERSISTENCE_PRODUCTION_READINESS.md) sin cambios funcionales adicionales.

- **SHA desplegado:** `cc4d4ade62693887ef421164be9f6ca1dabb70a2`.
- Firebase: proyecto `wostcloud1`, target `hosting:bettrack`, sitio
  `bettrack-wostcloud1`, versión **`4885a8046b5928a0`**.
- Release Hosting: `1792866836161000`; su mensaje identifica el SHA desplegado.
- CLI Firebase fijada en `15.34.1`; publicación exclusivamente de Hosting.
- Este recibo y la actualización del handoff son documentación posterior al
  despliegue; no cambian el código ni la versión publicada.

## Integración comprobada

| PR, orden autorizado | Commit de fusión en main |
| --- | --- |
| [#2](https://github.com/Jozhiky/Bettrack/pull/2) | `fd07ec6ba9f9e80a1294c18fe89cd04536bd80a5` |
| [#3](https://github.com/Jozhiky/Bettrack/pull/3) | `30bf32c0bddf5e9def7d0a7005420016b67a0d8c` |
| [#4](https://github.com/Jozhiky/Bettrack/pull/4) | `25cadd4bfdaba06c1d5da84a8f4d8f6b14fe5123` |
| [#5](https://github.com/Jozhiky/Bettrack/pull/5) | `7ebbb16f9251697215e84ea4e64aa1c119fcce91` |
| [#6](https://github.com/Jozhiky/Bettrack/pull/6) | `cc4d4ade62693887ef421164be9f6ca1dabb70a2` |

Cada PR se fusionó mediante merge commit, con SHA de origen esperado, sin squash,
rebase, force-push ni borrar ramas. Se verificaron sus dos padres, la ascendencia
y la igualdad del árbol resultante con el origen revisado. Las bases de #3–#6
se actualizaron a main en su turno. GitHub confirma las cinco fusionadas. El árbol
final antes del despliegue es idéntico al de `4414aa9`, validado en QA.

## Gates finales

- **581/581** unitarias y **3/3** controles negativos del destino de QA.
- TypeScript principal y de FASE 1/3/carga aprobados; build y diff-check aprobados.
- UI aislada completa a **375/768/1440 px**; consentimiento, duplicados, errores
  y reintentos conservados. No se ejecutó `test:e2e` ni el runner cloud de escritura.
- Los **15 activos OCR** del artefacto coinciden con `assets.lock.json`.
- Paquete productivo apunta al Supabase vigente; sin destino/fixtures QA,
  credenciales administrativas ni adaptador fake-indexeddb. El literal
  `sb_secret_` del SDK es únicamente una comprobación de prefijo, no una clave.
- El banco OCR de la versión revisada mantiene 1065/1089, 24 diferencias conocidas
  y 0 regresiones. No se repitió tras integrar: los árboles son idénticos.
- Permanece el aviso conocido de chunks >500 kB; no hubo errores de compilación.

## Verificación publicada, sin escrituras financieras

- **45 archivos** servidos coinciden por SHA-256 con el build: JS/CSS, fuentes,
  iconos, manifest, Workbox, service worker y los 15 activos OCR. `_redirects` está
  excluido expresamente por la configuración Hosting.
- Cinco rutas SPA verificadas: `/`, `/apuestas`, `/banca`, `/capturas`, `/configuracion`.
- Service worker publicado **activado**, script `/bettrack-sw.js`, con los 15
  activos OCR precacheados y cabecera `no-cache,no-store,must-revalidate`.
- Formulario de acceso visible y sin desbordamiento en 375/768/1440 px.
- La pantalla de carga y la revisión del **bundle publicado** se verificaron con
  sesión/captura **sintéticas solo dentro del navegador**. Se comprobaron formatos,
  selección múltiple, imagen, resumen y confirmación desactivada sin consentimiento.
  Todas las peticiones HTTP/WS del backend de esa comprobación fueron interceptadas;
  no hubo login remoto, subida ni registro en producción. La persistencia real ya
  está acreditada en el QA autorizado, no mediante apuestas reales en producción.
- Cero errores de página y cero solicitudes inesperadas. No se usaron credenciales
  de miembros ni se ejecutó una prueba autenticada en producción.

**Supabase de producción permanece intacto:** ninguna migración, SQL, política,
configuración Auth/Storage, usuario, apuesta o movimiento fue modificado durante
esta integración/despliegue. Tesseract sigue siendo local y gratuito. Las capturas
reales requieren revisión y confirmación explícita en la aplicación.

## Reversión disponible

Antes de publicar se conservó la versión anterior **`0f19ae2214920da4`**, release
`1792650012265000`, mediante el canal `rollback-20261024` del **mismo sitio**.
El canal temporal expira el 31/10/2026; la versión también permanece en el historial
live, cuyo `retainedReleaseCount=999999` no se modificó. No se eliminaron versiones.

Si se autoriza revertir, la CLI permite clonar la versión anterior explícita al
canal live del mismo sitio, sin tocar Supabase:

```powershell
npx.cmd -y firebase-tools@15.34.1 hosting:clone wostcloud1:bettrack-wostcloud1@0f19ae2214920da4 wostcloud1:bettrack-wostcloud1:live --project wostcloud1 --non-interactive
```

No se ejecutó rollback. Ante una incidencia crítica o cambio inesperado, detenerse
y solicitar aprobación antes de otra operación, conforme a la instrucción del usuario.

Evidencia local ignorada: `test-results/deployment-20261024/verification.json`,
`artifact-manifest.json`, `rollback.json`, snapshots de canales y capturas visuales.
No se publican imágenes, tokens ni credenciales.
