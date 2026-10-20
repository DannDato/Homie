import { DateTime } from 'luxon';

export function parseLocalDate(value: string, zone: string): { iso: string; hasTime: boolean } {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value);
  if (!dateOnly && !dateTime) throw new Error('Fecha inválida. Usa YYYY-MM-DD o YYYY-MM-DDTHH:mm, hora local.');
  const dt = DateTime.fromISO(value, { zone, setZone: false });
  if (!dt.isValid || dt.toFormat(dateOnly ? 'yyyy-MM-dd' : value.length === 16 ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd'T'HH:mm:ss") !== value) {
    throw new Error('Fecha u hora local inválida.');
  }
  return { iso: dt.toUTC().toISO()!, hasTime: !dateOnly };
}

export function calculateReminder(dueDate: string | undefined, explicit: string | undefined, timezone: string, defaultTime: string, leadMinutes: number) {
  const due = dueDate ? parseLocalDate(dueDate, timezone) : null;
  if (explicit !== undefined) {
    const reminder = parseLocalDate(explicit, timezone);
    if (!reminder.hasTime) throw new Error('recordar_en debe incluir una hora local.');
    return { due, remindAt: reminder.iso };
  }
  if (!due) return { due: null, remindAt: null };
  const dt = DateTime.fromISO(due.iso, { zone: 'utc' }).setZone(timezone);
  const reminder = due.hasTime ? dt.minus({ minutes: leadMinutes }) : dt.startOf('day').plus({ hours: Number(defaultTime.slice(0, 2)), minutes: Number(defaultTime.slice(3, 5)) });
  return { due, remindAt: reminder.toUTC().toISO()! };
}
