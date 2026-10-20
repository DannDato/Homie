import type { HomieDatabase } from '../connection.js';

export type TargetType = 'pendiente' | 'recordatorio';
export type Importance = 'baja' | 'media' | 'alta';
const tables: Record<TargetType,string> = {pendiente:'pendientes',recordatorio:'recordatorios'};

function exists(db:HomieDatabase,userId:number,tipo:TargetType,id:number):boolean {
  return Boolean(db.prepare(`SELECT 1 FROM ${tables[tipo]} WHERE usuario_id=? AND id=?`).get(userId,id));
}
export function addContext(db:HomieDatabase,userId:number,tipo:TargetType,id:number,texto:string) {
  if (!exists(db,userId,tipo,id)) return undefined;
  const column=tipo==='pendiente'?'pendiente_id':'recordatorio_id';
  const result=db.prepare(`INSERT INTO contextos(usuario_id,${column},texto) VALUES(?,?,?)`).run(userId,id,texto);
  return Number(result.lastInsertRowid);
}
export function listContext(db:HomieDatabase,userId:number,tipo:TargetType,id:number,limit=20) {
  if (!exists(db,userId,tipo,id)) return undefined;
  const column=tipo==='pendiente'?'pendiente_id':'recordatorio_id';
  return (db.prepare(`SELECT id,texto,creado FROM contextos WHERE usuario_id=? AND ${column}=? ORDER BY id DESC LIMIT ?`)
    .all(userId,id,limit) as {id:number;texto:string;creado:string}[]).reverse();
}
export function setImportance(db:HomieDatabase,userId:number,tipo:TargetType,id:number,prioridad:Importance) {
  const result=db.prepare(`UPDATE ${tables[tipo]} SET prioridad=?,actualizado=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE usuario_id=? AND id=?`).run(prioridad,userId,id);
  return result.changes>0;
}
export function listActiveProcesses(db:HomieDatabase,userId:number,limit=30) {
  return db.prepare(`SELECT p.id,p.titulo,p.estado,p.prioridad,p.creado,p.actualizado,
      (SELECT MAX(a.creado) FROM pendientes_avances a WHERE a.usuario_id=p.usuario_id AND a.pendiente_id=p.id) AS ultimo_avance,
      (SELECT COUNT(*) FROM pendientes_avances a WHERE a.usuario_id=p.usuario_id AND a.pendiente_id=p.id) AS avances,
      (SELECT COUNT(*) FROM contextos c WHERE c.usuario_id=p.usuario_id AND c.pendiente_id=p.id) AS notas_contexto
    FROM pendientes p WHERE p.usuario_id=? AND p.estado IN ('pendiente','en_progreso')
    ORDER BY CASE p.prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
      COALESCE((SELECT MAX(a.creado) FROM pendientes_avances a WHERE a.usuario_id=p.usuario_id AND a.pendiente_id=p.id),p.creado) ASC,
      p.creado ASC,p.id ASC LIMIT ?`).all(userId,limit) as Array<{id:number;titulo:string;estado:string;prioridad:string;creado:string;actualizado:string;ultimo_avance:string|null;avances:number;notas_contexto:number}>;
}
export function listReminders(db:HomieDatabase,userId:number,limit=40) {
  return db.prepare(`SELECT id,titulo,estado,prioridad,fecha_limite,recordar_en,notas,creado,actualizado
    FROM recordatorios WHERE usuario_id=? AND estado IN ('pendiente','en_progreso')
    ORDER BY CASE WHEN fecha_limite IS NULL THEN 1 ELSE 0 END,fecha_limite ASC,
    CASE prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,creado ASC LIMIT ?`).all(userId,limit) as Array<{id:number;titulo:string;estado:string;prioridad:string;fecha_limite:string|null;recordar_en:string|null;notas:string|null;creado:string;actualizado:string}>;
}
