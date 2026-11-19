import { describe, expect, it } from 'vitest';

import { classifyCover, FALLBACK_THEME } from '../lib/cover-theme.js';

describe('classifyCover', () => {
  it('maps science fiction subjects to scifi_teal', () => {
    const result = classifyCover(['American fiction', 'Science Fiction', 'Androids']);
    expect(result.coverTheme).toBe('scifi_teal');
    expect(result.genre).toBe('Science Fiction');
  });

  it('maps crime subjects to thriller_navy', () => {
    expect(classifyCover(['Detective and mystery stories']).coverTheme).toBe('thriller_navy');
  });

  it('maps biography to nonfiction_forest before literary fallback', () => {
    expect(classifyCover(['Biography', 'Classics']).coverTheme).toBe('nonfiction_forest');
  });

  it('is case-insensitive and matches substrings', () => {
    expect(classifyCover(['EPIC FANTASY NOVELS']).coverTheme).toBe('fantasy_plum');
  });

  it('falls back to literary_terracotta with first subject as genre', () => {
    const result = classifyCover(['Weird uncategorized subject']);
    expect(result.coverTheme).toBe(FALLBACK_THEME);
    expect(result.genre).toBe('Weird uncategorized subject');
  });

  it('handles empty subject lists', () => {
    const result = classifyCover([]);
    expect(result.coverTheme).toBe(FALLBACK_THEME);
    expect(result.genre).toBeNull();
  });
});
