import { Bot, InlineKeyboard } from 'grammy';
import { quickIntent } from './intent.js';
import { cachedView } from './quick-cache.js';
import { startTyping } from './typing.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import type { HomieDatabase } from '../../db/connection.js';
import { getValue, setValue } from '../../db/repos/kv.js';
import { findUser, listUsers, requestAccess, resolveRequest, resubmitRequest, updateUserStatus } from '../../db/repos/users.js';
import { chat } from '../../core/agent/chat.js';
import { escapeHtml, splitMessage, renderAssistantText } from './format.js';
import { menu, help, processList, processDetail, reminderList, reminderDetail, priorityMenu, completionConfirm, dailyView } from './ui.js';
import { getTask, addProgress, completeProcess } from '../../db/repos/tasks.js';
import { addContext, setImportance } from '../../db/repos/context.js';

export function createBot(db: HomieDatabase): Bot {
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
  const adminId = config.ADMIN_TELEGRAM_USER_ID;
  const keyboard = (id: number) => new InlineKeyboard()
    .text('✅ Autorizar', `access:yes:${id}`).text('❌ Rechazar', `access:no:${id}`);
  const displayName = (from: { first_name: string; last_name?: string; username?: string }) =>
    [from.first_name, from.last_name].filter(Boolean).join(' ').slice(0, 120) || from.username || 'Usuario';
  const notifyAdmin = async (id: number, name: string) => {
    try {
      await bot.api.sendMessage(adminId, `🏠 Solicitud de acceso a Homie\n\n👤 ${escapeHtml(name)}\nID: <code>${id}</code>`, {
        parse_mode: 'HTML', reply_markup: keyboard(id)
      });
    } catch (err) { logger.error({ err, requestedUserId: id }, 'No se pudo notificar al administrador'); }
  };

  bot.command('id', async ctx => {
    if (ctx.chat.type === 'private' && ctx.from) await ctx.reply(`Tu ID de Telegram es: ${ctx.from.id}`);
  });

  // Comandos para solicitar acceso: no necesitan autorización, solo chat privado.
  bot.command(['start', 'solicitar'], async ctx => {
    if (ctx.chat.type !== 'private' || !ctx.from) return;
    const id = ctx.from.id;
    logger.info({userId:id},'Telegram · solicitud de acceso');
    if (id === adminId) { await ctx.reply('🏠 ¡Hola! Eres el administrador de Homie. Usa /usuarios para gestionar accesos.'); return; }
    const existing = findUser(db, id);
    if (existing?.estado === 'autorizado') { await ctx.reply('🏠 ¡Bienvenido de nuevo! Ya puedes conversar conmigo.'); return; }
    if (existing?.estado === 'bloqueado') { await ctx.reply('No tienes acceso a Homie.'); return; }
    const name = displayName(ctx.from);
    const fresh = existing?.estado === 'rechazado' ? resubmitRequest(db,id) : requestAccess(db,id,name);
    if (fresh) await notifyAdmin(id, name);
    await ctx.reply(fresh ? '📨 Solicitud enviada. El administrador debe autorizarte antes de usar Homie.' : '⏳ Tu solicitud sigue pendiente de autorización.');
  });

  bot.callbackQuery(/^access:(yes|no):(\d+)$/, async ctx => {
    if (ctx.from.id !== adminId || ctx.chat?.type !== 'private') {
      logger.warn({ rejectedUserId: ctx.from.id }, 'Callback de autorización rechazado');
      await ctx.answerCallbackQuery(); return;
    }
    const id = Number(ctx.match[2]);
    if (!Number.isSafeInteger(id) || id <= 0 || id === adminId) { await ctx.answerCallbackQuery({ text: 'ID inválido' }); return; }
    const status = ctx.match[1] === 'yes' ? 'autorizado' : 'rechazado';
    logger.info({userId:id,status,adminId},'Telegram · decisión de acceso');
    if (!resolveRequest(db,id,status)) { await ctx.answerCallbackQuery({ text: 'Solicitud ya procesada' }); return; }
    await ctx.answerCallbackQuery({ text: status === 'autorizado' ? 'Autorizado' : 'Rechazado' });
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
    await ctx.reply(`${status === 'autorizado' ? '✅ Acceso autorizado' : '❌ Solicitud rechazada'} para ${id}.`);
    try { await bot.api.sendMessage(id, status === 'autorizado'
      ? '✅ Te autorizaron a usar Homie. ¡Ya puedes escribirme!'
      : '❌ Tu solicitud de acceso a Homie fue rechazada.'); }
    catch (err) { logger.warn({ err, targetId: id }, 'No se pudo notificar la decisión'); }
  });

  // A partir de aquí, solo usuarios autorizados o el administrador.
  bot.use(async (ctx, next) => {
    if (!ctx.from || ctx.chat?.type !== 'private' || (ctx.from.id !== adminId && findUser(db,ctx.from.id)?.estado !== 'autorizado')) {
      logger.warn({ rejectedUserId: ctx.from?.id ?? null }, 'Acceso no autorizado'); return;
    }
    if (ctx.chat && !getValue(db,ctx.from.id,'telegram_chat_id')) setValue(db,ctx.from.id,'telegram_chat_id',String(ctx.chat.id));
    await next();
  });

  bot.command('usuarios', async ctx => {
    if (!ctx.from || ctx.from.id !== adminId) return;
    const users = listUsers(db).filter(u => u.telegram_id !== adminId);
    const rows = users.map(u => `${u.estado === 'autorizado' ? '✅' : u.estado === 'pendiente' ? '⏳' : '🚫'} ${escapeHtml(u.nombre)} (<code>${u.telegram_id}</code>) — ${u.estado}`);
    await ctx.reply(rows.length ? `👥 Usuarios de Homie:\n${rows.join('\n')}` : 'Todavía no hay usuarios registrados.', { parse_mode: 'HTML' });
  });
  bot.command('bloquear', async ctx => {
    if (!ctx.from || ctx.from.id !== adminId) return;
    const id = Number(ctx.match?.trim());
    if (!Number.isSafeInteger(id) || id <= 0 || id === adminId || !updateUserStatus(db,id,'bloqueado')) { await ctx.reply('Uso: /bloquear ID (ID existente, distinto del administrador).'); return; }
    await ctx.reply(`🚫 Acceso revocado para ${id}.`);
  });
  bot.command('autorizar', async ctx => {
    if (!ctx.from || ctx.from.id !== adminId) return;
    const id = Number(ctx.match?.trim());
    if (!Number.isSafeInteger(id) || id <= 0 || id === adminId || !updateUserStatus(db,id,'autorizado')) { await ctx.reply('Uso: /autorizar ID (ID existente).'); return; }
    await ctx.reply(`✅ Usuario ${id} autorizado.`);
  });
  // UI interactiva: callback_data contiene solo IDs; siempre se resuelve con usuario_id.
  const pendingKey='telegram_pending_input';
  bot.command('menu', async ctx => {logger.info({userId:ctx.from?.id},'Telegram · menú principal');const v=menu();await ctx.reply(v.text,{parse_mode:'HTML',reply_markup:v.keyboard});});
  bot.command('pendientes', async ctx => {if (!ctx.from) return; const v=processList(db,ctx.from.id,0);await ctx.reply(v.text,{parse_mode:'HTML',reply_markup:v.keyboard});});
  bot.command('recordatorios', async ctx => {if (!ctx.from) return; const v=reminderList(db,ctx.from.id,0);await ctx.reply(v.text,{parse_mode:'HTML',reply_markup:v.keyboard});});
  bot.command('cancelar', async ctx => {if (!ctx.from) return; db.prepare('DELETE FROM kv WHERE usuario_id=? AND clave=?').run(ctx.from.id,pendingKey);await ctx.reply('Acción cancelada. Puedes seguir conversando normalmente.');});
  bot.callbackQuery(/^h:(.+)$/, async ctx => {
    const uid=ctx.from.id;
    logger.debug({userId:uid,action:ctx.match[1]?.split(':')[0]},'Telegram · interacción de botón');
    const parts=ctx.match[1]!.split(':');const op=parts[0];const number=Number(parts[2]??parts[1]);
    const validId=Number.isSafeInteger(number)&&number>0;
    const show=async (v:ReturnType<typeof menu>|undefined)=>{
      if(!v){await ctx.answerCallbackQuery({text:'Este elemento ya no está disponible.'});return;}
      await ctx.answerCallbackQuery();await ctx.editMessageText(v.text,{parse_mode:'HTML',reply_markup:v.keyboard}).catch(async()=>{await ctx.reply(v.text,{parse_mode:'HTML',reply_markup:v.keyboard});});
    };
    if(op==='menu')return show(menu());if(op==='help')return show(help());
    if(op==='p'||op==='r'){
      const page=Number(parts[1]);if(!Number.isSafeInteger(page)||page<0||page>100) return void await ctx.answerCallbackQuery({text:'Página inválida'});
      return show(op==='p'?processList(db,uid,page):reminderList(db,uid,page));
    }
    if(!validId)return void await ctx.answerCallbackQuery({text:'Solicitud inválida'});
    if(op==='pview')return show(processDetail(db,uid,number));
    if(op==='rview')return show(reminderDetail(db,uid,number));
    if(op==='prio'&&getTask(db,uid,number))return show(priorityMenu(number,'pendiente'));
    if(op==='rprio'&&reminderDetail(db,uid,number))return show(priorityMenu(number,'recordatorio'));
    if(op==='confirm'&&getTask(db,uid,number))return show(completionConfirm(number,'pendiente'));
    if(op==='rconfirm'&&reminderDetail(db,uid,number))return show(completionConfirm(number,'recordatorio'));
    if(op==='write'){
      const kind=parts[1];if(!['progress','context','rcontext'].includes(kind??''))return void await ctx.answerCallbackQuery();
      const exists=kind==='rcontext'?reminderDetail(db,uid,number):getTask(db,uid,number);
      if(!exists || (kind==='progress'&&getTask(db,uid,number)?.estado!=='pendiente'&&getTask(db,uid,number)?.estado!=='en_progreso'))return void await ctx.answerCallbackQuery({text:'Elemento no disponible'});
      db.prepare('INSERT INTO kv(usuario_id,clave,valor) VALUES(?,?,?) ON CONFLICT(usuario_id,clave) DO UPDATE SET valor=excluded.valor').run(uid,pendingKey,JSON.stringify({kind,id:number}));
      await ctx.answerCallbackQuery();await ctx.reply(`${kind==='progress'?'📝 Escribe el avance': '💬 Escribe la nota de contexto'} en tu siguiente mensaje.\nUsa /cancelar para salir.`);return;
    }
    if(op==='set'){
      const kind=parts[1];const id=Number(parts[2]);const priority=parts[3];
      if((kind!=='pendiente'&&kind!=='recordatorio')||!Number.isSafeInteger(id)||id<=0||!['alta','media','baja'].includes(priority??''))return void await ctx.answerCallbackQuery({text:'Solicitud inválida'});
      if(!setImportance(db,uid,kind,id,priority as 'alta'|'media'|'baja'))return void await ctx.answerCallbackQuery({text:'Elemento no encontrado'});
      return show(kind==='pendiente'?processDetail(db,uid,id):reminderDetail(db,uid,id));
    }
    if(op==='finish'){
      const kind=parts[1];const id=Number(parts[2]);if(!Number.isSafeInteger(id)||id<=0)return void await ctx.answerCallbackQuery({text:'ID inválido'});
      if(kind==='pendiente'){
        const task=getTask(db,uid,id);if(!task||task.estado==='cancelado')return void await ctx.answerCallbackQuery({text:'Pendiente no disponible'});
        completeProcess(db,uid,id);return show(processDetail(db,uid,id));
      }
      if(kind==='recordatorio'){
        const result=db.prepare("UPDATE recordatorios SET estado='completado',actualizado=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND usuario_id=? AND estado IN ('pendiente','en_progreso')").run(id,uid);
        if(!result.changes)return void await ctx.answerCallbackQuery({text:'Recordatorio no disponible'});
        return show(reminderDetail(db,uid,id));
      }
    }
    await ctx.answerCallbackQuery({text:'Acción no disponible'});
  });
  bot.command('ayuda', async ctx => {
    const v=help();await ctx.reply(v.text,{parse_mode:'HTML',reply_markup:v.keyboard});
  });
  bot.on('message:text', async ctx => {
    const text = ctx.message.text;
    logger.debug({userId:ctx.from.id,chars:text.length},'Telegram · texto entrante');
    if (text.startsWith('/')) return;
    const pending=getValue(db,ctx.from.id,pendingKey);
    if(pending){
      logger.info({userId:ctx.from.id},'Telegram · procesando respuesta de formulario');
      let action: {kind:string;id:number}|undefined;
      try {action=JSON.parse(pending) as {kind:string;id:number};}catch { /* Estado obsoleto */ }
      db.prepare('DELETE FROM kv WHERE usuario_id=? AND clave=?').run(ctx.from.id,pendingKey);
      if(!action||!Number.isSafeInteger(action.id)||action.id<=0){await ctx.reply('Acción inválida. Intenta nuevamente.');return;}
      const note=text.trim();if(!note||note.length>4000){await ctx.reply('El texto debe tener entre 1 y 4000 caracteres.');return;}
      if(action.kind==='progress'){
        const task=addProgress(db,ctx.from.id,action.id,note);
        if(!task){await ctx.reply('No encontré ese pendiente activo.');return;}
        const v=processDetail(db,ctx.from.id,action.id)!;await ctx.reply(`✅ Avance registrado.\n\n${v.text}`,{parse_mode:'HTML',reply_markup:v.keyboard});return;
      }
      if(action.kind==='context'||action.kind==='rcontext'){
        const type=action.kind==='context'?'pendiente':'recordatorio';
        const written=addContext(db,ctx.from.id,type,action.id,note);
        if(!written){await ctx.reply('No encontré ese elemento.');return;}
        const v=type==='pendiente'?processDetail(db,ctx.from.id,action.id):reminderDetail(db,ctx.from.id,action.id);
        if(v)await ctx.reply(`✅ Contexto guardado.\n\n${v.text}`,{parse_mode:'HTML',reply_markup:v.keyboard});return;
      }
    }
    if (text.length > 4000) { await ctx.reply('El mensaje es demasiado largo (máximo 4000 caracteres).'); return; }
    // Short list requests bypass Ollama so natural phrases share the same interactive UI.
    const route = quickIntent(text);
    if (route) {
      logger.info({userId:ctx.from.id,route},'Telegram · lista interactiva desde texto natural');
      const start = performance.now();
      const {view,hit} = cachedView(db,ctx.from.id,route,() => route === 'pendientes' ? processList(db,ctx.from.id,0) : route === 'recordatorios' ? reminderList(db,ctx.from.id,0) : dailyView(db,ctx.from.id,route));
      logger.info({userId:ctx.from.id,route,cacheHit:hit,durationMs:Math.round(performance.now()-start)},'Router rápido · respuesta desde SQLite');
      await ctx.reply(view.text,{parse_mode:'HTML',reply_markup:view.keyboard});
      return;
    }
    // Telegram solo mantiene 'escribiendo' unos segundos. Renovarlo durante toda la
    // espera en cola, las iteraciones del modelo y la ejecución de tools.
    const stopTyping = startTyping(
      () => bot.api.sendChatAction(ctx.chat.id, 'typing'),
      error => logger.debug({ userId: ctx.from.id, error: String(error) }, 'Telegram · no se pudo actualizar escribiendo')
    );
    try {
      const answer = await chat(db,ctx.from.id,text);
      logger.info({userId:ctx.from.id,actions:answer.acciones.length},'Telegram · enviando respuesta');
      // Detener antes de enviar texto para evitar que se active de nuevo tras la respuesta.
      stopTyping();
      const reply = [...answer.acciones, answer.texto].filter(Boolean).join('\n');
      for (const part of splitMessage(reply)) await ctx.reply(renderAssistantText(part), { parse_mode: 'HTML' });
    } catch (err) {
      logger.error({ err, userId:ctx.from.id }, 'Error en conversación');
      await ctx.reply('No pude procesar tu mensaje. Verifica Ollama y SQLite.');
    } finally { stopTyping(); }
  });
  bot.catch(err => logger.error({ err: err.error }, 'Error de Telegram'));
  return bot;
}
