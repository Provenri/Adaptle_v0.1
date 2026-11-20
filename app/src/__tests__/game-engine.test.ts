import {
  MAX_DAILY_POINTS,
  createGameState,
  gameReducer,
  getRoundBreakdown,
  getRoundPotential,
  getTotalPoints,
  getNameInitials,
  maskMovieTitle,
  shuffleChoices,
  type DailyPuzzle,
  type GameState,
} from '@/lib/game-engine';

const choices = [
  { id: 'a', label: 'Answer A' },
  { id: 'b', label: 'Answer B' },
  { id: 'c', label: 'Answer C' },
];

const puzzle: DailyPuzzle = {
  id: '2026-11-19',
  rounds: Array.from({ length: 5 }, (_, index) => ({
    id: `round-${index + 1}`,
    correctChoiceId: 'a',
    choices,
  })),
  bonus: {
    id: 'bonus',
    correctChoiceId: 'b',
    choices,
  },
};

function answerRound(state: GameState, choiceId = 'a'): GameState {
  return gameReducer(gameReducer(state, { type: 'submit-answer', choiceId }), {
    type: 'continue',
  });
}

describe('game engine', () => {
  it('reduces potential from 3 to 2 to 1 as hints unlock', () => {
    expect([0, 1, 2, 3].map(getRoundPotential)).toEqual([3, 2, 1, 1]);

    let state = createGameState(puzzle);
    state = gameReducer(state, { type: 'unlock-hint' });
    state = gameReducer(state, { type: 'unlock-hint' });
    state = gameReducer(state, { type: 'unlock-hint' });
    const capped = gameReducer(state, { type: 'unlock-hint' });

    expect(capped.hintsUsed).toBe(3);
  });

  it('scores a correct answer from the potential and a wrong answer as zero', () => {
    let state = createGameState(puzzle);
    state = gameReducer(state, { type: 'unlock-hint' });
    state = gameReducer(state, { type: 'submit-answer', choiceId: 'a' });

    expect(state.phase).toBe('reveal');
    expect(state.results).toEqual([
      expect.objectContaining({ correct: true, hintsUsed: 1, points: 2 }),
    ]);

    const wrongState = gameReducer(createGameState(puzzle), {
      type: 'submit-answer',
      choiceId: 'b',
    });
    expect(wrongState.results[0]).toEqual(expect.objectContaining({ correct: false, points: 0 }));
  });

  it('progresses through five rounds, the bonus, and completion for 18 points', () => {
    let state = createGameState(puzzle);
    for (let index = 0; index < 5; index += 1) state = answerRound(state);

    expect(state.phase).toBe('bonus');
    state = gameReducer(state, { type: 'submit-bonus', choiceId: 'b' });
    expect(state.phase).toBe('bonus-reveal');
    state = gameReducer(state, { type: 'continue' });

    expect(state.phase).toBe('complete');
    expect(getRoundBreakdown(state)).toEqual([3, 3, 3, 3, 3, 3]);
    expect(getTotalPoints(state)).toBe(MAX_DAILY_POINTS);
  });

  it('awards no bonus points for a wrong answer', () => {
    let state = createGameState(puzzle);
    for (let index = 0; index < 5; index += 1) state = answerRound(state);
    state = gameReducer(state, { type: 'submit-bonus', choiceId: 'a' });

    expect(state.results.at(-1)).toEqual(
      expect.objectContaining({ roundIndex: 5, correct: false, hintsUsed: 0, points: 0 })
    );
  });

  it('ignores actions that are invalid for the current phase', () => {
    const state = createGameState(puzzle);

    expect(gameReducer(state, { type: 'continue' })).toBe(state);
    expect(gameReducer(state, { type: 'submit-answer', choiceId: 'missing' })).toBe(state);
    expect(gameReducer(state, { type: 'submit-bonus', choiceId: 'b' })).toBe(state);
  });

  it('resets a completed game to its initial round', () => {
    let state = createGameState(puzzle);
    for (let index = 0; index < 5; index += 1) state = answerRound(state);
    state = gameReducer(state, { type: 'submit-bonus', choiceId: 'b' });
    state = gameReducer(state, { type: 'continue' });

    const reset = gameReducer(state, { type: 'reset-game' });
    expect(reset.phase).toBe('question');
    expect(reset.roundIndex).toBe(0);
    expect(reset.results).toEqual([]);
  });

  it('rejects malformed puzzle payloads', () => {
    expect(() =>
      createGameState({
        ...puzzle,
        rounds: puzzle.rounds.slice(0, 4),
      })
    ).toThrow('exactly 5');

    expect(() =>
      createGameState({
        ...puzzle,
        bonus: { ...puzzle.bonus, correctChoiceId: 'missing' },
      })
    ).toThrow('correct choice');
  });
});

describe('game helpers', () => {
  it('formats lead actor initials', () => {
    expect(getNameInitials('Harrison Ford, Sean Young')).toBe('H. F. & S. Y.');
    expect(getNameInitials('Carey Mulligan & Matthias Schoenaerts')).toBe('C. M. & M. S.');
  });

  it('masks a movie title while retaining punctuation and each word initial', () => {
    expect(maskMovieTitle('Blade Runner: 2049')).toBe('B _ _ _ _ R _ _ _ _ _: 2 0 4 9');
  });

  it('shuffles choices deterministically without mutating the source', () => {
    const first = shuffleChoices(choices, '2026-11-19:round-1');
    const second = shuffleChoices(choices, '2026-11-19:round-1');

    expect(first).toEqual(second);
    expect(first).not.toEqual(choices);
    expect(choices.map((choice) => choice.id)).toEqual(['a', 'b', 'c']);
  });
});
