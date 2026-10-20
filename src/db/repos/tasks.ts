import type { HomieDatabase } from '../connection.js';

export type TaskStatus = 'pendiente' | 'en_progreso' | 'completado' | 'cancelado';
export type TaskRow = {
  id: number; titulo: string; estado: TaskStatus; prioridad: string;
  fecha_limite: string | null; tiene_hora: number; recordar_en: string | null;
  avisado_en: string | null; notas: string | null;
  creado: string; actualizado: string; completado_en: string | null;
};
export type NewTask = { titulo: string; prioridad: 'baja' | 'media' | 'alta'; fecha_limite: string | null; tiene_hora: boolean; recordar_en: string | null; notas?: string | null };
const cols = 'id,titulo,estado,prioridad,fecha_limite,tiene_hora,recordar_en,avisado_en,notas,creado,actualizado,completado_en';

export function getTask(db: HomieDatabase, userId: number, id: number): TaskRow | undefined {
  return db.prepare(`SELECT ${cols} FROM pendientes WHERE usuario_id=? AND id=?`).get(userId,id) as TaskRow | undefined;
}
export function listTasks(db: HomieDatabase, userId: number, limit = 30): TaskRow[] {
  return db.prepare(`SELECT ${cols} FROM pendientes WHERE usuario_id=? ORDER BY CASE estado WHEN 'en_progreso' THEN 0 WHEN 'pendiente' THEN 1 ELSE 2 END, actualizado DESC, id DESC LIMIT ?`).all(userId,limit) as TaskRow[];
}
export function createTask(db: HomieDatabase, userId: number, task: NewTask): TaskRow {
  const result = db.prepare(`INSERT INTO pendientes(usuario_id,titulo,prioridad,fecha_limite,tiene_hora,recordar_en,notas) VALUES(?,?,?,?,?,?,?)`)
    .run(userId,task.titulo,task.prioridad,task.fecha_limite,Number(task.tiene_hora),task.recordar_en,task.notas ?? null);
  return getTask(db,userId,Number(result.lastInsertRowid))!;
}
export function createProcess(db: HomieDatabase, userId: number, title: string, detail?: string): TaskRow {
  const result = db.prepare(`INSERT INTO pendientes(usuario_id,titulo,estado,notas,fecha_limite,recordar_en) VALUES(?,?,'pendiente',?,NULL,NULL)`)
    .run(userId,title,detail ?? null);
  return getTask(db,userId,Number(result.lastInsertRowid))!;
}
export function addProgress(db: HomieDatabase, userId: number, id: number, text: string): TaskRow | undefined {
  return db.transaction(() => {
    const task = getTask(db,userId,id);
    if (!task || task.estado === 'completado' || task.estado === 'cancelado') return undefined;
    db.prepare(`INSERT INTO pendientes_avances(usuario_id,pendiente_id,texto) VALUES(?,?,?)`).run(userId,id,text);
    db.prepare(`UPDATE pendientes SET estado='en_progreso',actualizado=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE usuario_id=? AND id=?`).run(userId,id);
    return getTask(db,userId,id);
  })();
}
export function completeProcess(db: HomieDatabase,userId:number,id:number): TaskRow | undefined {
  return db.transaction(() => {
    const task=getTask(db,userId,id);
    if (!task || task.estado === 'cancelado') return undefined;
    if (task.estado !== 'completado') db.prepare(`UPDATE pendientes SET estado='completado', completado_en=strftime('%Y-%m-%dT%H:%M:%fZ','now'),actualizado=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE usuario_id=? AND id=?`).run(userId,id);
    return getTask(db,userId,id);
  })();
}
export function listProgress(db:HomieDatabase,userId:number,id:number) {
  return db.prepare(`SELECT id,texto,creado FROM pendientes_avances WHERE usuario_id=? AND pendiente_id=? ORDER BY id ASC`)
    .all(userId,id) as {id:number;texto:string;creado:string}[];
}
export function createReminder(db:HomieDatabase,userId:number,task:NewTask) {
  const result=db.prepare(`INSERT INTO recordatorios(usuario_id,titulo,estado,prioridad,fecha_limite,tiene_hora,recordar_en,avisado_en,notas,creado,actualizado)
    VALUES(?,?,'pendiente',?,?,?,?,NULL,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
    .run(userId,task.titulo,task.prioridad,task.fecha_limite,Number(task.tiene_hora),task.recordar_en,task.notas ?? null);
  return Number(result.lastInsertRowid);
}
