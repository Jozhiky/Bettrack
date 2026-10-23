# BETTRACK — reglas permanentes

- Empieza por `docs/CODEX_HANDOFF.md`, `git status --short` y el último commit.
  Lee después solo los módulos y documentos necesarios para la tarea; no cargues
  todos los informes, métricas JSON ni trazas OCR. Usa búsquedas acotadas con `rg`.
- Trabaja sobre la aplicación existente. Propón un plan breve, reproduce defectos
  antes de corregirlos y conserva cambios ajenos. No reconstruyas ni amplíes fases
  sin que lo pida el usuario.
- La persistencia vigente es Supabase por cuenta; OCR local gratuito. No reintroduzcas
  almacenamiento local de apuestas ni APIs de pago como requisito del reconocimiento.
- Conserva imagen y texto originales, selecciones y cuotas ausentes. Nunca inventes
  equipos, jugadores, mercados, períodos, importes o evidencia de colocación.
- Separa colocación (`preparation/confirmed/unknown`) de liquidación
  (`Pendiente/Ganada/Perdida/Cashout`). Una oferta cashout no es un cobro.
  Releer o renombrar una captura no elimina sus retenciones de colocación.
- Registro manual revisado: vista previa exacta, consentimiento explícito,
  comprobación de vigencia, controles de duplicados y auditoría. Un comprobante
  adicional no transfiere automáticamente aceptación ni importes al borrador.
- Mantén céntimos enteros, depósitos separados de beneficios y retornos potenciales
  fuera de resultados realizados. No cambies contabilidad, esquemas/migraciones ni
  datos históricos sin analizar impacto y autorización explícita.
- No despliegues ni ejecutes operaciones/E2E contra Supabase de producción sin
  autorización específica. `test:e2e` no es una prueba local segura: puede escribir
  datos cloud. Para sincronización, prepara primero un QA aislado autorizado.
- No publiques secretos, `.env`, identificadores de boletos ni capturas sensibles.
  Usa únicamente capturas autorizadas y desidentificadas; distingue evidencia real
  de sintética. No relajes oráculos ni omitas pruebas para aparentar mejoras.
- Verifica según el cambio; comandos y fallos estrictos conocidos están en el handoff.
  Documentación sola requiere validar referencias, comandos y diff, no repetir OCR.
- Commit/push solo dentro del alcance autorizado: staging explícito, sin force-push;
  ante conflictos remotos, detente y documenta. Confirma SHA remoto y archivos.
- Al cerrar cambios relevantes, actualiza el handoff con estado y pendientes breves;
  enlaza la evidencia, sin duplicarla. Responde en español y distingue publicado
  en GitHub de desplegado en producción.
