import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TypographicCover } from './typographic-cover';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { fetchAdaptationPractice } from '@/lib/daily-puzzle';
import { getNameInitials, getRoundPotential } from '@/lib/game-engine';

export function AdaptationPractice({ isbn13, onClose }: { isbn13: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['adaptation-practice', isbn13],
    queryFn: () => fetchAdaptationPractice(isbn13),
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
            <ThemedText type="small">Cast: {details.cast}</ThemedText>
            <ThemedText type="small">Characters: {details.characters}</ThemedText>
            <ThemedText type="small">
              Correct answer: {choices.find((c) => c.id === correctChoiceId)?.label}
            </ThemedText>
          </View>
        </View>
        <PracticeButton label="Close practice" onPress={onClose} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText type="smallBold" style={styles.label}>
        PRACTICE · {getRoundPotential(hintsUsed)} PTS
      </ThemedText>
      <View style={styles.bookRow}>
        <TypographicCover
          author={details.author}
          coverTheme={details.coverTheme}
          genre={details.genre}
          title={details.title}
          width={112}
        />
        <View style={styles.bookCopy}>
          <ThemedText type="smallBold" style={styles.kicker}>
            Which actors star in this book&apos;s screen adaptation?
          </ThemedText>
          <ThemedText type="subtitle" style={styles.bookTitle}>
            {details.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Screen adaptation: {details.movieTitle}
          </ThemedText>
        </View>
      </View>
      {[
        { title: 'Year and setting', value: `${details.releaseYear} · ${details.settingHint}` },
        { title: 'Character roles', value: details.characterHint },
        { title: 'Lead actor initials', value: getNameInitials(details.cast) },
      ].map((hint, index) => (
        <View key={hint.title} style={styles.hint}>
          <ThemedText type="smallBold">
            {hintsUsed > index ? hint.title : `Hint ${index + 1} locked`}
          </ThemedText>
          {hintsUsed > index ? <ThemedText type="small">{hint.value}</ThemedText> : null}
          {hintsUsed === index ? (
            <Pressable accessibilityRole="button" onPress={() => setHintsUsed((used) => used + 1)}>
              <ThemedText type="smallBold" style={styles.unlock}>
                Unlock hint
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ))}
      <ThemedText type="smallBold" style={styles.label}>
        Select the matching actors
      </ThemedText>
      {choices.map((choice, index) => (
        <Pressable
          accessibilityRole="button"
          key={choice.id}
          onPress={() => setSelected(choice.id)}
          style={({ pressed }) => [styles.answer, pressed && styles.pressed]}>
          <ThemedText type="smallBold">{String.fromCharCode(65 + index)}</ThemedText>
          <ThemedText style={styles.answerText}>{choice.label}</ThemedText>
        </Pressable>
      ))}
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
  bookRow: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.three },
  bookCopy: { flex: 1, gap: Spacing.two },
  kicker: { color: '#A84732', fontSize: 12, lineHeight: 17, textTransform: 'uppercase' },
  bookTitle: { fontSize: 24, lineHeight: 29 },
  hint: {
    borderColor: '#CCD2CF',
    borderRadius: 14,
    borderWidth: 1,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  unlock: { color: '#117579', marginTop: Spacing.one },
  answer: {
    alignItems: 'center',
    backgroundColor: '#F4EEE6',
    borderRadius: 14,
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  answerText: { flex: 1 },
  pressed: { opacity: 0.65 },
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
