import { z } from "zod";

/** A verified book-to-movie adaptation pair straight from Wikidata. */
export const WikidataPairSchema = z.object({
  bookQid: z.string().regex(/^Q\d+$/),
  filmQid: z.string().regex(/^Q\d+$/),
  bookTitle: z.string().min(1),
  author: z.string().min(1),
  /** Normalized: digits only, no hyphens. */
  isbn13: z.string().regex(/^\d{13}$/),
  /** Film label from Wikidata (CC0) — the only movie title used in LLM prompts. */
  movieTitle: z.string().min(1),
  /** Film director from Wikidata P57 (CC0) — safe for LLM prompts. */
  movieDirector: z.string().nullable(),
  /** Film release year from Wikidata P577 (CC0) — safe for LLM prompts. */
  movieReleaseYear: z.number().int().nullable(),
  tmdbId: z.number().int().positive(),
  bookPublicationYear: z.number().int().nullable(),
});
export type WikidataPair = z.infer<typeof WikidataPairSchema>;

export const COVER_THEMES = [
  "scifi_teal",
  "thriller_navy",
  "fantasy_plum",
  "literary_terracotta",
  "romance_rose",
  "nonfiction_forest",
] as const;
export const CoverThemeSchema = z.enum(COVER_THEMES);
export type CoverTheme = z.infer<typeof CoverThemeSchema>;

/** A pair enriched with CC0 bibliographic facts from Open Library. */
export const EnrichedBookSchema = WikidataPairSchema.extend({
  /** CC0 subject strings from Open Library (uncopyrightable facts only). */
  subjects: z.array(z.string()),
  genre: z.string().nullable(),
  coverTheme: CoverThemeSchema,
  numberOfPages: z.number().int().positive().nullable(),
  openLibraryWorkKey: z.string().nullable(),
});
export type EnrichedBook = z.infer<typeof EnrichedBookSchema>;

/**
 * Movie facts from TMDB — for app display only (reveal card, hangman hint).
 * TMDB-origin fields are prefixed `tmdb` and must never reach an LLM prompt;
 * the `overview` text field is never read at all.
 */
export const TmdbEnrichedSchema = EnrichedBookSchema.extend({
  /** TMDB canonical movie title (display + hangman masking only). */
  tmdbTitle: z.string().min(1),
  /** TMDB release year (display only). */
  releaseYear: z.number().int().nullable(),
  /** TMDB credits director (display only). */
  director: z.string().nullable(),
  moviePosterPath: z.string().nullable(),
  /** Two lead character names from TMDB credits, e.g. ["Rick Deckard", "Rachael"]. */
  leadCharacters: z.array(z.string().min(1)).length(2),
  /** Lead actor names for the reveal card. */
  leadActors: z.array(z.string().min(1)),
});
export type TmdbEnriched = z.infer<typeof TmdbEnrichedSchema>;

/** A fully hinted puzzle item, ready for upload. */
export const HintedBookSchema = TmdbEnrichedSchema.extend({
  settingHint: z.string().min(1),
  characterHint: z.string().min(1),
  storyPremise: z.string().min(1).max(240),
  premiseShort: z.string().min(1).max(70),
  premiseKeywords: z.array(z.string().min(1).max(24)).min(2).max(6),
});
export type HintedBook = z.infer<typeof HintedBookSchema>;

export const THREAD_CATEGORIES = [
  "The Setting",
  "The Plot",
  "The Characters",
  "The Director",
  "The Author",
] as const;
export const ThreadCategorySchema = z.enum(THREAD_CATEGORIES);
export type ThreadCategory = z.infer<typeof ThreadCategorySchema>;

export const PAIR_MODES = ["BOOK_PAIR", "MOVIE_PAIR", "CROSSOVER"] as const;
export const PairModeSchema = z.enum(PAIR_MODES);
export type PairMode = z.infer<typeof PairModeSchema>;

/** A Round 6 Common Thread bonus puzzle. */
export const CommonThreadSchema = z
  .object({
    pairMode: PairModeSchema,
    itemAIsbn13: z.string().regex(/^\d{13}$/),
    itemBIsbn13: z.string().regex(/^\d{13}$/),
    connectionCategory: ThreadCategorySchema,
    connectionDetail: z.string().min(1),
    decoy1Category: ThreadCategorySchema,
    decoy1Detail: z.string().min(1),
    decoy2Category: ThreadCategorySchema,
    decoy2Detail: z.string().min(1),
  })
  .refine((t) => t.itemAIsbn13 !== t.itemBIsbn13, {
    message: "pair items must differ",
  })
  .refine(
    (t) =>
      t.decoy1Category !== t.connectionCategory &&
      t.decoy2Category !== t.connectionCategory &&
      t.decoy1Category !== t.decoy2Category,
    {
      message:
        "decoy categories must be distinct from each other and the answer",
    },
  );
export type CommonThread = z.infer<typeof CommonThreadSchema>;
