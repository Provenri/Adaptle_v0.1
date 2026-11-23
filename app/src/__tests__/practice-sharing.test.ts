import {
  createPracticeShareText,
  normalizeIsbn13,
  practiceDeepLink,
  practiceWebUrl,
} from '@/lib/practice-sharing';

describe('practice sharing', () => {
  it('creates spoiler-safe universal and app links', () => {
    const webUrl = practiceWebUrl(
      '9780345404473',
      'Do Androids Dream of Electric Sheep?',
      'Philip K. Dick',
      78
    );
    expect(webUrl).toContain('/practice?isbn=9780345404473');
    expect(webUrl).toContain('title=Do+Androids+Dream');
    expect(
      practiceDeepLink(
        '9780345404473',
        'Do Androids Dream of Electric Sheep?',
        'Philip K. Dick',
        78
      )
    ).toMatch(/^adaptle:\/\/practice\?isbn=9780345404473/);
  });

  it('shares an invitation without the correct premise or hints', () => {
    const text = createPracticeShareText({
      isbn13: '9780345404473',
      title: 'Do Androids Dream of Electric Sheep?',
      author: 'Philip K. Dick',
      movieTitle: 'Blade Runner',
      tmdbId: 78,
    });
    expect(text).toContain('Can you identify the one-line premise');
    expect(text).toContain('https://adaptle.expo.app/practice?isbn=9780345404473');
    expect(text).not.toContain('humanity');
    expect(text).not.toContain('engineered fugitives');
  });

  it('normalizes ISBN-13 separators and rejects other identifiers', () => {
    expect(normalizeIsbn13('978-0-3454-0447-3')).toBe('9780345404473');
    expect(normalizeIsbn13('0345404475')).toBeNull();
  });
});
