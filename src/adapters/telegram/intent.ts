/** Conservative routing: only read-only, broad requests bypass Ollama. */
export type QuickIntent = 'pendientes' | 'recordatorios' | 'hoy' | 'manana';
export function quickIntent(text: string): QuickIntent | undefined {
  const s = text.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 145) return undefined;
  if (/\b(agrega|anota|crea|guarda|actualiza|cambia|termina|completa|borra|elimina|modifica|sobre|del video|lo de|avanza|avance|contexto|prioridad|programa|pospon|reagenda|reprograma|recuerdame|recordarme|apunta|debo recordar)\b/.test(s)) return undefined;
  if (/\b(ayer|pasado manana|proxima semana|siguiente semana|este mes|la semana pasada)\b/.test(s)) return undefined;
  // Short, colloquial day queries: route only when the entire phrase is a request.
  // This prevents a sentence such as "manana reviso lo del video" from bypassing Ollama.
  const dayPhrase = s.replace(/^(?:(?:oye|homie|hola|hey|buenas)\s+)*/g, '').trim();
  const shortDay = /^(?:(?:pa|para|de|el)\s+)?(hoy|manana)$/.exec(dayPhrase);
  if (shortDay) return shortDay[1] === 'hoy' ? 'hoy' : 'manana';
  const colloquialDay = /^(?:(?:que\s+(?:hay|tengo|tenemos|toca|se\s+arma|sigue)(?:\s+(?:que\s+hacer|por\s+hacer|para\s+hacer))?|(?:dime|muestra|ensena|lista|revisa)\s+(?:lo\s+de|lo\s+que\s+hay|el\s+plan|la\s+agenda|mis\s+pendientes|los\s+pendientes)?|(?:plan|agenda|pendientes|tareas|cosas)\s+(?:de|para|pa)?)\s+(?:(?:pa|para|de|el)\s+)?(hoy|manana)|(?:hoy|manana)\s+(?:que\s+(?:hay|tengo|tenemos|toca)|(?:que\s+)?(?:toca|hay|tenemos|tengo)\s+(?:que\s+hacer)?|(?:que\s+)?(?:pendientes|tareas|plan|agenda)(?:\s+hay)?|como\s+(?:vamos|pinta)?)|que\s+hay\s+(?:pa|para)\s+(hoy|manana))$/.exec(dayPhrase);
  if (colloquialDay) {
    const day = colloquialDay[1] ?? (dayPhrase.includes('manana') ? 'manana' : 'hoy');
    return day === 'manana' ? 'manana' : 'hoy';
  }
  const asks = /^(?:(?:oye|homie|hola|hey|buenas)\s+)*(?:(?:me|nos)\s+)?(?:(?:puedes|podrias|quiero|necesito)\s+)?(?:dime|muestra|ensena|lista|consulta|revisa|recuerda|que|cuales|cuantos|tengo|mis|hay|ver|mostrar|listar|pendientes|recordatorios|avisos|plan|agenda|para|y)/.test(s);
  if (!asks) return undefined;
  // A named/specific item should be resolved by the agent, not treated as a broad list.
  if (/\b(?:pendiente|recordatorio|tarea) (?:de|del|sobre) (?!hoy\b|manana\b|esta semana\b)/.test(s)) return undefined;
  const tomorrow = /\bmanana\b/.test(s);
  const today = /\bhoy\b/.test(s);
  const tasks = /\b(pendientes?|cosas por hacer|tareas|que tengo (?:que|por|para) hacer|que (?:debo|tengo que|hay que) hacer|que hay para hacer)\b/.test(s);
  const reminders = /\b(recordatorios?|avisos?)\b/.test(s);
  const daily = /\b(que (?:debo|tengo que|hay que) hacer|que tengo (?:que|por|para) hacer|que hay (?:para hacer|pendiente)|que (?:me )?toca hacer|plan (?:de|para)|agenda (?:de|para))\b/.test(s);
  if ((tomorrow || today) && (daily || (tasks && reminders))) return tomorrow ? 'manana' : 'hoy';
  if (reminders && !tasks) return 'recordatorios';
  if (tasks) return 'pendientes';
  return undefined;
}
/** Backwards-compatible interface for callers that only support list views. */
export function listIntent(text: string): 'pendientes' | 'recordatorios' | undefined {
  const intent = quickIntent(text);
  // Legacy list callers display pending tasks for broad daily requests.
  // The new router uses quickIntent() and keeps its richer day-plan view.
  return intent === 'hoy' || intent === 'manana' ? 'pendientes'
    : intent === 'pendientes' || intent === 'recordatorios' ? intent : undefined;
}
