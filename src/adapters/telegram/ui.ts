import { InlineKeyboard } from 'grammy';
import { DateTime } from 'luxon';
import type { HomieDatabase } from '../../db/connection.js';
import { listActiveProcesses, listReminders, listContext } from '../../db/repos/context.js';
import { getTask, listProgress } from '../../db/repos/tasks.js';
const timezone = process.env.TZ || 'America/Mexico_City';
import { escapeHtml } from './format.js';

export type View = { text: string; keyboard: InlineKeyboard };
export const PAGE_SIZE = 6;
const labels: Record<string,string> = { alta:'🔴 Alta', media:'🟡 Media', baja:'🟢 Baja', pendiente:'Por iniciar', en_progreso:'En proceso', completado:'Terminado', cancelado:'Cancelado' };
const safe = (text:string) => escapeHtml(text);
const trim = (s:string,n=150) => s.length>n ? s.slice(0,n-1)+'…' : s;
export const menu = (): View => ({text:'🏠 <b>Homie</b>\n¿Qué quieres revisar?',keyboard:new InlineKeyboard().text('📌 Pendientes','h:p:0').text('⏰ Recordatorios','h:r:0').row().text('❔ Ayuda','h:help')});
export const help = ():View=>({text:'🏠 <b>Homie</b>\n\n• /menu — Abrir menú interactivo\n• /pendientes — Procesos abiertos\n• /recordatorios — Avisos guardados\n• /cancelar — Cancelar una acción\n\nTambién puedes hablarme normalmente: «Lo de Adrián, agrega que ya me respondió».',keyboard:new InlineKeyboard().text('🏠 Menú','h:menu')});
export function processList(db:HomieDatabase,userId:number,page:number):View {
 const items=listActiveProcesses(db,userId,250);
 const total=Math.max(1,Math.ceil(items.length/PAGE_SIZE));const index=Math.min(Math.max(page,0),total-1);const slice=items.slice(index*PAGE_SIZE,(index+1)*PAGE_SIZE);
 const now=DateTime.now().setZone(timezone);
 const lines=slice.map((p,i)=>{const opened=DateTime.fromISO(p.creado).setZone(timezone);const last=DateTime.fromISO(p.ultimo_avance??p.creado).setZone(timezone);const days=Math.max(0,Math.floor(now.diff(opened,'days').days));const stalled=Math.max(0,Math.floor(now.diff(last,'days').days));return `${index*PAGE_SIZE+i+1}. <b>${safe(trim(p.titulo))}</b>\n    ${labels[p.prioridad]??p.prioridad} · ${labels[p.estado]??p.estado} · ${days}d abierto · ${stalled}d sin avance`;});
 const kb=new InlineKeyboard();for(const p of slice) kb.text(`📌 ${trim(p.titulo,42)}`,`h:pview:${p.id}`).row();
 if(index>0) kb.text('◀️ Anterior',`h:p:${index-1}`);
 if(index<total-1) kb.text('Siguiente ▶️',`h:p:${index+1}`);
 kb.row().text('⏰ Recordatorios','h:r:0').text('🏠 Menú','h:menu');
 return {text:`📌 <b>Pendientes activos</b> (${items.length}) · Página ${index+1}/${total}\nOrdenados por prioridad y antigüedad.\n\n${lines.join('\n\n')||'No tienes pendientes activos. ✅'}`,keyboard:kb};
}
export function processDetail(db:HomieDatabase,userId:number,id:number):View|undefined {
 const p=getTask(db,userId,id);if(!p)return undefined;
 const progress=listProgress(db,userId,id).slice(-5);const context=listContext(db,userId,'pendiente',id,5)??[];
 const lines=[`📌 <b>${safe(p.titulo)}</b>`,`Estado: ${labels[p.estado]??p.estado} · ${labels[p.prioridad]??p.prioridad}`,`Creado: ${DateTime.fromISO(p.creado).setZone(timezone).toFormat('dd/LL/yyyy')}`];
 if(p.notas)lines.push(`\n<b>Descripción:</b> ${safe(trim(p.notas,500))}`);
 if(progress.length)lines.push('\n<b>Últimos avances</b>',...progress.map(a=>`• ${safe(trim(a.texto,250))}`));
 if(context.length)lines.push('\n<b>Contexto</b>',...context.map(c=>`• ${safe(trim(c.texto,250))}`));
 const kb=new InlineKeyboard();
 if(p.estado==='pendiente'||p.estado==='en_progreso')kb.text('📝 Agregar avance',`h:write:progress:${id}`).row().text('💬 Agregar contexto',`h:write:context:${id}`).row().text('⭐ Prioridad',`h:prio:${id}`).text('✅ Terminar',`h:confirm:${id}`).row();
 kb.text('◀️ Pendientes','h:p:0').text('🏠 Menú','h:menu');
 return {text:lines.join('\n').slice(0,3900),keyboard:kb};
}
export function reminderList(db:HomieDatabase,userId:number,page:number):View {
 const items=listReminders(db,userId,250);const total=Math.max(1,Math.ceil(items.length/PAGE_SIZE));const index=Math.min(Math.max(page,0),total-1);const slice=items.slice(index*PAGE_SIZE,(index+1)*PAGE_SIZE);
 const lines=slice.map((r,i)=>`${index*PAGE_SIZE+i+1}. <b>${safe(trim(r.titulo))}</b>\n    ${labels[r.prioridad]??r.prioridad} · ${r.fecha_limite?DateTime.fromISO(r.fecha_limite).setZone(timezone).toFormat('dd/LL/yyyy HH:mm'):'Sin fecha'}`);
 const kb=new InlineKeyboard();for(const r of slice)kb.text(`⏰ ${trim(r.titulo,42)}`,`h:rview:${r.id}`).row();
 if(index>0)kb.text('◀️ Anterior',`h:r:${index-1}`);if(index<total-1)kb.text('Siguiente ▶️',`h:r:${index+1}`);
 kb.row().text('📌 Pendientes','h:p:0').text('🏠 Menú','h:menu');
 return {text:`⏰ <b>Recordatorios</b> (${items.length}) · Página ${index+1}/${total}\n\n${lines.join('\n\n')||'No tienes recordatorios activos.'}`,keyboard:kb};
}
export function reminderDetail(db:HomieDatabase,userId:number,id:number):View|undefined {
 const r=db.prepare('SELECT id,titulo,estado,prioridad,fecha_limite,notas FROM recordatorios WHERE id=? AND usuario_id=?').get(id,userId) as {id:number;titulo:string;estado:string;prioridad:string;fecha_limite:string|null;notas:string|null}|undefined;
 if(!r)return undefined;const context=listContext(db,userId,'recordatorio',id,5)??[];
 const text=[`⏰ <b>${safe(r.titulo)}</b>`,`Estado: ${labels[r.estado]??r.estado} · ${labels[r.prioridad]??r.prioridad}`,`Fecha: ${r.fecha_limite?DateTime.fromISO(r.fecha_limite).setZone(timezone).toFormat('dd/LL/yyyy HH:mm'):'Sin fecha'}`];
 if(r.notas)text.push(`\n<b>Notas:</b> ${safe(trim(r.notas,500))}`);if(context.length)text.push('\n<b>Contexto</b>',...context.map(c=>`• ${safe(trim(c.texto,250))}`));
 const kb=new InlineKeyboard();if(r.estado==='pendiente'||r.estado==='en_progreso')kb.text('💬 Agregar contexto',`h:write:rcontext:${id}`).row().text('⭐ Prioridad',`h:rprio:${id}`).text('✅ Hecho',`h:rconfirm:${id}`).row();
 kb.text('◀️ Recordatorios','h:r:0').text('🏠 Menú','h:menu');return {text:text.join('\n').slice(0,3900),keyboard:kb};
}
export const priorityMenu=(id:number,kind:'pendiente'|'recordatorio'):View=>({text:'⭐ <b>Selecciona la prioridad</b>',keyboard:new InlineKeyboard().text('🔴 Alta',`h:set:${kind}:${id}:alta`).row().text('🟡 Media',`h:set:${kind}:${id}:media`).row().text('🟢 Baja',`h:set:${kind}:${id}:baja`).row().text('◀️ Volver',kind==='pendiente'?`h:pview:${id}`:`h:rview:${id}`)});
export const completionConfirm=(id:number,kind:'pendiente'|'recordatorio'):View=>({text:kind==='pendiente'?'¿Marcar este pendiente como <b>terminado</b>?':'¿Marcar este recordatorio como <b>hecho</b>?',keyboard:new InlineKeyboard().text('✅ Sí, terminar',`h:finish:${kind}:${id}`).row().text('Cancelar',kind==='pendiente'?`h:pview:${id}`:`h:rview:${id}`)});

/** Daily briefing: active processes have no deadline, so they remain visible every day. */
export function dailyView(db:HomieDatabase,userId:number,day:'hoy'|'manana'):View {
 const date=DateTime.now().setZone(timezone).plus({days:day==='manana'?1:0});
 const start=date.startOf('day');
 const end=date.endOf('day');
 const processes=listActiveProcesses(db,userId,250);
 // ISO values in SQLite are UTC: compare in local timezone. Undated reminders are not due today.
 const reminders=listReminders(db,userId,1000).filter(r=>{
   if(!r.fecha_limite)return false;
   const due=DateTime.fromISO(r.fecha_limite,{zone:'utc'}).setZone(timezone);
   return due.isValid && (day==='hoy' ? due.toMillis() <= end.toMillis() : due.toMillis() >= start.toMillis() && due.toMillis() <= end.toMillis());
 });
 const label=day==='hoy'?'hoy':'mañana';
 const kb=new InlineKeyboard();
 const lines=[`🗓️ <b>Tu plan para ${label}</b> · ${date.toFormat('dd/LL/yyyy')}`];
 lines.push(`\n📌 <b>Pendientes activos (${processes.length})</b>`);
 lines.push('Los procesos sin fecha siguen activos hasta terminarlos.');
 for(const p of processes.slice(0,6)) {lines.push(`• ${labels[p.prioridad]??p.prioridad} · ${safe(trim(p.titulo,85))}`);kb.text(`📌 ${trim(p.titulo,40)}`,`h:pview:${p.id}`).row();}
 if(!processes.length)lines.push('Ninguno. ✅');
 if(processes.length>6)lines.push(`Y ${processes.length-6} más. Abre Pendientes para verlos.`);
 lines.push(`\n⏰ <b>Recordatorios ${day==='hoy'?'para hoy o atrasados':'para mañana'} (${reminders.length})</b>`);
 for(const r of reminders.slice(0,6)) {lines.push(`• ${safe(trim(r.titulo,85))}`);kb.text(`⏰ ${trim(r.titulo,40)}`,`h:rview:${r.id}`).row();}
 if(!reminders.length)lines.push('Ninguno.');
 if(reminders.length>6)lines.push(`Y ${reminders.length-6} más.`);
 kb.text('📌 Pendientes','h:p:0').text('⏰ Recordatorios','h:r:0').row().text('🏠 Menú','h:menu');
 return {text:lines.join('\n').slice(0,3900),keyboard:kb};
}
