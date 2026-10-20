import 'dotenv/config';
import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato esperado HH:mm');
const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(15).refine(v => v !== 'REEMPLAZAR_CON_TOKEN_REAL', 'Configura el token real'),
  ADMIN_TELEGRAM_USER_ID: z.coerce.number().int().positive().safe(),
  TZ: z.string().default('America/Mexico_City').refine(v => { try { Intl.DateTimeFormat('es', { timeZone: v }); return true; } catch { return false; } }, 'Zona horaria inválida'),
  SQLITE_PATH: z.string().min(1).default('./data/asistente.db'),
  OLLAMA_HOST: z.string().url().default('http://127.0.0.1:11434').refine(v => { const u = new URL(v); return ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) && u.protocol === 'http:'; }, 'Ollama debe apuntar a localhost por seguridad'),
  OLLAMA_MODEL: z.string().min(1).default('qwen3:8b'),
  OLLAMA_EMBED_MODEL: z.string().min(1).default('nomic-embed-text'),
  SEMANTIC_MATCHING: z.enum(['true','false']).default('false').transform(v=>v==='true'),
  OLLAMA_NUM_CTX: z.coerce.number().int().min(1024).max(32768).default(4096),
  OLLAMA_KEEP_ALIVE: z.string().default('30m'),
  OLLAMA_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.3),
  HISTORY_MESSAGES: z.coerce.number().int().min(0).max(50).default(10),
  SUMMARY_EVERY_N_MESSAGES: z.coerce.number().int().positive().default(12),
  MAX_TOOL_ITERATIONS: z.coerce.number().int().positive().default(5),
  DAILY_SUMMARY_TIME: time.default('08:00'), DEFAULT_REMINDER_TIME: time.default('09:00'),
  REMINDER_LEAD_MINUTES: z.coerce.number().int().min(0).default(30),
  QUIET_HOURS: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/).default('22:00-07:00'),
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60)
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map(i => `• ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Configuración inválida en .env:\n${details}`);
}
export const config = parsed.data;
export const legacyOwnerId = config.ADMIN_TELEGRAM_USER_ID;
