import { describe, expect, it } from "vitest";

import { buildPremisePrompt } from "../steps/backfill-story-premises.js";
import { buildHintPrompt, HINT_JSON_SCHEMA } from "../steps/generate-hints.js";
import {
  buildThreadPrompt,
  selectCandidatePairs,
  type CandidatePair,
} from "../steps/generate-threads.js";
import type { HintedBook } from "../types.js";

function makeBook(overrides: Partial<HintedBook>): HintedBook {
  return {
    bookQid: "Q1",
    filmQid: "Q2",
    bookTitle: "Some Book",
    author: "Some Author",
    isbn13: "9780000000001",
    movieTitle: "Some Movie",
    movieDirector: "Some Director",
    movieReleaseYear: 1995,
    tmdbId: 1,
    bookPublicationYear: 1990,
    subjects: [],
    genre: null,
    coverTheme: "literary_terracotta",
    numberOfPages: null,
    openLibraryWorkKey: null,
    tmdbTitle: "TMDB Canonical Title",
    releaseYear: 1996,
    director: "TMDB Credits Director",
    moviePosterPath: null,
    leadCharacters: ["Lead One", "Lead Two"],
    leadActors: ["Actor One"],
    settingHint: "A quiet town in 1990s America",
    characterHint: "A dreamer and a skeptic",
    storyPremise:
      "An unlikely pair confront a changing world and its hidden costs.",
    premiseShort: "A pair confronts a changing world and its hidden costs.",
    premiseKeywords: ["changing world", "hidden costs"],
    ...overrides,
  };
}

describe("buildHintPrompt", () => {
  it("builds story premises without third-party film metadata", () => {
    const prompt = buildPremisePrompt(
      "Do Androids Dream of Electric Sheep?",
      "Philip K. Dick",
    );
    expect(prompt).toContain("Do Androids Dream of Electric Sheep?");
    expect(prompt).toContain("Philip K. Dick");
    expect(prompt).not.toContain("Blade Runner");
  });

  it("only contains book title and author — never TMDB movie data", () => {
    const prompt = buildHintPrompt(
      "Do Androids Dream of Electric Sheep?",
      "Philip K. Dick",
    );
    expect(prompt).toContain("Do Androids Dream of Electric Sheep?");
    expect(prompt).toContain("Philip K. Dick");
    expect(prompt).not.toContain("Blade Runner");
  });

  it("schema requires the premise and hints and forbids extras", () => {
    expect(HINT_JSON_SCHEMA.required).toEqual([
      "story_premise",
      "setting_hint",
      "character_hint",
      "premise_short",
      "premise_keywords",
    ]);
    expect(HINT_JSON_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("selectCandidatePairs", () => {
  it("pairs books by shared author with The Author expectation", () => {
    const books = [
      makeBook({
        isbn13: "9780000000001",
        author: "Philip K. Dick",
        movieDirector: "A",
      }),
      makeBook({
        isbn13: "9780000000002",
        author: "Philip K. Dick",
        movieDirector: "B",
      }),
    ];
    const pairs = selectCandidatePairs(books, 10);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.expectedCategory).toBe("The Author");
    expect(pairs[0]?.knownFact).toContain("Philip K. Dick");
  });

  it("pairs books by shared Wikidata director with The Director expectation", () => {
    const books = [
      makeBook({
        isbn13: "9780000000001",
        author: "A",
        movieDirector: "Ridley Scott",
      }),
      makeBook({
        isbn13: "9780000000002",
        author: "B",
        movieDirector: "Ridley Scott",
      }),
    ];
    const pairs = selectCandidatePairs(books, 10);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.expectedCategory).toBe("The Director");
    expect(pairs[0]?.knownFact).toContain("Ridley Scott");
  });

  it("ignores the TMDB display director for grouping", () => {
    const books = [
      makeBook({
        isbn13: "9780000000001",
        author: "A",
        movieDirector: null,
        director: "Same TMDB Director",
      }),
      makeBook({
        isbn13: "9780000000002",
        author: "B",
        movieDirector: null,
        director: "Same TMDB Director",
      }),
    ];
    expect(selectCandidatePairs(books, 10)).toHaveLength(0);
  });

  it("pairs books by meaningful shared subject but ignores generic tags", () => {
    const generic = [
      makeBook({
        isbn13: "9780000000001",
        author: "A",
        movieDirector: "B",
        subjects: ["Fiction"],
      }),
      makeBook({
        isbn13: "9780000000002",
        author: "C",
        movieDirector: "D",
        subjects: ["Fiction"],
      }),
    ];
    expect(selectCandidatePairs(generic, 10)).toHaveLength(0);

    const meaningful = [
      makeBook({
        isbn13: "9780000000001",
        author: "A",
        movieDirector: "B",
        subjects: ["Space flight"],
      }),
      makeBook({
        isbn13: "9780000000002",
        author: "C",
        movieDirector: "D",
        subjects: ["Space flight"],
      }),
    ];
    const pairs = selectCandidatePairs(meaningful, 10);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.expectedCategory).toBeNull();
  });

  it("rotates pair modes and never repeats a pair", () => {
    const books = Array.from({ length: 8 }, (_, i) =>
      makeBook({
        isbn13: `978000000000${i}`,
        author: `Author ${Math.floor(i / 2)}`,
        movieDirector: `Director ${i}`,
      }),
    );
    const pairs = selectCandidatePairs(books, 10);
    expect(pairs.length).toBe(4);
    expect(pairs.map((p) => p.pairMode)).toEqual([
      "BOOK_PAIR",
      "MOVIE_PAIR",
      "CROSSOVER",
      "BOOK_PAIR",
    ]);
    const keys = pairs.map((p) => [p.a.isbn13, p.b.isbn13].sort().join("|"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("respects the requested count", () => {
    const books = Array.from({ length: 20 }, (_, i) =>
      makeBook({
        isbn13: `97800000000${String(i).padStart(2, "0")}`,
        author: "Same Author",
      }),
    );
    expect(selectCandidatePairs(books, 3)).toHaveLength(3);
  });
});

describe("buildThreadPrompt", () => {
  const candidate: CandidatePair = {
    a: makeBook({
      bookTitle: "Dune",
      author: "Frank Herbert",
      movieTitle: "Dune Movie",
    }),
    b: makeBook({
      bookTitle: "The Martian",
      author: "Andy Weir",
      movieTitle: "Martian Movie",
    }),
    pairMode: "BOOK_PAIR",
    knownFact: 'Both works share the factual subject tag "desert planets".',
    expectedCategory: null,
  };

  it("describes both items as books for BOOK_PAIR", () => {
    const prompt = buildThreadPrompt(candidate);
    expect(prompt).toContain('"Dune" (book by Frank Herbert');
    expect(prompt).toContain('"The Martian" (book by Andy Weir');
    expect(prompt).not.toContain("Dune Movie");
  });

  it("describes items by movie title for MOVIE_PAIR and mixes for CROSSOVER", () => {
    const moviePrompt = buildThreadPrompt({
      ...candidate,
      pairMode: "MOVIE_PAIR",
    });
    expect(moviePrompt).toContain('"Dune Movie" (film');
    expect(moviePrompt).toContain('"Martian Movie" (film');

    const crossoverPrompt = buildThreadPrompt({
      ...candidate,
      pairMode: "CROSSOVER",
    });
    expect(crossoverPrompt).toContain('"Dune" (book by Frank Herbert');
    expect(crossoverPrompt).toContain('"Martian Movie" (film');
  });

  it("never leaks TMDB-origin fields into the prompt, using Wikidata facts instead", () => {
    for (const pairMode of ["BOOK_PAIR", "MOVIE_PAIR", "CROSSOVER"] as const) {
      const prompt = buildThreadPrompt({ ...candidate, pairMode });
      expect(prompt).not.toContain("TMDB Canonical Title");
      expect(prompt).not.toContain("TMDB Credits Director");
      expect(prompt).not.toContain("1996");
    }
    const moviePrompt = buildThreadPrompt({
      ...candidate,
      pairMode: "MOVIE_PAIR",
    });
    expect(moviePrompt).toContain("directed by Some Director");
    expect(moviePrompt).toContain("1995");
  });

  it("restricts categories to non-creator ones for subject-overlap pairs", () => {
    const subjectPrompt = buildThreadPrompt(candidate);
    expect(subjectPrompt).toContain(
      'Do NOT use "The Director" or "The Author"',
    );

    const authorPrompt = buildThreadPrompt({
      ...candidate,
      expectedCategory: "The Author",
    });
    expect(authorPrompt).not.toContain("Do NOT use");
  });
});
