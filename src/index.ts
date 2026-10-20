import { config, legacyOwnerId } from './config.js';
import { logger } from './logger.js';
import { checkOllama } from './core/llm/ollama.js';
import { openDatabase } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { createBot } from './adapters/telegram/bot.js';

const db = openDatabase(config.SQLITE_PATH);
try {
  migrate(db, legacyOwnerId);
  logger.info('SQLite disponible y migraciones aplicadas');
} catch (err) {
  db.close();
  throw err;
}

const bot = createBot(db);
const available = await checkOllama();
if (!available) logger.warn('Ollama no responde por ahora. Telegram seguirá activo y mostrará un error claro si se intenta conversar.');
else logger.info({ model: config.OLLAMA_MODEL }, 'Ollama está disponible');

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  logger.info('Deteniendo Homie');
  if (bot.isRunning()) bot.stop();
  // Un cierre adicional desde el event loop no necesita dejar WAL abierto.
  db.close();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
logger.info('Iniciando Homie por long polling (sin servidor HTTP)');
try {
  await bot.start({ onStart: info => logger.info({ username: info.username }, 'Bot conectado') });
} finally {
  shutdown();
}
