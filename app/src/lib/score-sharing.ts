import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';

export function createScoreShareText(
  puzzleDate: string,
  total: number,
  breakdown: readonly number[],
  streak: number,
  savedCount: number
): string {
  const scoreEmoji = createScoreEmojiGrid(breakdown);

  const date = formatShareDate(puzzleDate);
  const savedLine = createSavedLine(savedCount);

  return [
    `Adaptle — ${date}`,
    `I scored ${total}/18 🎬📖${savedLine}.`,
    '',
    `🔥 ${streak}-day streak`,
    scoreEmoji,
    '',
    'Can you identify today’s book-to-movie story premises?',
  ].join('\n');
}

export function createScoreEmojiGrid(breakdown: readonly number[]): string {
  return breakdown
    .map((points, index) => {
      if (index === 5) return points === 3 ? '⭐' : '⬛';
      if (points === 3) return '🟩';
      if (points === 2) return '🟨';
      if (points === 1) return '🟧';
      return '⬛';
    })
    .join(' ');
}

export function formatShareDate(puzzleDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${puzzleDate}T12:00:00Z`));
}

export function createSavedLine(savedCount: number): string {
  return savedCount > 0
    ? ` and saved ${savedCount} ${savedCount === 1 ? 'book' : 'books'} to my shelf`
    : '';
}

export async function shareScoreImage(uri: string, text: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      dialogTitle: 'Share your Adaptle score',
      mimeType: 'image/png',
      UTI: 'public.png',
    });
    return;
  }

  await Share.share({ message: text });
}
