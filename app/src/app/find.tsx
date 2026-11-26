import { Alert } from 'react-native';

import {
  findExistingLibraryMatch,
  SHELF_LABELS,
  type BookCandidate,
} from '@/data/library-data';
import { useLibrary } from '@/providers/app-data-provider';
import { AddBookContent } from './library';

export default function FindScreen() {
  const { books, removeBook, saveBook } = useLibrary();

  const addBook = (candidate: BookCandidate) => {
    const existing = findExistingLibraryMatch(books, candidate);

    if (existing) {
      if (!existing.tmdbId && !existing.movieTitle && (candidate.tmdbId || candidate.movieTitle)) {
        Alert.alert(
          'Update saved book?',
          `“${existing.title}” is already on your shelf without adaptation details. Replace that entry with the matching adapted edition?`,
          [
            { text: 'Keep existing', style: 'cancel' },
            {
              text: 'Update',
              onPress: () => {
                if (existing.isbn13 !== candidate.isbn13) removeBook(existing.isbn13);
                saveBook(candidate, existing.status);
              },
            },
          ]
        );
        return;
      }
      Alert.alert(
        'Already in your library',
        `“${existing.title}” is already on your shelf as ${SHELF_LABELS[
          existing.status
        ].toLowerCase()}.`,
        [{ text: 'OK' }]
      );
      return;
    }

    saveBook(candidate);
  };

  return (
    <AddBookContent
      isBookAdded={(candidate) => Boolean(findExistingLibraryMatch(books, candidate))}
      onAdd={addBook}
    />
  );
}
