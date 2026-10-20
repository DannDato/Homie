import pino from 'pino';
import { Writable } from 'node:stream';

// El transporte coloreado es solo para terminales; no requiere otro paquete.
const colors = { trace: '\x1b[90m', debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m', fatal: '\x1b[35m' };
const reset = '\x1b[0m';
const labels: Record<number, keyof typeof colors> = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };
const pretty = process.env.LOG_PRETTY !== 'false';
const terminal = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const sink = new Writable({
  write(chunk: Buffer | string, _encoding, next) {
    const line = chunk.toString();
    if (!pretty) { process.stdout.write(line); next(); return; }
    try {
      const { level, time, msg, ...fields } = JSON.parse(line) as Record<string, unknown>;
      const label = labels[Number(level)] ?? 'info';
      const timestamp = new Date(Number(time)).toLocaleTimeString('es-MX', { hour12: false });
      delete fields.pid; delete fields.hostname;
      const details = Object.keys(fields).length ? ' ' + JSON.stringify(fields) : '';
      const color = terminal ? colors[label] : '';
      process.stdout.write(`${color}${timestamp} ${label.toUpperCase().padEnd(5)}${terminal ? reset : ''} ${String(msg ?? '')}${details}\n`);
    } catch { process.stdout.write(line); }
    next();
  }
});
export const logger = pino({ level: process.env.LOG_LEVEL || 'debug',
  redact: { paths: ['token', 'TELEGRAM_BOT_TOKEN', '*.token', '*.TELEGRAM_BOT_TOKEN', 'password', '*.password', 'authorization', '*.authorization'], censor: '[REDACTED]' }
}, sink);
