import type { HomieDatabase } from '../../db/connection.js';
import { createHash } from 'node:crypto';

export type Candidate = { tipo:'pendiente'|'recordatorio'; id:number; titulo:string; estado:string; documento:string; lexical:number; score:number };
const ignored = new Set('el la los las un una unos unas de del en con por para sobre que lo le me mi mis tu tus al y o a esto eso ese esa aquello cosa tema pendiente recordatorio actualizar agregar nota contexto avance hoy'.split(' '));
function normalize(s:string) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function words(s:string) { return [...new Set(normalize(s).split(' ').filter(w=>w.length>=3&&!ignored.has(w)))]; }
function match(term:string, text:string) { return text.split(' ').some(w=>w===term || (term.length>=4 && w.startsWith(term)) || (term.length>=5&&w.includes(term))); }
export function getCandidates(db:HomieDatabase,userId:number,tipo:'pendiente'|'recordatorio'|'todos'='todos', limit=150):Candidate[] {
  const types=tipo==='todos'?(['pendiente','recordatorio'] as const):[tipo];
  return types.flatMap(t=>{
    const table=t==='pendiente'?'pendientes':'recordatorios';
    const rows=db.prepare(`SELECT id,titulo,estado,COALESCE(notas,'') notas FROM ${table} WHERE usuario_id=? AND estado IN ('pendiente','en_progreso') ORDER BY actualizado DESC LIMIT ?`)
      .all(userId,limit) as {id:number;titulo:string;estado:string;notas:string}[];
    return rows.map(row=>{
      const col=t==='pendiente'?'pendiente_id':'recordatorio_id';
      const notes=(db.prepare(`SELECT texto FROM contextos WHERE usuario_id=? AND ${col}=? ORDER BY id DESC LIMIT 8`).all(userId,row.id) as {texto:string}[]).map(r=>r.texto);
      const progress=t==='pendiente'?(db.prepare('SELECT texto FROM pendientes_avances WHERE usuario_id=? AND pendiente_id=? ORDER BY id DESC LIMIT 8').all(userId,row.id) as {texto:string}[]).map(r=>r.texto):[];
      return {tipo:t,id:row.id,titulo:row.titulo,estado:row.estado,documento:[row.titulo,row.notas,...notes,...progress].filter(Boolean).join(' | '),lexical:0,score:0};
    });
  });
}
export function lexicalRank(query:string,candidates:Candidate[]):Candidate[] {
  const terms=words(query); if(!terms.length) return [];
  return candidates.map(c=>{
    const title=normalize(c.titulo);const all=normalize(c.documento);
    const matched=terms.filter(w=>match(w,all));
    const titleHits=terms.filter(w=>match(w,title)).length;
    const coverage=matched.length/terms.length;
    const lexical=coverage*0.55 + titleHits/terms.length*0.4 +(title.includes(normalize(query))?0.05:0);
    return {...c,lexical,score:lexical};
  }).filter(c=>c.lexical>0).sort((a,b)=>b.score-a.score);
}
export function rankDecision(ranked:Candidate[]) {
  const [first,second]=ranked;
  // If two candidates are similar, do NOT auto-resolve; ask the user.
  const seguro=!!first && first.score>=0.73 && (!second || first.score-second.score>=0.18);
  return {seguro,coincidencias:ranked.slice(0,5).map(c=>({tipo:c.tipo,id:c.id,titulo:c.titulo,estado:c.estado,puntuacion:Number(c.score.toFixed(3))})),
    indicacion:seguro?'Coincidencia fuerte. Puedes utilizar el ID indicado si el contexto de la conversación concuerda.':'No hay coincidencia única suficientemente clara: pregunta al usuario cuál quiso decir antes de modificar cualquier elemento.'};
}
export function contentHash(s:string) {return createHash('sha256').update(s).digest('hex');}
export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
