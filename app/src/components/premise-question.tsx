import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { DailyRoundDetails } from '@/lib/daily-puzzle';
import type { GameChoice } from '@/lib/game-engine';
import { Depth, Spacing } from '@/constants/theme';
import { ThemedText } from './themed-text';
import { TypographicCover } from './typographic-cover';

export function PremiseQuestion({
  details,
  hintsUsed,
  choices,
  onHint,
  onAnswer,
}: {
  details: DailyRoundDetails;
  hintsUsed: number;
  choices: readonly GameChoice[];
  onHint: () => void;
  onAnswer: (choiceId: string) => void;
}) {
  const [hintsExpanded, setHintsExpanded] = useState(false);

  return (
    <View style={styles.stack}>
      <View style={styles.pairedWorks}>
        <View style={styles.work}>
          <ThemedText type="smallBold" style={styles.workLabel}>
            Source book
          </ThemedText>
          <TypographicCover
            title={details.title}
            author={details.author}
            genre={details.genre}
            coverTheme={details.coverTheme}
            style={styles.workImage}
            width="100%"
          />
          <ThemedText numberOfLines={2} style={styles.bookMetadata}>
            {details.author}
          </ThemedText>
          {details.publicationYear ? (
            <ThemedText type="small" themeColor="textSecondary">
              {details.publicationYear}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.work}>
          <ThemedText type="smallBold" style={styles.workLabel}>
            Screen
          </ThemedText>
          {details.moviePosterPath ? (
            <Image
              accessibilityLabel={`${details.movieTitle} poster`}
              contentFit="cover"
              source={{ uri: `https://image.tmdb.org/t/p/w342${details.moviePosterPath}` }}
              style={styles.workImage}
            />
          ) : (
            <View style={[styles.workImage, styles.posterPlaceholder]}>
              <ThemedText type="smallBold" style={styles.placeholderTitle}>
                {details.movieTitle}
              </ThemedText>
            </View>
          )}
          <ThemedText numberOfLines={2} style={styles.adaptationTitle}>
            {details.movieTitle}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {details.releaseYear}
          </ThemedText>
        </View>
      </View>

      <View style={styles.prompt}>
        <ThemedText type="smallBold" style={styles.kicker}>
          What is the story&apos;s one-line premise?
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Choose the premise that belongs to this book and screen adaptation.
        </ThemedText>
      </View>

      <View style={styles.section}>
        <Pressable
          accessibilityLabel="Need a clue?"
          accessibilityRole="button"
          accessibilityState={{ expanded: hintsExpanded }}
          onPress={() => setHintsExpanded((expanded) => !expanded)}
          style={({ pressed }) => [styles.hintToggle, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.sectionTitle}>
            Need a clue?
          </ThemedText>
          <ThemedText type="smallBold" style={styles.hintToggleIcon}>
            {hintsExpanded ? '−' : '+'}
          </ThemedText>
        </Pressable>
        {hintsExpanded ? (
          <View style={styles.hintList}>
            <HintCard
              number={1}
              title="Setting"
              unlocked={hintsUsed >= 1}
              value={details.settingHint}
              action={hintsUsed === 0 ? onHint : undefined}
            />
            <HintCard
              number={2}
              title="Character roles"
              unlocked={hintsUsed >= 2}
              value={details.characterHint}
              action={hintsUsed === 1 ? onHint : undefined}
            />
            <HintCard
              number={3}
              title="Premise keywords"
              unlocked={hintsUsed >= 3}
              value={details.premiseKeywords.join(' · ')}
              action={hintsUsed === 2 ? onHint : undefined}
              actionLabel="Unlock final clue · 1 pt"
            />
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold" style={styles.sectionTitle}>
          Select the story premise
        </ThemedText>
        {choices.map((choice, index) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Answer ${String.fromCharCode(65 + index)}: ${choice.label}`}
            key={choice.id}
            onPress={() => onAnswer(choice.id)}
            style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
            <View style={styles.choiceBadge}>
              <ThemedText type="smallBold" style={styles.lightText}>
                {String.fromCharCode(65 + index)}
              </ThemedText>
            </View>
            <ThemedText style={styles.choiceText}>{choice.label}</ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function HintCard({
  number,
  title,
  unlocked,
  value,
  action,
  actionLabel,
}: {
  number: number;
  title: string;
  unlocked: boolean;
  value: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <View style={[styles.hintCard, unlocked && styles.hintUnlocked]}>
      <View style={styles.hintCopy}>
        <ThemedText type="smallBold">
          {unlocked ? '✓' : '○'} Hint {number}: {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {unlocked ? value : 'Locked'}
        </ThemedText>
      </View>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action} style={styles.hintButton}>
          <ThemedText type="smallBold" style={styles.lightText}>
            {actionLabel ?? 'Unlock · -1 pt'}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.four },
  pairedWorks: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.three },
  work: { alignItems: 'center', flex: 1, gap: Spacing.two },
  workLabel: {
    color: '#117579',
    lineHeight: 20,
    letterSpacing: 0.8,
    minHeight: 20,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  workImage: {
    ...Depth.raised,
    aspectRatio: 2 / 3,
    borderRadius: 8,
    overflow: 'visible',
    width: '100%',
  },
  posterPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#173E32',
    justifyContent: 'center',
    padding: Spacing.two,
  },
  placeholderTitle: { color: '#FFF8E7', textAlign: 'center' },
  bookMetadata: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  adaptationTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  prompt: { gap: Spacing.one },
  kicker: { color: '#A84732', fontSize: 13, lineHeight: 18, textTransform: 'uppercase' },
  section: { gap: Spacing.two },
  sectionTitle: {
    color: '#117579',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  hintToggle: {
    ...Depth.surface,
    alignItems: 'center',
    backgroundColor: '#F4EEE6',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  hintToggleIcon: { color: '#117579', fontSize: 20, lineHeight: 24 },
  hintList: { gap: Spacing.two },
  hintCard: {
    ...Depth.surface,
    alignItems: 'center',
    backgroundColor: '#F4EEE6',
    borderRadius: 14,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  hintUnlocked: { borderColor: '#B8C9BD', borderWidth: 1 },
  hintCopy: { flex: 1, gap: Spacing.one },
  hintButton: {
    ...Depth.surface,
    backgroundColor: '#173E32',
    borderRadius: 999,
    padding: Spacing.two,
  },
  choice: {
    ...Depth.surface,
    alignItems: 'center',
    backgroundColor: '#F4EEE6',
    borderRadius: 14,
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  choiceBadge: {
    ...Depth.surface,
    alignItems: 'center',
    backgroundColor: '#A84732',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  choiceText: { flex: 1 },
  lightText: { color: '#FFFFFF' },
  pressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
});
