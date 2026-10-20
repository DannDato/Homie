# Homie

Asistente privado por Telegram con LLM local (Ollama) y SQLite. Los usuarios solicitan acceso con `/start`; el administrador autoriza o rechaza mediante botones. Cada persona tiene historial y pendientes separados por su ID de Telegram.

## Instalación

1. Instala Node.js 22+, pnpm y Ollama. Descarga el modelo: `ollama pull qwen3:8b`.
2. Copia `.env.example` a `.env`. Configura `TELEGRAM_BOT_TOKEN` y `ADMIN_TELEGRAM_USER_ID` (número real; puedes pedirlo con `/id`).
3. Ejecuta `pnpm install`, `pnpm approve-builds` si se solicita autorizar `better-sqlite3`/`esbuild`, `pnpm run check`, `pnpm test` y `pnpm dev`.

## Funciones actuales (PATCH 010)

- Conversación por Telegram y persistencia en SQLite.
- Usuarios aprobados por administrador y datos independientes.
- **Crear pendientes con lenguaje natural**: «Recuérdame pagar la luz el viernes a las 3», «Anota comprar leche mañana», «Agrega un pendiente sin fecha: arreglar la bici».
- La tool `crear_pendiente` valida fechas en `TZ` y calcula `recordar_en`: `REMINDER_LEAD_MINUTES` antes de una tarea con hora, o `DEFAULT_REMINDER_TIME` si solo se indicó el día. Las fechas se guardan en UTC.
- Cada alta exitosa se confirma con `✅ Pendiente #ID creado...` usando el resultado real de SQLite.
- `/usuarios`, `/autorizar ID`, `/bloquear ID` (administrador); `/start`, `/solicitar`, `/id`, `/ayuda`.

**Importante:** Este patch registra el pendiente y el horario de aviso, pero **aún no envía recordatorios automáticos**: el scheduler llegará más adelante. Tampoco permite listar, editar o completar tareas desde el LLM todavía. El agente se limita a una tool para controlar el comportamiento del modelo local. No envíes mensajes personales sensibles si tu equipo de trabajo está administrado por terceros.

## Datos y respaldo

La base vive en `SQLITE_PATH`, por defecto `./data/asistente.db`. Crea un respaldo con Homie detenido antes de aplicar patches. La migración se ejecuta automáticamente al inicio y conserva datos previos. No se abre un servidor HTTP ni ningún puerto de entrada. Telegram se usa mediante long polling; Ollama debe correr en localhost.

Consulta `ESPECIFICACION.md` para el diseño y las fases pendientes.

## PATCH 011 — Recordatorios vs. pendientes en proceso

- **Recordatorio:** algo puntual, con fecha opcional. Ej.: "Recuérdame pagar luz el viernes". Se guarda en `recordatorios`. **Todavía no envía avisos automáticos.**
- **Pendiente:** proceso de larga duración sin fecha límite. Ej.: "Tengo pendiente revisar mi video de YouTube". Se guarda en `pendientes`, inicialmente como `pendiente`.
- **Avances:** "En la revisión de mi video, ya cambié la miniatura" agrega un registro con fecha a `pendientes_avances` y cambia el estado a `en_progreso`.
- **Cierre:** "Terminé la revisión del video" lo deja `completado`, con fecha de cierre.
- **Consulta:** "¿Cómo va la revisión de mi video?" recupera estado y avances desde la base de datos.

Al iniciar tras aplicar este patch, los registros previos de `pendientes` (creados por el PATCH 010, cuyo comportamiento correspondía a recordatorios) se mueven una sola vez a `recordatorios`, conservando ID, usuario y fechas. Haz respaldo del archivo SQLite antes de arrancar por primera vez.

Cada lectura o escritura aplica `usuario_id` para mantener separados los datos. Las notificaciones y el scheduler vendrán en una fase posterior.
