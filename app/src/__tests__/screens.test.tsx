import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import PlayScreen from '@/app/index';
import LibraryScreen from '@/app/library';
import PrivacyPolicyScreen from '@/app/privacy';
import { bonusBooks, demoPuzzle, demoRoundDetails } from '@/test-fixtures/demo-puzzle';
import type { ProductionDailyPuzzle } from '@/lib/daily-puzzle';
import * as dailyPuzzleModule from '@/lib/daily-puzzle';
import { queryClient } from '@/lib/query-client';
import { createScoreShareText } from '@/lib/score-sharing';
import { AppDataProvider } from '@/providers/app-data-provider';

jest.mock('@/lib/local-storage', () => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(new Date())
    .reduce((parts, item) => ({ ...parts, [item.type]: item.value }), {} as Record<string, string>);
  const values = new Map<string, unknown>([
    [
      'library-v1',
      [
        {
          isbn13: '9780345404473',
          title: 'Do Androids Dream of Electric Sheep?',
          author: 'Philip K. Dick',
          genre: 'Science fiction',
          coverTheme: 'scifi_teal',
          status: 'TO_BE_READ',
          movieTitle: 'Blade Runner',
          movieYear: 1982,
          tmdbId: 78,
          moviePosterPath: '/63N9uy8nd9j7Eog2axPQ8lbr3Wj.jpg',
          leadActors: ['Harrison Ford', 'Sean Young'],
          leadCharacters: ['Rick Deckard', 'Rachael'],
        },
      ],
    ],
    ['play-landing-seen', `${today.year}-${today.month}-${today.day}`],
  ]);
  return {
    localStorage: {
      get: (key: string) => values.get(key) ?? null,
      set: (key: string, value: unknown) => values.set(key, value),
      remove: (key: string) => values.delete(key),
    },
    mmkvSupabaseStorage: {
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    },
  };
});

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({
    canGoBack: () => false,
    back: () => undefined,
    replace: () => undefined,
  }),
}));

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => null,
  initializeAnonymousSession: async () => undefined,
  syncOfflineMutation: async () => undefined,
  fetchDailyScores: async () => [],
  deleteDailyScore: async () => undefined,
  fetchUserLibrary: async () => [],
  fetchTmdbProviders: async () => ({
    region: 'DE',
    link: null,
    flatrate: [{ name: 'Prime Video', logoPath: null }],
    rent: [{ name: 'Apple TV', logoPath: null }],
    buy: [],
  }),
  searchBookCatalog: async () => [
    {
      isbn13: '9780385547345',
      title: 'Project Hail Mary',
      author: 'Andy Weir',
      genre: 'Science fiction',
      coverTheme: 'scifi_teal',
      numberOfPages: 496,
      publicationYear: 2021,
      subjects: ['Science fiction', 'Space'],
      source: 'openlibrary_manual',
    },
  ],
  getSurpriseBook: async () => ({
    isbn13: '9780441172719',
    title: 'Dune',
    author: 'Frank Herbert',
    genre: 'Science fiction',
    coverTheme: 'fantasy_plum',
    numberOfPages: null,
    publicationYear: 1965,
    subjects: ['Science fiction'],
    source: 'openlibrary_manual',
    hasAdaptation: true,
    tmdbId: 438631,
  }),
}));

async function renderScreen(element: ReactElement) {
  const roundDetails = Object.fromEntries(
    Object.entries(demoRoundDetails).map(([id, details]) => [id, { ...details, tmdbId: 78 }])
  );
  const firstBonus = bonusBooks[0];
  const secondBonus = bonusBooks[1];
  queryClient.setQueryData<ProductionDailyPuzzle>(['daily-puzzle', 'today'], {
    id: demoPuzzle.id,
    puzzleDate: '2026-11-20',
    puzzle: demoPuzzle,
    roundDetails,
    bonusItems: [
      {
        kind: 'book',
        title: firstBonus.title,
        author: firstBonus.author,
        genre: firstBonus.genre,
        coverTheme: firstBonus.coverTheme,
        movieTitle: firstBonus.movieTitle,
        moviePosterPath: firstBonus.moviePosterPath,
      },
      {
        kind: 'book',
        title: secondBonus.title,
        author: secondBonus.author,
        genre: secondBonus.genre,
        coverTheme: secondBonus.coverTheme,
        movieTitle: secondBonus.movieTitle,
        moviePosterPath: secondBonus.moviePosterPath,
      },
    ],
    pairMode: 'BOOK_PAIR',
  });
  return render(element, { wrapper: AppDataProvider });
}

describe('tab screens', () => {
  it('renders the Play screen', async () => {
    const { getAllByText, getByText, queryByText } = await renderScreen(<PlayScreen />);
    expect(getByText(/ADAPTLE/)).toBeTruthy();
    expect(getByText('1 of 5 rounds')).toBeTruthy();
    expect(queryByText(/Current round potential/)).toBeNull();
    expect(getByText("What is the story's one-line premise?")).toBeTruthy();
    expect(getByText('Source book')).toBeTruthy();
    expect(getByText('Screen')).toBeTruthy();
    expect(getAllByText('Philip K. Dick')).toHaveLength(1);
    expect(getByText('1968')).toBeTruthy();
    expect(
      getByText('A weary hunter questions humanity while pursuing engineered fugitives.')
    ).toBeTruthy();
    expect(queryByText(/A weary hunter questions what it means/)).toBeNull();
  });

  it('shows the correct characters after a wrong answer', async () => {
    const screen = await renderScreen(<PlayScreen />);

    await fireEvent.press(
      screen.getByLabelText("Answer B: A young heir fights for control of a desert world's fate.")
    );

    expect(screen.getByText('× Not quite · +0 pts')).toBeTruthy();
    expect(screen.getByText('Characters: Rick Deckard & Rachael')).toBeTruthy();
    expect(
      screen.getByText('A weary hunter questions humanity while pursuing engineered fugitives.')
    ).toBeTruthy();
  });

  it('unlocks hints and progresses the full Play flow', async () => {
    const screen = await renderScreen(<PlayScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Unlock · -1 pt' }));
    expect(screen.getByText('Dystopian 2019 Los Angeles')).toBeTruthy();
    expect(screen.getByText('Screen')).toBeTruthy();
    expect(screen.getByText('Blade Runner')).toBeTruthy();

    await fireEvent.press(
      screen.getByLabelText(
        'Answer A: A weary hunter questions humanity while pursuing engineered fugitives.'
      )
    );
    expect(screen.getByText('✓ Correct! · +2 pts')).toBeTruthy();
    expect(screen.getByText('Dir. Ridley Scott')).toBeTruthy();
    expect(await screen.findByText('Stream: Prime Video, Apple TV')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Finished' }));
    expect(screen.getByRole('button', { name: '✓ Finished' }).props.accessibilityState).toEqual({
      selected: true,
    });

    for (let round = 1; round < 5; round += 1) {
      await fireEvent.press(screen.getByRole('button', { name: `Next round (${round + 1} of 5)` }));
      await fireEvent.press(screen.getAllByLabelText(/Answer A:/)[0]);
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Start bonus round' }));
    expect(screen.getByText('Common Thread')).toBeTruthy();

    await fireEvent.press(
      screen.getByLabelText('Bonus answer A: The Setting — Hostile other worlds')
    );
    await fireEvent.press(screen.getByRole('button', { name: 'See daily score' }));
    expect(screen.getByText('17 / 18 PTS')).toBeTruthy();
  });

  it('renders the My Library screen', async () => {
    const screen = await renderScreen(<LibraryScreen />);
    expect(screen.queryByText('1 book saved · 1 screen adaptation')).toBeNull();
    expect(screen.getByText('Shelf overview')).toBeTruthy();
    expect(screen.getByText('1 playable')).toBeTruthy();
    expect(screen.getByText('Do Androids Dream of Electric Sheep?')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Search my shelf'), 'missing');
    expect(screen.getByText('No matching books')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Search my shelf'), '');
    await fireEvent.press(screen.getByRole('button', { name: 'All 1' }));
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Change status for Do Androids Dream of Electric Sheep?',
      })
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Reading' }));
    expect(screen.getByText('Reading 1')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reading 1' }));
    expect(screen.getByRole('button', { name: /Play adaptation/ })).toBeTruthy();
  });

  it('uses premise selection for library adaptation practice', async () => {
    const details = { ...demoRoundDetails['blade-runner'], tmdbId: 78 };
    const practiceSpy = jest.spyOn(dailyPuzzleModule, 'fetchAdaptationPractice').mockResolvedValue({
      details,
      choices: [...demoPuzzle.rounds[0].choices],
      correctChoiceId: demoPuzzle.rounds[0].correctChoiceId,
    });
    const screen = await renderScreen(<LibraryScreen />);

    await fireEvent.press(screen.getByRole('button', { name: /Play adaptation/ }));
    expect(await screen.findByText("What is the story's one-line premise?")).toBeTruthy();
    expect(screen.getAllByText('Screen').length).toBeGreaterThan(0);
    expect(
      screen.queryByText(
        'A weary hunter questions what it means to be human while pursuing dangerous replicants.'
      )
    ).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Unlock · -1 pt' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock · -1 pt' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock final clue · 1 pt' }));
    expect(screen.getByText('humanity · engineered fugitives')).toBeTruthy();

    await fireEvent.press(
      screen.getByLabelText(
        'Answer A: A weary hunter questions humanity while pursuing engineered fugitives.'
      )
    );
    expect(screen.getByText('Correct premise')).toBeTruthy();
    expect(
      screen.getByText('A weary hunter questions humanity while pursuing engineered fugitives.')
    ).toBeTruthy();

    practiceSpy.mockRestore();
  });

  it('adds a book from search results', async () => {
    const screen = await renderScreen(<LibraryScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '+ Add Book' }));
    await fireEvent.changeText(screen.getByLabelText('Search book catalog'), 'Project Hail Mary');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Andy Weir · 2021')).toBeTruthy();
    await fireEvent.press(await screen.findByText('Project Hail Mary'));

    expect(screen.queryByLabelText('Search book catalog')).toBeNull();
    expect(screen.queryByText('2 books saved · 1 screen adaptation')).toBeNull();
    expect(screen.getByText('Project Hail Mary')).toBeTruthy();
  });

  it('filters the library to books with adaptations', async () => {
    const screen = await renderScreen(<LibraryScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '+ Add Book' }));
    await fireEvent.changeText(screen.getByLabelText('Search book catalog'), 'Project Hail Mary');
    await fireEvent.press(await screen.findByText('Project Hail Mary'));

    await fireEvent.press(screen.getByRole('button', { name: '+ Add Book' }));
    await fireEvent.changeText(screen.getByLabelText('Search book catalog'), 'Dune');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
    await fireEvent.press(
      screen.getByRole('switch', { name: 'Show search results with screen adaptations only' })
    );

    expect(
      screen.getByRole('switch', { name: 'Show search results with screen adaptations only' }).props
        .accessibilityState
    ).toEqual({ checked: true });

    await fireEvent.press(screen.getByRole('switch', { name: 'Show popular books only' }));
    expect(
      screen.getByRole('switch', { name: 'Show popular books only' }).props.accessibilityState
    ).toEqual({ checked: true });
  });

  it('shows a surprise adaptation candidate without search input', async () => {
    const screen = await renderScreen(<LibraryScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '+ Add Book' }));
    await fireEvent.press(screen.getByRole('switch', { name: 'Show popular books only' }));
    await fireEvent.press(screen.getByRole('button', { name: /Surprise me/ }));

    expect(await screen.findByText('Dune')).toBeTruthy();
  });

  it('removes a saved book after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Remove')?.onPress?.();
    });
    const screen = await renderScreen(<LibraryScreen />);

    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Change status for Do Androids Dream of Electric Sheep?',
      })
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));

    expect(alert).toHaveBeenCalled();
    expect(screen.queryByText('Do Androids Dream of Electric Sheep?')).toBeNull();
    alert.mockRestore();
  });

  it('shows the public privacy policy and deletion contact', async () => {
    const screen = await render(<PrivacyPolicyScreen />, { wrapper: AppDataProvider });

    expect(screen.getByText('Privacy Policy')).toBeTruthy();
    expect(screen.getAllByText(/adaptle\.privacy@gmail\.com/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Request data deletion' })).toBeTruthy();
  });
});

describe('score sharing', () => {
  it('formats the viral share text from the actual round breakdown', () => {
    expect(createScoreShareText('2026-11-21', 12, [3, 2, 1, 0, 3, 3], 7, 2)).toBe(
      'Adaptle — 21 Nov 2026\nI scored 12/18 🎬📖 and saved 2 books to my shelf.\n\n🔥 7-day streak\n🟩 🟨 🟧 ⬛ 🟩 ⭐\n\nCan you identify today’s book-to-movie story premises?'
    );
  });
});

afterEach(() => {
  queryClient.clear();
});
