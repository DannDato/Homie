import type { HomieDatabase } from '../../db/connection.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { cosine, contentHash, getCandidates, lexicalRank, rankDecision, type Candidate } from './index.js';

async function embed(texts:string[]):Promise<number[][]> {
  const response=await fetch(`${config.OLLAMA_HOST.replace(/\/$/,'')}/api/embed`,{
    method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(45000),
    body:JSON.stringify({model:config.OLLAMA_EMBED_MODEL,input:texts,truncate:true,keep_alive:'2m'})
  });
  if(!response.ok)throw Error(`Embedding HTTP ${response.status}`);
  const data=await response.json() as {embeddings?:number[][]};
  if(!Array.isArray(data.embeddings)||data.embeddings.length!==texts.length)throw Error('Embeddings inválidos');
  return data.embeddings;
}
export async function findReference(db:HomieDatabase,userId:number,consulta:string,tipo:'pendiente'|'recordatorio'|'todos'='todos') {
  const started=Date.now();
  const candidates=getCandidates(db,userId,tipo);
  logger.debug({userId,tipo,candidates:candidates.length,semantic:config.SEMANTIC_MATCHING},'Referencias · buscando coincidencias');
  const lexical=lexicalRank(consulta,candidates);
  if(!config.SEMANTIC_MATCHING) { logger.debug({userId,matches:lexical.length,elapsedMs:Date.now()-started},'Referencias · búsqueda ponderada lista');return {ok:true,metodo:'ponderado',...rankDecision(lexical)}; }
  try {
    // Reutiliza vectores mientras su contenido siga siendo idéntico.
    const shortlist=[...lexical.slice(0,20),...candidates.filter(c=>!lexical.some(l=>l.tipo===c.tipo&&l.id===c.id)).slice(0,30)].slice(0,50);
    const uncached:Candidate[]=[];const embeddings=new Map<string,number[]>();
    for(const c of shortlist){
      const row=db.prepare('SELECT hash,vector FROM referencias_embeddings WHERE usuario_id=? AND tipo=? AND elemento_id=? AND modelo=?').get(userId,c.tipo,c.id,config.OLLAMA_EMBED_MODEL) as {hash:string;vector:string}|undefined;
      if(row?.hash===contentHash(c.documento)){
        try{embeddings.set(`${c.tipo}:${c.id}`,JSON.parse(row.vector) as number[]);continue;}catch{}
      }
      uncached.push(c);
    }
    logger.info({userId,cached:shortlist.length-uncached.length,missing:uncached.length},'Embeddings · preparando consulta');
    const all=await embed([consulta,...uncached.map(c=>c.documento)]);
    const queryVector=all[0];
    if (!queryVector) throw Error('Embedding de consulta ausente');
    uncached.forEach((c,i)=>{
      const v=all[i+1];
      if (!v) throw Error('Embedding de candidato ausente');
      embeddings.set(`${c.tipo}:${c.id}`,v);
      db.prepare(`INSERT INTO referencias_embeddings(usuario_id,tipo,elemento_id,modelo,hash,vector) VALUES(?,?,?,?,?,?)
        ON CONFLICT(usuario_id,tipo,elemento_id,modelo) DO UPDATE SET hash=excluded.hash,vector=excluded.vector`)
        .run(userId,c.tipo,c.id,config.OLLAMA_EMBED_MODEL,contentHash(c.documento),JSON.stringify(v));
    });
    const lexScores=new Map(lexical.map(c=>[`${c.tipo}:${c.id}`,c.lexical]));
    const ranked=shortlist.map(c=>{
      const key=`${c.tipo}:${c.id}`;
      const sim=Math.max(0,cosine(queryVector,embeddings.get(key)??[]));
      const lex=lexScores.get(key)??0;
      return {...c,lexical:lex,score:0.54*lex+0.46*sim};
    }).sort((a,b)=>b.score-a.score);
    logger.info({userId,elapsedMs:Date.now()-started,matches:ranked.length},'Referencias · búsqueda semántica lista');
    return {ok:true,metodo:'hibrido',...rankDecision(ranked)};
  } catch (err) {
    logger.warn({err,userId,elapsedMs:Date.now()-started},'Embeddings · fallback a búsqueda ponderada');
    // Ollama puede estar sin modelo de embeddings: no bloquear el agente.
    return {ok:true,metodo:'ponderado (embeddings no disponibles)',...rankDecision(lexical)};
  }
}
