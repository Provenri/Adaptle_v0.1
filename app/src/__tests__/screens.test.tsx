import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import PlayScreen from '@/app/index';
import LibraryScreen from '@/app/library';
import { queryClient } from '@/lib/query-client';
import { createScoreShareText } from '@/lib/score-sharing';
import { AppDataProvider } from '@/providers/app-data-provider';

jest.mock('react-native-mmkv', () => {
  const values = new Map<string, string>();
  return {
    createMMKV: () => ({
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
      remove: (key: string) => values.delete(key),
    }),
  };
});

async function renderScreen(element: ReactElement) {
  return render(element, { wrapper: AppDataProvider });
}

describe('tab screens', () => {
  it('renders the Play screen', async () => {
    const { getByText } = await renderScreen(<PlayScreen />);
    expect(getByText(/ADAPTLE/)).toBeTruthy();
    expect(getByText('Which characters belong to the screen adaptation?')).toBeTruthy();
  });

  it('unlocks hints and progresses the full Play flow', async () => {
    const screen = await renderScreen(<PlayScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Unlock · -1 pt' }));
    expect(screen.getByText('Dystopian 2019 Los Angeles')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Answer A: Rick Deckard & Rachael'));
    expect(screen.getByText('✓ Correct! · +2 pts')).toBeTruthy();
    expect(screen.getByText('Dir. Ridley Scott')).toBeTruthy();
    expect(screen.getByText('Stream: Prime Video, Apple TV')).toBeTruthy();

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
    expect(screen.getByText('3 books saved · 2 screen adaptations')).toBeTruthy();
    expect(screen.getByText('Atomic Habits')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Search my shelf'), 'Dune');
    expect(screen.getByText('Dune')).toBeTruthy();
    expect(screen.queryByText('Atomic Habits')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Search my shelf'), '');
    await fireEvent.press(screen.getByRole('button', { name: 'All 3' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Change status for Dune' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Snooze' }));
    expect(screen.getByText('Snooze 2')).toBeTruthy();
  });

  it('adds a book from search results', async () => {
    const screen = await renderScreen(<LibraryScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '+ Add Book' }));
    await fireEvent.changeText(screen.getByLabelText('Search book catalog'), 'Project Hail Mary');
    await fireEvent.press(screen.getByText('Project Hail Mary'));

    expect(screen.queryByLabelText('Search book catalog')).toBeNull();
    expect(screen.getByText('4 books saved · 2 screen adaptations')).toBeTruthy();
    expect(screen.getByText('Project Hail Mary')).toBeTruthy();
  });
});

describe('score sharing', () => {
  it('formats the viral share text from the actual round breakdown', () => {
    expect(createScoreShareText('14', 12, [3, 2, 1, 0, 3, 3])).toBe(
      'Adaptle #14 — 12/18 pts 🎬📖 (🔥 7)\n🟨 ⬜ 🟫 ⬛ 🟨 ⭐'
    );
  });
});

afterEach(() => {
  queryClient.clear();
});
