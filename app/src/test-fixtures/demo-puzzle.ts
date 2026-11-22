import type { CoverTheme } from '@/components/typographic-cover';
import type { DailyPuzzle, GameChoice } from '@/lib/game-engine';

type RoundDetails = {
  isbn13: string;
  title: string;
  author: string;
  publicationYear: number;
  genre: string;
  coverTheme: CoverTheme;
  settingHint: string;
  characterHint: string;
  storyPremise: string;
  premiseShort: string;
  premiseKeywords: string[];
  movieTitle: string;
  releaseYear: number;
  director: string;
  cast: string;
  characters: string;
  streamingProviders: readonly string[];
  moviePosterPath: string | null;
};

const sharedDecoys: GameChoice[] = [
  {
    id: 'dune-premise',
    label: "A young heir fights for control of a desert world's fate.",
  },
  {
    id: 'gatsby-premise',
    label: 'A hopeful outsider chases wealth and a vanished first love.',
  },
  {
    id: 'martian-premise',
    label: 'A stranded astronaut improvises while Earth plans a rescue.',
  },
];

function choices(correctChoice: GameChoice, decoys: readonly GameChoice[]): GameChoice[] {
  return [correctChoice, ...decoys.slice(0, 2)];
}

export const demoPuzzle: DailyPuzzle = {
  id: '14',
  rounds: [
    {
      id: 'blade-runner',
      correctChoiceId: 'blade-runner-premise',
      choices: choices(
        {
          id: 'blade-runner-premise',
          label: 'A weary hunter questions humanity while pursuing engineered fugitives.',
        },
        sharedDecoys
      ),
    },
    {
      id: 'dune',
      correctChoiceId: 'dune-premise',
      choices: choices(sharedDecoys[0], [
        {
          id: 'arrival-premise',
          label: 'A linguist must decode an alien message before conflict erupts.',
        },
        sharedDecoys[2],
      ]),
    },
    {
      id: 'great-gatsby',
      correctChoiceId: 'gatsby-premise',
      choices: choices(sharedDecoys[1], [
        sharedDecoys[2],
        {
          id: 'shutter-premise',
          label: 'Investigators uncover secrets at an isolated island asylum.',
        },
      ]),
    },
    {
      id: 'martian',
      correctChoiceId: 'martian-premise',
      choices: choices(sharedDecoys[2], [
        sharedDecoys[0],
        {
          id: 'hunger-premise',
          label: 'A reluctant rebel becomes the face of a dangerous uprising.',
        },
      ]),
    },
    {
      id: 'shutter-island',
      correctChoiceId: 'shutter-island-premise',
      choices: choices(
        {
          id: 'shutter-island-premise',
          label: 'Investigators uncover secrets at an isolated island asylum.',
        },
        [
          {
            id: 'blade-premise-2',
            label: 'A weary hunter questions humanity while pursuing engineered fugitives.',
          },
          sharedDecoys[1],
        ]
      ),
    },
  ],
  bonus: {
    id: 'dune-martian',
    correctChoiceId: 'setting',
    choices: [
      { id: 'setting', label: 'The Setting — Hostile other worlds' },
      { id: 'author', label: 'The Author — Same writer' },
      { id: 'plot', label: 'The Plot — Time-loop mystery' },
    ],
  },
};

export const demoRoundDetails: Record<string, RoundDetails> = {
  'blade-runner': {
    isbn13: '9780345404473',
    title: 'Do Androids Dream of Electric Sheep?',
    author: 'Philip K. Dick',
    publicationYear: 1968,
    genre: 'Science fiction',
    coverTheme: 'scifi_teal',
    settingHint: 'Dystopian 2019 Los Angeles',
    characterHint: 'A weary detective and an experimental android',
    storyPremise:
      'A weary hunter questions what it means to be human while pursuing dangerous replicants.',
    premiseShort: 'A weary hunter questions humanity while pursuing engineered fugitives.',
    premiseKeywords: ['humanity', 'engineered fugitives'],
    movieTitle: 'Blade Runner',
    releaseYear: 1982,
    director: 'Ridley Scott',
    cast: 'Harrison Ford, Sean Young',
    characters: 'Rick Deckard & Rachael',
    streamingProviders: ['Prime Video', 'Apple TV'],
    moviePosterPath: '/63N9uy8nd9j7Eog2axPQ8lbr3Wj.jpg',
  },
  dune: {
    isbn13: '9780441172719',
    title: 'Dune',
    author: 'Frank Herbert',
    publicationYear: 1965,
    genre: 'Science fiction',
    coverTheme: 'fantasy_plum',
    settingHint: 'A far-future desert planet',
    characterHint: 'A gifted heir and a desert freedom fighter',
    storyPremise: 'A young heir is drawn into a struggle over the fate of a desert world.',
    premiseShort: "A young heir fights for control of a desert world's fate.",
    premiseKeywords: ['desert world', 'young heir'],
    movieTitle: 'Dune: Part One',
    releaseYear: 2021,
    director: 'Denis Villeneuve',
    cast: 'Timothée Chalamet, Rebecca Ferguson',
    characters: 'Paul Atreides & Chani',
    streamingProviders: ['Max', 'Prime Video'],
    moviePosterPath: '/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
  },
  'great-gatsby': {
    isbn13: '9780743273565',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    publicationYear: 1925,
    genre: 'Literary fiction',
    coverTheme: 'literary_terracotta',
    settingHint: 'Jazz Age New York society',
    characterHint: 'A mysterious millionaire and a watchful neighbor',
    storyPremise:
      'A reserved neighbor is pulled into the glittering hopes and secrets of a wealthy outsider.',
    premiseShort: 'A hopeful outsider chases wealth and a vanished first love.',
    premiseKeywords: ['wealth', 'first love'],
    movieTitle: 'The Great Gatsby',
    releaseYear: 2013,
    director: 'Baz Luhrmann',
    cast: 'Leonardo DiCaprio, Tobey Maguire',
    characters: 'Jay Gatsby & Nick Carraway',
    streamingProviders: ['Prime Video'],
    moviePosterPath: null,
  },
  martian: {
    isbn13: '9780553418026',
    title: 'The Martian',
    author: 'Andy Weir',
    publicationYear: 2011,
    genre: 'Science fiction',
    coverTheme: 'scifi_teal',
    settingHint: 'A near-future Mars mission',
    characterHint: 'A stranded botanist and a rescue commander',
    storyPremise:
      'A stranded astronaut must improvise a survival plan while Earth coordinates a distant rescue.',
    premiseShort: 'A stranded astronaut improvises while Earth plans a rescue.',
    premiseKeywords: ['stranded astronaut', 'rescue'],
    movieTitle: 'The Martian',
    releaseYear: 2015,
    director: 'Ridley Scott',
    cast: 'Matt Damon, Jessica Chastain',
    characters: 'Mark Watney & Melissa Lewis',
    streamingProviders: ['Disney+', 'Apple TV'],
    moviePosterPath: '/5BHuvQ6p9kfc091Z8RiFNhCwL4b.jpg',
  },
  'shutter-island': {
    isbn13: '9780061898815',
    title: 'Shutter Island',
    author: 'Dennis Lehane',
    publicationYear: 2003,
    genre: 'Mystery',
    coverTheme: 'thriller_navy',
    settingHint: 'A storm-bound island asylum',
    characterHint: 'A haunted marshal and his methodical partner',
    storyPremise:
      'Two investigators uncover unsettling secrets while stranded at an isolated island hospital.',
    premiseShort: 'Investigators uncover secrets at an isolated island asylum.',
    premiseKeywords: ['island asylum', 'secrets'],
    movieTitle: 'Shutter Island',
    releaseYear: 2010,
    director: 'Martin Scorsese',
    cast: 'Leonardo DiCaprio, Mark Ruffalo',
    characters: 'Teddy Daniels & Chuck Aule',
    streamingProviders: ['Paramount+', 'Apple TV'],
    moviePosterPath: null,
  },
};

export const bonusBooks = [demoRoundDetails.dune, demoRoundDetails.martian] as const;
