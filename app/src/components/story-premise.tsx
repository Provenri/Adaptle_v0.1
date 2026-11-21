import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';

export function StoryPremise({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      accessibilityHint={expanded ? 'Collapses the story premise' : 'Expands the story premise'}
      accessibilityLabel={`Story premise: ${text}`}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={() => setExpanded((current) => !current)}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
      <ThemedText accessibilityElementsHidden style={styles.mark}>
        “
      </ThemedText>
      <View style={styles.copy}>
        <ThemedText numberOfLines={expanded ? undefined : 2} style={styles.text}>
          {text}
        </ThemedText>
        <ThemedText type="smallBold" style={styles.action}>
          {expanded ? 'Show less' : 'Read more'}
        </ThemedText>
      </View>
      <ThemedText accessibilityElementsHidden style={styles.endMark}>
        ”
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: 'rgba(168, 71, 50, 0.07)',
    borderLeftColor: '#A84732',
    borderLeftWidth: 3,
    borderRadius: 14,
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  mark: {
    alignSelf: 'flex-start',
    color: '#A84732',
    fontSize: 34,
    lineHeight: 38,
    marginRight: Spacing.one,
  },
  text: {
    color: '#173E32',
    flex: 1,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 21,
  },
  copy: {
    flex: 1,
  },
  action: {
    color: '#A84732',
    fontSize: 11,
    marginTop: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
  endMark: {
    alignSelf: 'flex-end',
    color: '#A84732',
    fontSize: 24,
    lineHeight: 28,
    marginLeft: Spacing.one,
  },
});
