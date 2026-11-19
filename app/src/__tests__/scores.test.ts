import { calculateStreak, currentPuzzleDate, mergeDailyScores } from '@/lib/scores';

describe('score history', () => {
  it.each([
    [['2026-11-19', '2026-11-18', '2026-11-17'], '2026-11-19', 3],
    [['2026-11-18', '2026-11-17'], '2026-11-19', 2],
    [['2026-11-17', '2026-11-16'], '2026-11-19', 0],
    [[], '2026-11-19', 0],
  ] as const)('calculates the current streak', (dates, today, expected) => {
    expect(
      calculateStreak(
        dates.map((puzzleDate) => ({ puzzleDate })),
        today
      )
    ).toBe(expected);
  });

  it('merges newer remote scores into local history by puzzle date', () => {
    const oldScore = {
      puzzleDate: '2026-11-18',
      puzzleNumber: '13',
      totalPoints: 10,
      roundBreakdown: [3, 2, 1, 0, 3, 1],
      completedAt: '2026-11-18T18:00:00.000Z',
    };
    const newerScore = { ...oldScore, totalPoints: 15, completedAt: '2026-11-18T19:00:00.000Z' };

    expect(mergeDailyScores([oldScore], [newerScore])).toEqual([newerScore]);
  });

  it('uses the Europe/Berlin calendar date near midnight UTC', () => {
    expect(currentPuzzleDate(new Date('2026-11-19T23:30:00.000Z'))).toBe('2026-11-20');
  });
});
