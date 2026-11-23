import { Share } from 'react-native';

const WEB_APP_URL = 'https://adaptle.expo.app';
const APP_SCHEME = 'adaptle';

export function normalizeIsbn13(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, '');
  return /^\d{13}$/.test(digits) ? digits : null;
}

export function practiceWebUrl(
  isbn13: string,
  title: string,
  author: string,
  tmdbId?: number
): string {
  const params = new URLSearchParams({ isbn: isbn13 });
  if (title.trim()) params.set('title', title.trim());
  if (author.trim()) params.set('author', author.trim());
  if (tmdbId) params.set('tmdbId', String(tmdbId));
  return `${WEB_APP_URL}/practice?${params.toString()}`;
}

export function practiceDeepLink(
  isbn13: string,
  title: string,
  author: string,
  tmdbId?: number
): string {
  const webUrl = new URL(practiceWebUrl(isbn13, title, author, tmdbId));
  return `${APP_SCHEME}://practice${webUrl.search}`;
}

export function createPracticeShareText(input: {
  isbn13: string;
  title: string;
  author: string;
  movieTitle: string;
  tmdbId?: number;
}): string {
  const url = practiceWebUrl(input.isbn13, input.title, input.author, input.tmdbId);
  return [
    `Can you identify the one-line premise for ${input.title} by ${input.author}?`,
    `Its screen adaptation is ${input.movieTitle}.`,
    '',
    `Play the Adaptle challenge: ${url}`,
  ].join('\n');
}

export async function sharePracticeChallenge(input: {
  isbn13: string;
  title: string;
  author: string;
  movieTitle: string;
  tmdbId?: number;
}): Promise<void> {
  const message = createPracticeShareText(input);
  await Share.share({
    message,
    title: `Play ${input.title} in Adaptle`,
    url: practiceWebUrl(input.isbn13, input.title, input.author, input.tmdbId),
  });
}
