import type { CoverTheme } from '../types.js';

/**
 * Maps Open Library subject strings to Adaptle's 6 typographic cover themes
 * (see Adaptle.md section 3). First matching theme in priority order wins;
 * literary_terracotta is the fallback.
 */
const THEME_KEYWORDS: ReadonlyArray<{ theme: CoverTheme; keywords: readonly string[] }> = [
  {
    theme: 'scifi_teal',
    keywords: [
      'science fiction',
      'sci-fi',
      'cyberpunk',
      'space',
      'dystopia',
      'dystopian',
      'time travel',
      'robots',
      'androids',
      'aliens',
      'mars',
    ],
  },
  {
    theme: 'thriller_navy',
    keywords: [
      'mystery',
      'crime',
      'suspense',
      'thriller',
      'detective',
      'murder',
      'espionage',
      'spy',
      'noir',
      'serial killers',
    ],
  },
  {
    theme: 'fantasy_plum',
    keywords: [
      'fantasy',
      'magical realism',
      'magic',
      'wizards',
      'dragons',
      'fairy tales',
      'mythology',
      'supernatural',
      'vampires',
      'witches',
    ],
  },
  {
    theme: 'romance_rose',
    keywords: ['romance', 'love stories', 'romantic', 'relationships', 'contemporary romance'],
  },
  {
    theme: 'nonfiction_forest',
    keywords: [
      'biography',
      'autobiography',
      'memoir',
      'history',
      'psychology',
      'nonfiction',
      'non-fiction',
      'true crime',
      'science',
      'philosophy',
      'politics',
      'business',
      'self-help',
    ],
  },
  {
    theme: 'literary_terracotta',
    keywords: ['literary fiction', 'drama', 'classics', 'classic literature', 'coming of age'],
  },
];

export const FALLBACK_THEME: CoverTheme = 'literary_terracotta';

/**
 * Picks a cover theme and a representative genre string from CC0 subject facts.
 * Matching is case-insensitive substring search in theme priority order.
 */
export function classifyCover(subjects: readonly string[]): {
  coverTheme: CoverTheme;
  genre: string | null;
} {
  const normalized = subjects.map((s) => s.toLowerCase());
  for (const { theme, keywords } of THEME_KEYWORDS) {
    for (const keyword of keywords) {
      const index = normalized.findIndex((subject) => subject.includes(keyword));
      if (index !== -1) {
        return { coverTheme: theme, genre: subjects[index] ?? null };
      }
    }
  }
  return { coverTheme: FALLBACK_THEME, genre: subjects[0] ?? null };
}
