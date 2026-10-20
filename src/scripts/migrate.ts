import { config, legacyOwnerId } from '../config.js';
import { openDatabase } from '../db/connection.js';
import { migrate } from '../db/migrate.js';

const db = openDatabase(config.SQLITE_PATH);
try {
  migrate(db, legacyOwnerId);
  console.log('Migraciones de Homie aplicadas correctamente.');
} finally {
  db.close();
}
