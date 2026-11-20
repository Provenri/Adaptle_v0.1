import {
  BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
  type PermissionResponse,
} from 'expo-camera';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TypographicCover } from '@/components/typographic-cover';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { providerNames, useTmdbProviders } from '@/hooks/use-tmdb-providers';
import {
  SHELF_LABELS,
  type BookCandidate,
  type LibraryBook,
  type ShelfStatus,
} from '@/data/library-data';
import { searchBookCatalog } from '@/lib/supabase';
import { useLibrary } from '@/providers/app-data-provider';
import { PrivacyPolicyContent } from './privacy';

type ShelfFilter = ShelfStatus | 'ALL';

export default function LibraryScreen() {
  const { books, isLibraryLoading, libraryError, removeBook, saveBook, updateStatus } =
    useLibrary();
  const [filter, setFilter] = useState<ShelfFilter>('ALL');
  const [query, setQuery] = useState('');
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const counts = useMemo(
    () => ({
      TO_BE_READ: books.filter((book) => book.status === 'TO_BE_READ').length,
      FINISHED: books.filter((book) => book.status === 'FINISHED').length,
      SNOOZE: books.filter((book) => book.status === 'SNOOZE').length,
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

  const addBook = (candidate: BookCandidate) => {
    saveBook(candidate);
    setAddBookOpen(false);
    setFilter('ALL');
    setQuery('');
  };

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.headingRow}>
            <View>
              <ThemedText type="smallBold" style={styles.eyebrow}>
                YOUR SHELF
              </ThemedText>
              <ThemedText type="subtitle">My Library</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {books.length} {books.length === 1 ? 'book' : 'books'} saved ·{' '}
                {books.filter((book) => book.movieTitle).length}{' '}
                {books.filter((book) => book.movieTitle).length === 1
                  ? 'screen adaptation'
                  : 'screen adaptations'}
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setAddBookOpen(true)}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.lightText}>
                + Add Book
              </ThemedText>
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
                label={SHELF_LABELS[status]}
                selected={filter === status}
                onPress={() => setFilter(status)}
              />
            ))}
          </View>

          <TextInput
            accessibilityLabel="Search my shelf"
            onChangeText={setQuery}
            placeholder="Search my shelf…"
            placeholderTextColor="#737B78"
            style={styles.searchInput}
            value={query}
          />

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
                />
              ))}
            </View>
          ) : (
            <EmptyShelf query={query} onAdd={() => setAddBookOpen(true)} />
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => setPrivacyOpen(true)}
            style={styles.privacyLink}>
            <ThemedText type="small" themeColor="textSecondary">
              Privacy Policy
            </ThemedText>
          </Pressable>
        </ScrollView>

        <AddBookModal onAdd={addBook} onClose={() => setAddBookOpen(false)} visible={addBookOpen} />
        <Modal
          animationType="slide"
          onRequestClose={() => setPrivacyOpen(false)}
          presentationStyle="fullScreen"
          visible={privacyOpen}>
          <PrivacyPolicyContent onBack={() => setPrivacyOpen(false)} />
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
        style={selected ? styles.filterButtonSelectedText : styles.filterButtonText}>
        {label} {count}
      </ThemedText>
    </Pressable>
  );
}

function LibraryBookCard({
  book,
  onStatusChange,
  onRemove,
}: {
  book: LibraryBook;
  onStatusChange: (status: ShelfStatus) => void;
  onRemove: () => void;
}) {
  const [editingStatus, setEditingStatus] = useState(false);
  const providers = useTmdbProviders(book.tmdbId);
  const providerList = providerNames(providers.data);

  return (
    <View style={styles.bookCard}>
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
                🎬 {book.movieTitle} ({book.movieYear})
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
        <ThemedText type="small" themeColor="textSecondary">
          Status
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Change status for ${book.title}`}
          onPress={() => setEditingStatus((current) => !current)}
          style={({ pressed }) => [styles.statusButton, pressed && styles.pressed]}>
          <ThemedText type="smallBold">{SHELF_LABELS[book.status]} ▾</ThemedText>
        </Pressable>
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
                  {book.status === status ? '✓ ' : ''}
                  {SHELF_LABELS[status]}
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

function EmptyShelf({ query, onAdd }: { query: string; onAdd: () => void }) {
  return (
    <View style={styles.emptyState}>
      <ThemedText style={styles.emptyIcon}>📚 + 🎬</ThemedText>
      <ThemedText type="subtitle" style={styles.centered}>
        {query ? 'No matching books' : 'Your reading shelf is empty'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        {query
          ? 'Try another title or author, or add a book manually.'
          : 'Play today’s puzzle to discover books and save your favorites in one tap.'}
      </ThemedText>
      <Pressable accessibilityRole="button" onPress={onAdd} style={styles.emptyButton}>
        <ThemedText type="smallBold" style={styles.lightText}>
          Search or scan a book
        </ThemedText>
      </Pressable>
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
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const searchQuery = useQuery({
    queryKey: ['book-search', query.trim()],
    queryFn: () => searchBookCatalog(query.trim()),
    enabled: visible && query.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
  });
  const results = searchQuery.data ?? [];

  const startScanning = async () => {
    setScanError(null);
    const response: PermissionResponse | undefined = permission?.granted
      ? permission
      : await requestPermission();
    if (response?.granted) setScanning(true);
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
                <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
                  <ThemedText type="subtitle">×</ThemedText>
                </Pressable>
              </View>
              <TextInput
                accessibilityLabel="Search book catalog"
                autoFocus
                onChangeText={setQuery}
                placeholder="Title, author, or ISBN…"
                placeholderTextColor="#737B78"
                style={styles.searchInput}
                value={query}
              />
              <Pressable
                accessibilityRole="button"
                onPress={startScanning}
                style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.lightText}>
                  Scan ISBN barcode
                </ThemedText>
              </Pressable>
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
                  <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                    Searching the catalog…
                  </ThemedText>
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
                      </ThemedText>
                    </View>
                    <ThemedText type="smallBold" style={styles.addResult}>
                      + Add
                    </ThemedText>
                  </Pressable>
                ))}
                {!searchQuery.isFetching &&
                !searchQuery.isError &&
                query.trim().length >= 2 &&
                results.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                    No books found. Check the title, author, or ISBN.
                  </ThemedText>
                ) : null}
              </ScrollView>
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
    gap: Spacing.four,
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: { color: '#117579', letterSpacing: 1.4 },
  addButton: {
    backgroundColor: '#173E32',
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  filterButton: {
    borderColor: '#CCD2CF',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  filterButtonSelected: { backgroundColor: '#173E32', borderColor: '#173E32' },
  filterButtonText: { color: '#173E32' },
  filterButtonSelectedText: { color: '#FFFFFF' },
  searchInput: {
    backgroundColor: '#F4EEE6',
    borderRadius: 14,
    color: '#1B2924',
    fontSize: 16,
    padding: Spacing.three,
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
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  removeButton: {
    borderColor: '#A84732',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  removeText: { color: '#A84732' },
  statusOption: {
    backgroundColor: '#E8E1D7',
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  emptyState: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  emptyIcon: { fontSize: 48, lineHeight: 58 },
  centered: { textAlign: 'center' },
  emptyButton: {
    backgroundColor: '#173E32',
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  modalRoot: { flex: 1 },
  modalSafeArea: { flex: 1 },
  modalContent: {
    flex: 1,
    gap: Spacing.three,
    padding: Spacing.four,
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
    paddingVertical: Spacing.four,
  },
  errorText: { color: '#A84732', textAlign: 'center' },
  lightText: { color: '#FFFFFF' },
  darkText: { color: '#173E32' },
  pressed: { opacity: 0.65 },
});
