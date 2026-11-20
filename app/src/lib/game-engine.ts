export const REGULAR_ROUND_COUNT = 5;
export const BONUS_POINTS = 3;
export const MAX_DAILY_POINTS = 18;

const POTENTIAL_BY_HINTS = [3, 2, 1, 1] as const;

export type GameChoice = {
  id: string;
  label: string;
};

export type BookRound = {
  id: string;
  correctChoiceId: string;
  choices: readonly GameChoice[];
};

export type BonusRound = {
  id: string;
  correctChoiceId: string;
  choices: readonly GameChoice[];
};

export type DailyPuzzle = {
  id: string;
  rounds: readonly BookRound[];
  bonus: BonusRound;
};

export type RoundResult = {
  roundIndex: number;
  correct: boolean;
  hintsUsed: number;
  points: number;
  selectedChoiceId: string;
};

export type GamePhase = 'question' | 'reveal' | 'bonus' | 'bonus-reveal' | 'complete';

export type GameState = {
  puzzle: DailyPuzzle;
  phase: GamePhase;
  roundIndex: number;
  hintsUsed: number;
  results: readonly RoundResult[];
};

export type GameAction =
  | { type: 'unlock-hint' }
  | { type: 'submit-answer'; choiceId: string }
  | { type: 'continue' }
  | { type: 'submit-bonus'; choiceId: string }
  | { type: 'reset-game' };

export function createGameState(puzzle: DailyPuzzle): GameState {
  validatePuzzle(puzzle);

  return {
    puzzle,
    phase: 'question',
    roundIndex: 0,
    hintsUsed: 0,
    results: [],
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'unlock-hint':
      if (state.phase !== 'question' || state.hintsUsed >= POTENTIAL_BY_HINTS.length - 1) {
        return state;
      }
      return { ...state, hintsUsed: state.hintsUsed + 1 };
    case 'submit-answer':
      if (state.phase !== 'question' || !hasChoice(state.puzzle.rounds[state.roundIndex], action)) {
        return state;
      }
      return finishAnswer(
        state,
        state.puzzle.rounds[state.roundIndex].correctChoiceId === action.choiceId,
        action.choiceId,
        'reveal'
      );
    case 'continue':
      return continueFromReveal(state);
    case 'submit-bonus':
      if (state.phase !== 'bonus' || !hasChoice(state.puzzle.bonus, action)) {
        return state;
      }
      return finishAnswer(
        state,
        state.puzzle.bonus.correctChoiceId === action.choiceId,
        action.choiceId,
        'bonus-reveal'
      );
    case 'reset-game':
      return createGameState(state.puzzle);
  }
}

export function getRoundPotential(hintsUsed: number): 1 | 2 | 3 {
  const clampedHints = Math.max(0, Math.min(3, Math.trunc(hintsUsed)));
  return POTENTIAL_BY_HINTS[clampedHints] ?? 1;
}

export function getTotalPoints(state: GameState): number {
  return state.results.reduce((total, result) => total + result.points, 0);
}

export function getRoundBreakdown(state: GameState): number[] {
  return state.results.map((result) => result.points);
}

export function maskMovieTitle(title: string): string {
  return title
    .trim()
    .split(/(\s+)/u)
    .map((segment) => {
      if (/^\s+$/u.test(segment)) return segment;

      let revealInitial = true;
      return [...segment]
        .map((character) => {
          if (!/\p{L}/u.test(character)) return character;
          if (revealInitial) {
            revealInitial = false;
            return character.toUpperCase();
          }
          return '_';
        })
        .join(' ')
        .replace(/ ([^\p{L}\p{N}_\s])/gu, '$1');
    })
    .join('');
}

export function getNameInitials(names: string): string {
  return names
    .split(/\s*(?:,|&)\s*/u)
    .map((name) =>
      name
        .trim()
        .split(/\s+/u)
        .filter(Boolean)
        .map((part) => `${part[0]?.toUpperCase()}.`)
        .join(' ')
    )
    .join(' & ');
}

export function shuffleChoices(
  choices: readonly GameChoice[],
  seed: string | number
): GameChoice[] {
  const shuffled = [...choices];
  const random = seededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function finishAnswer(
  state: GameState,
  correct: boolean,
  choiceId: string,
  revealPhase: 'reveal' | 'bonus-reveal'
): GameState {
  const isBonus = revealPhase === 'bonus-reveal';
  const hintsUsed = isBonus ? 0 : state.hintsUsed;
  const points = correct ? (isBonus ? BONUS_POINTS : getRoundPotential(hintsUsed)) : 0;
  const result: RoundResult = {
    roundIndex: isBonus ? REGULAR_ROUND_COUNT : state.roundIndex,
    correct,
    hintsUsed,
    points,
    selectedChoiceId: choiceId,
  };

  return {
    ...state,
    phase: revealPhase,
    results: [...state.results, result],
  };
}

function continueFromReveal(state: GameState): GameState {
  if (state.phase === 'reveal') {
    if (state.roundIndex === REGULAR_ROUND_COUNT - 1) {
      return { ...state, phase: 'bonus', hintsUsed: 0 };
    }
    return {
      ...state,
      phase: 'question',
      roundIndex: state.roundIndex + 1,
      hintsUsed: 0,
    };
  }
  if (state.phase === 'bonus-reveal') {
    return { ...state, phase: 'complete' };
  }
  return state;
}

function hasChoice(round: BookRound | BonusRound, action: { choiceId: string }): boolean {
  return round.choices.some((choice) => choice.id === action.choiceId);
}

function validatePuzzle(puzzle: DailyPuzzle): void {
  if (puzzle.rounds.length !== REGULAR_ROUND_COUNT) {
    throw new Error(`Daily puzzles require exactly ${REGULAR_ROUND_COUNT} regular rounds`);
  }

  puzzle.rounds.forEach((round, index) => validateRound(round, `Round ${index + 1}`));
  validateRound(puzzle.bonus, 'Bonus round');
}

function validateRound(round: BookRound | BonusRound, name: string): void {
  const ids = new Set(round.choices.map((choice) => choice.id));
  if (ids.size !== round.choices.length) {
    throw new Error(`${name} contains duplicate choice IDs`);
  }
  if (round.choices.length !== 3) {
    throw new Error(`${name} requires exactly 3 choices`);
  }
  if (!ids.has(round.correctChoiceId)) {
    throw new Error(`${name} correct choice is not present`);
  }
}

function seededRandom(seed: string | number): () => number {
  let value = hashSeed(String(seed));

  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
