import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdaptationPractice } from '@/components/adaptation-practice';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Depth, Spacing } from '@/constants/theme';
import { normalizeIsbn13, practiceDeepLink, practiceWebUrl } from '@/lib/practice-sharing';

export default function SharedPracticeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    isbn?: string;
    title?: string;
    author?: string;
    tmdbId?: string;
  }>();
  const isbn13 = normalizeIsbn13(typeof params.isbn === 'string' ? params.isbn : '');
  const title = typeof params.title === 'string' ? params.title : '';
  const author = typeof params.author === 'string' ? params.author : '';
  const tmdbId =
    typeof params.tmdbId === 'string' && /^\d+$/.test(params.tmdbId)
      ? Number(params.tmdbId)
      : undefined;
  const [closed, setClosed] = useState(false);

  const close = () => {
    if (Platform.OS !== 'web' && router.canGoBack()) {
      router.back();
      return;
    }
    setClosed(true);
  };
  const openFullApp = () => {
    if (Platform.OS === 'web') router.replace('/');
  };
  const shareAgain = async () => {
    if (!isbn13) return;
    await Share.share({
      message: `Can you identify the one-line premise for ${title || 'this book-to-screen story'}? Play: ${practiceWebUrl(isbn13, title, author, tmdbId)}`,
      url: practiceWebUrl(isbn13, title, author, tmdbId),
      title: `Play ${title || 'Adaptle'}`,
    });
  };
  const pageTitle = title ? `Play ${title} — Adaptle` : 'Play an Adaptle adaptation';

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta
          content={
            author
              ? `Can you identify the premise for ${title} by ${author}?`
              : 'Can you identify this book-to-screen premise?'
          }
          name="description"
        />
        <meta content={pageTitle} property="og:title" />
        <meta
          content="Choose the one-line premise that connects the book and its screen adaptation."
          property="og:description"
        />
        <meta content="website" property="og:type" />
      </Head>
      <ThemedView style={styles.root}>
        <SafeAreaView style={styles.safeArea}>
          {isbn13 && closed ? (
            <View style={styles.invalid}>
              <ThemedText type="smallBold" style={styles.eyebrow}>
                CHALLENGE COMPLETE
              </ThemedText>
              <ThemedText type="subtitle" style={styles.centered}>
                Thanks for playing
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
                Challenge someone else, replay this adaptation, or explicitly open the full Adaptle
                app.
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={() => void shareAgain()}
                style={styles.primaryButton}>
                <ThemedText type="smallBold" style={styles.lightText}>
                  Share this practice
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setClosed(false)}
                style={styles.openAppButton}>
                <ThemedText type="smallBold" style={styles.openAppText}>
                  Play again
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={openFullApp}
                style={styles.openAppButton}>
                <ThemedText type="smallBold" style={styles.openAppText}>
                  Open full Adaptle
                </ThemedText>
              </Pressable>
            </View>
          ) : isbn13 ? (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <ThemedText type="smallBold" style={styles.eyebrow}>
                  ADAPTLE CHALLENGE
                </ThemedText>
                <ThemedText type="subtitle">Identify the story premise</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
                  Play directly here—no account or app install is required.
                </ThemedText>
              </View>
              {Platform.OS === 'web' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    void Linking.openURL(practiceDeepLink(isbn13, title, author, tmdbId))
                  }
                  style={styles.openAppButton}>
                  <ThemedText type="smallBold" style={styles.openAppText}>
                    Open in Adaptle app
                  </ThemedText>
                </Pressable>
              ) : null}
              <AdaptationPractice
                author={author}
                isbn13={isbn13}
                onClose={close}
                title={title}
                tmdbId={tmdbId}
              />
            </ScrollView>
          ) : (
            <View style={styles.invalid}>
              <ThemedText type="subtitle">Practice link unavailable</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
                This link is missing a valid ISBN-13. Ask the sender to share the practice again.
              </ThemedText>
              <Pressable accessibilityRole="button" onPress={close} style={styles.openAppButton}>
                <ThemedText type="smallBold" style={styles.openAppText}>
                  Open Adaptle
                </ThemedText>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1 },
  safeArea: { flex: 1, width: '100%' },
  scrollContent: { alignSelf: 'center', gap: Spacing.three, maxWidth: 800, padding: Spacing.four },
  header: { gap: Spacing.one },
  eyebrow: { color: '#117579', letterSpacing: 1.2 },
  description: { lineHeight: 20 },
  openAppButton: {
    ...Depth.surface,
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: '#173E32',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  openAppText: { color: '#173E32' },
  primaryButton: {
    ...Depth.raised,
    alignItems: 'center',
    backgroundColor: '#173E32',
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  lightText: { color: '#FFFFFF' },
  centered: { textAlign: 'center' },
  invalid: {
    alignItems: 'center',
    alignSelf: 'center',
    flex: 1,
    gap: Spacing.three,
    justifyContent: 'center',
    maxWidth: 560,
    padding: Spacing.four,
  },
});
