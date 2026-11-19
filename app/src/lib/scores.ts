import type { DailyPuzzle, GameState } from './game-engine';
import { getRoundBreakdown, getTotalPoints } from './game-engine';

export type DailyScore = {
  puzzleDate: string;
  puzzleNumber: string;
  totalPoints: number;
  roundBreakdown: number[];
  completedAt: string;
};

export function calculateStreak(
  scores: readonly Pick<DailyScore, 'puzzleDate'>[],
  today = currentPuzzleDate()
): number {
  const completedDates = new Set(scores.map((score) => score.puzzleDate));
  let cursor = today;

  if (!completedDates.has(cursor)) cursor = shiftDate(cursor, -1);

  let streak = 0;
  while (completedDates.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export function createDailyScore(
  puzzle: DailyPuzzle,
  state: GameState,
  now = new Date()
): DailyScore {
  if (state.phase !== 'complete') {
    throw new Error('A daily score can only be created after the puzzle is complete');
  }

  const roundBreakdown = getRoundBreakdown(state);
  if (roundBreakdown.length !== 6) {
    throw new Error('A completed daily score requires all six round results');
  }

  return {
    puzzleDate: currentPuzzleDate(now),
    puzzleNumber: puzzle.id,
    totalPoints: getTotalPoints(state),
    roundBreakdown,
    completedAt: now.toISOString(),
  };
}

export function mergeDailyScores(
  local: readonly DailyScore[],
  incoming: readonly DailyScore[]
): DailyScore[] {
  const byDate = new Map(local.map((score) => [score.puzzleDate, score]));
  for (const score of incoming) {
    const existing = byDate.get(score.puzzleDate);
    if (!existing || Date.parse(score.completedAt) > Date.parse(existing.completedAt)) {
      byDate.set(score.puzzleDate, score);
    }
  }
  return [...byDate.values()].sort((a, b) => b.puzzleDate.localeCompare(a.puzzleDate));
}

export function currentPuzzleDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
