# Verificación previa a publicación — OCR FASES 1 y 2

Fecha: 22/10/2026. Destino autorizado: `Jozhiky/Bettrack`, rama `main`.
Base remota verificada: `605687ad907558656e66aaaea86d1be2e8b34c8c`.

Este documento acompaña la publicación para auditoría independiente. No inicia la FASE 3 ni cambia el comportamiento implementado en la FASE 2.

## Verificaciones repetidas

- Vitest completo: **379/379**, 16 archivos; cero pruebas fallidas, omitidas, pendientes o declaradas como fallo esperado.
- `npx tsc --noEmit` y `npx tsc -p tests/ocr-phase1/tsconfig.json`: correctos.
- `npm run build`: correcto, incluido PWA. Permanece el aviso conocido de bundle mayor de 500 kB.
- `npm run test:ocr:phase2`: correcto; 15 lecturas reales, dos inyecciones y cinco geometrías, sin desviaciones inesperadas. Paridad sin instrumentación: 5/5.
- Modo estricto, una repetición: código **1**, conservando los cuatro errores literales conocidos. Los tres contratos de aceptación y las dos inyecciones estructurales pasan.
- La precisión por campo y los hashes del código medido coinciden con la evidencia entregada de FASE 2.
- Revisión del contenido preparado y `git diff --cached --check` antes del commit.

Se mantienen las mediciones originales de `OCR_PHASE2_METRICS.json` y los tiempos de su informe para conservar la evidencia revisada. La repetición confirma la misma precisión; los tiempos varían entre ejecuciones. Los resultados temporales de esta validación permanecen excluidos de Git.

## Cuatro diferencias literales conservadas

1. `player-builders`: `München` se lee `Munchen` en un evento.
2. `first-half-corners`: `Más/Menos` se lee `Mas/Menos` en un mercado.
3. `first-half-corners`: `Más de 4.5` se lee `Mas de 4.5` en un pick.
4. `mixed-builders`: `Sí` se lee `Si` en un submercado.

No se eliminan diacríticos del evaluador ni se omiten estas comprobaciones para hacer pasar el modo estricto.

## Contenido y privacidad

Se incluye un manifiesto explícito de archivos de implementación, pruebas, corpus y documentación de ambas fases. Se revisaron visualmente las cinco imágenes del corpus: no muestran titular, cuenta, correo, ID del boleto, QR ni credenciales. Los PNG conservan únicamente los bloques de metadatos permitidos y sus hashes coinciden con las anotaciones.

El corpus conserva participantes deportivos públicos, mercados e importes necesarios para las regresiones. No se incorporan capturas adicionales, bases exportadas, trazas privadas, archivos `.env`, contraseñas, tokens ni claves. Se retiró de una frase del informe FASE 1 una referencia innecesaria a una ruta privada; no se cambió ninguna métrica ni resultado esperado.

Se revisó el manifiesto y se buscaron patrones de secretos y datos personales antes del commit. Esta revisión no constituye una certificación de ausencia universal de secretos en todo el historial previo del repositorio.

## Límites y reproducción

No se modifican migraciones, fórmulas contables, datos históricos ni configuración cloud. No se despliega a Firebase ni se ejecuta ninguna operación de Supabase. No hay workflows de GitHub versionados que disparen un despliegue al publicar este commit.

Los hashes de texto de las auditorías son SHA-256 de bytes del entorno de referencia Windows. Una conversión LF/CRLF al clonar puede producir diferencias de hash sin cambiar el código; no se deben aceptar nuevas referencias automáticamente. Los hashes de las imágenes y modelos no dependen de los finales de línea. Esta limitación queda visible para el revisor independiente.

Los informes de las fases describen el estado previo a esta publicación cuando indican que todavía no se había hecho commit o push. Este documento registra la verificación posterior, sin reescribir aquella evidencia.
