import { formatSnoozeDate, isSnoozeExpired, snoozeUntil } from '@/lib/snooze';

describe('snooze dates', () => {
  it('adds calendar days in UTC', () => {
    expect(snoozeUntil(7, new Date('2026-11-20T12:00:00.000Z'))).toBe('2026-11-27T12:00:00.000Z');
  });

  it('detects expired and future deadlines', () => {
    expect(isSnoozeExpired('2026-11-20T12:00:00.000Z', new Date('2026-11-20T12:00:00.000Z'))).toBe(
      true
    );
    expect(isSnoozeExpired('2026-11-21T12:00:00.000Z', new Date('2026-11-20T12:00:00.000Z'))).toBe(
      false
    );
    expect(isSnoozeExpired(undefined)).toBe(false);
  });

  it('formats a deadline for display', () => {
    expect(formatSnoozeDate('2026-11-27T12:00:00.000Z')).toMatch(/27/);
  });
});
