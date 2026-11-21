import { Image } from 'expo-image';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import ViewShot, { captureRef, type ViewShotRef } from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TypographicCover } from '@/components/typographic-cover';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { APP_ICON } from '@/assets';
import { providerNames, useTmdbProviders } from '@/hooks/use-tmdb-providers';
import type { BonusItem, DailyRoundDetails, ProductionDailyPuzzle } from '@/lib/daily-puzzle';
import {
  createGameState,
  gameReducer,
  getNameInitials,
  getRoundBreakdown,
  getRoundPotential,
  getTotalPoints,
  type DailyPuzzle,
} from '@/lib/game-engine';
import { createScoreShareText, shareScoreImage } from '@/lib/score-sharing';
import { createDailyScore, currentPuzzleDate } from '@/lib/scores';
import { SNOOZE_OPTIONS, snoozeUntil } from '@/lib/snooze';
import { useDailyPuzzle, useLibrary } from '@/providers/app-data-provider';

type ShelfStatus = 'TO_BE_READ' | 'FINISHED' | 'SNOOZE';

export default function PlayScreen() {
  const puzzleQuery = useDailyPuzzle();

  if (puzzleQuery.data) {
    return <DailyGame dailyPuzzle={puzzleQuery.data} />;
  }
  if (puzzleQuery.isPending) {
    return <PuzzleStatus title="Preparing today's puzzle" description="Loading today's books…" />;
  }
  const description =
    puzzleQuery.error instanceof Error
      ? puzzleQuery.error.message
      : "Today's puzzle could not be loaded.";

  return (
    <PuzzleStatus
      title="Today's puzzle is not ready"
      description={description}
      onRetry={() => void puzzleQuery.refetch()}
    />
  );
}

function DailyGame({ dailyPuzzle }: { dailyPuzzle: ProductionDailyPuzzle }) {
  const enginePuzzle = dailyPuzzle.puzzle;
  const [state, dispatch] = useReducer(gameReducer, enginePuzzle, createGameState);
  const [savedThisSession, setSavedThisSession] = useState<Record<string, true>>({});
  const { books, currentStreak, saveScore, saveBook, scores, resetTodayScore } = useLibrary();
  const round = enginePuzzle.rounds[state.roundIndex];
  const details = dailyPuzzle.roundDetails[round.id];
  const lastResult = state.results.at(-1);
  const completedScoreSaved = useRef(false);

  useEffect(() => {
    if (state.phase === 'complete' && !completedScoreSaved.current) {
      completedScoreSaved.current = true;
      saveScore(createDailyScore(enginePuzzle, state));
    }
  }, [enginePuzzle, saveScore, state]);

  const completedScore = scores.find((score) => score.puzzleDate === currentPuzzleDate());
  if (completedScore) {
    return (
      <ThemedView style={styles.root}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.headingRow}>
              <View>
                <ThemedText type="smallBold" style={styles.eyebrow}>
                  ADAPTLE #{completedScore.puzzleNumber}
                </ThemedText>
                <ThemedText type="subtitle">Daily complete</ThemedText>
              </View>
              <ThemedText type="smallBold" style={styles.streak}>
                🔥 {currentStreak}
              </ThemedText>
            </View>
            <SummaryView
              total={completedScore.totalPoints}
              breakdown={completedScore.roundBreakdown}
              puzzleNumber={completedScore.puzzleNumber}
              savedCount={Object.keys(savedThisSession).length}
              streak={currentStreak}
              onReplay={
                __DEV__
                  ? async () => {
                      await resetTodayScore(completedScore.puzzleDate);
                      completedScoreSaved.current = false;
                      dispatch({ type: 'reset-game' });
                    }
                  : undefined
              }
            />
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          testID="play-scroll-view">
          <View style={styles.headingRow}>
            <View style={styles.brandRow}>
              <Image
                accessibilityLabel="Adaptle"
                contentFit="contain"
                source={APP_ICON}
                style={styles.headerLogo}
              />
              <View>
                <ThemedText type="smallBold" style={styles.eyebrow}>
                  ADAPTLE #{dailyPuzzle.id}
                </ThemedText>
                <ThemedText type="subtitle" style={styles.title}>
                  {state.phase === 'bonus' || state.phase === 'bonus-reveal'
                    ? 'Common Thread'
                    : state.phase === 'complete'
                      ? 'Daily complete'
                      : `Round ${state.roundIndex + 1} of 5`}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Current round potential: {getRoundPotential(state.hintsUsed)} PTS
                </ThemedText>
              </View>
            </View>
            <ThemedText type="smallBold" style={styles.streak}>
              🔥 {currentStreak}
            </ThemedText>
          </View>

          {state.phase === 'question' ? (
            <QuestionView
              details={details}
              hintsUsed={state.hintsUsed}
              round={round.choices}
              onHint={() => dispatch({ type: 'unlock-hint' })}
              onAnswer={(choiceId) => dispatch({ type: 'submit-answer', choiceId })}
            />
          ) : null}

          {state.phase === 'reveal' ? (
            <RevealView
              correct={lastResult?.correct ?? false}
              details={details}
              hintsUsed={lastResult?.hintsUsed ?? 0}
              points={lastResult?.points ?? 0}
              onContinue={() => dispatch({ type: 'continue' })}
              nextLabel={
                state.roundIndex === enginePuzzle.rounds.length - 1
                  ? 'Start bonus round'
                  : `Next round (${state.roundIndex + 2} of 5)`
              }
              savedStatus={books.find((book) => book.isbn13 === details.isbn13)?.status}
              onSave={(status) => {
                if (status === 'SNOOZE') {
                  chooseSnoozeDuration((deadline) => {
                    saveBook(details, status, deadline);
                    setSavedThisSession((current) => ({
                      ...current,
                      [details.isbn13]: true,
                    }));
                  });
                } else {
                  saveBook(details, status);
                  setSavedThisSession((current) => ({ ...current, [details.isbn13]: true }));
                }
              }}
            />
          ) : null}

          {state.phase === 'bonus' ? (
            <BonusView
              choices={enginePuzzle.bonus.choices}
              items={dailyPuzzle.bonusItems}
              onAnswer={(choiceId) => dispatch({ type: 'submit-bonus', choiceId })}
            />
          ) : null}

          {state.phase === 'bonus-reveal' ? (
            <ResultPanel
              correct={lastResult?.correct ?? false}
              points={lastResult?.points ?? 0}
              title={lastResult?.correct ? 'Common thread found!' : 'Not quite this time'}
              description={`The shared connection was: ${
                enginePuzzle.bonus.choices.find(
                  (choice) => choice.id === enginePuzzle.bonus.correctChoiceId
                )?.label ?? 'the common thread'
              }.`}
              actionLabel="See daily score"
              onAction={() => dispatch({ type: 'continue' })}
            />
          ) : null}

          {state.phase === 'complete' ? (
            <SummaryView
              total={getTotalPoints(state)}
              breakdown={getRoundBreakdown(state)}
              puzzleNumber={dailyPuzzle.id}
              savedCount={Object.keys(savedThisSession).length}
              streak={currentStreak}
              onReplay={
                __DEV__
                  ? async () => {
                      await resetTodayScore(dailyPuzzle.puzzleDate);
                      completedScoreSaved.current = false;
                      dispatch({ type: 'reset-game' });
                    }
                  : undefined
              }
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function PuzzleStatus({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.statusSafeArea}>
        <View style={styles.statusPanel}>
          <ThemedText style={styles.statusIcon}>🎬 📖</ThemedText>
          <ThemedText type="subtitle" style={styles.centered}>
            {title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {description}
          </ThemedText>
          {onRetry ? <PrimaryButton label="Try again" onPress={onRetry} /> : null}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

type QuestionViewProps = {
  details: DailyRoundDetails;
  hintsUsed: number;
  round: DailyPuzzle['rounds'][number]['choices'];
  onHint: () => void;
  onAnswer: (choiceId: string) => void;
};

function QuestionView({ details, hintsUsed, round, onHint, onAnswer }: QuestionViewProps) {
  return (
    <View style={styles.stack}>
      <View style={styles.bookRow}>
        <View style={styles.coverColumn}>
          <ThemedText type="smallBold" style={styles.sourceLabel}>
            Source book
          </ThemedText>
          <TypographicCover
            title={details.title}
            author={details.author}
            genre={details.genre}
            coverTheme={details.coverTheme}
            width={126}
          />
        </View>
        <View style={styles.prompt}>
          <ThemedText type="smallBold" style={styles.kicker}>
            Which actors star in this book&apos;s screen adaptation?
          </ThemedText>
          <ThemedText type="subtitle" style={styles.bookTitle}>
            {details.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            by {details.author}
            {details.publicationYear ? ` · ${details.publicationYear}` : ''}
          </ThemedText>
          <View style={styles.adaptationPrompt}>
            <ThemedText type="smallBold" style={styles.adaptationLabel}>
              Screen adaptation
            </ThemedText>
            <ThemedText type="default" style={styles.adaptationName}>
              {details.movieTitle}
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold" style={styles.sectionTitle}>
          Need a clue?
        </ThemedText>
        <HintCard
          number={1}
          title="Year and setting"
          unlocked={hintsUsed >= 1}
          value={`${details.releaseYear} · ${details.settingHint}`}
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
          title="Lead actor initials"
          unlocked={hintsUsed >= 3}
          value={getNameInitials(details.cast)}
          action={hintsUsed === 2 ? onHint : undefined}
          actionLabel="Unlock final clue · 1 pt"
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold" style={styles.sectionTitle}>
          Select the matching actors
        </ThemedText>
        {round.map((choice, index) => (
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
        {unlocked ? (
          <ThemedText type="small" themeColor="textSecondary">
            {value}
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Locked
          </ThemedText>
        )}
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

function RevealView({
  correct,
  details,
  hintsUsed,
  points,
  nextLabel,
  onContinue,
  savedStatus,
  onSave,
}: {
  correct: boolean;
  details: DailyRoundDetails;
  hintsUsed: number;
  points: number;
  nextLabel: string;
  onContinue: () => void;
  savedStatus?: ShelfStatus;
  onSave: (status: ShelfStatus) => void;
}) {
  const providers = useTmdbProviders(details.tmdbId);
  const providerList = providerNames(providers.data);

  return (
    <View style={styles.stack}>
      <ResultBanner correct={correct} points={points} hintsUsed={hintsUsed} />
      <View style={styles.adaptationCard}>
        <View style={styles.posterFrame}>
          {details.moviePosterPath ? (
            <Image
              accessibilityLabel={`${details.movieTitle} poster`}
              contentFit="cover"
              source={{ uri: `https://image.tmdb.org/t/p/w342${details.moviePosterPath}` }}
              style={styles.poster}
            />
          ) : (
            <View style={styles.posterPlaceholder}>
              <ThemedText style={styles.posterPlaceholderText}>{details.movieTitle}</ThemedText>
            </View>
          )}
          <ThemedText style={styles.posterSource}>TMDB</ThemedText>
        </View>
        <View style={styles.adaptationCopy}>
          <ThemedText type="smallBold" style={styles.kicker}>
            The adaptation
          </ThemedText>
          <ThemedText type="subtitle" style={styles.adaptationTitle}>
            {details.movieTitle} ({details.releaseYear})
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Dir. {details.director}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Cast: {details.cast}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Characters: {details.characters}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Stream:{' '}
            {providerList.length > 0
              ? providerList.join(', ')
              : providers.isPending
                ? 'Loading providers…'
                : 'Unavailable offline'}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.attribution}>
        Movie artwork and provider data supplied by TMDB. This product uses the TMDB API but is not
        endorsed or certified by TMDB.
      </ThemedText>

      <View style={styles.section}>
        <ThemedText type="smallBold" style={styles.sectionTitle}>
          Save this book to your library
        </ThemedText>
        <View style={styles.shelfActions}>
          <ShelfButton
            label="To be read"
            status="TO_BE_READ"
            selected={savedStatus === 'TO_BE_READ'}
            onSave={onSave}
          />
          <ShelfButton
            label="Finished"
            status="FINISHED"
            selected={savedStatus === 'FINISHED'}
            onSave={onSave}
          />
          <ShelfButton
            label="Snooze"
            status="SNOOZE"
            selected={savedStatus === 'SNOOZE'}
            onSave={onSave}
          />
        </View>
      </View>
      <PrimaryButton label={nextLabel} onPress={onContinue} />
    </View>
  );
}

function ResultBanner({
  correct,
  points,
  hintsUsed,
}: {
  correct: boolean;
  points: number;
  hintsUsed: number;
}) {
  return (
    <View style={[styles.resultBanner, !correct && styles.resultBannerWrong]}>
      <ThemedText type="smallBold" style={styles.lightText}>
        {correct ? '✓ Correct!' : '× Not quite'} · +{points} pts
      </ThemedText>
      <ThemedText type="small" style={styles.lightText}>
        {hintsUsed === 0 ? 'No hints used' : `${hintsUsed} hint${hintsUsed === 1 ? '' : 's'} used`}
      </ThemedText>
    </View>
  );
}

function ShelfButton({
  label,
  status,
  selected,
  onSave,
}: {
  label: string;
  status: ShelfStatus;
  selected: boolean;
  onSave: (status: ShelfStatus) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onSave(status)}
      style={({ pressed }) => [
        styles.shelfButton,
        selected && styles.shelfButtonSelected,
        pressed && styles.pressed,
      ]}>
      <ThemedText
        type="smallBold"
        style={selected ? styles.shelfButtonSelectedText : styles.shelfButtonText}>
        {selected ? `✓ ${label}` : label}
      </ThemedText>
    </Pressable>
  );
}

function chooseSnoozeDuration(onSelect: (deadline: string) => void): void {
  Alert.alert('Snooze this book', 'When should it return to To be read?', [
    ...SNOOZE_OPTIONS.map((option) => ({
      text: option.label,
      onPress: () => onSelect(snoozeUntil(option.days)),
    })),
    { text: 'Cancel', style: 'cancel' },
  ]);
}

function BonusView({
  choices,
  items,
  onAnswer,
}: {
  choices: DailyPuzzle['bonus']['choices'];
  items: readonly [BonusItem, BonusItem];
  onAnswer: (choiceId: string) => void;
}) {
  return (
    <View style={styles.stack}>
      <ThemedText type="smallBold" style={styles.centered}>
        BONUS ROUND · 3 PTS
      </ThemedText>
      <View style={styles.bonusBooks}>
        {items.map((book, index) => (
          <View key={book.title} style={styles.bonusBook}>
            {book.kind === 'movie' && book.moviePosterPath ? (
              <Image
                accessibilityLabel={`${book.movieTitle ?? book.title} poster`}
                contentFit="cover"
                source={{ uri: `https://image.tmdb.org/t/p/w342${book.moviePosterPath}` }}
                style={styles.bonusPoster}
              />
            ) : (
              <TypographicCover
                title={book.title}
                author={book.author}
                genre={book.genre}
                coverTheme={book.coverTheme}
                width="100%"
              />
            )}
            {index === 0 ? <ThemedText style={styles.connector}>×</ThemedText> : null}
          </View>
        ))}
      </View>
      <ThemedText type="smallBold" style={styles.sectionTitle}>
        What do these two works have in common?
      </ThemedText>
      {choices.map((choice, index) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Bonus answer ${String.fromCharCode(65 + index)}: ${choice.label}`}
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
  );
}

function ResultPanel({
  correct,
  points,
  title,
  description,
  actionLabel,
  onAction,
}: {
  correct: boolean;
  points: number;
  title: string;
  description: string;
  actionLabel: string;
  onAction: (event: GestureResponderEvent) => void;
}) {
  return (
    <View style={styles.resultPanel}>
      <View style={[styles.resultIcon, !correct && styles.resultIconWrong]}>
        <ThemedText style={styles.resultIconText}>{correct ? '✓' : '×'}</ThemedText>
      </View>
      <ThemedText type="smallBold" style={correct ? styles.correctText : styles.wrongText}>
        +{points} PTS
      </ThemedText>
      <ThemedText type="subtitle" style={styles.centered}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        {description}
      </ThemedText>
      <PrimaryButton label={actionLabel} onPress={onAction} />
    </View>
  );
}

function SummaryView({
  total,
  breakdown,
  savedCount,
  puzzleNumber,
  streak,
  onReplay,
}: {
  total: number;
  breakdown: number[];
  savedCount: number;
  puzzleNumber: string;
  streak: number;
  onReplay?: () => Promise<void>;
}) {
  const scoreCard = useRef<ViewShotRef>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const shareText = createScoreShareText(puzzleNumber, total, breakdown);

  const share = async () => {
    setShareError(null);
    try {
      const uri = await captureRef(scoreCard, { format: 'png', quality: 1 });
      await shareScoreImage(uri, shareText);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'Unable to share your score.');
    }
  };

  return (
    <View style={styles.summaryStack}>
      <ViewShot ref={scoreCard} options={{ format: 'png', quality: 1 }}>
        <View style={styles.shareCard} testID="daily-score-card">
          <View style={styles.shareBrandRow}>
            <Image
              accessibilityLabel="Adaptle"
              contentFit="contain"
              source={APP_ICON}
              style={styles.shareLogo}
            />
            <ThemedText type="smallBold" style={styles.shareBrand}>
              ADAPTLE #{puzzleNumber}
            </ThemedText>
          </View>
          <ThemedText style={styles.trophy}>🏆</ThemedText>
          <ThemedText type="subtitle" style={styles.shareScore}>
            {total} / 18 PTS
          </ThemedText>
          <ThemedText type="small" style={styles.shareCardText}>
            🔥 {streak}-day streak
          </ThemedText>
          <View style={styles.breakdown}>
            {breakdown.map((points, index) => (
              <View key={`${index}-${points}`} style={styles.scoreTile}>
                <ThemedText type="smallBold">{index === 5 ? '★' : index + 1}</ThemedText>
                <ThemedText type="small">{points}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      </ViewShot>
      <View style={styles.summaryCopy}>
        <ThemedText type="smallBold" style={styles.centered}>
          {savedCount} {savedCount === 1 ? 'book' : 'books'} saved to your shelf today
        </ThemedText>
        <PrimaryButton label="Share daily score card" onPress={share} />
        {onReplay ? (
          <Pressable accessibilityRole="button" onPress={() => void onReplay()}>
            <ThemedText type="smallBold" style={styles.devReplayButton}>
              Replay today (development)
            </ThemedText>
          </Pressable>
        ) : null}
        {shareError ? (
          <ThemedText accessibilityRole="alert" type="small" style={styles.wrongText}>
            {shareError}
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            Shares the generated score image when supported.
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          {shareText}
        </ThemedText>
      </View>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
      <ThemedText type="smallBold" style={styles.lightText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
  },
  statusSafeArea: {
    flex: 1,
    justifyContent: 'center',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    width: '100%',
  },
  statusPanel: {
    alignItems: 'center',
    backgroundColor: '#F8F4EE',
    borderRadius: 22,
    gap: Spacing.three,
    padding: Spacing.five,
  },
  statusIcon: {
    fontSize: 48,
    lineHeight: 58,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  headerLogo: {
    borderRadius: 12,
    height: 46,
    width: 46,
    marginTop: 2,
  },
  eyebrow: {
    color: '#117579',
    letterSpacing: 1.4,
  },
  title: {
    marginTop: Spacing.half,
  },
  streak: {
    backgroundColor: '#FFF1D5',
    borderRadius: 999,
    color: '#74421B',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  stack: {
    gap: Spacing.three,
  },
  bookRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  coverColumn: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  prompt: {
    flex: 1,
    gap: Spacing.two,
    paddingTop: 26,
  },
  adaptationPrompt: {
    borderLeftColor: '#A84732',
    borderLeftWidth: 3,
    marginTop: Spacing.one,
    paddingLeft: Spacing.two,
  },
  sourceLabel: {
    color: '#173E32',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  adaptationLabel: {
    color: '#A84732',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  adaptationName: {
    color: '#173E32',
    fontWeight: '700',
  },
  kicker: {
    color: '#A84732',
    textTransform: 'uppercase',
  },
  bookTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  hintCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D8DADD',
    padding: Spacing.three,
    gap: Spacing.three,
  },
  hintUnlocked: {
    borderColor: '#117579',
    backgroundColor: 'rgba(17, 117, 121, 0.08)',
  },
  hintCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  hintButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#117579',
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  choice: {
    alignItems: 'center',
    backgroundColor: '#F4EEE6',
    borderRadius: 14,
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  choiceBadge: {
    alignItems: 'center',
    backgroundColor: '#173E32',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  choiceText: {
    color: '#1B2924',
    flex: 1,
  },
  pressed: {
    opacity: 0.65,
    transform: [{ scale: 0.99 }],
  },
  lightText: {
    color: '#FFFFFF',
  },
  resultPanel: {
    alignItems: 'center',
    backgroundColor: '#F8F4EE',
    borderRadius: 22,
    gap: Spacing.three,
    padding: Spacing.five,
  },
  adaptationCard: {
    backgroundColor: '#F8F4EE',
    borderRadius: 18,
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  posterFrame: {
    aspectRatio: 2 / 3,
    backgroundColor: '#173E32',
    borderRadius: 8,
    overflow: 'hidden',
    width: 112,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.two,
  },
  posterPlaceholderText: {
    color: '#FFF8E7',
    fontWeight: '700',
    textAlign: 'center',
  },
  posterSource: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    bottom: 0,
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    left: 0,
    letterSpacing: 1,
    padding: 3,
    position: 'absolute',
    right: 0,
    textAlign: 'center',
  },
  adaptationCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  adaptationTitle: {
    fontSize: 24,
    lineHeight: 30,
  },
  attribution: {
    fontSize: 11,
    lineHeight: 15,
  },
  resultBanner: {
    alignItems: 'center',
    backgroundColor: '#2F7D5D',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  resultBannerWrong: {
    backgroundColor: '#A84732',
  },
  shelfActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  shelfButton: {
    alignItems: 'center',
    borderColor: '#173E32',
    borderRadius: 999,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 95,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  shelfButtonSelected: {
    backgroundColor: '#173E32',
  },
  shelfButtonText: {
    color: '#173E32',
  },
  shelfButtonSelectedText: {
    color: '#FFFFFF',
  },
  resultIcon: {
    alignItems: 'center',
    backgroundColor: '#2F7D5D',
    borderRadius: 999,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  resultIconWrong: {
    backgroundColor: '#A84732',
  },
  resultIconText: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 40,
  },
  correctText: {
    color: '#2F7D5D',
  },
  wrongText: {
    color: '#A84732',
  },
  centered: {
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#173E32',
    borderRadius: 999,
    paddingVertical: Spacing.three,
  },
  bonusBooks: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.four,
    justifyContent: 'center',
  },
  bonusBook: {
    maxWidth: 180,
    position: 'relative',
    width: '42%',
  },
  bonusPoster: {
    aspectRatio: 2 / 3,
    borderRadius: 4,
    width: '100%',
  },
  connector: {
    alignItems: 'center',
    backgroundColor: '#F2A65A',
    borderRadius: 999,
    color: '#173E32',
    fontWeight: '700',
    height: 36,
    justifyContent: 'center',
    lineHeight: 34,
    position: 'absolute',
    right: -28,
    textAlign: 'center',
    top: '42%',
    width: 36,
    zIndex: 1,
  },
  trophy: {
    fontSize: 56,
    lineHeight: 64,
  },
  summaryStack: {
    gap: Spacing.four,
  },
  shareCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#173E32',
    borderRadius: 22,
    gap: Spacing.three,
    padding: Spacing.five,
  },
  shareBrand: {
    color: '#B9D29C',
    letterSpacing: 1.8,
  },
  shareBrandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  shareLogo: {
    borderRadius: 8,
    height: 34,
    width: 34,
  },
  shareScore: {
    color: '#FFF8E7',
  },
  shareCardText: {
    color: '#C9DCCB',
  },
  summaryCopy: {
    gap: Spacing.three,
  },
  devReplayButton: {
    color: '#A84732',
    padding: Spacing.two,
    textAlign: 'center',
  },
  breakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  scoreTile: {
    alignItems: 'center',
    backgroundColor: '#FFF1D5',
    borderRadius: 12,
    minWidth: 48,
    padding: Spacing.two,
  },
});
