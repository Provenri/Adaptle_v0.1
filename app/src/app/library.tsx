import {
  BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
  type PermissionResponse,
} from 'expo-camera';
import { Link, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TypographicCover } from '@/components/typographic-cover';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { OpenBookArchAppIcon } from '@/components/OpenBookArchAppIcon';
import { TabFindIcon } from '@/components/tab-icons';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { providerNames, useTmdbProviders } from '@/hooks/use-tmdb-providers';
import {
  findExistingLibraryMatch,
  hasPlayableAdaptation,
  SHELF_LABELS,
  type BookCandidate,
  type LibraryBook,
  type ShelfStatus,
} from '@/data/library-data';
import { getSurpriseBook, searchBookCatalog } from '@/lib/supabase';
import { useLibrary } from '@/providers/app-data-provider';
import { PrivacyPolicyContent } from './privacy';
import { AdaptationPractice } from '@/components/adaptation-practice';

type ShelfFilter = ShelfStatus | 'ALL';

type LibraryScreenProps = {
  initialAddBookOpen?: boolean;
  onAddBookClose?: () => void;
};

export default function LibraryScreen({
  initialAddBookOpen = false,
  onAddBookClose,
}: LibraryScreenProps = {}) {
  const { books, isLibraryLoading, libraryError, removeBook, saveBook, updateStatus } =
    useLibrary();
  const [filter, setFilter] = useState<ShelfFilter>('ALL');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [addBookOpen, setAddBookOpen] = useState(initialAddBookOpen);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [practiceBook, setPracticeBook] = useState<{
    isbn13: string;
    title: string;
    author: string;
    tmdbId?: number;
  } | null>(null);
  const counts = useMemo(
    () => ({
      TO_BE_READ: books.filter((book) => book.status === 'TO_BE_READ').length,
      FINISHED: books.filter((book) => book.status === 'FINISHED').length,
      READING: books.filter((book) => book.status === 'READING').length,
    }),
    [books]
  );
  const visibleBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return books.filter(
      (book) =>
        (filter === 'ALL' || book.status === filter) &&
        (!normalizedQuery || `${book.title} ${book.author}`.toLowerCase().includes(normalizedQuery))
    );
  }, [books, filter, query]);

  const closeAddBook = () => {
    setAddBookOpen(false);
    onAddBookClose?.();
  };

  const addBook = (candidate: BookCandidate) => {
    const existing = findExistingLibraryMatch(books, candidate);
    const finishAdding = () => {
      closeAddBook();
      setFilter('ALL');
      setQuery('');
    };

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
                finishAdding();
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
    finishAdding();
  };

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.headingRow}>
            <View style={styles.brandRow}>
              <OpenBookArchAppIcon size={56} />
              <View style={styles.headingCopy}>
                <View style={styles.headingEyebrowRow}>
                  <ThemedText type="smallBold" style={styles.eyebrow}>
                    YOUR SHELF
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.playableCount}>
                    {books.filter((book) => book.movieTitle).length} playable
                  </ThemedText>
                </View>
                <ThemedText type="subtitle" style={styles.title}>
                  My Library
                </ThemedText>
              </View>
            </View>
            <Pressable
              accessibilityLabel={searchOpen ? 'Close search my library' : 'Search my library'}
              accessibilityRole="button"
              accessibilityState={{ expanded: searchOpen }}
              onPress={() => {
                setSearchOpen((open) => !open);
                if (searchOpen) setQuery('');
              }}
              style={({ pressed }) => [styles.librarySearchButton, pressed && styles.pressed]}>
              <TabFindIcon color="#163C32" size={28} />
            </Pressable>
          </View>

          <View style={styles.filters}>
            <ShelfFilterButton
              count={books.length}
              label="All"
              selected={filter === 'ALL'}
              onPress={() => setFilter('ALL')}
            />
            {(Object.keys(SHELF_LABELS) as ShelfStatus[]).map((status) => (
              <ShelfFilterButton
                count={counts[status]}
                key={status}
                label={
                  status === 'TO_BE_READ'
                    ? 'To read'
                    : status === 'READING'
                      ? 'Reading'
                      : 'Finished'
                }
                selected={filter === status}
                onPress={() => setFilter(status)}
              />
            ))}
          </View>

          {searchOpen ? (
            <View style={styles.shelfSearchRow}>
              <TextInput
                accessibilityLabel="Search my library"
                autoFocus
                onChangeText={setQuery}
                placeholder="Search my shelf…"
                placeholderTextColor="#60646C"
                style={[styles.searchInput, styles.shelfSearchInput]}
                value={query}
              />
              <Pressable
                accessibilityLabel="Clear and close shelf search"
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  setSearchOpen(false);
                }}
                style={styles.shelfSearchClose}>
                <ThemedText type="subtitle">×</ThemedText>
              </Pressable>
            </View>
          ) : null}

          {isLibraryLoading && books.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              Loading your shelf…
            </ThemedText>
          ) : libraryError && books.length === 0 ? (
            <View style={styles.emptyState}>
              <ThemedText type="small" accessibilityRole="alert" style={styles.errorText}>
                {libraryError}
              </ThemedText>
            </View>
          ) : visibleBooks.length > 0 ? (
            <View style={styles.bookList}>
              {visibleBooks.map((book) => (
                <LibraryBookCard
                  book={book}
                  key={book.isbn13}
                  onStatusChange={(status) => updateStatus(book.isbn13, status)}
                  onRemove={() =>
                    Alert.alert(
                      'Remove from library?',
                      `Remove “${book.title}” from your shelf? You can add it again later.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => removeBook(book.isbn13),
                        },
                      ]
                    )
                  }
                  onPractice={
                    hasPlayableAdaptation(book)
                      ? () =>
                          setPracticeBook({
                            isbn13: book.isbn13,
                            title: book.title,
                            author: book.author,
                            tmdbId: book.tmdbId,
                          })
                      : undefined
                  }
                />
              ))}
            </View>
          ) : (
            <EmptyShelf query={query} />
          )}
          <View style={styles.legalLinks}>
            <Link href={'/impressum' as Href} style={styles.legalLink}>
              <ThemedText type="small" themeColor="textSecondary">
                Impressum
              </ThemedText>
            </Link>
            <Link href={'/contact' as Href} style={styles.legalLink}>
              <ThemedText type="small" themeColor="textSecondary">
                Contact
              </ThemedText>
            </Link>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPrivacyOpen(true)}
              style={styles.privacyLink}>
              <ThemedText type="small" themeColor="textSecondary">
                Privacy Policy
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>

        <AddBookModal onAdd={addBook} onClose={closeAddBook} visible={addBookOpen} />
        <Modal
          animationType="slide"
          onRequestClose={() => setPrivacyOpen(false)}
          presentationStyle="fullScreen"
          visible={privacyOpen}>
          <PrivacyPolicyContent onBack={() => setPrivacyOpen(false)} />
        </Modal>
        <Modal
          animationType="slide"
          onRequestClose={() => setPracticeBook(null)}
          presentationStyle="fullScreen"
          visible={practiceBook !== null}>
          {practiceBook ? (
            <SafeAreaView style={styles.modalSafeArea}>
              <AdaptationPractice
                isbn13={practiceBook.isbn13}
                title={practiceBook.title}
                author={practiceBook.author}
                tmdbId={practiceBook.tmdbId}
                onClose={() => setPracticeBook(null)}
              />
            </SafeAreaView>
          ) : null}
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

function ShelfFilterButton({
  count,
  label,
  selected,
  onPress,
}: {
  count: number;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} ${count}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterButton,
        selected && styles.filterButtonSelected,
        pressed && styles.pressed,
      ]}>
      <ThemedText
        type="smallBold"
        style={selected ? styles.filterButtonSelectedText : styles.filterButtonText}
        numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="small" style={selected ? styles.filterCountSelected : styles.filterCount}>
        {count}
      </ThemedText>
    </Pressable>
  );
}

function LibraryBookCard({
  book,
  onStatusChange,
  onRemove,
  onPractice,
}: {
  book: LibraryBook;
  onStatusChange: (status: ShelfStatus) => void;
  onRemove: () => void;
  onPractice?: () => void;
}) {
  const [editingStatus, setEditingStatus] = useState(false);
  const providers = useTmdbProviders(book.tmdbId);
  const providerList = providerNames(providers.data);

  return (
    <View style={styles.bookCard} testID={`library-book-${book.isbn13}`}>
      <View style={styles.bookCardTop}>
        <TypographicCover
          author={book.author}
          coverTheme={book.coverTheme}
          genre={book.genre}
          title={book.title}
          width={92}
        />
        <View style={styles.bookCopy}>
          <ThemedText type="default" style={styles.bookTitle}>
            {book.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {book.author}
            {book.publicationYear ? ` · ${book.publicationYear}` : ''}
          </ThemedText>
          {book.movieTitle ? (
            <>
              <ThemedText type="small" style={styles.adaptation}>
                🎬 {book.movieTitle}
                {book.movieYear ? ` (${book.movieYear})` : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                📺{' '}
                {providerList.length > 0
                  ? providerList.join(', ')
                  : providers.isPending
                    ? 'Loading providers…'
                    : 'Unavailable offline'}
              </ThemedText>
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Added manually · No known adaptation
            </ThemedText>
          )}
        </View>
      </View>
      <View style={styles.statusRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Change status for ${book.title}`}
          onPress={() => setEditingStatus((current) => !current)}
          style={({ pressed }) => [styles.statusButton, pressed && styles.pressed]}>
          <ThemedText type="smallBold">
            {book.status === 'READING'
              ? 'Reading'
              : book.status === 'FINISHED'
                ? 'Finished'
                : 'To read'}{' '}
            ▾
          </ThemedText>
        </Pressable>
        {onPractice ? (
          <Pressable
            accessibilityRole="button"
            onPress={onPractice}
            style={({ pressed }) => [styles.practiceButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.practiceButtonText}>
              🎬 Play adaptation
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      {editingStatus ? (
        <View style={styles.statusMenu}>
          <View style={styles.statusOptions}>
            {(Object.keys(SHELF_LABELS) as ShelfStatus[]).map((status) => (
              <Pressable
                accessibilityRole="button"
                key={status}
                onPress={() => {
                  onStatusChange(status);
                  setEditingStatus(false);
                }}
                style={({ pressed }) => [styles.statusOption, pressed && styles.pressed]}>
                <ThemedText type="small" style={styles.darkText}>
                  {status === 'TO_BE_READ'
                    ? 'To read'
                    : status === 'READING'
                      ? 'Reading'
                      : 'Finished'}
                </ThemedText>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={onRemove}
              style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.removeText}>
                Remove
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function EmptyShelf({ query }: { query: string }) {
  return (
    <View style={styles.emptyState}>
      <ThemedText style={styles.emptyIcon}>📚 + 🎬</ThemedText>
      <ThemedText type="subtitle" style={styles.centered}>
        {query ? 'No matching books' : 'Your reading shelf is empty'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        {query
          ? 'Try another title or author, or use Find to add a book.'
          : 'Use Find to search or scan a book, or save favorites while playing the daily puzzle.'}
      </ThemedText>
    </View>
  );
}

function AddBookModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (candidate: BookCandidate) => void;
}) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [surpriseBook, setSurpriseBook] = useState<BookCandidate | null>(null);
  const [isSurprising, setIsSurprising] = useState(false);
  const [searchVersion, setSearchVersion] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [adaptationsOnly, setAdaptationsOnly] = useState(false);
  const [popularOnly, setPopularOnly] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const searchQuery = useQuery({
    queryKey: ['book-search', submittedQuery, adaptationsOnly, popularOnly, searchVersion],
    queryFn: () => searchBookCatalog(submittedQuery, adaptationsOnly, popularOnly),
    enabled: visible && submittedQuery.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
  const results = (surpriseBook ? [surpriseBook] : (searchQuery.data ?? []))
    .filter((candidate) => Boolean(surpriseBook) || !adaptationsOnly || candidate.hasAdaptation)
    .filter((candidate) => Boolean(surpriseBook) || !popularOnly || candidate.isPopular)
    .filter(
      (candidate, index, all) => all.findIndex((item) => item.isbn13 === candidate.isbn13) === index
    );

  const startScanning = async () => {
    setScanError(null);
    const response: PermissionResponse | undefined = permission?.granted
      ? permission
      : await requestPermission();
    if (response?.granted) setScanning(true);
  };

  const submitSearch = () => {
    if (query.trim().length < 2) return;
    setSurpriseBook(null);
    setSubmittedQuery(query.trim());
    setSearchVersion((version) => version + 1);
  };

  const showSurpriseBook = async () => {
    setIsSurprising(true);
    setScanError(null);
    try {
      const candidate = await getSurpriseBook();
      if (candidate) {
        setSurpriseBook(candidate);
        setSubmittedQuery('');
      } else {
        setScanError('No surprise adaptation is available right now.');
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Surprise search failed.');
    } finally {
      setIsSurprising(false);
    }
  };

  const handleBarcode = async ({ data }: BarcodeScanningResult) => {
    setScanning(false);
    const isbn13 = data.replace(/[^0-9]/g, '');
    setQuery(isbn13);
    try {
      const candidates = await searchBookCatalog(isbn13);
      if (candidates[0]) {
        onAdd(candidates[0]);
      } else {
        setScanError('No book was found for that ISBN.');
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'ISBN lookup failed.');
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}>
      <ThemedView style={styles.modalRoot}>
        <SafeAreaView style={styles.modalSafeArea}>
          {scanning ? (
            <View style={styles.cameraContainer}>
              <CameraView
                barcodeScannerSettings={{ barcodeTypes: ['ean13'] }}
                onBarcodeScanned={handleBarcode}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.cameraOverlay}>
                <ThemedText type="subtitle" style={styles.cameraTitle}>
                  Scan an ISBN-13 barcode
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setScanning(false)}
                  style={styles.cameraClose}>
                  <ThemedText type="smallBold" style={styles.lightText}>
                    Cancel scan
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.modalContent}>
              <View style={styles.modalHeading}>
                <View>
                  <ThemedText type="smallBold" style={styles.eyebrow}>
                    MANUAL SHELF ADD
                  </ThemedText>
                  <ThemedText type="subtitle">Add a book</ThemedText>
                </View>
                <Pressable
                  accessibilityLabel="Close Add Book"
                  accessibilityRole="button"
                  onPress={onClose}
                  style={styles.closeButton}>
                  <ThemedText type="subtitle">×</ThemedText>
                </Pressable>
              </View>
              <View style={styles.searchRow}>
                <TextInput
                  accessibilityLabel="Search book catalog"
                  autoFocus
                  onChangeText={setQuery}
                  placeholder="Title, author, or ISBN…"
                  placeholderTextColor="#60646C"
                  returnKeyType="search"
                  onSubmitEditing={submitSearch}
                  style={[styles.searchInput, styles.modalSearchInput]}
                  value={query}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: query.trim().length < 2 }}
                  onPress={submitSearch}
                  style={({ pressed }) => [
                    styles.searchButton,
                    query.trim().length < 2 && styles.disabledButton,
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="smallBold" style={styles.lightText}>
                    Search
                  </ThemedText>
                </Pressable>
              </View>
              <View style={styles.searchFilters}>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: adaptationsOnly }}
                  accessibilityLabel="Show search results with screen adaptations only"
                  onPress={() => {
                    setSurpriseBook(null);
                    setAdaptationsOnly((current) => !current);
                  }}
                  style={({ pressed }) => [styles.adaptationToggle, pressed && styles.pressed]}>
                  <ThemedText type="smallBold" style={styles.adaptationToggleText}>
                    Adaptations only
                  </ThemedText>
                  <View style={[styles.toggleTrack, adaptationsOnly && styles.toggleTrackActive]}>
                    <View
                      style={[styles.toggleThumb, adaptationsOnly && styles.toggleThumbActive]}
                    />
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: popularOnly }}
                  accessibilityLabel="Show popular books only"
                  onPress={() => {
                    setSurpriseBook(null);
                    setPopularOnly((current) => !current);
                  }}
                  style={({ pressed }) => [styles.adaptationToggle, pressed && styles.pressed]}>
                  <ThemedText type="smallBold" style={styles.adaptationToggleText}>
                    Popular only
                  </ThemedText>
                  <View style={[styles.toggleTrack, popularOnly && styles.toggleTrackActive]}>
                    <View style={[styles.toggleThumb, popularOnly && styles.toggleThumbActive]} />
                  </View>
                </Pressable>
              </View>
              {permission?.granted === false && (
                <ThemedText type="small" style={styles.permissionText}>
                  Camera permission is required to scan. You can still search above.
                </ThemedText>
              )}
              {scanError ? (
                <ThemedText accessibilityRole="alert" type="small" style={styles.errorText}>
                  {scanError}
                </ThemedText>
              ) : null}
              <ScrollView contentContainerStyle={styles.results}>
                {searchQuery.isFetching ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color="#117579" size="small" />
                    <ThemedText type="small" themeColor="textSecondary">
                      Searching the catalog…
                    </ThemedText>
                  </View>
                ) : null}
                {searchQuery.isError ? (
                  <ThemedText accessibilityRole="alert" type="small" style={styles.errorText}>
                    {searchQuery.error instanceof Error
                      ? searchQuery.error.message
                      : 'Book search failed.'}
                  </ThemedText>
                ) : null}
                {results.map((candidate) => (
                  <Pressable
                    accessibilityRole="button"
                    key={candidate.isbn13}
                    onPress={() => onAdd(candidate)}
                    style={({ pressed }) => [styles.resultCard, pressed && styles.pressed]}>
                    <TypographicCover
                      author={candidate.author}
                      coverTheme={candidate.coverTheme}
                      genre={candidate.genre}
                      title={candidate.title}
                      width={62}
                    />
                    <View style={styles.resultCopy}>
                      <ThemedText type="smallBold">{candidate.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {candidate.author}
                        {candidate.publicationYear ? ` · ${candidate.publicationYear}` : ''}
                      </ThemedText>
                      {candidate.hasAdaptation ? (
                        <ThemedText
                          numberOfLines={1}
                          type="smallBold"
                          style={styles.adaptationBadge}>
                          🎬 Screen adaptation
                        </ThemedText>
                      ) : null}
                    </View>
                    <ThemedText type="smallBold" style={styles.addResult}>
                      + Add
                    </ThemedText>
                  </Pressable>
                ))}
                {!searchQuery.isFetching &&
                !searchQuery.isError &&
                submittedQuery.length >= 2 &&
                results.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                    No books found. Check the title, author, or ISBN.
                  </ThemedText>
                ) : null}
              </ScrollView>
              <Pressable
                accessibilityRole="button"
                onPress={() => void showSurpriseBook()}
                style={({ pressed }) => [styles.surpriseButton, pressed && styles.pressed]}>
                {isSurprising ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <ThemedText type="smallBold" style={styles.lightText}>
                    🎲 Surprise me
                  </ThemedText>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={startScanning}
                style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.lightText}>
                  Scan ISBN barcode
                </ThemedText>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, maxWidth: MaxContentWidth, width: '100%' },
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  brandRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    flex: 1,
    minWidth: 0,
  },
  headingCopy: {
    flex: 1,
    marginTop: -Spacing.half,
    minWidth: 0,
    flexShrink: 1,
  },
  headingEyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  eyebrow: { color: '#117579', letterSpacing: 1.4 },
  playableCount: { fontSize: 12, lineHeight: 16 },
  title: { marginTop: Spacing.half },
  librarySearchButton: {
    alignItems: 'center',
    borderRadius: 22,
    flexShrink: 0,
    height: 44,
    justifyContent: 'center',
    transform: [{ translateY: 6 }],
    width: 44,
  },
  filters: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: -Spacing.one,
  },
  adaptationToggle: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  searchFilters: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  adaptationToggleText: {
    color: '#173E32',
  },
  toggleTrack: {
    backgroundColor: '#C8CECB',
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    padding: 2,
    width: 42,
  },
  toggleTrackActive: {
    backgroundColor: '#173E32',
  },
  toggleThumb: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 20,
    width: 20,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D9DFDB',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
  },
  filterButtonSelected: { backgroundColor: '#173E32', borderColor: '#173E32' },
  filterButtonText: { color: '#173E32', fontSize: 13, lineHeight: 16, textAlign: 'center' },
  filterButtonSelectedText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
  filterCount: {
    color: '#60646C',
    fontSize: 12,
    lineHeight: 14,
    textAlign: 'center',
  },
  filterCountSelected: {
    color: '#DCEBE5',
    fontSize: 12,
    lineHeight: 14,
    textAlign: 'center',
  },
  searchInput: {
    backgroundColor: '#F4EEE6',
    borderRadius: 14,
    color: '#1B2924',
    fontSize: 16,
    padding: Spacing.three,
  },
  shelfSearchRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  shelfSearchInput: { flex: 1 },
  shelfSearchClose: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 40,
  },
  bookList: { gap: Spacing.three },
  bookCard: {
    backgroundColor: '#F8F4EE',
    borderRadius: 18,
    gap: Spacing.three,
    padding: Spacing.three,
  },
  bookCardTop: { flexDirection: 'row', gap: Spacing.three },
  bookCopy: { flex: 1, gap: Spacing.one },
  bookTitle: { color: '#173E32', fontWeight: '700' },
  adaptation: { color: '#A84732', marginTop: Spacing.one },
  statusRow: {
    alignItems: 'center',
    borderTopColor: '#E0D8CF',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  practiceButton: {
    backgroundColor: '#117579',
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  practiceButtonText: { color: '#FFFFFF' },
  statusButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  statusMenu: { gap: Spacing.two },
  statusOptions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.one,
  },
  removeButton: {
    alignItems: 'center',
    borderColor: '#A84732',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 1,
    paddingVertical: Spacing.one,
  },
  removeText: { color: '#A84732' },
  statusOption: {
    alignItems: 'center',
    backgroundColor: '#E8E1D7',
    borderRadius: 999,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 1,
    paddingVertical: Spacing.one,
  },
  emptyState: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  emptyIcon: { fontSize: 48, lineHeight: 58 },
  centered: { textAlign: 'center' },
  modalRoot: { flex: 1 },
  modalSafeArea: { flex: 1 },
  modalContent: {
    flex: 1,
    gap: Spacing.three,
    padding: Spacing.four,
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  modalSearchInput: {
    flex: 1,
    minWidth: 0,
  },
  searchButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#117579',
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  disabledButton: {
    opacity: 0.45,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    padding: Spacing.three,
  },
  modalHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  closeButton: { padding: Spacing.two },
  scanButton: {
    alignItems: 'center',
    backgroundColor: '#117579',
    borderRadius: 999,
    padding: Spacing.three,
  },
  surpriseButton: {
    alignItems: 'center',
    backgroundColor: '#A84732',
    borderRadius: 999,
    minHeight: 48,
    justifyContent: 'center',
    padding: Spacing.three,
  },
  results: { gap: Spacing.three, paddingBottom: Spacing.six },
  resultCard: {
    alignItems: 'center',
    backgroundColor: '#F8F4EE',
    borderRadius: 14,
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.two,
  },
  resultCopy: { flex: 1, gap: Spacing.one },
  adaptationBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E6F1ED',
    borderRadius: 999,
    color: '#117579',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    flexShrink: 0,
  },
  addResult: { color: '#117579', padding: Spacing.two },
  cameraContainer: { backgroundColor: '#000000', flex: 1 },
  cameraOverlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
    padding: Spacing.four,
  },
  cameraTitle: { color: '#FFFFFF', textAlign: 'center' },
  cameraClose: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  permissionText: { color: '#A84732' },
  privacyLink: {
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  legalLinks: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingTop: Spacing.two,
  },
  legalLink: { color: '#60646C', fontSize: 14, padding: Spacing.two },
  errorText: { color: '#A84732', textAlign: 'center' },
  lightText: { color: '#FFFFFF' },
  darkText: { color: '#173E32' },
  pressed: { opacity: 0.65 },
});
