import { describe, expect, it } from 'vitest';

import { cleanCharacterName, extractMovieFacts } from '../steps/enrich-tmdb.js';

describe('cleanCharacterName', () => {
  it('strips credit annotations', () => {
    expect(cleanCharacterName('Rick Deckard (voice)')).toBe('Rick Deckard');
    expect(cleanCharacterName('Rachael (uncredited)')).toBe('Rachael');
  });

  it('normalizes whitespace', () => {
    expect(cleanCharacterName('  Paul   Atreides ')).toBe('Paul Atreides');
  });
});

describe('extractMovieFacts', () => {
  const movie = {
    title: 'Blade Runner',
    release_date: '1982-06-25',
    poster_path: '/p.jpg',
    credits: {
      crew: [
        { name: 'Michael Deeley', job: 'Producer' },
        { name: 'Ridley Scott', job: 'Director' },
      ],
      cast: [
        { name: 'Sean Young', character: 'Rachael', order: 1 },
        { name: 'Harrison Ford', character: 'Rick Deckard', order: 0 },
        { name: 'Rutger Hauer', character: 'Roy Batty', order: 2 },
      ],
    },
  };

  it('extracts year, director, and the two top-billed characters in order', () => {
    const facts = extractMovieFacts(movie);
    expect(facts).toEqual({
      title: 'Blade Runner',
      releaseYear: 1982,
      director: 'Ridley Scott',
      posterPath: '/p.jpg',
      leadCharacters: ['Rick Deckard', 'Rachael'],
      leadActors: ['Harrison Ford', 'Sean Young'],
    });
  });

  it('skips cast entries without character names', () => {
    const facts = extractMovieFacts({
      ...movie,
      credits: {
        ...movie.credits,
        cast: [
          { name: 'Someone', character: '', order: 0 },
          { name: 'Harrison Ford', character: 'Rick Deckard', order: 1 },
          { name: 'Sean Young', character: 'Rachael', order: 2 },
        ],
      },
    });
    expect(facts.leadCharacters).toEqual(['Rick Deckard', 'Rachael']);
  });

  it('handles missing data gracefully', () => {
    const facts = extractMovieFacts({});
    expect(facts).toEqual({
      title: null,
      releaseYear: null,
      director: null,
      posterPath: null,
      leadCharacters: [],
      leadActors: [],
    });
  });
});
