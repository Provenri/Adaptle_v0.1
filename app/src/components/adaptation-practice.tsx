import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PremiseQuestion } from './premise-question';
import { StoryPremise } from './story-premise';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { fetchAdaptationPractice } from '@/lib/daily-puzzle';
import { resolvePracticeAdaptation } from '@/lib/supabase';
import { getRoundPotential } from '@/lib/game-engine';

export function AdaptationPractice({
  isbn13,
  title,
  author,
  tmdbId,
  onClose,
}: {
  isbn13: string;
  title: string;
  author: string;
  tmdbId?: number;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ['adaptation-practice', isbn13, title, author, tmdbId],
    queryFn: async () => {
      try {
        return await fetchAdaptationPractice(isbn13, title, author, tmdbId);
      } catch {
        const resolved = await resolvePracticeAdaptation(isbn13, title, author);
        if (!resolved) throw new Error('This book does not have a playable screen adaptation.');
        return fetchAdaptationPractice(
          resolved.isbn13,
          resolved.title,
          resolved.author,
          resolved.tmdbId,
          resolved
        );
      }
    },
  });
  const [hintsUsed, setHintsUsed] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  if (query.isPending) {
    return <PracticeStatus text="Preparing adaptation practice…" onClose={onClose} />;
  }
  if (query.isError || !query.data) {
    return (
      <PracticeStatus
        text={query.error instanceof Error ? query.error.message : 'Practice is unavailable.'}
        onClose={onClose}
      />
    );
  }

  const { choices, correctChoiceId, details } = query.data;
  if (selected) {
    const correct = selected === correctChoiceId;
    const points = correct ? getRoundPotential(hintsUsed) : 0;
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="smallBold" style={styles.label}>
          PRACTICE RESULT
        </ThemedText>
        <ThemedText type="subtitle" style={styles.centered}>
          {correct ? 'Correct match!' : 'Not quite this time'}
        </ThemedText>
        <ThemedText type="smallBold" style={correct ? styles.correct : styles.wrong}>
          +{points} / 3 practice points
        </ThemedText>
        <View style={styles.reveal}>
          {details.moviePosterPath ? (
            <Image
              contentFit="cover"
              source={{ uri: `https://image.tmdb.org/t/p/w342${details.moviePosterPath}` }}
              style={styles.poster}
            />
          ) : null}
          <View style={styles.revealCopy}>
            <ThemedText type="smallBold">
              {details.movieTitle} ({details.releaseYear})
            </ThemedText>
            {details.cast ? <ThemedText type="small">Cast: {details.cast}</ThemedText> : null}
            {details.characters ? (
              <ThemedText type="small">Characters: {details.characters}</ThemedText>
            ) : null}
            <ThemedText type="small">
              Correct answer: {choices.find((c) => c.id === correctChoiceId)?.label}
            </ThemedText>
          </View>
        </View>
        <StoryPremise text={details.storyPremise} />
        <PracticeButton label="Close practice" onPress={onClose} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText type="smallBold" style={styles.label}>
        PRACTICE · {getRoundPotential(hintsUsed)} PTS
      </ThemedText>
      <PremiseQuestion
        details={details}
        hintsUsed={hintsUsed}
        choices={choices}
        onHint={() => setHintsUsed((used) => used + 1)}
        onAnswer={setSelected}
      />
      <PracticeButton label="Cancel practice" onPress={onClose} secondary />
    </ScrollView>
  );
}

function PracticeStatus({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <View style={styles.status}>
      <ThemedText type="subtitle" style={styles.centered}>
        {text}
      </ThemedText>
      <PracticeButton label="Close" onPress={onClose} />
    </View>
  );
}

function PracticeButton({
  label,
  onPress,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, secondary && styles.buttonSecondary]}>
      <ThemedText
        type="smallBold"
        style={secondary ? styles.buttonSecondaryText : styles.buttonText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.three, padding: Spacing.four },
  status: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.four,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  label: { color: '#117579', letterSpacing: 0.8, textTransform: 'uppercase' },
  centered: { textAlign: 'center' },
  correct: { color: '#2F7D5D', textAlign: 'center' },
  wrong: { color: '#A84732', textAlign: 'center' },
  reveal: {
    backgroundColor: '#F8F4EE',
    borderRadius: 16,
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  poster: { aspectRatio: 2 / 3, borderRadius: 8, width: 90 },
  revealCopy: { flex: 1, gap: Spacing.one },
  button: {
    alignItems: 'center',
    backgroundColor: '#173E32',
    borderRadius: 999,
    padding: Spacing.three,
  },
  buttonText: { color: '#FFFFFF' },
  buttonSecondary: { backgroundColor: 'transparent', borderColor: '#173E32', borderWidth: 1 },
  buttonSecondaryText: { color: '#173E32' },
});
