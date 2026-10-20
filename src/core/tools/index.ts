import { DateTime } from 'luxon';
import { addContext, listContext, setImportance, listReminders, listActiveProcesses } from '../../db/repos/context.js';
import { lexicalRank, getCandidates, rankDecision } from '../references/index.js';
import { z } from 'zod';
import type { HomieDatabase } from '../../db/connection.js';
import { createProcess, createReminder, addProgress, completeProcess, listTasks, listProgress, getTask } from '../../db/repos/tasks.js';
import { calculateReminder } from '../time.js';
import { config } from '../../config.js';

const title = z.string().trim().min(1).max(250);
const body = z.string().trim().min(1).max(4000);
const id = z.number().int().positive();
const schemas = {
  crear_recordatorio: z.object({ titulo:title,fecha_limite:z.string().optional(),recordar_en:z.string().optional(),prioridad:z.enum(['baja','media','alta']).default('media'),notas:z.string().max(4000).optional() }).strict(),
  crear_pendiente: z.object({ titulo:title,descripcion:z.string().max(4000).optional() }).strict(),
  listar_pendientes: z.object({}).strict(),
  actualizar_pendiente: z.object({ id, avance:body }).strict(),
  completar_pendiente: z.object({ id }).strict(),
  consultar_pendiente: z.object({ id }).strict(),
  agregar_contexto: z.object({tipo:z.enum(['pendiente','recordatorio']),id,texto:body}).strict(),
  consultar_contexto: z.object({tipo:z.enum(['pendiente','recordatorio']),id}).strict(),
  cambiar_prioridad: z.object({tipo:z.enum(['pendiente','recordatorio']),id,prioridad:z.enum(['baja','media','alta'])}).strict(),
  revisar_prioridades: z.object({}).strict(),
  listar_recordatorios: z.object({}).strict(),
  buscar_referencia: z.object({consulta:body,tipo:z.enum(['pendiente','recordatorio','todos']).default('todos')}).strict()
};
const params=(properties:Record<string,unknown>,required:string[]=[])=>( { type:'object',properties,required } );
const idParam={type:'integer',description:'ID obtenido de listar_pendientes; nunca adivinar'};
export const toolDefinitions = [
  {type:'function',function:{name:'buscar_referencia',description:'IDENTIFICA un pendiente o recordatorio por nombre, alias, persona, contexto o avances. Llama ANTES de modificar si el usuario no dice un ID. Si seguro=false, pregunta cuál es: no adivines.',parameters:params({consulta:{type:'string',description:'Frase del usuario, p.ej. lo de Adrian o lo del video'},tipo:{type:'string',enum:['pendiente','recordatorio','todos']}},['consulta'])}},
  {type:'function',function:{name:'crear_recordatorio',description:'Anota algo puntual que necesita aviso, con o sin fecha. No sirve para proyectos largos.',parameters:params({titulo:{type:'string'},fecha_limite:{type:'string',description:'YYYY-MM-DD o YYYY-MM-DDTHH:mm (hora local)'},recordar_en:{type:'string',description:'YYYY-MM-DDTHH:mm (hora local)'},prioridad:{type:'string',enum:['baja','media','alta']},notas:{type:'string'}},['titulo'])}},
  {type:'function',function:{name:'crear_pendiente',description:'Abre un proyecto/proceso que puede tardar días o meses, SIN fecha límite ni avisos.',parameters:params({titulo:{type:'string'},descripcion:{type:'string'}},['titulo'])}},
  {type:'function',function:{name:'listar_pendientes',description:'Consulta los procesos del usuario y sus IDs antes de actualizarlos o completarlos.',parameters:params({})}},
  {type:'function',function:{name:'actualizar_pendiente',description:'Agrega un avance histórico al proceso y pasa a estado en_progreso. Requiere ID confirmado.',parameters:params({id:idParam,avance:{type:'string',description:'Qué cambió o qué se hizo'}},['id','avance'])}},
  {type:'function',function:{name:'completar_pendiente',description:'Marca un proceso terminado. Requiere ID confirmado.',parameters:params({id:idParam},['id'])}},
  {type:'function',function:{name:'consultar_pendiente',description:'Consulta el estado y todos los avances de un proceso por su ID.',parameters:params({id:idParam},['id'])}},
  {type:'function',function:{name:'agregar_contexto',description:'Guarda una nota o contexto relacionado con un pendiente o recordatorio, sin alterar su estado. Debes confirmar el ID con una consulta previa.',parameters:params({tipo:{type:'string',enum:['pendiente','recordatorio']},id:idParam,texto:{type:'string'}},['tipo','id','texto'])}},
  {type:'function',function:{name:'consultar_contexto',description:'Recupera notas de contexto de un pendiente o recordatorio.',parameters:params({tipo:{type:'string',enum:['pendiente','recordatorio']},id:idParam},['tipo','id'])}},
  {type:'function',function:{name:'cambiar_prioridad',description:'Cambia la importancia de un pendiente o recordatorio confirmado.',parameters:params({tipo:{type:'string',enum:['pendiente','recordatorio']},id:idParam,prioridad:{type:'string',enum:['baja','media','alta']}},['tipo','id','prioridad'])}},
  {type:'function',function:{name:'revisar_prioridades',description:'Lista pendientes activos ordenados por importancia y antigüedad de inactividad, más recordatorios de hoy y vencidos. Utilízalo para preguntar qué atender hoy.',parameters:params({})}},
  {type:'function',function:{name:'listar_recordatorios',description:'Lista recordatorios activos y sus IDs (también los que no tienen fecha) antes de guardar contexto o cambiar prioridad.',parameters:params({})}}
] as const;
export type ToolResult = { result: Record<string,unknown>; action?: string };
function errorText(err:unknown) {return err instanceof Error ? err.message : 'Error al ejecutar la operación';}
export function runTool(db:HomieDatabase,userId:number,name:string,args:unknown):ToolResult {
  try {
    if (!(name in schemas)) return {result:{ok:false,error:'Herramienta desconocida'}};
    const schema=schemas[name as keyof typeof schemas];
    const parsed=schema.safeParse(args);
    if (!parsed.success) return {result:{ok:false,error:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')}};
    switch(name) {
      case 'buscar_referencia': {
        const v=schemas.buscar_referencia.parse(args);
        return {result:{ok:true,metodo:'ponderado',...rankDecision(lexicalRank(v.consulta,getCandidates(db,userId,v.tipo)))}};
      }
      case 'crear_recordatorio': {
        const v=schemas.crear_recordatorio.parse(args);
        const {due,remindAt}=calculateReminder(v.fecha_limite,v.recordar_en,config.TZ,config.DEFAULT_REMINDER_TIME,config.REMINDER_LEAD_MINUTES);
        const newId=createReminder(db,userId,{titulo:v.titulo,prioridad:v.prioridad,fecha_limite:due?.iso??null,tiene_hora:due?.hasTime??false,recordar_en:remindAt,notas:v.notas});
        return {result:{ok:true,id:newId,titulo:v.titulo,recordar_en:remindAt},action:`⏰ Recordatorio guardado: ${v.titulo}`};
      }
      case 'crear_pendiente': {
        const v=schemas.crear_pendiente.parse(args);const task=createProcess(db,userId,v.titulo,v.descripcion);
        return {result:{ok:true,id:task.id,titulo:task.titulo,estado:task.estado},action:`📌 Pendiente creado: ${task.titulo}`};
      }
      case 'listar_pendientes': {
        const rows=listTasks(db,userId,40).map(({id,titulo,estado,prioridad,creado,actualizado})=>({id,titulo,estado,prioridad,creado,actualizado}));
        return {result:{ok:true,pendientes:rows}};
      }
      case 'actualizar_pendiente': {
        const v=schemas.actualizar_pendiente.parse(args);const task=addProgress(db,userId,v.id,v.avance);
        if (!task) return {result:{ok:false,error:'Pendiente inexistente, de otro usuario o cerrado'}};
        return {result:{ok:true,id:task.id,estado:task.estado,avance:v.avance},action:`📝 Avance registrado en pendiente: ${task.titulo}`};
      }
      case 'completar_pendiente': {
        const v=schemas.completar_pendiente.parse(args);const old=getTask(db,userId,v.id);const task=completeProcess(db,userId,v.id);
        if (!task) return {result:{ok:false,error:'Pendiente inexistente, de otro usuario o cancelado'}};
        return {result:{ok:true,id:task.id,estado:task.estado},action:old?.estado==='completado'?undefined:`✅ Pendiente terminado: ${task.titulo}`};
      }
      case 'consultar_pendiente': {
        const v=schemas.consultar_pendiente.parse(args);const task=getTask(db,userId,v.id);
        if (!task) return {result:{ok:false,error:'Pendiente no encontrado'}};
        return {result:{ok:true,pendiente:{id:task.id,titulo:task.titulo,descripcion:task.notas,estado:task.estado,creado:task.creado,completado_en:task.completado_en},avances:listProgress(db,userId,v.id)}};
      }
      case 'agregar_contexto': {
        const v=schemas.agregar_contexto.parse(args);const contextId=addContext(db,userId,v.tipo,v.id,v.texto);
        if (!contextId) return {result:{ok:false,error:'Elemento no encontrado o sin acceso'}};
        return {result:{ok:true,id:contextId,tipo:v.tipo,elemento_id:v.id},action:`📝 Contexto agregado a ${v.tipo}`};
      }
      case 'consultar_contexto': {
        const v=schemas.consultar_contexto.parse(args);const notas=listContext(db,userId,v.tipo,v.id);
        return notas===undefined?{result:{ok:false,error:'Elemento no encontrado'}}:{result:{ok:true,notas}};
      }
      case 'cambiar_prioridad': {
        const v=schemas.cambiar_prioridad.parse(args);
        if (!setImportance(db,userId,v.tipo,v.id,v.prioridad)) return {result:{ok:false,error:'Elemento no encontrado o sin acceso'}};
        return {result:{ok:true,prioridad:v.prioridad},action:`🎯 Prioridad ${v.prioridad} en ${v.tipo}`};
      }
      case 'listar_recordatorios': {
        return {result:{ok:true,recordatorios:listReminders(db,userId,40)}};
      }
      case 'revisar_prioridades': {
        const now=DateTime.now().setZone(config.TZ);const start=now.startOf('day');const end=now.endOf('day');
        const procesos=listActiveProcesses(db,userId,30).map(p=>({ ...p,
          dias_abierto:Math.floor(now.diff(DateTime.fromISO(p.creado).setZone(config.TZ),'days').days),
          dias_sin_avance:Math.floor(now.diff(DateTime.fromISO(p.ultimo_avance??p.creado).setZone(config.TZ),'days').days)
        }));
        const recordatorios=listReminders(db,userId).filter(r=>r.fecha_limite &&
          DateTime.fromISO(r.fecha_limite,{zone:'utc'}).setZone(config.TZ).toMillis()<=end.toMillis()).map(r=>({id:r.id,titulo:r.titulo,prioridad:r.prioridad,fecha_limite:r.fecha_limite,
          atrasado:DateTime.fromISO(r.fecha_limite!,{zone:'utc'}).setZone(config.TZ).toMillis()<start.toMillis()}));
        return {result:{ok:true,fecha_local:now.toISODate(),procesos,recordatorios_hoy_y_atrasados:recordatorios,
          criterio:'Procesos: prioridad alta a baja; dentro de cada prioridad, primero los que llevan más tiempo sin avances. Recordatorios: fechas más próximas primero.'}};
      }
      default:return {result:{ok:false,error:'Herramienta desconocida'}};
    }
  } catch (err) { return {result:{ok:false,error:errorText(err)}}; }
}
