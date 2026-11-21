export const SNOOZE_OPTIONS = [
  { label: '1 week', days: 7 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
] as const;

export function snoozeUntil(days: number, now = new Date()): string {
  const deadline = new Date(now);
  deadline.setUTCDate(deadline.getUTCDate() + days);
  return deadline.toISOString();
}

export function isSnoozeExpired(snoozedUntil: string | undefined, now = new Date()): boolean {
  if (!snoozedUntil) return false;
  const deadline = Date.parse(snoozedUntil);
  return Number.isFinite(deadline) && deadline <= now.getTime();
}

export function formatSnoozeDate(snoozedUntil: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(snoozedUntil));
}
