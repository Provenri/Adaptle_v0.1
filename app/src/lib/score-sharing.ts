import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';

export function createScoreShareText(
  puzzleNumber: string,
  total: number,
  breakdown: readonly number[]
): string {
  const scoreEmoji = breakdown
    .map((points, index) => {
      if (index === 5) return points === 3 ? '⭐' : '⬛';
      if (points === 3) return '🟨';
      if (points === 2) return '⬜';
      if (points === 1) return '🟫';
      return '⬛';
    })
    .join(' ');

  return `Adaptle #${puzzleNumber} — ${total}/18 pts 🎬📖 (🔥 7)\n${scoreEmoji}`;
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
