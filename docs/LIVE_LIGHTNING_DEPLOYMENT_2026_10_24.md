# PR #10: rayo Betano publicado con autorización

Producción: [bettrack-wostcloud1.web.app](https://bettrack-wostcloud1.web.app).
[PR #10 fusionado](https://github.com/Jozhiky/Bettrack/pull/10), conservando historial,
sin conflictos ni cambios adicionales de código durante la integración.

- **SHA desplegado:** `783b4d9a104fca02abb95fa130e2d7eac6b6f6ae`.
- Firebase: proyecto `wostcloud1`, sitio `bettrack-wostcloud1`, solo `hosting:bettrack`.
- Versión `bce1137d10a9d022`; release `1792881445781000`.
- Publicado el **24/10/2026 22:37:25.781 UTC**.
- Commits documentales posteriores no cambian el frontend desplegado.

El usuario autorizó expresamente «Sí, fusionar y desplegar el PR #10».
No se ejecutó SQL, migraciones, cambios de Auth/RLS/Storage ni pruebas financieras
productivas. No se iniciaron sesiones reales de miembros ni se modificaron apuestas
ya guardadas durante esta publicación. El comportamiento normal del nuevo frontend
añade únicamente evidencia visual y auditoría a borradores pendientes que contienen
el icono; las escrituras financieras conservan su consentimiento explícito.

## Verificaciones

- Sobre el SHA integrado: **700/700** pruebas unitarias, TypeScript y build.
  Comparación del árbol con el head revisado del PR sin diferencias de aplicación.
- Vigentes las regresiones del mismo código: OCR real **1067/1089**, mismas 22
  discrepancias, cero regresiones por check, corpus/oráculos/recursos intactos;
  FASE 3 con siete discrepancias literales previas y paridad 7/7. QA de persistencia
  del rayo en borradores existentes y cinco grupos de lote aprobados.
- Sitio publicado: **45 hashes**, **15 recursos OCR**, cinco rutas, MIME WASM y
  caché del SW correctos. Service worker activado y OCR precargado.
- Formulario público de acceso y resumen a **375/768/1440 px**, sin desbordamientos.
  No se probó un inicio de sesión productivo: autenticación/persistencia real se
  comprobaron previamente en el QA aislado autorizado.
- Sesión visual exclusivamente sintética e interceptada: ocho borradores, seis
  preparados y dos excepciones; recuperó el rayo desde los píxeles de una imagen
  ya guardada y mostró «⚡ En vivo», Cashout, stake, cobro y neto correctos.
- Una petición de metadatos simulada, limitada a uploads/audit, conservó todos los
  demás campos originales. **Cero peticiones al backend real**, cero peticiones
  financieras antes del consentimiento y ninguna apuesta real creada.

El rayo acredita la modalidad, no un cobro. El cashout necesita además la evidencia
terminal y su importe realizado. Las ofertas siguen pendientes; ausencia de rayo
o un reloj no certifican prematch. No se corrigen retroactivamente apuestas guardadas.
Tesseract sigue local y gratuito; no se añadieron dependencias ni servicios de pago.

## Reversión

- Versión anterior `05009865f34f9c83` conservada en historial de Hosting
  (`retainedReleaseCount=999999`).
- Reversión compatible `147f7955f5aebaf5`, canal `rollback-pr9-compatible`:
  [URL](https://bettrack-wostcloud1--rollback-pr9-compatible-oa7djp23.web.app).
- Expira el **31/10/2026 21:53:57.778349471 UTC**. Se reutilizó sin publicar otro canal
  ni sincronizar dominios de Firebase Auth.
- Verificada de nuevo: 30 hashes y tres anchuras; pudo leer un registro accounting
  con live=true y mode=live y bloqueó nuevas importaciones automáticas con cero
  llamadas de capacidades/commit y cero backend real. No cambió el contrato de datos.
- No usar una versión anterior a accounting después de importar históricos con ese
  origen de fecha. Ante un fallo crítico, detenerse e informar antes de otra operación.

Evidencia ignorada local: `test-results/deployment-pr10-20261024/`, con manifiesto,
release, comprobación pública y capturas sintéticas; ninguna captura privada publicada.
Una sesión antigua puede mostrar «Actualizar ahora» para activar la nueva PWA.
